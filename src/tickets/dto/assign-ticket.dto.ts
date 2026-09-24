import { IsOptional, IsUUID } from 'class-validator';

// Obrigatório para ADMIN e proibido para SUPPORT: validado no service.
export class AssignTicketDto {
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
