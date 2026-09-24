# tickets Specification

## Purpose

Permite que clientes abram tickets de suporte e acompanhem os próprios tickets, que atendentes assumam e conduzam os tickets da fila e que o administrador atribua e altere qualquer ticket, com a visibilidade de cada ticket restrita por papel e por registro.

## Requirements

### Requirement: Abertura de ticket pelo cliente
O sistema SHALL expor a rota `POST /tickets`, restrita ao papel `CUSTOMER`, que recebe `title`, `description`, `priority` e `categoryId`, todos obrigatórios. `title` e `description` MUST ter os espaços nas extremidades removidos antes da validação e do armazenamento; `title` MUST ter de 5 a 120 caracteres e `description` de 10 a 5000. `priority` MUST ser um de `LOW`, `MEDIUM`, `HIGH` ou `URGENT`. `categoryId` MUST ser um UUID. Em caso de sucesso, a resposta MUST ter status `201` e o ticket criado MUST ter `status` `OPEN`, `customer` igual ao usuário do token, `assignee` nulo e `closedAt` nulo. Categoria inexistente ou inativa MUST resultar em `422` com a mesma mensagem nos dois casos, sem criar ticket. Campos inválidos ou ausentes e propriedades não declaradas no corpo — inclusive `customerId`, `status` e `assigneeId` — MUST resultar em `400` sem criar ticket. Usuários `SUPPORT` e `ADMIN` MUST receber `403`. Requisição sem token MUST receber `401`.

#### Scenario: Cliente abre ticket
- **GIVEN** que o cliente A (`ana@teste.com`, `CUSTOMER`) está autenticado com `TA` e existe a categoria ativa `"Financeiro"`
- **WHEN** um cliente envia `POST /tickets` com `Authorization: Bearer TA` e `{"title": "Cobrança duplicada", "description": "Fui cobrada duas vezes na fatura de março.", "priority": "HIGH", "categoryId": "<id de Financeiro>"}`
- **THEN** a resposta tem status `201`
- **AND** o corpo tem `title` igual a `"Cobrança duplicada"`, `status` igual a `"OPEN"`, `priority` igual a `"HIGH"`, `category.name` igual a `"Financeiro"`, `assignee` nulo e `closedAt` nulo
- **AND** `customer` é `{ "id": <id de A>, "name": "Ana", "role": "CUSTOMER" }`

#### Scenario: Espaços nas extremidades do título
- **GIVEN** que o cliente A está autenticado com `TA` e `"Financeiro"` está ativa
- **WHEN** um cliente envia `POST /tickets` com `title` igual a `"  Cobrança duplicada  "` e os demais campos válidos
- **THEN** a resposta tem status `201` com `title` igual a `"Cobrança duplicada"`

#### Scenario: Título curto demais
- **GIVEN** que o cliente A está autenticado com `TA` e `"Financeiro"` está ativa
- **WHEN** um cliente envia `POST /tickets` com `title` igual a `"Erro"` e os demais campos válidos
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica o campo `title`
- **AND** nenhum ticket é criado

#### Scenario: Limites de tamanho aceitos
- **GIVEN** que o cliente A está autenticado com `TA` e `"Financeiro"` está ativa
- **WHEN** um cliente envia `POST /tickets` com `title` de 5 caracteres e `description` de 10 caracteres e, em outra requisição, com `title` de 120 e `description` de 5000 caracteres
- **THEN** as duas respostas têm status `201`

#### Scenario: Tamanhos acima do limite
- **GIVEN** que o cliente A está autenticado com `TA` e `"Financeiro"` está ativa
- **WHEN** um cliente envia `POST /tickets` com `title` de 121 caracteres e, em outra requisição, com `description` de 5001 caracteres
- **THEN** as duas respostas têm status `400`, indicando respectivamente `title` e `description`
- **AND** nenhum ticket é criado

