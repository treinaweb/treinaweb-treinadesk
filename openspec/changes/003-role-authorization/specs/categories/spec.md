# Spec Delta

## Purpose

Mantém as categorias usadas para classificar tickets de suporte: qualquer usuário autenticado consulta as categorias disponíveis, e somente o administrador cria, renomeia, ativa e desativa categorias, sem exclusão.

## ADDED Requirements

### Requirement: Listagem de categorias por papel
O sistema SHALL expor a rota `GET /categories`, acessível a qualquer usuário autenticado, que responde `200` com um array de categorias ordenado por `name` em ordem crescente. Para `CUSTOMER` e `SUPPORT`, o array MUST conter somente as categorias ativas, cada item com exatamente `id` e `name`. Para `ADMIN`, o array MUST conter todas as categorias, ativas e inativas, cada item com exatamente `id`, `name` e `active`. Requisição sem token ou com token inválido MUST receber `401`.

#### Scenario: Cliente vê apenas categorias ativas
- **GIVEN** que existem a categoria `"Financeiro"` ativa e a categoria `"Legado"` inativa
- **AND** que `ana@teste.com` (papel `CUSTOMER`) está autenticada com `A1`
- **WHEN** um cliente envia `GET /categories` com `Authorization: Bearer A1`
- **THEN** a resposta tem status `200`
- **AND** o corpo é um array com um único item, com `name` igual a `"Financeiro"`
- **AND** o item contém exatamente `id` e `name`

#### Scenario: Atendente vê apenas categorias ativas
- **GIVEN** que existem `"Financeiro"` ativa e `"Legado"` inativa
- **AND** que `bia@teste.com` (papel `SUPPORT`) está autenticada com `B1`
- **WHEN** um cliente envia `GET /categories` com `Authorization: Bearer B1`
- **THEN** a resposta tem status `200` com um array contendo apenas `"Financeiro"`

#### Scenario: Administrador vê todas as categorias com o status
- **GIVEN** que existem `"Financeiro"` ativa e `"Legado"` inativa e o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `GET /categories` com `Authorization: Bearer ADM1`
- **THEN** a resposta tem status `200`
- **AND** o corpo é um array com `"Financeiro"` com `active` igual a `true` e `"Legado"` com `active` igual a `false`, nessa ordem
- **AND** cada item contém exatamente `id`, `name` e `active`

#### Scenario: Ordenação por nome
- **GIVEN** que as categorias ativas `"Suporte Técnico"`, `"Acesso"` e `"Financeiro"` foram criadas nessa ordem
- **AND** que `ana@teste.com` está autenticada com `A1`
- **WHEN** um cliente envia `GET /categories` com `Authorization: Bearer A1`
- **THEN** os nomes retornados, na ordem, são `"Acesso"`, `"Financeiro"` e `"Suporte Técnico"`

#### Scenario: Nenhuma categoria cadastrada
- **GIVEN** que não existe nenhuma categoria e `ana@teste.com` está autenticada com `A1`
- **WHEN** um cliente envia `GET /categories` com `Authorization: Bearer A1`
- **THEN** a resposta tem status `200` com um array vazio

#### Scenario: Listagem sem autenticação
- **WHEN** um cliente envia `GET /categories` sem o cabeçalho `Authorization`
- **THEN** a resposta tem status `401`

### Requirement: Criação de categoria
O sistema SHALL expor a rota `POST /categories`, restrita ao `ADMIN`, que recebe `name`. O `name` MUST ter os espaços nas extremidades removidos antes da validação e do armazenamento, e MUST ter de 2 a 60 caracteres após essa remoção. A categoria criada MUST ser ativa. Em caso de sucesso, a resposta MUST ter status `201` e corpo contendo exatamente `id`, `name` e `active` (igual a `true`). Não SHALL existir duas categorias com o mesmo `name`; um nome já existente MUST resultar em `409`. `name` inválido ou ausente, ou propriedades não declaradas no corpo, MUST resultar em `400` sem criar categoria. Usuários `CUSTOMER` e `SUPPORT` MUST receber `403`.

#### Scenario: Criação com nome válido
- **GIVEN** que o administrador está autenticado com `ADM1` e não existe a categoria `"Financeiro"`
- **WHEN** um cliente envia `POST /categories` com `Authorization: Bearer ADM1` e `{"name": "Financeiro"}`
- **THEN** a resposta tem status `201`
- **AND** o corpo contém exatamente `id`, `name` igual a `"Financeiro"` e `active` igual a `true`

#### Scenario: Nome com espaços nas extremidades
- **GIVEN** que o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `POST /categories` com `Authorization: Bearer ADM1` e `{"name": "  Financeiro  "}`
- **THEN** a resposta tem status `201` com `name` igual a `"Financeiro"`

#### Scenario: Nome curto demais após remover espaços
- **GIVEN** que o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `POST /categories` com `Authorization: Bearer ADM1` e `{"name": "  F  "}`
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica o campo `name`
- **AND** nenhuma categoria é criada

#### Scenario: Nome longo demais
- **GIVEN** que o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `POST /categories` com `Authorization: Bearer ADM1` e `name` de 61 caracteres
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica o campo `name`

#### Scenario: Limites aceitos
- **GIVEN** que o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `POST /categories` com `name` de 2 caracteres e, em outra requisição, com `name` de 60 caracteres
- **THEN** as duas respostas têm status `201`

#### Scenario: Nome ausente ou propriedade extra
- **GIVEN** que o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `POST /categories` com `Authorization: Bearer ADM1` e corpo `{}`, e em outra requisição com `{"name": "Financeiro", "active": false}`
- **THEN** a primeira resposta tem status `400` indicando o campo `name`
- **AND** a segunda resposta tem status `400` indicando a propriedade `active`

