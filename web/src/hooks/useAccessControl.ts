'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ACCESS_PERMISSION_IDS,
  requiredRoutePermission,
  isAuthOnlyPath,
} from '@/lib/access-catalog';
import {
  ACCESS_POLICY_UPDATED_EVENT,
  getAccessRoleById,
  readAccessRoles,
} from '@/lib/access-policy-storage';
import { getCurrentUser, onStoredUserUpdated } from '@/lib/auth';

function superUserAllPermissions(): Set<string> {
  return new Set(ACCESS_PERMISSION_IDS);
}

function builtInPermissionSetByRoleId(roleId: string): Set<string> | null {
  if (roleId === 'role_admin') return superUserAllPermissions();
  if (roleId === 'role_stakeholder') {
    return new Set([
      'page.dashboard',
      'page.requirements',
      'page.pipeline',
      'page.acceptance',
      'page.products',
    ]);
  }
  if (roleId === 'role_pm') {
    return new Set([
      'page.dashboard',
      'page.requirements',
      'page.prd',
      'page.pipeline',
      'page.acceptance',
      'page.products',
      'page.org_spec',
    ]);
  }
  if (roleId === 'role_tm') {
    return new Set([
      'page.dashboard',
      'page.requirements',
      'page.prd',
      'page.spec',
      'page.pipeline',
      'page.acceptance',
      'page.products',
      'page.org_spec',
      'page.plugins',
    ]);
  }
  return null;
}

function mapLegacyRoleToAccessRoleId(role: string | null | undefined): string | null {
  const v = role?.trim().toLowerCase();
  if (!v) return null;
  if (v === 'role_admin' || v === 'admin') return 'role_admin';
  if (v === 'role_pm' || v === 'pm' || v === '产品经理') return 'role_pm';
  if (v === 'role_tm' || v === 'tm' || v === '技术经理') return 'role_tm';
  if (v === 'role_stakeholder' || v === 'stakeholder' || v === '干系人') return 'role_stakeholder';
  return null;
}

function getNormalizedAccessRoleId(raw: string | null | undefined): string | null {
  const normalized = mapLegacyRoleToAccessRoleId(raw);
  if (normalized) return normalized;
  return raw?.trim() || null;
}

export function getEffectivePermissionSet(): Set<string> {
  const user = getCurrentUser();
  if (!user) return new Set();
  if (user.username === 'admin') {
    return superUserAllPermissions();
  }
  readAccessRoles();
  let roleId = getNormalizedAccessRoleId(user.accessRoleId);
  if (!roleId && typeof window !== 'undefined') {
    try {
      roleId = getNormalizedAccessRoleId(sessionStorage.getItem('__global_rd_userRole'));
    } catch {
      roleId = null;
    }
  }
  if (!roleId) {
    return new Set(['page.dashboard']);
  }
  const role = getAccessRoleById(roleId);
  if (role) return new Set(role.permissionIds);
  return builtInPermissionSetByRoleId(roleId) ?? new Set(['page.dashboard']);
}

export function canAccessPath(pathname: string): boolean {
  if (isAuthOnlyPath(pathname)) return true;
  const need = requiredRoutePermission(pathname);
  if (need === null) {
    return true;
  }
  return getEffectivePermissionSet().has(need);
}

export function useAccessControl() {
  const [version, setVersion] = useState(0);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const onPolicy = () => bump();
    const onStorage = (e: StorageEvent) => {
      if (e.key === '__rd_access_roles_v1') bump();
    };
    window.addEventListener(ACCESS_POLICY_UPDATED_EVENT, onPolicy);
    window.addEventListener('storage', onStorage);
    const offUser = onStoredUserUpdated(bump);
    return () => {
      window.removeEventListener(ACCESS_POLICY_UPDATED_EVENT, onPolicy);
      window.removeEventListener('storage', onStorage);
      offUser();
    };
  }, [bump]);

  const permissions = useMemo(() => {
    void version;
    return getEffectivePermissionSet();
  }, [version]);

  const can = useCallback((permissionId: string) => permissions.has(permissionId), [permissions]);

  return { can, permissions, reload: bump, roles: useMemo(() => readAccessRoles(), [version]) };
}
