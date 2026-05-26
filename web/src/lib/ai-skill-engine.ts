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

const THINK_OPEN = '\u003cthink\u003e';
const THINK_CLOSE = '\u003c/think\u003e';
const RR_OPEN = '\u003credacted_reasoning\u003e';
const RR_CLOSE = '\u003c/redacted_reasoning\u003e';

/** 将 `{{var}}` 占位符替换为 variables 中的值（与插件 Skill 配置一致）。 */
export function fillAiSkillPromptTemplate(template: string, variables: Record<string, string>): string {
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
