'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Copy, Loader2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Streamdown } from '@/components/ui/streamdown';
import { capabilityClient } from '@/lib/capability-client';
import { rdApi } from '@/lib/rd-api';
import type { IPrd, IProductBaseline, IRequirement } from '@/lib/rd-types';
import { isBrownfieldChangeType } from '@/lib/rd-types';

function extractMarkdownSection(md: string, heading: string): string {
  const re = new RegExp(`##\\s*${heading}[\\s\\S]*?(?=\\n##\\s|$)`, 'i');
  return md.match(re)?.[0]?.trim() ?? '';
}

function buildVerificationItems(prd: IPrd | null, prdBackground: string): string[] {
  const fromFeatures = (prd?.featureList ?? []).flatMap((f) =>
    (f.acceptanceCriteria ?? []).filter(Boolean).map((c) => `${f.name}: ${c}`),
  );
  const changeBlock = extractMarkdownSection(prdBackground, '本次变更');
  const bullets = changeBlock
    .split('\n')
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .filter((l) => l.length > 2 && !l.startsWith('#'));
  const merged = [...fromFeatures, ...bullets.slice(0, 12)];
  if (merged.length === 0) {
    return ['核心增量功能已实现', '存量能力未被误改', '影响面内回归通过'];
  }
  return [...new Set(merged)].slice(0, 15);
}

export interface IBrownfieldAcceptancePanelProps {
  requirement: IRequirement;
  prd: IPrd | null;
}

