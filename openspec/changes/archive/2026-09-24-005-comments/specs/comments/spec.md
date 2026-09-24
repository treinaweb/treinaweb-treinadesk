# Spec Delta

## Purpose

Permite que o cliente dono, o atendente atribuído e o administrador conversem dentro de um ticket por meio de comentários públicos, e que a equipe registre notas internas que o cliente nunca recebe.

## ADDED Requirements

### Requirement: Criação de comentário em ticket
O sistema SHALL expor a rota `POST /tickets/:id/comments`, disponível para qualquer usuário autenticado, que recebe `body` (obrigatório) e `isInternal` (opcional, booleano). `body` MUST ter os espaços nas extremidades removidos antes da validação e do armazenamento e MUST ter de 1 a 5000 caracteres depois disso. Podem comentar o `CUSTOMER` dono do ticket, o `SUPPORT` atribuído ao ticket e qualquer `ADMIN`. Em caso de sucesso, a resposta MUST ter status `201` e o corpo MUST conter `id`, `body`, `isInternal`, `createdAt` e `author`. Ticket inexistente ou invisível para o usuário, conforme a visibilidade de tickets por papel, MUST resultar em `404` com a mesma mensagem nos dois casos, MUST NOT resultar em `403` e MUST NOT criar comentário. `SUPPORT` com o ticket visível mas não atribuído a ele MUST receber `422` sem criar comentário. `body` ausente, vazio, só com espaços, com mais de 5000 caracteres ou que não seja texto, `isInternal` que não seja booleano e propriedades não declaradas no corpo MUST resultar em `400` sem criar comentário. `:id` que não seja um UUID válido MUST resultar em `400`. Requisição sem token MUST receber `401`.

#### Scenario: Cliente dono comenta no próprio ticket
- **GIVEN** que o ticket T pertence ao cliente A (`ana@teste.com`, `CUSTOMER`), está `IN_PROGRESS` e atribuído ao atendente S1 (`bia@teste.com`, `SUPPORT`), e A está autenticado com `TA`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `Authorization: Bearer TA` e `{"body": "Segue o comprovante"}`
- **THEN** a resposta tem status `201`
- **AND** o corpo tem `id`, `body` igual a `"Segue o comprovante"`, `isInternal` igual a `false`, `createdAt` e `author` igual a `{ "id": <id de A>, "name": "Ana", "role": "CUSTOMER" }`

#### Scenario: Atendente atribuído comenta
- **GIVEN** que o ticket T do cliente A está `IN_PROGRESS` e atribuído a S1, autenticado com `TS1`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `Authorization: Bearer TS1` e `{"body": "Estamos verificando"}`
- **THEN** a resposta tem status `201` com `body` igual a `"Estamos verificando"`, `isInternal` igual a `false` e `author.role` igual a `"SUPPORT"`

#### Scenario: Administrador comenta em qualquer ticket
- **GIVEN** que o ticket T do cliente A está `IN_PROGRESS` e atribuído a S1, e o administrador (`diego@teste.com`, `ADMIN`) está autenticado com `TADM`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `Authorization: Bearer TADM` e `{"body": "Estamos verificando"}`
- **THEN** a resposta tem status `201` com `author.role` igual a `"ADMIN"`

#### Scenario: Espaços nas extremidades do comentário
- **GIVEN** que o ticket T do cliente A está `IN_PROGRESS` e A está autenticado com `TA`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `{"body": "  Segue o comprovante  "}`
- **THEN** a resposta tem status `201` com `body` igual a `"Segue o comprovante"`

#### Scenario: Cliente comenta no ticket de outro cliente
- **GIVEN** que o ticket T pertence ao cliente A e o cliente B (`bruno@teste.com`, `CUSTOMER`) está autenticado com `TB`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `Authorization: Bearer TB` e `{"body": "Segue o comprovante"}`
- **THEN** a resposta tem status `404` com a mesma mensagem de um ticket inexistente
- **AND** nenhum comentário é criado em T

#### Scenario: Atendente comenta em ticket de outro atendente
- **GIVEN** que o ticket T do cliente A está `IN_PROGRESS` e atribuído a S1, e o atendente S2 (`carla@teste.com`, `SUPPORT`) está autenticado com `TS2`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `Authorization: Bearer TS2` e `{"body": "Estamos verificando"}`
- **THEN** a resposta tem status `404`
- **AND** nenhum comentário é criado em T

#### Scenario: Atendente comenta em ticket da fila sem assumi-lo
- **GIVEN** que o ticket T do cliente A está `OPEN` e sem atendente (visível para S1 na fila), e S1 está autenticado com `TS1`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `Authorization: Bearer TS1` e `{"body": "Estamos verificando"}`
- **THEN** a resposta tem status `422`
- **AND** nenhum comentário é criado em T

