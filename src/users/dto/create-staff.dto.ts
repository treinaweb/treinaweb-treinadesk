import { IsIn } from 'class-validator';
import { Role } from '../../generated/prisma/client';
import { CreateUserDto } from './create-user.dto';

const STAFF_ROLES = [Role.SUPPORT, Role.ADMIN] as const;

export class CreateStaffDto extends CreateUserDto {
  @IsIn(STAFF_ROLES)
  role: (typeof STAFF_ROLES)[number];
}
