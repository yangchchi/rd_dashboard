import fs from 'node:fs';
import path from 'node:path';

function resolveEnvFilePath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(__dirname, '..', '.env'),
    path.resolve(__dirname, '..', '..', '.env'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * 从项目根目录加载 .env（与 scripts/dev.js 行为一致）。
 * 若系统环境变量已存在但为空字符串，仍用 .env 中的值覆盖。
 */
export function loadProjectEnv(): void {
  const envPath = resolveEnvFilePath();
  if (!envPath) return;

  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    const existing = process.env[key];
    if (existing === undefined || String(existing).trim() === '') {
      process.env[key] = value;
    }
  }
}
