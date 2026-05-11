import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { IAuthenticatedUser } from './auth-context';
import { AuthService } from './auth.service';
import { IS_PUBLIC_ROUTE } from './public.decorator';
import { REQUIRED_PERMISSIONS, REQUIRED_PERMISSIONS_ANY } from './permissions.decorator';

type RequestWithAuthUser = Request & { user?: IAuthenticatedUser };

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithAuthUser>();
    const allowed = new Set(request.user?.permissionIds ?? []);

    const requiredAny = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_ANY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredAny?.length) {
      const hasOne = requiredAny.some((id) => allowed.has(id));
      if (!hasOne) {
        throw new ForbiddenException(`缺少权限之一：${requiredAny.join(', ')}`);
      }
      return true;
    }

    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const missing = required.filter((id) => !allowed.has(id));
    if (missing.length > 0) {
      if (await this.isRoleBootstrapAllowed(request, required)) return true;
      throw new ForbiddenException(`缺少权限：${missing.join(', ')}`);
    }
    return true;
  }

  private async isRoleBootstrapAllowed(
    request: RequestWithAuthUser,
    required: string[]
  ): Promise<boolean> {
    if (!required.includes('action.users.assign_role')) return false;
    if (request.method !== 'PATCH') return false;
    const params = request.params as { id?: string };
    if (!params?.id || params.id !== request.user?.userId) return false;

    const body = request.body as { accessRoleIds?: unknown; accessRoleId?: unknown };
    const roleIds = Array.isArray(body.accessRoleIds)
      ? body.accessRoleIds
      : typeof body.accessRoleId === 'string'
        ? [body.accessRoleId]
        : [];
    const allowedSelfRoles = new Set(['role_stakeholder', 'role_pm', 'role_tm']);
    const normalized = roleIds
      .filter((roleId): roleId is string => typeof roleId === 'string')
      .map((roleId) => roleId.trim())
      .filter(Boolean);
    if (normalized.length !== 1 || !allowedSelfRoles.has(normalized[0])) return false;

    const currentRoleIds = await this.authService.getUserAccessRoleIds(request.user.userId);
    return currentRoleIds.length === 0;
  }
}
