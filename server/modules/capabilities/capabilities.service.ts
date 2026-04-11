import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** 与 @lark-apaas/client-capability ErrorCodes.SUCCESS 一致 */
const SUCCESS = '0';

const DEFAULT_ARK_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/responses';
const DEFAULT_ARK_MODEL = 'deepseek-v3-2-251201';

export interface CapabilityUnaryResponse {
  status_code: string;
  data?: { output: unknown };
  error_msg?: string;
}

function getArkApiKeyFromEnv(): string | undefined {
  return (
    process.env.ARK_API_KEY ||
    process.env.VITE_ARK_API_KEY ||
    process.env.NEXT_PUBLIC_ARK_API_KEY
  );
}

function isReasoningPayload(data: Record<string, unknown>): boolean {
  const t = typeof data.type === 'string' ? data.type : '';
  if (/reasoning/i.test(t)) return true;
  const item = data.item as Record<string, unknown> | undefined;
  if (item && typeof item.type === 'string' && /reasoning/i.test(item.type)) return true;
  return false;
}

function extractArkStreamText(payload: unknown): string {
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

interface CapabilityFormValue {
  prompt?: string;
  requirement?: string;
  content?: string;
}

interface CapabilityFileShape {
  formValue?: CapabilityFormValue;
}

function applyInputTemplate(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{\{input\.(\w+)\}\}/g, (_, key: string) =>
    String(params[key] ?? '')
  );
}

function buildPromptFromCapabilityFile(
  capabilityId: string,
  action: string,
  params: unknown
): string | null {
  const path = join(process.cwd(), 'server/capabilities', `${capabilityId}.json`);
  if (!existsSync(path)) return null;
  let cfg: CapabilityFileShape;
  try {
    cfg = JSON.parse(readFileSync(path, 'utf8')) as CapabilityFileShape;
  } catch {
    return null;
  }
  const fv = cfg.formValue;
  if (!fv) return null;

  const p = (params ?? {}) as Record<string, unknown>;

  if ((action === 'textGenerate' || action === 'textToJson') && fv.prompt) {
    return applyInputTemplate(fv.prompt, p);
  }
  if (action === 'textSummary') {
    const req = fv.requirement ? applyInputTemplate(fv.requirement, p) : '';
    const cont = fv.content ? applyInputTemplate(fv.content, p) : '';
    const parts = [req, cont].filter((x) => x.trim().length > 0);
    return parts.length ? parts.join('\n\n') : null;
  }
  return null;
}

@Injectable()
export class CapabilitiesService {
  private readonly logger = new Logger(CapabilitiesService.name);

  invoke(capabilityId: string, action: string, params: unknown): CapabilityUnaryResponse {
    const p = (params ?? {}) as Record<string, unknown>;
    switch (action) {
      case 'aiCategorize':
        return {
          status_code: SUCCESS,
          data: {
            output: {
              categories: [this.mockCategory(p.requirement_text as string)],
            },
          },
        };
      case 'textToJson':
        return {
          status_code: SUCCESS,
          data: {
            output: this.mockConflictResult(p),
          },
        };
      default:
        return {
          status_code: SUCCESS,
          data: { output: {} },
        };
    }
  }

