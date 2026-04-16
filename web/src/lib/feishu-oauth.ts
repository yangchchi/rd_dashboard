/**
 * 飞书网页应用 OAuth（授权码模式）
 * @see https://open.feishu.cn/document/sso/web-application-sso/login-overview
 */

export const FEISHU_OAUTH_AUTHORIZE_URL =
  'https://accounts.feishu.cn/open-apis/authen/v1/authorize';

export const FEISHU_OAUTH_STATE_KEY = 'feishu_oauth_state';

/** 需在飞书开放平台「权限管理」中申请；获取 user_info 基础字段通常需含用户身份读权限 */
export const FEISHU_OAUTH_DEFAULT_SCOPE = 'auth:user.id:read';

export function getFeishuRedirectUri(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/login/feishu-callback`;
}

export function buildFeishuAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const u = new URL(FEISHU_OAUTH_AUTHORIZE_URL);
  u.searchParams.set('client_id', params.clientId);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('redirect_uri', params.redirectUri);
  u.searchParams.set('state', params.state);
  u.searchParams.set('scope', params.scope ?? FEISHU_OAUTH_DEFAULT_SCOPE);
  return u.toString();
}
