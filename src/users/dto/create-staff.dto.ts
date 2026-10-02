import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { Role } from '../../generated/prisma/client.js';
import { CreateUserDto } from './create-user.dto.js';

const STAFF_ROLES = [Role.SUPPORT, Role.ADMIN] as const;

export class CreateStaffDto extends CreateUserDto {
  @ApiProperty({ enum: STAFF_ROLES, example: Role.SUPPORT })
  @IsIn(STAFF_ROLES)
  role: (typeof STAFF_ROLES)[number];
}