#### Scenario: Prioridade inválida ou campo ausente
- **GIVEN** que o cliente A está autenticado com `TA` e `"Financeiro"` está ativa
- **WHEN** um cliente envia `POST /tickets` com `priority` igual a `"CRITICAL"` e, em outra requisição, sem `description`
- **THEN** as duas respostas têm status `400`, indicando respectivamente `priority` e `description`

#### Scenario: Categoria inativa
- **GIVEN** que o cliente A está autenticado com `TA` e existe a categoria inativa `"Legado"`
- **WHEN** um cliente envia `POST /tickets` com `categoryId` igual ao id de `"Legado"` e os demais campos válidos
- **THEN** a resposta tem status `422`
- **AND** nenhum ticket é criado

#### Scenario: Categoria inexistente responde como inativa
- **GIVEN** que o cliente A está autenticado com `TA`
- **WHEN** um cliente envia `POST /tickets` com `categoryId` igual a `"00000000-0000-4000-8000-000000000000"` e, em outra requisição, com o id de `"Legado"` (inativa)
- **THEN** as duas respostas têm status `422` com a mesma mensagem de erro

#### Scenario: Campos controlados pelo sistema no corpo
- **GIVEN** que o cliente A está autenticado com `TA`, o cliente B (`bruno@teste.com`) e o atendente S1 (`bia@teste.com`, `SUPPORT`) existem e `"Financeiro"` está ativa
- **WHEN** um cliente envia `POST /tickets` com os campos válidos acrescidos de `"customerId": "<id de B>"` e, em outras requisições, de `"status": "CLOSED"` e de `"assigneeId": "<id de S1>"`
- **THEN** as três respostas têm status `400`, cada uma indicando a propriedade não permitida
- **AND** nenhum ticket é criado

#### Scenario: Atendente e administrador não abrem tickets
- **GIVEN** que o atendente S1 está autenticado com `TS1`, o administrador (`diego@teste.com`, `ADMIN`) com `TADM` e `"Financeiro"` está ativa
- **WHEN** um cliente envia `POST /tickets` com um corpo válido usando `TS1` e, em outra requisição, usando `TADM`
- **THEN** as duas respostas têm status `403`
- **AND** nenhum ticket é criado

#### Scenario: Abertura sem autenticação
- **WHEN** um cliente envia `POST /tickets` com um corpo válido e sem o cabeçalho `Authorization`
- **THEN** a resposta tem status `401`

### Requirement: Visibilidade de tickets por papel
O sistema SHALL considerar visível para um usuário: para `CUSTOMER`, somente os tickets em que ele é o cliente; para `SUPPORT`, os tickets com status `OPEN` e sem atendente e os tickets atribuídos a ele; para `ADMIN`, todos os tickets. Em toda rota que recebe `:id` de ticket (`GET /tickets/:id`, `PATCH /tickets/:id/assign`, `PATCH /tickets/:id/status`), um ticket inexistente ou invisível para o usuário MUST resultar em `404` com a mesma mensagem nos dois casos, MUST NOT resultar em `403`, MUST NOT incluir `title` nem `description` do ticket na resposta e MUST NOT alterar o ticket. `:id` que não seja um UUID válido MUST resultar em `400`.

#### Scenario: Cliente não vê ticket de outro cliente
- **GIVEN** que o ticket T (`"Cobrança duplicada"`) pertence ao cliente A e o cliente B está autenticado com `TB`
- **WHEN** um cliente envia `GET /tickets/<id de T>` com `Authorization: Bearer TB`
- **THEN** a resposta tem status `404`
- **AND** o corpo não contém `"Cobrança duplicada"` nem a descrição de T

#### Scenario: Ticket alheio e inexistente são indistinguíveis
- **GIVEN** que o ticket T pertence ao cliente A e o cliente B está autenticado com `TB`
- **WHEN** um cliente envia `GET /tickets/<id de T>` e, em outra requisição, `GET /tickets/00000000-0000-4000-8000-000000000000`, ambos com `TB`
- **THEN** as duas respostas têm status `404` e o mesmo corpo

