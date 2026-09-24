import { Role, TicketStatus } from '../generated/prisma/client.js';

export type TransitionActor = 'OWNER' | 'ASSIGNEE' | 'ADMIN';

export interface TransitionInput {
  from: TicketStatus;
  to: TicketStatus;
  role: Role;
  isOwner: boolean;
  isAssignee: boolean;
}

// Única fonte das transições permitidas pela rota de status. OPEN → IN_PROGRESS
// não está aqui: só acontece pela atribuição.
const TRANSITIONS: ReadonlyArray<{
  from: TicketStatus;
  to: TicketStatus;
  actors: readonly TransitionActor[];
}> = [
  {
    from: 'IN_PROGRESS',
    to: 'WAITING_CUSTOMER',
    actors: ['ASSIGNEE', 'ADMIN'],
  },
  { from: 'IN_PROGRESS', to: 'RESOLVED', actors: ['ASSIGNEE', 'ADMIN'] },
  { from: 'WAITING_CUSTOMER', to: 'RESOLVED', actors: ['ASSIGNEE', 'ADMIN'] },
  { from: 'RESOLVED', to: 'IN_PROGRESS', actors: ['OWNER'] },
  { from: 'RESOLVED', to: 'CLOSED', actors: ['OWNER', 'ADMIN'] },
  { from: 'OPEN', to: 'CLOSED', actors: ['OWNER', 'ADMIN'] },
];

// O ator depende do papel e da relação com o ticket: um SUPPORT nunca é
// OWNER e um CUSTOMER nunca é ASSIGNEE.
function actorOf(input: TransitionInput): TransitionActor | null {
  if (input.role === Role.ADMIN) return 'ADMIN';
  if (input.role === Role.CUSTOMER && input.isOwner) return 'OWNER';
  if (input.role === Role.SUPPORT && input.isAssignee) return 'ASSIGNEE';
  return null;
}

export function canTransition(input: TransitionInput): boolean {
  const actor = actorOf(input);
  return (
    actor !== null &&
    TRANSITIONS.some(
      (t) =>
        t.from === input.from && t.to === input.to && t.actors.includes(actor),
    )
  );
}
