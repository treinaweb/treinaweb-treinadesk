# Tasks

## 1. Dependência

- [x] 1.1 Instalar `@nestjs/swagger@^12` (`npm install @nestjs/swagger`) e verificar que `npm ls @nestjs/swagger` mostra 12.x sem conflito de peer e que `npx tsc --noEmit` continua passando

## 2. Testes (gerados a partir dos cenários e commitados antes da implementação)

- [x] 2.1 E2e `test/docs.e2e-spec.ts` (app criada como nos demais e2e + `setupOpenApi(app)` antes de `app.init()`, decisão 2) — "Documentação navegável pública": `GET /docs` sem token → `200` e `text/html`; o mesmo com `process.env.NODE_ENV = 'production'` durante a montagem da app (restaurado no `afterEach`)
- [x] 2.2 E2e `test/docs.e2e-spec.ts` — "Documento OpenAPI público": `GET /docs-json` sem token → `200`, `application/json`, `openapi` começando com `"3."`, `info.title` `"TreinaDesk API"`; o conjunto `método + caminho` de `paths` é **exatamente** a lista de 19 operações do cenário "Todas as rotas presentes"; não há `/docs` nem `/docs-json`
- [x] 2.3 E2e `test/docs.e2e-spec.ts` — "Autenticação descrita": `components.securitySchemes.bearer` com `type: http`, `scheme: bearer`, `bearerFormat: JWT`; **toda** operação fora de `POST /users`, `POST /auth/login` e `POST /auth/refresh` tem `security` com `bearer` e resposta `401`; as três públicas não têm `security` com `bearer`; `POST /categories` lista `401` e `403` e a descrição contém `ADMIN`
- [x] 2.4 E2e `test/docs.e2e-spec.ts` — "Corpos e respostas": schema do corpo de `POST /tickets` com `required` incluindo `title`, `description`, `priority` e `categoryId`, `title` com `minLength 5`/`maxLength 120`, `description` `10`/`5000`, `priority` com enum `LOW, MEDIUM, HIGH, URGENT`, `categoryId` `format: uuid`, respostas `201, 400, 401, 403, 422`; `POST /auth/login` `200` com `accessToken`/`refreshToken` string e `401`; `GET /tickets/{id}` `200` com `customer`/`assignee` cujas propriedades são exatamente as chaves de `userSummarySelect`; nenhum schema em `components.schemas` com `passwordHash`; `GET /tickets` `200` com `data`, `page`, `limit`, `total` e parâmetros `page`, `limit`, `status`, `priority`; `POST /auth/logout` lista `204`, `POST /auth/login` `200`, `POST /users` `201`
- [x] 2.5 E2e `test/docs.e2e-spec.ts` — "Comportamento preservado": com a documentação montada, `GET /tickets` e `GET /` sem token → `401`
- [x] 2.6 Rodar `npm run test:e2e -- docs` e verificar que a suíte falha (módulo `src/openapi/setup-openapi` ainda inexistente) e que as demais suítes de `npm test` e `npm run test:e2e` continuam passando; commitar só o arquivo de teste com `test(api-docs): testes dos cenários da change 006`

## 3. Implementação (sem alterar arquivos de teste)

