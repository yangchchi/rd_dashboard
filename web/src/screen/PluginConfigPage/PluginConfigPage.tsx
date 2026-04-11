'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Puzzle, Search, Sparkles } from 'lucide-react';
import type { IAiSkillConfig } from '@/lib/ai-skill-engine';
import { getAiSkill, listAiSkills, resetAiSkill, updateAiSkill } from '@/lib/ai-skills';

/** 插件（Skill）配置：大模型 + 提示词，用于研发流程中的各类 AI 任务（与组织级代码规范 Org Spec 无关） */
const PluginConfigPage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [skills, setSkills] = useState<IAiSkillConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<IAiSkillConfig>>({});

  const reload = useCallback(() => {
    const list = listAiSkills();
    setSkills(list);
    setSelectedId((prev) => {
      if (prev && list.some((s) => s.id === prev)) return prev;
      return list[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!selectedId) {
      setDraft({});
      return;
    }
    try {
      setDraft(getAiSkill(selectedId));
    } catch {
      setDraft({});
    }
  }, [selectedId, skills]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)),
    );
  }, [skills, query]);

  const selected = selectedId ? skills.find((s) => s.id === selectedId) : undefined;

  const handleSave = () => {
    if (!selectedId || !draft.model || !draft.promptTemplate) {
      toast.error('请填写模型与提示词');
      return;
    }
    try {
      updateAiSkill(selectedId, {
        name: draft.name || '未命名插件',
        description: draft.description,
        model: draft.model,
        stream: draft.stream ?? true,
        promptTemplate: draft.promptTemplate,
        endpoint: draft.endpoint || undefined,
        tools: draft.tools,
      });
      toast.success('插件配置已保存');
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    }
  };

  const handleResetOne = () => {
    if (!selectedId) return;
    try {
      resetAiSkill(selectedId);
      toast.success('已恢复该插件的默认配置');
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '恢复失败');
    }
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-6">
      <section className="w-full flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 rd-page-title">
            <Puzzle className="size-7 text-primary" />
            插件配置（Skill）
          </h1>
          <p className="rd-page-desc mt-1">
            配置调用大模型与提示词，支撑 PRD 生成、规格草稿、需求分类、验收分析等研发任务；不包含组织级代码规范（请使用「组织规格」菜单）。
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,280px)_1fr] gap-6">
        <Card className="lg:max-h-[calc(100vh-12rem)] flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">插件</CardTitle>
            <CardDescription>选择要编辑的能力</CardDescription>
            <div className="relative pt-2">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="搜索名称或 ID…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-0 px-6 pb-4">
            <ScrollArea className="h-[min(520px,calc(100vh-16rem))] pr-3">
              <div className="space-y-1">
                {filtered.map((s) => {
                  const active = s.id === selectedId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm backdrop-blur-sm transition-colors ${
                        active
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-white/[0.08] bg-card/60 text-foreground hover:border-white/[0.12] hover:bg-card/80'
                      }`}
                    >
                      <div className="font-medium line-clamp-2">{s.name}</div>
                      <div className="text-xs text-muted-foreground font-mono truncate mt-0.5">{s.id}</div>
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground py-6 text-center">无匹配插件</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="size-5 shrink-0 text-primary" />
                  <span className="truncate">{draft.name || selected?.name || '请选择左侧插件'}</span>
                </CardTitle>
                {draft.description && (
                  <CardDescription className="mt-2">{draft.description}</CardDescription>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={handleResetOne} disabled={!selectedId}>
                  恢复默认
                </Button>
                <Button size="sm" onClick={handleSave} disabled={!selectedId}>
                  保存
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!selectedId ? (
              <p className="text-sm text-muted-foreground">请从左侧选择一个插件。</p>
            ) : (
              <Tabs defaultValue="detail" className="w-full">
                <TabsList className="grid w-full max-w-md grid-cols-3">
                  <TabsTrigger value="detail">详情</TabsTrigger>
                  <TabsTrigger value="debug">调试</TabsTrigger>
                  <TabsTrigger value="logs">运行日志</TabsTrigger>
                </TabsList>
                <TabsContent value="detail" className="mt-4 space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="plugin-name">显示名称</Label>
                    <Input
                      id="plugin-name"
                      value={draft.name ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plugin-desc">描述（可选）</Label>
                    <Input
                      id="plugin-desc"
                      value={draft.description ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                      placeholder="简要说明插件用途"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plugin-model">模型</Label>
                    <Input
                      id="plugin-model"
                      className="font-mono text-sm"
                      value={draft.model ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
                      placeholder="例如 deepseek-v3-2-251201"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plugin-endpoint">API Endpoint（可选，默认使用 Ark Responses）</Label>
                    <Input
                      id="plugin-endpoint"
                      className="font-mono text-xs"
                      value={draft.endpoint ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, endpoint: e.target.value || undefined }))}
                      placeholder="留空则使用默认方舟端点"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="plugin-stream"
                      checked={draft.stream !== false}
                      onCheckedChange={(v) => setDraft((d) => ({ ...d, stream: v === true }))}
                    />
                    <Label htmlFor="plugin-stream" className="font-normal cursor-pointer">
                      流式输出（stream）
                    </Label>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plugin-prompt">提示词模板</Label>
                    <p className="text-xs text-muted-foreground">
                      使用 {'{{变量名}}'} 占位符；各业务页面传入变量（如 PRD 生成中的 title、description 等）。
                    </p>
                    <Textarea
                      id="plugin-prompt"
                      value={draft.promptTemplate ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, promptTemplate: e.target.value }))}
                      className="min-h-[280px] font-mono text-sm"
                    />
                  </div>
                </TabsContent>
                <TabsContent value="debug" className="mt-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    调试请在对应业务页面触发本插件（例如：在「PRD管理」中选择需求并点击生成 PRD，将使用此处保存的模型与提示词）。
                    若需单独联调 API，可在浏览器开发者工具中观察网络请求。
                  </p>
                </TabsContent>
                <TabsContent value="logs" className="mt-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    运行日志由业务侧与网关记录；本页为本地提示词与模型配置，不展示历史调用日志。可在「AI开发监控」等页面查看任务级信息。
                  </p>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default PluginConfigPage;
