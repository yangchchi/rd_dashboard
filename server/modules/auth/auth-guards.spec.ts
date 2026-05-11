import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';

function makeContext(
  headers: Record<string, string | undefined>,
  handler = function handler() {},
  clazz = class TestClass {},
  overrides: Record<string, unknown> = {}
): ExecutionContext {
  const req: { headers: Record<string, string | undefined>; user?: unknown } & Record<string, unknown> = {
    headers,
    ...overrides,
  };
  return {
    getHandler: () => handler,
    getClass: () => clazz,
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

describe('auth guards', () => {
  it('rejects protected routes without a bearer token', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const authService = {
      authenticateToken: jest.fn(),
    };
    const guard = new JwtAuthGuard(reflector, authService as never);

    await expect(guard.canActivate(makeContext({}))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authService.authenticateToken).not.toHaveBeenCalled();
  });

  it('allows public routes without reading authorization', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;
    const authService = {
      authenticateToken: jest.fn(),
    };
    const guard = new JwtAuthGuard(reflector, authService as never);

    await expect(guard.canActivate(makeContext({}))).resolves.toBe(true);
    expect(authService.authenticateToken).not.toHaveBeenCalled();
  });

  it('attaches authenticated user when bearer token is valid', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const user = { userId: 'u1', username: 'pm', permissionIds: ['page.prd'], accessRoleIds: ['role_pm'] };
    const authService = {
      authenticateToken: jest.fn().mockResolvedValue(user),
    };
    const guard = new JwtAuthGuard(reflector, authService as never);
    const context = makeContext({ authorization: 'Bearer token-1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.authenticateToken).toHaveBeenCalledWith('token-1');
    expect(context.switchToHttp().getRequest().user).toBe(user);
  });

  it('rejects requests missing required permissions', async () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(['page.users']),
    } as unknown as Reflector;
    const authService = { getUserAccessRoleIds: jest.fn() };
    const guard = new PermissionsGuard(reflector, authService as never);
    const context = makeContext({});
    context.switchToHttp().getRequest().user = {
      userId: 'u1',
      username: 'pm',
      permissionIds: ['page.prd'],
      accessRoleIds: ['role_pm'],
    };

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows requests with required permissions', async () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(['page.users']),
    } as unknown as Reflector;
    const authService = { getUserAccessRoleIds: jest.fn() };
    const guard = new PermissionsGuard(reflector, authService as never);
    const context = makeContext({});
    context.switchToHttp().getRequest().user = {
      userId: 'admin',
      username: 'admin',
      permissionIds: ['page.users'],
      accessRoleIds: ['role_admin'],
    };

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows a user without roles to select their own initial built-in role', async () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(['action.users.assign_role']),
    } as unknown as Reflector;
    const authService = { getUserAccessRoleIds: jest.fn().mockResolvedValue([]) };
    const guard = new PermissionsGuard(reflector, authService as never);
    const context = makeContext(
      {},
      undefined,
      undefined,
      {
        method: 'PATCH',
        params: { id: 'u1' },
        body: { accessRoleIds: ['role_pm'] },
      }
    );
    context.switchToHttp().getRequest().user = {
      userId: 'u1',
      username: 'new-user',
      permissionIds: ['page.dashboard'],
      accessRoleIds: [],
    };

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.getUserAccessRoleIds).toHaveBeenCalledWith('u1');
  });
});
