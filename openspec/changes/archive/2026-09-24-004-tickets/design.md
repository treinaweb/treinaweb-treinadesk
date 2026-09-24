# Design

## Context

Motivação em `proposal.md` (Why); comportamento em `specs/tickets/spec.md`.

Estado atual relevante (após as changes 001 a 003):

- `JwtAuthGuard` e `RolesGuard` são `APP_GUARD` no `AuthModule`, nessa ordem. `@Roles(...)` restringe a rota por papel (`403`); `@CurrentUser()` entrega `AuthenticatedUser` (`{ id, email, role }`) vindo do access token.
- `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`): propriedades não declaradas no DTO → `400`.
- `PaginationQueryDto` (`page` padrão 1; `limit` padrão 20, `@Max(100)`) e `Paginated<T>` em `src/common/dto/`; listagens usam `$transaction([findMany, count])` com desempate por `id`.
- `CategoriesService` traduz `P2002`/`P2025` e filtra por papel no `where`. O decorator `Trim()` está em `src/categories/dto/trim.ts`.
- Não existe modelo de ticket. `User` e `Category` não têm relações além de `refreshTokens`.
- Os e2e limpam `categories` e `users` no `beforeEach`/`afterAll` de cada arquivo em `test/`.

## Goals / Non-Goals

**Goals:**
- Um único ponto que define "ticket visível para o usuário", usado por toda leitura e **antes** de toda escrita.
- Regras de transição de status numa função pura, testável sem banco e sem Nest.
- Escritas que não sobrescrevem uma alteração concorrente (`409` em vez de "o último vence").
- Nenhum dado sensível de usuário nas respostas de ticket, por construção da consulta.

**Non-Goals:**
- Row-level security no PostgreSQL: a visibilidade é aplicada na camada de aplicação.
- Coluna de versão / `If-Match` (fora do escopo; a condição da escrita usa os próprios campos de estado).
- Checar o papel do usuário no banco a cada requisição (continua vindo do token, como na change 003).

## Decisions

### 1. Modelo `Ticket` com relações nomeadas e índices

```prisma
enum TicketStatus {
  OPEN
  IN_PROGRESS
  WAITING_CUSTOMER
  RESOLVED
  CLOSED
}

enum TicketPriority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

model Ticket {
  id          String         @id @default(uuid()) @db.Uuid
  title       String         @db.VarChar(120)
  description String         @db.Text
  status      TicketStatus   @default(OPEN)
  priority    TicketPriority
  categoryId  String         @map("category_id") @db.Uuid
  customerId  String         @map("customer_id") @db.Uuid
  assigneeId  String?        @map("assignee_id") @db.Uuid
  createdAt   DateTime       @default(now()) @map("created_at")
  updatedAt   DateTime       @updatedAt @map("updated_at")
  closedAt    DateTime?      @map("closed_at")

  category Category @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  customer User     @relation("TicketCustomer", fields: [customerId], references: [id], onDelete: Restrict)
  assignee User?    @relation("TicketAssignee", fields: [assigneeId], references: [id], onDelete: Restrict)

  @@index([customerId])
  @@index([assigneeId])
  @@index([status, createdAt])
  @@map("tickets")
}
```

Em `User`: `ticketsOpened Ticket[] @relation("TicketCustomer")` e `ticketsAssigned Ticket[] @relation("TicketAssignee")`. Em `Category`: `tickets Ticket[]`.

- **Relações nomeadas:** `Ticket` tem duas chaves para `User`; sem nome, o Prisma não sabe qual lista do `User` corresponde a qual chave e o schema não valida.
- **Índices:** `customerId` atende a visibilidade do `CUSTOMER`; `assigneeId` a parte "atribuídos a ele" do `SUPPORT`; `[status, createdAt]` a fila (`status = OPEN`) e o filtro `status` já na ordem da listagem.
- **`onDelete: Restrict`:** não há exclusão de usuários nem de categorias; `Restrict` impede que uma exclusão manual apague tickets em cascata ou os deixe órfãos. Consequência: os e2e precisam apagar `tickets` antes de `categories` e `users`.
- `description` como `Text`: o limite de 5000 é regra de entrada (DTO), não do armazenamento.
- **Alternativa rejeitada — status como `String` com `CHECK`:** o enum do Prisma dá o tipo `TicketStatus` no TypeScript, usado na tabela de transições e no `@IsEnum` dos DTOs.

