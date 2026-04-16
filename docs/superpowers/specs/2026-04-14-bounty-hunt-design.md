# 研发悬赏玩法（狩猎场）设计文档

## 1. 背景与目标

当前研发管理流程在状态可视化与流程规范方面较完整，但“需求领取-执行-交付-结算”的体验偏工具化。为了提升参与感与协作积极性，本设计引入“悬赏任务”玩法，构建以下闭环：

- 发布方（“金主”）发布悬赏任务并设定金币奖励。
- 执行方（“猎人”）在狩猎场中抢单并执行任务。
- 通过交付、验收、结算形成高反馈、可追踪的体验。
- 在并发抢单场景下，保持后端强一致规则（先到先得）与前端趣味反馈。

本次范围采用“前端 + 真实并发规则”模式，并明确狩猎场仅展示“完全未被领取（0/1）”的任务。

## 2. 范围与非目标

### 2.1 范围

- 新增一级菜单与新页面：`/bounty-hunt`（狩猎场）。
- 新增悬赏任务领域模型（与需求模型轻关联）。
- 新增发布悬赏、抢单、提测/交付、验收通过、打回返工全链路交互。
- 新增关键动效与音效触发机制（契约确认、飞包裹、金币雨、结算文案）。
- 抢单并发后端原子判定，前端基于返回态展示趣味反馈与补偿信息。

### 2.2 非目标

- 本期不实现复杂经济系统（排行榜、赛季商店、NFT 资产等）。
- 本期不改造现有所有页面为“全悬赏模式”，以新增页面与关键入口为主。
- 本期不引入事件总线/消息中间件，仅使用同步 API 驱动交互。

## 3. 信息架构与导航

- 新增主导航项：`狩猎场`，路由为 `/bounty-hunt`。
- 导航样式沿用 Sidebar 现有视觉系统（深色底 + active 蓝色高亮）。
- 页面定位：
  - 需求池看板（狩猎场）：面向执行方的抢单入口。
  - 发布悬赏（弹窗/浮动按钮）：面向发起方（需求提出者或责任方）。

## 4. 数据模型设计

采用“需求主模型轻量 + 悬赏子模型独立”的结构，避免将玩法字段过度堆叠到 `IRequirement`。

### 4.1 新增核心类型

- `IBountyTask`
  - `id: string`
  - `requirementId: string`
  - `publisherId: string`
  - `publisherName?: string`
  - `rewardCoins: number`
  - `depositCoins: number`
  - `consolationCoins: number`（默认 1）
  - `difficultyTag: 'normal' | 'hard' | 'epic'`
  - `deadlineAt: string`
  - `acceptStatus: 'open' | 'developing' | 'delivered' | 'settled' | 'rework'`
  - `hunterUserId?: string`
  - `hunterUserName?: string`
  - `acceptedAt?: string`
  - `deliveredAt?: string`
  - `settledAt?: string`
  - `createdAt: string`
  - `updatedAt: string`

- `IBountySettlementRecord`
  - `id: string`
  - `bountyTaskId: string`
  - `operatorUserId: string`
  - `action: 'approve' | 'reject'`
  - `coinsDelta: number`
  - `remark?: string`
  - `createdAt: string`

### 4.2 需求模型轻关联

- 在 `IRequirement` 中新增：
  - `bountyTaskId?: string`
  - `hasBounty?: boolean`

## 5. 状态机与业务规则

### 5.1 主状态机

- `open（待领取）` -> `developing（进行中 1/1）` -> `delivered（待验收）` -> `settled（已结算）`
- 驳回分支：`delivered` -> `rework（待修改）` -> `delivered`

### 5.2 狩猎场筛选规则（已确认）

- 狩猎场仅显示：
  - `acceptStatus = open`
  - 且关联需求仍处于可领取阶段（例如 `requirement.status = backlog`）
  - 且未被领取（`hunterUserId` 为空，即 0/1）

### 5.3 并发抢单规则

- 抢单 API 必须后端原子判定（事务 + 条件更新）：
  - 仅当 `acceptStatus = open` 且 `hunterUserId IS NULL` 时允许更新为当前用户。
- 并发下只有第一位成功者获得任务。
- 失败方收到趣味提示并显示补偿：`+1 勇气金币`（以接口返回为准）。

## 6. 关键交互与动效设计

### 6.1 需求池看板（狩猎场）

- 卡片展示：
  - 悬赏金额：大号金币图标 + 数字（等宽数字）。
  - 剩余接单时间：倒计时显示；低于阈值（如 10 分钟）变橙色警示。
  - 状态角标文案：`待领取`、`进行中（1/1）`、`已结算`。

