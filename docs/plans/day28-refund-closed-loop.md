# Day 28 - 退款闭环目标与实施计划

## 1. 背景

当前项目已经具备退款相关的基础结构：

- `server/prisma/schema.prisma` 中已有 `Refund` 表。
- 订单状态中已有 `refund_pending`、`refunded`、`after_sales`。
- 用户取消已支付且待派单的现金预约订单时，当前逻辑可以创建一条 `pending` 退款记录。
- Admin 审核中心已经能读取 `pending` 退款记录。

但当前退款还不是完整闭环：

- Admin 审核退款时只更新 `refund.status = approved/rejected`。
- 审核通过后没有调用真实退款渠道。
- 渠道退款成功后没有统一更新 `refund`、`payment`、`order`。
- 没有退款回调处理和幂等保护。
- 会员卡购买退款、会员卡预约取消、现金预约退款之间的边界还需要进一步固化。

本计划目标是补齐从用户申请退款到渠道退款、订单完成关闭、审计可追踪的完整链路。

## 2. 退款闭环目标

完整退款闭环必须满足以下流程：

1. 用户申请退款或取消已支付订单。
2. 系统生成唯一退款单，进入 `pending`。
3. 后台审核通过后进入 `processing`，调用退款渠道。
4. 渠道退款成功后，事务内更新：
   - `refund.status = refunded`
   - `payment.status = refunded`，或记录支付单已退金额
   - `order.status = refunded`
   - 写订单状态日志、Admin 审计日志、支付通知日志
5. 渠道失败则进入 `failed`，允许后台重试或人工处理。
6. 后台拒绝则进入 `rejected`，订单状态按业务规则回退或进入售后关闭态。

### 2.1 闭环状态图

```text
用户取消已支付订单 / 用户申请退款
  -> Refund.pending
  -> Admin 审核
    -> reject
      -> Refund.rejected
      -> Order.pending_dispatch 或 Order.after_sales
    -> approve
      -> Refund.approved
      -> Refund.processing
      -> 调用 mock/wechat 退款
        -> success
          -> Refund.refunded
          -> Payment.refunded 或 refundedAmount 增加
          -> Order.refunded
        -> failed
          -> Refund.failed
          -> Order.refund_pending
          -> Admin retry/manual
```

说明：

- `processing` 是退款单状态，不建议新增订单状态 `processing`。
- 退款处理中时，订单继续保持 `refund_pending`，避免订单状态膨胀。
- 退款成功后订单进入 `refunded`。
- 退款失败后订单保持 `refund_pending`，由 Admin 重试或人工处理。

## 3. 范围

### 3.1 本轮必须完成

- 现金服务预约订单的退款闭环。
- mock 退款闭环，支持本地完整联调。
- 微信退款请求和退款回调的结构预留与主流程接入。
- Admin 审核通过、拒绝、重试退款。
- 小程序订单详情展示退款进度。
- 退款相关单元测试和集成测试。

### 3.2 本轮建议完成

- 会员卡购买退款的风控规则。
- 会员卡权益回收的自动校验。
- 售后退款入口和后台人工处理标记。

### 3.3 本轮不建议扩大

- 复杂部分退款比例计算。
- 优惠券、营销补贴、组合支付拆分退款。
- 跨渠道原路退回之外的人工打款流程。
- 财务对账报表的完整重构。

这些可以在退款闭环稳定后单独做。

## 4. 当前代码改造点

| 模块 | 当前状态 | 改造目标 |
|---|---|---|
| `server/prisma/schema.prisma` | `Refund` 表字段偏少，只关联 `Payment` | 增加渠道、处理时间、失败原因、重试次数、`Order` relation |
| `server/src/orders/orders.service.ts` | 已支付待派单现金订单取消后创建 pending refund | 将退款创建逻辑下沉到 `RefundsService` |
| `server/src/admin-business/admin-business.service.ts` | `reviewRefund` 只改状态 | 改为调用 `RefundsService.approveRefund/rejectRefund` |
| `server/src/orders/order-state-machine.ts` | 只有 `pending_dispatch -> refund_pending` | 增加退款成功、退款拒绝、售后申请等动作 |
| `server/src/payments/wechat-pay.client.ts` | 只有支付下单和支付回调解析 | 增加微信退款请求、退款回调解析 |
| `miniapp/src/pages/order/detail.vue` | 已有退款中提示，但没有完整进度 | 增加退款状态、失败、拒绝、成功展示 |
| `admin/src/views/life/audit/index.vue` | 能看到退款审核事项 | 增加退款详情、通过、拒绝、重试能力 |

