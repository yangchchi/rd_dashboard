function sanitizeBaseName(input: string): string {
  const raw = (input || 'untitled').trim();
  const withoutForbidden = raw.replace(/[\\/:*?"<>|]/g, '_');
  return withoutForbidden || 'untitled';
}

function toAsciiFallback(fileName: string): string {
  const safe = fileName
    .replace(/["\\]/g, '_')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return safe || 'download.zip';
}

export function buildZipContentDisposition(baseName: string): string {
  const normalizedBase = sanitizeBaseName(baseName);
  const utf8FileName = `${normalizedBase}.zip`;
  const asciiFallback = toAsciiFallback(utf8FileName);
  const encoded = encodeURIComponent(utf8FileName);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

