# Design

## Context

Motivação em `proposal.md` (Why); comportamento em `specs/auth/spec.md` e `specs/user-management/spec.md`.

Estado atual relevante (após a change 001):

- `PrismaModule` é `@Global()`; `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) é `APP_PIPE` no `AppModule` e vale nos e2e.
- `src/users/`: `UsersController` (`POST /users`), `UsersService` com a constante `publicUserSelect` (`id`, `name`, `email`, `role`, `createdAt`) e o tipo `PublicUser`, `PasswordHasher` (só `hash`, argon2id), `normalizeEmail()`.
- `AppController` expõe `GET /` (scaffold), coberto por `test/app.e2e-spec.ts`.
- Não há guard, estratégia de autenticação nem `@nestjs/jwt`. Variáveis de ambiente vêm de `.env` via `dotenv/config` (sem `@nestjs/config`).
- O PRD exige access token de 15 min, refresh token opaco com rotação e detecção de reutilização, e que nenhuma resposta/log contenha senha, hash ou tokens.

## Goals / Non-Goals

**Goals:**
- Identificar o usuário de toda requisição autenticada e disponibilizá-lo aos controllers (`{ id, email, role }`).
- Tornar "protegido" o padrão: esquecer de anotar uma rota nova resulta em `401`, nunca em rota aberta.
- Rotação de refresh token atômica e segura sob concorrência no PostgreSQL.

**Non-Goals:**
- Autorização por papel (`@Roles`/`403`) — virá com as changes de tickets e gestão de equipe; o payload já carrega `role` para isso.
- Revogação imediata de access tokens (são stateless; ver Risks).
- Passport, estratégias e sessões de servidor.

## Decisions

### 1. Access token JWT HS256 (stateless) em vez de sessão no servidor

`@nestjs/jwt` com `JwtModule.register({ secret: JWT_ACCESS_SECRET, signOptions: { algorithm: 'HS256', expiresIn: JWT_ACCESS_EXPIRES_IN ?? '15m' } })`. A verificação fixa `algorithms: ['HS256']`, rejeitando `alg: none` e confusão de algoritmos. Payload `{ sub, email, role }` — nada sensível.

- `JWT_ACCESS_SECRET` é obrigatória: a aplicação falha ao subir se estiver ausente (melhor que assinar com segredo vazio).
- **Alternativa rejeitada — sessão no servidor (id de sessão + tabela/Redis):** exige consulta a cada requisição e um store compartilhado; o PRD já define o modelo access/refresh, e a janela de 15 min limita o dano de um access token vazado. A revogação que importa (sessões longas) fica no refresh token.
- **Alternativa rejeitada — RS256:** só compensa quando terceiros verificam o token; aqui emissor e verificador são o mesmo processo.

### 2. Guard global (`APP_GUARD`) + `@Public()` em vez de `@UseGuards` por controller

`JwtAuthGuard` registrado como `APP_GUARD` (ver decisão 10). Ele lê o metadado `IS_PUBLIC_KEY` via `Reflector.getAllAndOverride` (handler e classe); se público, libera. Caso contrário extrai `Authorization`, exige exatamente `Bearer <token>`, chama `jwtService.verifyAsync` e grava `request.user = { id: sub, email, role }`. Qualquer falha → `UnauthorizedException` (sem detalhar o motivo nem ecoar o token).

- `@Public()` = `SetMetadata(IS_PUBLIC_KEY, true)`; aplicado em `POST /users`, `POST /auth/login` e `POST /auth/refresh`.
- `@CurrentUser()` = `createParamDecorator` que devolve `request.user` tipado como `AuthenticatedUser`.
- `GET /` fica protegido (não recebe `@Public()`), coerente com "todas as rotas exigem token"; o e2e é ajustado.
- **Alternativa rejeitada — `@UseGuards(JwtAuthGuard)` por controller:** é opt-in; cada rota nova esquecida vira rota pública. O guard global é opt-out explícito e auditável (`grep @Public`).
- **Alternativa rejeitada — `@nestjs/passport` + `passport-jwt`:** duas dependências e uma camada de indireção para algo que o `JwtService` resolve em poucas linhas.

### 3. Refresh token opaco guardado como SHA-256 em vez de refresh JWT

Token = `randomBytes(64).toString('base64url')` (512 bits). No banco guarda-se apenas `sha256(token)` em hex, com índice único; a busca é por igualdade do hash.

- **Alternativa rejeitada — refresh token JWT:** é autocontido e não revogável sem consultar o banco de qualquer forma; carrega dados legíveis; e a rotação/detecção de reutilização exige estado no servidor. Um valor opaco com estado no banco é mais simples e é o que o PRD pede.
- **Por que SHA-256 e não argon2:** argon2 existe para tornar lenta a força bruta de segredos de *baixa entropia* (senhas). Um token de 512 bits aleatórios é inviável de adivinhar mesmo com hash rápido, então o custo do argon2 não compra segurança. Além disso argon2 usa salt aleatório, o que impede buscar o registro pelo hash — seria preciso outro identificador no token (`id.segredo`) e uma verificação lenta por requisição. SHA-256 é determinístico, indexável e barato.
- O valor do token nunca é logado; apenas o id do registro pode aparecer em logs de depuração.

### 4. Algoritmo de rotação em transação com `updateMany` + `count === 0`

`AuthService.refresh(token)`:

1. `hash = sha256(token)`; `prisma.$transaction(async (tx) => { ... })` retorna um resultado discriminado (`{ ok: true, user, refreshToken }` | `{ ok: false }`), e a revogação em massa acontece dentro dela:
   - `row = tx.refreshToken.findUnique({ where: { tokenHash: hash } })`; ausente → `{ ok: false }`.
   - `row.revokedAt != null` → reutilização: `tx.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: now } })` → `{ ok: false }`.
   - `row.expiresAt <= now` → `{ ok: false }` (expiração não é reutilização; não revoga as demais sessões).
   - `claim = tx.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: now } })`.
   - `claim.count === 0` → outra requisição revogou o mesmo token entre a leitura e a escrita: tratar como reutilização (revogar todos os ativos do usuário) → `{ ok: false }`.
   - Senão, criar o novo registro (`userId`, novo hash, `expiresAt = now + TTL`) e carregar o usuário para o payload → `{ ok: true, ... }`.
2. Fora da transação: `ok === false` → `UnauthorizedException`; senão assinar o access token e devolver o par.

Por que funciona sob concorrência (READ COMMITTED, padrão do PostgreSQL): o `UPDATE ... WHERE id = $1 AND revoked_at IS NULL` adquire lock de linha. A segunda transação bloqueia até a primeira comitar e então reavalia o `WHERE`, obtendo `count = 0`. Nesse ponto o `R2` criado pela primeira já está comitado, então a revogação em massa da segunda o inclui — satisfazendo o cenário "ao final nenhum refresh token do usuário permanece válido".

- **Por que retornar um resultado em vez de lançar dentro da transação:** lançar faria rollback da revogação em massa, anulando a detecção de reutilização.
- **Alternativa rejeitada — `findUnique` + `update` sem condição:** duas requisições leem `revokedAt = null` e ambas emitem novos tokens (condição de corrida).
- **Alternativa rejeitada — `SELECT ... FOR UPDATE` via `$queryRaw`:** equivalente em correção, mas SQL cru; o `updateMany` condicional expressa o mesmo compare-and-set com a API tipada.
- **Alternativa rejeitada — isolamento `Serializable`:** exigiria retry de falhas de serialização sem ganho sobre o compare-and-set.

### 5. Logout filtrado por `userId`

`logout(userId, token)` executa `updateMany({ where: { tokenHash: sha256(token), userId, revokedAt: null }, data: { revokedAt: now } })` e ignora o `count`. Sempre `204`.

- O filtro por `userId` impede que alguém com um access token revogue a sessão de outra pessoa com um refresh token vazado; responder `204` em todos os casos não revela se o token existe ou a quem pertence.
- Logout de token já revogado não dispara detecção de reutilização — reutilização só é avaliada em `/auth/refresh`, onde a posse do token é o que concede acesso.
- **Alternativa rejeitada — `404`/`403` para token alheio:** vazaria a existência do token.

### 6. `@HttpCode(200)` e `@HttpCode(204)` explícitos

`POST` no Nest responde `201` por padrão. Login e refresh não criam um recurso endereçável para o cliente, então usam `@HttpCode(HttpStatus.OK)`; logout usa `@HttpCode(HttpStatus.NO_CONTENT)` e retorna `void`. Segue o padrão do `UsersController` (`@HttpCode(HttpStatus.CREATED)` explícito).

### 7. Login com tempo constante para e-mail inexistente

`PasswordHasher` ganha `verify(hash, password)` (argon2). `AuthService` mantém um hash de referência (`DUMMY_HASH`), calculado uma única vez com `argon2.hash` e as mesmas opções do `PasswordHasher` e memoizado. Com e-mail inexistente, roda `verify(DUMMY_HASH, password)` e descarta o resultado; ambos os caminhos lançam `new UnauthorizedException('Credenciais inválidas')`.

- **Alternativa rejeitada — literal de hash fixo no código:** funciona, mas se os parâmetros padrão do argon2 mudarem o custo diverge do hash real; calcular com as mesmas opções mantém os tempos alinhados.
- O `LoginDto` normaliza o e-mail com o `normalizeEmail()` existente (`@Transform`), e valida `email` e `password` como strings não vazias (`password` até 128 caracteres, limite do cadastro). Não valida formato de e-mail: um e-mail malformado simplesmente não existe e cai em `401`.

### 8. `GET /users/me`

`UsersController.me(@CurrentUser() user)` → `UsersService.findMe(user.id)` com `findUnique({ where: { id }, select: publicUserSelect })`. Usa a constante já existente `publicUserSelect` (a mesma do cadastro) em vez de criar outra. Se o usuário não existir mais → `UnauthorizedException` (token órfão). Declarado antes de qualquer futura rota `GET /users/:id` para não colidir.

### 9. Modelo `RefreshToken`

```prisma
model RefreshToken {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  tokenHash String    @unique @map("token_hash") @db.Char(64)
  expiresAt DateTime  @map("expires_at")
  revokedAt DateTime? @map("revoked_at")
  createdAt DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("refresh_tokens")
}
```

`User` ganha `refreshTokens RefreshToken[]`. `onDelete: Cascade` mantém funcionando a limpeza dos e2e existentes (`prisma.user.deleteMany()`). Sem coluna `replacedBy`: a detecção de reutilização só precisa de `revokedAt`.

### 10. Módulos e configuração

- `AuthModule` (`src/auth/`): `AuthController`, `AuthService`, `JwtModule`, `JwtAuthGuard` e os decorators. Geração e hash do refresh token ficam em funções puras `generateRefreshToken()`/`hashRefreshToken()` em `src/auth/refresh-token.ts`, testáveis sem Nest (em vez de um serviço injetável só para isso).
- `UsersModule` passa a exportar `PasswordHasher`; `AuthModule` importa `UsersModule`. `AppModule` importa `AuthModule`.
- `JwtAuthGuard` é registrado como `{ provide: APP_GUARD, useClass: JwtAuthGuard }` nos providers do `AuthModule` — `APP_GUARD` é global de qualquer módulo, e assim o guard resolve o `JwtService` no próprio módulo sem exportar o `JwtModule`.
- Variáveis: `JWT_ACCESS_SECRET` (obrigatória), `JWT_ACCESS_EXPIRES_IN` (padrão `15m`), `REFRESH_TOKEN_TTL_DAYS` (padrão `7`, inteiro positivo). Lidas de `process.env` como no resto do projeto.

## Risks / Trade-offs

- [Access token continua válido até expirar após logout ou reutilização detectada] → validade curta (15 min); revogação imediata exigiria denylist e fica fora do escopo.
- [Papel no token pode ficar desatualizado por até 15 min se o ADMIN mudar o papel] → aceitável para o MVP; a change de gestão de equipe pode revogar refresh tokens ao alterar papel.
- [Vazamento de `JWT_ACCESS_SECRET` permite forjar tokens de qualquer usuário] → segredo só no `.env`/ambiente, nunca commitado; rotação do segredo invalida todos os access tokens (refresh continua válido e emite novos).
- [Tempo do login para e-mail inexistente não é idêntico (falta a consulta ao usuário encontrado)] → a diferença dominante (argon2) é eliminada; rate limit (change futura) reduz o valor de ataques por tempo.
- [Uma corrida legítima (cliente com duas abas) derruba todas as sessões do usuário] → comportamento pedido; é o preço da detecção estrita. Clientes devem serializar o refresh.
- [Tabela `refresh_tokens` cresce indefinidamente] → ver Open Questions.
- [Tornar `GET /` protegido quebra quem usa a raiz como health check] → não há consumidores ainda; um health check público pode ser criado depois com `@Public()`.

## Migration Plan

1. Instalar `@nestjs/jwt`; adicionar `JWT_ACCESS_SECRET` (valor aleatório longo), `JWT_ACCESS_EXPIRES_IN` e `REFRESH_TOKEN_TTL_DAYS` ao `.env`.
2. Adicionar o modelo `RefreshToken` e a relação em `User`; `npx prisma migrate dev --name create-refresh-tokens` (cria `refresh_tokens` com FK para `users`, índice em `user_id` e índice único em `token_hash`). Migration aditiva: nenhum dado existente é alterado.
3. Deploy da aplicação; a partir daí rotas não públicas exigem Bearer token.
4. Rollback: reverter o código (rotas voltam a ser abertas) e, se necessário, `DROP TABLE refresh_tokens` — nenhum outro dado depende dela.

## Open Questions

- **Limpeza de tokens expirados/revogados:** quando e como apagar linhas de `refresh_tokens` com `expires_at` passado ou `revoked_at` antigo (job agendado, limpeza oportunista no login, ou `DELETE` manual). Não afeta o comportamento especificado — tokens expirados já são recusados — e pode ser decidida quando o volume justificar. Ao implementar, manter revogados por pelo menos o TTL para preservar a detecção de reutilização.