#### Scenario: Nome duplicado
- **GIVEN** que existe a categoria `"Financeiro"` e o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `POST /categories` com `Authorization: Bearer ADM1` e `{"name": " Financeiro "}`
- **THEN** a resposta tem status `409`
- **AND** continua existindo uma única categoria `"Financeiro"`

#### Scenario: Outros papéis não criam categorias
- **GIVEN** que `ana@teste.com` (`CUSTOMER`) está autenticada com `A1` e `bia@teste.com` (`SUPPORT`) com `B1`
- **WHEN** um cliente envia `POST /categories` com `{"name": "Financeiro"}` usando `A1` e, em outra requisição, usando `B1`
- **THEN** as duas respostas têm status `403`
- **AND** nenhuma categoria é criada

### Requirement: Alteração de categoria
O sistema SHALL expor a rota `PATCH /categories/:id`, restrita ao `ADMIN`, que recebe `name` e/ou `active` e altera apenas os campos enviados. `name` MUST seguir as mesmas regras da criação (espaços nas extremidades removidos, 2 a 60 caracteres); `active` MUST ser booleano. Em caso de sucesso, a resposta MUST ter status `200` e corpo contendo exatamente `id`, `name` e `active` já atualizados. Corpo sem `name` nem `active`, valores inválidos, propriedades não declaradas ou `:id` que não seja um UUID válido MUST resultar em `400`. Categoria inexistente MUST resultar em `404`. Um `name` já usado por outra categoria MUST resultar em `409`, sem alterar a categoria. Usuários `CUSTOMER` e `SUPPORT` MUST receber `403`.

#### Scenario: Renomear categoria
- **GIVEN** que existe a categoria ativa `"Financeiro"` e o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `PATCH /categories/<id de Financeiro>` com `Authorization: Bearer ADM1` e `{"name": "Cobrança"}`
- **THEN** a resposta tem status `200`
- **AND** o corpo contém exatamente `id` de `"Financeiro"`, `name` igual a `"Cobrança"` e `active` igual a `true`

#### Scenario: Desativar categoria
- **GIVEN** que existe a categoria ativa `"Financeiro"` e o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `PATCH /categories/<id de Financeiro>` com `Authorization: Bearer ADM1` e `{"active": false}`
- **THEN** a resposta tem status `200` com `name` igual a `"Financeiro"` e `active` igual a `false`
- **AND** `GET /categories` com o token de `ana@teste.com` (`CUSTOMER`) não retorna `"Financeiro"`

#### Scenario: Reativar categoria
- **GIVEN** que existe a categoria inativa `"Legado"` e o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `PATCH /categories/<id de Legado>` com `Authorization: Bearer ADM1` e `{"active": true}`
- **THEN** a resposta tem status `200` com `active` igual a `true`
- **AND** `GET /categories` com o token de `ana@teste.com` passa a retornar `"Legado"`

#### Scenario: Alterar nome e status juntos
- **GIVEN** que existe a categoria inativa `"Legado"` e o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `PATCH /categories/<id de Legado>` com `Authorization: Bearer ADM1` e `{"name": "Acesso", "active": true}`
- **THEN** a resposta tem status `200` com `name` igual a `"Acesso"` e `active` igual a `true`

#### Scenario: Nome já usado por outra categoria
- **GIVEN** que existem `"Financeiro"` e `"Legado"` e o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `PATCH /categories/<id de Legado>` com `Authorization: Bearer ADM1` e `{"name": "Financeiro"}`
- **THEN** a resposta tem status `409`
- **AND** a categoria `"Legado"` continua com o nome `"Legado"`

#### Scenario: Reenviar o próprio nome
- **GIVEN** que existe `"Financeiro"` e o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `PATCH /categories/<id de Financeiro>` com `Authorization: Bearer ADM1` e `{"name": "Financeiro"}`
- **THEN** a resposta tem status `200`

#### Scenario: Categoria inexistente
- **GIVEN** que o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `PATCH /categories/00000000-0000-4000-8000-000000000000` com `Authorization: Bearer ADM1` e `{"active": false}`
- **THEN** a resposta tem status `404`

#### Scenario: Corpo vazio ou inválido
- **GIVEN** que existe `"Financeiro"` e o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `PATCH /categories/<id de Financeiro>` com `Authorization: Bearer ADM1` e corpo `{}`, e em outras requisições com `{"name": "F"}` e com `{"active": "sim"}`
- **THEN** as três respostas têm status `400`
- **AND** a categoria `"Financeiro"` continua ativa e com o mesmo nome

#### Scenario: Outros papéis não alteram categorias
- **GIVEN** que existe `"Financeiro"` e `bia@teste.com` (`SUPPORT`) está autenticada com `B1`
- **WHEN** um cliente envia `PATCH /categories/<id de Financeiro>` com `Authorization: Bearer B1` e `{"active": false}`
- **THEN** a resposta tem status `403`
- **AND** `"Financeiro"` continua ativa

### Requirement: Categorias não são excluídas
O sistema MUST NOT oferecer exclusão de categorias: desativar (`active: false`) substitui a exclusão, e a categoria desativada continua existindo e visível ao `ADMIN`. Uma requisição `DELETE /categories/:id` MUST NOT remover nem alterar a categoria.

#### Scenario: Tentativa de exclusão
- **GIVEN** que existe `"Financeiro"` e o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `DELETE /categories/<id de Financeiro>` com `Authorization: Bearer ADM1`
- **THEN** a resposta tem status `404`
- **AND** `GET /categories` com `ADM1` continua retornando `"Financeiro"` com `active` igual a `true`
