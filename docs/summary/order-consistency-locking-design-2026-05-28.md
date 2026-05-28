# 订单一致性、防冲突与锁机制设计

更新日期：2026-05-28

## 1. 文档目标

本文档用于补充订单状态机的并发一致性设计。

当前主状态机为：

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

这条主链路本身是合理的，但真实系统中会出现用户、师傅、管理员、支付回调、系统任务同时操作同一订单的情况。本文重点解决：

```txt
哪些动作会冲突
哪些动作用悲观锁
哪些动作用乐观锁
哪些动作必须做幂等
哪些异常分支需要补充
如何用数据库事务保证订单状态一致
如何设计后续测试
```

## 2. 参考资料

本设计参考了以下官方资料和 GitHub 示例：

```txt
MySQL 8.4 Locking Reads
https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html

MySQL InnoDB Error Handling
https://dev.mysql.com/doc/refman/8.1/en/innodb-error-handling.html

Prisma Transactions / Optimistic Concurrency Control
https://www.prisma.io/docs/orm/prisma-client/queries/transactions

Stripe Idempotent Requests
https://docs.stripe.com/api/idempotent_requests

Eventuate Tram Customers and Orders Saga Example
https://github.com/eventuate-tram/eventuate-tram-examples-customers-and-orders-redis

Transaction Outbox
https://github.com/gruelbox/transaction-outbox

Optimistic Locking Example
https://github.com/eMahtab/optimistic-locking
```

从这些资料中抽象出的结论：

```txt
订单长流程不要一次完成，应由状态机逐步推进
资金和派单相关动作要更偏强一致
并发更新应靠数据库事务、行锁、条件更新、版本号
POST 重试必须有幂等设计
订单状态变化后的通知不应直接依赖事务内外部调用，应考虑 outbox
```

## 3. 基本设计原则

### 3.1 数据库是最终事实

订单状态以数据库为准：

```txt
orders.status 是当前事实
order_status_logs 是历史事实
payments 是支付事实
order_assignments 是派单事实
service_checkins/service_photos 是履约事实
```

前端页面、按钮状态、缓存都不能作为订单状态依据。

### 3.2 接口表达动作，不表达状态

不要设计：

```txt
PATCH /orders/:id/status
```

应该设计：

```txt
POST /orders/:id/pay
POST /admin/orders/:id/assign
POST /staff/orders/:id/accept
POST /staff/orders/:id/on-the-way
POST /staff/orders/:id/start-service
POST /staff/orders/:id/complete
POST /orders/:id/confirm
```

状态由后端根据动作和当前状态计算。

### 3.3 状态推进必须原子化

每次状态变化必须在同一事务内完成：

```txt
校验订单当前状态
更新 orders.status
写 order_status_logs
写相关业务表
必要时写 outbox_events
```

不能只更新 `orders.status`。

### 3.4 并发控制不靠前端

前端按钮禁用只能改善体验，不能保证一致性。

后端必须处理：

```txt
重复点击
网络重试
支付回调重复
多管理员同时派单
师傅接单和后台改派同时发生
用户取消和支付回调同时发生
旧页面提交动作
```

## 4. 推荐表结构补充

### 4.1 orders 增加 version

建议给 `orders` 增加版本号：

```prisma
version Int @default(0)
```

用途：

```txt
乐观锁
防旧页面提交
防并发覆盖
状态变更时 version + 1
```

### 4.2 order_status_logs 增加 action 和 requestId

当前字段已经有状态变化基础信息，建议补：

```prisma
action    String? @db.VarChar(64)
requestId String? @map("request_id") @db.VarChar(64)
```

用途：

```txt
追踪哪个动作导致状态变化
按 requestId 排查并发和重复请求
```

### 4.3 新增 idempotency_keys

建议新增幂等表：

```txt
id
key
scope
request_hash
resource_type
resource_id
response_json
status
created_at
expired_at
```

建议唯一约束：

```txt
unique(scope, key)
```

用途：

```txt
防重复创建订单
防重复创建支付单
防重复派单
防重复确认
支持前端/服务端网络重试
```

### 4.4 新增 outbox_events

建议新增事务 outbox 表：

```txt
id
event_type
aggregate_type
aggregate_id
payload
status
created_at
sent_at
retry_count
last_error
```

用途：

```txt
状态变化后可靠发送通知
避免订单状态已变但通知未发
后续可接消息队列
```

