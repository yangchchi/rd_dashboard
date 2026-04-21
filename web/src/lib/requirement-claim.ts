import type { IRequirement } from './rd-types';

/** 与 access-policy-storage 内置「产品经理」角色 id 一致 */
export const ACCESS_ROLE_PM = 'role_pm';
/** 与 access-policy-storage 内置「技术经理」角色 id 一致 */
export const ACCESS_ROLE_TM = 'role_tm';

function userHasBuiltinRole(
  roleId: string,
  accessRoleIds: string[] | null | undefined,
  accessRoleId: string | null | undefined,
): boolean {
  if (Array.isArray(accessRoleIds) && accessRoleIds.length > 0) {
    return accessRoleIds.includes(roleId);
  }
  return accessRoleId === roleId;
}

/** 下拉筛选 PM/TM 候选人等场景 */
export function userHasBuiltinAccessRole(
  roleId: string,
  accessRoleIds: string[] | null | undefined,
  accessRoleId: string | null | undefined,
): boolean {
  return userHasBuiltinRole(roleId, accessRoleIds, accessRoleId);
}

export function mayClaimPmSlot(
  req: IRequirement | undefined,
  userId: string | undefined,
  accessRoleId: string | null | undefined,
  accessRoleIds?: string[] | null,
): boolean {
  if (!userId || !req) return false;
  const designated = req.pmCandidateUserId?.trim();
  if (designated) return userId === designated;
  return userHasBuiltinRole(ACCESS_ROLE_PM, accessRoleIds, accessRoleId);
}

export function mayClaimTmSlot(
  req: IRequirement | undefined,
  userId: string | undefined,
  accessRoleId: string | null | undefined,
  accessRoleIds?: string[] | null,
): boolean {
  if (!userId || !req) return false;
  const designated = req.tmCandidateUserId?.trim();
  if (designated) return userId === designated;
  return userHasBuiltinRole(ACCESS_ROLE_TM, accessRoleIds, accessRoleId);
}