#### Scenario: Atendente vê ticket da fila
- **GIVEN** que o ticket T está `OPEN` sem atendente e o atendente S1 está autenticado com `TS1`
- **WHEN** um cliente envia `GET /tickets/<id de T>` com `Authorization: Bearer TS1`
- **THEN** a resposta tem status `200`

#### Scenario: Atendente não vê ticket atribuído a outro atendente
- **GIVEN** que o ticket T está atribuído ao atendente S1 e o atendente S2 (`carla@teste.com`, `SUPPORT`) está autenticado com `TS2`
- **WHEN** um cliente envia `GET /tickets/<id de T>` com `Authorization: Bearer TS2`
- **THEN** a resposta tem status `404`

#### Scenario: Atendente perde a visibilidade ao ser substituído
- **GIVEN** que o ticket T estava atribuído ao atendente S1 e o administrador o atribuiu ao atendente S2
- **WHEN** um cliente envia `GET /tickets/<id de T>` com `Authorization: Bearer TS1`
- **THEN** a resposta tem status `404`

#### Scenario: Administrador vê qualquer ticket
- **GIVEN** que o ticket T pertence ao cliente A e está atribuído ao atendente S1, e o administrador está autenticado com `TADM`
- **WHEN** um cliente envia `GET /tickets/<id de T>` com `Authorization: Bearer TADM`
- **THEN** a resposta tem status `200`

#### Scenario: Alteração de status em ticket alheio
- **GIVEN** que o ticket T do cliente A está `OPEN` e o cliente B está autenticado com `TB`
- **WHEN** um cliente envia `PATCH /tickets/<id de T>/status` com `Authorization: Bearer TB` e `{"status": "CLOSED"}`
- **THEN** a resposta tem status `404`
- **AND** o ticket T continua `OPEN`

#### Scenario: Id inválido
- **GIVEN** que o cliente A está autenticado com `TA`
- **WHEN** um cliente envia `GET /tickets/abc` com `Authorization: Bearer TA`
- **THEN** a resposta tem status `400`

### Requirement: Listagem de tickets
O sistema SHALL expor a rota `GET /tickets`, acessível a qualquer usuário autenticado, que responde `200` com `{ data, page, limit, total }`, em que `data` contém somente tickets visíveis para o usuário, ordenados do mais recente ao mais antigo pela data de criação. A rota MUST aceitar os filtros opcionais `status` (um dos status de ticket) e `priority` (uma das prioridades), combinados entre si, e a paginação `page` (inteiro, padrão `1`, mínimo `1`) e `limit` (inteiro, padrão `20`, de `1` a `50`). `total` MUST ser a quantidade de tickets visíveis que atendem aos filtros, independente da página. Filtro ou parâmetro de paginação inválido MUST resultar em `400`. Requisição sem token MUST receber `401`.

#### Scenario: Cliente lista só os próprios tickets
- **GIVEN** que o cliente A tem os tickets `"Cobrança duplicada"` e `"Senha expirada"` e o cliente B tem o ticket `"Nota fiscal errada"`
- **AND** que o cliente A está autenticado com `TA`
- **WHEN** um cliente envia `GET /tickets` com `Authorization: Bearer TA`
- **THEN** a resposta tem status `200` com `page` `1`, `limit` `20` e `total` `2`
- **AND** `data` contém apenas os dois tickets do cliente A

#### Scenario: Ordem do mais recente ao mais antigo
- **GIVEN** que o cliente A abriu `"Senha expirada"` e depois `"Cobrança duplicada"`
- **WHEN** o cliente A envia `GET /tickets` com `TA`
- **THEN** o primeiro item de `data` é `"Cobrança duplicada"` e o segundo é `"Senha expirada"`

#### Scenario: Atendente lista a fila e os próprios tickets
- **GIVEN** que existem o ticket T1 `OPEN` sem atendente, o ticket T2 atribuído ao atendente S1, o ticket T3 atribuído ao atendente S2 e o ticket T4 `CLOSED` sem atendente
- **WHEN** o atendente S1 envia `GET /tickets` com `TS1`
- **THEN** `data` contém exatamente T1 e T2 e `total` é `2`

