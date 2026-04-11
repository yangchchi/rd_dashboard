import {
  hashPassword,
  verifyPassword,
  signAuthToken,
  verifyAuthToken,
} from './auth.utils';

describe('auth utils', () => {
  it('hash and verify password', () => {
    const hashed = hashPassword('123456');
    expect(typeof hashed).toBe('string');
    expect(hashed).not.toBe('123456');
    expect(verifyPassword('123456', hashed)).toBe(true);
    expect(verifyPassword('bad-password', hashed)).toBe(false);
  });

  it('sign and verify token payload', () => {
    const token = signAuthToken(
      { userId: 'u1', username: 'admin' },
      {
        secret: 'unit-test-secret',
        expiresInSec: 3600,
      }
    );
    const payload = verifyAuthToken(token, 'unit-test-secret');
    expect(payload.userId).toBe('u1');
    expect(payload.username).toBe('admin');
  });

  it('reject expired token', () => {
    const token = signAuthToken(
      { userId: 'u1', username: 'admin' },
      {
        secret: 'unit-test-secret',
        expiresInSec: -1,
      }
    );
    expect(() => verifyAuthToken(token, 'unit-test-secret')).toThrow();
  });
});
