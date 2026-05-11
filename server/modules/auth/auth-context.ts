import type { IAuthTokenPayload } from './auth.utils';

export interface IAuthenticatedUser extends IAuthTokenPayload {
  permissionIds: string[];
  accessRoleIds: string[];
}
