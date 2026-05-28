# Day 8 订单后端系统行动计划

更新日期：2026-05-28

## 1. Day 8 目标

Day 8 的目标不是一次性做完真实微信支付、完整后台和师傅端，而是把订单后端主链路做成可推进、可审计、可防并发冲突的 MVP 内核。

主链路以 `orders.status` 为当前事实，以动作接口推动状态变化：

```txt
create_order        null -> pending_payment
pay_success         pending_payment -> pending_dispatch
admin_assign        pending_dispatch -> dispatched
staff_accept        dispatched -> accepted
staff_on_the_way    accepted -> on_the_way
staff_start         on_the_way -> in_service
staff_complete      in_service -> pending_confirm
user_confirm        pending_confirm -> completed
```

本阶段必须先落地：

```txt
订单创建
开发环境模拟支付
后台派单接口
师傅接单与履约接口
用户确认完成接口
统一状态推进服务
订单状态日志
P0 并发控制字段与索引
核心状态流转测试
```

本阶段暂不落地：

```txt
真实微信支付
真实退款
真实售后流程
自动派单算法
消息队列 / outbox_events
完整 idempotency_keys 表
后台 admin-web 页面
师傅端完整 UI
```

## 2. 当前数据库事实分层

订单系统必须按事实来源分层理解，不要把所有信息硬塞进 `orders`：

```txt
orders.status 是当前事实
order_status_logs 是历史事实
payments 是支付事实
order_assignments 是派单事实
service_checkins/service_photos 是履约事实
```

Day 8 后端实现时，任何状态变化都不能只更新 `orders.status`。一次动作至少要在同一个数据库事务里完成：

```txt
校验订单归属和当前状态
更新 orders.status
必要时更新 orders.staff_id / paid_at / completed_at / cancelled_at 等主表字段
写入 order_status_logs
写入对应事实表，例如 payments / order_assignments / service_checkins / service_photos
```

## 3. P0 数据库迁移范围

当前最小迁移只做 P0，不引入 P1/P2 表。

### 3.1 必须新增

`orders`：

```prisma
version Int @default(0)
```

用途：

```txt
支持乐观锁
识别旧页面重复提交
每次订单状态推进成功后 version + 1
```

`order_status_logs`：

```prisma
action    String? @db.VarChar(64)
requestId String? @map("request_id") @db.VarChar(64)
detail    Json?
```

用途：

```txt
action 记录是哪一个动作推动状态变化，例如 pay_success / staff_accept
requestId 串联接口日志、异常排查和重试请求
detail 存放结构化补充信息，例如拒单原因、支付单号、自动任务批次
```

### 3.2 必须新增索引

`orders`：

```prisma
@@index([userId, status])
@@index([staffId, status])
@@index([status, appointmentStartTime])
```

用途：

```txt
用户订单列表按状态筛选
师傅任务列表按状态筛选
后台按状态和预约时间筛选待处理订单
```

`order_status_logs`：

```prisma
@@index([orderId, createdAt])
@@index([requestId])
@@index([action])
```

用途：

```txt
按订单展示时间线
按 requestId 排查一次请求造成的状态变化
按 action 统计和排查高风险动作
```

### 3.3 本次不新增

```txt
idempotency_keys
outbox_events
refund 额外字段
after_sales 额外字段
order_assignments active/current 字段
```

这些能力要在代码接口和状态常量里预留，但不进入本次 P0 迁移。

## 4. 状态和动作常量

新增文件：

```txt
server/src/orders/constants/order-status.ts
server/src/orders/constants/order-action.ts
```

建议常量：

```ts
export const ORDER_STATUS = {
  PENDING_PAYMENT: 'pending_payment',
  PENDING_DISPATCH: 'pending_dispatch',
  DISPATCHED: 'dispatched',
  ACCEPTED: 'accepted',
  ON_THE_WAY: 'on_the_way',
  IN_SERVICE: 'in_service',
  PENDING_CONFIRM: 'pending_confirm',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REFUND_PENDING: 'refund_pending',
  REFUNDED: 'refunded',
  AFTER_SALES: 'after_sales',
} as const
```

