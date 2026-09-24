import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PasswordHasher } from './password-hasher.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let service: UsersService;
  const prisma = {
    user: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const knownError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('erro do banco', {
      code,
      clientVersion: Prisma.prismaVersion.client,
    });
  const passwordHasher = { hash: jest.fn() };

  const dto = {
    name: 'Ana',
    email: 'ana@teste.com',
    password: 'senhaSegura123',
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    passwordHasher.hash.mockResolvedValue('$argon2id$hash-falso');
    // Array: resolve as consultas em sequência; callback: usa o próprio mock como tx.
    prisma.$transaction.mockImplementation((arg: unknown) =>
      Array.isArray(arg)
        ? Promise.all(arg)
        : (arg as (tx: typeof prisma) => Promise<unknown>)(prisma),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: PasswordHasher, useValue: passwordHasher },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('cria o usuário sempre como CUSTOMER, gravando o hash e não a senha', async () => {
    const created = {
      id: 'b3f1c7de-0000-4000-8000-000000000000',
      name: 'Ana',
      email: 'ana@teste.com',
      role: Role.CUSTOMER,
      createdAt: new Date(),
    };
    prisma.user.create.mockResolvedValue(created);

    const result = await service.create(dto);

    expect(passwordHasher.hash).toHaveBeenCalledWith('senhaSegura123');
    const args = prisma.user.create.mock.calls[0][0];
    expect(args.data).toEqual({
      name: 'Ana',
      email: 'ana@teste.com',
      passwordHash: '$argon2id$hash-falso',
      role: Role.CUSTOMER,
    });
    expect(args.data).not.toHaveProperty('password');
    expect(result).toEqual(created);
  });

  it('seleciona apenas os campos públicos, sem o hash da senha', async () => {
    prisma.user.create.mockResolvedValue({});

    await service.create(dto);

    const { select } = prisma.user.create.mock.calls[0][0];
    expect(select).toEqual({
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    });
    expect(select).not.toHaveProperty('passwordHash');
  });

  it('converte violação de unicidade (P2002) em ConflictException', async () => {
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: Prisma.prismaVersion.client,
      }),
    );

    await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('propaga outros erros do banco', async () => {
    const error = new Error('conexão perdida');
    prisma.user.create.mockRejectedValue(error);

    await expect(service.create(dto)).rejects.toBe(error);
  });

  it('cria com o papel informado', async () => {
    prisma.user.create.mockResolvedValue({});

    await service.create(dto, Role.SUPPORT);

    expect(prisma.user.create.mock.calls[0][0].data.role).toBe(Role.SUPPORT);
  });

  describe('findAll', () => {
    it('busca a página e o total na mesma transação', async () => {
      const users = [{ id: 'u3' }, { id: 'u4' }];
      prisma.user.findMany.mockResolvedValue(users);
      prisma.user.count.mockResolvedValue(5);

      const result = await service.findAll({ page: 2, limit: 2 });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(Array.isArray(prisma.$transaction.mock.calls[0][0])).toBe(true);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: 2,
        take: 2,
      });
      expect(prisma.user.count).toHaveBeenCalled();
      expect(result).toEqual({ data: users, page: 2, limit: 2, total: 5 });
    });
  });

  describe('changeRole', () => {
    const adminId = 'a0000000-0000-4000-8000-000000000000';
    const targetId = 'b0000000-0000-4000-8000-000000000000';

    it('recusa com 422 a alteração do próprio papel, sem tocar no banco', async () => {
      await expect(
        service.changeRole(adminId, adminId, Role.CUSTOMER),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('altera o papel e revoga os refresh tokens ativos na mesma transação', async () => {
      const updated = { id: targetId, role: Role.SUPPORT };
      prisma.user.update.mockResolvedValue(updated);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.changeRole(adminId, targetId, Role.SUPPORT);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(typeof prisma.$transaction.mock.calls[0][0]).toBe('function');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: targetId },
        data: { role: Role.SUPPORT },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });
      const revoke = prisma.refreshToken.updateMany.mock.calls[0][0];
      expect(revoke.where).toEqual({ userId: targetId, revokedAt: null });
      expect(revoke.data.revokedAt).toBeInstanceOf(Date);
      expect(result).toBe(updated);
    });

    it('converte usuário inexistente (P2025) em NotFoundException', async () => {
      prisma.user.update.mockRejectedValue(knownError('P2025'));

      await expect(
        service.changeRole(adminId, targetId, Role.SUPPORT),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
