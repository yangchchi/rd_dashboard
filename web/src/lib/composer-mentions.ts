/** 对话输入框 `/` 技能与 `@` 文件引用触发解析（与 Agent 工作台一致） */

export function parseSlashTrigger(
  draft: string,
  cursor: number
): { start: number; filter: string } | null {
  const norm = draft.replace(/／/g, '/');
  let c = Math.min(Math.max(cursor, 0), norm.length);
  if (norm === '/' && c === 0) c = 1;
  const before = norm.slice(0, c);
  const m = before.match(/(^|[\s\n])(\/)([^\s]*)$/);
  if (m && m.index !== undefined) {
    const slashIdx = m.index + m[1].length;
    return { start: slashIdx, filter: (m[3] ?? '').toLowerCase() };
  }
  const slashIdx = before.lastIndexOf('/');
  if (slashIdx < 0) return null;
  const after = before.slice(slashIdx + 1);
  if (after.includes('\n')) return null;
  if (slashIdx > 0) {
    const prev = before[slashIdx - 1]!;
    if (/\S/.test(prev) && /[a-zA-Z0-9_\u4e00-\u9fff]/.test(prev)) return null;
  }
  return { start: slashIdx, filter: after.toLowerCase() };
}

export function parseAtTrigger(
  draft: string,
  cursor: number
): { start: number; filter: string } | null {
  const norm = draft.replace(/＠/g, '@');
  let c = Math.min(Math.max(cursor, 0), norm.length);
  if (norm === '@' && c === 0) c = 1;
  const before = norm.slice(0, c);
  const m = before.match(/(^|[\s\n])(@)([^\s@]*)$/);
  if (m && m.index !== undefined) {
    const atIdx = m.index + m[1].length;
    return { start: atIdx, filter: (m[3] ?? '').toLowerCase() };
  }
  const atIdx = before.lastIndexOf('@');
  if (atIdx < 0) return null;
  const after = before.slice(atIdx + 1);
  if (after.includes('\n') || after.includes('@')) return null;
  if (/\s/.test(after)) return null;
  if (atIdx > 0) {
    const prev = before[atIdx - 1]!;
    if (/\S/.test(prev) && /[a-zA-Z0-9_\u4e00-\u9fff]/.test(prev)) return null;
  }
  return { start: atIdx, filter: after.toLowerCase() };
}

export function reconcileComposerMentions(
  draft: string,
  cursor: number
): { slash: { start: number; filter: string } | null; at: { start: number; filter: string } | null } {
  const slash = parseSlashTrigger(draft, cursor);
  const at = parseAtTrigger(draft, cursor);
  if (slash && at) {
    if (at.start > slash.start) return { slash: null, at };
    return { slash, at: null };
  }
  return { slash, at };
}

function charIsAtMark(d: string, i: number): boolean {
  const c = d[i];
  return c === '@' || c === '＠';
}

function isValidAtTriggerPrefix(d: string, atIdx: number): boolean {
  if (!charIsAtMark(d, atIdx)) return false;
  if (atIdx > 0) {
    const prev = d[atIdx - 1]!;
    if (/\S/.test(prev) && /[a-zA-Z0-9_\u4e00-\u9fff]/.test(prev)) return false;
  }
  return true;
}

function findAtPathAtomRange(d: string, indexInPath: number): { start: number; end: number } | null {
  if (indexInPath < 0 || indexInPath >= d.length) return null;
  let j = indexInPath;
  while (j >= 0 && !charIsAtMark(d, j)) {
    const ch = d[j];
    if (ch === '\n' || ch === ' ' || ch === '\t' || ch === '\r') return null;
    j--;
  }
  if (j < 0 || !charIsAtMark(d, j) || !isValidAtTriggerPrefix(d, j)) return null;
  let end = j + 1;
  while (end < d.length) {
    const ch = d[end]!;
    if (ch === '\n' || ch === ' ' || ch === '\t' || ch === '\r' || charIsAtMark(d, end)) break;
    end++;
  }
  if (indexInPath >= j && indexInPath < end) return { start: j, end };
  return null;
}

function charIsSlashMark(d: string, i: number): boolean {
  return d[i] === '/' || d[i] === '／';
}

function isValidSlashTriggerPrefix(d: string, slashIdx: number): boolean {
  if (!charIsSlashMark(d, slashIdx)) return false;
  if (slashIdx > 0) {
    const prev = d[slashIdx - 1]!;
    if (/\S/.test(prev) && /[a-zA-Z0-9_\u4e00-\u9fff]/.test(prev)) return false;
  }
  return true;
}

function findSlashPrefixAtomRange(d: string, indexInPrefix: number): { start: number; end: number } | null {
  if (indexInPrefix < 0 || indexInPrefix >= d.length) return null;
  let j = indexInPrefix;
  while (j >= 0 && !charIsSlashMark(d, j)) {
    const ch = d[j];
    if (ch === '\n' || ch === ' ' || ch === '\t' || ch === '\r') return null;
    j--;
  }
  if (j < 0 || !charIsSlashMark(d, j) || !isValidSlashTriggerPrefix(d, j)) return null;
  let end = j + 1;
  while (end < d.length) {
    const ch = d[end]!;
    if (ch === '\n' || ch === ' ' || ch === '\t' || ch === '\r') break;
    end++;
  }
  if (indexInPrefix >= j && indexInPrefix < end) return { start: j, end };
  return null;
}

export function findComposerAtomicBackspaceRange(
  draft: string,
  deleteIndex: number
): { start: number; end: number } | null {
  const atR = findAtPathAtomRange(draft, deleteIndex);
  const slashR = findSlashPrefixAtomRange(draft, deleteIndex);
  if (atR && slashR) {
    if (atR.start <= slashR.start && atR.end >= slashR.end) return atR;
    if (slashR.start <= atR.start && slashR.end >= atR.end) return slashR;
    return atR.start <= slashR.start ? atR : slashR;
  }
  return atR ?? slashR;
}

export function findComposerAtomicForwardDeleteRange(
  draft: string,
  cursor: number
): { start: number; end: number } | null {
  const atR =
    charIsAtMark(draft, cursor) && isValidAtTriggerPrefix(draft, cursor)
      ? findAtPathAtomRange(draft, cursor)
      : null;
  if (atR && atR.start === cursor) return atR;
  const slashR =
    charIsSlashMark(draft, cursor) && isValidSlashTriggerPrefix(draft, cursor)
      ? findSlashPrefixAtomRange(draft, cursor)
      : null;
  if (slashR && slashR.start === cursor) return slashR;
  return null;
}
