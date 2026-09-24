import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { Role, TicketStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ticketSelect } from './ticket-select.js';
import { visibilityWhere } from './ticket-visibility.js';
import { TicketsService } from './tickets.service.js';

describe('TicketsService', () => {
  let service: TicketsService;
  const prisma = {
    ticket: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    category: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  const ticketId = 't0000000-0000-4000-8000-000000000000';
  const categoryId = 'c0000000-0000-4000-8000-000000000000';
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

  const summary = (user: AuthenticatedUser, name: string) => ({
    id: user.id,
    name,
    role: user.role,
  });

  // Ticket T do cliente A, no formato de ticketSelect.
  const ticket = (
    status: TicketStatus,
    assignee: AuthenticatedUser | null = null,
  ) => ({
    id: ticketId,
    title: 'Cobrança duplicada',
    description: 'Fui cobrada duas vezes na fatura de março.',
    status,
    priority: 'HIGH',
    category: { id: categoryId, name: 'Financeiro' },
    customer: summary(customerA, 'Ana'),
    assignee: assignee && summary(assignee, 'Bia'),
    createdAt: new Date(),
    updatedAt: new Date(),
    closedAt: null,
  });

  const visibleQuery = (user: AuthenticatedUser) => ({
    where: { AND: [{ id: ticketId }, visibilityWhere(user)] },
    select: ticketSelect,
  });

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [TicketsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(TicketsService);
  });

  describe('create', () => {
    const dto = {
      title: 'Cobrança duplicada',
      description: 'Fui cobrada duas vezes na fatura de março.',
      priority: 'HIGH' as const,
      categoryId,
    };

    it('categoria inexistente ou inativa → 422 sem criar', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(service.create(dto, customerA)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(prisma.category.findFirst).toHaveBeenCalledWith({
        where: { id: categoryId, active: true },
        select: { id: true },
      });
      expect(prisma.ticket.create).not.toHaveBeenCalled();
    });

    it('cria com o cliente do token, sem status nem atendente', async () => {
      const created = ticket(TicketStatus.OPEN);
      prisma.category.findFirst.mockResolvedValue({ id: categoryId });
      prisma.ticket.create.mockResolvedValue(created);

      await expect(service.create(dto, customerA)).resolves.toBe(created);
      expect(prisma.ticket.create).toHaveBeenCalledWith({
        data: { ...dto, customerId: customerA.id },
        select: ticketSelect,
      });
    });
  });

  describe('findVisibleOrFail', () => {
    it('filtra por id e visibilidade do usuário', async () => {
      const found = ticket(TicketStatus.OPEN);
      prisma.ticket.findFirst.mockResolvedValue(found);

      await expect(service.findVisibleOrFail(ticketId, s1)).resolves.toBe(
        found,
      );
      expect(prisma.ticket.findFirst).toHaveBeenCalledWith(visibleQuery(s1));
    });

    it.each([customerB, s2, admin])(
      'ticket não encontrado para %o → 404 com a mesma mensagem',
      async (user) => {
        prisma.ticket.findFirst.mockResolvedValue(null);

        await expect(service.findVisibleOrFail(ticketId, user)).rejects.toThrow(
          new NotFoundException('Ticket não encontrado'),
        );
      },
    );
  });

  describe('findAll', () => {
    it('usa o mesmo where (visibilidade + filtros) em findMany e count', async () => {
      const data = [ticket(TicketStatus.OPEN)];
      prisma.ticket.findMany.mockReturnValue('findMany');
      prisma.ticket.count.mockReturnValue('count');
      prisma.$transaction.mockResolvedValue([data, 7]);

      const result = await service.findAll(
        { page: 3, limit: 2, status: TicketStatus.OPEN, priority: 'HIGH' },
        customerA,
      );

      const where = {
        AND: [
          visibilityWhere(customerA),
          { status: TicketStatus.OPEN, priority: 'HIGH' },
        ],
      };
      expect(prisma.ticket.findMany).toHaveBeenCalledWith({
        where,
        select: ticketSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 4,
        take: 2,
      });
      expect(prisma.ticket.count).toHaveBeenCalledWith({ where });
      expect(prisma.$transaction).toHaveBeenCalledWith(['findMany', 'count']);
      expect(result).toEqual({ data, page: 3, limit: 2, total: 7 });
    });
  });

  describe('assign', () => {
    it('SUPPORT com assigneeId → 400 sem consultar', async () => {
      await expect(
        service.assign(ticketId, { assigneeId: s2.id }, s1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.ticket.findFirst).not.toHaveBeenCalled();
    });

    it('ADMIN sem assigneeId → 400 sem consultar', async () => {
      await expect(service.assign(ticketId, {}, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.ticket.findFirst).not.toHaveBeenCalled();
    });

    it('ticket invisível → 404 sem escrever', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null);

      await expect(service.assign(ticketId, {}, s2)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.ticket.findFirst).toHaveBeenCalledWith(visibleQuery(s2));
      expect(prisma.ticket.updateMany).not.toHaveBeenCalled();
    });

    it('SUPPORT em ticket já seu → 422 sem escrever', async () => {
      prisma.ticket.findFirst.mockResolvedValue(
        ticket(TicketStatus.IN_PROGRESS, s1),
      );

      await expect(service.assign(ticketId, {}, s1)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(prisma.ticket.updateMany).not.toHaveBeenCalled();
    });

    it('SUPPORT assume ticket da fila com escrita condicional', async () => {
      const updated = ticket(TicketStatus.IN_PROGRESS, s1);
      prisma.ticket.findFirst.mockResolvedValue(ticket(TicketStatus.OPEN));
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticket.findUniqueOrThrow.mockResolvedValue(updated);

      await expect(service.assign(ticketId, {}, s1)).resolves.toBe(updated);
      expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: ticketId, status: TicketStatus.OPEN, assigneeId: null },
        data: { assigneeId: s1.id, status: TicketStatus.IN_PROGRESS },
      });
      expect(prisma.ticket.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: ticketId },
        select: ticketSelect,
      });
    });

    it('escrita sem efeito (count 0) → 409', async () => {
      prisma.ticket.findFirst.mockResolvedValue(ticket(TicketStatus.OPEN));
      prisma.ticket.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.assign(ticketId, {}, s1)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.ticket.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it.each([TicketStatus.RESOLVED, TicketStatus.CLOSED])(
      'ADMIN em ticket %s → 422 sem escrever',
      async (status) => {
        prisma.ticket.findFirst.mockResolvedValue(ticket(status, s1));
        prisma.user.findFirst.mockResolvedValue({ id: s2.id });

        await expect(
          service.assign(ticketId, { assigneeId: s2.id }, admin),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
        expect(prisma.ticket.updateMany).not.toHaveBeenCalled();
      },
    );

    it('ADMIN com destinatário que não é SUPPORT → 422 sem escrever', async () => {
      prisma.ticket.findFirst.mockResolvedValue(ticket(TicketStatus.OPEN));
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.assign(ticketId, { assigneeId: customerB.id }, admin),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: customerB.id, role: Role.SUPPORT },
        select: { id: true },
      });
      expect(prisma.ticket.updateMany).not.toHaveBeenCalled();
    });

    it('ADMIN atribui ticket OPEN → IN_PROGRESS', async () => {
      prisma.ticket.findFirst.mockResolvedValue(ticket(TicketStatus.OPEN));
      prisma.user.findFirst.mockResolvedValue({ id: s1.id });
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });

      await service.assign(ticketId, { assigneeId: s1.id }, admin);

      expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: ticketId, status: TicketStatus.OPEN, assigneeId: null },
        data: { assigneeId: s1.id, status: TicketStatus.IN_PROGRESS },
      });
    });

    it('ADMIN substitui atendente em WAITING_CUSTOMER mantendo o status', async () => {
      prisma.ticket.findFirst.mockResolvedValue(
        ticket(TicketStatus.WAITING_CUSTOMER, s1),
      );
      prisma.user.findFirst.mockResolvedValue({ id: s2.id });
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });

      await service.assign(ticketId, { assigneeId: s2.id }, admin);

      expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
        where: {
          id: ticketId,
          status: TicketStatus.WAITING_CUSTOMER,
          assigneeId: s1.id,
        },
        data: { assigneeId: s2.id, status: TicketStatus.WAITING_CUSTOMER },
      });
    });
  });

  describe('changeStatus', () => {
    it('ticket invisível → 404 sem escrever', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null);

      await expect(
        service.changeStatus(ticketId, { status: 'CLOSED' }, customerB),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.ticket.findFirst).toHaveBeenCalledWith(
        visibleQuery(customerB),
      );
      expect(prisma.ticket.updateMany).not.toHaveBeenCalled();
    });

    it('transição fora da tabela → 422 sem escrever', async () => {
      prisma.ticket.findFirst.mockResolvedValue(
        ticket(TicketStatus.IN_PROGRESS, s1),
      );

      await expect(
        service.changeStatus(ticketId, { status: 'RESOLVED' }, customerA),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.ticket.updateMany).not.toHaveBeenCalled();
    });

    it('transição válida grava condicionada a status e atendente, sem closedAt', async () => {
      const updated = ticket(TicketStatus.RESOLVED, s1);
      prisma.ticket.findFirst.mockResolvedValue(
        ticket(TicketStatus.IN_PROGRESS, s1),
      );
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticket.findUniqueOrThrow.mockResolvedValue(updated);

      await expect(
        service.changeStatus(ticketId, { status: 'RESOLVED' }, s1),
      ).resolves.toBe(updated);
      expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
        where: {
          id: ticketId,
          status: TicketStatus.IN_PROGRESS,
          assigneeId: s1.id,
        },
        data: { status: TicketStatus.RESOLVED },
      });
    });

    it('ir para CLOSED preenche closedAt', async () => {
      prisma.ticket.findFirst.mockResolvedValue(ticket(TicketStatus.OPEN));
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });

      await service.changeStatus(ticketId, { status: 'CLOSED' }, customerA);

      expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: ticketId, status: TicketStatus.OPEN, assigneeId: null },
        data: { status: TicketStatus.CLOSED, closedAt: expect.any(Date) },
      });
    });

    it('escrita sem efeito (count 0) → 409', async () => {
      prisma.ticket.findFirst.mockResolvedValue(ticket(TicketStatus.OPEN));
      prisma.ticket.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.changeStatus(ticketId, { status: 'CLOSED' }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
