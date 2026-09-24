# Proposal

## Why

Os tickets já podem ser abertos, atribuídos e ter o status alterado, mas cliente e atendente não conseguem conversar dentro deles, e a equipe não tem onde registrar observações que o cliente não deve ler. O PRD prevê comentários públicos e notas internas, e o fluxo de status depende deles: `WAITING_CUSTOMER → IN_PROGRESS` acontece automaticamente quando o cliente dono comenta. Como o mesmo ticket reúne mensagens para o cliente e notas só da equipe, o risco principal é vazar o texto de uma nota interna para o cliente — seja na listagem, na contagem ou em um ticket que ele nem deveria ver.

## What Changes

- Nova rota `POST /tickets/:id/comments`: `body` de 1 a 5000 caracteres, depois de remover os espaços nas extremidades, e `isInternal` opcional → `201` com `id`, `body`, `isInternal`, `createdAt` e `author`. Podem comentar o `CUSTOMER` dono do ticket, o `SUPPORT` atribuído e qualquer `ADMIN`.
  - Ticket inexistente ou invisível para o usuário (de outro cliente, atribuído a outro atendente) → `404`, sem criar comentário.
  - `SUPPORT` em ticket visível que não está atribuído a ele (ticket `OPEN` da fila) → `422`.
  - `body` vazio, só com espaços ou com 5001 caracteres → `400`.
  - Ticket `CLOSED` → `422` para qualquer papel.
- Notas internas: `isInternal: true` só para `SUPPORT` e `ADMIN`; `CUSTOMER` enviando `isInternal: true` → `403`, sem criar comentário. Sem `isInternal`, o comentário é público.
- Nova rota `GET /tickets/:id/comments`: comentários do ticket visível, em ordem de criação, com paginação `page` (padrão `1`) e `limit` (padrão `20`, máximo `100`) → `{ data, page, limit, total }`. Para `CUSTOMER`, notas internas nunca aparecem — nem o texto, nem na contagem de `total`. `SUPPORT` e `ADMIN` veem tudo. Ticket invisível → `404`.
- Retomada automática: comentário do `CUSTOMER` dono em ticket `WAITING_CUSTOMER` muda o status para `IN_PROGRESS` na mesma operação que grava o comentário. Comentários de `SUPPORT`/`ADMIN` não mudam o status.
- `author` traz apenas `id`, `name` e `role` (sem `email` e sem `passwordHash`), na criação e na listagem.

## Capabilities

### New Capabilities
- `comments`: comentários públicos e notas internas em tickets — criação por cliente dono, atendente atribuído e administrador, listagem paginada com ocultação de notas internas para o cliente, bloqueio em ticket fechado e retomada automática de `WAITING_CUSTOMER` para `IN_PROGRESS`.

### Modified Capabilities
Nenhuma. As rotas de tickets continuam com o mesmo comportamento; a transição automática `WAITING_CUSTOMER → IN_PROGRESS` já constava do PRD e passa a ser disparada pela nova rota de comentários.

## Impact

- **Código**: novo módulo `src/comments/` (controller, service, política de comentário, DTO), importado no `AppModule`. O módulo depende de `TicketsService.findVisibleOrFail` para a visibilidade do ticket, sem duplicar a regra; o `TicketsModule` passa a exportar o `TicketsService`.
- **Banco**: migration `create-comments` com a tabela `comments` (chave estrangeira para `tickets` com exclusão em cascata e para `users`) e índice por ticket e data de criação; relações novas em `Ticket` e `User`. As tabelas existentes não mudam de colunas.
- **Dependências**: nenhuma nova.
- **Testes**: gerados a partir dos cenários da spec e **commitados antes da implementação** (política de comentário, `CommentsService` com `TicketsService` e `PrismaService` mockados, DTO). Durante a implementação nenhum arquivo `.spec.ts` é alterado; o diff do commit de implementação prova isso.
- **Dados de desenvolvimento**: `prisma/dev-data.ts` ganha comentários públicos e uma nota interna nos tickets de teste.
- **Clientes da API**: nenhuma rota existente muda; as novas rotas exigem access token.

## Fora do escopo

- Edição e exclusão de comentários.
- Anexos, menções e notificações.
- Formatação rica (Markdown/HTML) no `body`: o texto é armazenado e devolvido como recebido (após o trim).
- Moderação de conteúdo.
- Ordenação configurável da listagem.
