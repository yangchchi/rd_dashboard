import {
  buildOssObjectKey,
  buildOssPublicUrl,
  extensionForImageMime,
  insertMarkdownImageAt,
  isAllowedMarkdownImageMime,
  parseOssRegionFromEndpoint,
} from '@shared/oss-upload';

describe('oss-upload helpers', () => {
  it('parses region from endpoint', () => {
    expect(parseOssRegionFromEndpoint('https://oss-cn-shenzhen.aliyuncs.com')).toBe('oss-cn-shenzhen');
  });

  it('builds object key with date path', () => {
    const key = buildOssObjectKey({
      prefix: 'file',
      ext: '.png',
      now: new Date('2026-05-26T10:00:00Z'),
      id: 'abc',
    });
    expect(key).toBe('file/2026/05/26/abc.png');
  });

  it('builds public url', () => {
    expect(buildOssPublicUrl('https://bucket.oss-cn-shenzhen.aliyuncs.com/', 'file/a.png')).toBe(
      'https://bucket.oss-cn-shenzhen.aliyuncs.com/file/a.png',
    );
  });

  it('validates image mime', () => {
    expect(isAllowedMarkdownImageMime('image/png')).toBe(true);
    expect(isAllowedMarkdownImageMime('application/pdf')).toBe(false);
    expect(extensionForImageMime('image/jpeg')).toBe('.jpg');
  });

  it('inserts markdown image at cursor', () => {
    const md = 'hello\nworld';
    const next = insertMarkdownImageAt(md, 'https://cdn/x.png', 5, 5, '截图');
    expect(next).toContain('![截图](https://cdn/x.png)');
    expect(next.startsWith('hello')).toBe(true);
  });
});