```ts
export const ORDER_ACTION = {
  CREATE_ORDER: 'create_order',
  PAY_SUCCESS: 'pay_success',
  ADMIN_ASSIGN: 'admin_assign',
  STAFF_ACCEPT: 'staff_accept',
  STAFF_REJECT: 'staff_reject',
  STAFF_ON_THE_WAY: 'staff_on_the_way',
  STAFF_START: 'staff_start',
  STAFF_COMPLETE: 'staff_complete',
  USER_CONFIRM: 'user_confirm',
  USER_CANCEL_UNPAID: 'user_cancel_unpaid',
  TIMEOUT_UNPAID: 'timeout_unpaid',
  AUTO_CONFIRM: 'auto_confirm',
} as const
```

命名必须统一使用：

```txt
dispatched
after_sales
```

不要再混用：

```txt
assigned
after_sale
```

## 5. 统一状态机

新增文件：

```txt
server/src/orders/order-state-machine.ts
```

状态机只表达允许的动作，不直接操作数据库：

```ts
export const ORDER_TRANSITIONS = {
  create_order: {
    from: null,
    to: 'pending_payment',
  },
  pay_success: {
    from: 'pending_payment',
    to: 'pending_dispatch',
    lockMode: 'pessimistic',
  },
  admin_assign: {
    from: 'pending_dispatch',
    to: 'dispatched',
    lockMode: 'pessimistic',
  },
  staff_accept: {
    from: 'dispatched',
    to: 'accepted',
    lockMode: 'pessimistic',
  },
  staff_on_the_way: {
    from: 'accepted',
    to: 'on_the_way',
    lockMode: 'optimistic',
  },
  staff_start: {
    from: 'on_the_way',
    to: 'in_service',
    lockMode: 'optimistic',
  },
  staff_complete: {
    from: 'in_service',
    to: 'pending_confirm',
    lockMode: 'optimistic',
  },
  user_confirm: {
    from: 'pending_confirm',
    to: 'completed',
    lockMode: 'optimistic',
  },
  user_cancel_unpaid: {
    from: 'pending_payment',
    to: 'cancelled',
    lockMode: 'pessimistic',
  },
  timeout_unpaid: {
    from: 'pending_payment',
    to: 'cancelled',
    lockMode: 'pessimistic',
  },
  staff_reject: {
    from: 'dispatched',
    to: 'pending_dispatch',
    lockMode: 'pessimistic',
  },
  auto_confirm: {
    from: 'pending_confirm',
    to: 'completed',
    lockMode: 'optimistic',
  },
} as const
```

MVP 代码先实现主链路和 4 个常见异常分支：

```txt
user_cancel_unpaid
timeout_unpaid
staff_reject
auto_confirm
```

退款、支付后取消、售后只预留常量和设计，不在 Day 8 进入完整业务实现。

## 6. 锁策略

### 6.1 使用悲观锁的动作

使用 `SELECT ... FOR UPDATE`：

```txt
pay_success
admin_assign
staff_accept
staff_reject
user_cancel_unpaid
timeout_unpaid
后续 refund_request / refund_success
```

原因：

```txt
资金、派单、取消相关动作冲突成本高
同一订单可能被支付回调、用户、管理员、师傅或系统任务同时操作
动作往往需要同时写 orders、payments、order_assignments、order_status_logs
```

实现原则：

```txt
事务要短
事务内不调用微信、短信、地图、对象存储等外部服务
拿锁后重新读取订单并校验状态
锁顺序固定：orders -> payments/order_assignments -> logs
遇到 deadlock 或 lock wait timeout 只允许有限重试
```

### 6.2 使用乐观锁的动作

使用 `WHERE id = ? AND status = ? AND version = ?`：

```txt
staff_on_the_way
staff_start
staff_complete
user_confirm
auto_confirm
```

原因：

```txt
履约过程通常由当前师傅或当前用户单方推进
冲突概率较低
失败后前端刷新订单即可
```

典型 Prisma 写法：

```ts
const result = await tx.order.updateMany({
  where: {
    id: order.id,
    status: expectedStatus,
    version: order.version,
  },
  data: {
    status: nextStatus,
    version: { increment: 1 },
  },
})

if (result.count !== 1) {
  throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, '订单状态已变化，请刷新后重试', 409)
}
```

## 7. 统一状态推进服务

新增文件：

```txt
server/src/orders/order-transition.service.ts
```

核心接口：

```ts
interface TransitionParams {
  orderId: bigint
  expectedStatus: string
  nextStatus: string
  action: string
  operatorType: 'user' | 'staff' | 'admin' | 'system'
  operatorId: bigint
  requestId?: string
  version?: number
  lockMode?: 'optimistic' | 'pessimistic'
  remark?: string
  detail?: Record<string, unknown>
  check?: (order: OrderRecord) => void | Promise<void>
  sideEffect?: (tx: Prisma.TransactionClient, order: OrderRecord) => Promise<void>
}
```

