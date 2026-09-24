import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { TicketPriority, TicketStatus } from '../../generated/prisma/client.js';

export class ListTicketsQueryDto extends PaginationQueryDto {
  // Os validadores do pai continuam valendo; @Max(50) é o mais restritivo.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  declare limit: number;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}