MVP 可以先写表但不接队列，后续用定时任务扫描发送。

## 5. 锁机制选择标准

### 5.1 悲观锁

悲观锁适合：

```txt
资金相关
派单相关
一个动作涉及多张表强一致写入
冲突概率高
失败成本高
必须串行处理
```

典型实现：

```sql
SELECT id FROM orders WHERE id = ? FOR UPDATE;
```

特点：

```txt
同一订单同一时间只有一个事务能持有锁
后续事务等待
第一个事务提交后，后续事务重新读取状态并校验
```

注意：

```txt
事务内不要调用微信、短信、地图等外部接口
事务要短
锁顺序要固定
遇到 deadlock 或 lock wait timeout 要有限重试
```

### 5.2 乐观锁

乐观锁适合：

```txt
冲突概率低
只有当前用户/当前师傅通常会操作
动作简单
允许失败后提示刷新
```

典型实现：

```txt
WHERE id = ? AND status = ? AND version = ?
SET status = ?, version = version + 1
```

Prisma 可以使用：

```ts
await tx.order.updateMany({
  where: {
    id: BigInt(orderId),
    status: expectedStatus,
    version,
  },
  data: {
    status: nextStatus,
    version: { increment: 1 },
  },
})
```

返回 `count !== 1` 时，说明订单已经被其他动作更新。

### 5.3 条件更新

如果暂时不加 `version`，至少要做状态条件更新：

```txt
WHERE id = ? AND status = ?
```

这能保证同一个 fromStatus 只能被一个动作成功消费。

### 5.4 幂等

锁解决“同时执行”，幂等解决“重复执行”。

必须做幂等的场景：

```txt
用户重复提交订单
用户重复发起支付
微信支付重复回调
管理员重复派单
师傅重复接单
用户重复确认完成
网络超时后客户端重试
```

## 6. 主状态动作锁策略

| 动作 | 状态流转 | 推荐机制 | 幂等要求 | 说明 |
|---|---|---|---|---|
| `create_order` | `null -> pending_payment` | 事务 + 幂等 key | 必须 | 防用户重复提交订单 |
| `pay_success` | `pending_payment -> pending_dispatch` | 悲观锁 + 支付幂等 | 必须 | 资金相关，和取消冲突最高 |
| `admin_assign` | `pending_dispatch -> dispatched` | 悲观锁 | 建议 | 多管理员派单、用户取消会冲突 |
| `staff_accept` | `dispatched -> accepted` | 条件更新；高冲突可悲观锁 | 建议 | 与拒单、改派冲突 |
| `staff_on_the_way` | `accepted -> on_the_way` | 乐观锁/条件更新 | 可选 | 通常只有当前师傅操作 |
| `staff_start` | `on_the_way -> in_service` | 乐观锁/条件更新 | 可选 | 通常只有当前师傅操作 |
| `staff_complete` | `in_service -> pending_confirm` | 事务 + 条件更新；校验照片时可悲观锁 | 建议 | 需要校验照片/打卡记录 |
| `user_confirm` | `pending_confirm -> completed` | 乐观锁/条件更新 | 建议 | 用户重复点击较常见 |

## 7. 高频冲突场景分析

### 7.1 用户取消 vs 支付回调

场景：

```txt
订单 pending_payment
用户点击取消
微信支付回调同时到达
```

风险：

```txt
取消成功后支付回调又把订单改成 pending_dispatch
支付成功后用户端仍显示取消成功
```

设计：

```txt
pay_success 使用悲观锁
cancel_unpaid 使用同一订单行锁或条件更新
谁先成功谁改变状态
后到者重新读取状态并按规则处理
```

规则建议：

```txt
支付先成功:
  pending_payment -> pending_dispatch
  用户取消失败，提示订单已支付

取消先成功:
  pending_payment -> cancelled
  支付回调到达时不能改成 pending_dispatch
  应写 payment_notify_logs
  标记异常支付或进入 refund_pending
```

需要补充分支：

```txt
pay_after_cancel:
  cancelled + payment_success -> refund_pending 或 abnormal_payment
```

MVP 可先记录异常支付日志，后台人工处理退款。

### 7.2 管理员派单 vs 用户取消

场景：

```txt
订单 pending_dispatch
管理员正在派单
用户正在取消
```

设计：

