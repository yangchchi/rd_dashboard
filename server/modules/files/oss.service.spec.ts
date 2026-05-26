import { BadRequestException } from '@nestjs/common';

import { OssService } from './oss.service';

describe('OssService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.OSS_BUCKET_NAME = 'test-bucket';
    process.env.OSS_ENDPOINT = 'https://oss-cn-shenzhen.aliyuncs.com';
    process.env.OSS_ACCESS_KEY_ID = 'key';
    process.env.OSS_ACCESS_KEY_SECRET = 'secret';
    process.env.OSS_ACCESS_URL = 'https://test-bucket.oss-cn-shenzhen.aliyuncs.com';
    process.env.OSS_PREFIX = 'file';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('rejects non-image mime', async () => {
    const service = new OssService();
    await expect(
      service.uploadMarkdownImage({
        buffer: Buffer.from('x'),
        mimetype: 'application/pdf',
        size: 1,
        originalname: 'a.pdf',
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports configured when env present', () => {
    const service = new OssService();
    expect(service.isConfigured()).toBe(true);
  });
});
