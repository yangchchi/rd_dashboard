import { formatPrdListTitle } from './prd-display-title';
import type { IPrd, IProduct, IRequirement, ISpecification } from './rd-types';

/** Spec 列表页展示用结构（由完整规格推导） */
export interface ISpecListRow {
  id: string;
  prdId: string;
  prdTitle: string;
  requirementId?: string;
  /** FS Markdown 元素计数 */
  functionalSpec: {
    userStories: number;
    pageDesigns: number;
    rules: number;
  };
  /** TS Markdown 元素计数 */
  technicalSpec: {
    tables: number;
    apis: number;
  };
  /** CP Markdown 元素计数 */
  cpSpec: {
    tasks: number;
  };
  machineReadableJson: boolean;
  fsMarkdownPresent: boolean;
  tsMarkdownPresent: boolean;
  cpMarkdownPresent: boolean;
  status: ISpecification['status'];
  updatedAt: string;
  reviews?: ISpecification['reviews'];
}

function extractMarkdownSection(md: string, headingRe: RegExp): string {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => headingRe.test(l));
  if (start < 0) return '';
  const level = (lines[start].match(/^(#+)/) ?? ['##'])[1].length;
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

function countBullets(section: string): number {
  return (section.match(/^[-*]\s+.+$/gm) ?? []).length;
}

function countFsMetrics(fsMarkdown: string | undefined): ISpecListRow['functionalSpec'] {
  const fs = (fsMarkdown ?? '').trim();
  if (!fs) return { userStories: 0, pageDesigns: 0, rules: 0 };

  const roleSec = extractMarkdownSection(fs, /^##\s*2\.?\s*角色与场景/i);
  const storySec = extractMarkdownSection(fs, /^##\s*.*(?:用户故事|User\s*Story|故事)/i);
  const userStoryNarratives = fs.match(/^.*作为.+?(?:我?想要|我希望).+/gm) ?? [];
  const userStories = Math.max(
    countBullets(roleSec) + countBullets(storySec),
    userStoryNarratives.length,
    (roleSec.match(/^###\s+/gm) ?? []).length + (storySec.match(/^###\s+/gm) ?? []).length
  );

  const pageSec = extractMarkdownSection(fs, /^##\s*.*(?:页面设计|页面|UI设计|界面设计|原型)/i);
  const featureSec = extractMarkdownSection(fs, /^##\s*3\.?\s*功能/i);
  const featurePoints = (featureSec.match(/^###\s+功能点/gim) ?? []).length;
  const pageHeadings = (fs.match(/^###\s+.*(?:页面|Page|界面|原型|设计)/gim) ?? []).length;
  const pageDesigns = Math.max(
    countBullets(pageSec),
    featurePoints,
    pageHeadings,
    (featureSec.match(/^###\s+/gm) ?? []).length
  );

  const ruleSec = extractMarkdownSection(fs, /^##\s*4\.?\s*规则/i);
  const ruleBullets = countBullets(ruleSec);
  const inlineRules = (fs.match(/^[-*]\s+规则\s*[:：]/gim) ?? []).length;
  const ifThenRules = (fs.match(/\bif\b.+\bthen\b/gi) ?? []).length;
  const rules = Math.max(ruleBullets, inlineRules, ifThenRules);

  return { userStories, pageDesigns, rules };
}

function countTsMetrics(tsMarkdown: string | undefined): ISpecListRow['technicalSpec'] {
  const ts = (tsMarkdown ?? '').trim();
  if (!ts) return { tables: 0, apis: 0 };

  const modelSec = extractMarkdownSection(ts, /^##\s*2\.?\s*数据模型/i);
  const tableSec = extractMarkdownSection(ts, /^##\s*.*(?:数据表|表结构)/i);
  const apiSec = extractMarkdownSection(ts, /^##\s*3\.?\s*API/i);

  const tableBullets = (modelSec.match(/^[-*]\s+.*(?:表|table|Table)/gim) ?? []).length;
  const createTables = (ts.match(/CREATE\s+TABLE/gi) ?? []).length;
  const modelBullets = countBullets(modelSec);
  const tables = Math.max(tableBullets, createTables, countBullets(tableSec), modelBullets);

  const apiBullets = countBullets(apiSec);
  const pathLines =
    apiSec.match(
      /(?:^|\n)\s*(?:[-*]\s+)?(?:(?:GET|POST|PUT|PATCH|DELETE)\s+[`'"]?\/|路径\s*[:：])/gim
    ) ?? [];
  const apis = Math.max(apiBullets, pathLines.length);

  return { tables, apis };
}

function countCpTasks(cpMarkdown: string | undefined): ISpecListRow['cpSpec'] {
  const cp = (cpMarkdown ?? '').trim();
  if (!cp) return { tasks: 0 };

  const taskHeadings = cp.match(/^###\s+Task\s+/gim) ?? [];
  if (taskHeadings.length > 0) return { tasks: taskHeadings.length };

  const checkboxes = cp.match(/^-\s+\[[ xX]\]\s+/gm) ?? [];
  if (checkboxes.length > 0) return { tasks: checkboxes.length };

  return { tasks: 0 };
}

export function specificationToListRow(
  spec: ISpecification,
  prdTitle: string,
  requirementId?: string
): ISpecListRow {
  return {
    id: spec.id,
    prdId: spec.prdId,
    prdTitle,
    requirementId,
    functionalSpec: countFsMetrics(spec.fsMarkdown),
    technicalSpec: countTsMetrics(spec.tsMarkdown),
    cpSpec: countCpTasks(spec.cpMarkdown),
    machineReadableJson: Boolean(spec.machineReadableJson?.trim()),
    fsMarkdownPresent: Boolean(spec.fsMarkdown?.trim()),
    tsMarkdownPresent: Boolean(spec.tsMarkdown?.trim()),
    cpMarkdownPresent: Boolean(spec.cpMarkdown?.trim()),
    status: spec.status,
    updatedAt: spec.updatedAt,
    reviews: spec.reviews,
  };
}

export function mapSpecsToListRows(
  specs: ISpecification[],
  prds: IPrd[],
  requirements: IRequirement[],
  products: IProduct[]
): ISpecListRow[] {
  const byPrd = (pid: string) => prds.find((p) => p.id === pid);
  const reqById = (rid: string | undefined) =>
    rid ? requirements.find((r) => r.id === rid) : undefined;
  return specs.map((s) => {
    const prd = byPrd(s.prdId);
    const req = reqById(prd?.requirementId);
    const prdTitle =
      formatPrdListTitle(req, products, prd?.title ?? null) || prd?.title || prd?.id || '—';
    return specificationToListRow(s, prdTitle, prd?.requirementId);
  });
}

/** 有 Markdown 正文但元素计数为 0 时视为 100%，否则有元素也为 100%（仅统计存量） */
export function specPhaseProgressPercent(
  countSum: number,
  markdownPresent: boolean
): number {
  if (countSum > 0 || markdownPresent) return 100;
  return 0;
}