#### Scenario: Administrador lista todos
- **GIVEN** os tickets T1, T2, T3 e T4 do cenário anterior
- **WHEN** o administrador envia `GET /tickets` com `TADM`
- **THEN** `total` é `4`

#### Scenario: Filtros combinados com a visibilidade
- **GIVEN** que o cliente A tem um ticket `OPEN` `HIGH`, um ticket `OPEN` `LOW` e um ticket `CLOSED` `HIGH`, e o cliente B tem um ticket `OPEN` `HIGH`
- **WHEN** o cliente A envia `GET /tickets?status=OPEN&priority=HIGH` com `TA`
- **THEN** a resposta tem status `200` com `total` `1`
- **AND** `data` contém apenas o ticket `OPEN` `HIGH` do cliente A

#### Scenario: Total calculado sobre os visíveis filtrados
- **GIVEN** que o cliente A tem 3 tickets `OPEN` e o cliente B tem 5 tickets `OPEN`
- **WHEN** o cliente A envia `GET /tickets?status=OPEN&page=1&limit=2` com `TA`
- **THEN** `data` tem 2 itens e `total` é `3`
- **AND** `GET /tickets?status=OPEN&page=2&limit=2` retorna 1 item, distinto dos da primeira página

#### Scenario: Limite máximo
- **GIVEN** que o cliente A está autenticado com `TA`
- **WHEN** um cliente envia `GET /tickets?limit=50` e, em outra requisição, `GET /tickets?limit=51`
- **THEN** a primeira resposta tem status `200`
- **AND** a segunda tem status `400` indicando `limit`

#### Scenario: Filtro inválido
- **GIVEN** que o cliente A está autenticado com `TA`
- **WHEN** um cliente envia `GET /tickets?status=PENDING` e, em outra requisição, `GET /tickets?priority=CRITICAL`
- **THEN** as duas respostas têm status `400`, indicando respectivamente `status` e `priority`

#### Scenario: Listagem sem autenticação
- **WHEN** um cliente envia `GET /tickets` sem o cabeçalho `Authorization`
- **THEN** a resposta tem status `401`

### Requirement: Consulta de ticket por id
O sistema SHALL expor a rota `GET /tickets/:id`, acessível a qualquer usuário autenticado, que responde `200` com o ticket quando ele é visível para o usuário, e `404` caso contrário, conforme o requisito de visibilidade.

#### Scenario: Cliente consulta o próprio ticket
- **GIVEN** que o ticket T (`"Cobrança duplicada"`) pertence ao cliente A e o cliente A está autenticado com `TA`
- **WHEN** um cliente envia `GET /tickets/<id de T>` com `Authorization: Bearer TA`
- **THEN** a resposta tem status `200` com `id` igual ao de T e `title` igual a `"Cobrança duplicada"`

### Requirement: Formato do ticket nas respostas
Toda resposta que devolve um ticket (criação, consulta, listagem, atribuição e mudança de status) SHALL representá-lo com exatamente os campos `id`, `title`, `description`, `status`, `priority`, `category`, `customer`, `assignee`, `createdAt`, `updatedAt` e `closedAt`. `category` MUST conter exatamente `id` e `name`. `customer` e `assignee` (quando não nulo) MUST conter exatamente `id`, `name` e `role`, e MUST NOT conter `email`, senha nem hash de senha.

#### Scenario: Dados mínimos de cliente e atendente
- **GIVEN** que o ticket T do cliente A está atribuído ao atendente S1 e o administrador está autenticado com `TADM`
- **WHEN** um cliente envia `GET /tickets/<id de T>` com `Authorization: Bearer TADM`
- **THEN** `customer` contém exatamente `id`, `name` igual a `"Ana"` e `role` igual a `"CUSTOMER"`
- **AND** `assignee` contém exatamente `id`, `name` igual a `"Bia"` e `role` igual a `"SUPPORT"`
- **AND** o corpo não contém `email` nem `passwordHash` em nenhum nível

