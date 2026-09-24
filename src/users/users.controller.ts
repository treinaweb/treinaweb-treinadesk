import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import type { Paginated } from '../common/dto/paginated';
import { Role } from '../generated/prisma/client';
import { ChangeRoleDto } from './dto/change-role.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { PublicUser, UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUserDto): Promise<PublicUser> {
    return this.usersService.create(dto);
  }

  @Roles(Role.ADMIN)
  @Post('staff')
  @HttpCode(HttpStatus.CREATED)
  createStaff(@Body() dto: CreateStaffDto): Promise<PublicUser> {
    return this.usersService.create(dto, dto.role);
  }

  @Roles(Role.ADMIN)
  @Get()
  findAll(@Query() query: PaginationQueryDto): Promise<Paginated<PublicUser>> {
    return this.usersService.findAll(query);
  }

  // Declarada antes de qualquer futura rota GET /users/:id.
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<PublicUser> {
    return this.usersService.findMe(user.id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/role')
  changeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeRoleDto,
  ): Promise<PublicUser> {
    return this.usersService.changeRole(user.id, id, dto.role);
  }
}
