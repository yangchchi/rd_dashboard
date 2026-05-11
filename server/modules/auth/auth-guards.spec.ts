import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { JwtAuthGuard } from './jwt-auth.guard';
import { REQUIRED_PERMISSIONS, REQUIRED_PERMISSIONS_ANY } from './permissions.decorator';
import { PermissionsGuard } from './permissions.guard';
import { IS_PUBLIC_ROUTE } from './public.decorator';

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

function reflectorPermissions(
  opts: { required?: string[]; requiredAny?: string[] } = {}
): Reflector {
  const { required, requiredAny } = opts;
  return {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === IS_PUBLIC_ROUTE) return false;
      if (key === REQUIRED_PERMISSIONS_ANY) return requiredAny;
      if (key === REQUIRED_PERMISSIONS) return required;
      return undefined;
    }),
  } as unknown as Reflector;
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
    const reflector = reflectorPermissions({ required: ['page.users'] });
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
    const reflector = reflectorPermissions({ required: ['page.users'] });
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
    const reflector = reflectorPermissions({ required: ['action.users.assign_role'] });
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

  it('allows requests when any of RequireAnyPermission is satisfied', async () => {
    const reflector = reflectorPermissions({ requiredAny: ['page.plugins', 'page.pipeline'] });
    const authService = { getUserAccessRoleIds: jest.fn() };
    const guard = new PermissionsGuard(reflector, authService as never);
    const context = makeContext({});
    context.switchToHttp().getRequest().user = {
      userId: 'tm1',
      username: 'tm',
      permissionIds: ['page.pipeline'],
      accessRoleIds: ['role_tm'],
    };

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects requests when none of RequireAnyPermission is satisfied', async () => {
    const reflector = reflectorPermissions({ requiredAny: ['page.plugins', 'page.pipeline'] });
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
});