## 5. 第一阶段：补业务规则

### 5.1 未支付订单取消

状态流：

```text
pending_payment -> cancelled
```

规则：

- 直接取消订单。
- 不生成退款单。
- 不写支付退款记录。
- 保留订单取消原因和取消时间。

验收：

- 用户重复取消返回当前订单状态。
- 数据库中不应新增 `refunds` 记录。

### 5.2 已支付服务预约取消

当前支持：

```text
pending_dispatch -> refund_pending
```

保留这条主流程。

规则：

- 已支付现金预约订单，用户在未派单前取消，进入退款审核。
- 系统生成唯一退款单，状态为 `pending`。
- 重复取消同一订单时不能重复生成退款单。
- `dispatched`、`accepted`、`on_the_way`、`in_service`、`completed` 阶段不直接自动退款，建议进入售后审核。

建议状态流：

```text
pending_dispatch + paid cancel
  -> order.refund_pending
  -> refund.pending
  -> admin approve
  -> refund.processing
  -> channel success
  -> order.refunded
```

### 5.3 会员卡预约取消

状态流：

```text
pending_dispatch -> cancelled
```

规则：

- 不走现金退款。
- 只释放冻结次数。
- 继续复用 `memberCards.releaseFrozenForOrder`。
- 必须保证重复取消不会重复释放冻结次数。

验收：

- 订单取消后 `member_card_records` 写入 release 记录。
- `refunds` 表不新增记录。
- 用户会员卡 `frozenUnits` 正确减少。

### 5.4 会员卡购买退款

会员卡购买退款是单独规则，不应和服务预约退款混用。

允许自动退款：

- 购买订单已支付。
- 已发放的用户会员卡存在。
- 会员卡完全未使用。
- `remainingUnits = totalUnits`。
- `frozenUnits = 0`。
- 没有关联服务订单占用该卡。

自动退款成功后：

- 回收用户会员卡权益。
- 用户会员卡状态改为 `refunded` 或 `disabled`。
- 写会员卡流水 `refund_revoke`。
- 购买订单改为 `refunded`。

禁止自动退款：

- 会员卡已有消费。
- 会员卡有冻结次数。
- 会员卡已参与服务预约。
- 卡状态异常或存在人工调整记录。

禁止自动退款时：

- 不直接调用退款渠道。
- 进入 `after_sales` 或人工售后。
- Admin 判断部分退款、补偿或拒绝。

## 6. 第二阶段：补数据模型

### 6.1 Refund 字段扩展

建议在 `Refund` 上补充字段：

```prisma
model Refund {
  id              BigInt    @id @default(autoincrement())
  refundNo        String    @unique @map("refund_no") @db.VarChar(64)
  orderId         BigInt    @map("order_id")
  paymentId       BigInt    @map("payment_id")
  amount          Decimal   @db.Decimal(10, 2)
  reason          String?   @db.VarChar(256)
  status          String    @db.VarChar(16)

  channel         String?   @db.VarChar(16)
  outRefundNo     String?   @map("out_refund_no") @db.VarChar(64)
  channelRefundNo String?   @map("channel_refund_no") @db.VarChar(64)
  failureReason   String?   @map("failure_reason") @db.VarChar(512)
  notifyRaw       String?   @map("notify_raw") @db.Text
  retryCount      Int       @default(0) @map("retry_count")

  reviewedBy      BigInt?   @map("reviewed_by")
  reviewedAt      DateTime? @map("reviewed_at")
  operatedBy      BigInt    @map("operated_by")
  processedAt     DateTime? @map("processed_at")
  refundedAt      DateTime? @map("refunded_at")

  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  order           Order     @relation(fields: [orderId], references: [id])
  payment         Payment   @relation(fields: [paymentId], references: [id])

  @@index([orderId])
  @@index([paymentId])
  @@index([status])
  @@index([channelRefundNo])
  @@map("refunds")
}
```

### 6.2 Refund 状态定义

统一状态：