职责：

```txt
封装状态合法性校验
封装乐观锁和悲观锁
封装订单主表更新
封装 order_status_logs 写入
允许业务动作在 sideEffect 中写 payments/order_assignments/service_checkins
统一抛出 ORDER_STATUS_INVALID / ORDER_FORBIDDEN 等错误
```

禁止：

```txt
在 controller 里直接更新 orders.status
在多个 service 方法里各自手写状态校验
绕过 OrderTransitionService 写 order_status_logs
在事务内调用外部接口
```

## 8. 后端模块结构

新增目录：

```txt
server/src/orders/
  orders.module.ts
  orders.controller.ts
  orders.service.ts
  orders.repository.ts
  order-transition.service.ts
  order-state-machine.ts
  order-presenter.ts
  constants/
    order-status.ts
    order-action.ts
  dto/
    create-order.dto.ts
    query-orders.dto.ts
    price-preview.dto.ts
    assign-order.dto.ts
    reject-order.dto.ts
    complete-service.dto.ts
```

新增目录：

```txt
server/src/payments/
  payments.module.ts
  payments.controller.ts
  payments.service.ts
  payments.repository.ts
  constants/
    payment-status.ts
    payment-channel.ts
```

如果 `AddressesModule` 尚未实现，Day 8 需要补齐最小用户地址模块，否则订单创建无法拿到地址快照。

## 9. API 行动清单

### 9.1 用户端订单接口

```txt
GET  /api/orders
GET  /api/orders/:id
GET  /api/orders/price-preview
POST /api/orders
POST /api/orders/:id/cancel
POST /api/orders/:id/confirm
POST /api/orders/:id/pay
```

要求：

```txt
全部需要用户登录
用户只能访问自己的订单
创建订单时服务价格、服务快照、地址快照以后端读取为准
cancel 只允许 pending_payment
confirm 只允许 pending_confirm
pay 只能创建或复用开发环境模拟支付单，最终状态推进必须走 pay_success
```

### 9.2 管理端订单接口

Day 8 只做后端接口，不做 admin-web：

```txt
GET  /api/admin/orders
GET  /api/admin/orders/:id
POST /api/admin/orders/:id/assign
```

要求：

```txt
assign 只允许 pending_dispatch
assign 成功后 orders.staff_id = staffId
写入 order_assignments
写入 order_status_logs(action=admin_assign)
使用悲观锁
```

### 9.3 师傅端订单接口

Day 8 只做后端接口：

```txt
GET  /api/staff/orders
GET  /api/staff/orders/:id
POST /api/staff/orders/:id/accept
POST /api/staff/orders/:id/reject
POST /api/staff/orders/:id/on-the-way
POST /api/staff/orders/:id/start-service
POST /api/staff/orders/:id/complete
```

要求：

```txt
师傅只能操作派给自己的订单
accept/reject 使用悲观锁
on-the-way/start/complete 使用乐观锁
complete 可先只写完成备注，照片上传后续接 service_photos
```

## 10. 支付 MVP

Day 8 的支付只做开发环境模拟支付，不接真实微信支付。

支付事实表使用现有 `payments`：

```txt
payment_no
order_id
user_id
channel = mock 或 wechat
amount
status = pending/success/failed
transaction_no
paid_at
callback_raw
```

模拟支付推进规则：

```txt
POST /api/orders/:id/pay 创建 pending payment
POST /api/payments/mock-success 将 payment 改为 success
mock-success 内部调用 OrderTransitionService 执行 pay_success
pay_success 使用悲观锁
pay_success 成功后 orders.status = pending_dispatch
pay_success 成功后 orders.paid_amount/payable_amount 对齐，写 paid_at
重复 mock-success 如果 payment 已 success 且订单已 pending_dispatch，返回当前结果，不重复推进状态
```

注意：

```txt
支付回调重复不是锁能完全解决的问题，真实微信支付阶段必须补 idempotency_keys 或支付回调唯一约束策略。
Day 8 可以用 payment.status + order.status + transaction_no 做最小幂等判断。
```

## 11. 错误码

更新文件：

```txt
server/src/common/errors/error-code.ts
```

建议新增：

