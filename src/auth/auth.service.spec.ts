import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PasswordHasher } from '../users/password-hasher.js';
import { AuthService } from './auth.service.js';
import { hashRefreshToken } from './refresh-token.js';

describe('AuthService', () => {
  let service: AuthService;
  const prisma = {
    user: { findUnique: jest.fn() },
    refreshToken: { create: jest.fn() },
  };
  const passwordHasher = { hash: jest.fn(), verify: jest.fn() };
  const jwtService = { signAsync: jest.fn() };

  const user = {
    id: 'b3f1c7de-0000-4000-8000-000000000000',
    email: 'ana@teste.com',
    passwordHash: '$argon2id$hash-real',
    role: Role.CUSTOMER,
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    passwordHasher.hash.mockResolvedValue('$argon2id$hash-de-referencia');
    jwtService.signAsync.mockResolvedValue('access.token.jwt');
    prisma.refreshToken.create.mockResolvedValue({});

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: PasswordHasher, useValue: passwordHasher },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('para e-mail inexistente verifica a senha contra o hash de referência e lança 401', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    passwordHasher.verify.mockResolvedValue(false);

    const promise = service.login('ninguem@teste.com', 'senha-forte-123');

    await expect(promise).rejects.toEqual(
      new UnauthorizedException('Credenciais inválidas'),
    );
    expect(passwordHasher.verify).toHaveBeenCalledWith(
      '$argon2id$hash-de-referencia',
      'senha-forte-123',
    );
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('para senha errada lança a mesma exceção', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    passwordHasher.verify.mockResolvedValue(false);

    await expect(
      service.login('ana@teste.com', 'senha-errada-000'),
    ).rejects.toEqual(new UnauthorizedException('Credenciais inválidas'));
    expect(passwordHasher.verify).toHaveBeenCalledWith(
      user.passwordHash,
      'senha-errada-000',
    );
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('login válido emite o par e grava apenas o hash do refresh token', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    passwordHasher.verify.mockResolvedValue(true);

    const result = await service.login('ana@teste.com', 'senha-forte-123');

    expect(result).toEqual({
      accessToken: 'access.token.jwt',
      refreshToken: expect.any(String),
    });
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const { data } = prisma.refreshToken.create.mock.calls[0][0];
    expect(data.userId).toBe(user.id);
    expect(data.tokenHash).toBe(hashRefreshToken(result.refreshToken));
    expect(Object.values(data)).not.toContain(result.refreshToken);
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
