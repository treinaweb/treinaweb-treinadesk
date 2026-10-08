# Design

## Context

A motivação está em `proposal.md` (Why) e o comportamento das rotas novas em `specs/api-docs/spec.md`.

O estado atual que importa para esta change (depois das changes 001 a 005):

- `main.ts` só cria a aplicação e chama `listen(PORT ?? 3000)`. Os e2e **não** passam pelo `main.ts`: montam a aplicação com `Test.createTestingModule({ imports: [AppModule] })`.
- `JwtAuthGuard` e `RolesGuard` são `APP_GUARD`. Toda rota de controller exige token, exceto as marcadas com `@Public()`: `POST /users`, `POST /auth/login` e `POST /auth/refresh`. `GET /` (`AppController`) exige token.
- As respostas são tipos derivados de `select` do Prisma (`TicketView`, `CategoryView`, `PublicUser`, `CommentView`), interfaces (`TokenPair`, `Paginated<T>`) e não classes. O Swagger não consegue inferir esses tipos.
- Os DTOs usam `class-validator`/`class-transformer` (`@Length`, `@IsEnum`, `@Trim()`...), sem nenhuma anotação de documentação.
- O formato de erro é o padrão do Nest: `{ statusCode, message, error }`, em que `message` é uma lista de strings nos `400` do `ValidationPipe`.
- O pacote é ESM, e os testes rodam em CommonJS via ts-jest. O build usa `nest build` sem plugins no `nest-cli.json`.
- `@nestjs/swagger` 12.0.2 tem peer `@nestjs/common`/`@nestjs/core` `^12.0.0` e TypeScript `^5.5 || ^6`.

## Goals / Non-Goals

**Goals:**
- O mesmo documento OpenAPI em `npm run start:dev`, nos e2e e na Vercel.
- Documentação 100% aditiva: decorators de metadados e classes que não são usadas em runtime. Nenhuma linha de regra, validação ou `select` muda.
- Um teste que falhe quando surgir uma rota sem documentação de autenticação.
- O guia como fonte única do comportamento para o frontend. O OpenAPI cuida da forma dos dados.

**Non-Goals:**
- Gerar SDK/cliente TypeScript neste repositório. Isso fica com o frontend, a partir do `/docs-json`.
- Validar as respostas em runtime contra o schema.
- Exemplos completos de código Next.js no guia além de trechos curtos ilustrativos. O código do frontend é do outro curso.

## Decisions

### 1. `@nestjs/swagger` com decorators explícitos, sem o plugin da CLI

As propriedades dos DTOs recebem `@ApiProperty`/`@ApiPropertyOptional` com `type`, `enum`, `minLength`/`maxLength`, `format: 'uuid'`/`'email'`, `example` e `description` iguais às regras do `class-validator` ao lado.

- **Alternativa rejeitada: plugin `@nestjs/swagger` no `nest-cli.json`.** O plugin gera os metadados por transformação de AST no `nest build`. O ts-jest dos e2e não aplica a transformação, então `/docs-json` nos testes sairia diferente do de produção, e a spec seria testada contra um documento que ninguém usa. O build da Vercel também passaria a depender do plugin. Com decorators explícitos, o que está no código é o que sai.
- **Custo:** limites duplicados (`@Length(5, 120)` e `minLength: 5, maxLength: 120`). Mitigação: o decorator fica na linha de cima do validador, e o e2e verifica os limites de `POST /tickets`.

### 2. Configuração isolada em `setupOpenApi(app)`

`src/openapi/setup-openapi.ts` exporta `setupOpenApi(app: INestApplication)`, que monta o `DocumentBuilder` (título "TreinaDesk API", versão do `package.json` ou `1.0.0`, descrição apontando para o guia, `addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')`) e chama `SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' })`. É chamada no `main.ts` antes do `listen`, **sem condição de `NODE_ENV`**, e pelo e2e novo depois de `createNestApplication()`.

- `SwaggerModule.setup` registra `/docs` e `/docs-json` direto no adaptador HTTP, fora do sistema de controllers. Por isso os `APP_GUARD` não se aplicam e as duas rotas ficam públicas **sem `@Public()`**, e também não entram no próprio documento (spec: "não constam"). O e2e confirma as duas coisas.
- **Alternativa rejeitada: configurar dentro do `main.ts`.** Os e2e não passam por ele e não testariam o documento real.

### 3. Assets do Swagger UI por CDN

`setup` recebe `customCssUrl` e `customJs` apontando para `swagger-ui-dist` com versão fixa no jsDelivr (`https://cdn.jsdelivr.net/npm/swagger-ui-dist@<versão>/...`), em todos os ambientes.

- Na Vercel, a função serverless não serve os arquivos estáticos de `node_modules/swagger-ui-dist` que o `@nestjs/swagger` normalmente entrega, e a página fica em branco. Os assets por CDN resolvem sem configuração da Vercel.
- **Trade-off:** a página `/docs` precisa de internet também no local. O `/docs-json` funciona offline. Comportamento único em vez de "CDN só em produção", para que o aluno veja localmente a mesma página da demo.

