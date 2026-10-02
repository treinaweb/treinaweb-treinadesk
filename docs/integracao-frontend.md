# Integração com frontend (Next.js)

Guia para consumir a TreinaDesk API a partir de um frontend Next.js independente — o cenário do curso de Next.js que consome APIs. O **contrato** (rotas, corpos, respostas, erros) está no Swagger em [`/docs`](http://localhost:3000/docs) e no OpenAPI em [`/docs-json`](http://localhost:3000/docs-json); este guia cobre o **comportamento** que o contrato não mostra: sessão, refresh, permissões e o ciclo de vida do ticket.

Para instalar e subir a API, veja a seção "Rodando localmente" do [README](../README.md).

## 1. Rodando junto

| Projeto | Porta | Comando |
|---|---|---|
| API (este repositório) | `3000` | `npm run start:dev` |
| Frontend Next.js | `3001` | `next dev -p 3001` (ou `"dev": "next dev -p 3001"` no `package.json`) |

O Next usa a porta 3000 por padrão — sem o `-p 3001` ele colide com a API.

No `.env.local` do Next:

```bash
API_URL=http://localhost:3000
```

**Sem** o prefixo `NEXT_PUBLIC_`: a URL só é usada no servidor do Next (veja a seção 2).

Tipos TypeScript gerados a partir do contrato (com a API rodando):

```bash
npx openapi-typescript http://localhost:3000/docs-json -o src/types/api.ts
```

## 2. Arquitetura: o Next como BFF

```
 navegador                  Next.js :3001                     API :3000
+-----------+   cookies   +---------------------------+   Bearer   +-----------+
|           |  httpOnly   | Server Components         | ---------> |           |
|   HTML    | <---------> | Server Actions            |            | TreinaDesk|
|           | (access +   | Route Handlers / proxy.ts | <--------- |           |
+-----------+  refresh)   | le cookie -> Authorization|    JSON    +-----------+
                          +---------------------------+
   nunca ve os tokens          chamadas server-to-server
```

- O navegador **nunca** fala com a API nem enxerga os tokens: eles ficam em cookies `httpOnly` do domínio do Next.
- Toda chamada à API sai do servidor do Next. Por isso **não existe CORS** nessa arquitetura, e a API não o habilita: um `fetch` para `localhost:3000` feito no navegador (em um Client Component) é bloqueado de propósito.
- A API não lê nem grava cookies: ela recebe e devolve tokens no corpo JSON e espera `Authorization: Bearer <accessToken>`. Quem converte cookie ↔ Bearer é o Next.

## 3. Login

`POST /auth/login` com `{ "email", "password" }` → `200` com:

```json
{ "accessToken": "eyJhbGciOi...", "refreshToken": "q1w2e3..." }
```

Em uma Server Action, grave os dois em cookies:

```ts
'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function login(formData: FormData) {
  const res = await fetch(`${process.env.API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: formData.get('email'),
      password: formData.get('password'),
    }),
  });
  if (res.status === 401) return { error: 'E-mail ou senha inválidos' };
  if (!res.ok) return { error: 'Não foi possível entrar' };

  await saveSession(await res.json());
  redirect('/tickets');
}

const secure = process.env.NODE_ENV === 'production';

export async function saveSession(tokens: {
  accessToken: string;
  refreshToken: string;
}) {
  const store = await cookies();
  store.set('access_token', tokens.accessToken, {
    httpOnly: true, sameSite: 'lax', secure, path: '/',
    maxAge: 60 * 15, // JWT_ACCESS_EXPIRES_IN (15m)
  });
  store.set('refresh_token', tokens.refreshToken, {
    httpOnly: true, sameSite: 'lax', secure, path: '/',
    maxAge: 60 * 60 * 24 * 7, // REFRESH_TOKEN_TTL_DAYS (7)
  });
}
```

- `401` no login é sempre "credenciais inválidas", sem dizer se o e-mail existe — mostre uma mensagem genérica.
- Cadastro de cliente: `POST /users` com `{ name, email, password }` (rota pública) → `201`; depois faça o login. E-mail repetido → `409`.
- O papel (`CUSTOMER`, `SUPPORT`, `ADMIN`) vem em `GET /users/me`, que também serve para montar o menu conforme o papel.

## 4. Chamando rotas protegidas

Um helper só de servidor, usado por Server Components, Server Actions e Route Handlers:

```ts
import 'server-only';
import { cookies } from 'next/headers';

