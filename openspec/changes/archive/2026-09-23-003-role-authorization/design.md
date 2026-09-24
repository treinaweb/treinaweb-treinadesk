# Design

## Context

Motivação em `proposal.md` (Why); comportamento em `specs/user-management/spec.md` e `specs/categories/spec.md`.

Estado atual relevante (após as changes 001 e 002):

- `JwtAuthGuard` é `APP_GUARD`, registrado nos `providers` do `AuthModule`. Rotas `@Public()` são liberadas; nas demais ele grava `request.user = { id, email, role }` a partir do payload do access token (`AuthenticatedUser`, com `role: Role` do client Prisma).
- `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`) no `AppModule`, ativo também nos e2e.
- `UsersService` tem `create(dto)` (sempre `Role.CUSTOMER`, `P2002` → `409`), `findMe(id)` e a constante `publicUserSelect` (`id`, `name`, `email`, `role`, `createdAt`). `CreateUserDto` normaliza o e-mail com `normalizeEmail()` via `@Transform`.
- `refresh_tokens` guarda `revokedAt`; o `AuthService` já revoga em massa com `updateMany({ where: { userId, revokedAt: null } })`.
- Não existe decorator de papéis, DTO de paginação nem modelo de categoria. O enum `Role` (`CUSTOMER`, `SUPPORT`, `ADMIN`) já existe no schema.

## Goals / Non-Goals

**Goals:**
- Autorização declarativa por rota (`@Roles(Role.ADMIN)`), avaliada sempre depois da autenticação.
- Um único DTO de paginação reutilizável por qualquer listagem.
- Alteração de papel e revogação de sessões atômicas.

**Non-Goals:**
- Invalidar access tokens já emitidos após uma troca de papel (ver Risks).
- Regras de visibilidade por registro (a autorização aqui é por rota; o filtro de categorias ativas é regra de consulta do service).

## Decisions

### 1. `@Roles()` + `RolesGuard` como `APP_GUARD` registrado depois do `JwtAuthGuard`

`@Roles(...roles: Role[])` = `SetMetadata(ROLES_KEY, roles)` em `src/auth/roles.decorator.ts`. `RolesGuard` (`src/auth/roles.guard.ts`) lê `ROLES_KEY` com `Reflector.getAllAndOverride` (handler e classe):

- sem metadado (ou lista vazia) → libera: a rota só exige autenticação;
- rota `@Public()` → libera (não há `request.user`);
- caso contrário → `roles.includes(request.user.role)` ou `ForbiddenException`.

Registrado no mesmo array de `providers` do `AuthModule`, **logo após** o `JwtAuthGuard`: `[AuthService, { provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: APP_GUARD, useClass: RolesGuard }]`.

- **Por que a ordem importa:** o Nest executa os guards globais na ordem em que são registrados. O `RolesGuard` depende de `request.user`, que só existe depois que o `JwtAuthGuard` validou o token. Na ordem inversa, uma requisição sem token a uma rota `@Roles` chegaria ao `RolesGuard` sem usuário e responderia `403` em vez de `401`, vazando que a rota é restrita. Manter os dois no mesmo módulo e no mesmo array torna a ordem explícita e independente da ordem de inicialização dos módulos.
- Guards rodam antes dos pipes, por isso um papel sem acesso recebe `403` mesmo com corpo inválido (cenário da spec).
- **Alternativa rejeitada — `@UseGuards(JwtAuthGuard, RolesGuard)` por controller:** é opt-in e duplica o `JwtAuthGuard` que já é global; esquecer o guard numa rota nova deixaria `@Roles` sem efeito, silenciosamente. Com o guard global, `@Roles` sempre é aplicado e as restrições são auditáveis com `grep @Roles`.
- **Alternativa rejeitada — verificar o papel dentro do handler/service:** espalha `if (user.role !== ...)` pelos serviços e mistura autorização de rota com regra de negócio.

### 2. `403` para restrição de rota

Papel sem acesso à rota → `ForbiddenException` (`403`), conforme a convenção do PRD. A regra "`404` para registro que o usuário não pode ver" não se aplica aqui: a restrição é da rota inteira, não de um registro, e a existência das rotas não é segredo. O `401` continua reservado para ausência ou invalidade do token (garantido pela ordem da decisão 1).

### 3. `PaginationQueryDto` compartilhado em `src/common/dto/`

```ts
export class PaginationQueryDto {
  @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;
}
```

Usado com `@Query() query: PaginationQueryDto`; o `ValidationPipe` global com `transform` converte as strings da query e aplica os padrões. `page=abc` vira `NaN` e falha em `@IsInt` → `400` citando `page`. Uma interface genérica `Paginated<T> = { data: T[]; page: number; limit: number; total: number }` fica no mesmo diretório.

`UsersService.findAll({ page, limit })` executa `prisma.$transaction([user.findMany({ select: publicUserSelect, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }), user.count()])`.

