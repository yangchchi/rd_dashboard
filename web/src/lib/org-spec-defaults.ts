import type { IOrgLanguageSpec, IOrganizationSpecConfig, OrgSpecLanguage } from './rd-types';

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
        styleGuide: ['遵循 Google Java Style', '优先不可变对象与清晰命名', '对外接口必须有 Javadoc'],
        mustFollow: ['分层架构（controller/service/repository）', '异常统一封装并透传业务码', '关键链路接入日志与指标'],
        forbidden: ['禁止在 controller 中写业务逻辑', '禁止吞异常不处理', '禁止静态可变全局状态'],
        toolchain: ['JDK 21', 'Maven/Gradle', 'SpotBugs + Checkstyle'],
        testing: ['单元测试覆盖核心服务', '接口契约测试覆盖外部 API', 'CI 必须执行测试与静态检查'],
      }),
      python: createDefaultLanguageSpec('python', 'Python', {
        styleGuide: ['遵循 PEP8 与类型注解', '函数保持短小并单一职责', '公共模块提供 docstring'],
        mustFollow: ['对外函数补齐类型注解', 'I/O 与业务逻辑分离', '统一使用结构化日志'],
        forbidden: ['禁止无边界裸 except', '禁止在 import 时执行副作用', '禁止硬编码密钥与路径'],
        toolchain: ['Python 3.11+', 'ruff + mypy', 'poetry/pip-tools'],
        testing: ['pytest + 参数化测试', '关键路径覆盖异常分支', 'CI 强制 lint/type-check/test'],
      }),
      go: createDefaultLanguageSpec('go', 'Go', {
        styleGuide: ['遵循 gofmt 与 idiomatic Go', '错误优先返回并附加上下文', '包名简短语义化'],
        mustFollow: ['context 必须透传到下游', '接口最小化按需定义', '并发代码必须考虑取消与超时'],
        forbidden: ['禁止 panic 作为业务错误处理', '禁止忽略 error 返回值', '禁止循环内不受控 goroutine'],
        toolchain: ['Go 1.22+', 'go vet + staticcheck', 'golangci-lint'],
        testing: ['table-driven 测试覆盖核心逻辑', '并发代码加 race 检测', '集成测试隔离外部依赖'],
      }),
      node: createDefaultLanguageSpec('node', 'Node.js', {
        styleGuide: ['统一使用 ESLint + Prettier', '模块边界清晰（route/service/repo）', '异步流程使用 async/await'],
        mustFollow: ['输入参数必须校验', '错误统一中间件处理', 'API 返回结构保持一致'],
        forbidden: ['禁止未处理 Promise reject', '禁止阻塞事件循环的重计算', '禁止直接拼接 SQL'],
        toolchain: ['Node.js 20+', 'pnpm/npm', 'eslint + zod/joi'],
        testing: ['单测覆盖 service 层', 'HTTP 接口覆盖鉴权与异常', 'CI 执行 lint + test + build'],
      }),
      react: createDefaultLanguageSpec('react', 'React', {
        styleGuide: ['组件命名与目录结构一致', '优先函数组件 + hooks', 'UI 与业务逻辑拆分'],
        mustFollow: ['复杂状态抽离到 hooks/store', '异步请求需有加载和错误态', '可复用组件必须定义明确 props'],
        forbidden: ['禁止在渲染阶段执行副作用', '禁止 props 深层透传失控', '禁止跳过 key 导致列表不稳定'],
        toolchain: ['React 19', 'Vite', 'eslint-plugin-react-hooks'],
        testing: ['关键交互使用 RTL 覆盖', '核心页面具备冒烟测试', '视觉回归覆盖公共组件'],
      }),
      vue: createDefaultLanguageSpec('vue', 'Vue', {
        styleGuide: ['优先 Composition API', 'SFC 结构保持 script/template/style 顺序', '命名遵循 PascalCase'],
        mustFollow: ['状态管理统一入口（Pinia）', '组件事件与 props 文档化', '异步请求处理 loading/error'],
        forbidden: ['禁止在模板写复杂业务表达式', '禁止随意修改 props', '禁止全局污染原型对象'],
        toolchain: ['Vue 3', 'Vite', 'eslint + vue-tsc'],
        testing: ['组件单测覆盖交互事件', '路由页面保留基础集成测试', '提交前执行 lint + type-check'],
      }),
      typescript: createDefaultLanguageSpec('typescript', 'TypeScript', {
        styleGuide: ['开启 strict 并优先精确类型', '避免 any，优先 unknown + narrowing', '公共 API 输出稳定类型'],
        mustFollow: ['领域模型与 DTO 分离', '关键函数定义返回类型', '外部输入必须运行时校验'],
        forbidden: ['禁止滥用类型断言绕过检查', '禁止未处理 null/undefined', '禁止导出未稳定内部类型'],
        toolchain: ['TypeScript 5+', 'tsc --noEmit', 'eslint + typescript-eslint'],
        testing: ['核心逻辑单测覆盖边界条件', '类型测试覆盖关键泛型工具', 'CI 强制 type-check 通过'],
      }),
    },
  };
}