| 状态 | 含义 | 可操作 |
|---|---|---|
| `pending` | 等待后台审核 | approve/reject |
| `approved` | 已审核通过，等待执行 | execute |
| `processing` | 已调用渠道，等待结果 | wait/retry after timeout |
| `refunded` | 渠道退款成功 | readonly |
| `failed` | 渠道退款失败 | retry/manual |
| `rejected` | 后台拒绝退款 | readonly 或 reopen |
| `cancelled` | 退款申请撤销 | readonly |

### 6.3 Payment 退款字段

短期方案：

- 增加或复用 `payment.status = refunded`。
- 仅支持全额退款。

中长期方案：

- 增加 `payment.refundedAmount`。
- 支持部分退款。
- 当 `refundedAmount = amount` 时，`payment.status = refunded`。
- 当 `0 < refundedAmount < amount` 时，`payment.status = partial_refunded`。

本轮建议先支持全额退款，字段设计预留部分退款。

### 6.4 数据迁移策略

已有退款数据迁移：

- `pending` 保持不变。
- `approved` 需要人工确认：
  - 如果实际未退款，改回 `pending` 或 `approved` 后重新执行。
  - 如果线下已退款，补 `refundedAt`、`channelRefundNo`，状态改为 `refunded`。
- 缺失 `channel` 的记录按支付单渠道回填。
- `outRefundNo` 默认回填为 `refundNo`。

## 7. 第三阶段：后端拆 RefundsService

### 7.1 新增模块

新增：

```text
server/src/refunds/refunds.module.ts
server/src/refunds/refunds.service.ts
server/src/refunds/refunds.controller.ts
server/src/refunds/dto/create-refund-request.dto.ts
server/src/refunds/dto/review-refund.dto.ts
server/src/refunds/dto/refund-query.dto.ts
server/src/refunds/constants/refund-status.ts
```

### 7.2 核心方法

`RefundsService` 至少提供：

```ts
createRefundRequest(orderId, reason, source)
approveRefund(refundId, adminContext)
rejectRefund(refundId, adminContext)
executeRefund(refundId)
handleRefundSuccess(refundIdOrRefundNo, channelRefundNo, rawNotify)
handleRefundFailed(refundIdOrRefundNo, reason, rawNotify)
retryRefund(refundId, adminContext)
```

### 7.3 createRefundRequest

职责：

- 校验订单存在。
- 校验订单类型。
- 校验订单支付状态。
- 查找成功支付单。
- 校验是否已有可复用退款单。
- 创建 `pending` 退款单。
- 写订单状态日志。

幂等规则：

- 同一 `orderId` 下如果存在 `pending/approved/processing/refunded` 退款单，不再创建新单。
- 如果存在 `failed` 退款单，默认复用并允许 retry，不创建第二条。
- 如果存在 `rejected`，需要用户重新发起申请或 Admin reopen。

### 7.4 approveRefund

职责：

- 校验当前退款状态必须为 `pending`。
- 写 `reviewedBy/reviewedAt/operatedBy`。
- 将 `refund.status` 改为 `approved`。
- 写 Admin 审计日志。
- 触发 `executeRefund`。

注意：

- 审核通过不能直接标记 `refunded`。
- 真实状态必须以 mock 成功或微信回调成功为准。

### 7.5 rejectRefund

职责：

- 校验当前退款状态必须为 `pending`。
- 将 `refund.status` 改为 `rejected`。
- 写拒绝原因。
- 写 Admin 审计日志。
- 更新订单状态。

拒绝后的订单状态规则：

| 场景 | 建议订单状态 |
|---|---|
| 用户撤销退款，服务仍可继续 | `pending_dispatch` |
| 服务无法继续，需要人工沟通 | `after_sales` |
| 订单本身异常 | `after_sales` |

实现建议：

- Admin 拒绝时增加 `nextOrderStatus`。
- 允许值只放开 `pending_dispatch` 和 `after_sales`。
- 默认使用 `after_sales`，避免拒绝后订单静默回到履约队列。

### 7.6 executeRefund

职责：

- 将 `approved` 改为 `processing`。
- 根据支付渠道选择退款实现：
  - `mock`：本地立即成功。
  - `wechat`：调用微信退款 API。
- 渠道调用失败时进入 `failed`。
- 渠道调用成功但需要回调确认时保持 `processing`。

幂等规则：

- `refunded` 直接返回成功。
- `processing` 不重复调用渠道，除非 Admin 明确 retry。
- retry 必须增加 `retryCount` 并记录审计。

### 7.7 handleRefundSuccess

事务内完成：