```ts
USER_ADDRESS_NOT_FOUND = 30001,
USER_ADDRESS_FORBIDDEN = 30002,
ORDER_NOT_FOUND = 50001,
ORDER_STATUS_INVALID = 50002,
ORDER_FORBIDDEN = 50003,
ORDER_PRICE_CHANGED = 50004,
ORDER_ASSIGNMENT_INVALID = 50005,
PAYMENT_NOT_FOUND = 60001,
PAYMENT_STATUS_INVALID = 60002,
PAYMENT_MOCK_DISABLED = 60003,
STAFF_NOT_FOUND = 70001,
STAFF_FORBIDDEN = 70002,
```

HTTP 语义：

```txt
404 资源不存在
403 无权访问或无权操作
409 状态冲突、版本冲突、重复推进
400 参数不合法
```

## 12. 冲突场景验收

Day 8 至少覆盖以下冲突：

```txt
用户取消未支付订单 vs 支付成功回调
管理员 A 派给师傅 1 vs 管理员 B 派给师傅 2
师傅接单 vs 管理员重新派单
师傅接单 vs 师傅拒单
师傅完成服务 vs 用户旧页面确认完成
用户重复点击确认完成
支付成功回调重复到达
旧页面基于旧 version 提交履约动作
```

预期：

```txt
同一订单同一 fromStatus 只有一个动作能成功
失败方返回 409，并提示刷新订单
成功动作必须写一条 order_status_logs
成功动作必须让 orders.version + 1
支付成功、派单、接单、取消这些高风险动作不能出现半写入
```

## 13. 测试计划

### 13.1 单元测试

覆盖：

```txt
ORDER_TRANSITIONS 中每个 action 的 from/to
非法状态不能推进
不同 operatorType 的权限校验
乐观锁 updateMany count=0 时返回 409
```

### 13.2 集成或契约测试

更新：

```txt
server/scripts/contract-test.ts
```

最小链路：

```txt
mock-login
创建地址
创建订单 -> pending_payment
模拟支付成功 -> pending_dispatch
后台派单 -> dispatched
师傅接单 -> accepted
师傅出发 -> on_the_way
师傅开始服务 -> in_service
师傅完成服务 -> pending_confirm
用户确认完成 -> completed
查询订单详情，确认状态日志完整
```

冲突链路：

```txt
pending_payment 同时 cancel/pay_success，只允许一个成功
pending_dispatch 两次 assign，只允许一个成功
dispatched accept/reject，只允许一个成功
pending_confirm confirm 两次，只允许一个成功或第二次幂等返回当前完成结果
```

### 13.3 数据库验证

更新：

```txt
server/scripts/db-verify.ts
```

检查：

```txt
orders.version 存在
order_status_logs.action 存在
order_status_logs.request_id 存在
order_status_logs.detail 存在
P0 索引存在
```

## 14. 执行顺序

建议按以下顺序实施，避免先写接口导致状态逻辑散落：

```txt
1. 完成 P0 数据库迁移并生成 Prisma Client
2. 新增状态和动作常量
3. 新增 order-state-machine.ts
4. 新增 OrderTransitionService
5. 实现 OrdersModule 查询、创建、取消、确认
6. 实现 PaymentsModule mock pay 和 mock success
7. 实现后台派单接口
8. 实现师傅接单和履约推进接口
9. 补充状态日志展示
10. 补充 contract-test 和 db-verify
11. 运行 build / contract-test / db-verify
```

## 15. 完成标准

Day 8 可判定完成的标准：

```txt
Prisma schema 已包含 P0 并发字段和索引
迁移文件只包含 P0 内容
所有订单状态变化都经过 OrderTransitionService
主链路可以从 create_order 推进到 completed
订单详情可以看到当前状态和状态历史
支付成功、派单、接单、取消使用悲观锁
履约推进和确认完成使用乐观锁
重复提交或并发冲突返回明确 409
contract-test 覆盖主链路
db-verify 覆盖 P0 字段和索引
```

## 16. 后续预留

Day 8 之后再进入：

```txt
真实微信支付回调验签
退款状态机
idempotency_keys 表
outbox_events 表
自动派单策略
师傅定位和轨迹
服务照片上传
售后工单联动订单
后台订单操作审计增强
```

这些后续能力不应改变 Day 8 的核心原则：订单只能通过动作推进状态，数据库事务负责一致性，状态日志负责可追溯。
