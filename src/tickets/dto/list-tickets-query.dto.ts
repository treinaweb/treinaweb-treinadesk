import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { TicketPriority, TicketStatus } from '../../generated/prisma/client.js';

export class ListTicketsQueryDto extends PaginationQueryDto {
  // Os validadores do pai continuam valendo; @Max(50) é o mais restritivo.
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 50, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  declare limit: number;

  @ApiPropertyOptional({ enum: TicketStatus, enumName: 'TicketStatus' })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketPriority, enumName: 'TicketPriority' })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}
