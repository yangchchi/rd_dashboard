/** 组织级编码规范默认模板；对齐 OpenSpec 类 SDD（规格/场景/任务 → 实现 → 验证），条目短句、可检查。 */

export type OrgSpecLanguage = 'java' | 'python' | 'go' | 'node' | 'react' | 'vue' | 'typescript';

export interface IOrgLanguageSpec {
  language: OrgSpecLanguage;
  displayName: string;
  enabled: boolean;
  styleGuide: string[];
  mustFollow: string[];
  forbidden: string[];
  toolchain: string[];
  testing: string[];
}

export interface IOrganizationSpecConfig {
  id: string;
  orgName: string;
  version: number;
  defaultLanguage: OrgSpecLanguage;
  updatedAt: string;
  languages: Record<OrgSpecLanguage, IOrgLanguageSpec>;
}

const nowISO = () => new Date().toISOString();

function createDefaultLanguageSpec(
  language: OrgSpecLanguage,
  displayName: string,
  rules: {
    styleGuide: string[];
    mustFollow: string[];
    forbidden: string[];
    toolchain: string[];
    testing: string[];
  }
): IOrgLanguageSpec {
  return {
    language,
    displayName,
    enabled: true,
    styleGuide: rules.styleGuide,
    mustFollow: rules.mustFollow,
    forbidden: rules.forbidden,
    toolchain: rules.toolchain,
    testing: rules.testing,
  };
}