#### Scenario: Ticket inexistente
- **GIVEN** que o cliente A está autenticado com `TA`
- **WHEN** um cliente envia `POST /tickets/00000000-0000-4000-8000-000000000000/comments` com `{"body": "Segue o comprovante"}`
- **THEN** a resposta tem status `404`

#### Scenario: Comentário só com espaços
- **GIVEN** que o ticket T do cliente A está `IN_PROGRESS` e A está autenticado com `TA`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `{"body": "     "}`
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica o campo `body`
- **AND** nenhum comentário é criado em T

#### Scenario: Limites de tamanho do comentário
- **GIVEN** que o ticket T do cliente A está `IN_PROGRESS` e A está autenticado com `TA`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `body` de 1 caractere, com `body` de 5000 caracteres e, em outra requisição, com `body` de 5001 caracteres
- **THEN** as duas primeiras respostas têm status `201`
- **AND** a terceira tem status `400`, indicando o campo `body`, e não cria comentário

#### Scenario: Corpo com campo inválido ou não declarado
- **GIVEN** que o ticket T do cliente A está `IN_PROGRESS` e A está autenticado com `TA`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` sem `body`, em outra requisição com `{"body": "Segue o comprovante", "isInternal": "sim"}` e, em outra, com `{"body": "Segue o comprovante", "authorId": "<id de B>"}`
- **THEN** as três respostas têm status `400`, indicando respectivamente `body`, `isInternal` e a propriedade não permitida
- **AND** nenhum comentário é criado em T

#### Scenario: Id de ticket malformado
- **GIVEN** que o cliente A está autenticado com `TA`
- **WHEN** um cliente envia `POST /tickets/abc/comments` com `{"body": "Segue o comprovante"}`
- **THEN** a resposta tem status `400`

#### Scenario: Comentário sem autenticação
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `{"body": "Segue o comprovante"}` e sem o cabeçalho `Authorization`
- **THEN** a resposta tem status `401`

### Requirement: Notas internas
O sistema SHALL tratar como nota interna o comentário criado com `isInternal` igual a `true`. Somente `SUPPORT` e `ADMIN`, nas condições em que podem comentar, MUST poder criar notas internas. `CUSTOMER` que envie `isInternal` igual a `true` em um ticket visível para ele MUST receber `403` sem criar comentário. Comentário criado sem `isInternal` ou com `isInternal` igual a `false` MUST ser público (`isInternal` igual a `false` na resposta).

#### Scenario: Atendente atribuído cria nota interna
- **GIVEN** que o ticket T do cliente A está `IN_PROGRESS` e atribuído a S1, autenticado com `TS1`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `Authorization: Bearer TS1` e `{"body": "Cliente já pediu estorno antes", "isInternal": true}`
- **THEN** a resposta tem status `201` com `isInternal` igual a `true` e `body` igual a `"Cliente já pediu estorno antes"`

#### Scenario: Administrador cria nota interna
- **GIVEN** que o ticket T do cliente A está `IN_PROGRESS` e atribuído a S1, e o administrador está autenticado com `TADM`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `Authorization: Bearer TADM` e `{"body": "Cliente já pediu estorno antes", "isInternal": true}`
- **THEN** a resposta tem status `201` com `isInternal` igual a `true`

#### Scenario: Cliente tenta criar nota interna
- **GIVEN** que o ticket T do cliente A está `IN_PROGRESS` e A está autenticado com `TA`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `Authorization: Bearer TA` e `{"body": "Segue o comprovante", "isInternal": true}`
- **THEN** a resposta tem status `403`
- **AND** nenhum comentário é criado em T

#### Scenario: Comentário sem isInternal é público
- **GIVEN** que o ticket T do cliente A está `IN_PROGRESS` e atribuído a S1, autenticado com `TS1`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `Authorization: Bearer TS1` e `{"body": "Estamos verificando"}`
- **THEN** a resposta tem status `201` com `isInternal` igual a `false`
- **AND** o comentário aparece para A em `GET /tickets/<id de T>/comments`

### Requirement: Listagem de comentários do ticket
O sistema SHALL expor a rota `GET /tickets/:id/comments`, disponível para qualquer usuário autenticado que possa ver o ticket, que retorna os comentários do ticket em ordem de criação (do mais antigo ao mais recente), no formato `{ data, page, limit, total }`. `page` MUST ter padrão `1` e mínimo `1`; `limit` MUST ter padrão `20`, mínimo `1` e máximo `100`. Para `CUSTOMER`, a resposta MUST NOT conter notas internas — nem o item, nem o texto delas em qualquer parte do corpo — e `total` MUST contar apenas os comentários públicos. Para `SUPPORT` com o ticket visível e para `ADMIN`, a resposta MUST conter comentários públicos e notas internas, e `total` MUST contar todos. Cada item MUST ter `id`, `body`, `isInternal`, `createdAt` e `author`. Ticket inexistente ou invisível MUST resultar em `404`, sem distinguir os casos. Parâmetros de paginação inválidos, parâmetros não declarados e `:id` que não seja UUID MUST resultar em `400`. Requisição sem token MUST receber `401`.

#### Scenario: Comentários em ordem de criação
- **GIVEN** que no ticket T do cliente A foram criados, nesta ordem, "Segue o comprovante" por A, "Estamos verificando" por S1 e a nota interna "Cliente já pediu estorno antes" por S1
- **WHEN** um cliente envia `GET /tickets/<id de T>/comments` com `Authorization: Bearer TS1`
- **THEN** a resposta tem status `200` com `page` igual a `1`, `limit` igual a `20` e `total` igual a `3`
- **AND** `data` traz, nesta ordem, "Segue o comprovante", "Estamos verificando" e "Cliente já pediu estorno antes" (esta com `isInternal` igual a `true`)

#### Scenario: Cliente não recebe notas internas
- **GIVEN** os três comentários do cenário anterior no ticket T do cliente A
- **WHEN** um cliente envia `GET /tickets/<id de T>/comments` com `Authorization: Bearer TA`
- **THEN** a resposta tem status `200` com `total` igual a `2`
- **AND** `data` traz apenas "Segue o comprovante" e "Estamos verificando", ambos com `isInternal` igual a `false`
- **AND** o corpo da resposta não contém o texto `"estorno"` em nenhuma parte

#### Scenario: Administrador vê notas internas
- **GIVEN** os três comentários do primeiro cenário no ticket T do cliente A
- **WHEN** um cliente envia `GET /tickets/<id de T>/comments` com `Authorization: Bearer TADM`
- **THEN** a resposta tem status `200` com `total` igual a `3`, incluindo a nota interna "Cliente já pediu estorno antes"

#### Scenario: Paginação dos comentários
- **GIVEN** os três comentários do primeiro cenário no ticket T do cliente A
- **WHEN** um cliente envia `GET /tickets/<id de T>/comments?page=2&limit=2` com `Authorization: Bearer TS1`
- **THEN** a resposta tem status `200` com `page` igual a `2`, `limit` igual a `2` e `total` igual a `3`
- **AND** `data` traz apenas "Cliente já pediu estorno antes"

#### Scenario: Paginação do cliente sem notas internas
- **GIVEN** os três comentários do primeiro cenário no ticket T do cliente A
- **WHEN** um cliente envia `GET /tickets/<id de T>/comments?page=2&limit=1` com `Authorization: Bearer TA`
- **THEN** a resposta tem status `200` com `total` igual a `2`
- **AND** `data` traz apenas "Estamos verificando"

#### Scenario: Limite máximo de itens por página
- **GIVEN** que o cliente A está autenticado com `TA` e é dono do ticket T
- **WHEN** um cliente envia `GET /tickets/<id de T>/comments?limit=100` e, em outra requisição, `GET /tickets/<id de T>/comments?limit=101`
- **THEN** a primeira resposta tem status `200`
- **AND** a segunda tem status `400`

#### Scenario: Listagem de ticket invisível
- **GIVEN** que o ticket T pertence ao cliente A e está atribuído a S1, e B e S2 estão autenticados com `TB` e `TS2`
- **WHEN** um cliente envia `GET /tickets/<id de T>/comments` com `TB` e, em outra requisição, com `TS2`
- **THEN** as duas respostas têm status `404`
- **AND** nenhuma delas contém o texto de comentários de T

#### Scenario: Listagem sem autenticação
- **WHEN** um cliente envia `GET /tickets/<id de T>/comments` sem o cabeçalho `Authorization`
- **THEN** a resposta tem status `401`

### Requirement: Retomada do atendimento pelo comentário do cliente
Quando o `CUSTOMER` dono comentar em um ticket com status `WAITING_CUSTOMER`, o sistema SHALL mudar o status do ticket para `IN_PROGRESS` na mesma operação que grava o comentário: ou as duas alterações acontecem, ou nenhuma. O atendente atribuído MUST ser mantido. Comentários e notas internas de `SUPPORT` e `ADMIN` MUST NOT alterar o status do ticket. Comentário do cliente dono em ticket com qualquer outro status MUST NOT alterar o status. Se o status do ticket mudar entre a leitura e a gravação de modo que a retomada não possa ser aplicada, a resposta MUST ter status `409` e nenhum comentário MUST ser criado.

#### Scenario: Cliente responde ticket aguardando cliente
- **GIVEN** que o ticket T do cliente A está `WAITING_CUSTOMER` e atribuído a S1, e A está autenticado com `TA`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `Authorization: Bearer TA` e `{"body": "Segue o comprovante"}`
- **THEN** a resposta tem status `201`
- **AND** `GET /tickets/<id de T>` passa a retornar `status` igual a `"IN_PROGRESS"` e `assignee.id` igual ao id de S1

#### Scenario: Atendente comenta em ticket aguardando cliente
- **GIVEN** que o ticket T do cliente A está `WAITING_CUSTOMER` e atribuído a S1, autenticado com `TS1`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `Authorization: Bearer TS1` e `{"body": "Estamos verificando"}` e, em outra requisição, com `{"body": "Cliente já pediu estorno antes", "isInternal": true}`
- **THEN** as duas respostas têm status `201`
- **AND** T continua com `status` igual a `"WAITING_CUSTOMER"`

#### Scenario: Administrador comenta em ticket aguardando cliente
- **GIVEN** que o ticket T do cliente A está `WAITING_CUSTOMER` e atribuído a S1, e o administrador está autenticado com `TADM`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `Authorization: Bearer TADM` e `{"body": "Estamos verificando"}`
- **THEN** a resposta tem status `201`
- **AND** T continua com `status` igual a `"WAITING_CUSTOMER"`

#### Scenario: Comentário do cliente em ticket resolvido não reabre
- **GIVEN** que o ticket T do cliente A está `RESOLVED` e atribuído a S1, e A está autenticado com `TA`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `Authorization: Bearer TA` e `{"body": "Segue o comprovante"}`
- **THEN** a resposta tem status `201`
- **AND** T continua com `status` igual a `"RESOLVED"`

### Requirement: Ticket fechado não aceita comentários
O sistema SHALL recusar comentários e notas internas em ticket com status `CLOSED`, para qualquer papel, com `422`, sem criar comentário e sem alterar o ticket. A listagem dos comentários de um ticket `CLOSED` visível MUST continuar disponível.

#### Scenario: Cliente comenta em ticket fechado
- **GIVEN** que o ticket T do cliente A está `CLOSED` e A está autenticado com `TA`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `Authorization: Bearer TA` e `{"body": "Segue o comprovante"}`
- **THEN** a resposta tem status `422`
- **AND** nenhum comentário é criado em T

#### Scenario: Atendente atribuído e administrador comentam em ticket fechado
- **GIVEN** que o ticket T do cliente A está `CLOSED` e atribuído a S1, e S1 e o administrador estão autenticados com `TS1` e `TADM`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `{"body": "Estamos verificando"}` usando `TS1` e, em outra requisição, `{"body": "Cliente já pediu estorno antes", "isInternal": true}` usando `TADM`
- **THEN** as duas respostas têm status `422`
- **AND** nenhum comentário é criado em T e T continua `CLOSED`

#### Scenario: Comentários de ticket fechado continuam legíveis
- **GIVEN** que o ticket T do cliente A recebeu "Segue o comprovante" antes de ser fechado e está `CLOSED`
- **WHEN** um cliente envia `GET /tickets/<id de T>/comments` com `Authorization: Bearer TA`
- **THEN** a resposta tem status `200` e `data` traz "Segue o comprovante"

### Requirement: Autor do comentário sem dados sensíveis
Em toda resposta que contém comentários (criação e listagem), o campo `author` SHALL conter exatamente `id`, `name` e `role` do usuário que criou o comentário. As respostas MUST NOT conter `email`, `passwordHash` nem qualquer outro dado de usuário em nenhum nível.

#### Scenario: Autor na criação
- **GIVEN** que o ticket T do cliente A está `IN_PROGRESS` e atribuído a S1, autenticado com `TS1`
- **WHEN** um cliente envia `POST /tickets/<id de T>/comments` com `{"body": "Estamos verificando"}`
- **THEN** `author` é exatamente `{ "id": <id de S1>, "name": "Bia", "role": "SUPPORT" }`
- **AND** o corpo da resposta não contém as chaves `email` nem `passwordHash`

#### Scenario: Autor na listagem
- **GIVEN** que o ticket T do cliente A tem comentários de A e de S1
- **WHEN** um cliente envia `GET /tickets/<id de T>/comments` com `Authorization: Bearer TA`
- **THEN** cada item de `data` tem `author` com exatamente as chaves `id`, `name` e `role`
- **AND** o corpo da resposta não contém `bia@teste.com`, `ana@teste.com` nem as chaves `email` e `passwordHash`
