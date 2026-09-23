# Tasks

## 1. Dependências e modelo

- [x] 1.1 Instalar `@nestjs/jwt` (dependency); verificar que `npm ls @nestjs/jwt` não reporta erros
- [x] 1.2 Adicionar ao `.env` `JWT_ACCESS_SECRET` (valor aleatório longo), `JWT_ACCESS_EXPIRES_IN=15m` e `REFRESH_TOKEN_TTL_DAYS=7`; verificar que as três chaves existem no `.env` e que o `.env` continua fora do git (`git check-ignore .env`)
- [x] 1.3 Adicionar ao `prisma/schema.prisma` o modelo `RefreshToken` (tabela `refresh_tokens`, `tokenHash` char(64) único, `expiresAt`, `revokedAt` opcional, `createdAt`, FK `userId` com `onDelete: Cascade`, índice em `userId`) e a relação `refreshTokens` em `User`, conforme design (decisão 9); verificar com `npx prisma validate`
- [x] 1.4 Gerar e aplicar a migration com `npx prisma migrate dev --name create-refresh-tokens`; verificar que `prisma/migrations/*_create_refresh_tokens/migration.sql` cria a tabela, a FK e os dois índices, e que o client em `src/generated/prisma` exporta `RefreshToken`

## 2. Testes (antes da implementação)

- [x] 2.1 Unitário `src/auth/refresh-token.spec.ts`: `generateRefreshToken()` gera valores base64url distintos de 86 caracteres sem `.`; `hashRefreshToken()` é determinístico, retorna 64 caracteres hex e difere do valor original; verificar que falha por ausência da implementação
- [x] 2.2 Unitário `src/auth/jwt-auth.guard.spec.ts` (`JwtService` e `Reflector` mockados): libera rota `@Public()` sem cabeçalho; lança `UnauthorizedException` sem cabeçalho, com esquema diferente de `Bearer`, com `Bearer` vazio e quando `verifyAsync` rejeita; com token válido grava `request.user = { id, email, role }`; verificar que falha por ausência da implementação
- [x] 2.3 Unitário `src/auth/auth.service.spec.ts` (Prisma, `PasswordHasher` e `JwtService` mockados): para e-mail inexistente (a normalização vem do DTO) chama `passwordHasher.verify` com o hash de referência e lança `UnauthorizedException('Credenciais inválidas')`; senha errada lança a mesma exceção; login válido grava apenas o hash do refresh token; verificar que falha por ausência da implementação
- [x] 2.4 E2E `test/auth.e2e-spec.ts` — requisito "Login com e-mail e senha": login válido (`200`, exatamente `accessToken` e `refreshToken`), e-mail `"  ANA@Teste.com "` aceito, corpo `{}` → `400` citando `email` e `password`, propriedade `role` → `400`; verificar que falha (rota inexistente)
- [x] 2.5 E2E — requisito "Credenciais inválidas indistinguíveis": senha errada e e-mail inexistente → `401` com corpos idênticos e mensagem `"Credenciais inválidas"`, sem tokens e sem ecoar a senha; verificar que falha antes da implementação
- [x] 2.6 E2E — requisito "Access token": payload decodificado tem `sub` = id de `ana@teste.com`, `email`, `role: "CUSTOMER"`, `exp - iat === 900` e não tem `password`/`passwordHash`; verificar que falha antes da implementação
- [x] 2.7 E2E — requisito "Autenticação obrigatória por padrão": `GET /users/me` sem cabeçalho, com `Token abc`, com `Bearer` vazio, com JWT assinado por outro segredo, com `alg: none` e com token expirado (assinado com o segredo real e `exp` no passado) → `401`; `POST /users` sem token → `201`. Atualizar `test/app.e2e-spec.ts`: `GET /` sem token → `401` e com token válido → `200`; verificar que os novos casos falham antes da implementação
- [x] 2.8 E2E — requisito "Rotação de refresh token": `R1` → `200` com `R2 ≠ R1` e access token aceito em `/users/me`; `R2` → `R3`; token nunca emitido → `401`; `R1` com `expiresAt` retroativo (ajustado via Prisma) → `401` sem revogar outro token ativo do usuário; corpo `{}` → `400` citando `refreshToken`; verificar que falha antes da implementação
- [x] 2.9 E2E — requisito "Detecção de reutilização": reapresentar `R1` após rotação → `401` e `R2` passa a dar `401`; com duas sessões (`R1`, `S1`) a reutilização de `R1` invalida `R2` e `S1`, mas não o token de `bia@teste.com`; duas chamadas simultâneas (`Promise.all`) com `R1` → no máximo um `200`, o outro `401`, e o `R2` devolvido também dá `401`; verificar que falha antes da implementação
- [x] 2.10 E2E — requisito "Logout": próprio token → `204` sem corpo e `R1` passa a dar `401` no refresh; token de `bia@teste.com` → `204` e `B1` continua dando `200`; token inexistente → `204`; sem autenticação → `401` e `R1` continua válido; corpo `{}` → `400` citando `refreshToken`; verificar que falha antes da implementação
- [x] 2.11 E2E — requisito "Proteção dos refresh tokens": após login, o registro em `refresh_tokens` do usuário existe e nenhum campo é igual a `R1`; `R1` não tem três segmentos separados por `.`; respostas `401` de refresh/login não contêm o token nem a senha enviados; verificar que falha antes da implementação
- [x] 2.12 E2E `test/users.e2e-spec.ts` — requisito "Consulta do próprio perfil": `GET /users/me` com o token de `ana@teste.com` → `200` com exatamente `id`, `name: "Ana"`, `email`, `role: "CUSTOMER"`, `createdAt`; com o token de `bia@teste.com` retorna `email: "bia@teste.com"`; sem token → `401`; verificar que falha (rota inexistente)