- 更新 `refund.status = refunded`。
- 写 `channelRefundNo`、`notifyRaw`、`processedAt`、`refundedAt`。
- 更新 `payment.status = refunded`，或增加 `payment.refundedAmount`。
- 更新 `order.status = refunded`。
- 写 `orderStatusLog`。
- 写 `paymentNotifyLog`。
- 如果是会员卡购买退款，回收会员卡权益并写会员卡流水。

幂等规则：

- 如果退款单已经是 `refunded`，直接返回成功。
- 不能重复扣减或重复回收会员卡权益。

### 7.8 handleRefundFailed

职责：

- 更新 `refund.status = failed`。
- 写 `failureReason`。
- 保持订单为 `refund_pending`。
- 写支付通知日志或退款处理日志。
- 后台允许 retry 或人工处理。

## 8. 第四阶段：状态机补齐动作

### 8.1 当前状态机缺口

当前只有：

```text
pending_dispatch -> refund_pending
```

该状态流只能表达“进入退款审核”，不能表达审核通过、执行中、退款成功、退款失败、退款拒绝后的订单变化。

### 8.2 建议新增 OrderAction

```ts
USER_REQUEST_REFUND
ADMIN_REFUND_APPROVE
ADMIN_REFUND_REJECT
REFUND_PROCESSING
REFUND_SUCCESS
REFUND_FAIL
AFTER_SALES_REQUEST
```

### 8.3 建议订单状态流

现金预约退款：

```text
pending_dispatch
  -- USER_CANCEL_PAID_REFUND -->
refund_pending
  -- REFUND_SUCCESS -->
refunded
```

退款拒绝：

```text
refund_pending
  -- ADMIN_REFUND_REJECT -->
pending_dispatch
```

或：

```text
refund_pending
  -- ADMIN_REFUND_REJECT -->
after_sales
```

售后申请：

```text
completed
  -- AFTER_SALES_REQUEST -->
after_sales
```

售后退款成功：

```text
after_sales
  -- REFUND_SUCCESS -->
refunded
```

说明：

- `REFUND_PROCESSING` 可以只写状态日志，不一定改变订单状态。
- `REFUND_FAIL` 建议订单仍保持 `refund_pending`。
- `ADMIN_REFUND_APPROVE` 可以只更新退款单和日志，不一定改变订单状态。

## 9. 第五阶段：支付渠道退款

### 9.1 mock 退款

本地开发先完成 mock 退款：

- Admin 审核通过后立即执行。
- `Refund.processing` 立刻进入 `Refund.refunded`。
- 同步更新订单和支付单。
- 用于前后台完整联调。

mock 成功返回建议：

```json
{
  "channel": "mock",
  "refundNo": "RF202607030001",
  "channelRefundNo": "MOCKRF202607030001",
  "status": "SUCCESS"
}
```

### 9.2 微信退款请求

微信退款接口：

```text
POST /v3/refund/domestic/refunds
```

请求关键字段：

```json
{
  "out_trade_no": "paymentNo",
  "out_refund_no": "refundNo",
  "reason": "用户取消预约",
  "notify_url": "https://api.example.com/api/payments/wechat/refund-notify",
  "amount": {
    "refund": 1000,
    "total": 1000,
    "currency": "CNY"
  }
}
```

需要在 `WechatPayClient` 中新增：

```ts
createRefund(input)
parseRefundNotify(rawBody, headers)
```

需要在 `wechat-pay.types.ts` 中新增：

- `WechatRefundRequest`
- `WechatRefundResponse`
- `WechatRefundNotify`
- `WechatRefundStatus`

### 9.3 微信退款回调

新增接口：

```text
POST /api/payments/wechat/refund-notify
```

处理逻辑：

1. 校验微信签名。
2. 解密 resource。
3. 根据 `out_refund_no` 查询退款单。
4. 如果退款单已 `refunded`，直接返回微信成功。
5. 如果回调状态为 `SUCCESS`，调用 `handleRefundSuccess`。
6. 如果回调状态为 `ABNORMAL/CLOSED`，调用 `handleRefundFailed`。
7. 写通知日志。

幂等要求：

- 同一个 `refundNo/channelRefundNo` 多次通知只能处理一次。
- 已成功退款不得重复改订单状态。
- 已回收会员卡权益不得重复回收。

## 10. 第六阶段：前后台页面

### 10.1 小程序

订单详情页增加退款进度：

