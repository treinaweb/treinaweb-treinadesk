# Spec Delta

## Purpose

Permite que clientes se cadastrem publicamente no TreinaDesk e garante a existência do administrador inicial, com e-mails únicos e senhas protegidas, servindo de base de usuários para os demais módulos.

## ADDED Requirements

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
