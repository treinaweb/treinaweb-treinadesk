import { Role, TicketStatus } from '../generated/prisma/client';
import { commentPolicy, CommentPolicyInput } from './comment-policy';

// Atores do ticket T do cliente A atribuído a S1.
const owner = { role: Role.CUSTOMER, isOwner: true, isAssignee: false };
const otherCustomer = {
  role: Role.CUSTOMER,
  isOwner: false,
  isAssignee: false,
};
const assignee = { role: Role.SUPPORT, isOwner: false, isAssignee: true };
const unassigned = { role: Role.SUPPORT, isOwner: false, isAssignee: false };
const admin = { role: Role.ADMIN, isOwner: false, isAssignee: false };

const decide = (
  actor: Omit<CommentPolicyInput, 'ticketStatus' | 'isInternal'>,
  ticketStatus: TicketStatus,
  isInternal = false,
) => commentPolicy({ ...actor, ticketStatus, isInternal });

const NOT_CLOSED = [
  TicketStatus.OPEN,
  TicketStatus.IN_PROGRESS,
  TicketStatus.WAITING_CUSTOMER,
  TicketStatus.RESOLVED,
];

describe('commentPolicy', () => {
  describe.each(NOT_CLOSED)('ticket %s', (status) => {
    it.each([
      ['cliente dono', owner],
      ['atendente atribuído', assignee],
      ['ADMIN', admin],
    ])('%s comenta publicamente → ALLOW', (_, actor) => {
      expect(decide(actor, status)).toBe('ALLOW');
    });

    it.each([
      ['atendente atribuído', assignee],
      ['ADMIN', admin],
    ])('%s cria nota interna → ALLOW', (_, actor) => {
      expect(decide(actor, status, true)).toBe('ALLOW');
    });

    it('cliente com isInternal true → FORBIDDEN_INTERNAL', () => {
      expect(decide(owner, status, true)).toBe('FORBIDDEN_INTERNAL');
    });

    it('cliente que não é dono → NOT_ASSIGNED', () => {
      expect(decide(otherCustomer, status)).toBe('NOT_ASSIGNED');
    });
  });

  it('atendente não atribuído (ticket da fila) → NOT_ASSIGNED', () => {
    expect(decide(unassigned, TicketStatus.OPEN)).toBe('NOT_ASSIGNED');
  });

  it('atendente não atribuído com nota interna → NOT_ASSIGNED', () => {
    expect(decide(unassigned, TicketStatus.OPEN, true)).toBe('NOT_ASSIGNED');
  });

  it.each([
    ['cliente dono', owner, false],
    ['atendente atribuído', assignee, false],
    ['atendente atribuído com nota interna', assignee, true],
    ['ADMIN', admin, false],
    ['ADMIN com nota interna', admin, true],
  ])('ticket CLOSED: %s → TICKET_CLOSED', (_, actor, isInternal) => {
    expect(decide(actor, TicketStatus.CLOSED, isInternal)).toBe(
      'TICKET_CLOSED',
    );
  });

  describe('ordem de verificação', () => {
    it('nota interna do cliente vem antes de ticket fechado', () => {
      expect(decide(owner, TicketStatus.CLOSED, true)).toBe(
        'FORBIDDEN_INTERNAL',
      );
    });

    it('atendente não atribuído vem antes de ticket fechado', () => {
      expect(decide(unassigned, TicketStatus.CLOSED)).toBe('NOT_ASSIGNED');
    });

    it('cliente não dono com nota interna → FORBIDDEN_INTERNAL', () => {
      expect(decide(otherCustomer, TicketStatus.OPEN, true)).toBe(
        'FORBIDDEN_INTERNAL',
      );
    });
  });
});