#### Scenario: Itens da listagem no mesmo formato
- **GIVEN** que o cliente A tem o ticket T e está autenticado com `TA`
- **WHEN** um cliente envia `GET /tickets` com `TA`
- **THEN** cada item de `data` contém exatamente os campos do ticket, com `customer` e `assignee` no formato reduzido

### Requirement: Atendente assume ticket da fila
O sistema SHALL expor a rota `PATCH /tickets/:id/assign`, restrita aos papéis `SUPPORT` e `ADMIN`. Para `SUPPORT`, a requisição MUST NOT ter `assigneeId` no corpo (`400`) e atribui o ticket ao próprio atendente: um ticket `OPEN` sem atendente MUST passar a ter `assignee` igual ao atendente e `status` `IN_PROGRESS`, com resposta `200` contendo o ticket atualizado. Ticket atribuído a outro atendente MUST resultar em `404`, por não ser visível. Ticket já atribuído ao próprio atendente, em qualquer status, MUST resultar em `422` sem alteração. Se o ticket for alterado por outra requisição entre a leitura e a gravação, a resposta MUST ser `409` sem alteração. Em duas requisições simultâneas de atendentes diferentes para o mesmo ticket, exatamente uma MUST receber `200`, a outra MUST receber `409` ou `404`, e o ticket MUST ficar com um único atendente. Usuário `CUSTOMER` MUST receber `403`.

#### Scenario: Atendente assume ticket aberto
- **GIVEN** que o ticket T está `OPEN` sem atendente e o atendente S1 está autenticado com `TS1`
- **WHEN** um cliente envia `PATCH /tickets/<id de T>/assign` com `Authorization: Bearer TS1` e sem corpo
- **THEN** a resposta tem status `200`
- **AND** `status` é `"IN_PROGRESS"` e `assignee` é `{ "id": <id de S1>, "name": "Bia", "role": "SUPPORT" }`

#### Scenario: Ticket já atribuído a outro atendente
- **GIVEN** que o ticket T foi assumido pelo atendente S1 e o atendente S2 está autenticado com `TS2`
- **WHEN** um cliente envia `PATCH /tickets/<id de T>/assign` com `Authorization: Bearer TS2`
- **THEN** a resposta tem status `404`
- **AND** o ticket T continua atribuído a S1

#### Scenario: Atendente reassume o próprio ticket
- **GIVEN** que o ticket T está `IN_PROGRESS` atribuído ao atendente S1
- **WHEN** o atendente S1 envia `PATCH /tickets/<id de T>/assign` com `TS1`
- **THEN** a resposta tem status `422`
- **AND** o ticket T continua `IN_PROGRESS` atribuído a S1

#### Scenario: Atendente envia assigneeId
- **GIVEN** que o ticket T está `OPEN` sem atendente e o atendente S1 está autenticado com `TS1`
- **WHEN** um cliente envia `PATCH /tickets/<id de T>/assign` com `TS1` e `{"assigneeId": "<id de S2>"}`
- **THEN** a resposta tem status `400`
- **AND** o ticket T continua `OPEN` sem atendente

#### Scenario: Atendentes assumem o mesmo ticket ao mesmo tempo
- **GIVEN** que o ticket T está `OPEN` sem atendente e os atendentes S1 e S2 estão autenticados com `TS1` e `TS2`
- **WHEN** as requisições `PATCH /tickets/<id de T>/assign` com `TS1` e com `TS2` são enviadas simultaneamente
- **THEN** exatamente uma resposta tem status `200`
- **AND** a outra tem status `409` ou `404`
- **AND** o ticket T está `IN_PROGRESS` com `assignee` igual ao atendente cuja resposta foi `200`

#### Scenario: Cliente não assume ticket
- **GIVEN** que o ticket T do cliente A está `OPEN` e o cliente A está autenticado com `TA`
- **WHEN** um cliente envia `PATCH /tickets/<id de T>/assign` com `Authorization: Bearer TA`
- **THEN** a resposta tem status `403`
- **AND** o ticket T continua `OPEN` sem atendente