```text
退款审核中
退款处理中
退款成功
退款失败
退款已拒绝
```

已支付订单取消：

- 弹窗明确提示：取消后将进入退款审核。
- 用户必须填写或选择退款原因。
- 提交后刷新订单详情。

已完成订单：

- 增加“申请售后/退款”入口。
- 不再只做 toast。
- 售后申请进入 `after_sales`，由 Admin 处理。

展示字段建议：

- 退款金额。
- 退款原因。
- 退款状态。
- 审核时间。
- 退款成功时间。
- 失败或拒绝原因。

### 10.2 Admin 后台

退款审核列表增加字段：

- 退款单号。
- 订单号。
- 用户。
- 支付渠道。
- 支付金额。
- 退款金额。
- 退款原因。
- 退款状态。
- 失败原因。
- 申请时间。
- 审核人。

操作：

- 通过。
- 拒绝。
- 重试退款。
- 查看订单。
- 查看支付单。

退款详情页：

- 订单信息。
- 用户信息。
- 支付信息。
- 退款信息。
- 渠道返回。
- 审计日志。
- 状态流时间线。

权限：

- `finance:refund:list` 查看。
- `finance:refund:audit` 审核。
- `finance:refund:retry` 重试。
- 普通运营不能执行退款重试。

## 11. 第七阶段：测试清单

### 11.1 单元测试

| 用例 | 预期 |
|---|---|
| 未支付订单取消 | 订单 `cancelled`，不生成退款单 |
| 已支付订单取消 | 订单 `refund_pending`，生成一条 `pending` 退款单 |
| 重复取消已支付订单 | 不重复生成退款单 |
| 审核通过 mock 退款 | 退款单 `refunded`，订单 `refunded`，支付单已退款 |
| 审核拒绝 | 退款单 `rejected`，订单进入约定状态 |
| 渠道失败 | 退款单 `failed`，订单仍 `refund_pending` |
| 重试失败退款 | 不新建退款单，`retryCount + 1` |

### 11.2 集成测试

| 场景 | 预期 |
|---|---|
| 现金预约支付后取消 | 退款审核列表出现记录 |
| Admin 审核通过 | mock 退款闭环完成 |
| Admin 拒绝退款 | 小程序展示拒绝结果 |
| 微信退款回调成功 | 状态只更新一次 |
| 微信退款重复回调 | 返回成功，不重复写核心状态 |
| 微信退款失败回调 | 进入 failed，可重试 |

### 11.3 会员卡测试

| 场景 | 预期 |
|---|---|
| 会员卡预约取消 | 释放冻结次数，不生成现金退款 |
| 会员卡预约重复取消 | 不重复释放冻结次数 |
| 会员卡购买后未使用退款 | 可退款，回收会员卡权益 |
| 会员卡购买后已消费退款 | 禁止自动退款，进入售后 |
| 会员卡购买后有冻结退款 | 禁止自动退款，进入售后 |

### 11.4 回归测试

- 正常支付不受影响。
- 支付回调幂等不受影响。
- 派单、接单、开始服务、完成服务不受影响。
- Admin 订单列表状态筛选不受影响。
- 小程序订单列表状态分组不受影响。

## 12. 接口计划

### 12.1 用户端接口

新增或调整：

```text
POST /api/orders/:id/refund-requests
GET  /api/orders/:id/refunds
```

`POST /api/orders/:id/refund-requests` 请求：

```json
{
  "reason": "临时有事，取消预约",
  "source": "user_cancel",
  "version": 3
}
```

返回：

```json
{
  "refundNo": "RF202607030001",
  "status": "pending",
  "orderStatus": "refund_pending"
}
```

### 12.2 Admin 接口

```text
GET  /api/admin/refunds
GET  /api/admin/refunds/:id
POST /api/admin/refunds/:id/approve
POST /api/admin/refunds/:id/reject
POST /api/admin/refunds/:id/retry
```

拒绝请求：

```json
{
  "remark": "订单已派单，需要走售后处理",
  "nextOrderStatus": "after_sales"
}
```

重试请求：

```json
{
  "remark": "渠道超时后人工重试"
}
```

### 12.3 微信回调接口

```text
POST /api/payments/wechat/refund-notify
```

返回微信成功：

```json
{
  "code": "SUCCESS",
  "message": "成功"
}
```

## 13. 日志与审计

必须写入：

