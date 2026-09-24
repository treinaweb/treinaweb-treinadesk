import { IsEnum } from 'class-validator';
import { TicketStatus } from '../../generated/prisma/client';

export class UpdateStatusDto {
  @IsEnum(TicketStatus)
  status: TicketStatus;
}
