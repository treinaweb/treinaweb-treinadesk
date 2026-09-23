# Proposal

## Why

O TreinaDesk ainda não tem modelos, módulos de domínio nem validação global de entrada: não há como um cliente se cadastrar e não existe o usuário administrador inicial previsto no PRD ("Cadastro público de clientes e usuário administrador inicial"). Esta change cria o cadastro público de clientes e a base de persistência e validação que os próximos módulos (autenticação, tickets, categorias) vão reutilizar.

## What Changes

- Nova rota pública `POST /users` (sem autenticação) que recebe `name`, `email` e `password` e sempre cria um usuário com papel `CUSTOMER`, respondendo `201` com `id`, `name`, `email`, `role` e `createdAt`.
- Validação de entrada: `name` de 2 a 100 caracteres, `email` válido com até 200 caracteres, `password` de 8 a 128 caracteres; dados inválidos retornam `400` indicando o campo com problema.
- Propriedades não declaradas no corpo (por exemplo `role`) retornam `400` e nenhum usuário é criado.
- E-mail normalizado (trim + minúsculas) antes de validar unicidade e persistir; e-mail já cadastrado retorna `409`, inclusive quando difere apenas em maiúsculas/minúsculas ou espaços.
- Senha armazenada somente como hash argon2id; nenhuma resposta contém senha ou hash.
- Seed que cria (de forma idempotente) o usuário `ADMIN` inicial a partir das variáveis `ADMIN_EMAIL` e `ADMIN_PASSWORD`.
- Infraestrutura compartilhada: validação global de entrada na aplicação e `PrismaModule` global (módulos de feature não precisam mais importá-lo).
- Primeiro modelo de dados e primeira migration (usuários e papéis `CUSTOMER`, `SUPPORT`, `ADMIN`).

## Capabilities

### New Capabilities
- `user-management`: cadastro público de clientes (`POST /users`), regras de validação e unicidade de e-mail, proteção da senha nas respostas e criação do administrador inicial via seed.

### Modified Capabilities
<!-- Nenhuma: ainda não existem specs consolidadas em openspec/specs/. -->

## Impact

- **Código**: novo módulo de usuários em `src/users/`; `src/main.ts` passa a registrar validação global; `PrismaModule` vira global; `AppModule` importa o novo módulo.
- **Banco**: `prisma/schema.prisma` ganha o enum de papéis e o modelo de usuário; primeira migration em `prisma/migrations/`; script de seed configurado no `prisma7.config.ts`.
- **Dependências**: `class-validator`, `class-transformer`, `argon2` (e runner TypeScript para o seed, se necessário).
- **Ambiente**: `ADMIN_EMAIL` e `ADMIN_PASSWORD` passam a ser usados pelo seed (já presentes no `.env`).
- **Testes**: testes unitários do serviço e e2e de `POST /users` contra PostgreSQL real.
- **Fora de escopo**: login/tokens, listagem/edição de usuários, gestão de equipe pelo ADMIN, rate limit e OpenAPI (changes futuras).
