import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS = 'requiredPermissions';

export const RequirePermissions = (...permissionIds: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissionIds);
