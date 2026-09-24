# user-management Specification

## Purpose

Permite que clientes se cadastrem publicamente no TreinaDesk e garante a existência do administrador inicial, com e-mails únicos e senhas protegidas, servindo de base de usuários para os demais módulos.

## Requirements

### Requirement: Cadastro público de cliente
O sistema SHALL expor a rota `POST /users`, acessível sem autenticação, que recebe `name`, `email` e `password` e cria um usuário. O usuário criado MUST ter sempre o papel `CUSTOMER`. Em caso de sucesso, a resposta MUST ter status `201` e corpo contendo exatamente `id`, `name`, `email`, `role` e `createdAt`.

#### Scenario: Cadastro com dados válidos
- **GIVEN** que não existe usuário com o e-mail `ana@teste.com`
- **WHEN** um cliente sem token envia `POST /users` com `{"name": "Ana", "email": "ana@teste.com", "password": "senhaSegura123"}`
- **THEN** a resposta tem status `201`
- **AND** o corpo contém `id`, `name` igual a `"Ana"`, `email` igual a `"ana@teste.com"`, `role` igual a `"CUSTOMER"` e `createdAt`
- **AND** o corpo não contém nenhuma outra propriedade

#### Scenario: Usuário criado é persistido
- **GIVEN** que um cadastro foi concluído com status `201` para `ana@teste.com`
- **WHEN** um novo `POST /users` é enviado com o mesmo e-mail
- **THEN** a resposta tem status `409`, confirmando que o primeiro usuário foi gravado

### Requirement: Papéis de usuário
O sistema SHALL reconhecer exatamente os papéis `CUSTOMER`, `SUPPORT` e `ADMIN`. O cadastro público MUST NOT permitir escolher o papel.

#### Scenario: Tentativa de definir o papel no cadastro
- **WHEN** um cliente envia `POST /users` com `{"name": "Ana", "email": "ana@teste.com", "password": "senhaSegura123", "role": "ADMIN"}`
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica a propriedade `role`
- **AND** nenhum usuário é criado

### Requirement: Validação dos dados de cadastro
O sistema MUST validar o corpo de `POST /users` antes de criar o usuário: `name` obrigatório, texto de 2 a 100 caracteres; `email` obrigatório, e-mail válido com no máximo 200 caracteres; `password` obrigatório, texto de 8 a 128 caracteres. Dados inválidos MUST resultar em status `400`, com mensagem de erro que identifica cada campo inválido, e nenhum usuário MUST ser criado.

#### Scenario: Nome curto demais
- **WHEN** um cliente envia `POST /users` com `name` igual a `"A"` e demais campos válidos
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica o campo `name`

#### Scenario: Nome longo demais
- **WHEN** um cliente envia `POST /users` com `name` de 101 caracteres e demais campos válidos
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica o campo `name`

#### Scenario: E-mail inválido
- **WHEN** um cliente envia `POST /users` com `email` igual a `"nao-e-email"` e demais campos válidos
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica o campo `email`

#### Scenario: E-mail longo demais
- **WHEN** um cliente envia `POST /users` com um `email` válido de 201 caracteres e demais campos válidos
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica o campo `email`

#### Scenario: Senha curta demais
- **WHEN** um cliente envia `POST /users` com `password` de 7 caracteres e demais campos válidos
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica o campo `password`

#### Scenario: Senha longa demais
- **WHEN** um cliente envia `POST /users` com `password` de 129 caracteres e demais campos válidos
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica o campo `password`

#### Scenario: Campos obrigatórios ausentes
- **WHEN** um cliente envia `POST /users` com corpo `{}`
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica os campos `name`, `email` e `password`

#### Scenario: Limites aceitos
- **WHEN** um cliente envia `POST /users` com `name` de 2 caracteres, `email` válido de 200 caracteres e `password` de 128 caracteres
- **THEN** a resposta tem status `201`

### Requirement: Rejeição de propriedades não declaradas
O sistema MUST rejeitar com status `400` qualquer requisição a `POST /users` cujo corpo contenha propriedades além de `name`, `email` e `password`, indicando a propriedade não permitida, e MUST NOT criar o usuário.

