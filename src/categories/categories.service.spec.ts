import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  const prisma = {
    category: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  };

  const knownError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('erro do banco', {
      code,
      clientVersion: Prisma.prismaVersion.client,
    });

  const id = 'c0000000-0000-4000-8000-000000000000';

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(CategoriesService);
  });

  describe('findAll', () => {
    it('ADMIN vê todas as categorias, com o campo active', async () => {
      const categories = [{ id, name: 'Financeiro', active: true }];
      prisma.category.findMany.mockResolvedValue(categories);

      await expect(service.findAll(Role.ADMIN)).resolves.toBe(categories);
      expect(prisma.category.findMany).toHaveBeenCalledWith({
        select: { id: true, name: true, active: true },
        orderBy: { name: 'asc' },
      });
    });

    it.each([Role.CUSTOMER, Role.SUPPORT])(
      '%s vê só as ativas, sem o campo active',
      async (role) => {
        prisma.category.findMany.mockResolvedValue([]);

        await service.findAll(role);

        expect(prisma.category.findMany).toHaveBeenCalledWith({
          where: { active: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
      },
    );
  });

  describe('create', () => {
    it('cria a categoria e retorna id, name e active', async () => {
      const created = { id, name: 'Financeiro', active: true };
      prisma.category.create.mockResolvedValue(created);

      await expect(service.create({ name: 'Financeiro' })).resolves.toBe(
        created,
      );
      expect(prisma.category.create).toHaveBeenCalledWith({
        data: { name: 'Financeiro' },
        select: { id: true, name: true, active: true },
      });
    });

    it('converte nome duplicado (P2002) em ConflictException', async () => {
      prisma.category.create.mockRejectedValue(knownError('P2002'));

      await expect(
        service.create({ name: 'Financeiro' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('altera só os campos enviados', async () => {
      const updated = { id, name: 'Financeiro', active: false };
      prisma.category.update.mockResolvedValue(updated);

      await expect(service.update(id, { active: false })).resolves.toBe(
        updated,
      );
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id },
        data: { active: false },
        select: { id: true, name: true, active: true },
      });
    });

    it('converte nome duplicado (P2002) em ConflictException', async () => {
      prisma.category.update.mockRejectedValue(knownError('P2002'));

      await expect(
        service.update(id, { name: 'Financeiro' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('converte categoria inexistente (P2025) em NotFoundException', async () => {
      prisma.category.update.mockRejectedValue(knownError('P2025'));

      await expect(
        service.update(id, { active: false }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('propaga outros erros do banco', async () => {
      const error = new Error('conexão perdida');
      prisma.category.update.mockRejectedValue(error);

      await expect(service.update(id, { active: false })).rejects.toBe(error);
    });
  });
});
