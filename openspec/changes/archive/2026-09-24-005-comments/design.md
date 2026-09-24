# Design

## Context

Motivação em `proposal.md` (Why); comportamento em `specs/comments/spec.md`.

Estado atual relevante (após as changes 001 a 004):

- `JwtAuthGuard` e `RolesGuard` são `APP_GUARD`; `@CurrentUser()` entrega `AuthenticatedUser` (`{ id, email, role }`) vindo do access token. `ValidationPipe` global com `whitelist`, `forbidNonWhitelisted` e `transform`.
- `TicketsService.findVisibleOrFail(id, user)` faz `findFirst` com `AND: [{ id }, visibilityWhere(user)]` e `select: ticketSelect`, e lança `NotFoundException` para ticket inexistente ou invisível. Devolve `TicketView`, com `status`, `customer.id` e `assignee?.id`.
- `TicketsModule` **não exporta** o `TicketsService` hoje.
- `userSummarySelect` (`id`, `name`, `role`) em `src/tickets/ticket-select.ts`; `PaginationQueryDto` (`page` padrão 1, `limit` padrão 20, máximo 100), `Paginated<T>` e `Trim()` em `src/common/dto/`.
- Escritas em ticket são condicionais (`updateMany` filtrando o estado lido; `count === 0` → `409`).
- As FKs de `tickets` são `Restrict`; os e2e apagam `tickets` antes de `categories` e `users`.

## Goals / Non-Goals

**Goals:**
- Uma só regra de visibilidade de ticket: comentários reutilizam `findVisibleOrFail`, sem reimplementá-la.
- Regra de "quem pode comentar o quê" numa função pura, testável sem banco e sem Nest.
- Nota interna nunca sai do banco para um `CUSTOMER`: o filtro está na consulta, não no resultado.
- Comentário e retomada de status atômicos.
- Testes escritos a partir dos cenários e commitados antes do código de produção, sem alteração durante a implementação.

**Non-Goals:**
- Sanitização ou renderização do `body` (é texto puro; a apresentação é responsabilidade de quem exibe).
- Contagem de comentários na resposta de ticket.
- Checar o papel do usuário no banco a cada requisição (continua vindo do token).

## Decisions

### 1. Modelo `Comment`

```prisma
model Comment {
  id         String   @id @default(uuid()) @db.Uuid
  ticketId   String   @map("ticket_id") @db.Uuid
  authorId   String   @map("author_id") @db.Uuid
  body       String   @db.VarChar(5000)
  isInternal Boolean  @default(false) @map("is_internal")
  createdAt  DateTime @default(now()) @map("created_at")

  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  author User   @relation(fields: [authorId], references: [id], onDelete: Restrict)

  @@index([ticketId, createdAt])
  @@map("comments")
}
```

Em `Ticket`: `comments Comment[]`. Em `User`: `comments Comment[]`.

- **`onDelete: Cascade` em `ticketId`:** o comentário não existe fora do ticket. Não há rota de exclusão de ticket, mas a limpeza dos e2e (`ticket.deleteMany`) continua funcionando sem apagar `comments` antes — os e2e existentes não precisam mudar.
- **`onDelete: Restrict` em `authorId`:** como em `tickets`, uma exclusão manual de usuário não apaga nem deixa órfão o histórico da conversa. Como `tickets` já é apagado antes de `users`, a cascata remove os comentários antes.
- **`body` como `VarChar(5000)`:** o banco reforça o limite do DTO (defesa em profundidade para escritas que não passem pela API, como o seed).
- **Índice `[ticketId, createdAt]`:** atende exatamente a listagem (`WHERE ticket_id = ? ORDER BY created_at`) e a contagem por ticket. Sem índice em `authorId`: não há consulta por autor.
- **Sem `updatedAt`:** comentários não são editáveis.
- **Alternativa rejeitada — tabela separada para notas internas:** duplicaria o modelo, a paginação e a ordenação conjunta (a equipe vê a conversa intercalada). Um booleano com filtro obrigatório no `where` para `CUSTOMER` (decisão 4) é suficiente.

