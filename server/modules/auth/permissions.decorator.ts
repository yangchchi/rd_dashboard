import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS = 'requiredPermissions';

/** 满足其中任意一个权限即可（与 RequirePermissions 互斥使用于同一路由即可）。 */
export const REQUIRED_PERMISSIONS_ANY = 'requiredPermissionsAny';

export const RequirePermissions = (...permissionIds: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissionIds);

export const RequireAnyPermission = (...permissionIds: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_ANY, permissionIds);