### 2. `visibilityWhere(user)` + `findVisibleOrFail(id, user)` antes de qualquer escrita

```ts
export function visibilityWhere(user: AuthenticatedUser): Prisma.TicketWhereInput {
  switch (user.role) {
    case Role.ADMIN:    return {};
    case Role.SUPPORT:  return { OR: [{ status: TicketStatus.OPEN, assigneeId: null }, { assigneeId: user.id }] };
    case Role.CUSTOMER: return { customerId: user.id };
  }
}
```

`TicketsService.findVisibleOrFail(id, user)` faz `ticket.findFirst({ where: { AND: [{ id }, visibilityWhere(user)] }, select: ticketSelect })` e lança `NotFoundException('Ticket não encontrado')` quando o resultado é `null`. A mesma exceção cobre "não existe" e "existe mas não é seu". `GET /tickets/:id` o chama diretamente; `assign` e `changeStatus` o chamam como **primeiro passo**, antes de validar regra de negócio ou escrever. `findAll` usa `where: { AND: [visibilityWhere(user), filtros] }`.

- O `switch` sem `default`, com `role: Role`, faz o TypeScript acusar um papel novo sem regra de visibilidade (retorno implícito `undefined` não compila com `strict`).
- `AND` explícito evita que um filtro (ex.: `status`) sobrescreva uma chave do objeto de visibilidade, como aconteceria com spread.
- **Alternativa rejeitada — `findUnique({ id })` + comparar `customerId`/`assigneeId` no controller:** a regra fica duplicada em cada handler, é fácil esquecer numa rota nova (BOLA, API1:2023) e o registro alheio já foi carregado inteiro para a memória antes da checagem.
- **Alternativa rejeitada — `403` para ticket de outro usuário:** diferencia "existe, mas não é seu" de "não existe" e permite enumerar ids válidos. O PRD define `404` para registro invisível; o `403` fica só para restrição de rota por papel.

### 3. `userSummarySelect` e `ticketSelect`

```ts
export const userSummarySelect = { id: true, name: true, role: true } satisfies Prisma.UserSelect;

export const ticketSelect = {
  id: true, title: true, description: true, status: true, priority: true,
  createdAt: true, updatedAt: true, closedAt: true,
  category: { select: { id: true, name: true } },
  customer: { select: userSummarySelect },
  assignee: { select: userSummarySelect },
} satisfies Prisma.TicketSelect;

export type TicketView = Prisma.TicketGetPayload<{ select: typeof ticketSelect }>;
```

Toda consulta que devolve ticket (criação, leitura, listagem e releitura após escrita) usa `ticketSelect`.

- **Por que não `include: { customer: true }`:** `include` de uma relação traz **todas** as colunas escalares do modelo relacionado — no `User`, isso inclui `email` e `passwordHash`. O hash iria para a resposta JSON (o Nest serializa o objeto inteiro) a menos que cada handler lembrasse de removê-lo. Com `select` explícito, o dado sensível nunca sai do banco e o tipo `TicketView` nem tem esses campos.
- `customerId`, `assigneeId` e `categoryId` não são expostos: os objetos aninhados já trazem os ids.
- **Alternativa rejeitada — `ClassSerializerInterceptor` com `@Exclude()`:** depende de instanciar classes em toda resposta e falha silenciosamente se um handler devolver o objeto do Prisma direto.

### 4. Tabela de transições pura em `src/tickets/ticket-transitions.ts`