```txt
admin_assign 使用悲观锁
用户取消 pending_dispatch 也必须使用锁或条件更新
谁先成功，另一个失败并提示状态已变化
```

规则建议：

```txt
如果 pending_dispatch 允许用户直接取消:
  pending_dispatch -> cancelled

如果更偏商用:
  用户不能直接取消，改为 cancel_request
  后台审核后走退款
```

MVP 建议：

```txt
未支付订单可直接取消
已支付待派单订单先做“联系客服/申请取消”，避免退款闭环没做完整时出现资金问题
```

### 7.3 管理员 A 派单 vs 管理员 B 派单

场景：

```txt
两个管理员同时给同一订单派不同师傅
```

风险：

```txt
出现多个 active assignment
orders.staffId 最终值和 assignment 记录不一致
```

设计：

```txt
admin_assign 必须悲观锁 orders 行
事务内检查 status=pending_dispatch
事务内创建 order_assignment
事务内更新 orders.staffId 和 status=dispatched
```

结果：

```txt
第一个管理员成功
第二个管理员等待锁后读到 status=dispatched，派单失败
```

### 7.4 后台改派 vs 师傅接单

场景：

```txt
订单 dispatched
管理员想改派
原师傅同时点击接单
```

风险：

```txt
原师傅接单成功，但后台又把订单改给新师傅
```

设计：

```txt
staff_accept 条件:
  status=dispatched
  staffId=当前师傅

admin_reassign 条件:
  status=dispatched
```

两者竞争同一个状态。

规则建议：

```txt
师傅先接单:
  dispatched -> accepted
  改派失败，提示订单已被师傅接单

后台先改派:
  orders.staffId 改成新师傅
  原师傅 accept 因 staffId 不匹配失败
```

是否允许 `accepted` 后改派要单独设计，不建议 MVP 初期开放。

### 7.5 师傅接单 vs 师傅拒单

场景：

```txt
师傅端重复点击或两个请求同时发出
```

设计：

```txt
accept: dispatched -> accepted
reject: dispatched -> pending_dispatch
```

两者都要求 `status=dispatched`。

结果：

```txt
只能成功一个
另一个返回状态已变化
```

拒单后建议：

```txt
order_assignment.assignStatus = rejected
orders.staffId = null
orders.status = pending_dispatch
写 rejectReason
通知后台重新派单
```

### 7.6 师傅完成 vs 用户确认

场景：

```txt
用户旧页面误点确认
师傅还没有完成服务
```

设计：

```txt
user_confirm 只允许 pending_confirm -> completed
```

结果：

```txt
如果订单还在 in_service，用户确认失败
```

这说明前端按钮隐藏不够，后端状态校验必须存在。

### 7.7 用户打开旧页面操作

场景：

```txt
用户打开订单详情时状态是 pending_payment
后台或支付回调已经把它变成 pending_dispatch
用户仍点击取消
```

设计：

```txt
接口提交 version
后端 WHERE id/status/version 条件更新
失败时返回 ORDER_STATUS_CHANGED
前端提示刷新
```

### 7.8 支付回调重复通知

场景：

```txt
微信重复推送同一笔支付结果
```

设计：

```txt
transactionNo 唯一
paymentNo 唯一
回调处理前检查 payment.status
已 success 直接返回成功
仍写或忽略重复 notify log，按需要定
```

注意：

```txt
重复回调不能重复写收入
不能重复推进订单状态
不能重复发核心通知
```

### 7.9 师傅履约动作乱序

场景：

```txt
师傅直接点开始服务
但订单还没有 on_the_way
```

设计：

```txt
staff_start 只允许 on_the_way -> in_service
```

同理：

```txt
staff_on_the_way 只允许 accepted -> on_the_way
staff_complete 只允许 in_service -> pending_confirm
```

## 8. 需要补充的状态分支

当前主流程只覆盖了最理想的正向路径。订单系统必须给异常、退款、拒单、改派、超时、售后留下空间。

设计这些分支时要先区分两类状态：

```txt
订单主状态：写入 orders.status，表示订单当前业务阶段
子流程状态：写入 payments/refunds/order_assignments/tickets 等子表，不一定污染 orders.status
```

不要把所有细节都塞进 `orders.status`，否则状态会爆炸。原则是：

```txt
影响用户、后台、师傅主流程判断的，进入 orders.status
只影响支付、退款、派单、售后内部处理的，进入子表状态
```

### 8.1 MVP 必须预留的订单主状态