### 6.2 抢单机制（仪式感）

- 点击 `领取任务` 后先触发 0.5 秒确认动画：
  - 锁定圈旋转；
  - 文案 `契约成立中...`。
- 动画完成后发起抢单请求：
  - 成功：显示 `契约成立` 并将卡片从狩猎场移除。
  - 失败：弹窗/Toast 显示 `慢了一步，下次手速快点！`，并展示补偿结果。

### 6.3 发起需求任务（金主视角）

- 入口：醒目的悬浮按钮 `发布悬赏`。
- 弹窗标题：`撰写通缉令`。
- 描述字段提示：`描述你要消灭的Bug/实现的功能`。
- 金币滑条：
  - 滑块附金币图标；
  - 实时映射难度与建议值：
    - `普通`：20-80
    - `困难`：81-200
    - `史诗`：201+
- 发布成功动效：
  - “羊皮纸/全息投影”从中心飞入任务看板；
  - 触发投掷音效。

### 6.4 执行与交付

- 接单人视图状态显示：`开发中`。
- 点击 `提测/交付` 后触发“包裹/信封飞向发起人头像”动效，再切换到 `delivered`。

### 6.5 结算与打回

- 发起人点击 `验收通过`：
  - 屏幕中央出现 `Bounty Collected!`；
  - 金币雨从任务卡飞向接单人头像或余额数字；
  - 播放 `Cha-ching` 音效。
- 发起人点击打回：
  - 显示 `任务未达标，退回返工`；
  - 扣除少量押金或延缓结算；
  - 状态进入 `rework`。

## 7. API 契约草案

- `POST /bounty-tasks`
  - 创建悬赏任务并关联 requirement。
- `GET /bounty-tasks?hunt=true`
  - 返回狩猎场可见任务（仅 open + backlog + 0/1）。
- `POST /bounty-tasks/:id/accept`
  - 抢单（原子判定）。
- `POST /bounty-tasks/:id/deliver`
  - 提测/交付。
- `POST /bounty-tasks/:id/settle`
  - 验收通过并结算。
- `POST /bounty-tasks/:id/reject`
  - 验收不通过并打回返工。

## 8. 前端工程拆分

### 8.1 页面与路由

- `web/src/app/(main)/bounty-hunt/page.tsx`
- `web/src/screen/BountyHuntPage/BountyHuntPage.tsx`

### 8.2 组件

- `web/src/components/business-ui/bounty-hunt/bounty-card.tsx`
- `web/src/components/business-ui/bounty-hunt/bounty-countdown.tsx`
- `web/src/components/business-ui/bounty-hunt/accept-contract-button.tsx`
- `web/src/components/business-ui/bounty-hunt/publish-bounty-dialog.tsx`
- `web/src/components/business-ui/bounty-hunt/bounty-effects-layer.tsx`

### 8.3 类型与数据访问

- `web/src/lib/rd-types.ts`（新增 bounty 类型）
- `web/src/lib/rd-api.ts`（新增 bounty API 方法）
- `web/src/lib/rd-hooks.tsx`（新增 bounty hooks）

## 9. 异常与边界处理

- 重复点击：按钮 loading + disabled，0.5 秒确认阶段锁定操作。
- 倒计时到期：前端实时禁用接单；后端再次强校验。
- 已处理任务重复验收：后端幂等，前端提示“状态已更新”并刷新。
- 并发失败补偿：仅对“竞争失败”场景发放，不对普通失败发放。

## 10. 验收标准与测试要点

### 10.1 单元测试

- 倒计时显示与阈值颜色变化正确。
- 金币滑条映射难度等级正确。
- 状态文案映射正确（open/developing/delivered/settled/rework）。

### 10.2 交互测试

- 抢单流程严格按“0.5 秒动画 -> 请求 -> 结果展示”顺序执行。
- 并发失败时弹出趣味文案并展示勇气金币补偿。
- 发布悬赏后触发“飞入看板”动效。
- 提测后触发“飞向发起人头像”动效。
- 验收通过触发中心文案、金币雨、音效。

### 10.3 并发联调

- 双客户端同时抢同一任务，仅一个成功。
- 失败端稳定收到失败文案与补偿结果。

## 11. 风险与后续建议

- 音效播放受浏览器自动播放策略影响，需保证首次用户交互后再触发音效。
- 强动效可能影响低性能设备，需提供“降低动画”开关（可在后续迭代）。
- 若后续玩法继续扩展（排行榜、连续交付奖励），建议升级为事件驱动架构。