### 2. `CommentsController` em `tickets/:ticketId/comments`, reaproveitando `findVisibleOrFail`

```ts
@Controller('tickets/:ticketId/comments')
export class CommentsController {
  @Post() @HttpCode(HttpStatus.CREATED)
  create(@Param('ticketId', ParseUUIDPipe) ticketId, @Body() dto: CreateCommentDto, @CurrentUser() user)
  @Get()
  list(@Param('ticketId', ParseUUIDPipe) ticketId, @Query() query: PaginationQueryDto, @CurrentUser() user)
}
```

`CommentsModule` (`src/comments/`) importa `TicketsModule`; `TicketsModule` passa a ter `exports: [TicketsService]`. `CommentsModule` é importado no `AppModule` e usa o `PrismaService` global.

Em `CommentsService.create(ticketId, dto, user)` e `CommentsService.list(ticketId, query, user)`, **a primeira operação é `await this.ticketsService.findVisibleOrFail(ticketId, user)`** — antes de avaliar a política, consultar ou gravar comentários. O `TicketView` devolvido fornece `status`, `customer.id` e `assignee?.id` para as decisões seguintes, sem segunda leitura do ticket.

- Ticket inexistente e invisível respondem igual (`404`), com a mesma mensagem das rotas de ticket, porque é a mesma função.
- Um `CUSTOMER` enviando `isInternal: true` para ticket de outro cliente recebe `404`, não `403`: a visibilidade vem antes da política, e o `403` não confirma a existência do ticket.
- **Alternativa rejeitada — consultar `prisma.ticket` direto no `CommentsService` com a própria condição de visibilidade:** duplica a regra (fonte de BOLA quando uma das cópias muda) e ignora a convenção do projeto de que toda rota com `:id` de ticket passa por `findVisibleOrFail`.
- **Alternativa rejeitada — rotas de comentário dentro do `TicketsController`:** mistura dois recursos num controller já grande; o módulo separado mantém o `TicketsService` como única dependência.
- **Alternativa rejeitada — `forwardRef` entre módulos:** desnecessário; a dependência é só `comments → tickets`.

### 3. Política pura `commentPolicy`

`src/comments/comment-policy.ts`:

```ts
export type CommentDecision = 'ALLOW' | 'FORBIDDEN_INTERNAL' | 'NOT_ASSIGNED' | 'TICKET_CLOSED';

export interface CommentPolicyInput {
  role: Role;
  isOwner: boolean;      // ticket.customer.id === user.id
  isAssignee: boolean;   // ticket.assignee?.id === user.id
  ticketStatus: TicketStatus;
  isInternal: boolean;   // dto.isInternal ?? false
}

export function commentPolicy(input: CommentPolicyInput): CommentDecision
```

Ordem de verificação (a primeira que casar decide):

1. `role === CUSTOMER && isInternal` → `FORBIDDEN_INTERNAL`. O papel nunca pode criar nota interna, qualquer que seja o ticket.
2. Ator sem vínculo com o ticket → `NOT_ASSIGNED`: `SUPPORT` com `!isAssignee`, ou `CUSTOMER` com `!isOwner`. `ADMIN` sempre tem vínculo. O vínculo é calculado num `switch` sem `default` sobre `Role`, como em `visibilityWhere`: um papel novo sem regra não compila.
3. `ticketStatus === CLOSED` → `TICKET_CLOSED`, para qualquer papel.
4. Caso contrário → `ALLOW`.

Conversão no `CommentsService`:

| Decisão | Exceção | Status |
|---|---|---|
| `FORBIDDEN_INTERNAL` | `ForbiddenException('Apenas a equipe pode criar notas internas')` | `403` |
| `NOT_ASSIGNED` | `UnprocessableEntityException('Apenas o atendente atribuído pode comentar neste ticket')` | `422` |
| `TICKET_CLOSED` | `UnprocessableEntityException('Ticket fechado não aceita comentários')` | `422` |

