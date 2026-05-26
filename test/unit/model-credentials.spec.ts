import {
  DEFAULT_ARK_MODEL,
  isValidUserModelOverride,
  MODEL_CONFIG_REQUIRED,
  normalizeArkResponsesEndpoint,
  resolveArkCredentials,
} from '../../shared/model-credentials';

describe('shared model-credentials', () => {
  it('normalizes volcengine base url to responses endpoint', () => {
    expect(normalizeArkResponsesEndpoint('https://ark.cn-beijing.volces.com/api/v3/')).toBe(
      'https://ark.cn-beijing.volces.com/api/v3/responses'
    );
    expect(normalizeArkResponsesEndpoint('https://ark.example.test/api/v3/responses')).toBe(
      'https://ark.example.test/api/v3/responses'
    );
  });

  it('prefers valid user override over system env key', () => {
    const resolved = resolveArkCredentials(
      {
        provider: 'volcengine',
        apiBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        apiKey: 'user-key-12345678',
        modelName: 'my-custom-model',
      },
      { arkApiKey: 'system-key' }
    );
    expect(resolved?.source).toBe('user');
    expect(resolved?.apiKey).toBe('user-key-12345678');
    expect(resolved?.endpointFromUser).toBe('https://ark.cn-beijing.volces.com/api/v3/responses');
    expect(resolved?.modelFromUser).toBe('my-custom-model');
  });

  it('defaults user model name when override omits modelName', () => {
    const resolved = resolveArkCredentials(
      {
        apiBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        apiKey: 'user-key-12345678',
      },
      {}
    );
    expect(resolved?.modelFromUser).toBe(DEFAULT_ARK_MODEL);
  });

  it('falls back to system env when user override is incomplete', () => {
    const resolved = resolveArkCredentials(
      { apiBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3', apiKey: '' },
      { arkApiKey: 'system-key' }
    );
    expect(resolved?.source).toBe('system');
    expect(resolved?.apiKey).toBe('system-key');
    expect(resolved?.endpointFromUser).toBeUndefined();
  });

  it('returns null when neither user nor system credentials exist', () => {
    expect(resolveArkCredentials(undefined, {})).toBeNull();
    expect(isValidUserModelOverride({ apiKey: 'short', apiBaseUrl: 'http://x' })).toBe(false);
  });

  it('exposes model config required prefix for clients', () => {
    expect(MODEL_CONFIG_REQUIRED).toBe('MODEL_CONFIG_REQUIRED');
  });
});
