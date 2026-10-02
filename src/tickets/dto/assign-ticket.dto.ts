import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

// Obrigatório para ADMIN e proibido para SUPPORT: validado no service.
export class AssignTicketDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Atendente (SUPPORT) a atribuir. Obrigatório para ADMIN; SUPPORT não ' +
      'envia (atribui a si mesmo) e recebe 400 se enviar.',
  })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
