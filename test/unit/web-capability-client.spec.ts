import { ReadableStream } from 'node:stream/web';

jest.mock('../../web/src/lib/ai-skills', () => ({
  clearAiSkillCache: jest.fn(),
}));

jest.mock('../../web/src/lib/auth', () => ({
  getAuthToken: jest.fn(() => null),
}));

const dispatchModelConfigRequired = jest.fn();
jest.mock('../../web/src/lib/model-credentials-client', () => ({
  dispatchModelConfigRequired: (...args: unknown[]) => dispatchModelConfigRequired(...args),
  MODEL_CONFIG_REQUIRED_EVENT: 'rd:model-config-required',
}));

describe('web capability client', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetModules();
    dispatchModelConfigRequired.mockClear();
  });

  it('throws when a stream event carries model config required status', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"status_code":"1","error_msg":"MODEL_CONFIG_REQUIRED:请配置模型"}\n\n'
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

    const { capabilityClient, isModelConfigRequiredError } = await import(
      '../../web/src/lib/capability-client'
    );
    const stream = capabilityClient.load('fs_auto_generation').callStream('textGenerate', {});

    let caught: unknown;
    try {
      for await (const _chunk of stream) {
        // iteration should fail before yielding data
      }
    } catch (err) {
      caught = err;
    }

    expect(caught).toMatchObject({ code: 'MODEL_CONFIG_REQUIRED' });
    expect(isModelConfigRequiredError(caught)).toBe(true);
    expect(dispatchModelConfigRequired).toHaveBeenCalled();
  });
});