- **Por que essa ordem:** do mais geral ao mais específico — primeiro o que o papel nunca pode fazer (independe do ticket), depois a relação com o ticket, por último o estado do ticket. Assim um `CUSTOMER` com `isInternal: true` em ticket fechado recebe `403` (a restrição de papel prevalece) e um `SUPPORT` da fila recebe `422` de "não atribuído" mesmo se enviar nota interna. A ordem é fixada nos testes da função.
- `CUSTOMER` sem `isOwner` é inalcançável depois de `findVisibleOrFail` (a visibilidade do cliente é `customerId = user.id`); a política o nega mesmo assim, como defesa em profundidade, no mesmo ramo do `SUPPORT` não atribuído.
- **Por que pura:** o teste percorre papéis × vínculo × status × `isInternal` sem mock de banco, no mesmo estilo de `canTransition`.
- **Alternativa rejeitada — `@Roles` para notas internas:** a nota interna é um valor do corpo, não uma rota; `@Roles` só decide pela rota inteira.
- **Alternativa rejeitada — `if`s encadeados no service:** mistura I/O com regra e torna a ordem implícita.

### 4. Notas internas filtradas no `where` para `CUSTOMER`

```ts
const where: Prisma.CommentWhereInput = {
  AND: [{ ticketId }, user.role === Role.CUSTOMER ? { isInternal: false } : {}],
};
const [data, total] = await this.prisma.$transaction([
  this.prisma.comment.findMany({ where, select: commentSelect,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
  this.prisma.comment.count({ where }),
]);
```

O mesmo `where` é usado em `findMany` e `count`. `SUPPORT` (que só chega aqui com o ticket visível — atribuído a ele ou na fila) e `ADMIN` veem tudo.

- **Por que não filtrar o resultado em memória:**
  - **Paginação e `total` ficariam errados:** `skip`/`take` seriam aplicados antes do filtro — uma página poderia vir com menos itens ou vazia — e `total` contaria as notas internas, revelando ao cliente quantas existem.
  - **O texto sairia do banco:** a nota interna chegaria ao processo da API e bastaria um `return` esquecido, um log ou um erro serializado para vazá-la. Com o filtro na consulta, o dado nunca é lido para um `CUSTOMER`.
  - O `AND` explícito impede que outra condição sobrescreva `isInternal`, como na visibilidade de tickets.
- **Desempate por `id`:** comentários criados no mesmo milissegundo mantêm uma ordem estável entre páginas.

### 5. Transação interativa: comentário + retomada condicional

```ts
const resume = user.role === Role.CUSTOMER && isOwner && ticket.status === TicketStatus.WAITING_CUSTOMER;

return this.prisma.$transaction(async (tx) => {
  const comment = await tx.comment.create({
    data: { ticketId, authorId: user.id, body: dto.body, isInternal: dto.isInternal ?? false },
    select: commentSelect,
  });
  if (resume) {
    const { count } = await tx.ticket.updateMany({
      where: { id: ticketId, status: TicketStatus.WAITING_CUSTOMER },
      data: { status: TicketStatus.IN_PROGRESS },
    });
    if (count === 0) throw new ConflictException('O ticket foi alterado por outra requisição');
  }
  return comment;
});
```

- Toda criação usa a transação interativa; o `updateMany` só roda quando `resume` é verdadeiro. Comentários de `SUPPORT`/`ADMIN` nunca tocam o ticket.
- **Condição `status: WAITING_CUSTOMER` no `updateMany`:** compare-and-set, como nas escritas de ticket. Se outra requisição mudou o status depois de `findVisibleOrFail` (ex.: o atendente resolveu), `count === 0` → a exceção **dentro** da transação desfaz o `comment.create` → `409` sem comentário. Aqui o rollback é o comportamento desejado (diferente da rotação de refresh token, que não pode lançar dentro da transação para comitar a revogação).
- O `assigneeId` não é alterado: a retomada mantém o atendente.
- **Alternativa rejeitada — `$transaction([create, updateMany])` em lote:** não permite examinar o `count` e desfazer o comentário.
- **Alternativa rejeitada — gravar o comentário e depois chamar `TicketsService.changeStatus`:** duas transações (comentário sem retomada se a segunda falhar) e `canTransition` não permite `WAITING_CUSTOMER → IN_PROGRESS`, que é automática e não uma transição da rota de status.