建议 MVP 先统一这些 `OrderStatus`：

```txt
pending_payment     待支付
pending_dispatch    待派单
dispatched          已派单，待师傅接单
accepted            师傅已接单
on_the_way          上门中
in_service          服务中
pending_confirm     待用户确认
completed           已完成
cancelled           已取消
refund_pending      退款中
refunded            已退款
after_sales         售后中
```

这几个状态已经足够承载 MVP 主流程、取消、退款和售后入口。

### 8.2 MVP 第一阶段就应该实现的异常分支

这些分支不复杂，但如果不做，订单闭环会很脆。

```txt
user_cancel_unpaid:
  pending_payment -> cancelled
  用户未支付前取消订单，不涉及退款

timeout_unpaid:
  pending_payment -> cancelled
  超时未支付自动取消，操作者为 system

staff_reject:
  dispatched -> pending_dispatch
  师傅拒单，订单回到待派单，当前派单记录 rejected

user_confirm:
  pending_confirm -> completed
  用户确认完成

auto_confirm:
  pending_confirm -> completed
  用户超时未确认，系统自动确认完成
```

第一阶段建议只允许：

```txt
pending_payment 可以直接取消
pending_dispatch 之后不要让用户直接取消，先做“联系客服/申请取消”入口
```

这样可以避免微信退款闭环没完成时出现资金状态不一致。

### 8.3 第二阶段需要补的支付退款分支

当接入真实微信支付后，必须补：

```txt
admin_cancel_before_dispatch:
  pending_dispatch -> refund_pending
  已支付但未派单，后台取消后进入退款中

refund_success:
  refund_pending -> refunded
  微信退款成功后进入已退款

refund_failed:
  refund_pending -> pending_dispatch 或保持 refund_pending
  退款失败需要后台处理，不能直接丢状态

pay_after_cancel:
  cancelled + payment_success -> refund_pending 或 abnormal_payment
  订单已取消但支付回调后到，不能改成 pending_dispatch
```

这里可以先不新增 `abnormal_payment` 到 `orders.status`。更推荐：

```txt
orders.status 保持 cancelled
payments.status = success
payment_notify_logs.processResult = abnormal_after_cancel
refunds.status = pending
后台待处理列表展示这类异常支付
```

只有当产品上需要用户直接看到“异常支付处理中”时，再考虑新增订单主状态。

### 8.4 第三阶段需要补的改派分支

改派不能简单理解为 `dispatched -> dispatched`，因为它涉及旧师傅、新师傅、旧派单记录、新派单记录。

建议规则：

```txt
admin_reassign_before_accept:
  dispatched -> dispatched
  旧 assignment 标记 cancelled/reassigned
  新 assignment 标记 pending
  orders.staffId 改成新师傅

admin_reassign_after_accept:
  accepted/on_the_way -> dispatched 或 pending_dispatch
  MVP 不建议开放
  如果开放，必须记录改派原因，并通知用户和原师傅
```

MVP 建议：

```txt
只允许 dispatched 且师傅未接单时改派
accepted 之后需要后台先取消/异常处理，不做直接改派
```

### 8.5 第四阶段需要补的售后分支

售后不一定要覆盖订单主状态。建议：

```txt
after_sales_open:
  pending_confirm/completed -> after_sales
  创建 tickets

after_sales_resolved_no_refund:
  after_sales -> completed
  售后解决，无退款

after_sales_refund:
  after_sales -> refund_pending
  售后处理为退款

after_sales_closed:
  after_sales -> completed
  工单关闭，订单回到完成态
```

注意：

```txt
售后工单自己的状态应放在 tickets.status
orders.status 只表示订单进入售后中
```

### 8.6 建议预留但暂不实现的状态动作清单

```txt
user_cancel_unpaid
timeout_unpaid
staff_reject
admin_reassign_before_accept
admin_cancel_before_dispatch
refund_request
refund_success
refund_failed
pay_after_cancel
auto_confirm
after_sales_open
after_sales_resolved_no_refund
after_sales_refund
after_sales_closed
```

这些动作应进入 `OrderAction` 常量，即使部分动作暂时只保留 TODO。

## 9. 推荐统一状态推进服务

不要把状态校验散落在不同 service 方法里。否则订单模块、支付模块、后台派单模块、师傅任务模块都会各自写一套状态判断，后续必然产生不一致。