```ts
export type TransitionActor = 'OWNER' | 'ASSIGNEE' | 'ADMIN';

const TRANSITIONS: ReadonlyArray<{ from: TicketStatus; to: TicketStatus; actors: readonly TransitionActor[] }> = [
  { from: 'IN_PROGRESS',      to: 'WAITING_CUSTOMER', actors: ['ASSIGNEE', 'ADMIN'] },
  { from: 'IN_PROGRESS',      to: 'RESOLVED',         actors: ['ASSIGNEE', 'ADMIN'] },
  { from: 'WAITING_CUSTOMER', to: 'RESOLVED',         actors: ['ASSIGNEE', 'ADMIN'] },
  { from: 'RESOLVED',         to: 'IN_PROGRESS',      actors: ['OWNER'] },
  { from: 'RESOLVED',         to: 'CLOSED',           actors: ['OWNER', 'ADMIN'] },
  { from: 'OPEN',             to: 'CLOSED',           actors: ['OWNER', 'ADMIN'] },
];

export function canTransition(input: {
  from: TicketStatus; to: TicketStatus; role: Role; isOwner: boolean; isAssignee: boolean;
}): boolean
```

O ator é derivado do papel **e** da relação com o ticket: `OWNER` só se `role === CUSTOMER && isOwner`; `ASSIGNEE` só se `role === SUPPORT && isAssignee`; `ADMIN` se `role === ADMIN`. `canTransition` retorna `true` somente se existir a linha `from → to` e o ator estiver na lista. Tudo o que não está na tabela é negado: status igual ao atual, `OPEN → IN_PROGRESS`, qualquer saída de `CLOSED`.

`TicketsService.changeStatus` calcula `isOwner = ticket.customer.id === user.id` e `isAssignee = ticket.assignee?.id === user.id` a partir do ticket devolvido por `findVisibleOrFail`; `false` → `UnprocessableEntityException` (`422`).

- **Por que pura:** o teste unitário percorre todas as combinações `from × to × ator` (5 × 5 × 5, incluindo "nenhum ator") e compara com a tabela do PRD, sem mock de banco.
- A tabela não contém `OPEN → IN_PROGRESS`: essa mudança acontece só no `assign` (decisão 5), que tem regras próprias.
- **Alternativa rejeitada — `switch` aninhado por status e papel no service:** mistura I/O com regra, dificulta ver a tabela inteira e testar a negação exaustivamente.
- **Alternativa rejeitada — biblioteca de máquina de estados:** dependência nova para seis linhas de tabela.

### 5. Escrita condicional com `updateMany`; `count === 0` → `409`

Toda escrita em ticket existente filtra, além do `id`, o estado lido em `findVisibleOrFail`, e verifica o `count`:

| Operação | `where` da escrita | `data` |
|---|---|---|
| SUPPORT assume | `{ id, status: OPEN, assigneeId: null }` | `{ assigneeId: user.id, status: IN_PROGRESS }` |
| ADMIN atribui | `{ id, status: lido, assigneeId: lido }` | `{ assigneeId, status: lido === OPEN ? IN_PROGRESS : lido }` |
| Mudança de status | `{ id, status: from, assigneeId: lido }` | `{ status: to, closedAt: to === CLOSED ? new Date() : undefined }` |

`count === 0` → `ConflictException` (`409`, "O ticket foi alterado por outra requisição"). Com `count === 1`, o service relê o ticket com `findUniqueOrThrow({ where: { id }, select: ticketSelect })` e o devolve.