#### Scenario: Propriedade extra no corpo
- **WHEN** um cliente envia `POST /users` com dados válidos e a propriedade adicional `"isVip": true`
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica a propriedade `isVip`
- **AND** um `POST /users` posterior com os mesmos dados sem `isVip` retorna `201`

### Requirement: E-mail normalizado e único
O sistema MUST normalizar o e-mail removendo espaços nas extremidades e convertendo para minúsculas antes de verificar unicidade e de armazená-lo. Não SHALL existir dois usuários com o mesmo e-mail normalizado; um cadastro com e-mail já existente MUST retornar status `409`.

#### Scenario: E-mail normalizado na resposta
- **WHEN** um cliente envia `POST /users` com `email` igual a `"  Ana@Teste.COM  "` e demais campos válidos
- **THEN** a resposta tem status `201`
- **AND** o `email` retornado é `"ana@teste.com"`

#### Scenario: E-mail duplicado idêntico
- **GIVEN** que existe usuário com o e-mail `ana@teste.com`
- **WHEN** um cliente envia `POST /users` com `email` igual a `"ana@teste.com"`
- **THEN** a resposta tem status `409`

#### Scenario: E-mail duplicado com maiúsculas
- **GIVEN** que existe usuário com o e-mail `ana@teste.com`
- **WHEN** um cliente envia `POST /users` com `email` igual a `"ANA@teste.com"`
- **THEN** a resposta tem status `409`
- **AND** nenhum novo usuário é criado

### Requirement: Proteção da senha
A senha MUST ser armazenada somente como hash gerado com argon2id, nunca em texto puro. Nenhuma resposta da API MUST conter a senha ou seu hash, inclusive respostas de erro.

#### Scenario: Resposta sem senha
- **WHEN** um cliente conclui um cadastro válido em `POST /users`
- **THEN** o corpo da resposta não contém as propriedades `password` nem `passwordHash`
- **AND** nenhum valor do corpo é igual à senha enviada

#### Scenario: Senha armazenada como hash argon2id
- **WHEN** um cliente conclui um cadastro válido com `password` igual a `"senhaSegura123"`
- **THEN** o valor armazenado para a senha do usuário é diferente de `"senhaSegura123"`
- **AND** é um hash no formato argon2id (prefixo `$argon2id$`) que verifica com a senha enviada

### Requirement: Administrador inicial via seed
O sistema SHALL fornecer um seed que cria o usuário administrador inicial com papel `ADMIN`, usando o e-mail de `ADMIN_EMAIL` (normalizado) e a senha de `ADMIN_PASSWORD` (armazenada como hash argon2id). O seed MUST ser idempotente e MUST falhar com mensagem clara, sem criar usuário, quando alguma dessas variáveis não estiver definida.

#### Scenario: Seed cria o administrador
- **GIVEN** que `ADMIN_EMAIL` e `ADMIN_PASSWORD` estão definidas e não existe usuário com esse e-mail
- **WHEN** o seed é executado
- **THEN** existe um usuário com o e-mail de `ADMIN_EMAIL` normalizado e papel `ADMIN`
- **AND** sua senha está armazenada como hash argon2id

#### Scenario: Seed executado novamente
- **GIVEN** que o administrador inicial já existe
- **WHEN** o seed é executado outra vez
- **THEN** continua existindo um único usuário com esse e-mail
- **AND** o seed termina sem erro

#### Scenario: Variáveis ausentes
- **GIVEN** que `ADMIN_EMAIL` ou `ADMIN_PASSWORD` não está definida
- **WHEN** o seed é executado
- **THEN** o seed termina com erro indicando a variável ausente
- **AND** nenhum usuário é criado

#### Scenario: E-mail do administrador indisponível para cadastro público
- **GIVEN** que o seed criou o administrador com e-mail `admin@treinadesk.com`
- **WHEN** um cliente envia `POST /users` com `email` igual a `"ADMIN@treinadesk.com"`
- **THEN** a resposta tem status `409`

### Requirement: Consulta do próprio perfil
O sistema SHALL expor a rota `GET /users/me`, que exige access token válido e retorna o usuário identificado pelo token. A resposta MUST ter status `200` e corpo contendo exatamente `id`, `name`, `email`, `role` e `createdAt`, sem senha nem hash de senha. Requisição sem token ou com token inválido MUST receber `401`.