建议建立统一的 `OrderTransitionService`。

### 9.1 核心接口

```ts
interface TransitionParams {
  orderId: number
  expectedStatus: OrderStatus | OrderStatus[]
  nextStatus: OrderStatus
  action: OrderAction
  operatorType: 'user' | 'staff' | 'admin' | 'system'
  operatorId: number
  requestId?: string
  version?: number
  lockMode?: 'optimistic' | 'pessimistic'
  idempotencyKey?: string
  remark?: string
  check?: (order: OrderRecord) => void | Promise<void>
  sideEffect?: (tx: Prisma.TransactionClient, order: OrderRecord) => Promise<void>
  outbox?: (order: OrderRecord) => OutboxEventPayload[]
}
```

字段说明：

```txt
orderId
  要推进的订单

expectedStatus
  允许的前置状态，可以是一个或多个

nextStatus
  目标状态

action
  业务动作，例如 staff_accept、pay_success

operatorType/operatorId
  操作者身份，用于权限、日志、审计

requestId
  请求链路追踪

version
  乐观锁版本号

lockMode
  optimistic 用条件更新
  pessimistic 用 SELECT ... FOR UPDATE

idempotencyKey
  防重复提交

check
  动作专属校验，例如师傅是否匹配、地址是否属于用户

sideEffect
  同事务内业务副作用，例如写 payment、assignment、refund

outbox
  同事务内写通知事件，事务外异步发送
```

### 9.2 统一处理流程

`OrderTransitionService.transition()` 内部固定流程：

```txt
1. 校验 idempotencyKey，如果已处理则返回历史结果
2. 开启数据库事务
3. 根据 lockMode 选择悲观锁或乐观锁
4. 读取订单
5. 校验订单存在
6. 校验订单当前状态在 expectedStatus 内
7. 执行 check，校验操作者、归属、业务规则
8. 执行 sideEffect，写相关业务表
9. 更新 orders.status/version/关键时间字段
10. 写 order_status_logs
11. 写 outbox_events
12. 保存 idempotency 处理结果
13. 提交事务
14. 返回最新订单详情
```

### 9.3 状态元数据

建议把状态元数据集中定义：

```ts
export const ORDER_TRANSITIONS = {
  create_order: {
    from: null,
    to: 'pending_payment',
    lockMode: 'optimistic',
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
    lockMode: 'optimistic',
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
} as const
```

异常分支也放在同一处：

```ts
export const ORDER_EXCEPTION_TRANSITIONS = {
  user_cancel_unpaid: {
    from: 'pending_payment',
    to: 'cancelled',
    lockMode: 'optimistic',
  },
  timeout_unpaid: {
    from: 'pending_payment',
    to: 'cancelled',
    lockMode: 'pessimistic',
  },
  staff_reject: {
    from: 'dispatched',
    to: 'pending_dispatch',
    lockMode: 'optimistic',
  },
  admin_cancel_before_dispatch: {
    from: 'pending_dispatch',
    to: 'refund_pending',
    lockMode: 'pessimistic',
  },
  refund_success: {
    from: 'refund_pending',
    to: 'refunded',
    lockMode: 'pessimistic',
  },
  auto_confirm: {
    from: 'pending_confirm',
    to: 'completed',
    lockMode: 'pessimistic',
  },
  after_sales_open: {
    from: ['pending_confirm', 'completed'],
    to: 'after_sales',
    lockMode: 'pessimistic',
  },
} as const
```

### 9.4 时间字段更新规则

统一服务里还应负责关键时间字段：

```txt
pay_success:
  paidAt = now
  paidAmount = payableAmount

user_cancel_unpaid / timeout_unpaid:
  cancelledAt = now
  cancelReason = reason

staff_complete:
  不写 completedAt，只进入 pending_confirm

user_confirm / auto_confirm:
  completedAt = now

refund_success:
  可写 refundedAt 到 refunds 表，orders 可不加字段
```

### 9.5 谁调用统一服务

各业务模块只负责准备参数，不直接改状态：

```txt
OrdersService
  create_order
  user_cancel_unpaid
  user_confirm

PaymentsService
  pay_success
  refund_success

AdminOrdersService
  admin_assign
  admin_reassign_before_accept
  admin_cancel_before_dispatch

StaffOrdersService
  staff_accept
  staff_reject
  staff_on_the_way
  staff_start
  staff_complete

SystemJobsService
  timeout_unpaid
  auto_confirm
```

