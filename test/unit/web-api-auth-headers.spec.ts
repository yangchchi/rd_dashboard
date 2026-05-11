describe('web API auth headers', () => {
  const originalFetch = global.fetch;
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: jest.fn((key: string) => store[key] ?? null),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn((key: string) => {
        delete store[key];
      }),
      clear: jest.fn(() => {
        store = {};
      }),
    };
  })();
  const sessionStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: jest.fn((key: string) => store[key] ?? null),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn((key: string) => {
        delete store[key];
      }),
      clear: jest.fn(() => {
        store = {};
      }),
    };
  })();
  let cookieStore = '';

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../web/src/lib/ai-skills', () => ({
      clearAiSkillCache: jest.fn(),
    }));
    localStorageMock.clear();
    sessionStorageMock.clear();
    cookieStore = '';
    Object.defineProperty(global, 'window', {
      value: {
        localStorage: localStorageMock,
        sessionStorage: sessionStorageMock,
        dispatchEvent: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      configurable: true,
    });
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      configurable: true,
    });
    Object.defineProperty(global, 'sessionStorage', {
      value: sessionStorageMock,
      configurable: true,
    });
    Object.defineProperty(global, 'document', {
      value: {
        get cookie() {
          return cookieStore;
        },
        set cookie(value: string) {
          const [pair] = value.split(';');
          const [key, rawValue = ''] = pair.split('=');
          const decodedKey = decodeURIComponent(key);
          if (value.includes('Max-Age=0')) {
            cookieStore = cookieStore
              .split(';')
              .map((item) => item.trim())
              .filter((item) => item && !item.startsWith(`${decodedKey}=`))
              .join('; ');
            return;
          }
          const nextPair = `${decodedKey}=${rawValue}`;
          const others = cookieStore
            .split(';')
            .map((item) => item.trim())
            .filter((item) => item && !item.startsWith(`${decodedKey}=`));
          cookieStore = [...others, nextPair].join('; ');
        },
      },
      configurable: true,
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '[]',
      json: async () => [],
    })) as jest.Mock;
    Object.defineProperty(global, 'CustomEvent', {
      value: class CustomEventPolyfill {
        type: string;

        constructor(type: string) {
          this.type = type;
        }
      },
      configurable: true,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rdApi sends bearer token for protected resource requests', async () => {
    const { saveAuthSession } = await import('../../web/src/lib/auth');
    const { rdApi } = await import('../../web/src/lib/rd-api');
    saveAuthSession('token-rd', {
      id: 'u1',
      username: 'pm',
      accessRoleIds: ['role_pm'],
      accessRoleId: 'role_pm',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await rdApi.listRequirements();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/rd/requirements',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-rd' }),
      })
    );
  });

  it('authApi keeps login public but sends token for admin APIs', async () => {
    const { saveAuthSession } = await import('../../web/src/lib/auth');
    const { authApi } = await import('../../web/src/lib/auth-api');
    saveAuthSession('token-admin', {
      id: 'admin',
      username: 'admin',
      accessRoleIds: ['role_admin'],
      accessRoleId: 'role_admin',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await authApi.listUsers();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/users',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-admin' }),
      })
    );
  });

  it('restores bearer token from cookie when localStorage is empty after refresh', async () => {
    const { saveAuthSession } = await import('../../web/src/lib/auth');
    saveAuthSession('token-cookie', {
      id: 'u-cookie',
      username: 'pm',
      accessRoleIds: ['role_pm'],
      accessRoleId: 'role_pm',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    localStorageMock.clear();
    sessionStorageMock.clear();

    const { rdApi } = await import('../../web/src/lib/rd-api');
    await rdApi.listRequirements();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/rd/requirements',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-cookie' }),
      })
    );
    expect(localStorageMock.setItem).toHaveBeenCalledWith('__rd_auth_token', 'token-cookie');
  });
});
