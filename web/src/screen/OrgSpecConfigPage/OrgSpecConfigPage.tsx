'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { IOrgLanguageSpec, IOrganizationSpecConfig, OrgSpecLanguage } from '@/lib/mock-data-store';
import { createDefaultOrgSpecConfig } from '@/lib/org-spec-defaults';
import { useOrgSpecConfig, useSaveOrgSpecConfig } from '@/lib/rd-hooks';

/** 组织级编码规范（Org Spec），用于约束 AI 生成代码时遵循的技术与工程要求 */
const OrgSpecConfigPage: React.FC = () => {
  const { data: loadedOrg } = useOrgSpecConfig();
  const saveOrg = useSaveOrgSpecConfig();

  const [config, setConfig] = useState<IOrganizationSpecConfig | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<OrgSpecLanguage>('typescript');
  const [orgName, setOrgName] = useState('');

  const selectedSpec = useMemo(() => {
    if (!config) return null;
    return config.languages[selectedLanguage] || null;
  }, [config, selectedLanguage]);

  useEffect(() => {
    if (loadedOrg) {
      setConfig(loadedOrg as IOrganizationSpecConfig);
      setOrgName((loadedOrg as IOrganizationSpecConfig).orgName);
      setSelectedLanguage((loadedOrg as IOrganizationSpecConfig).defaultLanguage);
    } else {
      const def = createDefaultOrgSpecConfig();
      setConfig(def);
      setOrgName(def.orgName);
      setSelectedLanguage(def.defaultLanguage);
    }
  }, [loadedOrg]);

  const updateSelectedSpec = (updater: (spec: IOrgLanguageSpec) => IOrgLanguageSpec) => {
    if (!config || !selectedSpec) return;
    setConfig({
      ...config,
      languages: {
        ...config.languages,
        [selectedLanguage]: updater(selectedSpec),
      },
    });
  };

  const updateListField = (field: keyof Pick<IOrgLanguageSpec, 'styleGuide' | 'mustFollow' | 'forbidden' | 'toolchain' | 'testing'>, value: string) => {
    const items = value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    updateSelectedSpec((spec) => ({ ...spec, [field]: items }));
  };

  const joinList = (items: string[]) => items.join('\n');

  const handleSave = () => {
    if (!config) return;
    if (!orgName.trim()) {
      toast.error('组织名称不能为空');
      return;
    }
    void saveOrg
      .mutateAsync({
        ...config,
        orgName: orgName.trim(),
        updatedAt: new Date().toISOString(),
      })
      .then(() => toast.success('组织级规格配置已保存'));
  };

  const handleReset = () => {
    const def = createDefaultOrgSpecConfig();
    void saveOrg.mutateAsync(def).then(() => {
      setConfig(def);
      setOrgName(def.orgName);
      setSelectedLanguage(def.defaultLanguage);
      toast.success('已恢复默认语言规范');
    });
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-6">
      <section className="w-full flex items-center justify-between">
        <div>
          <h1 className="rd-page-title">组织规格配置（Org Spec）</h1>
          <p className="rd-page-desc mt-1">
            统一组织内多语言编码规范与技术约束，供 AI 生成代码、规格校验时引用（与「插件配置」中的大模型任务相互独立）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleReset}>恢复默认模板</Button>
        </div>
      </section>

      <section className="w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>语言列表</CardTitle>
            <CardDescription>初始化主流语言规范，可按组织要求二次调整</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
              {(config ? Object.values(config.languages) : []).map((item) => {
                const active = item.language === selectedLanguage;
                return (
                  <button
                    key={item.language}
                    type="button"
                    onClick={() => setSelectedLanguage(item.language)}
                    className={`w-full rounded-lg border px-3 py-2 text-left backdrop-blur-sm transition-colors ${
                      active
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-white/[0.08] bg-card/60 text-foreground hover:border-white/[0.12] hover:bg-card/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{item.displayName}</p>
                      <Badge variant={item.enabled ? 'default' : 'outline'}>{item.enabled ? '启用' : '停用'}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{item.language}</p>
                  </button>
                );
              })}
            </div>

            {config && (
              <div className="space-y-2 pt-2">
                <div className="space-y-2">
                  <Label>组织名称</Label>
                  <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="请输入组织名称" />
                </div>
                <div className="space-y-2">
                  <Label>默认语言</Label>
                  <select
                    className="w-full p-2 border rounded-md bg-card"
                    value={config.defaultLanguage}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        defaultLanguage: e.target.value as OrgSpecLanguage,
                      })
                    }
                  >
                    {Object.values(config.languages).map((item) => (
                      <option key={item.language} value={item.language}>
                        {item.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>配置详情</CardTitle>
            <CardDescription>每行一条规则，保存后将用于规格文档生成与约束输出</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!selectedSpec ? null : (
              <>
                <div className="rd-surface-inset flex items-center justify-between p-3">
                  <div>
                    <p className="text-sm font-medium">{selectedSpec.displayName}</p>
                    <p className="text-xs text-muted-foreground">语言标识：{selectedSpec.language}</p>
                  </div>
                  <Button
                    variant={selectedSpec.enabled ? 'outline' : 'default'}
                    onClick={() => updateSelectedSpec((spec) => ({ ...spec, enabled: !spec.enabled }))}
                  >
                    {selectedSpec.enabled ? '设为停用' : '设为启用'}
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>编码风格（styleGuide）</Label>
                  <Textarea
                    value={joinList(selectedSpec.styleGuide)}
                    onChange={(e) => updateListField('styleGuide', e.target.value)}
                    className="min-h-[120px] font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label>必须遵循（mustFollow）</Label>
                  <Textarea
                    value={joinList(selectedSpec.mustFollow)}
                    onChange={(e) => updateListField('mustFollow', e.target.value)}
                    className="min-h-[120px] font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label>禁止项（forbidden）</Label>
                  <Textarea
                    value={joinList(selectedSpec.forbidden)}
                    onChange={(e) => updateListField('forbidden', e.target.value)}
                    className="min-h-[120px] font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label>工具链（toolchain）</Label>
                  <Textarea
                    value={joinList(selectedSpec.toolchain)}
                    onChange={(e) => updateListField('toolchain', e.target.value)}
                    className="min-h-[100px] font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label>测试要求（testing）</Label>
                  <Textarea
                    value={joinList(selectedSpec.testing)}
                    onChange={(e) => updateListField('testing', e.target.value)}
                    className="min-h-[100px] font-mono"
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                提示：当前模板已初始化 `Java / Python / Go / Node.js / React / Vue / TypeScript` 七类语言约束。
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave}>保存配置</Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default OrgSpecConfigPage;
