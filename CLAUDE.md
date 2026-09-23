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

npm test                              # testes unitários (*.spec.ts em src/)
npx jest src/app.controller.spec.ts   # um arquivo
npx jest -t "nome do teste"           # um teste pelo nome
npm run test:e2e                      # e2e (test/*.e2e-spec.ts, config em test/jest-e2e.json)

npx prisma generate                   # regenera o client em src/generated/prisma
npx prisma migrate dev --name <nome>  # cria/aplica migration em prisma/migrations
```

## Arquitetura e particularidades

- **Prisma 7 com driver adapter**: o client é gerado pelo provider `prisma-client` em `src/generated/prisma` (ignorado pelo git — rode `npx prisma generate` após clonar ou alterar o schema). Importe de `../generated/prisma/client`, não de `@prisma/client`.
- A configuração do CLI do Prisma fica em `prisma7.config.ts` (schema, pasta de migrations e `DATABASE_URL`); o `datasource` do `schema.prisma` não tem `url`.
- `PrismaService` (`src/prisma/`) estende o `PrismaClient` usando `@prisma/adapter-pg` com `process.env.DATABASE_URL`. `PrismaModule` exporta o service; módulos de feature devem importar `PrismaModule`.
- Variáveis de ambiente vêm de `.env` via `import 'dotenv/config'` em `src/main.ts` (não há `@nestjs/config`).
- TS com `module: nodenext` e `strict: true` (mas `strictPropertyInitialization: false`).

## Regras de domínio (resumo do PRD)

- Papéis: `CUSTOMER`, `SUPPORT`, `ADMIN`. **Nunca use `AGENT`** como papel.
- Status de ticket: `OPEN → IN_PROGRESS → WAITING_CUSTOMER / RESOLVED → CLOSED`, com transições restritas por papel conforme a tabela do PRD. `OPEN → IN_PROGRESS` só pela rota de atribuição; `WAITING_CUSTOMER → IN_PROGRESS` é automático quando o cliente dono comenta; transições para `CLOSED` preenchem `closedAt`; ticket `CLOSED` não aceita mudança de status nem comentário.
- Convenção de erros HTTP: 401 sem/token inválido; 403 papel sem acesso à rota; **404 para registro que o usuário não pode ver** (não 403); 409 conflito (e-mail duplicado, alteração concorrente); 422 regra de negócio (transição inválida, categoria inativa); 429 rate limit.
- Não funcionais: hash de senha resistente a força bruta; access token de 15 min + refresh token opaco com rotação e detecção de reutilização; rate limit global e nas rotas de auth; nenhuma resposta/log com senha, hash ou tokens; OpenAPI apenas fora de produção; e2e contra PostgreSQL real.

## Fluxo com OpenSpec

Mudanças são planejadas com OpenSpec (schema `spec-driven`): `openspec/changes/<change>/` contém `proposal.md`, `specs/`, `design.md` e `tasks.md`; specs consolidadas ficam em `openspec/specs/`. Use os comandos `/opsx:propose`, `/opsx:apply`, `/opsx:archive`, `/opsx:explore`, `/opsx:sync`, `/opsx:update` (em `.claude/commands/opsx/`). O `propose` só gera artefatos de planejamento — não implemente código na mesma etapa.
