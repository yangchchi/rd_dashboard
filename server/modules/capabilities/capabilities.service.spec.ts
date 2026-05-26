import { ReadableStream } from 'node:stream/web';

import { CapabilitiesService } from './capabilities.service';

async function collectStream(stream: AsyncGenerator<string>): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks.join('');
}

function createCapabilitiesService(options?: {
  getAiSkill?: jest.Mock;
  getUserModelConfig?: jest.Mock;
}) {
  return new CapabilitiesService(
    { getAiSkill: options?.getAiSkill ?? jest.fn() } as never,
    {
      getUserModelConfig: options?.getUserModelConfig ?? jest.fn().mockResolvedValue(null),
    } as never
  );
}

describe('CapabilitiesService', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
    delete process.env.ARK_API_KEY;
    delete process.env.ARK_API_ENDPOINT;
    delete process.env.ARK_MODEL;
    delete process.env.ARK_STREAM_ALLOW_WEB_SEARCH;
    global.fetch = jest.fn() as jest.Mock;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('falls back to demo stream outside production without a model key', async () => {
    const service = createCapabilitiesService();

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
    const service = createCapabilitiesService();

    const unary = await service.invoke('requirement_classifier_1', 'aiCategorize', {
      requirement_text: '紧急需求',
    });
    const streamBody = await collectStream(
      service.stream('fs_auto_generation', 'textGenerate', {
        prd_document: '用户需要一个 AI 研发平台',
      })
    );

    expect(unary.status_code).toBe('1');
    expect(unary.error_msg).toContain('MODEL_CONFIG_REQUIRED');
    expect(streamBody).toContain('"status_code":"1"');
    expect(streamBody).toContain('MODEL_CONFIG_REQUIRED');
    expect(streamBody).not.toContain('【演示输出】');
  });

  it('allows demo output in production only when AI_DEMO_MODE is explicit', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AI_DEMO_MODE = 'true';
    const service = createCapabilitiesService();

    const unary = await service.invoke('requirement_classifier_1', 'aiCategorize', {
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
    const service = createCapabilitiesService({
      getAiSkill: jest.fn().mockResolvedValue({
        endpoint: 'https://ark.example.test/custom',
        model: 'model-from-skill',
        promptTemplate: 'PRD: {{prd_document}}',
        tools: [],
      }),
    });

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
    const service = createCapabilitiesService({
      getAiSkill: jest.fn().mockResolvedValue({
        endpoint: 'https://ark.example.test/custom',
        model: 'model-from-skill',
        promptTemplate: 'PRD: {{prd_document}}',
        tools: [{ type: 'web_search' }],
      }),
    });

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

  it('prd_generator_1 流式优先使用数据库中的 prd_auto_generation，而非 prd_generator_1 行', async () => {
    process.env.ARK_API_KEY = 'server-key';
    process.env.ARK_API_ENDPOINT = 'https://ark.example.test/responses';
    const responseBody = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"output_text":"正文"}\n\ndata: [DONE]\n\n')
        );
        controller.close();
      },
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      body: responseBody,
    })) as jest.Mock;
    const getAiSkill = jest.fn(async (id: string) => {
      if (id === 'prd_auto_generation') {
        return {
          endpoint: 'https://ark.example.test/custom',
          model: 'model-a',
          promptTemplate: 'ONLY_AUTO={{original_requirement}}',
          tools: [],
        };
      }
      if (id === 'prd_generator_1') {
        return {
          endpoint: 'https://ark.example.test/custom',
          model: 'model-b',
          promptTemplate: 'WRONG_ROW',
          tools: [],
        };
      }
      return null;
    });
    const service = createCapabilitiesService({ getAiSkill });

    await collectStream(
      service.stream('prd_generator_1', 'textGenerate', {
        original_requirement: '权限管理RBAC',
        additional_requirements: '',
        related_prd_document: '',
        user_supplementary_document: '',
      })
    );

    expect(getAiSkill.mock.calls[0]?.[0]).toBe('prd_auto_generation');
    expect(getAiSkill).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(requestBody.input[0].content[0].text).toBe('ONLY_AUTO=权限管理RBAC');
    expect(requestBody.tools).toEqual([]);
  });

  it('prd_generator 套模板时从 original_requirement 补全 {{title}} / {{description}}', async () => {
    process.env.ARK_API_KEY = 'server-key';
    process.env.ARK_API_ENDPOINT = 'https://ark.example.test/responses';
    const responseBody = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"output_text":"ok"}\n\ndata: [DONE]\n\n')
        );
        controller.close();
      },
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      body: responseBody,
    })) as jest.Mock;
    const service = createCapabilitiesService({
      getAiSkill: jest.fn().mockResolvedValue({
        endpoint: null,
        model: 'm',
        promptTemplate: 'T={{title}}\nD={{description}}',
        tools: [],
      }),
    });

    await collectStream(
      service.stream('prd_generator_1', 'textGenerate', {
        original_requirement:
          '需求标题：权限管理\n需求描述：实现RBAC。\n期望上线时间：2026-01-01\n业务优先级：P1',
        additional_requirements: '',
        related_prd_document: '',
        user_supplementary_document: '',
      })
    );

    const requestBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(requestBody.input[0].content[0].text).toBe('T=权限管理\nD=实现RBAC。');
  });

  it('prd_generator 从 original_requirement 解析 product_name 供模板占位', async () => {
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
    const service = createCapabilitiesService({
      getAiSkill: jest.fn().mockResolvedValue({
        endpoint: null,
        model: 'm',
        promptTemplate: 'PROD={{product_name}}',
        tools: [],
      }),
    });

    await collectStream(
      service.stream('prd_generator_1', 'textGenerate', {
        original_requirement:
          '【范围锚定】x\n所属产品：HAI智研平台\n需求标题：权限\n需求描述：RBAC。\n期望上线时间：2026-01-01\n业务优先级：P1',
        additional_requirements: '',
        related_prd_document: '',
        user_supplementary_document: '',
      })
    );

    const requestBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(requestBody.input[0].content[0].text).toBe('PROD=HAI智研平台');
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
    const service = createCapabilitiesService({
      getAiSkill: jest.fn().mockResolvedValue({
        model: 'm',
        promptTemplate: 'P {{prd_document}}',
        tools: [{ type: 'web_search' }],
      }),
    });
    await collectStream(
      service.stream('fs_auto_generation', 'textGenerate', {
        prd_document: '用户需要一个 AI 研发平台',
      })
    );
    const requestBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(requestBody.tools).toEqual([]);
  });

  it('prefers user modelOverride over server ARK_API_KEY for stream calls', async () => {
    process.env.ARK_API_KEY = 'server-key';
    process.env.ARK_API_ENDPOINT = 'https://ark.example.test/responses';
    const responseBody = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"output_text":"user-key-ok"}\n\ndata: [DONE]\n\n')
        );
        controller.close();
      },
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      body: responseBody,
    })) as jest.Mock;
    const service = createCapabilitiesService({
      getAiSkill: jest.fn().mockResolvedValue({
        endpoint: 'https://ark.example.test/skill-endpoint',
        model: 'model-from-skill',
        promptTemplate: 'PRD: {{prd_document}}',
        tools: [],
      }),
    });

    const body = await collectStream(
      service.stream(
        'fs_auto_generation',
        'textGenerate',
        { prd_document: '用户需要一个 AI 研发平台' },
        {
          provider: 'volcengine',
          apiBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
          apiKey: 'user-personal-key-12345678',
          modelName: 'user-model-id',
        }
      )
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://ark.cn-beijing.volces.com/api/v3/responses',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer user-personal-key-12345678' }),
        body: expect.stringContaining('"model":"user-model-id"'),
      })
    );
    expect(body).toContain('user-key-ok');
  });

  it('loads model config from database when request body override is absent', async () => {
    process.env.ARK_API_KEY = 'server-key-should-not-be-used';
    const responseBody = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"output_text":"db-model-ok"}\n\ndata: [DONE]\n\n')
        );
        controller.close();
      },
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      body: responseBody,
    })) as jest.Mock;
    const service = createCapabilitiesService({
      getAiSkill: jest.fn().mockResolvedValue({
        endpoint: 'https://ark.example.test/skill-endpoint',
        model: 'model-from-skill',
        promptTemplate: 'PRD: {{prd_document}}',
        tools: [],
      }),
      getUserModelConfig: jest.fn().mockResolvedValue({
        provider: 'volcengine',
        modelName: 'db-user-model',
        apiBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        apiKey: 'db-user-key-12345678',
      }),
    });

    const body = await collectStream(
      service.stream('fs_auto_generation', 'textGenerate', { prd_document: 'test' }, undefined, 'user-1')
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://ark.cn-beijing.volces.com/api/v3/responses',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer db-user-key-12345678' }),
        body: expect.stringContaining('"model":"db-user-model"'),
      })
    );
    expect(body).toContain('db-model-ok');
  });
});