  async *stream(capabilityId: string, action: string, params: unknown): AsyncGenerator<string> {
    const apiKey = getArkApiKeyFromEnv();
    const useArk =
      apiKey &&
      (action === 'textGenerate' || action === 'textSummary' || action === 'textToJson');

    if (useArk) {
      const prompt = buildPromptFromCapabilityFile(capabilityId, action, params);
      if (prompt) {
        const deltaField: 'content' | 'summary' =
          action === 'textSummary' ? 'summary' : 'content';
        try {
          yield* this.streamArkSse(prompt, apiKey, deltaField);
          return;
        } catch (e) {
          this.logger.warn(
            `Ark 流式调用失败，回退演示输出: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
    }

    const chunks = this.mockStreamChunks(capabilityId, action, params);
    for (const text of chunks) {
      const line = {
        status_code: SUCCESS,
        data: {
          type: 'content' as const,
          delta: text,
          finished: false,
        },
      };
      yield `data: ${JSON.stringify(line)}\n\n`;
    }
    const end = {
      status_code: SUCCESS,
      data: {
        type: 'content' as const,
        delta: {},
        finished: true,
      },
    };
    yield `data: ${JSON.stringify(end)}\n\n`;
  }

  private async *streamArkSse(
    prompt: string,
    apiKey: string,
    deltaField: 'content' | 'summary'
  ): AsyncGenerator<string> {
    const model = process.env.ARK_MODEL || DEFAULT_ARK_MODEL;
    const endpoint = process.env.ARK_API_ENDPOINT || DEFAULT_ARK_ENDPOINT;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: true,
        tools: [],
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
      throw new Error(`HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
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
            const json = JSON.parse(data) as Record<string, unknown>;
            const piece = extractArkStreamText(json);
            if (!piece) continue;

            const delta =
              deltaField === 'content' ? { content: piece } : { summary: piece };
            const sse = {
              status_code: SUCCESS,
              data: {
                type: 'content' as const,
                delta,
                finished: false,
              },
            };
            yield `data: ${JSON.stringify(sse)}\n\n`;
          } catch {
            // 忽略非 JSON 行
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const end = {
      status_code: SUCCESS,
      data: {
        type: 'content' as const,
        delta: {},
        finished: true,
      },
    };
    yield `data: ${JSON.stringify(end)}\n\n`;
  }

  private mockCategory(text: string | undefined): string {
    const t = (text || '').toLowerCase();
    if (/p0|紧急|最高/.test(t)) return '功能需求-P0';
    if (/性能|架构|数据库|安全/.test(t)) return '技术需求-P2';
    if (/体验|交互|ui/.test(t)) return '体验需求-P2';
    return '功能需求-P2';
  }

  private mockConflictResult(p: Record<string, unknown>): { conflict_list: unknown[] } {
    const content = String(p.tech_spec_content || '');
    if (content.length < 20) {
      return { conflict_list: [] };
    }
    return {
      conflict_list: [
        {
          conflict_type: '兼容性提示（演示）',
          position: '自动检测',
          description: '当前为本地演示模式，未连接真实大模型。接入 OPENAI_API_KEY 或替换为自建推理服务后可输出完整分析。',
          suggestion: '在 server/modules/capabilities 中扩展 CapabilitiesService。',
        },
      ],
    };
  }

  private mockStreamChunks(
    capabilityId: string,
    action: string,
    params: unknown
  ): Array<Record<string, string>> {
    const p = (params ?? {}) as Record<string, unknown>;
    if (action === 'textGenerate') {
      const base =
        '【演示输出】未配置真实模型时返回占位文本。可在 CapabilitiesService 中接入 OpenAI 兼容接口。\n\n' +
        String(p.original_requirement || p.requirement_text || '').slice(0, 500);
      return this.splitToDeltas(base, 'content');
    }
    if (action === 'textSummary') {
      const msg =
        '【演示】代码审查摘要：建议检查异常处理与输入校验；以下为占位内容。\n' +
        String((p.code_content as string) || (p.acceptance_feedback as string) || '').slice(0, 800);
      return this.splitToDeltas(msg, 'summary');
    }
    if (action === 'textToJson') {
      const msg =
        '【演示】冲突检测：建议在 CapabilitiesService 中接入真实推理。输入长度 ' +
        String(p.tech_spec_content || '').length;
      return this.splitToDeltas(msg, 'content');
    }
    return [{ content: `[demo] ${capabilityId}/${action}` }];
  }

  private splitToDeltas(
    text: string,
    field: 'content' | 'summary'
  ): Array<Record<string, string>> {
    const out: Array<Record<string, string>> = [];
    const step = 40;
    for (let i = 0; i < text.length; i += step) {
      const slice = text.slice(i, i + step);
      out.push(field === 'summary' ? { summary: slice } : { content: slice });
    }
    if (out.length === 0) {
      out.push(field === 'summary' ? { summary: ' ' } : { content: ' ' });
    }
    return out;
  }
}
