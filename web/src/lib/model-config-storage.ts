const MODEL_CONFIG_STORAGE_KEY = '__rd_model_config';

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

export function getStoredModelConfig(): IStoredModelConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(MODEL_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<IStoredModelConfig>;
    const provider = parseProvider(parsed.provider);
    const apiBaseUrl = typeof parsed.apiBaseUrl === 'string' ? parsed.apiBaseUrl.trim() : '';
    const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '';
    if (!apiBaseUrl && !apiKey) return null;
    return { provider, apiBaseUrl, apiKey };
  } catch {
    return null;
  }
}

export function saveStoredModelConfig(config: IStoredModelConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      MODEL_CONFIG_STORAGE_KEY,
      JSON.stringify({
        provider: config.provider,
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
  const stored = getStoredModelConfig();
  if (stored) return stored;
  return {
    provider: 'volcengine',
    apiBaseUrl: getDefaultApiBaseUrl('volcengine'),
    apiKey: '',
  };
}
