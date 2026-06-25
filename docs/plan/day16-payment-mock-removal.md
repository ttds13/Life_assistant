# Day16 支付 Mock 删除计划

## 目标

彻底删除当前项目中的支付 mock 能力，使支付链路只保留真实微信支付：

- `POST /api/orders/:id/pay` 只能创建微信 JSAPI 支付单。
- 删除 `/api/payments/mock-success` 模拟支付成功接口。
- 删除 `PAYMENT_PROVIDER=mock`、`PAYMENT_MOCK_ENABLED` 等 mock 开关。
- 删除支付响应中的 `provider: mock`、`channel: mock`、`mockSuccessPath`。
- 删除服务端、前端类型、后台展示中对支付 mock 的业务分支。

本计划只针对“支付 mock”。下单页的 `createMockPricePreview` 是价格预览接口失败时的金额兜底，不属于支付 mock；`auth/mock-login` 是登录开发能力，也不属于支付 mock。

## 当前支付 Mock 功能片段

| 位置 | 代码片段 | 当前作用 | 删除动作 |
| --- | --- | --- | --- |
| `server/.env.example` | `PAYMENT_PROVIDER=mock` | 默认使用 mock 支付提供方 | 改为 `PAYMENT_PROVIDER=wechat` 或删除该变量 |
| `server/.env.example` | `PAYMENT_MOCK_ENABLED=true` | 控制开发环境 mock 支付是否开启 | 删除该变量 |
| `server/src/payments/wechat-pay.config.ts` | `provider` 默认值为 `mock` | 未配置时回退 mock 支付 | 删除 mock 默认值，支付配置只允许微信 |
| `server/src/payments/wechat-pay.config.ts` | `mockEnabled` | 读取 `PAYMENT_MOCK_ENABLED` | 删除 getter 和所有调用 |
| `server/src/payments/wechat-pay.config.ts` | `isWechatEnabled` | 决定 `createPayment` 走微信还是 mock | 删除条件开关，支付始终走微信 |
| `server/src/payments/wechat-pay.config.ts` | `assertRuntime()` 中生产环境禁止 mock | 只是在生产防误开 mock | 删除 mock 检查，改为启动时校验微信支付配置 |
| `server/src/payments/payments.controller.ts` | `POST payments/mock-success` | 手动把待支付订单置为支付成功 | 删除接口、方法和 `MockSuccessDto` import |
| `server/src/payments/dto/mock-success.dto.ts` | `MockSuccessDto` | mock-success 入参 DTO | 删除整个文件 |
| `server/src/payments/payments.service.ts` | `createPayment()` 中 `isWechatEnabled ? createWechatPayment : createMockPayment` | 在微信和 mock 之间切换 | 改为直接调用 `createWechatPayment()` |
| `server/src/payments/payments.service.ts` | `createMockPayment()` | 创建 `channel=mock` 的待支付记录 | 删除整个方法 |
| `server/src/payments/payments.service.ts` | `mockSuccess()` | 模拟支付成功、写支付成功、触发自动派单 | 删除整个方法 |
| `server/src/payments/payments.service.ts` | `PAYMENT_CHANNEL.MOCK` | 写入 mock 支付渠道 | 删除所有 mock 渠道写入 |
| `server/src/payments/payments.service.ts` | `MOCK${Date.now()}...` | 生成 mock 交易流水号 | 删除 |
| `server/src/payments/payments.service.ts` | `presentPayOrderResult()` | 返回 mock 支付参数和 `mockSuccessPath` | 删除整个方法 |
| `server/src/payments/payments.service.ts` | `writeNotifyLog(... channel = PAYMENT_CHANNEL.MOCK)` | 日志默认渠道是 mock | 默认值改为微信，或强制调用方显式传入渠道 |
| `server/src/payments/payments.service.ts` | `recordAbnormalPaymentSuccess(... channel = PAYMENT_CHANNEL.MOCK)` | 异常支付成功默认渠道是 mock | 默认值改为微信，或强制调用方显式传入渠道 |
| `server/src/payments/payments.repository.ts` | `findLatestMockPayment()` | 查询订单最新 mock 支付单 | 删除 |
| `server/src/payments/payments.repository.ts` | `findLatestOrderPayment()` | mock-success 按订单查最新 mock 支付单 | 删除 |
| `server/src/payments/constants/payment-channel.ts` | `MOCK: 'mock'` | 支付渠道常量保留 mock 枚举 | 删除 `MOCK` |
| `server/src/common/errors/error-code.ts` | `PAYMENT_MOCK_DISABLED = 60003` | mock 关闭时的错误码 | 删除错误码，确认无引用 |
| `miniapp/src/api/types/orders.ts` | `provider?: 'mock' \| 'wechat'` | 小程序支付结果类型仍允许 mock | 改为 `provider?: 'wechat'` |
| `server/src/admin-business/admin-business.service.ts` | `paymentChannel('mock') -> 模拟支付` | 后台财务列表展示 mock 渠道 | 删除 mock 分支，或仅在历史数据清理完成前临时保留 |
| `docs/plan/day16-payment.md` | 多处 mock 保留和 mock-success 说明 | 真实支付接入计划的历史记录 | 保留为历史文档，或追加说明“支付 mock 已在后续计划删除” |