export async function api(path: string, init: RequestInit = {}) {
  const token = (await cookies()).get('access_token')?.value;
  return fetch(`${process.env.API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    cache: 'no-store', // dados por usuário: não compartilhe cache entre sessões
  });
}
```

Server Components **só leem** cookies — não conseguem gravá-los. Por isso a renovação dos tokens não pode acontecer no meio da renderização: ela fica no `proxy.ts` (seção 5).

## 5. Refresh de sessão

O access token dura **15 minutos**. Para renová-lo, `POST /auth/refresh` com `{ "refreshToken" }` → `200` com um **novo par**. O refresh token enviado deixa de valer na hora (rotação): grave **os dois** cookies de novo.

### Por que renovar antes de expirar

A API detecta **reutilização** de refresh token: se o mesmo refresh token for enviado duas vezes, ela entende que ele vazou, **revoga todas as sessões do usuário** e responde `401`. Isso também acontece quando duas requisições do próprio frontend tentam renovar ao mesmo tempo:

```
 access expirou
   |
   +--> req A (pagina)   --> POST /auth/refresh (RT1) --> 200, novo par (RT2)
   +--> req B (paralela) --> POST /auth/refresh (RT1) --> RT1 ja usado = REUSO
                                                          401 + todas as sessoes
                                                          revogadas (RT2 tambem)
                                                          -> usuario deslogado
```

Para diminuir essas corridas:

1. **Renove de forma proativa** no `proxy.ts` (o `middleware.ts` das versões anteriores do Next), quando faltar menos de 60 s para o access token expirar — em vez de esperar um `401` em cada chamada.
2. **Não rode o proxy em prefetch** de `<Link>`, que dispara várias requisições em paralelo.
3. **Trate o `401` do refresh** apagando os cookies e mandando para `/login`, sem tentar de novo.

```ts
// proxy.ts (na raiz do projeto, ao lado de app/)
import { NextResponse, type NextRequest } from 'next/server';

const REFRESH_MARGIN_S = 60;

function expiresIn(token: string): number {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(payload)) as { exp: number };
    return exp - Date.now() / 1000;
  } catch {
    return 0;
  }
}

export async function proxy(request: NextRequest) {
  const access = request.cookies.get('access_token')?.value;
  const refresh = request.cookies.get('refresh_token')?.value;

  if (!refresh) return NextResponse.next(); // páginas protegidas checam sessão
  if (access && expiresIn(access) > REFRESH_MARGIN_S) return NextResponse.next();

  const res = await fetch(`${process.env.API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
  });

  if (!res.ok) {
    // 401: expirado, revogado ou reutilizado. Sessão acabou.
    const out = NextResponse.redirect(new URL('/login', request.url));
    out.cookies.delete('access_token');
    out.cookies.delete('refresh_token');
    return out;
  }

  const tokens: { accessToken: string; refreshToken: string } = await res.json();
  // Na requisição atual: os Server Components já leem o token novo.
  request.cookies.set('access_token', tokens.accessToken);
  request.cookies.set('refresh_token', tokens.refreshToken);
  const out = NextResponse.next({ request });
  // Na resposta: o navegador guarda o par novo.
  const secure = process.env.NODE_ENV === 'production';
  out.cookies.set('access_token', tokens.accessToken, {
    httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 60 * 15,
  });
  out.cookies.set('refresh_token', tokens.refreshToken, {
    httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 60 * 60 * 24 * 7,
  });
  return out;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|login).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
