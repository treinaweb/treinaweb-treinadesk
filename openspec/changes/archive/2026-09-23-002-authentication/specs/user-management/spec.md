# Spec Delta

## ADDED Requirements

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
