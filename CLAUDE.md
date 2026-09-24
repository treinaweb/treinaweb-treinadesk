# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

TreinaDesk: API REST de helpdesk (tickets de suporte) em **NestJS 12 + Prisma 7 + PostgreSQL**, TypeScript 6. O projeto está no início (scaffold do Nest + integração com Prisma); o escopo funcional está definido em `openspec/docs/prd.md`, que é a fonte de verdade para regras de negócio.

## Comandos

```bash
npm run start:dev        # servidor em watch (porta via PORT, padrão 3000)
npm run build            # nest build -> dist/ (apaga dist antes)
npm run lint             # oxlint src/ test/  (não é ESLint)
npm run format           # prettier (singleQuote, trailingComma: all)

npm test                                   # testes unitários (*.spec.ts)
npm test -- src/app.controller.spec.ts     # um arquivo
npm test -- -t "nome do teste"             # um teste pelo nome
npm run test:e2e                           # e2e (test/*.e2e-spec.ts, config em test/jest-e2e.json)

npx prisma generate                   # regenera o client em src/generated/prisma
npx prisma migrate dev --name <nome>  # cria/aplica migration em prisma/migrations
npm run seed                          # ADMIN inicial (ADMIN_EMAIL/ADMIN_PASSWORD) + dados de teste; idempotente
```

- **Node >= 24.9 obrigatório** (há `.nvmrc`/`engines`). O NestJS 12 é ESM-only e o Jest só carrega ESM via `require` com `--experimental-vm-modules` no Node 24.9+; por isso os scripts de teste chamam `node --experimental-vm-modules node_modules/jest/bin/jest.js`. Não use `npx jest` direto.
- Os configs do Jest mapeiam imports relativos `*.js` para o `.ts` (necessário para o client do Prisma gerado em `nodenext`).
- **Os e2e rodam contra o banco de `DATABASE_URL` (carregado do `.env` via `setupFiles`) e apagam as tabelas `tickets`, `categories` e `users` (e, em cascata, `refresh_tokens`)** — aponte para um banco de desenvolvimento/teste.
- Após `prisma migrate dev`, rode `npx prisma generate`: no Prisma 7 o migrate não regenera o client.

## Arquitetura e particularidades

