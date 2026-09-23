import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordHasher } from './password-hasher';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  const prisma = { user: { create: jest.fn() } };
  const passwordHasher = { hash: jest.fn() };

  const dto = {
    name: 'Ana',
    email: 'ana@teste.com',
    password: 'senhaSegura123',
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    passwordHasher.hash.mockResolvedValue('$argon2id$hash-falso');

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
});
