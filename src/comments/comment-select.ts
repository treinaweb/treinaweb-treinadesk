import { Prisma } from '../generated/prisma/client.js';
import { userSummarySelect } from '../tickets/ticket-select.js';

// author só com id, name e role: um include da relação traria email e
// passwordHash.
export const commentSelect = {
  id: true,
  body: true,
  isInternal: true,
  createdAt: true,
  author: { select: userSummarySelect },
} satisfies Prisma.CommentSelect;

export type CommentView = Prisma.CommentGetPayload<{
  select: typeof commentSelect;
}>;