- `orderStatusLog`
- `auditLog`
- `paymentNotifyLog` 或单独退款通知日志
- `memberCardRecord`，仅会员卡权益变动时

关键审计动作：

```text
refund:create
refund:approve
refund:reject
refund:execute
refund:success
refund:failed
refund:retry
member-card:refund-revoke
```

审计内容至少包含：

- 操作人。
- 操作时间。
- 退款单号。
- 订单号。
- 退款金额。
- 操作前状态。
- 操作后状态。
- 失败或拒绝原因。
- requestId。

## 14. 风险与控制

### 14.1 重复退款

风险：

- 用户重复取消。
- Admin 重复点击通过。
- 微信重复回调。

控制：

- `refundNo` 唯一。
- 同一订单同一支付单只允许一个活跃退款单。
- `refunded` 状态幂等返回。
- 渠道调用前检查 `status`。

### 14.2 钱退了但订单没更新

风险：

- 渠道退款成功后本地事务失败。

控制：

- 微信回调可重复处理。
- 提供 Admin 手动同步或重试入口。
- `processing` 超时记录待处理任务。

### 14.3 会员卡权益和现金双退

风险：

- 已使用会员卡仍自动退款。
- 冻结权益未释放又退款。

控制：

- 会员卡预约取消不生成现金退款。
- 会员卡购买退款前检查 `remainingUnits/frozenUnits/records`。
- 权益回收和退款成功状态必须同一事务处理。

### 14.4 退款拒绝后订单状态混乱

风险：

- 拒绝后订单回到履约队列，但用户以为已取消。

控制：

- Admin 拒绝必须选择 `pending_dispatch` 或 `after_sales`。
- 默认进入 `after_sales`。
- 小程序明确展示拒绝结果和后续处理方式。

## 15. 详细开发日计划

### Day 1：梳理退款规则和状态流

目标：

- 确认退款业务边界。
- 确认拒绝退款后的订单状态策略。

步骤：

1. 梳理所有订单类型：服务预约、会员卡购买、咨询订单。
2. 梳理所有支付方式：现金支付、会员卡抵扣、无需支付。
3. 确认哪些状态允许用户主动退款。
4. 确认哪些状态只能进入售后。
5. 确认退款拒绝后的默认订单状态。
6. 输出状态流和接口契约。

验收：

- 有明确的退款规则表。
- `pending_dispatch` 现金订单取消规则确定。
- 会员卡购买退款规则确定。

### Day 2：扩展数据模型和状态机

目标：

- 让数据库和状态机能承载退款闭环。

步骤：

1. 修改 `Refund` 模型，补充渠道、失败原因、重试次数、处理时间字段。
2. 增加 `Refund -> Order` relation。
3. 评估是否给 `Payment` 增加 `refundedAmount`。
4. 新增退款状态常量。
5. 新增订单动作常量。
6. 更新订单状态机。
7. 生成 Prisma migration。

验收：

- migration 可执行。
- Prisma 类型生成正常。
- 订单状态机覆盖退款成功和拒绝路径。

### Day 3：新增 RefundsService

目标：

- 退款逻辑从订单服务和 Admin 服务中拆出。

步骤：

1. 新建 `refunds` module/service/controller。
2. 实现 `createRefundRequest`。
3. 从 `OrdersService` 迁移 pending refund 创建逻辑。
4. 实现同一订单重复申请退款的幂等保护。
5. 实现退款金额校验。
6. 实现退款单查询方法。

验收：

- 已支付待派单订单取消后仍能创建退款单。
- 重复取消不会生成重复退款单。
- 订单服务中不再直接拼完整退款逻辑。

### Day 4：打通 mock 退款闭环

目标：

- 本地环境完整跑通退款申请、审核、执行、成功。

步骤：

1. 实现 `approveRefund`。
2. 实现 `rejectRefund`。
3. 实现 `executeRefund`。
4. 实现 mock 退款成功。
5. 实现 `handleRefundSuccess`。
6. 审核通过后更新 `refund/payment/order`。
7. 写订单状态日志和 Admin 审计日志。
8. 给 Admin 审核入口接入新服务。

验收：

- Admin 审核通过后订单变为 `refunded`。
- 退款单变为 `refunded`。
- 支付单变为已退款或记录已退金额。
- 审计日志存在。

### Day 5：接入微信退款

目标：

- 接入真实退款渠道的主链路。

步骤：

