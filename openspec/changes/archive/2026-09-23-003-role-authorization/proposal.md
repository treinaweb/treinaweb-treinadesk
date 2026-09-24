# Proposal

## Why

Hoje a API sabe quem faz cada requisição, mas trata todos os usuários autenticados da mesma forma: não há como restringir uma rota a um papel, e o administrador não tem como montar a equipe de atendimento nem manter as categorias de ticket. O PRD define que só o `ADMIN` gerencia usuários e categorias e que um papel sem acesso à rota recebe `403`. Esta change introduz a autorização por papel e entrega essas duas áreas de gestão.

## What Changes

- Autorização por papel: rotas podem ser restritas a papéis específicos; usuário autenticado com papel sem acesso → `403`. O papel considerado é o do access token.
- Nova rota `GET /users` (só `ADMIN`), paginada por `page` (padrão `1`, mínimo `1`) e `limit` (padrão `20`, de `1` a `100`) → `200` com `{ data, page, limit, total }`, sem senha nem hash. Parâmetros fora dos limites → `400`.
- Nova rota `POST /users/staff` (só `ADMIN`): cria usuário com papel `SUPPORT` ou `ADMIN`, com as mesmas validações e regras de e-mail do cadastro público (e-mail duplicado → `409`). Papel `CUSTOMER` ou inexistente → `400`.
- Nova rota `PATCH /users/:id/role` (só `ADMIN`) → `200` com os dados públicos atualizados. O ADMIN não pode alterar o próprio papel (`422`, papel inalterado). Usuário inexistente → `404`.
- Alterar o papel revoga, na mesma operação, todos os refresh tokens ativos do usuário: o refresh antigo passa a dar `401` e o novo papel vale a partir do próximo login. Access tokens já emitidos mantêm o papel antigo até expirar (no máximo a validade do access token) — limitação aceita e documentada.
- Nova rota `GET /categories` para qualquer usuário autenticado, ordenada por nome: `CUSTOMER` e `SUPPORT` veem só as ativas (`id`, `name`); `ADMIN` vê todas, com o campo `active`.
- Nova rota `POST /categories` (só `ADMIN`): `name` de 2 a 60 caracteres após remover espaços nas extremidades → `201` com `active: true`. Nome duplicado → `409`.
- Nova rota `PATCH /categories/:id` (só `ADMIN`): altera `name` e/ou `active` → `200`. Inexistente → `404`; nome já usado por outra categoria → `409`.
- Categorias não são excluídas: desativar substitui excluir, e não existe `DELETE /categories/:id`.

## Capabilities

### New Capabilities
- `categories`: cadastro, listagem por papel, renomeação e ativação/desativação de categorias de ticket, com gestão restrita ao `ADMIN`.

### Modified Capabilities
- `user-management`: adiciona a restrição de rotas por papel (`403`), a listagem paginada de usuários, o cadastro de membros da equipe (`SUPPORT`/`ADMIN`) e a alteração de papel com revogação das sessões. Os requisitos existentes (cadastro público, `GET /users/me`, seed) não mudam.

## Impact

- **Código**: novo decorator de papéis e guard global de autorização em `src/auth/`; DTO de paginação compartilhado em `src/common/dto/`; `UsersController`/`UsersService` ganham listagem, cadastro de equipe e alteração de papel; novo módulo `src/categories/` (controller, service, DTOs) importado no `AppModule`.
- **Banco**: novo modelo de categoria (tabela `categories`, nome único) e migration `create-categories`.
- **Dependências**: nenhuma nova.
- **Testes**: novos unitários (guard de papéis, DTO de paginação, `UsersService`, `CategoriesService`) e e2e contra PostgreSQL real; os e2e passam a limpar também a tabela `categories`.
- **Clientes da API**: rotas existentes não mudam de comportamento; as novas rotas de gestão exigem um access token de `ADMIN`.

## Fora do escopo

- Exclusão de usuários e de categorias.
- Permissões configuráveis além dos três papéis fixos (`CUSTOMER`, `SUPPORT`, `ADMIN`).
- Consultar o papel no banco a cada requisição (o papel vem do access token).
