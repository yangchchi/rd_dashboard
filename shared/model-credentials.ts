/** 与 .env ARK_MODEL 及内置 Skill 默认模型一致 */
export const DEFAULT_ARK_MODEL = 'deepseek-v3-2-251201';

/** 用户账号级模型配置（持久化于 rd_user_model_configs） */
export interface IUserModelConfig {
  provider: string;
  modelName: string;
  apiBaseUrl: string;
  apiKey: string;
  updatedAt?: string;
}

/** 前端个人设置写入、随 capability 请求传给服务端的模型凭据（不落库） */
export interface IUserModelOverride {
  provider?: string;
  apiBaseUrl?: string;
  apiKey?: string;
  modelName?: string;
}

export function userModelConfigToOverride(config: IUserModelConfig): IUserModelOverride {
  return {
    provider: config.provider,
    apiBaseUrl: config.apiBaseUrl,
    apiKey: config.apiKey,
    modelName: config.modelName,
  };
}

/** capability 流式/一元错误前缀，前端据此引导至个人设置 */
export const MODEL_CONFIG_REQUIRED = 'MODEL_CONFIG_REQUIRED';

export const MODEL_CONFIG_REQUIRED_MESSAGE = `${MODEL_CONFIG_REQUIRED}:未检测到可用的大模型配置。请在「个人设置」中填写 API 地址与 Key，或联系管理员配置系统 ARK_API_KEY。`;

export function isModelConfigRequiredMessage(message: string | undefined | null): boolean {
  return typeof message === 'string' && message.startsWith(MODEL_CONFIG_REQUIRED);
}

export function isValidUserModelOverride(override?: IUserModelOverride | null): boolean {
  if (!override) return false;
  const apiKey = typeof override.apiKey === 'string' ? override.apiKey.trim() : '';
  const apiBaseUrl = typeof override.apiBaseUrl === 'string' ? override.apiBaseUrl.trim() : '';
  return apiKey.length >= 8 && /^https?:\/\//i.test(apiBaseUrl);
}

/** 将个人设置中的 API 根地址规范为方舟 Responses 端点 */
export function normalizeArkResponsesEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return trimmed;
  if (/\/responses$/i.test(trimmed)) return trimmed;
  if (/\/v\d+$/i.test(trimmed)) return `${trimmed}/responses`;
  return trimmed;
}

export interface IResolvedArkCredentials {
  apiKey: string;
  /** 来自用户个人设置的 Responses 端点；系统兜底时不设置，由调用方读 skill/env 默认 */
  endpointFromUser?: string;
  /** 来自用户个人设置的模型名称；未设置时由调用方读 skill/env 默认 */
  modelFromUser?: string;
  source: 'user' | 'system';
}

export function resolveArkCredentials(
  modelOverride?: IUserModelOverride | null,
  env: { arkApiKey?: string } = {}
): IResolvedArkCredentials | null {
  if (isValidUserModelOverride(modelOverride)) {
    const modelName =
      typeof modelOverride!.modelName === 'string' ? modelOverride!.modelName.trim() : '';
    return {
      apiKey: modelOverride!.apiKey!.trim(),
      endpointFromUser: normalizeArkResponsesEndpoint(modelOverride!.apiBaseUrl!),
      modelFromUser: modelName || DEFAULT_ARK_MODEL,
      source: 'user',
    };
  }
  const envKey = typeof env.arkApiKey === 'string' ? env.arkApiKey.trim() : '';
  if (envKey) {
    return { apiKey: envKey, source: 'system' };
  }
  return null;
}
