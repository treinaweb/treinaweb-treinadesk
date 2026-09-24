import { IsEnum } from 'class-validator';
import { TicketStatus } from '../../generated/prisma/client.js';

export class UpdateStatusDto {
  @IsEnum(TicketStatus)
  status: TicketStatus;
}
