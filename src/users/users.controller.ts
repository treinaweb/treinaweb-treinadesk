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
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import type { Paginated } from '../common/dto/paginated.js';
import { Role } from '../generated/prisma/client.js';
import { ApiAuth } from '../openapi/api-auth.decorator.js';
import { ErrorResponse } from '../openapi/responses/error.response.js';
import { PaginatedUsersResponse } from '../openapi/responses/paginated.response.js';
import { PublicUserResponse } from '../openapi/responses/user.response.js';
import { ChangeRoleDto } from './dto/change-role.dto.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { PublicUser, UsersService } from './users.service.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @ApiOperation({
    summary: 'Cadastro de cliente',
    description: 'Rota pública. Cria um usuário com papel CUSTOMER.',
  })
  @ApiCreatedResponse({ type: PublicUserResponse })
  @ApiBadRequestResponse({
    type: ErrorResponse,
    description: 'Corpo inválido.',
  })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: 'E-mail já cadastrado.',
  })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUserDto): Promise<PublicUser> {
    return this.usersService.create(dto);
  }

  @Roles(Role.ADMIN)
  @ApiAuth({
    summary: 'Cadastro de atendente ou administrador',
    roles: [Role.ADMIN],
  })
  @ApiCreatedResponse({ type: PublicUserResponse })
  @ApiBadRequestResponse({
    type: ErrorResponse,
    description: 'Corpo inválido.',
  })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: 'E-mail já cadastrado.',
  })
  @Post('staff')
  @HttpCode(HttpStatus.CREATED)
  createStaff(@Body() dto: CreateStaffDto): Promise<PublicUser> {
    return this.usersService.create(dto, dto.role);
  }

  @Roles(Role.ADMIN)
  @ApiAuth({ summary: 'Lista usuários (paginada)', roles: [Role.ADMIN] })
  @ApiOkResponse({ type: PaginatedUsersResponse })
  @ApiBadRequestResponse({
    type: ErrorResponse,
    description: 'page/limit inválidos.',
  })
  @Get()
  findAll(@Query() query: PaginationQueryDto): Promise<Paginated<PublicUser>> {
    return this.usersService.findAll(query);
  }

  // Declarada antes de qualquer futura rota GET /users/:id.
  @ApiAuth({ summary: 'Dados do usuário autenticado' })
  @ApiOkResponse({ type: PublicUserResponse })
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<PublicUser> {
    return this.usersService.findMe(user.id);
  }

  @Roles(Role.ADMIN)
  @ApiAuth({
    summary: 'Altera o papel de um usuário',
    description:
      'Revoga as sessões do usuário alterado: o novo papel vale no próximo login.',
    roles: [Role.ADMIN],
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: PublicUserResponse })
  @ApiBadRequestResponse({
    type: ErrorResponse,
    description: 'id ou corpo inválido.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponse,
    description: 'Usuário não encontrado.',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponse,
    description: 'Não é permitido alterar o próprio papel.',
  })
  @Patch(':id/role')
  changeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeRoleDto,
  ): Promise<PublicUser> {
    return this.usersService.changeRole(user.id, id, dto.role);
  }
}
