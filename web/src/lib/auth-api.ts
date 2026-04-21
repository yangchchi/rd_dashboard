import type { ILoginResponse, IUser } from './rd-types';
import type { AccessRoleRecord } from './access-policy-storage';

const BASE = '/api/auth';

type AuthAction = 'login' | 'register';

function extractErrorText(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : '';
}

function looksLikeUnauthorizedError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('401') || normalized.includes('unauthorized');
}

export function getAuthActionErrorMessage(error: unknown, action: AuthAction): string {
  const message = extractErrorText(error);

  if (action === 'login' && looksLikeUnauthorizedError(message)) {
    return '用户名或密码错误';
  }

  return action === 'login' ? '登录失败，请稍后重试' : '操作失败';
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const authApi = {
  login(username: string, password: string) {
    return json<ILoginResponse>('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  register(username: string, password: string) {
    return json<ILoginResponse>('/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  /** 飞书 OAuth：code + 与授权时一致的重定向 URI */
  feishuLogin(code: string, redirectUri: string) {
    return json<ILoginResponse>('/feishu/login', {
      method: 'POST',
      body: JSON.stringify({ code, redirect_uri: redirectUri }),
    });
  },

  listUsers() {
    return json<IUser[]>('/users');
  },

  createUser(
    username: string,
    password: string,
    profile?: {
      name?: string;
      email?: string;
      phone?: string;
      accessRoleId?: string | null;
      accessRoleIds?: string[];
    }
  ) {
    return json<IUser>('/users', {
      method: 'POST',
      body: JSON.stringify({
        username,
        password,
        name: profile?.name,
        email: profile?.email,
        phone: profile?.phone,
        accessRoleId: profile?.accessRoleId,
        accessRoleIds: profile?.accessRoleIds,
      }),
    });
  },

  updateUserAccessRoles(id: string, accessRoleIds: string[]) {
    return json<IUser>(`/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ accessRoleIds }),
    });
  },

  deleteUser(id: string) {
    return json<void>(`/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  listAccessRoles() {
    return json<AccessRoleRecord[]>('/access-roles');
  },

  upsertAccessRole(
    id: string,
    role: { name: string; description?: string; permissionIds: string[]; builtIn?: boolean }
  ) {
    return json<AccessRoleRecord>(`/access-roles/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(role),
    });
  },

  deleteAccessRole(id: string) {
    return json<void>(`/access-roles/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  resetAccessRoles() {
    return json<AccessRoleRecord[]>('/access-roles/reset', {
      method: 'POST',
    });
  },
};
