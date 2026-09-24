import { Prisma } from '../generated/prisma/client';

// Só id, name e role: um include da relação traria email e passwordHash.
export const userSummarySelect = {
  id: true,
  name: true,
  role: true,
} satisfies Prisma.UserSelect;

export const ticketSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  category: { select: { id: true, name: true } },
  customer: { select: userSummarySelect },
  assignee: { select: userSummarySelect },
  createdAt: true,
  updatedAt: true,
  closedAt: true,
} satisfies Prisma.TicketSelect;

export type TicketView = Prisma.TicketGetPayload<{
  select: typeof ticketSelect;
}>;
