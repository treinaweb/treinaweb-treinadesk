import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const categorySelect = {
  id: true,
  name: true,
  active: true,
} satisfies Prisma.CategorySelect;

export type CategoryView = Prisma.CategoryGetPayload<{
  select: typeof categorySelect;
}>;

export type ActiveCategoryView = Omit<CategoryView, 'active'>;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  // Filtro e projeção na consulta: inativas e o campo active não saem do
  // banco para quem não é ADMIN.
  findAll(role: Role): Promise<CategoryView[] | ActiveCategoryView[]> {
    if (role === Role.ADMIN) {
      return this.prisma.category.findMany({
        select: categorySelect,
        orderBy: { name: 'asc' },
      });
    }
    return this.prisma.category.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateCategoryDto): Promise<CategoryView> {
    try {
      return await this.prisma.category.create({
        data: { name: dto.name },
        select: categorySelect,
      });
    } catch (error) {
      throw translateError(error);
    }
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryView> {
    try {
      return await this.prisma.category.update({
        where: { id },
        data: dto,
        select: categorySelect,
      });
    } catch (error) {
      throw translateError(error);
    }
  }
}

function translateError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return new ConflictException('Já existe uma categoria com esse nome');
    }
    if (error.code === 'P2025') {
      return new NotFoundException('Categoria não encontrada');
    }
  }
  return error;
}