export function createDefaultOrgSpecConfig(): IOrganizationSpecConfig {
  return {
    id: 'org-spec-default',
    orgName: '默认组织',
    version: 1,
    defaultLanguage: 'typescript',
    updatedAt: nowISO(),
    languages: {
      java: createDefaultLanguageSpec('java', 'Java', {
        styleGuide: [
          '格式与命名：Google Java Style；构建内嵌 Checkstyle/Spotless',
          '优先不可变、显式 null（Optional）；类/方法名表达意图',
          '对外 public API：Javadoc 含用途、参数、异常、并发约定',
        ],
        mustFollow: [
          'SDD：仅实现任务/规格已列行为；缺口先补规格再写代码',
          '分层 controller→service→repository；禁止跨层偷渡依赖',
          '业务异常→稳定错误码；日志带 traceId，关键路径可指标化',
        ],
        forbidden: [
          '禁止 controller 内堆业务规则',
          '禁止 catch 后空块或仅打印不处理',
          '禁止可变的 static 全局业务状态',
        ],
        toolchain: ['JDK 21 LTS', 'Maven 或 Gradle', 'SpotBugs + Checkstyle（或等价）'],
        testing: [
          '单测：服务层分支与边界；契约测覆盖对外 HTTP/RPC',
          '每个任务至少一条可自动化断言（单测或契约）',
          'CI：test + 静态分析失败即阻断合并',
        ],
      }),
      python: createDefaultLanguageSpec('python', 'Python', {
        styleGuide: [
          'PEP8 + ruff 默认规则；公开函数签名完整类型注解',
          '函数短小、单一职责；模块级 docstring 说明职责与边界',
          'I/O 与纯逻辑分层；配置经环境变量或显式注入',
        ],
        mustFollow: [
          'SDD：行为以规格/场景为准；新增能力先更新规格再实现',
          '对外入口：pydantic/TypedDict 等与运行时校验一致',
          '日志：结构化字段（如 request_id），禁止敏感信息明文',
        ],
        forbidden: [
          '禁止裸 except: 或吞掉异常不记录',
          '禁止模块 import 时执行网络/写盘等副作用',
          '禁止密钥、令牌、绝对路径硬编码进仓库',
        ],
        toolchain: ['Python 3.11+', 'ruff + mypy（或 pyright）', 'poetry / pip-tools 锁依赖'],
        testing: [
          'pytest：参数化覆盖等价类与异常路径',
          '任务完成须有对应用例或明确标注「无测理由」于规格',
          'CI：ruff + mypy + pytest 全绿',
        ],
      }),
      go: createDefaultLanguageSpec('go', 'Go', {
        styleGuide: [
          'gofmt + goimports；错误用 fmt.Errorf("%w", err) 保留链',
          '包名短且语义唯一；导出符号 Godoc 一句话说明契约',
          '接口由消费者侧小接口定义，避免「大接口」依赖',
        ],
        mustFollow: [
          'SDD：实现与 openspec/任务或等价清单逐项对应',
          'context.Context 贯穿 RPC/DB/HTTP；超时与取消可观测',
          '并发：WaitGroup/errgroup；取消后不再写共享状态',
        ],
        forbidden: [
          '禁止用 panic 表达可预期业务失败',
          '禁止 _ = fn() 丢弃 error',
          '禁止 for 内无上限 goroutine 或泄漏的 channel',
        ],
        toolchain: ['Go 1.22+', 'staticcheck + golangci-lint', 'go mod 最小模块边界'],
        testing: [
          'table-driven 单测；-race 必跑于含并发的包',
          '集成测：外部依赖用接口+fakes 或 testcontainer',
          'CI：go test ./... + lint',
        ],
      }),
      node: createDefaultLanguageSpec('node', 'Node.js', {
        styleGuide: [
          'ESLint + Prettier；目录 route / service / repo 边界固定',
          '异步统一 async/await；禁止混用裸 Promise 链与 async 随意交叉',
          '环境变量集中校验（zod/joi）；禁止散落 process.env',
        ],
        mustFollow: [
          'SDD：路由与 handler 行为与 OpenAPI/规格一致，先契约后实现',
          '入参校验失败→统一 4xx 结构；未捕获错误→统一 5xx 与日志',
          '可观测：请求 id、慢查询与外部调用耗时',
        ],
        forbidden: [
          '禁止未 .catch / try-catch 的 floating Promise',
          '禁止在请求路径上做 CPU 密集同步阻塞',
          '禁止字符串拼接构造 SQL',
        ],
        toolchain: ['Node.js 20 LTS+', 'pnpm 优先', 'TypeScript 或 JSDoc 严格模式'],
        testing: [
          '单测 mock I/O；HTTP 层测鉴权、校验、错误体',
          '契约或快照测覆盖稳定 JSON 形状',
          'CI：lint + test + build',
        ],
      }),
      react: createDefaultLanguageSpec('react', 'React', {
        styleGuide: [
          '函数组件 + hooks；文件/组件命名与路由或领域一致',
          'UI 与数据获取分离：hooks 或 data 层，组件偏展示',
          'Props 类型显式；复杂 props 用组合而非巨型单对象',
        ],
        mustFollow: [
          'SDD：页面/交互与规格中的场景一一可追溯',
          '服务端状态用稳定 queryKey；乐观更新须可回滚',
          '加载 / 空 / 错误三态齐全；无障碍属性于交互控件',
        ],
        forbidden: [
          '禁止在 render 内 setState 或发起未稳定依赖的请求',
          '禁止无 memo 策略的 Context 大对象导致全树重渲染',
          '禁止列表项用数组下标作 key（数据会重排时）',
        ],
        toolchain: ['React 18+', 'Vite 或 Next 按项目', 'eslint-plugin-react-hooks 必开'],
        testing: [
          'RTL：用户可见行为与关键路径',
          '与规格对齐的冒烟用例覆盖主流程',
          'CI：lint + typecheck + test',
        ],
      }),
      vue: createDefaultLanguageSpec('vue', 'Vue', {
        styleGuide: [
          'Vue 3 + Composition API；SFC 顺序 script → template → style',
          '组件 PascalCase；composable 以 useXxx 命名且单职责',
          '模板仅轻表达式；复杂逻辑进 computed 或函数',
        ],
        mustFollow: [
          'SDD：路由页行为与规格场景对齐；变更同步更新规格',
          '全局状态经 Pinia；禁止跨组件隐式事件总线乱飞',
          '异步：loading / error / 空状态与重试策略明确',
        ],
        forbidden: [
          '禁止在模板内写长链路业务或副作用',
          '禁止子组件直接改 props 引用',
          '禁止 Vue.prototype 挂载业务单例',
        ],
        toolchain: ['Vue 3', 'Vite', 'vue-tsc + ESLint vue 规则集'],
        testing: [
          'Vitest + Vue Test Utils 覆盖交互与 composable',
          '关键路由 e2e 或集成测最小集',
          'CI：lint + type-check + test',
        ],
      }),
      typescript: createDefaultLanguageSpec('typescript', 'TypeScript', {
        styleGuide: [
          'strict 全开；公共导出类型即契约，变更视为 breaking 需文档',
          '禁止 any；用 unknown + 类型守卫收窄外部数据',
          '命名空间：domain / dto / infra 分层，禁止循环依赖',
        ],
        mustFollow: [
          'SDD：实现文件可指向对应任务编号或规格路径（注释或 PR 描述）',
          '边界输入：Zod/io-ts 等与 TS 类型双轨一致',
          '导出函数显式返回类型；泛型工具类型须有单测或示例',
        ],
        forbidden: [
          '禁止 as 掩盖不完整类型建模',
          '禁止可选链滥用掩盖未建模的 undefined',
          '禁止从 deep internal 路径 re-export 给包外',
        ],
        toolchain: ['TS 5+', 'tsc --noEmit', 'eslint + @typescript-eslint strict'],
        testing: [
          '单测覆盖分支与错误路径；关键纯函数 100% 语句覆盖优先',
          'CI：typecheck 为合并门禁；重大类型变更配迁移说明',
        ],
      }),
    },
  };
}