## 3. Implementação

- [x] 3.1 Implementar `generateRefreshToken()` (`randomBytes(64).toString('base64url')`) e `hashRefreshToken()` (SHA-256 hex) em `src/auth/refresh-token.ts`; verificar que o teste 2.1 passa
- [x] 3.2 Adicionar `verify(hash, password)` ao `PasswordHasher` e exportá-lo no `UsersModule`; verificar com `npx tsc --noEmit` e que os testes existentes de `users` continuam passando
- [x] 3.3 Criar `@Public()` (`IS_PUBLIC_KEY`), `@CurrentUser()` e o tipo `AuthenticatedUser` em `src/auth/`; verificar com `npx tsc --noEmit`
- [x] 3.4 Implementar `JwtAuthGuard` (metadado público via `Reflector.getAllAndOverride`, extração estrita de `Bearer`, `verifyAsync` com `algorithms: ['HS256']`, `request.user = { id: sub, email, role }`, qualquer falha → `401` sem detalhar); verificar que o teste 2.2 passa
- [x] 3.5 Criar `LoginDto` (`email` com `@Transform(normalizeEmail)` + `@IsString` + `@IsNotEmpty`; `password` `@IsString` + `@IsNotEmpty` + `@MaxLength(128)`) e `RefreshTokenDto` (`refreshToken` `@IsString` + `@IsNotEmpty`), usado em refresh e logout; verificar com `npx tsc --noEmit`
- [x] 3.6 Implementar `AuthService.login` (busca por e-mail, `verify` contra o hash real ou contra o hash de referência memoizado, `UnauthorizedException('Credenciais inválidas')`, emissão do par e gravação só do hash com `expiresAt = agora + REFRESH_TOKEN_TTL_DAYS`); verificar que o teste 2.3 passa
- [x] 3.7 Implementar `AuthService.refresh` com o algoritmo da decisão 4 (transação que retorna resultado discriminado; revogação em massa em reutilização e quando `updateMany` retorna `count === 0`; `401` lançado fora da transação); verificar com `npx tsc --noEmit` (comportamento validado em 3.10)
- [x] 3.8 Implementar `AuthService.logout(userId, token)` com `updateMany` filtrado por `tokenHash`, `userId` e `revokedAt: null`, ignorando o `count`; verificar com `npx tsc --noEmit`
- [x] 3.9 Criar `AuthController` (`POST /auth/login` e `POST /auth/refresh` com `@Public()` + `@HttpCode(HttpStatus.OK)`; `POST /auth/logout` com `@HttpCode(HttpStatus.NO_CONTENT)` e `@CurrentUser()`) e `AuthModule` (`JwtModule.register` com `JWT_ACCESS_SECRET` obrigatório — erro na inicialização se ausente —, `algorithm: 'HS256'`, `expiresIn: JWT_ACCESS_EXPIRES_IN ?? '15m'`; `APP_GUARD` com `JwtAuthGuard`; importa `UsersModule`), importado no `AppModule`; verificar que a aplicação sobe com `npm run start:dev` e falha com mensagem clara sem `JWT_ACCESS_SECRET`
- [x] 3.10 Rodar os e2e de autenticação; verificar que os testes 2.4 a 2.11 passam
- [x] 3.11 Marcar `POST /users` com `@Public()`, adicionar `GET /users/me` no `UsersController` e `UsersService.findMe(id)` usando `publicUserSelect` (usuário inexistente → `401`); verificar que o teste 2.12 e todo `test/users.e2e-spec.ts` passam
- [x] 3.12 Atualizar o `CLAUDE.md`: guard global com `@Public()` (rotas novas são protegidas por padrão), `@CurrentUser()`, variáveis `JWT_ACCESS_SECRET`/`JWT_ACCESS_EXPIRES_IN`/`REFRESH_TOKEN_TTL_DAYS`, e aviso de que os e2e também apagam `refresh_tokens` (em cascata com `users`); verificar o diff do arquivo

## 4. Verificação

- [x] 4.1 Verificar manualmente com a aplicação rodando: login do ADMIN do seed → `/users/me` com o access token → refresh → logout → refresh com o token do logout retorna `401`; e conferir no console que nenhum log exibiu senha, hash ou tokens
- [x] 4.2 Executar `npm run lint` e verificar que não há erros
- [x] 4.3 Executar `npm test`, `npx tsc --noEmit` e `npm run test:e2e`; verificar que tudo passa sem falhas
