import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client.js';

// Espelha userSummarySelect (src/tickets/ticket-select.ts).
export class UserSummaryResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Ana' })
  name: string;

  @ApiProperty({ enum: Role, enumName: 'Role' })
  role: Role;
}

// Espelha publicUserSelect (src/users/users.service.ts).
export class PublicUserResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Ana' })
  name: string;

  @ApiProperty({ format: 'email', example: 'ana@teste.com' })
  email: string;

  @ApiProperty({ enum: Role, enumName: 'Role' })
  role: Role;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
}