### 6. DTOs e formato da resposta

- `CreateCommentDto` (`src/comments/dto/create-comment.dto.ts`):
  - `body`: `@Trim()` (o `@Transform` compartilhado de `src/common/dto/trim.ts`), `@IsString()`, `@IsNotEmpty()`, `@MaxLength(5000)`. Como o trim roda antes da validação, `"     "` vira `""` e cai em `@IsNotEmpty()`.
  - `isInternal?`: `@IsOptional()`, `@IsBoolean()`. O corpo é JSON, então `"true"` (string) → `400`; não há conversão implícita.
  - Sem `authorId`, `ticketId` nem `createdAt`: o `ValidationPipe` os recusa com `400`.
- Listagem: `PaginationQueryDto` diretamente (padrão 20, máximo 100), sem DTO próprio.
- `src/comments/comment-select.ts`:

```ts
export const commentSelect = {
  id: true, body: true, isInternal: true, createdAt: true,
  author: { select: userSummarySelect },
} satisfies Prisma.CommentSelect;
export type CommentView = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;
```

  `userSummarySelect` é importado de `src/tickets/ticket-select.ts` — nunca `include: { author: true }`, que traria `email` e `passwordHash`. `ticketId` e `authorId` não são expostos.
- Retornos: `create` → `Promise<CommentView>`; `list` → `Promise<Paginated<CommentView>>`.

### 7. Fluxo de testes commitados antes do apply

Os testes unitários são escritos a partir dos cenários da spec e commitados (`test(comments): testes dos cenários da change 005`) **antes** de qualquer código de produção. Durante a implementação nenhum `.spec.ts` é alterado; `git diff HEAD~1 --stat -- '*.spec.ts'` após o commit de implementação deve sair vazio.

Como os testes não podem mudar depois, eles fixam o contrato que a implementação deve seguir:

| Arquivo de teste | Importa | Contrato fixado |
|---|---|---|
| `src/comments/comment-policy.spec.ts` | `commentPolicy` de `./comment-policy` | entrada e retornos da decisão 3, incluindo a ordem |
| `src/comments/comments.service.spec.ts` | `CommentsService`, `commentSelect`, `TicketsService`, `PrismaService` | `create(ticketId, dto, user)` e `list(ticketId, query, user)`; decisões 2, 4 e 5 |
| `src/comments/dto/create-comment.dto.spec.ts` | `CreateCommentDto` | decisão 6 |

- **Mocks no `CommentsService`:** `Test.createTestingModule` com `{ provide: TicketsService, useValue: { findVisibleOrFail: jest.fn() } }` e `{ provide: PrismaService, useValue: prisma }`, em que `prisma.$transaction` recebe callback **ou** array: `jest.fn((arg) => typeof arg === 'function' ? arg(tx) : Promise.all(arg))`, com `tx = { comment: { create }, ticket: { updateMany } }` e `prisma.comment = { findMany, count }`. Os testes verificam que, quando `findVisibleOrFail` rejeita com `NotFoundException`, nem `$transaction` nem `comment.*` são chamados.
- Os testes do DTO usam `plainToInstance` + `validate` com `whitelist`/`forbidNonWhitelisted`, como `src/tickets/dto/ticket-dtos.spec.ts`.
- **Estado "vermelho":** no commit de testes os módulos importados não existem, então as suítes de `comments` falham (módulo não encontrado) e `npx tsc --noEmit` falha; as demais suítes continuam passando. Isso é esperado até a implementação.
- **Alternativa rejeitada — criar esqueletos antes dos testes (como na change 004):** exigiria definir assinaturas antes de derivá-las dos cenários e misturaria código de produção no commit de testes, enfraquecendo a prova de que os testes antecedem a implementação.