### Requirement: Administrador atribui ticket a um atendente
Na rota `PATCH /tickets/:id/assign`, o `ADMIN` SHALL informar `assigneeId` (UUID, obrigatório para o `ADMIN`; ausente ou inválido → `400`) e MUST poder atribuir tickets com status `OPEN`, `IN_PROGRESS` ou `WAITING_CUSTOMER` a um usuário com papel `SUPPORT`, inclusive substituindo o atendente atual, com resposta `200` contendo o ticket atualizado. Ticket `OPEN` MUST passar a `IN_PROGRESS`; nos demais status permitidos o status MUST ser mantido. `assigneeId` de usuário inexistente ou que não tenha papel `SUPPORT` MUST resultar em `422`. Ticket com status `RESOLVED` ou `CLOSED` MUST resultar em `422`. Nos casos de `422`, o ticket MUST NOT ser alterado. Ticket inexistente MUST resultar em `404`. Se o ticket for alterado por outra requisição entre a leitura e a gravação, a resposta MUST ser `409`.

#### Scenario: Administrador atribui ticket aberto
- **GIVEN** que o ticket T está `OPEN` sem atendente e o administrador está autenticado com `TADM`
- **WHEN** um cliente envia `PATCH /tickets/<id de T>/assign` com `Authorization: Bearer TADM` e `{"assigneeId": "<id de S1>"}`
- **THEN** a resposta tem status `200`
- **AND** `status` é `"IN_PROGRESS"` e `assignee.id` é o id de S1

#### Scenario: Administrador substitui o atendente
- **GIVEN** que o ticket T está `WAITING_CUSTOMER` atribuído ao atendente S1
- **WHEN** o administrador envia `PATCH /tickets/<id de T>/assign` com `TADM` e `{"assigneeId": "<id de S2>"}`
- **THEN** a resposta tem status `200`
- **AND** `status` continua `"WAITING_CUSTOMER"` e `assignee.id` é o id de S2

#### Scenario: Destinatário não é atendente
- **GIVEN** que o ticket T está `OPEN` sem atendente
- **WHEN** o administrador envia `PATCH /tickets/<id de T>/assign` com `TADM` e `{"assigneeId": "<id do cliente B>"}` e, em outra requisição, com o id de um usuário inexistente
- **THEN** as duas respostas têm status `422`
- **AND** o ticket T continua `OPEN` sem atendente

#### Scenario: Ticket fechado não aceita atribuição
- **GIVEN** que o ticket T está `CLOSED`
- **WHEN** o administrador envia `PATCH /tickets/<id de T>/assign` com `TADM` e `{"assigneeId": "<id de S1>"}`
- **THEN** a resposta tem status `422`
- **AND** o ticket T continua `CLOSED` e sem alteração de atendente

#### Scenario: Ticket resolvido não aceita atribuição
- **GIVEN** que o ticket T está `RESOLVED` atribuído ao atendente S1
- **WHEN** o administrador envia `PATCH /tickets/<id de T>/assign` com `TADM` e `{"assigneeId": "<id de S2>"}`
- **THEN** a resposta tem status `422`
- **AND** o ticket T continua atribuído a S1

#### Scenario: Administrador sem assigneeId
- **GIVEN** que o ticket T está `OPEN` sem atendente
- **WHEN** o administrador envia `PATCH /tickets/<id de T>/assign` com `TADM` sem corpo e, em outra requisição, com `{"assigneeId": "abc"}`
- **THEN** as duas respostas têm status `400` indicando `assigneeId`

### Requirement: Mudança de status do ticket
O sistema SHALL expor a rota `PATCH /tickets/:id/status`, acessível a qualquer usuário autenticado, que recebe `status` e responde `200` com o ticket atualizado somente para as transições abaixo, feitas pelos atores indicados — "cliente dono" é o `CUSTOMER` que abriu o ticket e "atendente atribuído" é o `SUPPORT` que é o `assignee` do ticket:

