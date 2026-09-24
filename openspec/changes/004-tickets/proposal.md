# Proposal

## Why

A API já autentica usuários, restringe rotas por papel e mantém categorias, mas ainda não permite abrir nem atender tickets, que são o objetivo do helpdesk. Tickets guardam dados de clientes diferentes na mesma tabela, e a principal ameaça é a quebra de autorização por objeto — **BOLA (Broken Object Level Authorization, OWASP API1:2023)**: um usuário autenticado troca o `:id` na URL e lê ou altera o ticket de outro cliente. Esta change entrega o ciclo básico do ticket (abertura, consulta, atribuição e mudança de status) com a visibilidade por registro aplicada em todas as rotas, respondendo `404` para ticket invisível, sem revelar se ele existe.

## What Changes

- Nova rota `POST /tickets`, só para `CUSTOMER`: `title` (5 a 120 caracteres), `description` (10 a 5000), `priority` (`LOW`, `MEDIUM`, `HIGH`, `URGENT`) e `categoryId` → `201` com `status` `OPEN`, `customer` igual ao usuário do token e `assignee` nulo. `SUPPORT`/`ADMIN` → `403`. Categoria inexistente ou inativa → `422`, com a mesma mensagem nos dois casos. `customerId`, `status` ou `assigneeId` no corpo → `400`, sem criar ticket.
- Visibilidade por registro: `CUSTOMER` vê só os próprios tickets; `SUPPORT` vê os tickets `OPEN` sem atendente e os atribuídos a ele; `ADMIN` vê todos. Em toda rota com `:id`, ticket inexistente ou invisível → `404`, sem distinguir os casos (nunca `403`) e sem expor `title`/`description`.
- Nova rota `GET /tickets`: só tickets visíveis, do mais recente ao mais antigo, com filtros opcionais `status` e `priority` e paginação `page` (padrão `1`) e `limit` (padrão `20`, máximo `50`) → `{ data, page, limit, total }`, com `total` calculado sobre os visíveis filtrados. Parâmetros inválidos → `400`.
- Nova rota `GET /tickets/:id` → `200` para ticket visível.
- Nas respostas de ticket, `customer` e `assignee` trazem apenas `id`, `name` e `role`.
- Nova rota `PATCH /tickets/:id/assign`:
  - `SUPPORT`, sem corpo, assume um ticket `OPEN` sem atendente → `200`, `assignee` igual a ele e `status` `IN_PROGRESS`. Ticket já atribuído a outro → `404`. Em chamadas simultâneas, só uma vence; a outra recebe `409` ou `404`.
  - `ADMIN`, com `assigneeId`, atribui um ticket `OPEN`, `IN_PROGRESS` ou `WAITING_CUSTOMER` a um `SUPPORT` → `200`; `OPEN` passa a `IN_PROGRESS`. Destinatário que não é `SUPPORT` ou ticket em outro status → `422`.
  - `CUSTOMER` → `403`.
- Nova rota `PATCH /tickets/:id/status` com transições restritas por status atual e por ator (cliente dono, atendente atribuído, administrador). Transição fora da tabela, status igual ao atual ou alteração de ticket `CLOSED` → `422`. `OPEN → IN_PROGRESS` só pela rota de atribuição. Ir para `CLOSED` preenche `closedAt`. Status inexistente → `400`.
- Escritas condicionadas ao estado lido: se o ticket mudou entre a leitura e a gravação, a operação responde `409` e não grava nada.

## Capabilities

### New Capabilities
- `tickets`: abertura de tickets pelo cliente, visibilidade por papel e por registro, listagem paginada com filtros, consulta por id, atribuição (assumir ou atribuir) e mudança de status conforme a tabela de transições.

### Modified Capabilities
Nenhuma. As rotas de usuários, autenticação e categorias não mudam de comportamento.

## Impact

- **Código**: novo módulo `src/tickets/` (controller, service, DTOs, tabela de transições) importado no `AppModule`; o helper de trim das categorias passa a ser compartilhado em `src/common/`.
- **Banco**: migration `create-tickets` com os enums `TicketStatus` e `TicketPriority`, a tabela `tickets` e suas chaves estrangeiras; relações novas em `User` (cliente e atendente do ticket) e em `Category`. As tabelas existentes não mudam de colunas.
- **Dependências**: nenhuma nova.
- **Testes**: unitários da tabela de transições, do filtro de visibilidade, do service e dos DTOs; e2e contra PostgreSQL real, que passam a apagar também a tabela `tickets` (antes de `categories` e `users`, por causa das chaves estrangeiras).
- **Dados de desenvolvimento**: `prisma/dev-data.ts` ganha tickets em cada status para os usuários de teste.
- **Clientes da API**: nenhuma rota existente muda; as novas rotas exigem access token.

## Fora do escopo

- Anexos, notificações e SLA.
- Histórico de alterações de status.
- Edição de `title`, `description`, `priority` ou categoria depois da abertura.
- Controle de concorrência otimista com coluna de versão.
