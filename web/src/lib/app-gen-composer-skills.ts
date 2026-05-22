import type { LucideIcon } from 'lucide-react';
import {
  ClipboardList,
  FoldVertical,
  ListChecks,
  Palette,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react';

import type { IAiSkillConfig } from '@/lib/ai-skill-engine';
import { listAiSkills } from '@/lib/ai-skills';

function truncateOneLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export interface AppGenSlashRow {
  key: string;
  name: string;
  description: string;
  Icon: LucideIcon;
  buildInsert: () => string;
}

function buildRemoteSkillInsert(skill: IAiSkillConfig): string {
  const hint = skill.description?.trim() || truncateOneLine(skill.promptTemplate, 280);
  return `【技能：${skill.name}】（skill_id: ${skill.id}）\n${hint}\n\n请结合当前单页 HTML 原型与对话历史落实上述意图。\n\n`;
}

export function buildBuiltinAppGenSlashRows(): AppGenSlashRow[] {
  return [
    {
      key: 'builtin:ui-polish',
      name: 'UI 打磨',
      description: '统一间距、配色与组件层次，保持可点击',
      Icon: Palette,
      buildInsert: () =>
        '【快捷：UI 打磨】\n请优化当前页面的视觉层次：统一间距、圆角、主色与 hover 态；保持所有按钮可点击、表单可输入。\n\n',
    },
    {
      key: 'builtin:compress',
      name: '压缩上下文',
      description: '生成本轮前要点摘要，便于长线程接力',
      Icon: FoldVertical,
      buildInsert: () =>
        '【快捷：压缩上下文】\n请用 10 条以内要点概括：当前页面结构、未完成项、已改区域、下一步建议。\n\n',
    },
    {
      key: 'builtin:review',
      name: '代码审查',
      description: '从可访问性、交互与结构角度审视当前 HTML',
      Icon: ShieldCheck,
      buildInsert: () =>
        '【快捷：代码审查】\n请审查当前单文件 HTML：语义标签、可访问性、事件绑定、边界情况与可维护性；能直接改的请改代码。\n\n',
    },
    {
      key: 'builtin:verify',
      name: '运行验证',
      description: '列出建议的手动验证步骤与预期结果',
      Icon: ListChecks,
      buildInsert: () =>
        '【快捷：运行验证】\n请列出 5–8 条手动验证步骤（操作 → 预期），覆盖主流程与 1–2 条异常路径。\n\n',
    },
    {
      key: 'builtin:acceptance',
      name: '验收对齐',
      description: '对照最初一句话需求列出差距',
      Icon: ClipboardList,
      buildInsert: () =>
        '【快捷：验收对齐】\n请对照用户最初需求，用 checklist 列出当前原型仍缺的功能或体验差距，并给出最小补齐改法。\n\n',
    },
    {
      key: 'builtin:component',
      name: '增加组件',
      description: '在现有布局上增补一块 UI',
      Icon: Wand2,
      buildInsert: () =>
        '【快捷：增加组件】\n请在现有页面中增补一块独立 UI（说明放在哪、长什么样），不要破坏已有交互。\n\n',
    },
  ];
}

export async function loadAppGenSlashRows(): Promise<AppGenSlashRow[]> {
  const builtins = buildBuiltinAppGenSlashRows();
  try {
    const remote = await listAiSkills();
    const fromRemote: AppGenSlashRow[] = remote.map((s) => ({
      key: `skill:${s.id}`,
      name: s.name,
      description: s.description?.trim() || truncateOneLine(s.promptTemplate, 100),
      Icon: Sparkles,
      buildInsert: () => buildRemoteSkillInsert(s),
    }));
    return [...builtins, ...fromRemote];
  } catch {
    return builtins;
  }
}
