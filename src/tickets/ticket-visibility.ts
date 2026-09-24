import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { Prisma, Role, TicketStatus } from '../generated/prisma/client.js';

// Tickets que o usuário pode ver. Usado por toda leitura e antes de toda
// escrita; o switch sem default obriga a definir a regra de um papel novo.
export function visibilityWhere(
  user: AuthenticatedUser,
): Prisma.TicketWhereInput {
  switch (user.role) {
    case Role.ADMIN:
      return {};
    case Role.SUPPORT:
      return {
        OR: [
          { status: TicketStatus.OPEN, assigneeId: null },
          { assigneeId: user.id },
        ],
      };
    case Role.CUSTOMER:
      return { customerId: user.id };
  }
}
