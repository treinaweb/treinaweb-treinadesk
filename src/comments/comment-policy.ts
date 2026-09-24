import { Role, TicketStatus } from '../generated/prisma/client';

export type CommentDecision =
  'ALLOW' | 'FORBIDDEN_INTERNAL' | 'NOT_ASSIGNED' | 'TICKET_CLOSED';

export interface CommentPolicyInput {
  role: Role;
  isOwner: boolean;
  isAssignee: boolean;
  ticketStatus: TicketStatus;
  isInternal: boolean;
}

// Cliente dono, atendente atribuído ou qualquer ADMIN. O switch sem default
// obriga a definir a regra de um papel novo.
function isLinked(input: CommentPolicyInput): boolean {
  switch (input.role) {
    case Role.ADMIN:
      return true;
    case Role.SUPPORT:
      return input.isAssignee;
    case Role.CUSTOMER:
      return input.isOwner;
  }
}

// Ordem fixa: o que o papel nunca pode fazer, depois o vínculo com o ticket,
// por último o estado do ticket.
export function commentPolicy(input: CommentPolicyInput): CommentDecision {
  if (input.role === Role.CUSTOMER && input.isInternal) {
    return 'FORBIDDEN_INTERNAL';
  }
  if (!isLinked(input)) {
    return 'NOT_ASSIGNED';
  }
  if (input.ticketStatus === TicketStatus.CLOSED) {
    return 'TICKET_CLOSED';
  }
  return 'ALLOW';
}
