import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { Paginated } from '../common/dto/paginated.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { Prisma, Role, TicketStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { commentPolicy } from './comment-policy.js';
import { commentSelect, CommentView } from './comment-select.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketsService: TicketsService,
  ) {}

  async create(
    ticketId: string,
    dto: CreateCommentDto,
    user: AuthenticatedUser,
  ): Promise<CommentView> {
    // Primeiro a visibilidade: ticket invisível responde 404 antes de qualquer
    // regra de comentário.
    const ticket = await this.ticketsService.findVisibleOrFail(ticketId, user);
    const isOwner = ticket.customer.id === user.id;
    const isInternal = dto.isInternal ?? false;

    const decision = commentPolicy({
      role: user.role,
      isOwner,
      isAssignee: ticket.assignee?.id === user.id,
      ticketStatus: ticket.status,
      isInternal,
    });
    switch (decision) {
      case 'FORBIDDEN_INTERNAL':
        throw new ForbiddenException(
          'Apenas a equipe pode criar notas internas',
        );
      case 'NOT_ASSIGNED':
        throw new UnprocessableEntityException(
          'Apenas o atendente atribuído pode comentar neste ticket',
        );
      case 'TICKET_CLOSED':
        throw new UnprocessableEntityException(
          'Ticket fechado não aceita comentários',
        );
    }

    const resume =
      user.role === Role.CUSTOMER &&
      isOwner &&
      ticket.status === TicketStatus.WAITING_CUSTOMER;

    // Comentário e retomada juntos: a exceção dentro do callback desfaz o
    // comentário se o status mudou depois da leitura.
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: { ticketId, authorId: user.id, body: dto.body, isInternal },
        select: commentSelect,
      });
      if (resume) {
        const { count } = await tx.ticket.updateMany({
          where: { id: ticketId, status: TicketStatus.WAITING_CUSTOMER },
          data: { status: TicketStatus.IN_PROGRESS },
        });
        if (count === 0) {
          throw new ConflictException(
            'O ticket foi alterado por outra requisição',
          );
        }
      }
      return comment;
    });
  }

  async list(
    ticketId: string,
    query: PaginationQueryDto,
    user: AuthenticatedUser,
  ): Promise<Paginated<CommentView>> {
    await this.ticketsService.findVisibleOrFail(ticketId, user);

    const { page, limit } = query;
    // Notas internas filtradas na consulta: nunca saem do banco para o
    // cliente, e page/total contam só o que ele pode ver.
    const where: Prisma.CommentWhereInput = {
      AND: [
        { ticketId },
        user.role === Role.CUSTOMER ? { isInternal: false } : {},
      ],
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        select: commentSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.comment.count({ where }),
    ]);

    return { data, page, limit, total };
  }
}
