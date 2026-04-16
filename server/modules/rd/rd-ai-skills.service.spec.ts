import { RdService } from './rd.service';
import { DEFAULT_AI_SKILLS } from '../../../shared/ai-skill-defaults';

describe('RdService ai-skills', () => {
  it('should upsert and read ai skill config', async () => {
    const stored: Record<string, unknown> = {
      id: 'fs_auto_generation',
      name: 'FS Skill',
      provider: 'ark',
      model: 'deepseek-v3-2-251201',
      stream: true,
      prompt_template: 'x',
      endpoint: null,
      description: null,
      tools: [],
      updated_at: new Date().toISOString(),
    };
    const db = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([stored])
        .mockResolvedValueOnce([stored])
        .mockResolvedValueOnce([stored])
        .mockResolvedValueOnce([stored]),
    };
    const service = new RdService(db as any);

    await service.upsertAiSkill('fs_auto_generation', {
      name: 'FS Skill',
      provider: 'ark',
      model: 'deepseek-v3-2-251201',
      stream: true,
      promptTemplate: 'x',
      tools: [],
    });

    const item = await service.getAiSkill('fs_auto_generation');
    const list = await service.listAiSkills();

    expect(item?.id).toBe('fs_auto_generation');
    expect(list).toHaveLength(1);
  });

  it('should seed builtin skills without overriding existing rows', async () => {
    const db = {
      execute: jest.fn(async () => []),
    };
    const service = new RdService(db as any);

    await (service as any).ensureAiSkillDefaults();

    expect((db.execute as jest.Mock).mock.calls.length).toBe(Object.keys(DEFAULT_AI_SKILLS).length);
  });
});