- **Prisma 7 com driver adapter**: o client é gerado pelo provider `prisma-client` em `src/generated/prisma` (ignorado pelo git — rode `npx prisma generate` após clonar ou alterar o schema). Importe de `../generated/prisma/client`, não de `@prisma/client`.
- A configuração do CLI do Prisma fica em `prisma7.config.ts` (schema, pasta de migrations e `DATABASE_URL`); o `datasource` do `schema.prisma` não tem `url`.
- `PrismaService` (`src/prisma/`) estende o `PrismaClient` usando `@prisma/adapter-pg` com `process.env.DATABASE_URL`. `PrismaModule` é `@Global()` e importado só no `AppModule`; módulos de feature injetam `PrismaService` sem importá-lo.
- Validação global: `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) registrado como `APP_PIPE` no `AppModule` — vale também nos e2e, que não passam pelo `main.ts`. Propriedades não declaradas no DTO retornam 400.
- **Autenticação obrigatória por padrão**: `JwtAuthGuard` é `APP_GUARD` (registrado no `AuthModule`). Toda rota nova exige `Authorization: Bearer <accessToken>`; só rotas marcadas com `@Public()` (`src/auth/public.decorator.ts`) ficam abertas — hoje `POST /users`, `POST /auth/login` e `POST /auth/refresh`. Use `@CurrentUser()` para obter `{ id, email, role }` do token.
- **Autorização por papel**: `@Roles(Role.ADMIN, ...)` (`src/auth/roles.decorator.ts`) restringe a rota; o `RolesGuard` é um segundo `APP_GUARD`, registrado no `AuthModule` **depois** do `JwtAuthGuard` (a ordem garante `401` sem token antes de `403` por papel — não inverta). Rota sem `@Roles` = qualquer autenticado. O papel vem do access token, não do banco.
- Paginação: use `PaginationQueryDto` (`page` padrão 1, `limit` padrão 20, máx. 100) e `Paginated<T>` de `src/common/dto/`, com `$transaction([findMany, count])`. `Trim()` (`src/common/dto/trim.ts`) remove espaços nas extremidades antes da validação.
- **Visibilidade de tickets por registro** (`src/tickets/`): toda rota com `:id` de ticket chama `TicketsService.findVisibleOrFail(id, user)` antes de qualquer regra ou escrita — `findFirst` com `AND: [{ id }, visibilityWhere(user)]`; inexistente e invisível respondem igual, `404` (nunca `403`). Listagens usam `visibilityWhere` no `where`. Rota nova de ticket sem isso é uma falha de BOLA.
- Respostas de ticket usam `ticketSelect`/`userSummarySelect` (`src/tickets/ticket-select.ts`); nunca `include: { customer: true }`, que traria `email` e `passwordHash` do `User`.
- Transições de status só em `canTransition` (`src/tickets/ticket-transitions.ts`). Escritas em ticket são condicionais (`updateMany` filtrando o estado lido; `count === 0` → `409`) e relidas com `ticketSelect`.
- As FKs de `tickets` são `Restrict`: apague `tickets` antes de `categories`/`users` (e2e e scripts).
- Access token JWT HS256 (`JWT_ACCESS_SECRET` obrigatória, `JWT_ACCESS_EXPIRES_IN` padrão `15m`); refresh token opaco guardado só como SHA-256 em `refresh_tokens`, com validade de `REFRESH_TOKEN_TTL_DAYS` (padrão 7). A rotação usa compare-and-set (`updateMany` + `count === 0`) em transação e não lança dentro dela, para que a revogação por reutilização seja comitada.
- Seed em `prisma/seed.ts` (executado com `tsx`, configurado em `migrations.seed` do `prisma7.config.ts`); a lógica do ADMIN fica em `src/users/seed-admin.ts`. Em seguida, fora de `NODE_ENV=production`, roda `prisma/dev-data.ts`: dados de teste que cobrem as specs já implementadas (usuários de cada papel com a senha `senhaSegura123` — ex.: `ana@teste.com` CUSTOMER, `bia@teste.com` SUPPORT, `diego@teste.com` ADMIN — e categorias ativas e a inativa `Legado`). É idempotente e restaura papel, senha e status ao estado descrito no arquivo.
- `tsconfig.json` tem `rootDir: "./"` (exigido pelo TS 6 para o ts-jest); o build usa `tsconfig.build.json` com `rootDir: "./src"`.
- Variáveis de ambiente vêm de `.env` via `import 'dotenv/config'` em `src/main.ts` (não há `@nestjs/config`).
- TS com `module: nodenext` e `strict: true` (mas `strictPropertyInitialization: false`).

## Regras de domínio (resumo do PRD)

- Papéis: `CUSTOMER`, `SUPPORT`, `ADMIN`. **Nunca use `AGENT`** como papel.
- Status de ticket: `OPEN → IN_PROGRESS → WAITING_CUSTOMER / RESOLVED → CLOSED`, com transições restritas por papel conforme a tabela do PRD. `OPEN → IN_PROGRESS` só pela rota de atribuição; `WAITING_CUSTOMER → IN_PROGRESS` é automático quando o cliente dono comenta; transições para `CLOSED` preenchem `closedAt`; ticket `CLOSED` não aceita mudança de status nem comentário.
- Convenção de erros HTTP: 401 sem/token inválido; 403 papel sem acesso à rota; **404 para registro que o usuário não pode ver** (não 403); 409 conflito (e-mail duplicado, alteração concorrente); 422 regra de negócio (transição inválida, categoria inativa); 429 rate limit.
- Não funcionais: hash de senha resistente a força bruta; access token de 15 min + refresh token opaco com rotação e detecção de reutilização; rate limit global e nas rotas de auth; nenhuma resposta/log com senha, hash ou tokens; OpenAPI apenas fora de produção; e2e contra PostgreSQL real.

## Fluxo de trabalho das changes

1. Para cada cenário da spec, **a tarefa de teste vem antes da tarefa de implementação**.
2. A última tarefa de toda change roda `npm test` e `npx tsc --noEmit` (e `npm run test:e2e`).
3. **Ao final da execução de toda change** (depois da verificação, já que os e2e apagam o banco): acrescente em `prisma/dev-data.ts` os dados de teste das entidades e cenários das specs novas — usando os nomes dos cenários quando possível — e rode `npm run seed`. Inclua isso como tarefa no `tasks.md` de cada change.
4. Specs, requisitos e cenários em **português**, mantendo as palavras-chave SHALL, MUST, GIVEN, WHEN, THEN e AND — o validador procura SHALL ou MUST.
5. Specs descrevem comportamento observável (rota, status HTTP, dados da resposta). Bibliotecas, nomes de classe e modelos Prisma ficam no `design.md`.
6. Uma change ativa por vez em `openspec/changes/`.

## Fluxo com OpenSpec

Mudanças são planejadas com OpenSpec (schema `spec-driven`): `openspec/changes/<change>/` contém `proposal.md`, `specs/`, `design.md` e `tasks.md`; specs consolidadas ficam em `openspec/specs/`. Use os comandos `/opsx:propose`, `/opsx:apply`, `/opsx:archive`, `/opsx:explore`, `/opsx:sync`, `/opsx:update` (em `.claude/commands/opsx/`). O `propose` só gera artefatos de planejamento — não implemente código na mesma etapa.
