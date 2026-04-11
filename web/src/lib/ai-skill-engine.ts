export type ArkTool =
  | {
      type: 'web_search';
      max_keyword?: number;
    }
  | Record<string, unknown>;

export interface IAiSkillConfig {
  id: string;
  name: string;
  /** 能力说明，用于插件配置页展示 */
  description?: string;
  provider: 'ark';
  endpoint?: string;
  model: string;
  stream?: boolean;
  tools?: ArkTool[];
  promptTemplate: string;
}

export interface IAiSkillRunParams {
  variables: Record<string, string>;
  onChunk: (chunk: string) => void;
  /**
   * 为 true（默认）时：忽略推理类流式事件，并剥离模型输出的思考标签，仅向 onChunk 推送正文。
   */
  sanitizeOutput?: boolean;
}

const DEFAULT_ARK_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/responses';

const THINK_OPEN = '\u003cthink\u003e';
const THINK_CLOSE = '\u003c/think\u003e';
const RR_OPEN = '\u003credacted_reasoning\u003e';
const RR_CLOSE = '\u003c/redacted_reasoning\u003e';

function fillPrompt(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? '');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const RT_OPEN = '\u003credacted_thinking\u003e';
const RT_CLOSE = '\u003c/redacted_thinking\u003e';

const THINK_PAIR = new RegExp(`${escapeRegExp(THINK_OPEN)}[\\s\\S]*?${escapeRegExp(THINK_CLOSE)}`, 'gi');
const REDACTED_PAIR = new RegExp(`${escapeRegExp(RR_OPEN)}[\\s\\S]*?${escapeRegExp(RR_CLOSE)}`, 'gi');
const REDACTED_THINKING_PAIR = new RegExp(`${escapeRegExp(RT_OPEN)}[\\s\\S]*?${escapeRegExp(RT_CLOSE)}`, 'gi');

/** 去掉常见「思考 / 推理」片段，避免展示与入库 */
export function stripThinkingArtifacts(text: string): string {
  let s = text;
  for (let i = 0; i < 8; i++) {
    const before = s;
    s = s.replace(THINK_PAIR, '');
    s = s.replace(REDACTED_PAIR, '');
    s = s.replace(REDACTED_THINKING_PAIR, '');
    if (s === before) break;
  }
  const t0 = s.indexOf(THINK_OPEN);
  if (t0 !== -1 && s.indexOf(THINK_CLOSE, t0 + THINK_OPEN.length) === -1) {
    s = s.slice(0, t0);
  }
  const r0 = s.indexOf(RR_OPEN);
  if (r0 !== -1 && s.indexOf(RR_CLOSE, r0 + RR_OPEN.length) === -1) {
    s = s.slice(0, r0);
  }
  const rt0 = s.indexOf(RT_OPEN);
  if (rt0 !== -1 && s.indexOf(RT_CLOSE, rt0 + RT_OPEN.length) === -1) {
    s = s.slice(0, rt0);
  }
  return s;
}

function isReasoningPayload(data: Record<string, unknown>): boolean {
  const t = typeof data.type === 'string' ? data.type : '';
  if (/reasoning/i.test(t)) return true;
  const item = data.item as Record<string, unknown> | undefined;
  if (item && typeof item.type === 'string' && /reasoning/i.test(item.type)) return true;
  return false;
}

function extractChunkText(payload: unknown): string {
  const data = payload as Record<string, unknown>;
  if (isReasoningPayload(data)) return '';

  if (Array.isArray(data.choices)) {
    const choice = data.choices[0] as Record<string, unknown> | undefined;
    const delta = choice?.delta as Record<string, unknown> | undefined;
    if (delta) {
      const c = typeof delta.content === 'string' ? delta.content : '';
      if (c.length > 0) return c;
      if (delta.reasoning_content != null && String(delta.reasoning_content).length > 0) {
        return '';
      }
    }
  }

  const delta = data.delta;
  if (typeof delta === 'string') return delta;
  if (delta && typeof delta === 'object') {
    const d = delta as Record<string, unknown>;
    if (typeof d.content === 'string') return d.content;
  }

  if (typeof data.output_text === 'string') return data.output_text;

  const output = data.output;
  if (Array.isArray(output)) {
    return output
      .flatMap((item) => {
        const o = item as { content?: Array<{ type?: string; text?: string }> };
        return (o.content || []).filter((c) => !c.type || !/reasoning/i.test(String(c.type)));
      })
      .map((item) => item.text || '')
      .join('');
  }
  return '';
}

function getArkApiKey(): string | undefined {
  // Next.js 客户端仅内联 NEXT_PUBLIC_*；Vite 风格 VITE_* 在浏览器 bundle 中通常不存在
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_ARK_API_KEY) {
    return process.env.NEXT_PUBLIC_ARK_API_KEY;
  }
  if (typeof import.meta !== 'undefined' && import.meta.env && 'VITE_ARK_API_KEY' in import.meta.env) {
    return (import.meta.env as { VITE_ARK_API_KEY?: string }).VITE_ARK_API_KEY;
  }
  return undefined;
}

export async function runAiSkillStream(skill: IAiSkillConfig, params: IAiSkillRunParams): Promise<string> {
  const apiKey = getArkApiKey();
  if (!apiKey) {
    throw new Error('未配置 Ark API Key：请在环境变量中设置 NEXT_PUBLIC_ARK_API_KEY（Next.js）或 VITE_ARK_API_KEY（Vite）');
  }

  if (skill.provider !== 'ark') {
    throw new Error(`暂不支持的 provider: ${skill.provider}`);
  }

  const sanitize = params.sanitizeOutput !== false;
  let rawAccum = '';
  let lastSanitized = '';

  const prompt = fillPrompt(skill.promptTemplate, params.variables);
  const response = await fetch(skill.endpoint || DEFAULT_ARK_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: skill.model,
      stream: skill.stream ?? true,
      tools: skill.tools || [],
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: prompt,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`AI调用失败: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const json = JSON.parse(data);
        const chunk = extractChunkText(json);
        if (chunk) {
          rawAccum += chunk;
          if (sanitize) {
            const cleaned = stripThinkingArtifacts(rawAccum);
            if (cleaned.length > lastSanitized.length) {
              params.onChunk(cleaned.slice(lastSanitized.length));
              lastSanitized = cleaned;
            }
          } else {
            params.onChunk(chunk);
          }
        }
      } catch {
        // ignore keep-alive / non-json lines
      }
    }
  }

  return sanitize ? stripThinkingArtifacts(rawAccum) : rawAccum;
}
