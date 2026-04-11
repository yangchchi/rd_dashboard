import type { ILoginResponse, IUser } from './rd-types';

const BASE = '/api/auth';

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

  listUsers() {
    return json<IUser[]>('/users');
  },

  createUser(
    username: string,
    password: string,
    profile?: { name?: string; email?: string; phone?: string }
  ) {
    return json<IUser>('/users', {
      method: 'POST',
      body: JSON.stringify({
        username,
        password,
        name: profile?.name,
        email: profile?.email,
        phone: profile?.phone,
      }),
    });
  },

  deleteUser(id: string) {
    return json<void>(`/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};