#### Scenario: Perfil do usuário autenticado
- **GIVEN** que `ana@teste.com` (nome `"Ana"`, papel `CUSTOMER`) fez login com a senha `senha-forte-123` e recebeu o access token `A1`
- **WHEN** um cliente envia `GET /users/me` com `Authorization: Bearer A1`
- **THEN** a resposta tem status `200`
- **AND** o corpo contém `id` igual ao id de `ana@teste.com`, `name` igual a `"Ana"`, `email` igual a `"ana@teste.com"`, `role` igual a `"CUSTOMER"` e `createdAt`
- **AND** o corpo não contém nenhuma outra propriedade

#### Scenario: Perfil corresponde ao dono do token
- **GIVEN** que `ana@teste.com` e `bia@teste.com` fizeram login e receberam `A1` e `B1`
- **WHEN** um cliente envia `GET /users/me` com `Authorization: Bearer B1`
- **THEN** a resposta tem status `200` com `email` igual a `"bia@teste.com"`

#### Scenario: Perfil sem autenticação
- **WHEN** um cliente envia `GET /users/me` sem o cabeçalho `Authorization`
- **THEN** a resposta tem status `401`

### Requirement: Restrição de rotas por papel
O sistema SHALL permitir restringir rotas a papéis específicos. Um usuário autenticado cujo papel não tem acesso à rota MUST receber `403`, sem que a operação seja executada, independentemente do corpo ou dos parâmetros enviados. O papel considerado MUST ser o `role` do access token apresentado. Requisições sem token ou com token inválido a essas rotas MUST continuar recebendo `401`. As rotas `GET /users`, `POST /users/staff` e `PATCH /users/:id/role` MUST ser acessíveis somente ao papel `ADMIN`; `GET /users/me` MUST continuar acessível a qualquer usuário autenticado.

#### Scenario: Cliente tenta listar usuários
- **GIVEN** que `ana@teste.com` (papel `CUSTOMER`) está autenticada com o access token `A1`
- **WHEN** um cliente envia `GET /users` com `Authorization: Bearer A1`
- **THEN** a resposta tem status `403`

#### Scenario: Atendente tenta listar usuários
- **GIVEN** que a atendente `bia@teste.com` (papel `SUPPORT`) está autenticada com o access token `B1`
- **WHEN** um cliente envia `GET /users` com `Authorization: Bearer B1`
- **THEN** a resposta tem status `403`

#### Scenario: Papel sem acesso recebe 403 mesmo com corpo inválido
- **GIVEN** que `ana@teste.com` (papel `CUSTOMER`) está autenticada com `A1`
- **WHEN** um cliente envia `POST /users/staff` com `Authorization: Bearer A1` e corpo `{}`
- **THEN** a resposta tem status `403`

#### Scenario: Rota restrita sem token
- **WHEN** um cliente envia `GET /users` sem o cabeçalho `Authorization`
- **THEN** a resposta tem status `401`

#### Scenario: Perfil próprio continua aberto a todos os papéis
- **GIVEN** que `bia@teste.com` (papel `SUPPORT`) está autenticada com `B1`
- **WHEN** um cliente envia `GET /users/me` com `Authorization: Bearer B1`
- **THEN** a resposta tem status `200` com `role` igual a `"SUPPORT"`

### Requirement: Listagem paginada de usuários
O sistema SHALL expor a rota `GET /users`, restrita ao `ADMIN`, que aceita os parâmetros de consulta `page` (inteiro, padrão `1`, mínimo `1`) e `limit` (inteiro, padrão `20`, mínimo `1`, máximo `100`). A resposta MUST ter status `200` e corpo `{ data, page, limit, total }`, em que `data` é a página de usuários em ordem estável de cadastro, cada item contendo exatamente `id`, `name`, `email`, `role` e `createdAt`, e `total` é o número total de usuários. Parâmetros fora dos limites ou não inteiros MUST resultar em `400`. Nenhum item MUST conter senha ou hash de senha.

