# Proposal

## Why

A change 001 criou o cadastro de usuários, mas a API ainda não sabe quem faz cada requisição: não há login, nenhuma rota é protegida e os próximos módulos (tickets, categorias, gestão de equipe) dependem de um usuário autenticado para aplicar visibilidade e permissões. O PRD pede "Login com access token e refresh token com rotação; logout", com access token de 15 minutos e refresh token opaco com detecção de reutilização. Esta change entrega essa base e passa a exigir autenticação por padrão.

## What Changes

- Nova rota pública `POST /auth/login` (`email`, `password`) → `200` com `accessToken` e `refreshToken`. O e-mail é normalizado (trim + minúsculas) antes da busca.
- Senha errada e e-mail inexistente → `401` com o mesmo corpo (`"Credenciais inválidas"`) e tempo de resposta parecido (verificação de senha também roda quando o e-mail não existe).
- **BREAKING**: autenticação passa a ser obrigatória em todas as rotas, exceto `POST /users`, `POST /auth/login` e `POST /auth/refresh`. Sem Bearer token, token malformado, com assinatura inválida ou expirado → `401`. Isso inclui a rota `GET /` do scaffold.
- Access token JWT com validade configurável por `JWT_ACCESS_EXPIRES_IN` (padrão `15m`) e payload `{ sub, email, role }`.
- Nova rota pública `POST /auth/refresh` (`refreshToken`) → `200` com um novo par. O token apresentado é invalidado na mesma operação (rotação). Token inexistente ou expirado (validade de `REFRESH_TOKEN_TTL_DAYS` dias) → `401`.
- Detecção de reutilização: apresentar um refresh token já revogado → `401` e revogação de **todos** os refresh tokens ativos do usuário. Duas requisições simultâneas com o mesmo token contam como reutilização.
- Nova rota autenticada `POST /auth/logout` (`refreshToken`) → `204`. Só revoga token do próprio usuário; token de outro usuário (ou inexistente) também responde `204` e continua válido.
- Refresh token opaco e aleatório, armazenado apenas como resumo criptográfico e nunca incluído em logs.
- Nova rota autenticada `GET /users/me` → `200` com `id`, `name`, `email`, `role` e `createdAt` do usuário do token.

## Capabilities

### New Capabilities
- `auth`: login com e-mail e senha, emissão e validação de access token, autenticação obrigatória por padrão com rotas públicas explícitas, rotação de refresh token com detecção de reutilização e logout.

### Modified Capabilities
- `user-management`: adiciona a consulta do próprio perfil (`GET /users/me`), que exige autenticação. Os requisitos existentes de cadastro não mudam — `POST /users` continua público.

## Impact

- **Código**: novo módulo `src/auth/` (controller, service, guard global, decorator de rota pública e de usuário atual, DTOs); `PasswordHasher` ganha verificação de senha e passa a ser exportado pelo módulo de usuários; `UsersController` ganha `GET /users/me` e `POST /users` é marcado como público; `AppModule` registra o guard global e importa o módulo de autenticação.
- **Banco**: novo modelo de refresh token (tabela `refresh_tokens`, ligada a `users`) e migration `create-refresh-tokens`.
- **Dependências**: `@nestjs/jwt`.
- **Ambiente**: novas variáveis `JWT_ACCESS_SECRET` (obrigatória), `JWT_ACCESS_EXPIRES_IN` (padrão `15m`) e `REFRESH_TOKEN_TTL_DAYS` (padrão `7`).
- **Testes**: o e2e de `GET /` passa a esperar `401` sem token; novos e2e de autenticação contra PostgreSQL real (limpeza de `refresh_tokens` em cascata com `users`).
- **Clientes da API**: toda chamada fora das três rotas públicas precisa enviar `Authorization: Bearer <accessToken>`.

## Fora do escopo

- Autorização por papel (`403`) — apenas identificação do usuário nesta change.
- Rate limiting (global e nas rotas de autenticação).
- Tokens em cookie, login social, MFA.
- Listagem ou gerenciamento de sessões ativas.
- Limpeza periódica de refresh tokens expirados/revogados (ver Open Questions no design).
