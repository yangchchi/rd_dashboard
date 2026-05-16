import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { DEFAULT_AI_SKILLS, PRD_GENERATION_SKILL_ID } from '../../../shared/ai-skill-defaults';
import { RdService } from '../rd/rd.service';

/** 与 @lark-apaas/client-capability ErrorCodes.SUCCESS 一致 */
const SUCCESS = '0';
const ERROR = '1';
const AI_PROVIDER_UNAVAILABLE =
  'AI 模型服务未配置或调用失败。生产环境不会返回演示输出，请配置 ARK_API_KEY 或显式开启 AI_DEMO_MODE=true。';

const DEFAULT_ARK_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/responses';
const DEFAULT_ARK_MODEL = 'deepseek-v3-2-251201';

interface AiSkillConfig {
  endpoint?: string | null;
  model?: string | null;
  promptTemplate: string;
  tools?: unknown[];
}

export interface CapabilityUnaryResponse {
  status_code: string;
  data?: { output: unknown };
  error_msg?: string;
}

function getArkApiKeyFromEnv(): string | undefined {
  return process.env.ARK_API_KEY;
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

function applySkillTemplate(template: string, params: Record<string, unknown>): string {
  /** 兼容从插件 JSON 复制的 {{input.xxx}} 与 Skill 表的 {{xxx}} 两种占位 */
  const merged = applyInputTemplate(template, params);
  return merged.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(params[key] ?? ''));
}

/**
 * 管理后台里 PRD Skill 常写成 {{title}}、{{description}}，而前端/插件实际传 original_requirement 等。
 * 若不补齐，占位符会变成空串，模型几乎看不到本条需求。此处从 original_requirement 解析并写入别名键。
 * 同时解析「所属产品」「产品简介」等行，供 {{product_name}} / {{product_intro}} 等简写占位符使用。
 */
function mergePrdGeneratorStreamParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...params };
  const orig = String(out.original_requirement ?? '').trim();

  const titleExisting = String(out.title ?? out.requirement_title ?? '').trim();
  const descExisting = String(out.description ?? out.requirement_description ?? '').trim();

  let title = titleExisting;
  let description = descExisting;

  if (!title && orig) {
    const m = orig.match(/^需求标题：\s*(.+)$/m);
    title = m ? m[1].trim() : (orig.split('\n')[0]?.trim() ?? '');
  }
  if (!description && orig) {
    const m = orig.match(/^需求描述：\s*([\s\S]+?)(?=^期望上线时间：)/m);
    if (m) {
      description = m[1].trim();
    } else {
      const rest = orig.replace(/^需求标题：[^\n]*\n?/m, '').trim();
      description = rest || orig;
    }
  }

  if (title) {
    out.title = title;
    out.requirement_title = title;
  }
  if (description) {
    out.description = description;
    out.requirement_description = description;
  }

  const mProduct = orig.match(/^所属产品：\s*(.+)$/m);
  if (mProduct) {
    const pn = mProduct[1].trim();
    out.product_name = pn;
    out.product = pn;
    out.current_product = pn;
  }

  const mIntro = orig.match(/^产品简介（语境对齐，节选）：\s*\n([\s\S]+?)(?=^需求标题：)/m);
  if (mIntro) {
    const intro = mIntro[1].trim();
    out.product_intro = intro;
    out.product_context = intro;
    out.product_description = intro;
  }

  const mExp = orig.match(/^期望上线时间：\s*(.+)$/m);
  if (mExp) {
    const ed = mExp[1].trim();
    out.expected_date = ed;
    out.expectedDate = ed;
  }
  const mPri = orig.match(/^业务优先级：\s*(.+)$/m);
  if (mPri) {
    const pr = mPri[1].trim();
    out.priority = pr;
    out.business_priority = pr;
  }

  out.requirement_body = orig;

  if (out.related_prd == null && out.related_prd_document != null) {
    out.related_prd = out.related_prd_document;
  }
  if (out.supplementary == null && out.user_supplementary_document != null) {
    out.supplementary = out.user_supplementary_document;
  }
  if (out.additional == null && out.additional_requirements != null) {
    out.additional = out.additional_requirements;
    out.extra_requirements = out.additional_requirements;
  }

  return out;
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

  constructor(private readonly rdService: RdService) {}

  invoke(capabilityId: string, action: string, params: unknown): CapabilityUnaryResponse {
    const p = (params ?? {}) as Record<string, unknown>;
    if (!this.canUseDemoOutput()) {
      return this.unavailableUnaryResponse();
    }
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
      const { skill, resolvedSkillId, skillSource } = await this.resolveSkillConfig(capabilityId);
      const rawParams = (params ?? {}) as Record<string, unknown>;
      const templateParams =
        /^prd_generator/.test(capabilityId) && action === 'textGenerate'
          ? mergePrdGeneratorStreamParams(rawParams)
          : rawParams;
      const prompt =
        skill && (action === 'textGenerate' || action === 'textSummary')
          ? applySkillTemplate(skill.promptTemplate, templateParams)
          : buildPromptFromCapabilityFile(capabilityId, action, params);
      if (prompt) {
        if (/^prd_generator/.test(capabilityId) && action === 'textGenerate') {
          this.logger.log(
            `prd_generator 流式：skillId=${resolvedSkillId ?? '—'}，来源=${skillSource}，提示词约 ${prompt.length} 字`
          );
        }
        const deltaField: 'content' | 'summary' =
          action === 'textSummary' ? 'summary' : 'content';
        try {
          yield* this.streamArkSse(prompt, apiKey, deltaField, skill, capabilityId);
          return;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          if (!this.canUseDemoOutput()) {
            this.logger.error(`Ark 流式调用失败，生产环境禁止回退演示输出: ${message}`);
            yield this.unavailableStreamEvent();
            return;
          }
          this.logger.warn(`Ark 流式调用失败，回退演示输出: ${message}`);
        }
      }
    }

    if (!this.canUseDemoOutput()) {
      yield this.unavailableStreamEvent();
      return;
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
    deltaField: 'content' | 'summary',
    skill?: AiSkillConfig | null,
    capabilityId?: string
  ): AsyncGenerator<string> {
    const model = skill?.model || process.env.ARK_MODEL || DEFAULT_ARK_MODEL;
    const endpoint = skill?.endpoint || process.env.ARK_API_ENDPOINT || DEFAULT_ARK_ENDPOINT;
    let tools = Array.isArray(skill?.tools) ? [...skill.tools] : [];
    /** PRD 插件仅消费请求内材料；禁用 tools（如 web_search），避免模型先输出「将搜索…」类前言污染流式正文 */
    if (capabilityId && /^prd_generator/.test(capabilityId)) {
      tools = [];
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: true,
        tools,
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

  /** capability 文件 id 常为 `foo_1`，插件配置 / 种子表 id 常为 `foo`，双向尝试以命中 rd_ai_skill_configs 与 DEFAULT_AI_SKILLS */
  private capabilitySkillIdVariants(capabilityId: string): string[] {
    // PRD 插件：始终优先 prd_auto_generation（与种子表、DEFAULT_AI_SKILLS 主键一致），避免误插入的 prd_generator_1 行抢先命中
    if (/^prd_generator/.test(capabilityId)) {
      const rest = [capabilityId];
      if (/_\d+$/.test(capabilityId)) {
        rest.push(capabilityId.replace(/_\d+$/, ''));
      }
      return [PRD_GENERATION_SKILL_ID, ...rest.filter((id) => id !== PRD_GENERATION_SKILL_ID)];
    }
    const out = [capabilityId];
    if (/_\d+$/.test(capabilityId)) {
      out.push(capabilityId.replace(/_\d+$/, ''));
    }
    return out;
  }

  private async resolveSkillConfig(capabilityId: string): Promise<{
    skill: AiSkillConfig | null;
    resolvedSkillId: string | null;
    skillSource: 'database' | 'code_default' | 'none';
  }> {
    const variants = this.capabilitySkillIdVariants(capabilityId);
    let defaultSkill: AiSkillConfig | null = null;
    let defaultSkillId: string | null = null;
    for (const id of variants) {
      const d = DEFAULT_AI_SKILLS[id as keyof typeof DEFAULT_AI_SKILLS];
      if (d?.promptTemplate) {
        defaultSkill = {
          endpoint: d.endpoint,
          model: d.model,
          promptTemplate: d.promptTemplate,
          tools: d.tools,
        };
        defaultSkillId = id;
        break;
      }
    }
    try {
      for (const id of variants) {
        const stored = await this.rdService.getAiSkill(id);
        if (stored?.promptTemplate) {
          return {
            skill: {
              endpoint: stored.endpoint,
              model: stored.model,
              promptTemplate: stored.promptTemplate,
              tools: stored.tools,
            },
            resolvedSkillId: id,
            skillSource: 'database',
          };
        }
      }
    } catch (e) {
      this.logger.warn(
        `读取 AI Skill 配置失败，尝试使用内置配置: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    if (defaultSkill) {
      return {
        skill: defaultSkill,
        resolvedSkillId: defaultSkillId,
        skillSource: 'code_default',
      };
    }
    return { skill: null, resolvedSkillId: null, skillSource: 'none' };
  }

  private canUseDemoOutput(): boolean {
    if (process.env.AI_DEMO_MODE === 'true') return true;
    return process.env.NODE_ENV !== 'production';
  }

  private unavailableUnaryResponse(): CapabilityUnaryResponse {
    return {
      status_code: ERROR,
      error_msg: AI_PROVIDER_UNAVAILABLE,
    };
  }

  private unavailableStreamEvent(): string {
    return `data: ${JSON.stringify({
      status_code: ERROR,
      error_msg: AI_PROVIDER_UNAVAILABLE,
    })}\n\n`;
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