- `$transaction` com array roda as duas consultas na mesma transação, então `data` e `total` são coerentes entre si.
- O desempate por `id` garante ordem estável quando dois usuários têm o mesmo `createdAt`, evitando itens repetidos ou pulados entre páginas.
- **Alternativa rejeitada — paginação por cursor:** mais eficiente em tabelas grandes, mas o formato pedido (`page`, `total`) é por deslocamento e o volume de usuários de um helpdesk é pequeno.
- **Alternativa rejeitada — DTO de paginação dentro de `src/users/`:** um DTO comum mantém os mesmos limites e mensagens em qualquer listagem paginada.

### 4. `CreateStaffDto` com `@IsIn(['SUPPORT', 'ADMIN'])` reaproveitando `UsersService`

`CreateStaffDto extends CreateUserDto` e acrescenta `role` com `@IsIn([Role.SUPPORT, Role.ADMIN])`. Herdar mantém idênticas as validações de `name`, `email` (com a normalização) e `password`. `@IsIn` recusa `CUSTOMER`, valores desconhecidos e ausência com a mesma mensagem citando `role`.

`UsersService.create(dto, role = Role.CUSTOMER)` passa a receber o papel; `POST /users` continua chamando `create(dto)` (sempre `CUSTOMER`, pois `CreateUserDto` não declara `role` e o `ValidationPipe` rejeita a propriedade), e `POST /users/staff` chama `create(dto, dto.role)`. Hash da senha e tradução de `P2002` → `409` ficam num só lugar.

- **Alternativa rejeitada — `@IsEnum(Role)` + checagem no service:** permitiria `CUSTOMER` no DTO e empurraria para o service uma validação de entrada que deve responder `400`.
- **Alternativa rejeitada — método `createStaff` separado:** duplicaria hash e tratamento de conflito.

### 5. `changeRole` com bloqueio do próprio id, `P2025` → `404` e revogação na transação

`PATCH /users/:id/role` recebe `:id` com `ParseUUIDPipe` (UUID inválido → `400`, em vez de erro do Postgres) e `ChangeRoleDto { @IsEnum(Role) role }`. `UsersService.changeRole(actorId, targetId, role)`:

1. `actorId === targetId` → `UnprocessableEntityException` (`422`) antes de tocar no banco — o papel e as sessões ficam intactos. O bloqueio impede que um ADMIN se rebaixe por engano e deixe o sistema sem administrador pelo único caminho de gestão existente.
2. `prisma.$transaction(async (tx) => { const user = await tx.user.update({ where: { id: targetId }, data: { role }, select: publicUserSelect }); await tx.refreshToken.updateMany({ where: { userId: targetId, revokedAt: null }, data: { revokedAt: new Date() } }); return user; })`.
3. `Prisma.PrismaClientKnownRequestError` com código `P2025` (registro não encontrado no `update`) → `NotFoundException` (`404`).

- Lançar dentro desta transação é seguro (ao contrário do refresh): o único erro esperado é o `P2025`, quando nada foi escrito, e qualquer outro erro deve mesmo desfazer as duas escritas.
- A revogação acontece sempre que o `update` é bem-sucedido, inclusive quando o papel enviado é igual ao atual: simples e sem efeito indesejado além de exigir novo login.
- **Alternativa rejeitada — `findUnique` + `update`:** duas idas ao banco e uma janela de corrida; o `P2025` do próprio `update` já informa a inexistência.
- **Alternativa rejeitada — revogar fora da transação:** uma falha entre as duas escritas deixaria o papel alterado e as sessões antigas ainda renováveis, sem o corte de sessão que a spec exige.

### 6. Papel lido do token em vez de consultar o banco a cada requisição

O `RolesGuard` usa `request.user.role`, vindo do access token. A troca de papel tem efeito por dois caminhos: a revogação dos refresh tokens (decisão 5) força um novo login, e o `refresh` do `AuthService` já relê o usuário do banco ao emitir o novo access token. A janela em que um token antigo carrega o papel anterior é limitada pela validade do access token (`JWT_ACCESS_EXPIRES_IN`, padrão 15 min).

- **Alternativa rejeitada — consultar o papel no banco em cada requisição:** efeito imediato, mas uma consulta extra por requisição autenticada e o abandono do modelo stateless escolhido na change 002; está fora do escopo.
- **Alternativa rejeitada — versão de token no usuário (`tokenVersion` no payload):** exigiria também uma consulta por requisição para comparar a versão, com o mesmo custo.

### 7. Modelo `Category`

```prisma
model Category {
  id        String   @id @default(uuid()) @db.Uuid
  name      String   @unique @db.VarChar(60)
  active    Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("categories")
}
```

- Unicidade garantida pelo índice único do banco: `P2002` em `create`/`update` → `ConflictException` (`409`), sem `findFirst` prévio (sem corrida entre verificar e gravar). `P2025` no `update` → `404`.
- O nome é comparado exatamente como armazenado (após o trim do DTO), ou seja, com diferença entre maiúsculas e minúsculas (ver Risks).
- `createdAt`/`updatedAt` seguem o padrão de `User` e não são expostos.