## 10. 悲观锁伪代码

适合：

```txt
pay_success
admin_assign
pending_dispatch 阶段取消/退款
关键改派
```

示例：

```ts
await prisma.$transaction(async (tx) => {
  await tx.$queryRaw`
    SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE
  `

  const order = await tx.order.findUnique({
    where: { id: BigInt(orderId) },
  })

  if (!order) {
    throw new BusinessException(ErrorCode.ORDER_NOT_FOUND, '订单不存在')
  }

  if (order.status !== expectedStatus) {
    throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, '订单状态已变化，请刷新')
  }

  await checkBusinessRules(order)

  await sideEffect(tx, order)

  await tx.order.update({
    where: { id: BigInt(orderId) },
    data: {
      status: nextStatus,
      version: { increment: 1 },
    },
  })

  await tx.orderStatusLog.create({
    data: {
      orderId: BigInt(orderId),
      fromStatus: expectedStatus,
      toStatus: nextStatus,
      operatorType,
      operatorId: BigInt(operatorId),
      action,
      requestId,
      remark,
    },
  })
})
```

注意：

```txt
FOR UPDATE 必须在事务内
锁住行之后再读订单和检查状态
事务内不要调用外部服务
```

## 11. 乐观锁伪代码

适合：

```txt
staff_on_the_way
staff_start
staff_complete
user_confirm
```

示例：

```ts
await prisma.$transaction(async (tx) => {
  const order = await tx.order.findUnique({
    where: { id: BigInt(orderId) },
  })

  if (!order) {
    throw new BusinessException(ErrorCode.ORDER_NOT_FOUND, '订单不存在')
  }

  await checkBusinessRules(order)

  const result = await tx.order.updateMany({
    where: {
      id: BigInt(orderId),
      status: expectedStatus,
      version,
    },
    data: {
      status: nextStatus,
      version: { increment: 1 },
    },
  })

  if (result.count !== 1) {
    throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, '订单状态已变化，请刷新')
  }

  await sideEffect(tx, order)

  await tx.orderStatusLog.create({
    data: {
      orderId: BigInt(orderId),
      fromStatus: expectedStatus,
      toStatus: nextStatus,
      operatorType,
      operatorId: BigInt(operatorId),
      action,
      requestId,
    },
  })
})
```

注意：

```txt
如果 sideEffect 依赖最新状态，可先做业务校验，再 updateMany，再写 sideEffect
如果 sideEffect 本身也会写关键表，应保持在同一事务内
```

## 12. 死锁与重试策略

MySQL 文档明确指出死锁不是异常罕见情况，应用应该能处理。

建议：

```txt
只对可重试的事务错误重试
最多重试 2-3 次
每次退避 50ms/100ms/200ms
重试必须基于幂等设计
```

常见错误：

```txt
Deadlock found when trying to get lock
Lock wait timeout exceeded
```

重试限制：

```txt
不能无限重试
不能重试已经调用外部接口的事务
支付回调重试必须依赖 transactionNo 幂等
```

## 13. 事务边界注意事项

事务内可以做：

```txt
读取订单
锁订单行
更新订单
写支付表
写派单表
写状态日志
写 outbox
```

事务内不要做：

```txt
调用微信支付接口
发送短信
发送微信订阅消息
调用地图接口
上传文件
耗时计算
```

正确模式：

```txt
事务内写业务事实和 outbox
事务外或异步 worker 发送通知
```

## 14. 当前项目推荐行动计划

这部分是后续实现订单状态机和防冲突机制的行动计划。目标不是一次性做完所有异常，而是先把主流程稳定跑通，同时把异常扩展点留好。

### 14.1 Phase 0：统一语言和常量

先完成状态和动作常量，避免后续前后端状态名不一致。

产出：

```txt
server/src/orders/constants/order-status.ts
server/src/orders/constants/order-action.ts
miniapp/src/api/types/orders.ts 同步状态名
```

必须统一：

```txt
dispatched 不再混用 assigned
after_sales 不再混用 after_sale
pending_confirm 不再混用 pending_complete
```

建议定义：

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

动作常量：

