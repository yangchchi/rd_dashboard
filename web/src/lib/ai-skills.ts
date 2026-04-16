import type { IAiSkillConfig } from '@/lib/ai-skill-engine';
import { rdApi } from '@/lib/rd-api';
import {
  DEFAULT_AI_SKILLS as SHARED_DEFAULT_AI_SKILLS,
  PLUGIN_SKILL_ORDER as SHARED_PLUGIN_SKILL_ORDER,
  PRD_GENERATION_SKILL_ID,
} from '@shared/ai-skill-defaults';

export { PRD_GENERATION_SKILL_ID };
export const PLUGIN_SKILL_ORDER: string[] = SHARED_PLUGIN_SKILL_ORDER;
const DEFAULT_AI_SKILLS: Record<string, IAiSkillConfig> = SHARED_DEFAULT_AI_SKILLS;
let cache: Record<string, IAiSkillConfig> | null = null;

export function clearAiSkillCache(): void {
  cache = null;
}

function sortSkills(list: IAiSkillConfig[]): IAiSkillConfig[] {
  const index = (id: string) => {
    const i = PLUGIN_SKILL_ORDER.indexOf(id);
    return i === -1 ? PLUGIN_SKILL_ORDER.length + 1 : i;
  };
  return [...list].sort((a, b) => {
    const d = index(a.id) - index(b.id);
    return d !== 0 ? d : a.name.localeCompare(b.name, 'zh-CN');
  });
}

function toMap(remote: IAiSkillConfig[]): Record<string, IAiSkillConfig> {
  const merged: Record<string, IAiSkillConfig> = {};
  for (const skill of remote) {
    if (!skill?.id) continue;
    merged[skill.id] = {
      ...skill,
      id: skill.id,
      provider: 'ark',
    };
  }
  return merged;
}

async function ensureCache(force = false): Promise<Record<string, IAiSkillConfig>> {
  if (!force && cache) return cache;
  try {
    const remote = await rdApi.listAiSkills();
    cache = toMap(remote as IAiSkillConfig[]);
  } catch {
    cache = { ...DEFAULT_AI_SKILLS };
  }
  return cache;
}

export async function listAiSkills(): Promise<IAiSkillConfig[]> {
  const current = await ensureCache(true);
  return sortSkills(Object.values(current));
}

export async function getAiSkill(skillId: string): Promise<IAiSkillConfig> {
  const skill = (await ensureCache(true))[skillId];
  if (!skill) {
    throw new Error(`未找到Skill: ${skillId}`);
  }
  return skill;
}

export async function updateAiSkill(skillId: string, patch: Partial<IAiSkillConfig>) {
  const current = await ensureCache();
  const target = current[skillId] ?? DEFAULT_AI_SKILLS[skillId];
  if (!target) {
    throw new Error(`未找到Skill: ${skillId}`);
  }
  const nextSkill: IAiSkillConfig = {
    ...target,
    ...patch,
    id: skillId,
    provider: 'ark',
  };
  await rdApi.upsertAiSkill(skillId, nextSkill);
  cache = { ...current, [skillId]: nextSkill };
}

export async function resetAiSkill(skillId: string) {
  const def = DEFAULT_AI_SKILLS[skillId];
  if (!def) {
    throw new Error(`无内置默认配置: ${skillId}`);
  }
  const current = await ensureCache();
  await rdApi.upsertAiSkill(skillId, def);
  cache = { ...current, [skillId]: { ...def } };
}

export async function createAiSkill(input: { id: string; name: string }) {
  const id = input.id.trim();
  const name = input.name.trim();
  if (!id) throw new Error('Skill ID 不能为空');
  if (!/^[a-z0-9_]+$/.test(id)) throw new Error('Skill ID 仅支持小写字母、数字、下划线');
  if (!name) throw new Error('Skill 名称不能为空');
  const current = await ensureCache();
  if (current[id]) throw new Error(`Skill 已存在: ${id}`);

  const created: IAiSkillConfig = {
    id,
    name,
    provider: 'ark',
    model: 'deepseek-v3-2-251201',
    stream: true,
    tools: [],
    promptTemplate: '请根据输入变量完成任务并仅返回最终结果。',
  };
  await rdApi.upsertAiSkill(id, created);
  cache = { ...current, [id]: created };
}

export async function deleteAiSkill(skillId: string) {
  const current = await ensureCache();
  await rdApi.resetAiSkill(skillId);
  const next = { ...current };
  delete next[skillId];
  cache = next;
}