## 删除边界

必须删除：

- 支付创建链路中的 mock 回退。
- 支付成功回调链路中的 mock-success。
- 支付响应结构里的 mock 支付参数。
- 支付渠道常量中的 `mock`。
- 支付 mock 的配置项、错误码、DTO、仓储方法、后台展示分支。

不要误删：

- `miniapp/src/pages/order/create.vue` 中的 `createMockPricePreview`。它只在金额预览接口失败时生成 UI 兜底数据，不会创建支付单，也不会把订单置为支付成功。
- `miniapp/src/api/auth.ts` 中的 `mockLogin`。这是认证开发入口，不属于支付 mock。
- `docs/plan/day16-payment.md` 中的历史执行记录可以保留，但需要明确它不代表当前目标状态。

## 执行步骤

### 1. 配置层删除 mock 开关

修改 `server/.env.example`：

```env
PAYMENT_PROVIDER=wechat
```

删除：

```env
PAYMENT_MOCK_ENABLED=true
```

如果决定彻底去掉支付提供方切换，也可以删除 `PAYMENT_PROVIDER`，让项目默认且唯一使用微信支付。此时需要同步删除代码里的 `provider` 和 `isWechatEnabled`。

### 2. 支付配置类改为微信唯一配置

修改 `server/src/payments/wechat-pay.config.ts`：

- 删除 `provider` getter。
- 删除 `mockEnabled` getter。
- 删除 `isWechatEnabled` getter。
- 删除 `assertRuntime()` 中 `PAYMENT_MOCK_ENABLED` 的检查。
- 保留 `onModuleInit()`，启动时直接执行微信支付配置校验。

建议目标行为：

```ts
onModuleInit() {
  this.getWechatConfig()
}
```

如果本地开发阶段仍需要在没有微信证书时启动服务，需要单独引入测试环境跳过策略，但不能再回退支付 mock。建议只在 `NODE_ENV=test` 跳过，不在 `development` 跳过。

### 3. 删除 mock-success 路由

修改 `server/src/payments/payments.controller.ts`：

- 删除 `MockSuccessDto` import。
- 删除 `@Post('payments/mock-success')` 方法。
- 保留 `POST /orders/:id/pay`。
- 保留 `POST /payments/wechat/notify`。

验收行为：

- `POST /api/payments/mock-success` 返回 404。
- 小程序不再有任何地方调用该接口。

### 4. 精简支付服务为微信链路

修改 `server/src/payments/payments.service.ts`：

- 删除 `MockSuccessDto` import。
- `createPayment()` 改为直接：

```ts
async createPayment(userId: number, orderId: number, requestId?: string) {
  return this.createWechatPayment(userId, orderId, requestId)
}
```

- 删除 `createMockPayment()`。
- 删除 `mockSuccess()`。
- 删除 `presentPayOrderResult()`。
- 删除所有 `PAYMENT_CHANNEL.MOCK` 引用。
- 删除 mock 交易号生成逻辑。
- `writeNotifyLog()` 不再默认 mock 渠道。建议改为：

```ts
private async writeNotifyLog(
  paymentId: bigint,
  paymentNo: string,
  result: string,
  channel: PaymentChannel,
  rawBody?: string,
) {
  // ...
}
```

- `recordAbnormalPaymentSuccess()` 同样要求显式传入 `channel`，当前真实链路调用点传 `PAYMENT_CHANNEL.WECHAT`。
- `tryAutoAssignAfterPayment()` 中记录 `auto_assign_fail` 时也要显式传 `PAYMENT_CHANNEL.WECHAT`。

### 5. 删除 mock 仓储方法

