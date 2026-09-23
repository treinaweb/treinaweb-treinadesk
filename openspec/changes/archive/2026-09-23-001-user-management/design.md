# Design

## Context

O projeto é o scaffold do NestJS 12 com Prisma 7 (provider `prisma-client`, saída em `src/generated/prisma`, driver adapter `@prisma/adapter-pg`). Estado observado:

- `prisma/schema.prisma` não tem modelos e não existe `prisma/migrations/`.
- `PrismaModule` exporta `PrismaService`, mas não é global; só o `AppModule` o importa.
- `src/main.ts` carrega `.env` com `import 'dotenv/config'` e não registra nenhum pipe global. Não há `class-validator`/`class-transformer` instalados.
- Testes e2e (`test/jest-e2e.json`) instanciam o `AppModule` diretamente e **não** carregam o `.env` — hoje `process.env.DATABASE_URL` fica indefinido nos e2e.
- `jest.config.ts` (unitários) usa `rootDir: '.'` e `testRegex: '.*\.spec\.ts$'`, então specs em `src/` e `prisma/` são encontradas.
- `.env` já declara `ADMIN_EMAIL` e `ADMIN_PASSWORD`.

Motivação e escopo em `proposal.md`; comportamento exigido em `specs/user-management/spec.md`.

## Goals / Non-Goals

**Goals:**
- Validação global de entrada reutilizável por todos os módulos futuros, ativa também nos e2e.
- Primeiro modelo `User` + enum `Role` e a primeira migration.
- `PrismaModule` global.
- Seed idempotente do ADMIN, com lógica testável fora do entrypoint do Prisma.

**Non-Goals:**
- Autenticação, guards, tokens, rate limit, OpenAPI.
- Formato customizado de erro de validação (usa o padrão do Nest).
- Banco dedicado/containers para testes (e2e usam o `DATABASE_URL` configurado).

## Decisions

### 1. Validação global via `APP_PIPE` com `ValidationPipe`
Registrar `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` como provider `APP_PIPE` no `AppModule`, em vez de `app.useGlobalPipes()` no `main.ts`.
- **Por quê**: os e2e criam a aplicação a partir do `AppModule` e não executam o `main.ts`; com `APP_PIPE` a validação vale igual em produção e nos testes.
- `forbidNonWhitelisted` gera `400` com mensagem `property <nome> should not exist` para `role`, `isVip` etc., antes de chegar ao serviço — nada é criado.
- **Alternativa**: `useGlobalPipes` no `main.ts` + repetir nos e2e — duplicação fácil de esquecer.

### 2. DTO `CreateUserDto` com class-validator e normalização via `@Transform`
- `name`: `@IsString() @Length(2, 100)`.
- `email`: `@Transform` que, se o valor for string, aplica `trim().toLowerCase()`; depois `@IsEmail() @MaxLength(200)`. Como o `ValidationPipe` roda `plainToInstance` (que aplica `@Transform`) antes de `validate`, a validação e o limite de 200 caracteres valem sobre o e-mail já normalizado.
- `password`: `@IsString() @Length(8, 128)`.
- Formato de erro: o padrão do Nest (`{ statusCode: 400, message: string[], error: 'Bad Request' }`), em que cada mensagem começa com o nome do campo (ex.: `name must be longer than or equal to 2 characters`). Isso satisfaz "apontar o campo". O pipe padrão não ecoa o valor recebido, então a senha não aparece em erros.
- A normalização fica numa função pura `normalizeEmail()` (`src/users/normalize-email.ts`), reutilizada pelo DTO e pelo seed.

### 3. Modelo de dados
```prisma
enum Role {
  CUSTOMER
  SUPPORT
  ADMIN
}

model User {
  id           String   @id @default(uuid()) @db.Uuid
  name         String   @db.VarChar(100)
  email        String   @unique @db.VarChar(200)
  passwordHash String   @map("password_hash")
  role         Role     @default(CUSTOMER)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@map("users")
}
```
- UUID evita IDs sequenciais enumeráveis nas próximas rotas.
- Unicidade garantida pelo índice único sobre o e-mail já normalizado (a aplicação sempre grava minúsculas), sem precisar de `citext` ou índice funcional.
- Migration: `npx prisma migrate dev --name create-users`.

### 4. Conflito de e-mail tratado pelo banco
`UsersService.create` chama `prisma.user.create` direto e converte o erro Prisma `P2002` (violação de unicidade) em `ConflictException` (`409`).
- **Por quê**: um "consulta e depois insere" tem condição de corrida; o índice único é a fonte da verdade e o tratamento fica num único ponto.
- **Alternativa**: `findUnique` antes do `create` — pode ficar como otimização, mas o tratamento de `P2002` continua obrigatório.