| De | Para | Quem pode |
|---|---|---|
| `IN_PROGRESS` | `WAITING_CUSTOMER` | atendente atribuído, `ADMIN` |
| `IN_PROGRESS` | `RESOLVED` | atendente atribuído, `ADMIN` |
| `WAITING_CUSTOMER` | `RESOLVED` | atendente atribuído, `ADMIN` |
| `RESOLVED` | `IN_PROGRESS` | cliente dono |
| `RESOLVED` | `CLOSED` | cliente dono, `ADMIN` |
| `OPEN` | `CLOSED` | cliente dono, `ADMIN` |

Qualquer outra combinação de status atual, status novo e ator MUST resultar em `422` sem alterar o ticket, inclusive status novo igual ao atual, `OPEN → IN_PROGRESS` (que só ocorre pela atribuição) e qualquer alteração de ticket `CLOSED`. A transição para `CLOSED` MUST preencher `closedAt` com o instante da alteração; as demais MUST manter `closedAt` nulo e o atendente atual. `status` ausente ou fora dos valores `OPEN`, `IN_PROGRESS`, `WAITING_CUSTOMER`, `RESOLVED` e `CLOSED` MUST resultar em `400`. Ticket invisível MUST resultar em `404`, conforme o requisito de visibilidade. Se o ticket for alterado por outra requisição entre a leitura e a gravação, a resposta MUST ser `409` sem alteração.

#### Scenario: Atendente pede retorno do cliente
- **GIVEN** que o ticket T está `IN_PROGRESS` atribuído ao atendente S1
- **WHEN** o atendente S1 envia `PATCH /tickets/<id de T>/status` com `TS1` e `{"status": "WAITING_CUSTOMER"}`
- **THEN** a resposta tem status `200` com `status` igual a `"WAITING_CUSTOMER"`

#### Scenario: Atendente resolve ticket em andamento
- **GIVEN** que o ticket T está `IN_PROGRESS` atribuído ao atendente S1
- **WHEN** o atendente S1 envia `PATCH /tickets/<id de T>/status` com `TS1` e `{"status": "RESOLVED"}`
- **THEN** a resposta tem status `200` com `status` igual a `"RESOLVED"` e `closedAt` nulo

#### Scenario: Atendente resolve ticket aguardando o cliente
- **GIVEN** que o ticket T está `WAITING_CUSTOMER` atribuído ao atendente S1
- **WHEN** o atendente S1 envia `PATCH /tickets/<id de T>/status` com `TS1` e `{"status": "RESOLVED"}`
- **THEN** a resposta tem status `200` com `status` igual a `"RESOLVED"`

#### Scenario: Administrador altera ticket de qualquer atendente
- **GIVEN** que o ticket T está `IN_PROGRESS` atribuído ao atendente S1
- **WHEN** o administrador envia `PATCH /tickets/<id de T>/status` com `TADM` e `{"status": "WAITING_CUSTOMER"}`
- **THEN** a resposta tem status `200` com `status` igual a `"WAITING_CUSTOMER"`

#### Scenario: Cliente reabre ticket resolvido
- **GIVEN** que o ticket T do cliente A está `RESOLVED` atribuído ao atendente S1
- **WHEN** o cliente A envia `PATCH /tickets/<id de T>/status` com `TA` e `{"status": "IN_PROGRESS"}`
- **THEN** a resposta tem status `200` com `status` igual a `"IN_PROGRESS"`
- **AND** `assignee` continua sendo S1

#### Scenario: Cliente fecha ticket resolvido
- **GIVEN** que o ticket T do cliente A está `RESOLVED`
- **WHEN** o cliente A envia `PATCH /tickets/<id de T>/status` com `TA` e `{"status": "CLOSED"}`
- **THEN** a resposta tem status `200` com `status` igual a `"CLOSED"`
- **AND** `closedAt` está preenchido com o instante da alteração

#### Scenario: Cliente cancela ticket aberto
- **GIVEN** que o ticket T (`"Cobrança duplicada"`) do cliente A está `OPEN` sem atendente
- **WHEN** o cliente A envia `PATCH /tickets/<id de T>/status` com `TA` e `{"status": "CLOSED"}`
- **THEN** a resposta tem status `200` com `status` igual a `"CLOSED"` e `closedAt` preenchido