修改 `server/src/payments/payments.repository.ts`：

- 删除 `findLatestMockPayment()`。
- 删除 `findLatestOrderPayment()`。
- 如果 `PAYMENT_CHANNEL` import 只用于 mock 查询，也一并删除。
- 保留 `findLatestPaymentByChannel()`、`findOrderForPayment()`、`findPaymentByNo()`。

### 6. 删除 mock DTO 和错误码

删除文件：

```text
server/src/payments/dto/mock-success.dto.ts
```

修改 `server/src/common/errors/error-code.ts`：

- 删除 `PAYMENT_MOCK_DISABLED = 60003`。
- 删除后运行全局搜索，确认没有残留引用。

### 7. 支付渠道常量只保留微信

修改 `server/src/payments/constants/payment-channel.ts`：

```ts
export const PAYMENT_CHANNEL = {
  WECHAT: 'wechat',
} as const
```

如果 `PaymentChannel` 类型仍被使用，保持：

```ts
export type PaymentChannel = typeof PAYMENT_CHANNEL[keyof typeof PAYMENT_CHANNEL]
```

### 8. 小程序类型收窄

修改 `miniapp/src/api/types/orders.ts`：

```ts
provider?: 'wechat'
```

确认小程序支付页、订单详情页只按 `uni.requestPayment` 处理微信参数，不再判断 mock provider。

### 9. 后台展示处理

修改 `server/src/admin-business/admin-business.service.ts` 的 `paymentChannel()`：

推荐上线前先清理 mock 支付历史数据，然后删除 mock 分支：

```ts
private paymentChannel(value: string) {
  if (value === 'wechat') return '微信支付'
  return value
}
```

如果短期内不清历史数据，后台遇到旧 `channel='mock'` 记录会直接显示 `mock`。这符合“删除 mock 业务代码”的目标，但需要运营侧知道这是历史开发数据。

### 10. 文档状态更新

`docs/plan/day16-payment.md` 是真实支付接入过程文档，里面有大量 mock 过渡策略。建议不改历史记录主体，只在文件末尾追加一段：

```md
后续状态：支付 mock 将按 docs/plan/day16-payment-mock-removal.md 删除，当前线上目标为微信支付唯一链路。
```

## 数据清理计划

代码删除前，需要决定是否清理开发数据库中的 mock 支付记录。

### 推荐策略

开发库和预发库删除 mock 支付数据，生产库不应存在 mock 支付数据。如果生产库存在，需要先导出核对，再人工确认。

### 清理顺序

由于 `refunds.payment_id` 对 `payments.id` 是限制删除，`payment_notify_logs.payment_id` 对 `payments.id` 是置空或可单独删除，建议顺序如下：

1. 查出 mock 支付记录：

```sql
SELECT id, payment_no, order_id, user_id, amount, status, created_at
FROM payments
WHERE channel = 'mock'
ORDER BY created_at DESC;
```

2. 查出 mock 支付关联退款：

```sql
SELECT r.*
FROM refunds r
JOIN payments p ON p.id = r.payment_id
WHERE p.channel = 'mock';
```

3. 开发库可直接清理关联退款：

```sql
DELETE r
FROM refunds r
JOIN payments p ON p.id = r.payment_id
WHERE p.channel = 'mock';
```

4. 清理 mock 支付通知日志：

```sql
DELETE FROM payment_notify_logs
WHERE channel = 'mock'
   OR payment_no IN (SELECT payment_no FROM payments WHERE channel = 'mock');
```

5. 清理 mock 支付记录：

```sql
DELETE FROM payments
WHERE channel = 'mock';
```

6. 复查：

```sql
SELECT COUNT(*) AS mock_payments FROM payments WHERE channel = 'mock';
SELECT COUNT(*) AS mock_logs FROM payment_notify_logs WHERE channel = 'mock';
```

### 订单状态注意事项

如果 mock 支付曾经把订单置为已支付，删除 `payments` 记录不会自动回滚订单状态。开发库可以接受；如果需要保持一致，需要额外核对这些订单：

```sql
SELECT o.id, o.order_no, o.status, o.paid_amount, o.paid_at
FROM orders o
WHERE EXISTS (
  SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.channel = 'mock'
);
```

上线环境不建议自动回滚订单，需要人工确认订单是否为真实业务订单。

## 验证清单

### 静态搜索

执行：

