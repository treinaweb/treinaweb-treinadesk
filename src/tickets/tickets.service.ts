import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { Paginated } from '../common/dto/paginated.js';
import { Prisma, Role, TicketStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AssignTicketDto } from './dto/assign-ticket.dto.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { ListTicketsQueryDto } from './dto/list-tickets-query.dto.js';
import { UpdateStatusDto } from './dto/update-status.dto.js';
import { ticketSelect, TicketView } from './ticket-select.js';
import { canTransition } from './ticket-transitions.js';
import { visibilityWhere } from './ticket-visibility.js';

const ASSIGNABLE_STATUSES: TicketStatus[] = [
  TicketStatus.OPEN,
  TicketStatus.IN_PROGRESS,
  TicketStatus.WAITING_CUSTOMER,
];

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateTicketDto,
    user: AuthenticatedUser,
  ): Promise<TicketView> {
    // Inexistente e inativa com a mesma resposta.
    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, active: true },
      select: { id: true },
    });
    if (!category) {
      throw new UnprocessableEntityException(
        'Categoria inexistente ou inativa',
      );
    }

    return this.prisma.ticket.create({
      data: { ...dto, customerId: user.id },
      select: ticketSelect,
    });
  }

  async findAll(
    query: ListTicketsQueryDto,
    user: AuthenticatedUser,
  ): Promise<Paginated<TicketView>> {
    const { page, limit, status, priority } = query;
    // AND explícito: um filtro nunca sobrescreve a regra de visibilidade.
    const where: Prisma.TicketWhereInput = {
      AND: [visibilityWhere(user), { status, priority }],
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        select: ticketSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return { data, page, limit, total };
  }

  // Inexistente e invisível respondem igual (404, nunca 403). Toda rota com
  // :id passa por aqui antes de qualquer regra ou escrita.
  async findVisibleOrFail(
    id: string,
    user: AuthenticatedUser,
  ): Promise<TicketView> {
    const ticket = await this.prisma.ticket.findFirst({
      where: { AND: [{ id }, visibilityWhere(user)] },
      select: ticketSelect,
    });
    if (!ticket) {
      throw new NotFoundException('Ticket não encontrado');
    }
    return ticket;
  }

  async assign(
    id: string,
    dto: AssignTicketDto,
    user: AuthenticatedUser,
  ): Promise<TicketView> {
    if (user.role === Role.SUPPORT && dto.assigneeId !== undefined) {
      throw new BadRequestException(
        'assigneeId não é permitido: o atendente assume o ticket para si',
      );
    }
    if (user.role === Role.ADMIN && dto.assigneeId === undefined) {
      throw new BadRequestException('assigneeId é obrigatório');
    }

    const ticket = await this.findVisibleOrFail(id, user);

    if (user.role === Role.SUPPORT) {
      // Visível para o SUPPORT = da fila ou já dele.
      if (ticket.assignee?.id === user.id) {
        throw new UnprocessableEntityException(
          'O ticket já está atribuído a você',
        );
      }
      return this.writeIfUnchanged(
        { id, status: TicketStatus.OPEN, assigneeId: null },
        { assigneeId: user.id, status: TicketStatus.IN_PROGRESS },
      );
    }

    if (!ASSIGNABLE_STATUSES.includes(ticket.status)) {
      throw new UnprocessableEntityException(
        'O status do ticket não permite atribuição',
      );
    }
    const assignee = await this.prisma.user.findFirst({
      where: { id: dto.assigneeId, role: Role.SUPPORT },
      select: { id: true },
    });
    if (!assignee) {
      throw new UnprocessableEntityException(
        'O destinatário deve ser um atendente (SUPPORT)',
      );
    }

    return this.writeIfUnchanged(
      { id, status: ticket.status, assigneeId: ticket.assignee?.id ?? null },
      {
        assigneeId: assignee.id,
        status:
          ticket.status === TicketStatus.OPEN
            ? TicketStatus.IN_PROGRESS
            : ticket.status,
      },
    );
  }

  async changeStatus(
    id: string,
    dto: UpdateStatusDto,
    user: AuthenticatedUser,
  ): Promise<TicketView> {
    const ticket = await this.findVisibleOrFail(id, user);

    const allowed = canTransition({
      from: ticket.status,
      to: dto.status,
      role: user.role,
      isOwner: ticket.customer.id === user.id,
      isAssignee: ticket.assignee?.id === user.id,
    });
    if (!allowed) {
      throw new UnprocessableEntityException(
        `Transição de ${ticket.status} para ${dto.status} não permitida`,
      );
    }

    // assigneeId na condição: um atendente substituído entre a leitura e a
    // escrita não altera o status com a permissão antiga.
    return this.writeIfUnchanged(
      { id, status: ticket.status, assigneeId: ticket.assignee?.id ?? null },
      dto.status === TicketStatus.CLOSED
        ? { status: dto.status, closedAt: new Date() }
        : { status: dto.status },
    );
  }

  // Compare-and-set: grava só se o ticket ainda está no estado lido.
  private async writeIfUnchanged(
    where: Prisma.TicketWhereInput & { id: string },
    data: Prisma.TicketUncheckedUpdateManyInput,
  ): Promise<TicketView> {
    const { count } = await this.prisma.ticket.updateMany({ where, data });
    if (count === 0) {
      throw new ConflictException('O ticket foi alterado por outra requisição');
    }
    return this.prisma.ticket.findUniqueOrThrow({
      where: { id: where.id },
      select: ticketSelect,
    });
  }
}
