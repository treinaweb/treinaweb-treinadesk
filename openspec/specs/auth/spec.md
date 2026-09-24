# auth Specification

## Purpose

Identifica quem faz cada requisição ao TreinaDesk: login com e-mail e senha, access token de curta duração exigido por padrão em todas as rotas, e refresh token revogável com rotação, detecção de reutilização e logout.

## Requirements

### Requirement: Login com e-mail e senha
O sistema SHALL expor a rota `POST /auth/login`, acessível sem autenticação, que recebe `email` e `password`. O e-mail MUST ser normalizado (espaços nas extremidades removidos e letras em minúsculas) antes da busca do usuário. Com credenciais válidas, a resposta MUST ter status `200` e corpo contendo exatamente `accessToken` e `refreshToken`, ambos strings não vazias.

#### Scenario: Login com credenciais válidas
- **GIVEN** que existe o usuário `ana@teste.com` com a senha `senha-forte-123`
- **WHEN** um cliente sem token envia `POST /auth/login` com `{"email": "ana@teste.com", "password": "senha-forte-123"}`
- **THEN** a resposta tem status `200`
- **AND** o corpo contém `accessToken` e `refreshToken`, ambos strings não vazias
- **AND** o corpo não contém nenhuma outra propriedade

#### Scenario: Login com e-mail em maiúsculas e com espaços
- **GIVEN** que existe o usuário `ana@teste.com` com a senha `senha-forte-123`
- **WHEN** um cliente envia `POST /auth/login` com `{"email": "  ANA@Teste.com ", "password": "senha-forte-123"}`
- **THEN** a resposta tem status `200` com `accessToken` e `refreshToken`

#### Scenario: Corpo de login inválido
- **WHEN** um cliente envia `POST /auth/login` com corpo `{}`
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica os campos `email` e `password`

#### Scenario: Propriedade extra no login
- **WHEN** um cliente envia `POST /auth/login` com `{"email": "ana@teste.com", "password": "senha-forte-123", "role": "ADMIN"}`
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica a propriedade `role`

### Requirement: Credenciais inválidas indistinguíveis
O sistema MUST responder `401` tanto para senha incorreta quanto para e-mail não cadastrado, com corpo idêntico nos dois casos e mensagem `"Credenciais inválidas"`. O sistema MUST executar a verificação de senha também quando o e-mail não existe, de modo que o tempo de resposta dos dois casos seja parecido. Nenhum token MUST ser emitido nesses casos.

#### Scenario: Senha incorreta
- **GIVEN** que existe o usuário `ana@teste.com` com a senha `senha-forte-123`
- **WHEN** um cliente envia `POST /auth/login` com `{"email": "ana@teste.com", "password": "senha-errada-000"}`
- **THEN** a resposta tem status `401`
- **AND** a mensagem de erro é `"Credenciais inválidas"`
- **AND** o corpo não contém `accessToken` nem `refreshToken`

#### Scenario: E-mail inexistente
- **GIVEN** que não existe usuário com o e-mail `ninguem@teste.com`
- **WHEN** um cliente envia `POST /auth/login` com `{"email": "ninguem@teste.com", "password": "senha-forte-123"}`
- **THEN** a resposta tem status `401`
- **AND** o corpo é idêntico ao do cenário "Senha incorreta"

#### Scenario: Verificação de senha executada para e-mail inexistente
- **GIVEN** que não existe usuário com o e-mail `ninguem@teste.com`
- **WHEN** um cliente envia `POST /auth/login` com `{"email": "ninguem@teste.com", "password": "senha-forte-123"}`
- **THEN** a senha enviada é verificada contra um hash de referência antes da resposta `401`

### Requirement: Access token
O access token MUST ser um JWT assinado cujo payload contém `sub` (id do usuário), `email` e `role`. A validade MUST ser a definida em `JWT_ACCESS_EXPIRES_IN`, com padrão de 15 minutos quando a variável não estiver definida. O access token MUST NOT conter senha nem hash de senha.

#### Scenario: Conteúdo do access token
- **GIVEN** que `ana@teste.com` (papel `CUSTOMER`) fez login com sucesso e `JWT_ACCESS_EXPIRES_IN` não está definida
- **WHEN** o payload do `accessToken` recebido é decodificado
- **THEN** `sub` é igual ao `id` de `ana@teste.com`, `email` é `"ana@teste.com"` e `role` é `"CUSTOMER"`
- **AND** a diferença entre `exp` e `iat` é de 900 segundos
- **AND** o payload não contém `password` nem `passwordHash`