```powershell
rg -n "mock-success|MockSuccess|createMockPayment|mockSuccess|PAYMENT_MOCK|PAYMENT_CHANNEL\.MOCK|PAYMENT_MOCK_DISABLED|mockSuccessPath" server\src miniapp\src admin\src server\.env.example
```

预期：无结果。

执行：

```powershell
rg -n "provider\?: 'mock'|provider:\s*PAYMENT_CHANNEL\.MOCK|channel:\s*PAYMENT_CHANNEL\.MOCK" server\src miniapp\src
```

预期：无结果。

允许保留但需人工确认不是支付 mock：

```powershell
rg -n "mock" miniapp\src\pages\order\create.vue miniapp\src\api\auth.ts docs\plan
```

### 构建验证

执行：

```powershell
Set-Location server
pnpm build
```

执行：

```powershell
Set-Location miniapp
pnpm type-check
pnpm build:mp
```

执行：

```powershell
Set-Location admin
pnpm type-check
```

### 接口验证

1. 启动后端时，没有微信支付必填配置应启动失败或在支付配置初始化阶段报错。
2. `POST /api/payments/mock-success` 返回 404。
3. `POST /api/orders/:id/pay` 对待支付订单返回微信 JSAPI 参数：

```json
{
  "provider": "wechat",
  "paymentParams": {
    "timeStamp": "...",
    "nonceStr": "...",
    "package": "prepay_id=...",
    "signType": "RSA",
    "paySign": "..."
  }
}
```

4. 微信支付回调 `POST /api/payments/wechat/notify` 可以更新支付单、订单状态，并触发自动派单。

## 风险和处理

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| 本地没有微信支付证书后无法完整支付 | 开发调试不能再用 mock 成功推进订单 | 使用微信沙箱或真实测试商户号，或通过后台订单状态工具单独处理非支付测试 |
| 历史 `channel='mock'` 数据残留 | 后台列表可能显示 raw `mock`，统计可能混入开发数据 | 上线前清理开发和预发库，生产库先审计再决定 |
| 测试脚本依赖 mock-success | 删除后测试失败 | 全局搜索脚本和测试，把支付成功测试改为微信回调模拟或服务层事务测试 |
| `writeNotifyLog()` 默认渠道变更漏改 | 编译或运行时缺少参数 | 让 TypeScript 强制要求 `channel` 参数，构建阶段暴露漏改点 |
| 删除错误码导致引用残留 | 服务端编译失败 | 删除后执行 `pnpm build` 和 `rg PAYMENT_MOCK_DISABLED` |

## 建议执行顺序

1. 先做数据审计，确认是否存在需要保留的 mock 支付历史。
2. 删除后端 mock-success 入口和 mock 服务方法。
3. 删除配置开关、错误码、DTO、渠道常量。
4. 收窄小程序支付类型。
5. 处理后台支付渠道展示。
6. 执行静态搜索。
7. 执行服务端、小程序、后台构建验证。
8. 做真实微信支付创建和回调联调。

## 完成标准

- 代码目录中没有任何支付 mock 可执行路径。
- `/api/payments/mock-success` 不再存在。
- 支付接口只返回微信支付参数。
- 支付成功只能来自微信支付回调。
- `server/.env.example` 不再引导开发者启用 mock 支付。
- 构建和类型检查全部通过。

## 2026-06-18 执行记录

已按计划删除支付 mock，并同步删除 `target-gap-analysis-2026-06-05` 中 P0 提到的 `mock-login`、`dev-staff-session` 运行时入口：

- 后端删除 `/api/payments/mock-success`、`createMockPayment()`、`mockSuccess()`、`PAYMENT_CHANNEL.MOCK`、`PAYMENT_MOCK_DISABLED`、`MockSuccessDto`。
- 后端支付配置改为启动时校验微信支付配置，订单支付只走微信 JSAPI。
- 后端删除 `/api/auth/mock-login`、`/api/auth/dev-staff-session`。
- 师傅端身份解析改为基于当前 JWT 用户绑定的 active staff，不再依赖 `X-Staff-Id`。
- 小程序删除 mock 登录、dev staff session、mockDay4 工具、价格预览 mock 兜底和 mock 支付类型。
- 小程序环境文件删除 `VITE_ENABLE_MOCK_PAYMENT`，类型声明删除 mock/dev staff 环境变量。
- 静态搜索 `server/src`、`miniapp/src`、`admin/src`、环境样例中 `mock`/支付 mock/dev staff 关键字无运行时代码命中。
