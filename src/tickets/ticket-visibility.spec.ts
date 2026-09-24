import { Role, TicketStatus } from '../generated/prisma/client';
import { visibilityWhere } from './ticket-visibility';

describe('visibilityWhere', () => {
  const id = 'u0000000-0000-4000-8000-000000000000';
  const email = 'x@teste.com';

  it('CUSTOMER vê só os próprios tickets', () => {
    expect(visibilityWhere({ id, email, role: Role.CUSTOMER })).toEqual({
      customerId: id,
    });
  });

  it('SUPPORT vê a fila (OPEN sem atendente) e os atribuídos a ele', () => {
    expect(visibilityWhere({ id, email, role: Role.SUPPORT })).toEqual({
      OR: [{ status: TicketStatus.OPEN, assigneeId: null }, { assigneeId: id }],
    });
  });

  it('ADMIN vê todos', () => {
    expect(visibilityWhere({ id, email, role: Role.ADMIN })).toEqual({});
  });
});