export const BrownfieldAcceptancePanel: React.FC<IBrownfieldAcceptancePanelProps> = ({
  requirement,
  prd,
}) => {
  const [baseline, setBaseline] = useState<IProductBaseline | null>(null);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [changeSummary, setChangeSummary] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState(false);

  const prdBackground = (prd?.background ?? '').trim();
  const deltaSections = useMemo(
    () => ({
      baselineRef: extractMarkdownSection(prdBackground, '基线引用'),
      changes: extractMarkdownSection(prdBackground, '本次变更'),
      untouched: extractMarkdownSection(prdBackground, '不变更声明'),
      impact: extractMarkdownSection(prdBackground, '影响面'),
    }),
    [prdBackground],
  );

  const verificationItems = useMemo(
    () => buildVerificationItems(prd, prdBackground),
    [prd, prdBackground],
  );

  useEffect(() => {
    const init: Record<string, boolean> = {};
    verificationItems.forEach((item, i) => {
      init[String(i)] = false;
    });
    setChecked(init);
  }, [verificationItems]);

  useEffect(() => {
    if (!requirement.productId || !requirement.baselineId) return;
    setLoading(true);
    void rdApi
      .getProductBaseline(requirement.productId, requirement.baselineId)
      .then(setBaseline)
      .catch(() => setBaseline(null))
      .finally(() => setLoading(false));
  }, [requirement.productId, requirement.baselineId]);

  const generateChangeSummary = useCallback(async () => {
    setGeneratingSummary(true);
    setChangeSummary('');
    try {
      const baselineCaps = (baseline?.capabilities ?? [])
        .map((c) => `- ${c.domain}/${c.name}: ${c.description || ''}`)
        .join('\n');
      const payload = [
        `需求：${requirement.title}`,
        `变更类型：${requirement.changeType}`,
        baseline
          ? `产品基线 ${baseline.version}（${baseline.gitRef}）能力：\n${baselineCaps || baseline.asBuiltMarkdown?.slice(0, 2000) || '（无）'}`
          : '',
        prdBackground
          ? `本次 PRD Delta：\n${prdBackground.slice(0, 8000)}`
          : '（无 PRD Delta 正文）',
        `验收核对项：\n${verificationItems.map((v, i) => `${checked[String(i)] ? '[x]' : '[ ]'} ${v}`).join('\n')}`,
        '请用中文输出一段「相对原基线的交付变更摘要」（200字内），说明做了什么、未改什么、建议回归范围。',
      ]
        .filter(Boolean)
        .join('\n\n');

      const stream = capabilityClient
        .load('acceptance_feedback_analyzer_1')
        .callStream('textSummary', { acceptance_feedback: payload });
      let full = '';
      for await (const chunk of stream) {
        const typed = chunk as { summary?: string };
        if (typed.summary) full += typed.summary;
      }
      setChangeSummary(full);
    } catch {
      toast.error('变更摘要生成失败');
    } finally {
      setGeneratingSummary(false);
    }
  }, [baseline, requirement, prdBackground, verificationItems, checked]);

  const copySummary = async () => {
    if (!changeSummary.trim()) {
      toast.error('请先生成变更摘要');
      return;
    }
    try {
      await navigator.clipboard.writeText(changeSummary.trim());
      toast.success('已复制到剪贴板');
    } catch {
      toast.error('复制失败');
    }
  };

  if (!isBrownfieldChangeType(requirement.changeType ?? 'greenfield')) {
    return null;
  }

  return (
    <Card className="overflow-hidden rounded-[22px] border-0 bg-[#f5eff7] shadow-none dark:bg-muted">
      <CardHeader className="border-b border-[#e8def8]/70 px-4 py-3 dark:border-border/25">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-indigo-600" />
          Brownfield 验收对比（基线 vs 本次交付）
        </CardTitle>
        {baseline ? (
          <p className="text-xs text-muted-foreground">
            基线 {baseline.version} ·{' '}
            <span className="font-mono">{baseline.gitRef.slice(0, 10)}</span>
            {requirement.productId ? (
              <>
                {' '}
                ·{' '}
                <Link href={`/products/${requirement.productId}`} className="text-primary hover:underline">
                  产品 Hub
                </Link>
              </>
            ) : null}
          </p>
        ) : loading ? (
          <p className="text-xs text-muted-foreground">加载基线中…</p>
        ) : (
          <p className="text-xs text-amber-700">未加载到产品基线</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-3 lg:grid-cols-3">
          <CompareColumn title="基线能力（原杯子）">
            {loading ? (
              <p className="text-xs text-muted-foreground">加载中…</p>
            ) : (baseline?.capabilities ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                {baseline?.asBuiltMarkdown?.trim() || '暂无结构化能力，见 As-Built 备注'}
              </p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {(baseline?.capabilities ?? []).map((c) => (
                  <li key={c.id} className="rounded-[14px] bg-[#f5eff7] px-3 py-2 dark:bg-muted">
                    <span className="font-medium">{c.domain ? `${c.domain}/` : ''}{c.name}</span>
                    {c.description ? (
                      <p className="mt-0.5 text-muted-foreground line-clamp-2">{c.description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CompareColumn>
          <CompareColumn title="本次 PRD 变更（Delta）">
            {prd ? (
              <ScrollArea className="h-48 pr-2">
                <div className="space-y-2 text-xs prose prose-sm max-w-none dark:prose-invert">
                  {deltaSections.changes ? (
                    <Streamdown>{deltaSections.changes}</Streamdown>
                  ) : prdBackground ? (
                    <Streamdown>{prdBackground.slice(0, 4000)}</Streamdown>
                  ) : (
                    <p className="text-muted-foreground">PRD 正文为空</p>
                  )}
                  {deltaSections.impact ? (
                    <>
                      <p className="font-medium text-foreground mt-2">影响面</p>
                      <Streamdown>{deltaSections.impact}</Streamdown>
                    </>
                  ) : null}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-xs text-muted-foreground">未关联 PRD</p>
            )}
          </CompareColumn>
          <CompareColumn title="交付验证勾选">
            <ul className="space-y-2">
              {verificationItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <Checkbox
                    id={`verify-${requirement.id}-${i}`}
                    checked={Boolean(checked[String(i)])}
                    onCheckedChange={(v) =>
                      setChecked((prev) => ({ ...prev, [String(i)]: Boolean(v) }))
                    }
                  />
                  <Label htmlFor={`verify-${requirement.id}-${i}`} className="font-normal leading-snug">
                    {item}
                  </Label>
                </li>
              ))}
            </ul>
          </CompareColumn>
        </div>

        {deltaSections.untouched ? (
          <div className="rounded-[18px] bg-[#fffbff] px-4 py-3 text-xs dark:bg-card/90">
            <p className="font-medium mb-1">不变更声明</p>
            <p className="text-muted-foreground whitespace-pre-wrap line-clamp-4">
              {deltaSections.untouched.replace(/^##\s*不变更声明\s*/i, '')}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 rounded-[16px] border-0 bg-[#fffbff] text-xs shadow-none hover:bg-[#fff7ff] dark:bg-card/90"
            disabled={generatingSummary}
            onClick={() => void generateChangeSummary()}
          >
            {generatingSummary ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3.5 w-3.5" />
            )}
            生成变更摘要
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 rounded-[16px] text-xs shadow-none hover:bg-[#fffbff] dark:hover:bg-card/90"
            disabled={!changeSummary.trim()}
            onClick={() => void copySummary()}
          >
            <Copy className="mr-1 h-3.5 w-3.5" />
            复制摘要
          </Button>
        </div>
        {changeSummary ? (
          <div className="rounded-[18px] bg-[#fffbff] p-4 text-sm dark:bg-card/90">
            <Streamdown>{changeSummary}</Streamdown>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

function CompareColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-[12rem] rounded-[18px] bg-[#fffbff] p-3 dark:bg-card/90">
      <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
      {children}
    </div>
  );
}

/** 从 PRD 与基线合并出下一版基线能力草案（验收通过回写） */
export function buildMergedBaselineCapabilities(
  baseline: IProductBaseline | null,
  prd: IPrd | null,
): { domain: string; name: string; description: string }[] {
  const existing = (baseline?.capabilities ?? []).map((c) => ({
    domain: c.domain || '默认',
    name: c.name,
    description: c.description || '',
  }));
  const fromFeatures = (prd?.featureList ?? []).map((f) => ({
    domain: '本次交付',
    name: f.name,
    description: f.description || (f.acceptanceCriteria ?? []).join('；'),
  }));
  const seen = new Set(existing.map((c) => `${c.domain}|${c.name}`));
  const added = fromFeatures.filter((c) => {
    const k = `${c.domain}|${c.name}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return [...existing, ...added];
}
