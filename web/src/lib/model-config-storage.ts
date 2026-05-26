import { DEFAULT_ARK_MODEL } from '@shared/model-credentials';

const MODEL_CONFIG_STORAGE_KEY = '__rd_model_config';

export { DEFAULT_ARK_MODEL };

export type ModelProviderId =
  | 'volcengine'
  | 'openai'
  | 'azure_openai'
  | 'anthropic'
  | 'deepseek'
  | 'moonshot'
  | 'zhipu'
  | 'qwen'
  | 'custom';

export interface IStoredModelConfig {
  provider: ModelProviderId;
  /** 推理模型 ID / 部署名，与 ARK_MODEL 一致 */
  modelName: string;
  apiBaseUrl: string;
  apiKey: string;
}

export const MODEL_PROVIDER_OPTIONS: {
  id: ModelProviderId;
  label: string;
  defaultBaseUrl?: string;
}[] = [
  {
    id: 'volcengine',
    label: '火山引擎 Volcengine（方舟 Ark）',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  },
  { id: 'openai', label: 'OpenAI', defaultBaseUrl: 'https://api.openai.com/v1' },
  {
    id: 'azure_openai',
    label: 'Azure OpenAI',
    defaultBaseUrl: 'https://{resource}.openai.azure.com/openai/deployments/{deployment}',
  },
  { id: 'anthropic', label: 'Anthropic', defaultBaseUrl: 'https://api.anthropic.com/v1' },
  { id: 'deepseek', label: 'DeepSeek', defaultBaseUrl: 'https://api.deepseek.com/v1' },
  { id: 'moonshot', label: 'Moonshot（月之暗面）', defaultBaseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'zhipu', label: '智谱 AI', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'qwen', label: '通义千问（阿里云）', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'custom', label: '自定义 / 其他兼容端点' },
];

const VALID_PROVIDER_IDS = new Set<ModelProviderId>(MODEL_PROVIDER_OPTIONS.map((o) => o.id));

export function getModelProviderOption(id: ModelProviderId) {
  return MODEL_PROVIDER_OPTIONS.find((o) => o.id === id);
}

export function getDefaultApiBaseUrl(provider: ModelProviderId): string {
  return getModelProviderOption(provider)?.defaultBaseUrl ?? '';
}

function parseProvider(value: unknown): ModelProviderId {
  if (typeof value === 'string' && VALID_PROVIDER_IDS.has(value as ModelProviderId)) {
    return value as ModelProviderId;
  }
  return 'volcengine';
}

/** @deprecated 仅用于迁移历史本机 localStorage 配置 */
export function getStoredModelConfig(): IStoredModelConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(MODEL_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<IStoredModelConfig>;
    const provider = parseProvider(parsed.provider);
    const apiBaseUrl = typeof parsed.apiBaseUrl === 'string' ? parsed.apiBaseUrl.trim() : '';
    const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '';
    const modelName =
      typeof parsed.modelName === 'string' && parsed.modelName.trim()
        ? parsed.modelName.trim()
        : DEFAULT_ARK_MODEL;
    if (!apiBaseUrl && !apiKey) return null;
    return { provider, modelName, apiBaseUrl, apiKey };
  } catch {
    return null;
  }
}

/** @deprecated 迁移完成后不再写入 localStorage */
export function saveStoredModelConfig(config: IStoredModelConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      MODEL_CONFIG_STORAGE_KEY,
      JSON.stringify({
        provider: config.provider,
        modelName: config.modelName.trim() || DEFAULT_ARK_MODEL,
        apiBaseUrl: config.apiBaseUrl.trim(),
        apiKey: config.apiKey.trim(),
      }),
    );
  } catch {
    // ignore quota / private mode
  }
}

export function clearStoredModelConfig(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(MODEL_CONFIG_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function defaultModelConfigFormFields(): IStoredModelConfig {
  return {
    provider: 'volcengine',
    modelName: DEFAULT_ARK_MODEL,
    apiBaseUrl: getDefaultApiBaseUrl('volcengine'),
    apiKey: '',
  };
}

function mapRemoteToStored(remote: {
  provider: string;
  modelName: string;
  apiBaseUrl: string;
  apiKey: string;
}): IStoredModelConfig {
  return {
    provider: parseProvider(remote.provider),
    modelName: remote.modelName?.trim() || DEFAULT_ARK_MODEL,
    apiBaseUrl: remote.apiBaseUrl?.trim() ?? '',
    apiKey: remote.apiKey?.trim() ?? '',
  };
}

/** 从服务端读取当前用户的模型配置 */
export async function fetchRemoteModelConfig(): Promise<IStoredModelConfig | null> {
  const { authApi } = await import('./auth-api');
  const remote = await authApi.getMyModelConfig();
  if (!remote?.apiBaseUrl?.trim() || !remote.apiKey?.trim()) return null;
  return mapRemoteToStored(remote);
}

/** 保存到服务端账号，并清除历史 localStorage 副本 */
export async function persistRemoteModelConfig(config: IStoredModelConfig): Promise<void> {
  const { authApi } = await import('./auth-api');
  await authApi.saveMyModelConfig({
    provider: config.provider,
    modelName: config.modelName.trim() || DEFAULT_ARK_MODEL,
    apiBaseUrl: config.apiBaseUrl.trim(),
    apiKey: config.apiKey.trim(),
  });
  clearStoredModelConfig();
}

/** 删除服务端配置并清除 localStorage */
export async function removeRemoteModelConfig(): Promise<void> {
  const { authApi } = await import('./auth-api');
  await authApi.deleteMyModelConfig();
  clearStoredModelConfig();
}

/**
 * 优先读服务端；若无则尝试将旧版本 localStorage 配置迁移入库。
 */
export async function loadModelConfigWithMigration(): Promise<IStoredModelConfig> {
  const remote = await fetchRemoteModelConfig();
  if (remote) return remote;

  const legacy = getStoredModelConfig();
  if (legacy?.apiKey && legacy.apiBaseUrl) {
    try {
      await persistRemoteModelConfig(legacy);
      return legacy;
    } catch {
      return legacy;
    }
  }

  return defaultModelConfigFormFields();
}
