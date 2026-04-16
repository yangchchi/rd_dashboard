import { getAuthActionErrorMessage } from '../../web/src/lib/auth-api';

describe('getAuthActionErrorMessage', () => {
  it('returns generic login error for unauthorized backend payload', () => {
    const error = new Error(
      '{"error":{"code":"UNAUTHORIZED","message":"用户名或密码错误","details":"{\\"message\\":\\"用户名或密码错误\\",\\"error\\":\\"Unauthorized\\",\\"statusCode\\":401}","timestamp":1776332977267}}'
    );

    expect(getAuthActionErrorMessage(error, 'login')).toBe('用户名或密码错误');
  });

  it('falls back to generic failure message for unknown login errors', () => {
    const error = new Error('request failed');

    expect(getAuthActionErrorMessage(error, 'login')).toBe('登录失败，请稍后重试');
  });
});
