import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { Paginated } from '../common/dto/paginated';
import { Prisma, Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { PasswordHasher } from './password-hasher';

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{
  select: typeof publicUserSelect;
}>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async create(
    dto: CreateUserDto,
    role: Role = Role.CUSTOMER,
  ): Promise<PublicUser> {
    const passwordHash = await this.passwordHasher.hash(dto.password);

    try {
      return await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash,
          role,
        },
        select: publicUserSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('E-mail já cadastrado');
      }
      throw error;
    }
  }

  async findAll({
    page,
    limit,
  }: PaginationQueryDto): Promise<Paginated<PublicUser>> {
    // Mesma transação: data e total coerentes entre si.
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        select: publicUserSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count(),
    ]);
    return { data, page, limit, total };
  }

  async findMe(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
    // Token válido de um usuário que não existe mais.
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }

  async changeRole(
    actorId: string,
    targetId: string,
    role: Role,
  ): Promise<PublicUser> {
    if (actorId === targetId) {
      throw new UnprocessableEntityException(
        'Não é permitido alterar o próprio papel',
      );
    }

    try {
      // Papel novo e revogação das sessões são efetivados juntos: o refresh
      // antigo passa a dar 401 e o novo papel vale no próximo login.
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: targetId },
          data: { role },
          select: publicUserSelect,
        });
        await tx.refreshToken.updateMany({
          where: { userId: targetId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return user;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Usuário não encontrado');
      }
      throw error;
    }
  }
}
