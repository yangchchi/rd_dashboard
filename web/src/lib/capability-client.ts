/**
 * 兼容 @lark-apaas/client-capability 协议，请求本仓库 Nest：`/api/capability/:id` 与 `/stream`。
 * baseURL 使用相对路径，便于 Next 通过 rewrites 代理到后端。
 */
const SUCCESS = '0';

class CapabilityError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = 'CapabilityError';
  }
}

function createExecutor(
  baseURL: string,
  capabilityId: string,
  fetchOptions?: RequestInit
) {
  return {
    call: async <T>(action: string, params: unknown): Promise<T> => {
      const url = `${baseURL}/api/capability/${capabilityId}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(fetchOptions?.headers ?? {}),
        },
        body: JSON.stringify({ action, params }),
        credentials: 'include',
        ...fetchOptions,
      });
      const data = (await response.json()) as {
        status_code?: string;
        data?: { output?: T };
        error_msg?: string;
      };
      if (!response.ok || data.status_code !== SUCCESS) {
        throw new CapabilityError(data.error_msg || 'Capability call failed');
      }
      return data.data?.output as T;
    },
    callStream: async function* <T>(action: string, params: unknown): AsyncIterable<T> {
      const url = `${baseURL}/api/capability/${capabilityId}/stream`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(fetchOptions?.headers ?? {}),
        },
        body: JSON.stringify({ action, params }),
        credentials: 'include',
        ...fetchOptions,
      });
      if (!response.ok || !response.body) {
        throw new CapabilityError(`Stream HTTP ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6);
            let parsed: {
              status_code?: string;
              data?: { type?: string; delta?: T; finished?: boolean };
            };
            try {
              parsed = JSON.parse(raw);
            } catch {
              continue;
            }
            if (parsed.status_code !== SUCCESS || !parsed.data) continue;
            if (parsed.data.type === 'content' && parsed.data.delta !== undefined) {
              yield parsed.data.delta as T;
              if (parsed.data.finished) return;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}

export const capabilityClient = {
  load(capabilityId: string) {
    const base =
      typeof window !== 'undefined'
        ? ''
        : process.env.NEXT_PUBLIC_APP_ORIGIN || process.env.INTERNAL_API_ORIGIN || '';
    return createExecutor(base, capabilityId);
  },
};