### 5. Hash com `argon2` (argon2id)
Usar o pacote `argon2` com `argon2.hash(password, { type: argon2.argon2id })` e os parâmetros padrão da biblioteca (m=64 MiB, t=3, p=4), que atendem as recomendações OWASP. A verificação (`argon2.verify`) será usada pelo login em change futura. O hash fica encapsulado em `PasswordHasher` (`src/users/password-hasher.ts`, provider injetável) para que testes unitários possam substituí-lo e o seed possa reutilizá-lo.
- **Alternativa**: `bcrypt` — limitado a 72 bytes de entrada (conflita com senhas de até 128 caracteres) e menos resistente a GPU.

### 6. Resposta sem senha por `select` explícito
O serviço usa `select: { id, name, email, role, createdAt }` no `create` e devolve esse objeto. O hash nunca sai do banco para a camada HTTP.
- **Alternativa**: `ClassSerializerInterceptor` + `@Exclude` — depende de lembrar de instanciar entidades; o `select` é mais explícito e à prova de esquecimento.

### 7. `PrismaModule` global
Adicionar `@Global()` ao `PrismaModule`, importado uma vez pelo `AppModule`. `UsersModule` injeta `PrismaService` sem importar o módulo. O `CLAUDE.md` será atualizado (hoje diz que módulos de feature devem importar `PrismaModule`).

### 8. Seed
- Lógica em `src/users/seed-admin.ts`: `seedAdmin(prisma, env)` valida `ADMIN_EMAIL`/`ADMIN_PASSWORD` (lança erro nomeando a variável ausente), normaliza o e-mail, gera o hash e executa `upsert` por e-mail com `update: {}` e `create: { ..., role: 'ADMIN' }`.
- Entrypoint fino em `prisma/seed.ts` (carrega `dotenv/config`, instancia `PrismaClient` com o adapter, chama `seedAdmin`, encerra com código ≠ 0 em erro).
- Configurado em `prisma7.config.ts` como `migrations.seed: 'tsx prisma/seed.ts'`; `tsx` como devDependency (o `ts-node` existente é frágil com `module: nodenext`). Script `npm run seed` executa `prisma db seed`.
- `update: {}` torna o seed idempotente e não sobrescreve a senha de um admin que já a trocou.

### 9. E2E contra PostgreSQL real
- `test/jest-e2e.json` ganha `setupFiles: ["dotenv/config"]` para que o `PrismaService` receba `DATABASE_URL`.
- Novo `test/users.e2e-spec.ts` limpa a tabela `users` (`deleteMany`) no `beforeEach` e verifica o hash consultando o banco via `PrismaService`.
- Teste do seed (`test/seed-admin.e2e-spec.ts`) chama `seedAdmin` com env controlado contra o banco real.

### 10. Ambiente de testes (descoberto na implementação)
O scaffold não rodava nenhum teste: o NestJS 12 é ESM-only e o TS 6 exige `rootDir`. Ajustes feitos:
- Node >= 24.9 (`engines` + `.nvmrc` com 24.21.0) e scripts de teste via `node --experimental-vm-modules node_modules/jest/bin/jest.js`, para o Jest carregar ESM por `require`.
- `rootDir: "./"` no `tsconfig.json` (o build segue com `./src` pelo `tsconfig.build.json`).
- `moduleNameMapper` `^(\.{1,2}/.*)\.js$ → $1` nos dois configs do Jest (imports `.js` do client Prisma gerado).
- `maxWorkers: 1` nos e2e, pois as suítes limpam a mesma tabela.
- **Alternativas**: preset ESM do ts-jest ou Vitest — mudanças maiores, descartadas.

## Risks / Trade-offs

- [e2e apagam a tabela `users` do banco apontado por `DATABASE_URL`] → documentar que os e2e devem rodar num banco de desenvolvimento/teste; um banco dedicado a testes fica para change futura.
- [Hash argon2 deixa testes e cadastro mais lentos (~dezenas de ms)] → aceitável; unitários usam `PasswordHasher` mockado.
- [`argon2` é módulo nativo] → possui binários pré-compilados para Windows/Linux; se a instalação falhar, requer toolchain de build.
- [Seed com `update: {}` não promove a ADMIN um usuário CUSTOMER já cadastrado com o mesmo e-mail] → comportamento intencional (não altera dados existentes); o operador deve usar um e-mail exclusivo para o admin.
- [Mensagens de validação em inglês (padrão do class-validator)] → aceitável nesta fase; o contrato exige apenas identificar o campo.

## Migration Plan

1. `npm install` das novas dependências.
2. `npx prisma migrate dev --name create-users` (gera a migration e o client).
3. `npm run seed` com `ADMIN_EMAIL`/`ADMIN_PASSWORD` preenchidos.
Rollback: reverter o commit e remover a migration/tabela `users` (não há dados anteriores).