#### Scenario: Listagem com valores padrão
- **GIVEN** que existem 3 usuários: o administrador `admin@treinadesk.com`, `ana@teste.com` e `bia@teste.com`
- **AND** que o administrador está autenticado com o access token `ADM1`
- **WHEN** um cliente envia `GET /users` com `Authorization: Bearer ADM1`
- **THEN** a resposta tem status `200`
- **AND** o corpo contém `page` igual a `1`, `limit` igual a `20` e `total` igual a `3`
- **AND** `data` contém os 3 usuários, cada um com exatamente `id`, `name`, `email`, `role` e `createdAt`

#### Scenario: Itens sem senha nem hash
- **GIVEN** que o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `GET /users` com `Authorization: Bearer ADM1`
- **THEN** nenhum item de `data` contém as propriedades `password` nem `passwordHash`

#### Scenario: Segunda página
- **GIVEN** que existem 3 usuários e o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `GET /users?page=2&limit=2` com `Authorization: Bearer ADM1`
- **THEN** a resposta tem status `200` com `page` igual a `2`, `limit` igual a `2` e `total` igual a `3`
- **AND** `data` contém exatamente 1 usuário, diferente dos 2 retornados por `GET /users?page=1&limit=2`

#### Scenario: Página além do fim
- **GIVEN** que existem 3 usuários e o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `GET /users?page=5&limit=20` com `Authorization: Bearer ADM1`
- **THEN** a resposta tem status `200` com `data` vazio e `total` igual a `3`

#### Scenario: Limite máximo aceito
- **GIVEN** que o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `GET /users?limit=100` com `Authorization: Bearer ADM1`
- **THEN** a resposta tem status `200` com `limit` igual a `100`

#### Scenario: Limite acima do máximo
- **GIVEN** que o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `GET /users?limit=101` com `Authorization: Bearer ADM1`
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica o parâmetro `limit`

#### Scenario: Página abaixo do mínimo
- **GIVEN** que o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `GET /users?page=0` com `Authorization: Bearer ADM1`
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica o parâmetro `page`

#### Scenario: Parâmetro não inteiro
- **GIVEN** que o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `GET /users?page=abc` com `Authorization: Bearer ADM1`
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica o parâmetro `page`

### Requirement: Cadastro de membros da equipe
O sistema SHALL expor a rota `POST /users/staff`, restrita ao `ADMIN`, que recebe `name`, `email`, `password` e `role` e cria um usuário com o papel informado. `role` MUST ser `SUPPORT` ou `ADMIN`; `CUSTOMER`, papel inexistente ou ausente MUST resultar em `400` sem criar usuário. `name`, `email` e `password` MUST seguir as mesmas validações, a mesma normalização de e-mail e a mesma rejeição de propriedades não declaradas do cadastro público. E-mail já existente MUST resultar em `409`. Em caso de sucesso, a resposta MUST ter status `201` e corpo contendo exatamente `id`, `name`, `email`, `role` e `createdAt`, e a senha MUST ser armazenada como no cadastro público.

#### Scenario: Cadastro de atendente
- **GIVEN** que o administrador está autenticado com `ADM1` e não existe usuário com o e-mail `bia@teste.com`
- **WHEN** um cliente envia `POST /users/staff` com `Authorization: Bearer ADM1` e `{"name": "Bia", "email": "bia@teste.com", "password": "senhaSegura123", "role": "SUPPORT"}`
- **THEN** a resposta tem status `201`
- **AND** o corpo contém `id`, `name` igual a `"Bia"`, `email` igual a `"bia@teste.com"`, `role` igual a `"SUPPORT"` e `createdAt`
- **AND** o corpo não contém nenhuma outra propriedade

#### Scenario: Atendente cadastrada consegue fazer login
- **GIVEN** que o administrador cadastrou `bia@teste.com` com a senha `senhaSegura123` e papel `SUPPORT`
- **WHEN** um cliente envia `POST /auth/login` com `{"email": "bia@teste.com", "password": "senhaSegura123"}`
- **THEN** a resposta tem status `200`
- **AND** o `role` do payload do `accessToken` é `"SUPPORT"`

#### Scenario: Cadastro de outro administrador
- **GIVEN** que o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `POST /users/staff` com `Authorization: Bearer ADM1` e dados válidos com `"role": "ADMIN"`
- **THEN** a resposta tem status `201` com `role` igual a `"ADMIN"`