- **Duas chamadas simultâneas de assumir:** as duas passam por `findVisibleOrFail`; no PostgreSQL, o `UPDATE ... WHERE status = 'OPEN' AND assignee_id IS NULL` da segunda espera o lock de linha da primeira e, após o commit, reavalia a condição sobre a linha nova: não casa → `count = 0` → `409`. Se a segunda só chega depois do commit, `findVisibleOrFail` já não a vê → `404`. Em ambos os casos o ticket fica com um único atendente (cenário da spec).
- **`assigneeId` na condição da mudança de status:** impede que um atendente substituído pelo ADMIN entre a leitura e a escrita ainda consiga alterar o status com base na permissão antiga.
- **Regras de `assign`** (antes da escrita, depois de `findVisibleOrFail`):
  - SUPPORT com `assigneeId` no corpo → `400`; ADMIN sem `assigneeId` → `400` (validação de entrada dependente do papel, feita no início do service, antes de consultar o ticket).
  - SUPPORT: ticket já atribuído a ele → `422` (única outra possibilidade visível além de `OPEN` sem atendente).
  - ADMIN: status fora de `OPEN`/`IN_PROGRESS`/`WAITING_CUSTOMER` → `422`; destinatário validado com `user.findFirst({ where: { id: assigneeId, role: SUPPORT } })`, `null` → `422` (inexistente e não-`SUPPORT` com a mesma mensagem). O papel do destinatário vem do banco, não de token.
- **Alternativa rejeitada — `update({ where: { id } })` após checar em memória:** clássico check-then-act; o último a gravar vence e dois atendentes poderiam "assumir" o mesmo ticket.
- **Alternativa rejeitada — `SELECT ... FOR UPDATE` em transação interativa:** também correto, mas segura o lock durante as validações e exige SQL cru ou transação interativa para algo que um `UPDATE` condicional resolve atomicamente.
- **Alternativa rejeitada — coluna `version`:** fora do escopo; os campos de estado já identificam a versão relevante para estas operações.

### 6. Categoria validada com `findFirst({ id, active: true })` → `422`

`create(dto, user)`: `category.findFirst({ where: { id: dto.categoryId, active: true }, select: { id: true } })`; `null` → `UnprocessableEntityException('Categoria inexistente ou inativa')`. Depois, `ticket.create({ data: { title, description, priority, categoryId, customerId: user.id }, select: ticketSelect })`. `status` usa o padrão `OPEN`; `assigneeId` e `closedAt` ficam nulos.

- Mesma consulta e mesma mensagem para inexistente e inativa: o cliente não precisa (nem deve) distinguir os casos, e a regra é de negócio (`422`), não de visibilidade.
- `customerId` vem sempre do token; o DTO não declara `customerId`, `status` nem `assigneeId`, e o `ValidationPipe` rejeita essas propriedades com `400` (mass assignment).
- **Alternativa rejeitada — deixar a FK falhar (`P2003`) e traduzir:** não cobre categoria inativa, que existe.

### 7. DTOs

- `CreateTicketDto`: `title` (`@Trim()`, `@IsString()`, `@Length(5, 120)`), `description` (`@Trim()`, `@IsString()`, `@Length(10, 5000)`), `priority` (`@IsEnum(TicketPriority)`), `categoryId` (`@IsUUID()`). O `Trim()` sai de `src/categories/dto/trim.ts` para `src/common/dto/trim.ts` e as categorias passam a importá-lo de lá.
- `ListTicketsQueryDto extends PaginationQueryDto`: redeclara `limit` com `@Type(() => Number)`, `@IsInt()`, `@Min(1)`, `@Max(50)` e padrão `20` (os validadores do pai continuam valendo; o `@Max(50)` é o mais restritivo e gera a mensagem). Acrescenta `status?` (`@IsOptional()`, `@IsEnum(TicketStatus)`) e `priority?` (`@IsOptional()`, `@IsEnum(TicketPriority)`). Não altera o `PaginationQueryDto`, que continua com máximo 100 para `GET /users`.
- `AssignTicketDto`: `assigneeId?` (`@IsOptional()`, `@IsUUID()`). A obrigatoriedade por papel fica no service (decisão 5).
- `UpdateStatusDto`: `status` (`@IsEnum(TicketStatus)`).
- `:id` em todas as rotas com `ParseUUIDPipe` (`400` para id malformado, em vez de erro do PostgreSQL).

