# Proposal

## Why

A API passa a servir de backend para o curso de Next.js que consome APIs: o aluno clona o repositório, roda a API localmente (porta `3000`) e constrói um frontend independente em Next.js (porta `3001`) que a consome por Server Components, Server Actions e Route Handlers, guardando os tokens em cookies httpOnly do próprio Next. Hoje não há contrato da API que um consumidor externo consiga ler: não existe OpenAPI (o PRD já previa, mas só fora de produção), o README só lista commits, não há `.env.example` e o comportamento que não cabe num contrato — rotação do refresh token com detecção de reutilização, `404` em vez de `403`, transições de status por papel — só está nas specs internas. Como o curso da API já foi publicado, a documentação precisa ser **aditiva**: nenhuma rota, resposta, porta ou regra existente muda.

## What Changes

- Nova rota pública `GET /docs`: Swagger UI com todas as rotas da API, acessível sem token e em todos os ambientes (incluindo a instância de demonstração na Vercel), com o esquema de autenticação Bearer para testar rotas protegidas pelo botão "Authorize".
- Nova rota pública `GET /docs-json`: documento OpenAPI 3 em JSON, para o frontend gerar tipos (ex.: `openapi-typescript`). Descreve, para cada rota, corpo, parâmetros, papéis exigidos, respostas de sucesso com o formato do corpo e os status de erro possíveis.
- Novo guia `docs/integracao-frontend.md`, em português: arquitetura BFF (Next na `3001`, `API_URL` só no servidor), login e cookies httpOnly, refresh no `proxy.ts` antes de o access token expirar e o risco de refresh concorrente com detecção de reutilização, logout, formato e convenção de erros, visibilidade e permissões por papel, máquina de estados do ticket, comentários e notas internas, paginação e usuários de teste do seed.
- README ganha a seção "Rodando localmente" (Node >= 24.9, PostgreSQL, `.env`, migrate, generate, seed, links para `/docs` e para o guia), mantendo a lista de commits.
- Novo `.env.example` com as variáveis que a API lê, sem segredos reais.
- PRD: nova seção "Consumo por frontends" (API como backend do curso de Next.js, executada localmente pelo aluno, Vercel só como demonstração); "frontend" deixa a lista de fora do escopo com a ressalva de que não faz parte deste repositório; o requisito "Documentação OpenAPI fora de produção" passa a "Documentação OpenAPI disponível em todos os ambientes, com guia de execução local e guia de integração para frontends".

## Capabilities

### New Capabilities
- `api-docs`: documentação navegável e legível por máquina da API — Swagger UI e documento OpenAPI públicos, cobrindo todas as rotas, autenticação Bearer, papéis exigidos, formatos de resposta e status de erro.

### Modified Capabilities
Nenhuma. As rotas de usuários, autenticação, categorias, tickets e comentários mantêm exatamente o mesmo comportamento; apenas passam a ser descritas no documento OpenAPI.

## Impact

- **Código**: anotações de documentação (`@nestjs/swagger`) nos controllers e DTOs existentes e classes de resposta usadas só para documentação; configuração do Swagger num módulo próprio chamado pelo `main.ts`. Nenhuma regra, validação, select ou status muda.
- **Dependências**: `@nestjs/swagger` (12.x, compatível com NestJS 12).
- **Documentação**: `docs/integracao-frontend.md`, README, `.env.example`, `openspec/docs/prd.md` e `CLAUDE.md`.
- **Testes**: e2e novo para `/docs` e `/docs-json` (públicos, todas as rotas presentes, Bearer declarado); os e2e existentes não mudam.
- **Banco e dados de desenvolvimento**: nenhuma mudança de schema. `prisma/dev-data.ts` não ganha entidades novas; o guia documenta os usuários e tickets que já existem.
- **Clientes da API**: nenhuma rota existente muda; as duas novas são públicas e somente leitura.

## Fora do escopo

- CORS: o frontend do curso chama a API pelo servidor do Next, onde CORS não se aplica.
- Mudança da porta padrão da API (continua `3000`; o Next roda na `3001`).
- Rate limiting (requisito do PRD que fica para uma change própria).
- Janela de tolerância no refresh token para requisições concorrentes (mudaria o comportamento publicado; o guia ensina a mitigação no frontend).
- `docker-compose` para o PostgreSQL e health check público.
- Cookies emitidos pela própria API.
