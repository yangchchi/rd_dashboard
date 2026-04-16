import { validateHeaderValue } from 'node:http';
import { buildZipContentDisposition } from './rd-download-header';

describe('buildZipContentDisposition', () => {
  it('returns a valid Content-Disposition header for Chinese filenames', () => {
    const value = buildZipContentDisposition('创建带AI分析一个记事本-20260414120000');

    expect(value).toContain('attachment;');
    expect(value).toContain('filename="');
    expect(value).toContain("filename*=UTF-8''");
    expect(() => validateHeaderValue('Content-Disposition', value)).not.toThrow();
  });
});