### 8. DTOs de categoria

- `CreateCategoryDto`: `name` com `@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)`, `@IsString()`, `@Length(2, 60)`. O trim acontece antes da validação, então `"  F  "` falha como curto e `" Financeiro "` colide com `"Financeiro"`.
- `UpdateCategoryDto`: `name` opcional com as mesmas regras (`@IsOptional()`), `active` opcional com `@IsBoolean()`. Corpo sem nenhum dos dois → `BadRequestException` no controller (o `class-validator` não expressa "ao menos um" de forma declarativa simples). `:id` com `ParseUUIDPipe`.
- Não existe rota `DELETE`: sem handler, o Nest responde `404` e nada é alterado.

### 9. Filtro de ativas por papel no `where` do service

`CategoriesService.findAll(role)`:

- `ADMIN` → `findMany({ select: { id, name, active }, orderBy: { name: 'asc' } })`;
- demais papéis → `findMany({ where: { active: true }, select: { id, name }, orderBy: { name: 'asc' } })`.

O filtro e a projeção ficam na consulta: registros inativos nunca saem do banco para quem não pode vê-los, e o campo `active` não aparece para `CUSTOMER`/`SUPPORT`. O controller passa `@CurrentUser().role`.

- **Alternativa rejeitada — buscar tudo e filtrar no controller:** traz dados que não devem ser expostos até a camada HTTP e depende de lembrar do filtro em cada rota.
- **Alternativa rejeitada — duas rotas (`/categories` e `/categories/all`):** a spec define uma única rota cujo conteúdo depende do papel.

### 10. Módulos

- `RolesGuard` e `@Roles` ficam em `src/auth/` junto do `JwtAuthGuard` (decisão 1).
- `src/common/dto/pagination-query.dto.ts` e `paginated.ts` (sem módulo Nest; são só classes/tipos).
- `CategoriesModule` (`src/categories/`: controller, service, DTOs) importado no `AppModule`; usa o `PrismaService` global.
- `UsersController` ganha `GET /users` e `POST /users/staff` (`@Roles(Role.ADMIN)`) e `PATCH /users/:id/role` (`@Roles(Role.ADMIN)`); `GET /users/me` continua sem `@Roles`.

## Autorização

| Rota | CUSTOMER | SUPPORT | ADMIN | Sem token |
|---|---|---|---|---|
| `POST /users` | público | público | público | `201` |
| `GET /users/me` | sim | sim | sim | `401` |
| `GET /users` | `403` | `403` | sim | `401` |
| `POST /users/staff` | `403` | `403` | sim | `401` |
| `PATCH /users/:id/role` | `403` | `403` | sim (exceto o próprio id → `422`) | `401` |
| `GET /categories` | só ativas | só ativas | todas, com `active` | `401` |
| `POST /categories` | `403` | `403` | sim | `401` |
| `PATCH /categories/:id` | `403` | `403` | sim | `401` |

## Risks / Trade-offs

- [Access token antigo mantém o papel anterior por até `JWT_ACCESS_EXPIRES_IN`] → limitação aceita e documentada na spec; a revogação dos refresh tokens garante que a sessão não se prolonga além disso, e a validade padrão é de 15 min.
- [Ordem dos `APP_GUARD` alterada por engano inverte `401`/`403`] → os dois guards ficam no mesmo array do `AuthModule` com comentário explicando a ordem, e um e2e verifica que rota `@Roles` sem token responde `401`.
- [Rota nova de gestão sem `@Roles` fica aberta a qualquer autenticado] → a tabela de Autorização acima serve de checklist; cada rota restrita tem cenário `403` coberto por e2e.
- [Nomes que diferem só por maiúsculas (`"financeiro"` e `"Financeiro"`) são aceitos como distintos] → aceitável para uma lista pequena mantida só pelo ADMIN, que vê todas as categorias; evita índice por expressão (`lower(name)`) fora do schema Prisma.
- [Um ADMIN pode rebaixar todos os outros administradores] → como ninguém altera o próprio papel, sempre resta ao menos o ADMIN que fez a alteração.
- [Revogação de sessões quando o papel enviado é igual ao atual] → efeito limitado a exigir novo login do usuário; preferido a um `findUnique` extra para comparar.

## Migration Plan

1. Adicionar o modelo `Category` ao `schema.prisma` e rodar `npx prisma migrate dev --name create-categories` seguido de `npx prisma generate` (no Prisma 7 o migrate não regenera o client).
2. A migration só cria a tabela `categories` e seu índice único; não altera `users` nem `refresh_tokens`, então não há backfill.
3. Deploy: aplicar `npx prisma migrate deploy` antes de subir a nova versão da API. As rotas existentes não mudam de comportamento; nenhum cliente atual quebra.
4. Rollback: reverter a versão da API; a tabela `categories` pode permanecer (não é lida pela versão anterior) ou ser removida com `DROP TABLE categories` se necessário.
5. Os e2e passam a limpar `categories` além de `users` no `beforeEach`.
