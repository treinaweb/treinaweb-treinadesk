# Spec Delta

## Purpose

Disponibiliza a documentação da API em formato navegável e legível por máquina, para que frontends independentes (como o do curso de Next.js) conheçam rotas, autenticação, permissões, formatos de resposta e erros sem ler o código.

## ADDED Requirements

### Requirement: Documentação navegável pública
O sistema SHALL expor a rota `GET /docs`, que responde `200` com uma página HTML de documentação interativa da API. A rota MUST ser acessível sem token, em qualquer ambiente, inclusive com `NODE_ENV=production`. A página MUST permitir informar um access token e enviá-lo como `Authorization: Bearer <token>` nas rotas protegidas testadas por ela.

#### Scenario: Acesso à documentação sem token
- **GIVEN** que a API está em execução
- **WHEN** um cliente envia `GET /docs` sem o cabeçalho `Authorization`
- **THEN** a resposta tem status `200`
- **AND** o `Content-Type` é `text/html`

#### Scenario: Documentação disponível em produção
- **GIVEN** que a API está em execução com `NODE_ENV=production`
- **WHEN** um cliente envia `GET /docs` sem token
- **THEN** a resposta tem status `200`

### Requirement: Documento OpenAPI público
O sistema SHALL expor a rota `GET /docs-json`, acessível sem token em qualquer ambiente, que responde `200` com um documento OpenAPI 3 em JSON. O documento MUST ter título "TreinaDesk API" e MUST listar todas as rotas da API com o mesmo método e caminho que elas atendem, com os parâmetros de caminho escritos no formato OpenAPI (`{id}`). As rotas `/docs` e `/docs-json` MUST NOT constar no documento.

#### Scenario: Documento OpenAPI sem token
- **GIVEN** que a API está em execução
- **WHEN** um cliente envia `GET /docs-json` sem o cabeçalho `Authorization`
- **THEN** a resposta tem status `200` com `Content-Type` `application/json`
- **AND** o corpo tem `openapi` começando com `"3."` e `info.title` igual a `"TreinaDesk API"`

#### Scenario: Todas as rotas presentes
- **GIVEN** que a API está em execução
- **WHEN** um cliente envia `GET /docs-json`
- **THEN** `paths` contém exatamente as operações `POST /users`, `POST /users/staff`, `GET /users`, `GET /users/me`, `PATCH /users/{id}/role`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /categories`, `POST /categories`, `PATCH /categories/{id}`, `POST /tickets`, `GET /tickets`, `GET /tickets/{id}`, `PATCH /tickets/{id}/assign`, `PATCH /tickets/{id}/status`, `POST /tickets/{ticketId}/comments`, `GET /tickets/{ticketId}/comments` e `GET /`
- **AND** `paths` não contém `/docs` nem `/docs-json`

### Requirement: Autenticação descrita no documento OpenAPI
O documento OpenAPI MUST declarar um esquema de segurança HTTP Bearer com formato JWT. Toda operação que exige access token MUST referenciar esse esquema e MUST listar a resposta `401`. As operações públicas (`POST /users`, `POST /auth/login` e `POST /auth/refresh`) MUST NOT referenciar esquema de segurança. Operações restritas por papel MUST listar a resposta `403` e MUST informar na descrição os papéis aceitos.

#### Scenario: Esquema Bearer declarado
- **WHEN** um cliente envia `GET /docs-json`
- **THEN** `components.securitySchemes` contém um esquema com `type` `"http"`, `scheme` `"bearer"` e `bearerFormat` `"JWT"`

#### Scenario: Rota protegida exige o esquema
- **WHEN** um cliente envia `GET /docs-json`
- **THEN** a operação `GET /tickets` referencia o esquema Bearer em `security`
- **AND** lista a resposta `401`

#### Scenario: Rotas públicas sem esquema
- **WHEN** um cliente envia `GET /docs-json`
- **THEN** as operações `POST /users`, `POST /auth/login` e `POST /auth/refresh` não têm `security` com o esquema Bearer

#### Scenario: Rota restrita por papel
- **WHEN** um cliente envia `GET /docs-json`
- **THEN** a operação `POST /categories` lista as respostas `401` e `403`
- **AND** sua descrição menciona o papel `ADMIN`

### Requirement: Corpos de requisição e respostas descritos
Cada operação do documento OpenAPI MUST descrever o corpo de requisição aceito (campos, tipos, obrigatoriedade, limites de tamanho e valores de enum), os parâmetros de caminho e de consulta, a resposta de sucesso com o status real da rota e o formato do corpo, e os status de erro que a rota pode devolver (`400`, `404`, `409`, `422`, conforme o caso). O formato descrito MUST corresponder ao que a rota devolve.

#### Scenario: Corpo de criação de ticket
- **WHEN** um cliente envia `GET /docs-json`
- **THEN** o corpo de `POST /tickets` exige `title` (5 a 120 caracteres), `description` (10 a 5000 caracteres), `priority` (enum `LOW`, `MEDIUM`, `HIGH`, `URGENT`) e `categoryId` (UUID)
- **AND** a operação lista as respostas `201`, `400`, `401`, `403` e `422`

#### Scenario: Resposta de login
- **WHEN** um cliente envia `GET /docs-json`
- **THEN** a resposta `200` de `POST /auth/login` descreve um objeto com `accessToken` e `refreshToken` do tipo string
- **AND** a operação lista a resposta `401`

#### Scenario: Ticket descrito sem dados sensíveis do usuário
- **WHEN** um cliente envia `GET /docs-json`
- **THEN** a resposta `200` de `GET /tickets/{id}` descreve `customer` e `assignee` apenas com `id`, `name` e `role`
- **AND** nenhum esquema de resposta contém `passwordHash`

#### Scenario: Listagem paginada
- **WHEN** um cliente envia `GET /docs-json`
- **THEN** a resposta `200` de `GET /tickets` descreve `data` (lista de tickets), `page`, `limit` e `total`
- **AND** a operação descreve os parâmetros de consulta `page`, `limit`, `status` e `priority`

#### Scenario: Status de sucesso real
- **WHEN** um cliente envia `GET /docs-json`
- **THEN** `POST /auth/logout` lista a resposta `204`, `POST /auth/login` lista `200` e `POST /users` lista `201`

### Requirement: Comportamento das rotas existentes preservado
A publicação da documentação MUST NOT alterar status, corpo, validação, autenticação ou autorização de nenhuma rota existente. Em especial, as rotas que hoje exigem access token continuam exigindo e a rota `GET /` continua respondendo `401` sem token.

#### Scenario: Rota existente continua protegida
- **GIVEN** que a documentação está publicada
- **WHEN** um cliente envia `GET /tickets` sem token
- **THEN** a resposta tem status `401`

#### Scenario: Raiz continua protegida
- **GIVEN** que a documentação está publicada
- **WHEN** um cliente envia `GET /` sem token
- **THEN** a resposta tem status `401`
