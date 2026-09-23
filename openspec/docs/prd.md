# PRD: HelpDesk API

## Objetivo

API REST para abertura e atendimento de tickets de suporte. Clientes registram problemas, atendentes assumem e respondem os tickets, e administradores gerenciam usuários e categorias.

## Usuários e papéis

| Papel | Valor no código | Descrição |
|---|---|---|
| Cliente | `CUSTOMER` | Cria tickets, acompanha e comenta os próprios tickets. |
| Atendente | `SUPPORT` | Assume tickets da fila, responde, cria notas internas e altera status dos tickets atribuídos a ele. |
| Administrador | `ADMIN` | Vê e altera qualquer ticket, gerencia usuários e categorias. |

O código não usa `AGENT` como papel para não confundir com agentes de IA.

## Matriz de permissões

| Ação | CUSTOMER | SUPPORT | ADMIN |
|---|---|---|---|
| Criar ticket | Sim | Não | Não |
| Ver tickets | Só os próprios | Fila sem responsável e os atribuídos a ele | Todos |
| Assumir ticket | Não | Tickets OPEN sem responsável | Atribui a qualquer SUPPORT |
| Alterar status | Cancelar, fechar ou reabrir os próprios | Nos tickets atribuídos a ele | Qualquer ticket |
| Comentar | Nos próprios tickets | Nos tickets atribuídos a ele | Qualquer ticket |
| Nota interna | Não vê | Cria e vê | Cria e vê |
| Gerenciar usuários e categorias | Não | Não | Sim |

## Funcionalidades do MVP

1. Cadastro público de clientes e usuário administrador inicial.
2. Login com access token e refresh token com rotação; logout.
3. Gestão de usuários da equipe e de papéis pelo administrador.
4. Categorias de ticket com ativação e desativação.
5. Tickets com visibilidade por papel, atribuição e fluxo de status.
6. Comentários públicos e notas internas.

## Fluxo de status do ticket

| De | Para | Quem pode | Observação |
|---|---|---|---|
| OPEN | IN_PROGRESS | SUPPORT ao assumir, ADMIN ao atribuir | Somente pela rota de atribuição. |
| OPEN | CLOSED | Cliente dono, ADMIN | Cancelamento. Preenche `closedAt`. |
| IN_PROGRESS | WAITING_CUSTOMER | SUPPORT atribuído, ADMIN | |
| IN_PROGRESS | RESOLVED | SUPPORT atribuído, ADMIN | |
| WAITING_CUSTOMER | IN_PROGRESS | Automático | Quando o cliente dono comenta. |
| WAITING_CUSTOMER | RESOLVED | SUPPORT atribuído, ADMIN | Cliente não respondeu. |
| RESOLVED | IN_PROGRESS | Cliente dono | Reabertura. |
| RESOLVED | CLOSED | Cliente dono, ADMIN | Preenche `closedAt`. |

Qualquer transição fora da tabela, pelo status atual ou pelo papel, retorna 422. Ticket `CLOSED` não aceita alteração de status nem comentário.

## Regras de resposta

| Situação | Status |
|---|---|
| Sem token ou token inválido | 401 |
| Papel sem acesso à rota | 403 |
| Registro que o usuário não pode ver | 404 |
| Conflito com o estado atual (e-mail duplicado, alteração concorrente) | 409 |
| Regra de negócio impede a operação (transição inválida, categoria inativa) | 422 |
| Excesso de requisições | 429 |

## Fora do escopo

Anexos, envio de e-mail, SLA, múltiplas empresas, frontend, recuperação de senha, exclusão de dados.

## Requisitos não funcionais

- Senhas armazenadas somente como hash com algoritmo resistente a força bruta.
- Access token com validade de 15 minutos; refresh token opaco com rotação e detecção de reutilização.
- Rate limiting global e específico nas rotas de autenticação.
- Nenhuma resposta ou log contém senha, hash de senha ou tokens.
- Documentação OpenAPI fora de produção.
- Testes unitários e testes e2e contra PostgreSQL real.