## Autorização

Sem `@Roles` nas duas rotas: qualquer autenticado chega ao service, e a decisão depende do ticket.

| Camada | Onde | Resultado |
|---|---|---|
| Autenticação | `JwtAuthGuard` global | `401` sem token |
| `:ticketId` malformado | `ParseUUIDPipe` | `400` |
| Corpo/query inválidos | `ValidationPipe` global | `400` |
| Visibilidade do ticket | `findVisibleOrFail` — primeira operação das duas rotas | `404` (inexistente = invisível, nunca `403`) |
| Nota interna por `CUSTOMER` | `commentPolicy` → `FORBIDDEN_INTERNAL` | `403` |
| `SUPPORT` não atribuído | `commentPolicy` → `NOT_ASSIGNED` | `422` |
| Ticket `CLOSED` | `commentPolicy` → `TICKET_CLOSED` | `422` |
| Leitura de notas internas | `isInternal: false` no `where` para `CUSTOMER` | item e contagem omitidos |

Pipes rodam antes do service: um corpo inválido enviado para o ticket de outro cliente recebe `400`, o que não revela nada sobre o ticket.

## Risks / Trade-offs

- [`body` com HTML/script (XSS armazenado)] → a API armazena e devolve texto puro, como JSON (`Content-Type: application/json`), sem renderizar; o risco está em um front-end que injete o `body` como HTML. Mitigação: documentar que `body` é texto não confiável e deve ser exibido escapado. Sanitizar na entrada foi rejeitado: altera o que o usuário escreveu, dá falsa sensação de segurança e formatação rica está fora do escopo.
- [Status alterado entre a leitura e a transação] → na retomada, o `updateMany` condicionado a `WAITING_CUSTOMER` detecta a mudança e desfaz o comentário (`409`). Nos demais casos não há condição sobre o ticket: um comentário de `SUPPORT`/`ADMIN` pode ser gravado milissegundos depois de o ticket ser fechado, ou por um atendente recém-substituído. Aceito: o comentário não muda o ticket, fica registrado com o autor real e a janela é mínima; bloquear exigiria `SELECT ... FOR UPDATE` em toda criação.
- [Rota nova de comentário que esqueça `findVisibleOrFail`] → os testes do service exigem que ele seja chamado antes de qualquer acesso a `comment`; a tabela de Autorização serve de checklist em revisão.
- [Novo papel no enum `Role` sem regra de comentário] → o `switch` exaustivo do vínculo em `commentPolicy` deixa de compilar.
- [Papel do token desatualizado (até 15 min)] → mesma limitação das changes anteriores; a visibilidade e o vínculo vêm do ticket no banco.
- [Crescimento de `comments`] → o índice `[ticketId, createdAt]` mantém a listagem paginada eficiente; `count` por ticket é barato no volume de um helpdesk.

## Migration Plan

1. Adicionar o modelo `Comment` e as listas `comments` em `Ticket` e `User`; rodar `npx prisma migrate dev --name create-comments` e depois `npx prisma generate` (no Prisma 7 o migrate não regenera o client).
2. A migration cria a tabela `comments`, as FKs (`ticket_id` com `ON DELETE CASCADE`, `author_id` com `ON DELETE RESTRICT`) e o índice `(ticket_id, created_at)`. Não altera colunas de `tickets` nem `users`; não há backfill.
3. Os e2e existentes não precisam mudar a limpeza: apagar `tickets` remove os comentários em cascata antes de `users`.
4. Deploy: `npx prisma migrate deploy` antes de subir a nova versão da API.
5. Rollback: reverter a versão da API; a tabela pode permanecer (não é lida pela versão anterior) ou ser removida com `DROP TABLE comments;`.
