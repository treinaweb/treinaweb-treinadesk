import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsUUID, Length } from 'class-validator';
import { Trim } from '../../common/dto/trim.js';
import { TicketPriority } from '../../generated/prisma/client.js';

// Sem customerId, status nem assigneeId: o ValidationPipe os recusa com 400.
export class CreateTicketDto {
  @ApiProperty({ minLength: 5, maxLength: 120, example: 'Cobrança duplicada' })
  @Trim()
  @IsString()
  @Length(5, 120)
  title: string;

  @ApiProperty({
    minLength: 10,
    maxLength: 5000,
    example: 'Fui cobrado duas vezes na fatura de setembro.',
  })
  @Trim()
  @IsString()
  @Length(10, 5000)
  description: string;

  @ApiProperty({ enum: TicketPriority, enumName: 'TicketPriority' })
  @IsEnum(TicketPriority)
  priority: TicketPriority;

  @ApiProperty({ format: 'uuid', description: 'Categoria ativa.' })
  @IsUUID()
  categoryId: string;
}
