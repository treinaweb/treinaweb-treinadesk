# TreinaDesk API

API REST de helpdesk (tickets de suporte) construída com **NestJS 12 + Prisma 7 + PostgreSQL** e TypeScript 6.

> **Autor:** Wesley Gado ([wesleygado@gmail.com](mailto:wesleygado@gmail.com))
> Este repositório é o projeto prático do curso de **desenvolvimento de APIs com SDD (Spec-Driven Development)**, criado e mantido por mim. Esta é a primeira versão, publicada no meu repositório pessoal.

---

## A ideia do projeto

O objetivo não é só entregar uma API de helpdesk, e sim mostrar **como construir uma API guiada por especificações**, com um agente de IA como par de programação, sem abrir mão de rigor.

O fluxo que o curso ensina é:

1. **PRD como fonte de verdade**: [`openspec/docs/prd.md`](openspec/docs/prd.md) define papéis, matriz de permissões, fluxo de status, convenção de erros HTTP e requisitos não funcionais.
2. **Uma change por vez**: cada funcionalidade vira uma change do [OpenSpec](https://github.com/Fission-AI/OpenSpec) em `openspec/changes/<change>/`, com:
   - `proposal.md`: o porquê e o escopo;
   - `specs/`: requisitos e cenários em português (SHALL/MUST, GIVEN/WHEN/THEN) descrevendo só **comportamento observável** (rota, status HTTP, corpo da resposta);
   - `design.md`: decisões técnicas (bibliotecas, modelos Prisma, classes);
   - `tasks.md`: tarefas em que **o teste de cada cenário vem antes da implementação**.
3. **Propor → aplicar → arquivar**: `/opsx:propose` só gera artefatos de planejamento. `/opsx:apply` implementa. `/opsx:archive` consolida as specs em `openspec/specs/`.
4. **Verificação no fim de toda change**: `npm test`, `npx tsc --noEmit` e `npm run test:e2e` contra PostgreSQL real. Depois, os dados de teste do cenário entram em `prisma/dev-data.ts`.
5. **Contexto para o agente**: o [`CLAUDE.md`](CLAUDE.md) guarda as convenções e armadilhas do projeto, para que cada nova change siga as mesmas regras.

### Changes já implementadas

| # | Change | O que entrega |
|---|---|---|
| 001 | `user-management` | Cadastro público de clientes, ADMIN inicial via seed, gestão da equipe e de papéis |
| 002 | `authentication` | Login, access token JWT, refresh token opaco com rotação e detecção de reutilização, logout |
| 003 | `role-authorization` | Autorização por papel (`CUSTOMER`, `SUPPORT`, `ADMIN`) e categorias com ativação/desativação |
| 004 | `tickets` | Abertura, visibilidade por papel, atribuição e fluxo de status |
| 005 | `comments` | Comentários públicos, notas internas e retomada automática `WAITING_CUSTOMER → IN_PROGRESS` |

O histórico completo está em `openspec/changes/archive/`, e as specs consolidadas em `openspec/specs/`.

---

## Domínio

- **Papéis:** `CUSTOMER` (abre e acompanha os próprios tickets), `SUPPORT` (atende a fila e os tickets atribuídos a ele), `ADMIN` (vê tudo, gerencia usuários e categorias).
- **Status do ticket:** `OPEN → IN_PROGRESS → WAITING_CUSTOMER / RESOLVED → CLOSED`, com transições restritas por papel (tabela no PRD).
- **Convenção de erros:** `401` sem token ou token inválido · `403` papel sem acesso à rota · `404` registro que o usuário não pode ver (nunca `403`) · `409` conflito ou alteração concorrente · `422` regra de negócio.

### Rotas

| Método | Rota | Acesso |
|---|---|---|
| `POST` | `/users` | Público (cadastro de cliente) |
| `POST` | `/users/staff` · `GET /users` · `PATCH /users/:id/role` | ADMIN |
| `GET` | `/users/me` | Autenticado |
| `POST` | `/auth/login` · `/auth/refresh` | Público |
| `POST` | `/auth/logout` | Autenticado |
| `GET` / `POST` / `PATCH` | `/categories`, `/categories/:id` | Leitura autenticada; escrita ADMIN |
| `POST` / `GET` | `/tickets`, `/tickets/:id` | Por papel, com visibilidade por registro |
| `PATCH` | `/tickets/:id/assign` · `/tickets/:id/status` | Conforme a matriz do PRD |
| `POST` / `GET` | `/tickets/:ticketId/comments` | Conforme a matriz do PRD |

---

## Como rodar

**Pré-requisitos:** Node **>= 24.9** (veja `.nvmrc`) e PostgreSQL.

```bash
npm install
npx prisma generate                  # gera o client em src/generated/prisma (ignorado pelo git)
npx prisma migrate dev               # aplica as migrations
npm run seed                         # ADMIN inicial + dados de teste (idempotente)
npm run start:dev                    # http://localhost:3000
```

Crie um `.env` na raiz com:

```dotenv
DATABASE_URL=postgresql://usuario:senha@localhost:5432/treinadesk
JWT_ACCESS_SECRET=troque-por-um-segredo-longo-e-aleatorio
JWT_ACCESS_EXPIRES_IN=15m
REFRESH_TOKEN_TTL_DAYS=7
ADMIN_EMAIL=admin@exemplo.com
ADMIN_PASSWORD=uma-senha-forte
PORT=3000
```

Fora de produção, o seed cria usuários de teste com a senha `senhaSegura123`: `ana@teste.com` (CUSTOMER), `bia@teste.com` (SUPPORT) e `diego@teste.com` (ADMIN).

### Testes

```bash
npm test                  # unitários
npm run test:e2e          # e2e contra o PostgreSQL de DATABASE_URL
npx tsc --noEmit          # checagem de tipos
npm run lint              # oxlint
```

> ⚠️ Os testes e2e **apagam** as tabelas `tickets`, `categories` e `users` (e, em cascata, `refresh_tokens` e `comments`). Aponte `DATABASE_URL` para um banco de desenvolvimento ou de teste e rode `npm run seed` depois.

Use sempre os scripts do `package.json`, e não `npx jest` direto: o NestJS 12 é ESM-only e o Jest precisa de `--experimental-vm-modules`.

---

## Pontos fortes

- **Especificação antes do código**: cada comportamento tem requisito, cenário e teste rastreáveis (PRD → spec → tarefa → teste → implementação).
- **Autenticação obrigatória por padrão**: `JwtAuthGuard` global. Só rotas marcadas com `@Public()` ficam abertas, então esquecer um guard não expõe uma rota.
- **Ordem correta dos guards**: `401` (autenticação) é avaliado antes de `403` (papel).
- **Proteção contra BOLA/IDOR**: toda rota de ticket passa por `findVisibleOrFail`. Registro inexistente e invisível respondem igual (`404`), sem vazar a existência do dado.
- **Senhas com Argon2id** e validação de tamanho (8 a 128).
- **Refresh token opaco** guardado só como SHA-256, com rotação por compare-and-set e revogação da família em caso de reutilização.
- **Controle de concorrência otimista**: escritas em ticket usam `updateMany` condicionado ao estado lido (`count === 0` → `409`).
- **Regras de negócio isoladas e puras**: `canTransition` e `commentPolicy` são funções testáveis sem banco.
- **Sem vazamento de dados sensíveis**: respostas usam `select` explícito (`ticketSelect`, `userSummarySelect`), nunca `include` do `User`.
- **Validação estrita**: `ValidationPipe` global com `whitelist` e `forbidNonWhitelisted`. Campos não declarados retornam `400`.
- **Notas internas filtradas na consulta** (`where`), não em memória.
- **Testes e2e contra PostgreSQL real**, não contra mocks.
- **Stack atual**: NestJS 12 ESM, Prisma 7 com driver adapter (`@prisma/adapter-pg`), TypeScript 6 `strict`.

---

## O que revisar antes de ir para produção

Esta versão é **didática**. Os itens abaixo estão fora do que foi implementado até aqui ou precisam de endurecimento:

### Requisitos do PRD ainda pendentes
- [ ] **Rate limiting** global e específico em `/auth/login` e `/auth/refresh` (ex.: `@nestjs/throttler` com armazenamento compartilhado, como Redis, em múltiplas instâncias). Hoje o login não tem proteção contra força bruta além do custo do Argon2.
- [ ] **Documentação OpenAPI** (Swagger), habilitada apenas fora de produção.
- [ ] **Testes e2e de comentários**: a change 005 tem testes unitários, mas ainda não tem `test/comments.e2e-spec.ts`.

### Segurança
- [ ] Cabeçalhos HTTP de segurança (`helmet`) e **CORS** explícito por origem.
- [ ] Limite de tamanho do corpo da requisição e `trust proxy` corretos atrás de balanceador.
- [ ] Gestão de segredos (`JWT_ACCESS_SECRET`, credenciais do banco) em cofre ou variáveis do provedor, não em `.env`. Também um plano de **rotação da chave JWT** (hoje HS256 com segredo único; considerar chaves assimétricas e `kid`).
- [ ] Revisar a política de senha (lista de senhas vazadas, por exemplo) e bloqueio progressivo por conta.
- [ ] Remover a senha fixa dos dados de teste e garantir que `prisma/dev-data.ts` **nunca** rode em produção (hoje depende de `NODE_ENV=production`).
- [ ] Auditoria de dependências (`npm audit`) e atualizações automatizadas.

### Operação e observabilidade
- [ ] **Logs estruturados** (JSON) com correlação por request id, garantindo que senhas, hashes e tokens nunca sejam registrados.
- [ ] **Health checks** (`/health` de liveness e readiness com verificação do banco).
- [ ] `enableShutdownHooks()` e encerramento gracioso do pool do Prisma.
- [ ] Filtro global de exceções para padronizar o corpo de erro e não expor detalhes internos (erros do Prisma, stack).
- [ ] Métricas e tracing (ex.: OpenTelemetry).
- [ ] Validação das variáveis de ambiente na inicialização (falhar cedo se faltar alguma).

### Banco de dados
- [ ] Usar `prisma migrate deploy` (não `migrate dev`) no pipeline de produção.
- [ ] **Job de limpeza** de `refresh_tokens` expirados ou revogados.
- [ ] Revisar os índices para as consultas de listagem (fila do SUPPORT, filtros por status) com volume real.
- [ ] Pool de conexões dimensionado e backup/restore testados.
- [ ] Banco **isolado** para os e2e, para que eles nunca apontem para um banco com dados reais.

### Entrega
- [ ] Pipeline de CI rodando lint, `tsc --noEmit`, testes unitários e e2e (PostgreSQL em container).
- [ ] `Dockerfile` multi-stage e `docker-compose` para desenvolvimento.
- [ ] Arquivo `.env.example` versionado.
- [ ] Definir licença (hoje `UNLICENSED` no `package.json`) e preencher `author`/`description`.

### Fora do escopo do MVP (por decisão do PRD)
Anexos, envio de e-mail, SLA, múltiplas empresas, frontend, recuperação de senha e exclusão de dados (LGPD). Todos são necessários em um produto real.

---

## Estrutura

```
openspec/
  docs/prd.md            # requisitos do produto (fonte de verdade)
  specs/                 # specs consolidadas por capacidade
  changes/archive/       # histórico das changes (proposal, specs, design, tasks)
prisma/
  schema.prisma          # modelos e enums
  migrations/
  seed.ts, dev-data.ts   # ADMIN inicial + dados de teste
src/
  auth/                  # login, refresh, guards, @Public, @Roles, @CurrentUser
  users/                 # cadastro, equipe, papéis, hash de senha
  categories/
  tickets/               # visibilidade, transições, atribuição
  comments/              # comentários e notas internas
  common/dto/            # paginação e utilitários de validação
  prisma/                # PrismaService (driver adapter pg)
test/                    # e2e (supertest + PostgreSQL real)
```

---

Feito por **Wesley Gado** como material do curso prático de desenvolvimento de APIs com SDD.