```

A renovação proativa reduz, mas não elimina, a corrida (duas abas abertas no mesmo instante ainda podem colidir). O tratamento do `401` acima é o que garante que o pior caso seja "faça login de novo", e não um loop de erros.

## 6. Logout

`POST /auth/logout` com `Authorization: Bearer <accessToken>` e `{ "refreshToken" }` → `204`. Em seguida, apague os dois cookies e redirecione para `/login`. Se o access token já tiver expirado, apague os cookies mesmo assim: o refresh token expira sozinho.

## 7. Erros

Todo erro segue o formato padrão:

```json
{ "statusCode": 422, "message": "Categoria inexistente ou inativa", "error": "Unprocessable Entity" }
```

Nos `400` de validação, `message` é uma **lista** (um item por problema, ex.: `["title must be longer than or equal to 5 characters"]`).

| Status | Significado | O que a interface faz |
|---|---|---|
| `400` | Corpo, parâmetro ou filtro inválido | Mostra os erros do formulário (`message` em lista) |
| `401` | Sem token, token inválido ou expirado | Tenta o refresh (seção 5); se falhar, vai para `/login` |
| `403` | O papel não tem acesso à rota | Esconde a ação para esse papel; mostra "sem permissão" |
| `404` | Não existe **ou** o usuário não pode ver | Página "não encontrado" — nunca "sem permissão" |
| `409` | Conflito: e-mail já cadastrado, nome de categoria repetido, ticket alterado por outra requisição | Mostra a mensagem; em ticket, recarrega e deixa o usuário tentar de novo |
| `422` | Regra de negócio: transição de status inválida, categoria inativa, ticket fechado | Mostra `message` |

O `404` em vez de `403` para registros é proposital: a API não revela que um ticket de outra pessoa existe.

## 8. Papéis e permissões

| Rota | CUSTOMER | SUPPORT | ADMIN |
|---|:-:|:-:|:-:|
| `POST /users` (cadastro, pública) | — | — | — |
| `POST /users/staff`, `GET /users`, `PATCH /users/{id}/role` | | | ✓ |
| `GET /users/me` | ✓ | ✓ | ✓ |
| `GET /categories` | ✓ (ativas) | ✓ (ativas) | ✓ (todas, com `active`) |
| `POST /categories`, `PATCH /categories/{id}` | | | ✓ |
| `POST /tickets` | ✓ | | |
| `GET /tickets`, `GET /tickets/{id}` | ✓ | ✓ | ✓ |
| `PATCH /tickets/{id}/assign` | | ✓ | ✓ |
| `PATCH /tickets/{id}/status` | ✓ | ✓ | ✓ |
| `GET`/`POST /tickets/{id}/comments` | ✓ | ✓ | ✓ |

✓ = o papel tem acesso à rota (papel sem acesso → `403`). Dentro da rota ainda valem a visibilidade e as regras do ticket:

**Quem vê quais tickets** (fora disso → `404`):

- `CUSTOMER`: os tickets que ele abriu.
- `SUPPORT`: a fila (tickets `OPEN` sem atendente) e os atribuídos a ele.
- `ADMIN`: todos.

O papel vem do access token. Quando um ADMIN muda o papel de alguém, as sessões dessa pessoa são revogadas e o novo papel vale a partir do próximo login.

## 9. Ciclo de vida do ticket

```
            assign                 status                status
   OPEN ------------> IN_PROGRESS --------> RESOLVED --------> CLOSED
    |                   |     ^      <--------+
    |            status |     | cliente   reabre (cliente dono)
    |                   v     | comenta
    |              WAITING_CUSTOMER --status--> RESOLVED
    |
    +-- status (cancelar) --> CLOSED
