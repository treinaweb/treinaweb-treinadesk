import { ApiProperty } from '@nestjs/swagger';
import { TicketPriority, TicketStatus } from '../../generated/prisma/client.js';
import { CategorySummaryResponse } from './category.response.js';
import { UserSummaryResponse } from './user.response.js';

// Espelha ticketSelect (src/tickets/ticket-select.ts).
export class TicketResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Cobrança duplicada' })
  title: string;

  @ApiProperty({ example: 'Fui cobrado duas vezes na fatura de setembro.' })
  description: string;

  @ApiProperty({ enum: TicketStatus, enumName: 'TicketStatus' })
  status: TicketStatus;

  @ApiProperty({ enum: TicketPriority, enumName: 'TicketPriority' })
  priority: TicketPriority;

  @ApiProperty({ type: CategorySummaryResponse })
  category: CategorySummaryResponse;

  @ApiProperty({ type: UserSummaryResponse })
  customer: UserSummaryResponse;

  @ApiProperty({
    type: UserSummaryResponse,
    nullable: true,
    description: 'null enquanto o ticket não foi atribuído.',
  })
  assignee: UserSummaryResponse | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Preenchido quando o ticket vai para CLOSED.',
  })
  closedAt: Date | null;
}
