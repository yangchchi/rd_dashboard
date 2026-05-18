import {
  CODEX_CHAT_ONLY_MARKER,
  polishCodexBubbleForUi,
  deriveCodexAnswerHeadline,
  isCodexShortChatAnswer,
  detectCodexChatOnlyRound,
} from '../../web/src/screen/AIPipelinePage/agentCodexBubblePolish';

describe('agentCodexBubblePolish', () => {
  it('strips Codex CLI chrome, logs, tokens and duplicate answer for chat-only turn', () => {
    const raw = [
      'SUCCESS',
      'workdir: /tmp/rd-agent-workspaces/rd_dashboard',
      'model: gpt-3.5 provider: sub2api approval: never sandbox: workspace-write session id: abc-def',
      CODEX_CHAT_ONLY_MARKER,
      '你当前是什么Agent，用的是什么模型',
      '请用简短中文直接回答',
      '2025-05-18T03:37:31.583738Z ERROR codex_memories_write::phase2: Phase 2 no changes codex',
      '我是 Codex CLI 里的 Codex 编码 Agent，使用的是 GPT-3 系列模型。',
      '我是 Codex CLI 里的 Codex 编码 Agent，使用的是 GPT-3 系列模型。',
      'tokens used 17,444',
      '我是 Codex CLI 里的 Codex 编码 Agent，使用的是 GPT-3 系列模型。',
    ].join('\n');

    const polished = polishCodexBubbleForUi(raw);
    expect(polished).not.toMatch(/SUCCESS/);
    expect(polished).not.toMatch(/workdir:/);
    expect(polished).not.toMatch(/provider:/);
    expect(polished).not.toMatch(/ERROR codex_memories/);
    expect(polished).not.toMatch(/tokens used/i);
    expect(polished).not.toContain(CODEX_CHAT_ONLY_MARKER);
    expect(polished).toContain('GPT-3 系列模型');
    expect(polished.match(/GPT-3 系列模型/g)?.length).toBe(1);
  });

  it('strips Codex TUI user/codex transcript and duplicate answer after token count', () => {
    const raw = [
      'session id: 019e39bd-3377-7e83-9776-10b6a51c4913',
      '',
      '---',
      'user',
      '...',
      'codex',
      '我是 Codex，一个在当前仓库 worktree 中协助你做代码理解、修改、验证和简短问答的编程 Agent。',
      '17,392',
      '我是 Codex，一个在当前仓库 worktree 中协助你做代码理解、修改、验证和简短问答的编程 Agent。',
    ].join('\n');

    expect(detectCodexChatOnlyRound(raw)).toBe(true);
    const polished = polishCodexBubbleForUi(raw);
    expect(polished).not.toMatch(/^\s*user\s*$/m);
    expect(polished).not.toMatch(/^\s*codex\s*$/m);
    expect(polished).not.toMatch(/17,392/);
    expect(polished.match(/我是 Codex/g)?.length).toBe(1);
    expect(isCodexShortChatAnswer(polished)).toBe(true);
    expect(deriveCodexAnswerHeadline(polished)).toContain('我是 Codex');
  });
});