```ts
export const ORDER_ACTION = {
  CREATE_ORDER: 'create_order',
  PAY_SUCCESS: 'pay_success',
  ADMIN_ASSIGN: 'admin_assign',
  STAFF_ACCEPT: 'staff_accept',
  STAFF_ON_THE_WAY: 'staff_on_the_way',
  STAFF_START: 'staff_start',
  STAFF_COMPLETE: 'staff_complete',
  USER_CONFIRM: 'user_confirm',
  USER_CANCEL_UNPAID: 'user_cancel_unpaid',
  TIMEOUT_UNPAID: 'timeout_unpaid',
  STAFF_REJECT: 'staff_reject',
  ADMIN_REASSIGN_BEFORE_ACCEPT: 'admin_reassign_before_accept',
  ADMIN_CANCEL_BEFORE_DISPATCH: 'admin_cancel_before_dispatch',
  REFUND_SUCCESS: 'refund_success',
  AUTO_CONFIRM: 'auto_confirm',
  AFTER_SALES_OPEN: 'after_sales_open',
} as const
```

### 14.2 Phase 1：数据库安全底座

先做最小必要迁移。

建议迁移：

```txt
orders.version Int default 0
order_status_logs.action varchar(64) nullable
order_status_logs.request_id varchar(64) nullable
payments.transaction_no unique 可空唯一策略需要结合 MySQL 实际行为确认
payments.payment_no unique 已有
```

如果暂时不想加 `idempotency_keys` 和 `outbox_events`，也要先预留文档和 TODO。

验收：

```txt
Prisma migrate 成功
Prisma generate 成功
已有 seed 不受影响
旧订单 version 默认 0
```

### 14.3 Phase 2：实现 OrderTransitionService

新增：

```txt
server/src/orders/order-transition.service.ts
server/src/orders/order-state-machine.ts
server/src/orders/order-presenter.ts
```

`OrderTransitionService` 首批支持：

```txt
optimistic 条件更新
pessimistic SELECT ... FOR UPDATE
expectedStatus 校验
version 校验
operatorType/operatorId
order_status_logs 写入
requestId 写入
```

首批暂不强制支持：

```txt
idempotencyKey
outbox
复杂 retry
```

但接口参数中保留位置，后续可以补。

验收：

```txt
主流程 8 个动作都必须通过 transition 服务推进状态
业务 service 不允许直接 update orders.status
```

### 14.4 Phase 3：接入 Day 7 用户端订单闭环

先让用户端真实订单闭环稳定：

```txt
create_order:
  null -> pending_payment

user_cancel_unpaid:
  pending_payment -> cancelled

mock_pay_success:
  pending_payment -> pending_dispatch

user_confirm:
  pending_confirm -> completed
```

注意：

```txt
mock_pay_success 也要走 pay_success 这套逻辑
不要因为是 mock 就绕过状态机
```

验收：

```txt
创建订单写 status log
取消订单写 status log
mock 支付写 payment/payment_notify_log/status log
确认完成写 status log
重复操作返回状态已变化或幂等结果
```

### 14.5 Phase 4：接入后台派单和师傅接单

实现：

```txt
admin_assign:
  pending_dispatch -> dispatched

staff_accept:
  dispatched -> accepted

staff_reject:
  dispatched -> pending_dispatch
```

并发重点：

```txt
admin_assign 使用 pessimistic
staff_accept 可先 optimistic
staff_reject 可先 optimistic
如果后续发现改派和接单冲突频繁，再把 staff_accept 改为 pessimistic
```

验收：

```txt
两个管理员同时派单只能成功一个
师傅接单和拒单只能成功一个
师傅只能操作派给自己的订单
拒单后 assignment=rejected，订单回 pending_dispatch
```

### 14.6 Phase 5：接入师傅履约动作

实现：

```txt
staff_on_the_way:
  accepted -> on_the_way

staff_start:
  on_the_way -> in_service

staff_complete:
  in_service -> pending_confirm
```

履约校验：

```txt
staff_on_the_way 校验当前师傅
staff_start 校验当前师傅
staff_complete 校验当前师傅
staff_complete 可校验至少一张 service_photos
```

验收：

```txt
乱序操作失败
非当前师傅操作失败
完成服务后不直接 completed，而是 pending_confirm
```

### 14.7 Phase 6：补系统任务

实现两个系统动作：

```txt
timeout_unpaid:
  pending_payment -> cancelled

auto_confirm:
  pending_confirm -> completed
```

建议：

```txt
timeout_unpaid 用 pessimistic，防止和支付回调冲突
auto_confirm 用 pessimistic，防止和用户确认/售后冲突
```

