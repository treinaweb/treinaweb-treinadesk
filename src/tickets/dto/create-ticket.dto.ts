import { IsEnum, IsString, IsUUID, Length } from 'class-validator';
import { Trim } from '../../common/dto/trim';
import { TicketPriority } from '../../generated/prisma/client';

// Sem customerId, status nem assigneeId: o ValidationPipe os recusa com 400.
export class CreateTicketDto {
  @Trim()
  @IsString()
  @Length(5, 120)
  title: string;

  @Trim()
  @IsString()
  @Length(10, 5000)
  description: string;

  @IsEnum(TicketPriority)
  priority: TicketPriority;

  @IsUUID()
  categoryId: string;
}
