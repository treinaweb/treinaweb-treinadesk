import { IsEnum } from 'class-validator';
import { Role } from '../../generated/prisma/client';

export class ChangeRoleDto {
  @IsEnum(Role)
  role: Role;
}