#### Scenario: Papel CUSTOMER recusado
- **GIVEN** que o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `POST /users/staff` com `Authorization: Bearer ADM1` e dados válidos com `"role": "CUSTOMER"`
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica o campo `role`
- **AND** nenhum usuário é criado

#### Scenario: Papel inexistente recusado
- **GIVEN** que o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `POST /users/staff` com `Authorization: Bearer ADM1` e dados válidos com `"role": "AGENT"`
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica o campo `role`

#### Scenario: Papel ausente
- **GIVEN** que o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `POST /users/staff` com `Authorization: Bearer ADM1` e `{"name": "Bia", "email": "bia@teste.com", "password": "senhaSegura123"}`
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica o campo `role`

#### Scenario: Validação igual à do cadastro público
- **GIVEN** que o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `POST /users/staff` com `Authorization: Bearer ADM1`, `"role": "SUPPORT"`, `name` igual a `"B"`, `email` igual a `"nao-e-email"` e `password` de 7 caracteres
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica os campos `name`, `email` e `password`

#### Scenario: E-mail normalizado e duplicado
- **GIVEN** que existe usuário com o e-mail `bia@teste.com` e o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `POST /users/staff` com `Authorization: Bearer ADM1`, `"role": "SUPPORT"` e `email` igual a `"  BIA@Teste.com "`
- **THEN** a resposta tem status `409`
- **AND** nenhum novo usuário é criado

#### Scenario: Propriedade extra no cadastro de equipe
- **GIVEN** que o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `POST /users/staff` com `Authorization: Bearer ADM1`, dados válidos e a propriedade adicional `"isVip": true`
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica a propriedade `isVip`

#### Scenario: Atendente não cadastra equipe
- **GIVEN** que `bia@teste.com` (papel `SUPPORT`) está autenticada com `B1`
- **WHEN** um cliente envia `POST /users/staff` com `Authorization: Bearer B1` e dados válidos com `"role": "SUPPORT"`
- **THEN** a resposta tem status `403`
- **AND** nenhum usuário é criado

### Requirement: Alteração de papel pelo administrador
O sistema SHALL expor a rota `PATCH /users/:id/role`, restrita ao `ADMIN`, que recebe `role` (`CUSTOMER`, `SUPPORT` ou `ADMIN`) e altera o papel do usuário `:id`. Em caso de sucesso, a resposta MUST ter status `200` e corpo contendo exatamente `id`, `name`, `email`, `role` (já atualizado) e `createdAt`. Um `ADMIN` alterando o próprio papel MUST receber `422` e o papel MUST permanecer inalterado. Usuário inexistente MUST resultar em `404`; `:id` que não seja um UUID válido, `role` inválido ou ausente, ou propriedades não declaradas MUST resultar em `400`.

#### Scenario: Promover cliente a atendente
- **GIVEN** que existe `ana@teste.com` com papel `CUSTOMER` e o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `PATCH /users/<id de ana>/role` com `Authorization: Bearer ADM1` e `{"role": "SUPPORT"}`
- **THEN** a resposta tem status `200`
- **AND** o corpo contém `id` de `ana@teste.com`, `name`, `email` igual a `"ana@teste.com"`, `role` igual a `"SUPPORT"` e `createdAt`
- **AND** o corpo não contém nenhuma outra propriedade

#### Scenario: Novo papel vale no próximo login
- **GIVEN** que o papel de `bia@teste.com` foi alterado de `SUPPORT` para `ADMIN`
- **WHEN** `bia@teste.com` faz login e usa o novo access token em `GET /users`
- **THEN** a resposta tem status `200`

#### Scenario: Administrador altera o próprio papel
- **GIVEN** que o administrador `admin@treinadesk.com` está autenticado com `ADM1`
- **WHEN** um cliente envia `PATCH /users/<id do administrador>/role` com `Authorization: Bearer ADM1` e `{"role": "CUSTOMER"}`
- **THEN** a resposta tem status `422`
- **AND** o papel de `admin@treinadesk.com` continua `ADMIN`