### Requirement: Autenticação obrigatória por padrão
Toda rota MUST exigir um access token válido no cabeçalho `Authorization: Bearer <token>`, exceto `POST /users`, `POST /auth/login` e `POST /auth/refresh`, que SHALL permanecer acessíveis sem autenticação. Requisições sem token, com cabeçalho malformado, com token de assinatura inválida, com algoritmo diferente do esperado ou com token expirado MUST receber `401`.

#### Scenario: Rota protegida sem token
- **WHEN** um cliente envia `GET /users/me` sem o cabeçalho `Authorization`
- **THEN** a resposta tem status `401`

#### Scenario: Cabeçalho Authorization malformado
- **WHEN** um cliente envia `GET /users/me` com `Authorization: Token abc` ou com `Authorization: Bearer` sem valor
- **THEN** a resposta tem status `401`

#### Scenario: Token com assinatura inválida
- **GIVEN** um JWT com payload válido de `ana@teste.com` assinado com outro segredo
- **WHEN** um cliente envia `GET /users/me` com esse token
- **THEN** a resposta tem status `401`

#### Scenario: Token sem assinatura
- **GIVEN** um JWT com cabeçalho `{"alg": "none"}` e payload válido de `ana@teste.com`
- **WHEN** um cliente envia `GET /users/me` com esse token
- **THEN** a resposta tem status `401`

#### Scenario: Token expirado
- **GIVEN** um access token de `ana@teste.com` assinado corretamente cujo `exp` já passou
- **WHEN** um cliente envia `GET /users/me` com esse token
- **THEN** a resposta tem status `401`

#### Scenario: Rota existente passa a exigir token
- **WHEN** um cliente envia `GET /` sem token
- **THEN** a resposta tem status `401`
- **AND** com um access token válido a mesma requisição retorna `200`

#### Scenario: Rotas públicas continuam acessíveis
- **WHEN** um cliente sem token envia `POST /users` com dados válidos
- **THEN** a resposta tem status `201`

### Requirement: Rotação de refresh token
O sistema SHALL expor a rota `POST /auth/refresh`, acessível sem autenticação, que recebe `refreshToken`. Para um refresh token válido (existente, não revogado e dentro da validade de `REFRESH_TOKEN_TTL_DAYS` dias), a resposta MUST ter status `200` com corpo contendo exatamente um novo `accessToken` e um novo `refreshToken`, e o token apresentado MUST ser invalidado na mesma operação. Token inexistente ou expirado MUST resultar em `401`.

#### Scenario: Refresh com token válido
- **GIVEN** que `ana@teste.com` fez login e recebeu o refresh token `R1`
- **WHEN** um cliente envia `POST /auth/refresh` com `{"refreshToken": "R1"}`
- **THEN** a resposta tem status `200`
- **AND** o corpo contém exatamente `accessToken` e `refreshToken`, sendo o novo refresh token `R2` diferente de `R1`
- **AND** o novo `accessToken` é aceito em `GET /users/me`

#### Scenario: Novo refresh token continua a cadeia
- **GIVEN** que `R1` foi trocado por `R2`
- **WHEN** um cliente envia `POST /auth/refresh` com `{"refreshToken": "R2"}`
- **THEN** a resposta tem status `200` com um refresh token `R3` diferente de `R1` e `R2`

#### Scenario: Refresh token inexistente
- **WHEN** um cliente envia `POST /auth/refresh` com `{"refreshToken": "valor-que-nunca-foi-emitido"}`
- **THEN** a resposta tem status `401`

#### Scenario: Refresh token expirado
- **GIVEN** que o refresh token `R1` de `ana@teste.com` foi emitido há mais de `REFRESH_TOKEN_TTL_DAYS` dias e nunca foi usado
- **WHEN** um cliente envia `POST /auth/refresh` com `{"refreshToken": "R1"}`
- **THEN** a resposta tem status `401`
- **AND** os demais refresh tokens ativos de `ana@teste.com` continuam válidos

#### Scenario: Corpo de refresh inválido
- **WHEN** um cliente envia `POST /auth/refresh` com corpo `{}`
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica o campo `refreshToken`

### Requirement: Detecção de reutilização de refresh token
Apresentar em `POST /auth/refresh` um refresh token já revogado (por rotação ou por logout) MUST resultar em `401` e MUST revogar todos os refresh tokens ativos do dono desse token. Duas requisições simultâneas de refresh com o mesmo token MUST ser tratadas como reutilização: no máximo uma recebe `200`, as demais recebem `401`, e ao final nenhum refresh token do usuário permanece válido.