`findAll(query, user)` executa `$transaction([ticket.findMany({ where, select: ticketSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take }), ticket.count({ where })])` com o mesmo `where` nas duas consultas, garantindo que `total` conte só os visíveis filtrados.

### 8. Módulo

`TicketsModule` (`src/tickets/`: `tickets.controller.ts`, `tickets.service.ts`, `ticket-visibility.ts` com `visibilityWhere`, `ticket-transitions.ts`, `ticket-select.ts`, `dto/`), importado no `AppModule`; usa o `PrismaService` global.

## Autorização

Duas camadas: **por rota** (`@Roles`, `403`) e **por registro** (`findVisibleOrFail`, `404`).

| Rota | Por rota | Por registro | Sem token |
|---|---|---|---|
| `POST /tickets` | `@Roles(Role.CUSTOMER)` | — (o dono é o usuário do token) | `401` |
| `GET /tickets` | qualquer autenticado | `visibilityWhere` no `where` | `401` |
| `GET /tickets/:id` | qualquer autenticado | `findVisibleOrFail` | `401` |
| `PATCH /tickets/:id/assign` | `@Roles(Role.SUPPORT, Role.ADMIN)` | `findVisibleOrFail` + regras da decisão 5 | `401` |
| `PATCH /tickets/:id/status` | qualquer autenticado | `findVisibleOrFail` + `canTransition` | `401` |

Guards rodam antes dos pipes: um `CUSTOMER` em `/assign` recebe `403` mesmo com id malformado.

## Risks / Trade-offs

- [Rota nova com `:id` que esqueça `findVisibleOrFail` expõe tickets alheios (BOLA)] → toda leitura/escrita por id passa pelo service, que só expõe métodos que começam por `findVisibleOrFail`; o e2e de cada rota com `:id` tem um cenário "ticket de outro cliente → `404`"; a tabela de Autorização serve de checklist em revisão.
- [Novo papel adicionado ao enum sem regra de visibilidade] → o `switch` exaustivo de `visibilityWhere` deixa de compilar.
- [Categoria desativada entre a checagem e o `create`] → janela de milissegundos; o ticket fica numa categoria recém-desativada, o que é inofensivo (a FK garante que ela existe). Aceito.
- [Papel do token desatualizado (até 15 min)] → mesma limitação da change 003; um ex-`SUPPORT` com token antigo só alcança tickets da fila ou atribuídos a ele, e o ADMIN só atribui a quem é `SUPPORT` **no banco**.
- [`409` pode surpreender quem repete a requisição] → a mensagem indica que o ticket mudou; o cliente relê com `GET /tickets/:id`.
- [Releitura após `updateMany` é uma segunda consulta] → custo pequeno; preferido a `update` sem condição.
- [`OR` na visibilidade do `SUPPORT` com filtro `status`] → coberto pelos índices `assigneeId` e `[status, createdAt]`; volume de helpdesk não justifica mais.

## Migration Plan

1. Adicionar os enums e o modelo `Ticket` e as listas de relação em `User` e `Category`; rodar `npx prisma migrate dev --name create-tickets` e depois `npx prisma generate` (no Prisma 7 o migrate não regenera o client).
2. A migration cria os tipos `TicketStatus` e `TicketPriority`, a tabela `tickets`, as três FKs e os três índices. As listas de relação não geram colunas em `users` nem `categories`; não há backfill.
3. Atualizar todos os e2e em `test/` para apagar `tickets` antes de `categories` e `users` (as FKs são `Restrict`).
4. Deploy: `npx prisma migrate deploy` antes de subir a nova versão da API. As rotas existentes não mudam.
5. Rollback: reverter a versão da API; `tickets` e os enums podem permanecer (não são lidos pela versão anterior) ou ser removidos com `DROP TABLE tickets; DROP TYPE "TicketStatus"; DROP TYPE "TicketPriority";`.