#### Scenario: Usuário inexistente
- **GIVEN** que o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `PATCH /users/00000000-0000-4000-8000-000000000000/role` com `Authorization: Bearer ADM1` e `{"role": "SUPPORT"}`
- **THEN** a resposta tem status `404`

#### Scenario: Identificador malformado
- **GIVEN** que o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `PATCH /users/abc/role` com `Authorization: Bearer ADM1` e `{"role": "SUPPORT"}`
- **THEN** a resposta tem status `400`

#### Scenario: Papel inválido
- **GIVEN** que existe `ana@teste.com` e o administrador está autenticado com `ADM1`
- **WHEN** um cliente envia `PATCH /users/<id de ana>/role` com `Authorization: Bearer ADM1` e `{"role": "AGENT"}`
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica o campo `role`
- **AND** o papel de `ana@teste.com` continua `CUSTOMER`

#### Scenario: Atendente não altera papéis
- **GIVEN** que `bia@teste.com` (papel `SUPPORT`) está autenticada com `B1` e existe `ana@teste.com` com papel `CUSTOMER`
- **WHEN** um cliente envia `PATCH /users/<id de ana>/role` com `Authorization: Bearer B1` e `{"role": "ADMIN"}`
- **THEN** a resposta tem status `403`
- **AND** o papel de `ana@teste.com` continua `CUSTOMER`

### Requirement: Revogação de sessões ao alterar o papel
Quando o papel de um usuário é alterado com sucesso em `PATCH /users/:id/role`, o sistema MUST revogar todos os refresh tokens ativos desse usuário na mesma operação que grava o novo papel: ou ambas as alterações são efetivadas, ou nenhuma. Um refresh token emitido antes da alteração MUST passar a resultar em `401` em `POST /auth/refresh`. Refresh tokens de outros usuários MUST NOT ser afetados. Access tokens emitidos antes da alteração MUST continuar carregando o papel antigo até expirarem (limitação aceita); o novo papel SHALL valer a partir do próximo login.

#### Scenario: Refresh anterior à alteração é recusado
- **GIVEN** que `bia@teste.com` (papel `SUPPORT`) fez login e recebeu o refresh token `R1`
- **AND** que o administrador alterou o papel de `bia@teste.com` para `CUSTOMER`
- **WHEN** um cliente envia `POST /auth/refresh` com `{"refreshToken": "R1"}`
- **THEN** a resposta tem status `401`

#### Scenario: Todas as sessões do usuário são revogadas
- **GIVEN** que `bia@teste.com` fez login duas vezes, recebendo `R1` e `S1`
- **AND** que o administrador alterou o papel de `bia@teste.com`
- **WHEN** um cliente envia `POST /auth/refresh` com `R1` e depois com `S1`
- **THEN** as duas respostas têm status `401`

#### Scenario: Sessões de outros usuários preservadas
- **GIVEN** que `ana@teste.com` fez login e recebeu `R2`, e que `bia@teste.com` recebeu `R1`
- **AND** que o administrador alterou o papel de `bia@teste.com`
- **WHEN** um cliente envia `POST /auth/refresh` com `{"refreshToken": "R2"}`
- **THEN** a resposta tem status `200`

#### Scenario: Alteração recusada não revoga sessões
- **GIVEN** que o administrador `admin@treinadesk.com` fez login e recebeu o access token `ADM1` e o refresh token `R3`
- **WHEN** um cliente envia `PATCH /users/<id do administrador>/role` com `Authorization: Bearer ADM1` e `{"role": "SUPPORT"}`, recebendo `422`
- **THEN** um `POST /auth/refresh` posterior com `R3` retorna `200`

#### Scenario: Access token antigo mantém o papel até expirar
- **GIVEN** que `bia@teste.com` (papel `SUPPORT`) está autenticada com o access token `B1`, ainda válido
- **AND** que o administrador alterou o papel de `bia@teste.com` para `CUSTOMER`
- **WHEN** um cliente envia `GET /users/me` com `Authorization: Bearer B1`
- **THEN** a resposta tem status `200`
- **AND** o `role` do payload de `B1` continua `"SUPPORT"`, enquanto `role` no corpo da resposta é `"CUSTOMER"`
