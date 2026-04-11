/**
 * 将 PRD 生成结果拆成「文档标题 + 按 ## 1. / ## 2. 分节」的结构化视图。
 */
export interface IPrdSection {
  title: string;
  body: string;
}

export function parsePrdMarkdownSections(md: string): {
  docTitle: string | null;
  sections: IPrdSection[];
} {
  const trimmed = md.trim();
  if (!trimmed) {
    return { docTitle: null, sections: [] };
  }

  let docTitle: string | null = null;
  const h1Line = trimmed.split('\n').find((line) => line.trimStart().startsWith('# '));
  if (h1Line) {
    docTitle = h1Line.trim().replace(/^#\s+/, '').trim();
  }

  const re = /^##\s*(\d+)\.\s*(.+)$/gm;
  const hits: { index: number; label: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(trimmed)) !== null) {
    hits.push({ index: m.index, label: `${m[1]}. ${m[2].trim()}` });
  }

  if (hits.length === 0) {
    return {
      docTitle,
      sections: [{ title: '全文', body: trimmed }],
    };
  }

  const sections: IPrdSection[] = [];
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index;
    const end = i + 1 < hits.length ? hits[i + 1].index : trimmed.length;
    const block = trimmed.slice(start, end);
    const nl = block.indexOf('\n');
    const body = nl === -1 ? '' : block.slice(nl + 1).trim();
    sections.push({ title: hits[i].label, body });
  }

  return { docTitle, sections };
}

/** 将解析后的标题与分节拼回 Markdown，与 {@link parsePrdMarkdownSections} 对应 */
export function rebuildPrdMarkdown(docTitle: string | null, sections: IPrdSection[]): string {
  const parts: string[] = [];
  const title = docTitle?.trim();
  if (title) {
    parts.push(`# ${title}`);
  }
  for (const sec of sections) {
    const body = sec.body.trim();
    if (sec.title === '全文') {
      parts.push(body);
      continue;
    }
    parts.push(`## ${sec.title}`);
    parts.push(body);
  }
  return parts.join('\n\n').trim();
}
