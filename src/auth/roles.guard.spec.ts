import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../generated/prisma/client.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { ROLES_KEY } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  let guard: RolesGuard;

  function contextWith(user?: { role: Role }) {
    return {
      getHandler: () => 'handler',
      getClass: () => 'class',
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  function withMetadata(metadata: { isPublic?: boolean; roles?: Role[] }) {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === IS_PUBLIC_KEY ? metadata.isPublic : metadata.roles,
    );
  }

  beforeEach(() => {
    jest.resetAllMocks();
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('libera rota sem metadado de papéis', () => {
    withMetadata({});

    expect(guard.canActivate(contextWith({ role: Role.CUSTOMER }))).toBe(true);
  });

  it('libera rota com lista de papéis vazia', () => {
    withMetadata({ roles: [] });

    expect(guard.canActivate(contextWith({ role: Role.CUSTOMER }))).toBe(true);
  });

  it('libera rota pública mesmo sem usuário na requisição', () => {
    withMetadata({ isPublic: true, roles: [Role.ADMIN] });

    expect(guard.canActivate(contextWith())).toBe(true);
  });

  it('libera quando o papel do usuário está na lista', () => {
    withMetadata({ roles: [Role.ADMIN] });

    expect(guard.canActivate(contextWith({ role: Role.ADMIN }))).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      'handler',
      'class',
    ]);
  });

  it.each([Role.CUSTOMER, Role.SUPPORT])(
    'lança ForbiddenException para %s em rota só de ADMIN',
    (role) => {
      withMetadata({ roles: [Role.ADMIN] });

      expect(() => guard.canActivate(contextWith({ role }))).toThrow(
        ForbiddenException,
      );
    },
  );
});
