import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../generated/prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from './public.decorator';

describe('JwtAuthGuard', () => {
  const jwtService = { verifyAsync: jest.fn() };
  const reflector = { getAllAndOverride: jest.fn() };
  let guard: JwtAuthGuard;

  function contextWith(headers: Record<string, string>) {
    const request: { headers: Record<string, string>; user?: unknown } = {
      headers,
    };
    const context = {
      getHandler: () => 'handler',
      getClass: () => 'class',
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { context, request };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    reflector.getAllAndOverride.mockReturnValue(false);
    guard = new JwtAuthGuard(
      jwtService as unknown as JwtService,
      reflector as unknown as Reflector,
    );
  });

  it('libera rota pública sem cabeçalho', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const { context } = contextWith({});

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      'handler',
      'class',
    ]);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it.each([
    ['sem cabeçalho', {}],
    ['com esquema diferente de Bearer', { authorization: 'Token abc' }],
    ['com Bearer vazio', { authorization: 'Bearer' }],
    ['com Bearer seguido só de espaço', { authorization: 'Bearer ' }],
  ])('lança 401 %s', async (_desc, headers) => {
    const { context } = contextWith(headers);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('lança 401 quando a verificação do token falha', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));
    const { context } = contextWith({ authorization: 'Bearer abc.def.ghi' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('com token válido grava o usuário na requisição', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      email: 'ana@teste.com',
      role: Role.CUSTOMER,
      iat: 1,
      exp: 2,
    });
    const { context, request } = contextWith({
      authorization: 'Bearer abc.def.ghi',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('abc.def.ghi', {
      algorithms: ['HS256'],
    });
    expect(request.user).toEqual({
      id: 'user-id',
      email: 'ana@teste.com',
      role: Role.CUSTOMER,
    });
  });
});