#### Scenario: Administrador fecha ticket
- **GIVEN** que o ticket T está `RESOLVED` e, em outro caso, o ticket T' está `OPEN`
- **WHEN** o administrador envia `PATCH /tickets/<id>/status` com `TADM` e `{"status": "CLOSED"}` para cada um
- **THEN** as duas respostas têm status `200` com `status` igual a `"CLOSED"` e `closedAt` preenchido

#### Scenario: Abertura para andamento pela rota de status
- **GIVEN** que o ticket T está `OPEN` sem atendente
- **WHEN** o administrador envia `PATCH /tickets/<id de T>/status` com `TADM` e `{"status": "IN_PROGRESS"}`
- **THEN** a resposta tem status `422`
- **AND** o ticket T continua `OPEN` sem atendente

#### Scenario: Status igual ao atual
- **GIVEN** que o ticket T está `IN_PROGRESS` atribuído ao atendente S1
- **WHEN** o atendente S1 envia `PATCH /tickets/<id de T>/status` com `TS1` e `{"status": "IN_PROGRESS"}`
- **THEN** a resposta tem status `422`

#### Scenario: Ticket fechado não muda de status
- **GIVEN** que o ticket T do cliente A está `CLOSED`
- **WHEN** o cliente A envia `{"status": "IN_PROGRESS"}` e, em outra requisição, o administrador envia `{"status": "RESOLVED"}` para `PATCH /tickets/<id de T>/status`
- **THEN** as duas respostas têm status `422`
- **AND** o ticket T continua `CLOSED` com o mesmo `closedAt`

#### Scenario: Cliente não resolve o próprio ticket
- **GIVEN** que o ticket T do cliente A está `IN_PROGRESS`
- **WHEN** o cliente A envia `PATCH /tickets/<id de T>/status` com `TA` e `{"status": "RESOLVED"}`
- **THEN** a resposta tem status `422`
- **AND** o ticket T continua `IN_PROGRESS`

#### Scenario: Atendente não fecha nem reabre ticket
- **GIVEN** que o ticket T está `RESOLVED` atribuído ao atendente S1
- **WHEN** o atendente S1 envia `{"status": "CLOSED"}` e, em outra requisição, `{"status": "IN_PROGRESS"}` para `PATCH /tickets/<id de T>/status`
- **THEN** as duas respostas têm status `422`
- **AND** o ticket T continua `RESOLVED`

#### Scenario: Atendente não altera ticket da fila
- **GIVEN** que o ticket T está `OPEN` sem atendente, visível para o atendente S1
- **WHEN** o atendente S1 envia `PATCH /tickets/<id de T>/status` com `TS1` e `{"status": "CLOSED"}`
- **THEN** a resposta tem status `422`
- **AND** o ticket T continua `OPEN`

#### Scenario: Administrador não reabre ticket
- **GIVEN** que o ticket T está `RESOLVED`
- **WHEN** o administrador envia `PATCH /tickets/<id de T>/status` com `TADM` e `{"status": "IN_PROGRESS"}`
- **THEN** a resposta tem status `422`

#### Scenario: Status inexistente
- **GIVEN** que o ticket T do cliente A está `OPEN`
- **WHEN** o cliente A envia `PATCH /tickets/<id de T>/status` com `TA` e `{"status": "CANCELED"}` e, em outra requisição, com corpo `{}`
- **THEN** as duas respostas têm status `400` indicando `status`
- **AND** o ticket T continua `OPEN`

#### Scenario: Ticket de outro cliente
- **GIVEN** que o ticket T do cliente A está `RESOLVED` e o cliente B está autenticado com `TB`
- **WHEN** o cliente B envia `PATCH /tickets/<id de T>/status` com `TB` e `{"status": "CLOSED"}`
- **THEN** a resposta tem status `404`
- **AND** o ticket T continua `RESOLVED` e `closedAt` nulo
