describe('web ai-skill-engine', () => {
  it('does not use public browser Ark keys for direct model calls', async () => {
    jest.resetModules();
    process.env.NEXT_PUBLIC_ARK_API_KEY = 'public-next-key';
    process.env.VITE_ARK_API_KEY = 'public-vite-key';

    const { runAiSkillStream } = await import('../../web/src/lib/ai-skill-engine');

    await expect(
      runAiSkillStream(
        {
          id: 'fs_auto_generation',
          name: 'FS',
          provider: 'ark',
          model: 'deepseek-v3-2-251201',
          promptTemplate: 'hello {{name}}',
        },
        {
          variables: { name: 'rd' },
          onChunk: jest.fn(),
        }
      )
    ).rejects.toThrow('浏览器端直连 Ark 已禁用');
  });
});