#### Scenario: Reutilização de token já rotacionado
- **GIVEN** que `ana@teste.com` trocou `R1` por `R2`
- **WHEN** um cliente envia `POST /auth/refresh` com `{"refreshToken": "R1"}`
- **THEN** a resposta tem status `401`
- **AND** um `POST /auth/refresh` posterior com `{"refreshToken": "R2"}` também retorna `401`

#### Scenario: Reutilização revoga todas as sessões do usuário
- **GIVEN** que `ana@teste.com` fez login duas vezes, recebendo `R1` e `S1`, e trocou `R1` por `R2`
- **WHEN** um cliente envia `POST /auth/refresh` com `{"refreshToken": "R1"}`
- **THEN** a resposta tem status `401`
- **AND** `POST /auth/refresh` com `R2` e com `S1` retornam `401`
- **AND** refresh tokens de outros usuários continuam válidos

#### Scenario: Requisições simultâneas com o mesmo token
- **GIVEN** que `ana@teste.com` fez login e recebeu `R1`
- **WHEN** duas requisições `POST /auth/refresh` com `{"refreshToken": "R1"}` são enviadas ao mesmo tempo
- **THEN** no máximo uma resposta tem status `200` e a outra tem status `401`
- **AND** o refresh token `R2` devolvido na resposta `200`, se houver, também é recusado com `401` num refresh posterior

### Requirement: Logout
O sistema SHALL expor a rota `POST /auth/logout`, que exige access token válido e recebe `refreshToken`. A resposta MUST ter status `204` sem corpo. O sistema MUST revogar o refresh token informado somente se ele pertencer ao usuário autenticado; um token de outro usuário, inexistente ou já revogado MUST também resultar em `204`, sem alterar nenhum token.

#### Scenario: Logout do próprio token
- **GIVEN** que `ana@teste.com` fez login e recebeu o access token `A1` e o refresh token `R1`
- **WHEN** um cliente envia `POST /auth/logout` com `Authorization: Bearer A1` e `{"refreshToken": "R1"}`
- **THEN** a resposta tem status `204` sem corpo
- **AND** um `POST /auth/refresh` posterior com `R1` retorna `401`

#### Scenario: Logout com token de outro usuário
- **GIVEN** que `ana@teste.com` está autenticada com `A1` e que `bia@teste.com` possui o refresh token `B1`
- **WHEN** um cliente envia `POST /auth/logout` com `Authorization: Bearer A1` e `{"refreshToken": "B1"}`
- **THEN** a resposta tem status `204`
- **AND** um `POST /auth/refresh` posterior com `B1` retorna `200`

#### Scenario: Logout com token inexistente
- **GIVEN** que `ana@teste.com` está autenticada com `A1`
- **WHEN** um cliente envia `POST /auth/logout` com `Authorization: Bearer A1` e `{"refreshToken": "valor-que-nunca-foi-emitido"}`
- **THEN** a resposta tem status `204`

#### Scenario: Logout sem autenticação
- **WHEN** um cliente envia `POST /auth/logout` sem token com `{"refreshToken": "R1"}`
- **THEN** a resposta tem status `401`
- **AND** `R1` continua válido

#### Scenario: Corpo de logout inválido
- **GIVEN** que `ana@teste.com` está autenticada com `A1`
- **WHEN** um cliente envia `POST /auth/logout` com `Authorization: Bearer A1` e corpo `{}`
- **THEN** a resposta tem status `400`
- **AND** a mensagem de erro indica o campo `refreshToken`

### Requirement: Proteção dos refresh tokens
O refresh token MUST ser um valor opaco e aleatório (não um JWT) e MUST NOT ser armazenado em texto puro: o sistema guarda apenas um resumo criptográfico do valor. Nenhuma resposta de erro e nenhum log MUST conter access token, refresh token, senha ou hash de senha.

#### Scenario: Refresh token não armazenado em texto puro
- **GIVEN** que `ana@teste.com` fez login e recebeu `R1`
- **WHEN** os registros de refresh token de `ana@teste.com` são consultados no banco
- **THEN** existe um registro associado ao usuário
- **AND** nenhum campo armazenado é igual a `R1`

#### Scenario: Refresh token é opaco
- **WHEN** `ana@teste.com` faz login
- **THEN** o `refreshToken` recebido não tem o formato de JWT (três segmentos separados por ponto)

#### Scenario: Erros não ecoam tokens nem senha
- **WHEN** um cliente envia `POST /auth/refresh` com um token inexistente ou `POST /auth/login` com senha incorreta
- **THEN** o corpo da resposta `401` não contém o token nem a senha enviados