### 4. Autenticação documentada com um decorator composto `@ApiAuth({ summary, description?, roles? })`

`src/openapi/api-auth.decorator.ts`: `ApiAuth({ summary, description, roles })` aplica `@ApiOperation` (com "Papéis: …" ou "Qualquer usuário autenticado." acrescentado à descrição), `@ApiBearerAuth('bearer')`, `@ApiUnauthorizedResponse` e, se houver papéis, `@ApiForbiddenResponse`. Recebe o `summary`/`description` porque `@ApiOperation` repetido sobrescreve o anterior em vez de mesclar. É usado **por método**, ao lado de `@Roles(...)` com os mesmos papéis. As rotas `@Public()` usam só `@ApiOperation`.

- **Alternativa rejeitada: alterar `@Public()`/`@Roles()` para emitir metadados de documentação.** Mexeria em decorators de segurança publicados no curso e misturaria responsabilidades. A regra é não alterar código existente além de anotar.
- **Alternativa rejeitada: segurança global no `DocumentBuilder` com exceção nas públicas.** O `@nestjs/swagger` não tem um "sem segurança" por operação que seja limpo, e esconderia o 401/403 por rota.
- **Drift:** uma rota nova esquecida sem `@ApiAuth` seria documentada como pública. O e2e percorre **todas** as operações de `paths` e exige `security` com `bearer` + resposta `401` em todas, exceto nas três públicas conhecidas.

### 5. Classes de resposta só para documentação

`src/openapi/responses/` contém classes com `@ApiProperty` que espelham os `select`s: `UserSummaryResponse` (`id`, `name`, `role`), `PublicUserResponse` (`id`, `name`, `email`, `role`, `createdAt`), `CategoryResponse` (`id`, `name`, `active`), `TicketResponse` (`id`, `title`, `description`, `status`, `priority`, `category { id, name }`, `customer`, `assignee` anulável, `createdAt`, `updatedAt`, `closedAt` anulável), `CommentResponse` (`id`, `body`, `isInternal`, `createdAt`, `author`), `TokenPairResponse` e `ErrorResponse` (`statusCode`, `message` como string ou lista de strings, `error`). Um helper `PaginatedResponse(Item)` gera classes concretas (`PaginatedTickets`, `PaginatedUsers`, `PaginatedComments`) com `data`, `page`, `limit` e `total`.

Os controllers referenciam essas classes **só** em `@ApiOkResponse({ type })`/`@ApiCreatedResponse({ type })`. As assinaturas dos métodos continuam retornando `TicketView` etc., então o runtime não muda.

- **Alternativa rejeitada: trocar os retornos para classes e mapear.** Seria mudança de comportamento disfarçada (serialização), além de mexer nos services.
- **Drift:** um campo novo num `select` que não for para a classe de resposta. Mitigação: o e2e confere `customer`/`assignee` de `TicketResponse` contra as chaves de `userSummarySelect` e verifica que nenhum schema tem `passwordHash`. O `CLAUDE.md` passa a dizer que um `select` alterado exige atualizar a classe em `src/openapi/responses/`.

### 6. Erros por operação

Cada método declara os status que a rota realmente devolve hoje (levantados dos `throw` nos services e do `ValidationPipe`), todos com `ErrorResponse`. Exemplos: `POST /tickets` → `400`, `401`, `403` (não-`CUSTOMER`), `422` (categoria inativa ou inexistente); `PATCH /tickets/{id}/status` → `400`, `401`, `404`, `409`, `422`; `POST /users` → `400`, `409`. As descrições dos `404` dizem "inexistente ou fora da sua visibilidade", que é a convenção do PRD.

### 7. Parâmetros e status de sucesso

- `@ApiParam({ name: 'id', format: 'uuid' })` nas rotas com `:id`/`:ticketId`. O caminho no documento sai como `{id}` automaticamente.
- Query: `PaginationQueryDto` e `ListTicketsQueryDto` recebem `@ApiPropertyOptional` com `default` e `maximum` (`100` em geral, `50` em `GET /tickets`). Como as propriedades são da classe usada em `@Query()`, o Swagger as expande em parâmetros.
- O status de sucesso documentado segue o `@HttpCode` existente: `POST /auth/login` e `POST /auth/refresh` → `200`, `POST /auth/logout` → `204`, criações → `201`.
- `@ApiTags` por controller (`users`, `auth`, `categories`, `tickets`, `comments`, `app`) para agrupar a UI.

### 8. Guia `docs/integracao-frontend.md`

Markdown em português, curto e orientado a tarefas, com estas seções:

1. **Rodando junto**: API em `http://localhost:3000`, Next com `next dev -p 3001`. `API_URL=http://localhost:3000` no `.env.local` do Next, **sem** `NEXT_PUBLIC_`. Links para `/docs` e `/docs-json` (e `npx openapi-typescript http://localhost:3000/docs-json -o src/types/api.ts`).
2. **Arquitetura BFF**: diagrama navegador ↔ Next (cookies httpOnly) ↔ API (Bearer). Toda chamada à API parte do servidor do Next, então não existe CORS. `fetch` direto do navegador para a API não é suportado.
3. **Login**: Server Action chama `POST /auth/login`, grava `access_token` e `refresh_token` em cookies `httpOnly`, `sameSite: 'lax'`, `secure` em produção, `path: '/'`. O `maxAge` acompanha `JWT_ACCESS_EXPIRES_IN` (15 min) e `REFRESH_TOKEN_TTL_DAYS` (7 dias). `401` mostra uma mensagem genérica.
4. **Chamando rotas protegidas**: helper server-only que lê o cookie e envia `Authorization: Bearer`. Server Components só **leem** cookies e não conseguem gravá-los.
5. **Refresh**: no `proxy.ts` (o antigo `middleware.ts`), decodificar o `exp` do access token sem validar e, se faltar menos de 60 s, chamar `POST /auth/refresh` e regravar **os dois** cookies, porque o refresh token é rotacionado a cada uso. Seção "Por que antes de expirar": diagrama de duas requisições concorrentes reaproveitando o mesmo refresh token → a API trata como reutilização e revoga a sessão. Refresh com `401` → apagar os cookies e redirecionar para `/login`, sem nova tentativa. Ignorar prefetch no matcher do proxy.
6. **Logout**: `POST /auth/logout` com Bearer + `{ refreshToken }` (`204`), depois apagar os cookies.
7. **Erros**: formato `{ statusCode, message, error }`. Tabela 400/401/403/404/409/422 com o que a UI deve fazer. `404` também significa "sem permissão para ver".
8. **Papéis e o que cada um vê/faz**: tabela CUSTOMER/SUPPORT/ADMIN × rotas. Visibilidade de tickets (cliente: os próprios; atendente: fila `OPEN` sem atribuição + os atribuídos a ele; admin: todos).
9. **Ciclo de vida do ticket**: diagrama ASCII dos status com quem pode cada transição (fonte: `canTransition`), `OPEN → IN_PROGRESS` só por `PATCH /tickets/{id}/assign` e a retomada automática `WAITING_CUSTOMER → IN_PROGRESS` quando o cliente comenta.
10. **Comentários e notas internas**: `isInternal` só para equipe. Para o cliente, as notas não aparecem nem no `total`.
11. **Paginação**: `page`/`limit` e `{ data, page, limit, total }`, com limite 50 em tickets e 100 nas demais.
12. **Usuários de teste**: tabela do `prisma/dev-data.ts` (Ana, Bruno, Carlos, Bia, Carla, Diego; senha `senhaSegura123`) e os tickets por status, com o aviso de que os e2e apagam esses dados e que `npm run seed` os restaura.
13. **Demo na Vercel**: a mesma API publicada, só para demonstração. Dados compartilhados e credenciais públicas, então nada pessoal deve ser cadastrado lá.

O README (seção "Rodando localmente") cobre a instalação e aponta para o guia, sem repetir o conteúdo dele.

### 9. `.env.example`

`DATABASE_URL` (exemplo `postgresql://postgres:postgres@localhost:5432/treinadesk`), `JWT_ACCESS_SECRET` (placeholder e comentário de como gerar), `JWT_ACCESS_EXPIRES_IN=15m`, `REFRESH_TOKEN_TTL_DAYS=7`, `PORT=3000`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, com um comentário curto por variável. Sem valores reais.

## Risks / Trade-offs

- [Documentação desatualizada em relação ao código] → O e2e cobre autenticação de todas as operações, a lista exata de rotas e os campos de ticket. O `CLAUDE.md` passa a exigir `@ApiAuth`/classes de resposta em rotas novas.
- [Swagger público expõe a superfície da API na demo] → A superfície já é pública por natureza (curso aberto). O documento não contém segredos nem exemplos com tokens reais. Os `example` usam valores fictícios.
- [CDN indisponível ou sem internet] → `/docs` fica sem UI, mas `/docs-json` segue funcionando, e o guia explica como usá-lo.
- [Incompatibilidade de `@nestjs/swagger` com ESM/Node 24 na Vercel] → Validar com `npm run build` + `node dist/main.js` local e um deploy de verificação. O rollback é remover a chamada a `setupOpenApi` do `main.ts`, sem efeito em outras rotas.
- [Refresh concorrente no frontend] → Não é resolvido na API (está fora do escopo). O guia ensina a renovar antes de expirar e a tratar a revogação.

## Migration Plan

Sem migration de banco. Deploy normal na Vercel. Rollback: reverter o commit (os decorators são inertes) ou só a linha `setupOpenApi(app)` do `main.ts`.
