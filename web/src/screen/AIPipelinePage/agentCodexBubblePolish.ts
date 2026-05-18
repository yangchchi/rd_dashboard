/** 与 rd.service Codex 后缀逻辑对齐 */
export const CODEX_CHAT_ONLY_MARKER = '【本轮为简短问答，非编码任务】';

export function stripAnsiFromText(text: string): string {
  return text
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][0-9;]*\x07/g, '')
    .replace(/\x1b\][\s\S]*?\x1b\\/g, '');
}

function splitAssistantBubbleBodyAndExitFooter(body: string): { main: string; footer: string } {
  const marker = '\n\n---\nexit=';
  const idx = body.lastIndexOf(marker);
  if (idx === -1) return { main: body, footer: '' };
  return { main: body.slice(0, idx), footer: body.slice(idx) };
}

function normalizeForDedupe(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/[.。!！?？,，;；:：]+$/g, '')
    .trim()
    .toLowerCase();
}

/** 单行是否为 Codex CLI 横幅 / 元数据 / 状态噪音 */
export function isCodexCliNoiseLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^(?:SUCCESS|FAILED|FAILURE|RUNNING|CANCELLED)$/i.test(t)) return true;
  if (/^Reading additional input/i.test(t)) return true;
  if (/^openai codex v[\d.]+/i.test(t)) return true;
  if (/^(?:working directory|workdir|cwd)\s*:/i.test(t)) return true;
  if (/^(?:tokens used|token usage)\b/i.test(t)) return true;
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?\s+(?:ERROR|WARN|INFO|DEBUG)\b/i.test(t)) return true;
  if (/^ERROR\s+codex_/i.test(t)) return true;
  if (/^Phase \d+\s+no changes\b/i.test(t)) return true;
  if (/^(?:[─━═\-_.]){3,}\s*$/.test(t)) return true;
  if (/^\/tmp\/rd-agent/i.test(t)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return true;
  if (/^session\s*id\s*:/i.test(t)) return true;
  if (/^\d{1,3}(?:,\d{3})+$/.test(t)) return true;
  if (/^\d{4,}$/.test(t)) return true;
  /** Codex TUI 角色分隔：user / codex / assistant / ... */
  if (/^(?:user|codex|assistant|system)$/i.test(t)) return true;
  if (/^\.\.\.$/.test(t)) return true;
  if (
    /\bmodel\s*:/i.test(t) &&
    /\b(?:provider|sandbox|approval)\s*:/i.test(t) &&
    t.length > 80
  ) {
    return true;
  }
  if (/\bsession\s*id\s*:/i.test(t) && /\bmodel\s*:/i.test(t)) return true;
  if (/^【/.test(t) && /(?:非编码|非编程|简短问答|系统执行|环境】|回复要求|回复约束)/.test(t)) {
    return true;
  }
  if (/^【环境】/.test(t)) return true;
  if (/^【回复/.test(t)) return true;
  if (/^用户：/.test(t)) return true;
  if (/^请用/.test(t) && /(?:简短|简要)?中文/.test(t)) return true;
  if (/^不要/.test(t) && /(?:复述|粘贴|Plan|系统|上文)/.test(t)) return true;
  if (/^禁止/.test(t)) return true;
  if (/^当前在 RD Agent/.test(t)) return true;
  if (/^你必须在本仓库/.test(t)) return true;
  if (/^规格与 PRD 位于/.test(t)) return true;
  return false;
}

/** 是否像 Codex 给用户的最终回答（含中文或较长英文说明） */
function isSubstantiveAnswerLine(line: string): boolean {
  const t = line.trim();
  if (!t || isCodexCliNoiseLine(t)) return false;
  if (/[\u4e00-\u9fff]/.test(t) && t.length >= 8) return true;
  if (/^[A-Za-z]/.test(t) && t.length >= 24) return true;
  return false;
}

function stripNoiseLinesFromText(text: string): string {
  const lines = text.split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    if (isCodexCliNoiseLine(line)) continue;
    kept.push(line);
  }
  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stripLeadingCodexCliChromeLinesFromText(text: string): string {
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const t = lines[i]!;
    if (t.trim() === '' || isCodexCliNoiseLine(t)) {
      i++;
      continue;
    }
    if (/^model:/i.test(t.trim())) {
      i++;
      continue;
    }
    if (/^provider:/i.test(t.trim())) {
      i++;
      continue;
    }
    if (/^approval:/i.test(t.trim())) {
      i++;
      continue;
    }
    if (/^sandbox:/i.test(t.trim())) {
      i++;
      continue;
    }
    if (/^reasoning\b/i.test(t.trim())) {
      i++;
      continue;
    }
    if (/^using\b/i.test(t.trim())) {
      i++;
      continue;
    }
    if (/^api\b/i.test(t.trim()) && /(key|base)/i.test(t)) {
      i++;
      continue;
    }
    break;
  }
  return stripNoiseLinesFromText(lines.slice(i).join('\n'));
}

