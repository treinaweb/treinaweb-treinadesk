import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { Role, TicketStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';
import { commentSelect } from './comment-select';
import { CommentsService } from './comments.service';

describe('CommentsService', () => {
  let service: CommentsService;

  const tickets = { findVisibleOrFail: jest.fn() };
  const tx = {
    comment: { create: jest.fn() },
    ticket: { updateMany: jest.fn() },
  };
  const prisma = {
    comment: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  };

  const ticketId = 't0000000-0000-4000-8000-000000000000';
  const customerA: AuthenticatedUser = {
    id: 'a0000000-0000-4000-8000-000000000000',
    email: 'ana@teste.com',
    role: Role.CUSTOMER,
  };
  const customerB: AuthenticatedUser = {
    id: 'b0000000-0000-4000-8000-000000000000',
    email: 'bruno@teste.com',
    role: Role.CUSTOMER,
  };
  const s1: AuthenticatedUser = {
    id: '51000000-0000-4000-8000-000000000000',
    email: 'bia@teste.com',
    role: Role.SUPPORT,
  };
  const s2: AuthenticatedUser = {
    id: '52000000-0000-4000-8000-000000000000',
    email: 'carla@teste.com',
    role: Role.SUPPORT,
  };
  const admin: AuthenticatedUser = {
    id: 'ad000000-0000-4000-8000-000000000000',
    email: 'diego@teste.com',
    role: Role.ADMIN,
  };

  // Ticket T do cliente A, no formato devolvido por findVisibleOrFail.
  const ticket = (
    status: TicketStatus,
    assignee: AuthenticatedUser | null,
  ) => ({
    id: ticketId,
    title: 'Cobrança duplicada',
    description: 'Fui cobrada duas vezes na fatura de março.',
    status,
    priority: 'HIGH',
    category: {
      id: 'c0000000-0000-4000-8000-000000000000',
      name: 'Financeiro',
    },
    customer: { id: customerA.id, name: 'Ana', role: Role.CUSTOMER },
    assignee: assignee && { id: assignee.id, name: 'Bia', role: assignee.role },
    createdAt: new Date(),
    updatedAt: new Date(),
    closedAt: null,
  });

  const comment = (body: string, isInternal = false) => ({
    id: 'e0000000-0000-4000-8000-000000000000',
    body,
    isInternal,
    createdAt: new Date(),
    author: { id: customerA.id, name: 'Ana', role: Role.CUSTOMER },
  });

  const notFound = new NotFoundException('Ticket não encontrado');

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (client: typeof tx) => Promise<unknown>)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: TicketsService, useValue: tickets },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(CommentsService);
  });

  const expectNothingWritten = () => {
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.comment.create).not.toHaveBeenCalled();
    expect(tx.ticket.updateMany).not.toHaveBeenCalled();
  };

  describe('create', () => {
    it('consulta a visibilidade do ticket antes de gravar', async () => {
      tickets.findVisibleOrFail.mockResolvedValue(
        ticket(TicketStatus.IN_PROGRESS, s1),
      );
      tx.comment.create.mockResolvedValue(comment('Segue o comprovante'));

      await service.create(
        ticketId,
        { body: 'Segue o comprovante' },
        customerA,
      );

      expect(tickets.findVisibleOrFail).toHaveBeenCalledWith(
        ticketId,
        customerA,
      );
      expect(
        tickets.findVisibleOrFail.mock.invocationCallOrder[0],
      ).toBeLessThan(prisma.$transaction.mock.invocationCallOrder[0]);
    });

    it.each([
      ['cliente B no ticket de A', customerB],
      ['atendente S2 no ticket de S1', s2],
    ])('%s → 404 sem criar comentário', async (_, user) => {
      tickets.findVisibleOrFail.mockRejectedValue(notFound);

      await expect(
        service.create(ticketId, { body: 'Segue o comprovante' }, user),
      ).rejects.toBe(notFound);
      expectNothingWritten();
    });

    it('cliente com isInternal true → 403 sem criar comentário', async () => {
      tickets.findVisibleOrFail.mockResolvedValue(
        ticket(TicketStatus.IN_PROGRESS, s1),
      );

      await expect(
        service.create(
          ticketId,
          { body: 'Segue o comprovante', isInternal: true },
          customerA,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectNothingWritten();
    });

    it('atendente em ticket da fila (não atribuído) → 422 sem criar', async () => {
      tickets.findVisibleOrFail.mockResolvedValue(
        ticket(TicketStatus.OPEN, null),
      );

      await expect(
        service.create(ticketId, { body: 'Estamos verificando' }, s1),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expectNothingWritten();
    });

    it.each([
      ['cliente dono', customerA, false],
      ['atendente atribuído', s1, false],
      ['ADMIN', admin, false],
      ['ADMIN com nota interna', admin, true],
    ])('ticket CLOSED: %s → 422 sem criar', async (_, user, isInternal) => {
      tickets.findVisibleOrFail.mockResolvedValue(
        ticket(TicketStatus.CLOSED, s1),
      );

      await expect(
        service.create(
          ticketId,
          { body: 'Estamos verificando', isInternal },
          user,
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expectNothingWritten();
    });

    it('grava com o autor do token e isInternal false por padrão', async () => {
      const created = comment('Segue o comprovante');
      tickets.findVisibleOrFail.mockResolvedValue(
        ticket(TicketStatus.IN_PROGRESS, s1),
      );
      tx.comment.create.mockResolvedValue(created);

      await expect(
        service.create(ticketId, { body: 'Segue o comprovante' }, customerA),
      ).resolves.toBe(created);
      expect(tx.comment.create).toHaveBeenCalledWith({
        data: {
          ticketId,
          authorId: customerA.id,
          body: 'Segue o comprovante',
          isInternal: false,
        },
        select: commentSelect,
      });
    });

    it.each([
      ['atendente atribuído', s1],
      ['ADMIN', admin],
    ])('%s grava nota interna', async (_, user) => {
      const created = comment('Cliente já pediu estorno antes', true);
      tickets.findVisibleOrFail.mockResolvedValue(
        ticket(TicketStatus.IN_PROGRESS, s1),
      );
      tx.comment.create.mockResolvedValue(created);

      await expect(
        service.create(
          ticketId,
          { body: 'Cliente já pediu estorno antes', isInternal: true },
          user,
        ),
      ).resolves.toBe(created);
      expect(tx.comment.create).toHaveBeenCalledWith({
        data: {
          ticketId,
          authorId: user.id,
          body: 'Cliente já pediu estorno antes',
          isInternal: true,
        },
        select: commentSelect,
      });
    });
  });

  describe('create — retomada de WAITING_CUSTOMER', () => {
    it('comentário do cliente dono muda o ticket para IN_PROGRESS', async () => {
      const created = comment('Segue o comprovante');
      tickets.findVisibleOrFail.mockResolvedValue(
        ticket(TicketStatus.WAITING_CUSTOMER, s1),
      );
      tx.comment.create.mockResolvedValue(created);
      tx.ticket.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.create(ticketId, { body: 'Segue o comprovante' }, customerA),
      ).resolves.toBe(created);
      expect(tx.comment.create).toHaveBeenCalled();
      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: ticketId, status: TicketStatus.WAITING_CUSTOMER },
        data: { status: TicketStatus.IN_PROGRESS },
      });
    });

    it.each([
      ['atendente atribuído', s1, false],
      ['atendente atribuído com nota interna', s1, true],
      ['ADMIN', admin, false],
      ['ADMIN com nota interna', admin, true],
    ])('%s não muda o status', async (_, user, isInternal) => {
      tickets.findVisibleOrFail.mockResolvedValue(
        ticket(TicketStatus.WAITING_CUSTOMER, s1),
      );
      tx.comment.create.mockResolvedValue(comment('Estamos verificando'));

      await service.create(
        ticketId,
        { body: 'Estamos verificando', isInternal },
        user,
      );
      expect(tx.comment.create).toHaveBeenCalled();
      expect(tx.ticket.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      TicketStatus.OPEN,
      TicketStatus.IN_PROGRESS,
      TicketStatus.RESOLVED,
    ])('cliente dono em ticket %s não muda o status', async (status) => {
      tickets.findVisibleOrFail.mockResolvedValue(ticket(status, s1));
      tx.comment.create.mockResolvedValue(comment('Segue o comprovante'));

      await service.create(
        ticketId,
        { body: 'Segue o comprovante' },
        customerA,
      );
      expect(tx.ticket.updateMany).not.toHaveBeenCalled();
    });

    it('status alterado antes da gravação → 409 (transação rejeitada)', async () => {
      tickets.findVisibleOrFail.mockResolvedValue(
        ticket(TicketStatus.WAITING_CUSTOMER, s1),
      );
      tx.comment.create.mockResolvedValue(comment('Segue o comprovante'));
      tx.ticket.updateMany.mockResolvedValue({ count: 0 });

      const result = service.create(
        ticketId,
        { body: 'Segue o comprovante' },
        customerA,
      );
      await expect(result).rejects.toBeInstanceOf(ConflictException);
      // A exceção sai de dentro do callback: é ela que desfaz o comentário.
      await expect(
        prisma.$transaction.mock.results[0].value,
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('list', () => {
    const data = [
      comment('Segue o comprovante'),
      comment('Estamos verificando'),
    ];

    beforeEach(() => {
      prisma.comment.findMany.mockResolvedValue(data);
      prisma.comment.count.mockResolvedValue(2);
    });

    it('consulta a visibilidade do ticket antes dos comentários', async () => {
      tickets.findVisibleOrFail.mockResolvedValue(
        ticket(TicketStatus.IN_PROGRESS, s1),
      );

      await service.list(ticketId, { page: 1, limit: 20 }, customerA);

      expect(tickets.findVisibleOrFail).toHaveBeenCalledWith(
        ticketId,
        customerA,
      );
      expect(
        tickets.findVisibleOrFail.mock.invocationCallOrder[0],
      ).toBeLessThan(prisma.comment.findMany.mock.invocationCallOrder[0]);
    });

    it.each([
      ['cliente B no ticket de A', customerB],
      ['atendente S2 no ticket de S1', s2],
    ])('%s → 404 sem consultar comentários', async (_, user) => {
      tickets.findVisibleOrFail.mockRejectedValue(notFound);

      await expect(
        service.list(ticketId, { page: 1, limit: 20 }, user),
      ).rejects.toBe(notFound);
      expect(prisma.comment.findMany).not.toHaveBeenCalled();
      expect(prisma.comment.count).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('cliente: filtra notas internas no where de findMany e count', async () => {
      tickets.findVisibleOrFail.mockResolvedValue(
        ticket(TicketStatus.IN_PROGRESS, s1),
      );

      const result = await service.list(
        ticketId,
        { page: 1, limit: 20 },
        customerA,
      );

      const where = { AND: [{ ticketId }, { isInternal: false }] };
      expect(prisma.comment.findMany).toHaveBeenCalledWith({
        where,
        select: commentSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: 0,
        take: 20,
      });
      expect(prisma.comment.count).toHaveBeenCalledWith({ where });
      expect(result).toEqual({ data, page: 1, limit: 20, total: 2 });
    });

    it.each([
      ['atendente atribuído', s1],
      ['ADMIN', admin],
    ])('%s: sem filtro de isInternal', async (_, user) => {
      tickets.findVisibleOrFail.mockResolvedValue(
        ticket(TicketStatus.IN_PROGRESS, s1),
      );
      prisma.comment.count.mockResolvedValue(3);

      const result = await service.list(ticketId, { page: 2, limit: 2 }, user);

      const where = { AND: [{ ticketId }, {}] };
      expect(prisma.comment.findMany).toHaveBeenCalledWith({
        where,
        select: commentSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: 2,
        take: 2,
      });
      expect(prisma.comment.count).toHaveBeenCalledWith({ where });
      expect(result).toEqual({ data, page: 2, limit: 2, total: 3 });
    });

    it('usa uma transação em lote com findMany e count', async () => {
      tickets.findVisibleOrFail.mockResolvedValue(
        ticket(TicketStatus.IN_PROGRESS, s1),
      );

      await service.list(ticketId, { page: 1, limit: 20 }, admin);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(Array.isArray(prisma.$transaction.mock.calls[0][0])).toBe(true);
    });
  });
});