```

Em palavras: `OPEN` só sai para `IN_PROGRESS` (atribuição) ou `CLOSED` (cancelado). `IN_PROGRESS` vai para `WAITING_CUSTOMER` ou `RESOLVED`. `WAITING_CUSTOMER` volta para `IN_PROGRESS` quando o cliente comenta, ou vai para `RESOLVED`. `RESOLVED` é reaberto (`IN_PROGRESS`) ou fechado (`CLOSED`). A tabela abaixo diz quem pode cada passo.

| De | Para | Quem | Como |
|---|---|---|---|
| `OPEN` | `IN_PROGRESS` | `SUPPORT` (assume da fila) ou `ADMIN` (indica `assigneeId`) | `PATCH /tickets/{id}/assign` — **só** por aqui |
| `IN_PROGRESS` | `WAITING_CUSTOMER` | atendente atribuído ou `ADMIN` | `PATCH /tickets/{id}/status` |
| `IN_PROGRESS` | `RESOLVED` | atendente atribuído ou `ADMIN` | `PATCH /tickets/{id}/status` |
| `WAITING_CUSTOMER` | `RESOLVED` | atendente atribuído ou `ADMIN` | `PATCH /tickets/{id}/status` |
| `WAITING_CUSTOMER` | `IN_PROGRESS` | cliente dono | **automático** ao comentar |
| `RESOLVED` | `IN_PROGRESS` | cliente dono (reabre) | `PATCH /tickets/{id}/status` |
| `RESOLVED` | `CLOSED` | cliente dono ou `ADMIN` | `PATCH /tickets/{id}/status` |
| `OPEN` | `CLOSED` | cliente dono ou `ADMIN` | `PATCH /tickets/{id}/status` |

- Qualquer outra combinação → `422`. `CLOSED` é final: preenche `closedAt` e não aceita mais mudança de status nem comentário.
- Use essa tabela para decidir **quais botões mostrar**; a API valida de novo de qualquer forma.
- `ADMIN` também reatribui tickets `IN_PROGRESS` e `WAITING_CUSTOMER` para outro atendente (o status não muda).
- `409` em atribuição ou status = outra pessoa mexeu no ticket depois que você o leu: recarregue.

## 10. Comentários e notas internas

- `POST /tickets/{id}/comments` com `{ "body" }` (1 a 5000 caracteres). Podem comentar o cliente dono, o atendente atribuído e qualquer `ADMIN`; atendente não atribuído → `422`; ticket `CLOSED` → `422`.
- Nota interna: `{ "body", "isInternal": true }`, só para `SUPPORT` e `ADMIN` (`CUSTOMER` → `403`).
- `GET /tickets/{id}/comments` lista em ordem de criação. Para o `CUSTOMER`, notas internas **não vêm** nem entram no `total` — não é preciso filtrar nada no frontend.
- Depois que o cliente comenta num ticket `WAITING_CUSTOMER`, recarregue o ticket: ele já está `IN_PROGRESS`.
- `author` traz só `id`, `name` e `role`. Exiba o `body` como texto puro (não interprete HTML).

## 11. Paginação

Listagens recebem `?page=1&limit=20` e respondem:

```json
{ "data": [], "page": 1, "limit": 20, "total": 42 }
```

`limit` máximo: **50** em `GET /tickets` e **100** nas demais (acima disso → `400`). `GET /tickets` também filtra por `?status=OPEN` e `?priority=HIGH` e ordena do mais recente para o mais antigo. Total de páginas: `Math.ceil(total / limit)`.

## 12. Usuários e dados de teste

`npm run seed` cria (ou restaura) estes dados. Senha de todos: **`senhaSegura123`**.

| Nome | E-mail | Papel |
|---|---|---|
| Ana | `ana@teste.com` | `CUSTOMER` |
| Bruno | `bruno@teste.com` | `CUSTOMER` |
| Carlos | `carlos@teste.com` | `CUSTOMER` (sem tickets) |
| Bia | `bia@teste.com` | `SUPPORT` |
| Carla | `carla@teste.com` | `SUPPORT` |
| Diego | `diego@teste.com` | `ADMIN` |

O seed também cria o ADMIN de `ADMIN_EMAIL`/`ADMIN_PASSWORD` do `.env`.

Categorias: `Acesso`, `Financeiro`, `Suporte Técnico` (ativas) e `Legado` (inativa — só o ADMIN a vê; abrir ticket nela → `422`).

| Ticket | Cliente | Atendente | Status | Bom para testar |
|---|---|---|---|---|
| Cobrança duplicada | Ana | — | `OPEN` | fila do SUPPORT, assumir ticket, cancelar (`CLOSED`) |
| Nota fiscal errada | Bruno | — | `OPEN` | Ana não vê (`404`) |
| Senha expirada | Ana | Bia | `IN_PROGRESS` | conversa com nota interna (Ana vê 2 comentários, Bia vê 3) |
| Relatório não carrega | Bruno | Carla | `WAITING_CUSTOMER` | Bruno comenta → volta para `IN_PROGRESS` |
| Erro ao exportar planilha | Ana | Bia | `RESOLVED` | Ana reabre ou fecha |
| Boleto vencido | Bruno | Carla | `CLOSED` | comentar → `422` |

`npm run test:e2e` **apaga** esses dados; rode `npm run seed` de novo depois dos testes.

## 13. Demo na Vercel

A mesma API pode estar publicada na Vercel, só para demonstração. O `/docs` funciona lá do mesmo jeito. Os dados são compartilhados por todos e as credenciais acima são públicas: não cadastre nada pessoal. Para desenvolver, use a API local.