验收：

```txt
支付前超时取消成功
支付后不会被超时任务取消
待确认超时自动完成
用户已确认后 auto_confirm 不重复执行
```

### 14.8 Phase 7：接入真实微信支付与退款

实现：

```txt
pay_success:
  pending_payment -> pending_dispatch

admin_cancel_before_dispatch:
  pending_dispatch -> refund_pending

refund_success:
  refund_pending -> refunded

pay_after_cancel:
  cancelled + payment_success -> refund_pending 或写异常支付记录
```

建议：

```txt
pay_success 使用 pessimistic
refund_success 使用 pessimistic
支付回调必须用 transactionNo/paymentNo 幂等
退款回调必须用 refundNo/channelRefundNo 幂等
```

验收：

```txt
重复支付回调不重复推进
取消后支付回调不把订单改成待派单
退款成功后订单进入 refunded
```

### 14.9 Phase 8：接入售后

实现：

```txt
after_sales_open:
  pending_confirm/completed -> after_sales

after_sales_resolved_no_refund:
  after_sales -> completed

after_sales_refund:
  after_sales -> refund_pending
```

注意：

```txt
tickets.status 管理售后工单内部进度
orders.status 只标记订单进入 after_sales
```

验收：

```txt
只有订单用户能发起售后
后台处理售后有 audit log
售后退款进入 refund_pending
售后无退款可以回 completed
```

### 14.10 Phase 9：幂等表和 Outbox

当主流程稳定后，补：

```txt
idempotency_keys
outbox_events
```

先接入这些动作：

```txt
create_order
pay
pay_success
admin_assign
staff_accept
user_confirm
```

Outbox 首批事件：

```txt
order_paid
order_assigned
staff_accepted
staff_completed
order_completed
order_cancelled
refund_success
after_sales_opened
```

验收：

```txt
同一幂等 key 重复请求返回同一结果
状态变化写 outbox
通知发送失败不影响订单事务
```

## 15. 测试清单

### 15.1 单动作状态测试

```txt
create_order 只能创建 pending_payment
pay_success 只能 pending_payment -> pending_dispatch
admin_assign 只能 pending_dispatch -> dispatched
staff_accept 只能 dispatched -> accepted
staff_on_the_way 只能 accepted -> on_the_way
staff_start 只能 on_the_way -> in_service
staff_complete 只能 in_service -> pending_confirm
user_confirm 只能 pending_confirm -> completed
```

### 15.2 并发冲突测试

```txt
用户取消和支付回调并发
两个管理员同时派单
管理员改派和师傅接单并发
师傅接单和拒单并发
师傅重复点击上门
用户重复确认完成
旧 version 提交操作
微信支付重复回调
```

### 15.3 事务一致性测试

```txt
状态变化后 orders.status 正确
状态变化后 order_status_logs 必有一条记录
派单成功后 order_assignments 和 orders.staffId 一致
拒单后 order_assignment=rejected 且订单回 pending_dispatch
支付成功后 payments 和 orders 状态一致
异常支付不会把 cancelled 订单改成 pending_dispatch
```

### 15.4 幂等测试

```txt
同一 idempotency key 重复 create_order 返回同一订单
同一 paymentNo 重复创建支付不会创建多条有效支付
同一 transactionNo 重复回调不会重复推进状态
同一派单请求重复提交不会创建多个 active assignment
同一确认请求重复提交不会重复写 completed 状态
```

## 16. 最终结论

这套订单状态机的主链路是成立的，但要真正商用，不能只实现状态流转，还必须实现防冲突。

当前推荐方案：

```txt
create_order 用事务 + 幂等
pay_success 用悲观锁 + 支付幂等
admin_assign 用悲观锁
staff_accept 用条件更新，必要时悲观锁
staff_on_the_way 用乐观锁
staff_start 用乐观锁
staff_complete 用事务 + 条件更新
user_confirm 用乐观锁 + 幂等
```

所有动作都必须：

```txt
校验 expectedStatus
校验操作者权限
校验订单归属
在事务内更新状态和写日志
状态变化后 version + 1
重复请求可幂等处理
冲突请求返回“订单状态已变化，请刷新”
```

这样用户端、师傅端、管理员端、支付回调同时操作同一订单时，系统仍能保证只有一个合法动作成功，其他动作不会覆盖已发生的事实。
