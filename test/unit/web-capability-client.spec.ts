import { ReadableStream } from 'node:stream/web';

jest.mock('../../web/src/lib/ai-skills', () => ({
  clearAiSkillCache: jest.fn(),
}));

describe('web capability client', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetModules();
  });

  it('throws when a stream event carries a non-success status', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"status_code":"1","error_msg":"AI 模型服务未配置"}\n\n'
          )
        );
        controller.close();
      },
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      body,
    })) as jest.Mock;

    const { capabilityClient } = await import('../../web/src/lib/capability-client');
    const stream = capabilityClient.load('fs_auto_generation').callStream('textGenerate', {});

    await expect(async () => {
      for await (const _chunk of stream) {
        // iteration should fail before yielding data
      }
    }).rejects.toThrow('AI 模型服务未配置');
  });
});
