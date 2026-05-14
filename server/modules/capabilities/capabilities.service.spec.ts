import { ReadableStream } from 'node:stream/web';

import { CapabilitiesService } from './capabilities.service';

async function collectStream(stream: AsyncGenerator<string>): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks.join('');
}

describe('CapabilitiesService', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
    delete process.env.ARK_API_KEY;
    delete process.env.NEXT_PUBLIC_ARK_API_KEY;
    delete process.env.VITE_ARK_API_KEY;
    delete process.env.ARK_API_ENDPOINT;
    delete process.env.ARK_MODEL;
    delete process.env.ARK_STREAM_ALLOW_WEB_SEARCH;
    global.fetch = jest.fn() as jest.Mock;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('ignores public Ark keys and falls back to demo stream outside production', async () => {
    process.env.NEXT_PUBLIC_ARK_API_KEY = 'public-next-key';
    process.env.VITE_ARK_API_KEY = 'public-vite-key';
    const service = new CapabilitiesService({
      getAiSkill: jest.fn(),
    } as never);

    const body = await collectStream(
      service.stream('fs_auto_generation', 'textGenerate', {
        prd_document: '用户需要一个 AI 研发平台',
      })
    );

    expect(global.fetch).not.toHaveBeenCalled();
    expect(body).toContain('演示输出');
  });

  it('returns an explicit error instead of demo output in production without a model key', async () => {
    process.env.NODE_ENV = 'production';
    const service = new CapabilitiesService({
      getAiSkill: jest.fn(),
    } as never);

    const unary = service.invoke('requirement_classifier_1', 'aiCategorize', {
      requirement_text: '紧急需求',
    });
    const streamBody = await collectStream(
      service.stream('fs_auto_generation', 'textGenerate', {
        prd_document: '用户需要一个 AI 研发平台',
      })
    );

    expect(unary.status_code).toBe('1');
    expect(unary.error_msg).toContain('生产环境不会返回演示输出');
    expect(streamBody).toContain('"status_code":"1"');
    expect(streamBody).toContain('生产环境不会返回演示输出');
    expect(streamBody).not.toContain('【演示输出】');
  });

  it('allows demo output in production only when AI_DEMO_MODE is explicit', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AI_DEMO_MODE = 'true';
    const service = new CapabilitiesService({
      getAiSkill: jest.fn(),
    } as never);

    const unary = service.invoke('requirement_classifier_1', 'aiCategorize', {
      requirement_text: '紧急需求',
    });
    const streamBody = await collectStream(
      service.stream('fs_auto_generation', 'textGenerate', {
        prd_document: '用户需要一个 AI 研发平台',
      })
    );

    expect(unary.status_code).toBe('0');
    expect(streamBody).toContain('演示输出');
  });

  it('does not silently fall back to demo output in production when Ark fails', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ARK_API_KEY = 'server-key';
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      body: null,
    })) as jest.Mock;
    const service = new CapabilitiesService({
      getAiSkill: jest.fn().mockResolvedValue({
        endpoint: 'https://ark.example.test/custom',
        model: 'model-from-skill',
        promptTemplate: 'PRD: {{prd_document}}',
        tools: [],
      }),
    } as never);

    const body = await collectStream(
      service.stream('fs_auto_generation', 'textGenerate', {
        prd_document: '用户需要一个 AI 研发平台',
      })
    );

    expect(body).toContain('"status_code":"1"');
    expect(body).toContain('生产环境不会返回演示输出');
    expect(body).not.toContain('【演示输出】');
  });

  it('streams configurable AI skill prompts through server-side Ark key', async () => {
    process.env.ARK_STREAM_ALLOW_WEB_SEARCH = 'true';
    process.env.ARK_API_KEY = 'server-key';
    process.env.ARK_API_ENDPOINT = 'https://ark.example.test/responses';
    const responseBody = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"output_text":"功能规格正文"}\n\ndata: [DONE]\n\n')
        );
        controller.close();
      },
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      body: responseBody,
    })) as jest.Mock;
    const service = new CapabilitiesService({
      getAiSkill: jest.fn().mockResolvedValue({
        endpoint: 'https://ark.example.test/custom',
        model: 'model-from-skill',
        promptTemplate: 'PRD: {{prd_document}}',
        tools: [{ type: 'web_search' }],
      }),
    } as never);

    const body = await collectStream(
      service.stream('fs_auto_generation', 'textGenerate', {
        prd_document: '用户需要一个 AI 研发平台',
      })
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://ark.example.test/custom',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer server-key' }),
        body: expect.stringContaining('"model":"model-from-skill"'),
      })
    );
    const requestBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(requestBody.input[0].content[0].text).toBe('PRD: 用户需要一个 AI 研发平台');
    expect(requestBody.tools).toEqual([{ type: 'web_search' }]);
    expect(body).toContain('功能规格正文');
  });

  it('omits web_search from Ark tool list unless ARK_STREAM_ALLOW_WEB_SEARCH=true', async () => {
    delete process.env.ARK_STREAM_ALLOW_WEB_SEARCH;
    process.env.ARK_API_KEY = 'server-key';
    process.env.ARK_API_ENDPOINT = 'https://ark.example.test/responses';
    const responseBody = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"output_text":"x"}\n\ndata: [DONE]\n\n')
        );
        controller.close();
      },
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      body: responseBody,
    })) as jest.Mock;
    const service = new CapabilitiesService({
      getAiSkill: jest.fn().mockResolvedValue({
        model: 'm',
        promptTemplate: 'P {{prd_document}}',
        tools: [{ type: 'web_search' }],
      }),
    } as never);
    await collectStream(
      service.stream('fs_auto_generation', 'textGenerate', {
        prd_document: '用户需要一个 AI 研发平台',
      })
    );
    const requestBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(requestBody.tools).toEqual([]);
  });
});