1. 在 `WechatPayClient` 新增退款请求。
2. 在 `wechat-pay.types.ts` 增加退款请求和响应类型。
3. 新增退款回调解析。
4. 新增 `/payments/wechat/refund-notify`。
5. 回调成功时调用 `handleRefundSuccess`。
6. 回调失败时调用 `handleRefundFailed`。
7. 增加微信重复回调幂等测试。

验收：

- 能发起微信退款请求。
- 能处理微信退款成功回调。
- 重复回调不会重复更新核心状态。

### Day 6：补会员卡退款规则

目标：

- 避免会员卡权益和现金退款产生冲突。

步骤：

1. 明确会员卡预约取消不生成退款单。
2. 加强 `releaseFrozenForOrder` 重复释放保护。
3. 实现会员卡购买退款资格检查。
4. 未使用会员卡允许退款并回收权益。
5. 已使用或冻结会员卡进入售后。
6. 写会员卡退款回收流水。

验收：

- 会员卡预约取消只释放冻结次数。
- 会员卡购买未使用可退款。
- 已使用会员卡不能自动退款。

### Day 7：完善小程序退款体验

目标：

- 用户能看到退款申请、审核、处理和结果。

步骤：

1. 订单详情展示退款状态。
2. 增加退款进度时间线。
3. 已支付取消弹窗要求填写退款原因。
4. 退款失败或拒绝时展示原因。
5. 已完成订单增加售后退款入口。
6. 订单列表售后分组适配新增状态。

验收：

- 用户取消已支付订单后能看到审核中。
- 审核通过后能看到处理中和已退款。
- 失败和拒绝状态有明确提示。

### Day 8：完善 Admin 退款管理

目标：

- Admin 能审核、拒绝、重试、追踪退款。

步骤：

1. 完善退款审核列表字段。
2. 新增或完善退款详情页。
3. 接入通过接口。
4. 接入拒绝接口。
5. 接入重试接口。
6. 展示失败原因和渠道退款号。
7. 展示审计日志和状态时间线。

验收：

- Admin 可以完成退款全流程操作。
- 财务人员能判断每笔退款当前状态。
- 所有操作都有审计记录。

### Day 9：测试与回归

目标：

- 覆盖核心退款路径，避免影响订单主流程。

步骤：

1. 补单元测试。
2. 补集成测试。
3. 补微信回调幂等测试。
4. 补会员卡预约取消测试。
5. 补会员卡购买退款测试。
6. 回归支付、派单、服务完成流程。
7. 回归小程序和 Admin 页面。

验收：

- 退款相关测试通过。
- 订单主流程测试通过。
- 没有重复退款、重复释放、重复回收权益问题。

### Day 10：上线准备和生产验证

目标：

- 安全上线退款闭环。

步骤：

1. 准备 migration。
2. 回填已有退款数据。
3. 配置 `REFUND_PROVIDER=mock/wechat`。
4. 检查微信退款回调地址。
5. 检查 Admin 权限。
6. 准备退款失败人工处理流程。
7. 小流量验证一笔 mock 或真实小额退款。
8. 观察日志、回调和订单状态。
9. 准备回滚方案。

验收：

- 生产环境配置完整。
- 回调地址可访问。
- 小额退款验证通过。
- 异常时可以人工处理。

## 16. 最终验收标准

必须满足：

- 用户取消已支付现金预约订单后，系统生成唯一退款单。
- Admin 审核通过后，不再直接标记已退款，而是进入退款执行。
- mock 退款可以完整更新 `refund/payment/order`。
- 微信退款支持请求和回调处理。
- 微信重复回调幂等。
- 退款失败可以重试。
- 退款拒绝后订单状态明确。
- 会员卡预约取消不生成现金退款。
- 会员卡购买退款有权益使用校验。
- 小程序和 Admin 都能看到退款状态。
- 所有关键操作有日志和审计记录。

## 17. 建议实施顺序

优先级：

1. `RefundsService` 和 mock 闭环。
2. 数据模型和状态机。
3. Admin 审核接入。
4. 小程序状态展示。
5. 微信退款和回调。
6. 会员卡购买退款保护。
7. 测试、迁移、上线。

原因：

- mock 闭环能最快验证本地业务逻辑。
- 微信退款依赖回调和商户配置，适合在本地闭环稳定后接入。
- 会员卡购买退款涉及权益回收，必须在现金退款闭环稳定后再做，避免钱和权益状态同时失控。
