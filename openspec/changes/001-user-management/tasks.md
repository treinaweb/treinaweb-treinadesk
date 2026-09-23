# Tasks

## 1. Infraestrutura

- [x] 1.1 Instalar `class-validator`, `class-transformer` e `argon2` (dependencies) e `tsx` (devDependency); verificar que `npm ls class-validator class-transformer argon2 tsx` não reporta erros
- [x] 1.2 Tornar o `PrismaModule` global (`@Global()`), mantendo-o importado apenas no `AppModule`; verificar com `npx tsc --noEmit` e `npm test`
- [x] 1.3 Registrar `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` como `APP_PIPE` no `AppModule`; verificar com `npx tsc --noEmit` e que o e2e existente (`GET /`) continua passando
- [x] 1.4 Adicionar `"setupFiles": ["dotenv/config"]` em `test/jest-e2e.json`; verificar que `npm run test:e2e` conecta ao banco do `.env`
- [x] 1.5 Configurar o seed: `migrations.seed: 'tsx prisma/seed.ts'` em `prisma7.config.ts` e script `"seed": "prisma db seed"` no `package.json`; verificar que as chaves existem (execução real na seção 5)
- [x] 1.6 Atualizar o `CLAUDE.md`: `PrismaModule` global (módulos não precisam importá-lo), validação global via `APP_PIPE`, comando `npm run seed` e aviso de que e2e limpam a tabela `users`; verificar o diff do arquivo

## 2. Modelo de dados

- [x] 2.1 Adicionar ao `prisma/schema.prisma` o enum `Role` (`CUSTOMER`, `SUPPORT`, `ADMIN`) e o modelo `User` (tabela `users`, `id` uuid, `name` varchar(100), `email` varchar(200) único, `passwordHash`, `role` default `CUSTOMER`, `createdAt`, `updatedAt`) conforme design; verificar com `npx prisma validate`
- [x] 2.2 Gerar e aplicar a migration com `npx prisma migrate dev --name create-users`; verificar que `prisma/migrations/*_create-users/migration.sql` existe e que o client em `src/generated/prisma` exporta `User` e `Role`

## 3. Testes (antes da implementação)

- [x] 3.1 Unitário `src/users/normalize-email.spec.ts`: trim + minúsculas (`"  Ana@Teste.COM  "` → `"ana@teste.com"`) e valor não-string preservado; verificar que falha por ausência da implementação
- [x] 3.2 Unitário `src/users/users.service.spec.ts` (Prisma e `PasswordHasher` mockados): cria sempre com `role: CUSTOMER`, grava o hash (não a senha), usa `select` sem `passwordHash`, e converte erro `P2002` em `ConflictException`; verificar que falha por ausência da implementação
- [x] 3.3 E2E `test/users.e2e-spec.ts` — cenário "Cadastro com dados válidos" e "Usuário criado é persistido": `201` com exatamente `id`, `name`, `email`, `role: "CUSTOMER"`, `createdAt`; verificar que falha (rota inexistente)
- [x] 3.4 E2E — cenários de validação: nome curto/longo, e-mail inválido/longo (201 caracteres), senha curta/longa, corpo `{}` (indica `name`, `email`, `password`) e limites aceitos (nome 2, e-mail 200, senha 128 → `201`); verificar `400` com mensagem citando o campo e que nenhum usuário é criado
- [x] 3.5 E2E — cenários de propriedade não declarada: `role: "ADMIN"` e `isVip: true` retornam `400` citando a propriedade e não criam usuário (um `POST` seguinte sem a propriedade retorna `201`)
- [x] 3.6 E2E — cenários de e-mail normalizado e único: `"  Ana@Teste.COM  "` retorna `email: "ana@teste.com"`; duplicado idêntico e `"ANA@teste.com"` contra `ana@teste.com` retornam `409` e a contagem de usuários não muda
- [x] 3.7 E2E — cenários de proteção da senha: resposta sem `password`/`passwordHash` e sem valor igual à senha; registro no banco com `passwordHash` iniciando em `$argon2id$`, diferente da senha e validado por `argon2.verify`; resposta de erro `400` de senha inválida não contém a senha enviada
- [x] 3.8 E2E `test/seed-admin.e2e-spec.ts` — cenários do seed: cria ADMIN com e-mail normalizado e hash argon2id; segunda execução mantém um único usuário sem erro; `ADMIN_EMAIL` ou `ADMIN_PASSWORD` ausente lança erro citando a variável e não cria usuário; após o seed, `POST /users` com `"ADMIN@..."` retorna `409`

## 4. Implementação

- [x] 4.1 Implementar `normalizeEmail()` em `src/users/normalize-email.ts`; verificar que o teste 3.1 passa
- [x] 4.2 Implementar `PasswordHasher` em `src/users/password-hasher.ts` (argon2id via `argon2.hash`); verificar com `npx tsc --noEmit`
- [x] 4.3 Criar `CreateUserDto` em `src/users/dto/create-user.dto.ts` com as regras de `name`, `email` (`@Transform` com `normalizeEmail` + `@IsEmail` + `@MaxLength(200)`) e `password`; verificar que os testes 3.4 e 3.5 passam após 4.5
- [x] 4.4 Implementar `UsersService.create` (hash, `role: CUSTOMER`, `select` de `id`, `name`, `email`, `role`, `createdAt`, `P2002` → `409`); verificar que o teste 3.2 passa
- [x] 4.5 Criar `UsersController` com `POST /users` (`@HttpCode(201)`) e `UsersModule` (controller, service, `PasswordHasher`), importado no `AppModule`; verificar que os testes 3.3 a 3.7 passam
- [x] 4.6 Implementar `seedAdmin(prisma, env)` em `src/users/seed-admin.ts` (valida variáveis, normaliza e-mail, hash, `upsert` com `update: {}` e `role: ADMIN`) e o entrypoint `prisma/seed.ts`; verificar que o teste 3.8 passa

## 5. Verificação

- [x] 5.1 Executar `npm run seed` duas vezes com `ADMIN_EMAIL`/`ADMIN_PASSWORD` do `.env`; verificar que ambas terminam sem erro e existe um único usuário ADMIN com esse e-mail
- [x] 5.2 Executar `npm run lint` e verificar que não há erros
- [x] 5.3 Executar `npm test`, `npx tsc --noEmit` e `npm run test:e2e`; verificar que tudo passa sem falhas
