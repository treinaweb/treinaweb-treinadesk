import { IsEnum } from 'class-validator';
import { Role } from '../../generated/prisma/client.js';

export class ChangeRoleDto {
  @IsEnum(Role)
  role: Role;
}
