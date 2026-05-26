import { fillAiSkillPromptTemplate, stripThinkingArtifacts } from '../../web/src/lib/ai-skill-engine';

describe('web ai-skill-engine', () => {
  it('fills prompt template variables', () => {
    expect(fillAiSkillPromptTemplate('hello {{name}}', { name: 'rd' })).toBe('hello rd');
    expect(fillAiSkillPromptTemplate('{{a}} {{b}}', { a: '1' })).toBe('1 ');
  });

  it('strips thinking artifacts from model output', () => {
    const raw = 'prefix\u003cthink\u003ehidden\u003c/think\u003esuffix';
    expect(stripThinkingArtifacts(raw)).toBe('prefixsuffix');
  });
});