- [x] 3.1 Criar `src/openapi/setup-openapi.ts` (decisões 2 e 3: `DocumentBuilder` com título, descrição apontando para `docs/integracao-frontend.md` e `addBearerAuth(..., 'bearer')`; `SwaggerModule.setup('docs', ..., { jsonDocumentUrl: 'docs-json', customCssUrl, customJs })` com `swagger-ui-dist` em versão fixa no jsDelivr) e chamá-lo no `main.ts` antes do `listen`, sem condição de ambiente; verificar que `npm run test:e2e -- docs` passa nos cenários 2.1 e 2.5
- [x] 3.2 Criar `src/openapi/api-auth.decorator.ts` (`ApiAuth(...roles)`, decisão 4) e `src/openapi/responses/` (`ErrorResponse`, `UserSummaryResponse`, `PublicUserResponse`, `CategoryResponse`, `TicketResponse`, `CommentResponse`, `TokenPairResponse`, `PaginatedResponse(Item)`, decisão 5); verificar com `npx tsc --noEmit`
- [x] 3.3 Anotar os DTOs com `@ApiProperty`/`@ApiPropertyOptional` espelhando os validadores (decisões 1 e 7): `LoginDto`, `RefreshTokenDto`, `CreateUserDto`, `CreateStaffDto`, `ChangeRoleDto`, `CreateCategoryDto`, `UpdateCategoryDto`, `CreateTicketDto`, `AssignTicketDto`, `UpdateStatusDto`, `CreateCommentDto`, `PaginationQueryDto`, `ListTicketsQueryDto`; sem alterar nenhum decorator de validação; verificar que `npm test` (specs de DTO existentes) continua passando
- [x] 3.4 Anotar `AuthController` e `UsersController` (`@ApiTags`, `@ApiOperation`, `@ApiAuth` nas rotas não públicas com os mesmos papéis do `@Roles`, respostas de sucesso e erro da decisão 6, `@ApiParam` uuid); verificar no `/docs-json` local as operações de `users` e `auth`
- [x] 3.5 Anotar `CategoriesController`, `TicketsController`, `CommentsController` e `AppController` da mesma forma; verificar que `npm run test:e2e -- docs` passa por completo
- [x] 3.6 Conferir que nenhuma linha de regra mudou: `git diff --stat` só com `main.ts`, controllers, DTOs (apenas linhas de `@Api*` e imports) e `src/openapi/`; verificar `git diff HEAD~1 -- '*.spec.ts' 'test/*'` vazio em relação ao commit de testes
- [x] 3.7 Atualizar o `CLAUDE.md`: Swagger em `/docs` e `/docs-json` público em todos os ambientes via `setupOpenApi` (fora dos controllers, por isso sem `@Public`); rota nova exige `@ApiAuth(...)` com os mesmos papéis do `@Roles` e classe de resposta em `src/openapi/responses/`; `select` alterado exige atualizar a classe correspondente; decorators explícitos, sem o plugin da CLI; verificar o diff do arquivo

## 4. Documentação para o frontend

- [x] 4.1 Criar `.env.example` (decisão 9) e verificar que contém todas as variáveis lidas em `src/` e `prisma/` (`grep -rn "process.env" src prisma --include=*.ts | grep -v generated`), sem valores reais
- [x] 4.2 Escrever `docs/integracao-frontend.md` com as 13 seções da decisão 8; verificar que a tabela de transições bate com `src/tickets/ticket-transitions.ts`, a visibilidade com `src/tickets/ticket-visibility.ts`, os usuários e tickets com `prisma/dev-data.ts`, e que todo comando e caminho citado existe
- [x] 4.3 Acrescentar ao README a seção "Rodando localmente" (Node >= 24.9 via `.nvmrc`, PostgreSQL, `cp .env.example .env`, `npm install`, `npx prisma migrate deploy`, `npx prisma generate`, `npm run seed`, `npm run start:dev`, links para `http://localhost:3000/docs` e para o guia), mantendo a lista de commits; verificar seguindo os passos num clone limpo (ou num diretório temporário) até `GET /docs` responder `200`
- [x] 4.4 Atualizar `openspec/docs/prd.md`: nova seção "Consumo por frontends" (API como backend do curso de Next.js, executada localmente pelo aluno, Vercel só como demonstração); remover "frontend" de "Fora do escopo", com a frase de que o frontend não faz parte deste repositório; trocar "Documentação OpenAPI fora de produção." por "Documentação OpenAPI disponível em todos os ambientes, com guia de execução local e guia de integração para frontends."; verificar o diff do arquivo

## 5. Verificação

- [x] 5.1 Verificar manualmente com `npm run start:dev`: `/docs` abre a UI com as tags; "Authorize" com o access token de `ana@teste.com` permite executar `GET /tickets` → `200`; sem token, `GET /tickets` pela UI → `401`; `npx openapi-typescript http://localhost:3000/docs-json -o <scratch>/api.ts` gera o arquivo sem erro
- [x] 5.2 Verificar o build de produção: `npm run build` e `NODE_ENV=production node dist/main.js`, `GET /docs` → `200` com a UI carregando os assets do CDN e `GET /docs-json` → `200`
- [x] 5.3 Executar `npm run lint` e verificar que não há erros
- [x] 5.4 Executar `npm test`, `npx tsc --noEmit` e `npm run test:e2e`; verificar que tudo passa sem falhas

## 6. Dados de desenvolvimento

- [x] 6.1 Depois da verificação (os e2e apagam o banco), conferir que `prisma/dev-data.ts` já cobre o que o guia cita (usuários de cada papel e tickets em cada status), sem novas entidades nesta change; rodar `npm run seed` e verificar que termina sem erro e que o login de `ana@teste.com` com `senhaSegura123` funciona pelo `/docs`