export function stripLeadingChatOnlyPromptEchoLines(text: string): string {
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const t = lines[i]!.trim();
    if (t === '' || isCodexCliNoiseLine(t)) {
      i++;
      continue;
    }
    if (/^user\s/i.test(t) && (/简短问答|非编码|非编程|【本轮/.test(t))) {
      i++;
      continue;
    }
    if (/^---+\s*$/.test(t)) {
      i++;
      continue;
    }
    if (/^(?:你)?(?:当前)?是什么\s*Agent/i.test(t) || /^用的是什么模型/i.test(t)) {
      i++;
      continue;
    }
    if (/^你是什么\s*Agent/i.test(t)) {
      i++;
      continue;
    }
    break;
  }
  return lines.slice(i).join('\n').replace(/^\n+/, '');
}

function dedupeConsecutiveLines(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let prevNorm = '';
  for (const line of lines) {
    const norm = normalizeForDedupe(line);
    if (!norm) {
      out.push(line);
      prevNorm = '';
      continue;
    }
    if (norm === prevNorm) continue;
    out.push(line);
    prevNorm = norm;
  }
  return out.join('\n');
}

/**
 * 从已去噪文本中提取「唯一 substantive 回答行」。
 * Codex CLI 常在 token 行后重复贴一遍相同中文，且带 user/codex 角色行。
 */
export function extractCodexDisplayAnswer(text: string): string {
  const lines = text.split('\n');
  const seen = new Set<string>();
  const answers: string[] = [];
  for (const line of lines) {
    if (!isSubstantiveAnswerLine(line)) continue;
    const norm = normalizeForDedupe(line);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    answers.push(line.trim());
  }
  if (answers.length > 0) return answers.join('\n\n');
  return stripNoiseLinesFromText(text);
}

export function detectCodexChatOnlyRound(content: string): boolean {
  if (content.includes(CODEX_CHAT_ONLY_MARKER) || /【本轮为简短问答/.test(content)) return true;
  /** Codex TUI 短问答复：含 user/codex 角色行且提取后内容较短 */
  if (/(?:^|\n)(?:user|codex)\s*$/im.test(content)) {
    const substantive = extractCodexDisplayAnswer(stripNoiseLinesFromText(content));
    return substantive.length > 0 && substantive.length < 800;
  }
  return false;
}

/** 展示用：始终走完整清洗（含 TUI 角色行、token 复读） */
export function polishCodexBubbleForUi(raw: string): string {
  const chatOnly = detectCodexChatOnlyRound(raw);
  return polishCodexAssistantBubbleDisplay(raw, { chatOnlyStripEcho: chatOnly });
}

export function polishCodexAssistantBubbleDisplay(
  body: string,
  opts: { chatOnlyStripEcho: boolean },
): string {
  if (/(?:^|\n)【(?:错误|异常|已取消)】/.test(body)) {
    return stripLeadingCodexCliChromeLinesFromText(stripAnsiFromText(body)).trimEnd();
  }
  const { main, footer } = splitAssistantBubbleBodyAndExitFooter(body);
  let m = stripAnsiFromText(main);
  m = stripLeadingCodexCliChromeLinesFromText(m);
  if (opts.chatOnlyStripEcho) {
    m = stripLeadingChatOnlyPromptEchoLines(m);
  }
  m = stripNoiseLinesFromText(m);
  m = dedupeConsecutiveLines(m);
  m = extractCodexDisplayAnswer(m);
  m = m.trimEnd();
  const out = (m || extractCodexDisplayAnswer(stripNoiseLinesFromText(main.trim()))) + footer;
  return out.trimEnd();
}

/** 用于卡片标题与正文：取清洗后的首条有效回答 */
export function deriveCodexAnswerHeadline(polished: string, maxLen = 72): string {
  const body = polished.replace(/\n\n---\nexit=[\s\S]*$/m, '').trim();
  const line =
    body
      .split(/\n/)
      .map((l) => l.trim())
      .find((l) => isSubstantiveAnswerLine(l)) ?? '';
  const t = line.replace(/\s+/g, ' ').trim();
  if (!t) return '本轮输出';
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

export function stripLeadingLineIfMatchesTitle(full: string, title: string): string {
  const raw = full.replace(/\n\n---\nexit=[\s\S]*$/m, '').trimStart();
  const t = normalizeForDedupe(title);
  const kept: string[] = [];
  for (const line of raw.split('\n')) {
    const n = normalizeForDedupe(line);
    if (!n) {
      kept.push(line);
      continue;
    }
    if (n === t) continue;
    kept.push(line);
  }
  return kept.join('\n').trim();
}

export function isCodexShortChatAnswer(polished: string): boolean {
  const body = polished.replace(/\n\n---\nexit=[\s\S]*$/m, '').trim();
  return body.length > 0 && body.length < 600;
}
