# Projeto Prático: Construindo APIs com NestJS e IA

Esse repositório contem o código-fonte produzido durante as aulas do projeto prático "TreinaDesk - API de Helpdesk com SDD" da TreinaWeb.

A API também é o backend do curso de Next.js que consome APIs: rode-a localmente e construa o frontend em um projeto separado.

## Rodando localmente

Pré-requisitos:

- **Node.js 24.9 ou superior** (há um `.nvmrc`: `nvm use`).
- **PostgreSQL** rodando e um banco vazio (ex.: `treinadesk`).

```bash
npm install
cp .env.example .env          # ajuste DATABASE_URL, JWT_ACCESS_SECRET e o ADMIN
npx prisma migrate deploy     # cria as tabelas
npx prisma generate           # gera o client do Prisma em src/generated/prisma
npm run seed                  # ADMIN do .env + usuários, categorias e tickets de teste
npm run start:dev             # API em http://localhost:3000
```

- Documentação interativa (Swagger): http://localhost:3000/docs
- Contrato OpenAPI em JSON: http://localhost:3000/docs-json
- Guia para o frontend (sessão com cookies, refresh, erros, papéis, ciclo do ticket e usuários de teste): [`docs/integracao-frontend.md`](docs/integracao-frontend.md)

Usuários de teste (senha `senhaSegura123`): `ana@teste.com` (CUSTOMER), `bia@teste.com` (SUPPORT), `diego@teste.com` (ADMIN) — a lista completa está no guia.

Testes: `npm test` (unitários) e `npm run test:e2e` (e2e — **apagam os dados do banco do `.env`**; rode `npm run seed` depois).

## Lista de Commits

| Commit | Link |
| --- | --- |
| video 2 - Configurando ambiente | [17a38bd](https://github.com/treinaweb/treinaweb-treinadesk/commit/17a38bd535ede5b299a7de43959e9f8791b83f63) |
| Integração prisma + banco de dados | [a22f794](https://github.com/treinaweb/treinaweb-treinadesk/commit/a22f79403c1d651fce1347522c3c1048d343d17d) |
| instalação OpenSpec | [d42da72](https://github.com/treinaweb/treinaweb-treinadesk/commit/d42da725aa70b7836477065f7e7b3b8842675a89) |
| configuração prd e claude.md | [6de4a60](https://github.com/treinaweb/treinaweb-treinadesk/commit/6de4a601ba8c2cc6521437cb46b20c22383b1d84) |
| Implementação Spec 1 | [bd851d7](https://github.com/treinaweb/treinaweb-treinadesk/commit/bd851d71f81f9fab0ae273028dc1a66e608c3304) |
| implementação spec 2 - autenticação | [1cd2627](https://github.com/treinaweb/treinaweb-treinadesk/commit/1cd26275790c4d99e3d196fd14209922ebcb8d28) |
| implementação spec 3 | [caa4b0b](https://github.com/treinaweb/treinaweb-treinadesk/commit/caa4b0bfbffb317f9709fc21d7211f01d39b4d28) |
| implementação spec 04 | [5035532](https://github.com/treinaweb/treinaweb-treinadesk/commit/50355327f2e381223b475ef2ed2f9e5b5b0e475f) |
| test(comments): testes dos cenários da change 005 | [18e1395](https://github.com/treinaweb/treinaweb-treinadesk/commit/18e1395c1858137570a128514d7016a7b222871d) |
| feat(comments): comentários públicos e notas internas em tickets | [4f2822e](https://github.com/treinaweb/treinaweb-treinadesk/commit/4f2822e225f915a75f31b7ede1742e899b0f9dde) |
| API Treinadesk v1 | [55e9d48](https://github.com/treinaweb/treinaweb-treinadesk/commit/55e9d4850f1d5b2b2826a2d972270edbf919b873) |
| build: converte a API para ESM para rodar na Vercel | [62dc406](https://github.com/treinaweb/treinaweb-treinadesk/commit/62dc406b30030c67472c515abe42d6fd81612ecf) |
