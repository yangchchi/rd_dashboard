export interface ISpecValidationInput {
  fsMarkdown?: string | null;
  tsMarkdown?: string | null;
  cpMarkdown?: string | null;
  functionalSpec?: {
    apis?: unknown[];
    uiComponents?: unknown[];
    interactions?: unknown[];
  } | null;
  technicalSpec?: {
    databaseSchema?: unknown;
    architecture?: unknown;
    thirdPartyIntegrations?: unknown;
  } | null;
  machineReadableJson?: string | null;
}

export interface ISpecValidationIssue {
  path: string;
  message: string;
}

export interface ISpecValidationResult {
  valid: boolean;
  issues: ISpecValidationIssue[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasObjectShape(value: unknown): boolean {
  return isObject(value) && Object.keys(value).length > 0;
}

function pushIfMissing(
  issues: ISpecValidationIssue[],
  condition: boolean,
  path: string,
  message: string
): void {
  if (!condition) issues.push({ path, message });
}

export function validateSpecForReview(spec: ISpecValidationInput): ISpecValidationResult {
  const issues: ISpecValidationIssue[] = [];
  const functionalSpec = spec.functionalSpec ?? {};
  const technicalSpec = spec.technicalSpec ?? {};
  const apis = Array.isArray(functionalSpec.apis) ? functionalSpec.apis : [];
  const uiComponents = Array.isArray(functionalSpec.uiComponents)
    ? functionalSpec.uiComponents
    : [];
  const interactions = Array.isArray(functionalSpec.interactions)
    ? functionalSpec.interactions
    : [];

  pushIfMissing(issues, hasText(spec.fsMarkdown), 'fsMarkdown', '建议补充 FS Markdown 内容');
  pushIfMissing(issues, hasText(spec.tsMarkdown), 'tsMarkdown', '建议补充 TS Markdown 内容');
  pushIfMissing(issues, hasText(spec.cpMarkdown), 'cpMarkdown', '建议补充 CP Markdown 内容');

  pushIfMissing(issues, apis.length > 0, 'functionalSpec.apis', '建议补充至少一个 API');
  apis.forEach((api, index) => {
    const item = isObject(api) ? api : {};
    pushIfMissing(issues, hasText(item.path), `functionalSpec.apis.${index}.path`, '建议填写 API path');
    pushIfMissing(
      issues,
      hasText(item.method),
      `functionalSpec.apis.${index}.method`,
      '建议填写 API method'
    );
    pushIfMissing(
      issues,
      hasText(item.description),
      `functionalSpec.apis.${index}.description`,
      '建议填写 API description'
    );
    pushIfMissing(
      issues,
      hasObjectShape(item.requestParams),
      `functionalSpec.apis.${index}.requestParams`,
      '建议补充非空 requestParams 示例'
    );
    pushIfMissing(
      issues,
      hasObjectShape(item.response),
      `functionalSpec.apis.${index}.response`,
      '建议补充非空 response 示例'
    );
  });

  pushIfMissing(
    issues,
    uiComponents.length > 0,
    'functionalSpec.uiComponents',
    '建议补充至少一个 UI 组件'
  );
  uiComponents.forEach((component, index) => {
    const item = isObject(component) ? component : {};
    pushIfMissing(
      issues,
      hasText(item.name),
      `functionalSpec.uiComponents.${index}.name`,
      '建议填写 UI component name'
    );
    pushIfMissing(
      issues,
      hasText(item.type),
      `functionalSpec.uiComponents.${index}.type`,
      '建议填写 UI component type'
    );
    pushIfMissing(
      issues,
      hasObjectShape(item.props),
      `functionalSpec.uiComponents.${index}.props`,
      '建议补充非空 UI component props'
    );
    pushIfMissing(
      issues,
      Array.isArray(item.events) && item.events.length > 0,
      `functionalSpec.uiComponents.${index}.events`,
      '建议补充 UI component events'
    );
  });

  pushIfMissing(
    issues,
    interactions.length > 0,
    'functionalSpec.interactions',
    '建议补充至少一个交互逻辑'
  );
  interactions.forEach((interaction, index) => {
    const item = isObject(interaction) ? interaction : {};
    pushIfMissing(
      issues,
      hasText(item.trigger),
      `functionalSpec.interactions.${index}.trigger`,
      '建议填写 Interaction trigger'
    );
    pushIfMissing(
      issues,
      hasText(item.action),
      `functionalSpec.interactions.${index}.action`,
      '建议填写 Interaction action'
    );
  });

  pushIfMissing(
    issues,
    hasObjectShape(technicalSpec.databaseSchema),
    'technicalSpec.databaseSchema',
    '建议补充非空 databaseSchema'
  );
  pushIfMissing(
    issues,
    hasText(technicalSpec.architecture),
    'technicalSpec.architecture',
    '建议补充 architecture'
  );
  pushIfMissing(
    issues,
    Array.isArray(technicalSpec.thirdPartyIntegrations),
    'technicalSpec.thirdPartyIntegrations',
    '建议补充 thirdPartyIntegrations 数组'
  );

  const cp = spec.cpMarkdown ?? '';
  pushIfMissing(issues, /files?:|文件|modify|create/i.test(cp), 'cpMarkdown', '建议补充 CP 文件级任务');
  pushIfMissing(issues, /run:|npm |pnpm |yarn |pytest|jest|test|验证|测试/i.test(cp), 'cpMarkdown', '建议补充 CP 验收命令或测试步骤');
  pushIfMissing(issues, /rollback|回滚|revert/i.test(cp), 'cpMarkdown', '建议补充 CP 回滚方案');

  if (hasText(spec.machineReadableJson)) {
    try {
      JSON.parse(spec.machineReadableJson as string);
    } catch {
      issues.push({ path: 'machineReadableJson', message: '建议保持 machineReadableJson 为合法 JSON 格式' });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function formatSpecValidationIssues(issues: ISpecValidationIssue[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
}
