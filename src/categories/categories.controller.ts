import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';
import { ApiAuth } from '../openapi/api-auth.decorator.js';
import { CategoryResponse } from '../openapi/responses/category.response.js';
import { ErrorResponse } from '../openapi/responses/error.response.js';
import {
  ActiveCategoryView,
  CategoriesService,
  CategoryView,
} from './categories.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

// Sem DELETE: desativar (active: false) substitui a exclusão.
@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @ApiAuth({
    summary: 'Lista categorias',
    description:
      'ADMIN recebe todas, com active. CUSTOMER e SUPPORT recebem só as ' +
      'ativas, sem o campo active. Ordenadas por nome.',
  })
  @ApiOkResponse({ type: [CategoryResponse] })
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CategoryView[] | ActiveCategoryView[]> {
    return this.categoriesService.findAll(user.role);
  }

  @Roles(Role.ADMIN)
  @ApiAuth({ summary: 'Cria categoria', roles: [Role.ADMIN] })
  @ApiCreatedResponse({ type: CategoryResponse })
  @ApiBadRequestResponse({
    type: ErrorResponse,
    description: 'Corpo inválido.',
  })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: 'Já existe uma categoria com esse nome.',
  })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCategoryDto): Promise<CategoryView> {
    return this.categoriesService.create(dto);
  }

  @Roles(Role.ADMIN)
  @ApiAuth({
    summary: 'Renomeia, ativa ou desativa categoria',
    description: 'Informe name e/ou active. Desativar substitui a exclusão.',
    roles: [Role.ADMIN],
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CategoryResponse })
  @ApiBadRequestResponse({
    type: ErrorResponse,
    description: 'id ou corpo inválido, ou corpo sem name e active.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponse,
    description: 'Categoria não encontrada.',
  })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: 'Já existe uma categoria com esse nome.',
  })
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryView> {
    if (dto.name === undefined && dto.active === undefined) {
      throw new BadRequestException('Informe name e/ou active');
    }
    return this.categoriesService.update(id, dto);
  }
}
