# AI 驱动型研发管理看板（rd_dashboard）

本项目是一个前后端一体化的研发管理系统原型，覆盖需求看板、PRD 管理、规格定义、流水线与验收流程等页面与能力。

## 1. 项目结构

```text
rd_dashboard/
├── web/                     # 前端应用（Next.js App Router）
│   ├── src/app/             # 路由与布局
│   ├── src/screen/          # 页面级模块
│   ├── src/components/      # 组件（Layout、业务组件、UI 组件）
│   └── public/              # 静态资源
├── server/                  # 后端应用（NestJS）
│   ├── main.ts              # 后端入口
│   ├── app.module.ts        # 模块聚合与全局配置
│   ├── modules/             # 业务模块（rd、auth、capabilities 等）
│   ├── capabilities/        # AI 能力插件配置（JSON）
│   ├── common/              # 公共常量、接口、异常过滤器
│   └── database/            # 数据库（Drizzle + postgres）
├── shared/                  # 前后端共享类型
├── scripts/                 # 构建/开发/校验脚本
├── dist/                    # 构建产物
├── logs/                    # 本地开发日志
└── package.json             # 依赖与 npm scripts
```

## 2. 技术栈

- 语言与运行时
  - TypeScript
  - Node.js `>=22.0.0`
  - npm `>=10.0.0`
- 前端
  - React 19
  - Next.js 15（App Router）
  - Tailwind CSS + PostCSS（配置在 `web/`）
  - Radix UI、Headless UI
  - 数据：TanStack React Query
- 后端
  - NestJS 10（`@nestjs/core` / `@nestjs/common` / `@nestjs/platform-express`）
- 数据层
  - Drizzle ORM + `postgres` driver（PostgreSQL）
- 工程化与质量
  - ESLint、Stylelint、Prettier
  - Jest（单元与 e2e 脚本）
  - concurrently（并行执行类型检查等命令）

## 3. 路由与业务页面（前端）

路由在 `web/src/app/` 下定义（含 `(main)` 等分组），核心页面包括：

- `/`、`/dashboard`：需求看板
- `/requirements/new`：需求采集
- `/requirements`：需求列表
- `/requirements/[id]`：需求详情
- `/requirements/[id]/edit`：需求编辑
- `/prd`、`/prd/[id]/edit`：PRD 管理/编辑
- `/specification`、`/specification/[id]/edit`：规格定义/编辑
- `/ai-pipeline`：流水线
- `/acceptance`：验收中心

## 4. 启动方式

### 4.1 安装依赖

```bash
npm install
```
（`web/` 目录有独立 `package.json`，若需单独安装：`npm --prefix web install`）

### 4.2 开发模式（推荐）

```bash
npm run dev
```

说明：

- `npm run dev` 实际执行 `scripts/dev.sh -> scripts/dev.js`
- 会并行启动：
  - 后端：`npm run dev:server`（Nest watch）
  - 前端：`npm run dev:web`（Next.js dev）
- 默认端口（可通过 `.env` 覆盖）：
  - 后端：`SERVER_PORT`，默认 `3000`
  - 前端：`CLIENT_DEV_PORT`，默认 `3001`
- 开发日志默认输出到 `logs/` 目录

### 4.3 构建产物

```bash
npm run build
```

说明：

- 会清理 `dist`、并行构建 Nest 与 `web`（Next）、整理产物并依赖裁剪
- 产物目录为 `dist/`（含 `server/` 与可选的 `web/` 拷贝）

### 4.4 生产运行

API 在 `dist/` 下：

```bash
bash run.sh
```

等价命令（在 `dist/` 内）：

```bash
NODE_ENV=production node server/main.js
```

前端在构建后的 `web/` 产物目录执行 `next start`（或从项目根 `npm --prefix web run start`），并配置 API 代理（如 `API_ORIGIN` / `NEXT_PUBLIC_*`）。

## 5. 常用脚本

- `npm run dev`：本地开发（API + Next）
- `npm run dev:server`：仅启动后端
- `npm run dev:web`：仅启动前端（Next，默认端口 3001）
- `npm run build`：构建并整理产物
- `npm run build:server`：仅构建后端
- `npm run build:web`：仅构建前端
- `npm run test`：Jest 单元测试
- `npm run test:e2e`：e2e 测试
- `npm run lint`：统一 lint
- `npm run eslint`：ESLint
- `npm run stylelint`：Stylelint
- `npm run type:check`：前后端类型检查
- `npm run format`：Prettier 格式化

## 6. 环境变量（代码中使用到的关键项）

- `NODE_ENV`：运行环境（development/production）
- `SERVER_HOST`：后端监听地址（默认 `localhost`）
- `SERVER_PORT`：后端端口（默认 `3000`）
- `CLIENT_DEV_PORT`：前端开发端口（默认 `3001`）
- `API_ORIGIN`：Next 代理后端 API 时使用的 origin（见 `web/next.config.ts`）
- `LOG_DIR`：开发日志目录（默认 `logs`）
- `MAX_RESTART_COUNT`：dev 模式最大重启次数（默认 `10`）
- `RESTART_DELAY`：dev 模式重启初始延迟秒数（默认 `2`）


新增远程仓库
名称：internal
地址：http://10.6.35.91/yangchuanchi/rd_dashboard.git
原有的 origin（GitHub）未改动。
2. 提交并推送
已将当前与飞书登录相关的 7 个文件提交，提交说明：feat(auth): 飞书 OAuth 登录与回调页
已执行 git push -u internal main，内网仓库上已创建并更新 main 分支。
常用命令
# 只推到内网
git push internal main
# 同时推到 GitHub
git push origin main
说明：main 当前的上游分支是 internal/main，因此在本分支执行 git pull 会默认从内网拉取。若希望 git pull 仍默认从 GitHub 拉取，可执行：
git branch -u origin/main main
之后需要从内网更新时再执行：git pull internal main
