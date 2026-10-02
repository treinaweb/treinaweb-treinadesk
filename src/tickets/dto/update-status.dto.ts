import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { TicketStatus } from '../../generated/prisma/client.js';

export class UpdateStatusDto {
  @ApiProperty({ enum: TicketStatus, enumName: 'TicketStatus' })
  @IsEnum(TicketStatus)
  status: TicketStatus;
}
