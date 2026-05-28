# 订单数据库系统缺漏审计

更新日期：2026-05-28

## 1. 审计目标

本审计围绕订单系统的五类事实表展开：

```txt
orders.status 是当前事实
order_status_logs 是历史事实
payments 是支付事实
order_assignments 是派单事实
service_checkins/service_photos 是履约事实
```

目标是确认当前 `server/prisma/schema.prisma` 是否足够支撑后续订单状态机、防冲突、支付、派单、师傅履约、退款和售后。

结论先行：

```txt
当前数据库主表方向正确，MVP 主流程所需核心表已经具备。
但当前 schema 仍缺少并发控制、幂等、可靠通知、异常追踪和部分子流程字段。
如果只做 Day 7 mock 支付和基础订单，可以先不大改。
如果要进入微信支付、后台派单、师傅履约和售后，建议先补一轮小迁移。
```

## 2. 当前已具备的核心表

当前 `server/prisma/schema.prisma` 已具备：

```txt
orders
order_status_logs
order_assignments
payments
payment_notify_logs
refunds
service_checkins
service_photos
reviews
tickets
ticket_messages
audit_logs
notifications
files
```

这说明数据库已经覆盖了订单主链路的核心事实：

```txt
订单当前状态
订单状态历史
派单记录
支付记录
支付回调记录
退款记录
师傅打卡
服务照片
评价
售后工单
后台审计
通知
文件
```

整体方向是正确的，不需要推倒重做。

## 3. 逐表审计

### 3.1 orders

当前字段摘要：

```txt
id
orderNo
userId
staffId
serviceId
status
serviceSnapshot
addressSnapshot
appointmentStartTime
appointmentEndTime
originalAmount
discountAmount
payableAmount
paidAmount
couponId
memberCardId
remark
adminRemark
source
cityCode
storeId
paidAt
completedAt
cancelledAt
cancelReason
createdAt
updatedAt
```

已满足：

```txt
订单号唯一
用户、师傅、服务关联
当前状态
服务快照
地址快照
预约时间
金额快照
支付时间
完成时间
取消时间和原因
多城市、多门店预留
```

主要缺漏：

```txt
缺少 version 乐观锁字段
缺少 refundRequestedAt/refundedAt 这类退款辅助时间字段，当前可放 refunds 表，不一定必须加
缺少 afterSalesAt 这类售后入口时间字段，当前可放 tickets 表，不一定必须加
缺少 deletedAt，订单通常不建议软删，可以不加
```

必须补：

```prisma
version Int @default(0)
```

原因：

```txt
防用户旧页面提交
防多端并发覆盖
支撑乐观锁条件更新
状态变化时 version + 1
```

建议补索引：

```prisma
@@index([userId, status])
@@index([staffId, status])
@@index([status, appointmentStartTime])
```

原因：

```txt
用户订单列表按状态查
师傅任务列表按状态查
后台按状态和预约时间筛选
```

### 3.2 order_status_logs

当前字段摘要：

```txt
id
orderId
fromStatus
toStatus
operatorType
operatorId
remark
createdAt
```

已满足：

```txt
记录订单状态变化历史
记录操作者类型和操作者 ID
记录状态变化备注
```

主要缺漏：

```txt
缺少 action
缺少 requestId
缺少 source
缺少 metadata/detail JSON
缺少 ip/userAgent，可选
```

必须补：

```prisma
action    String? @db.VarChar(64)
requestId String? @map("request_id") @db.VarChar(64)
```

建议补：

```prisma
detail Json?
```

原因：

```txt
action 能区分 staff_accept、staff_reject、pay_success、auto_confirm
requestId 用于串联接口日志和订单日志
detail 可记录拒单原因、自动任务批次、支付单号等结构化信息
```

建议补索引：

```prisma
@@index([orderId, createdAt])
@@index([requestId])
@@index([action])
```

### 3.3 order_assignments

当前字段摘要：

```txt
id
orderId
staffId
assignType
assignStatus
assignedBy
rejectReason
assignedAt
acceptedAt
rejectedAt
```

已满足：

```txt
记录订单派给哪个师傅
记录人工/自动派单类型
记录派单状态
记录派单人
记录接单/拒单时间
记录拒单原因
```

主要缺漏：

```txt
缺少 cancelledAt/reassignedAt
缺少 cancelReason/reassignReason
缺少 requestId
缺少 assignedByType，当前 assignedBy 默认像 admin id
缺少 active/current 标识
无法用数据库唯一约束直接保证“同一订单只有一个当前有效派单”
```

建议补：

```prisma
cancelledAt  DateTime? @map("cancelled_at")
cancelReason String?   @map("cancel_reason") @db.VarChar(256)
requestId    String?   @map("request_id") @db.VarChar(64)
assignedByType String? @map("assigned_by_type") @db.VarChar(16)
```

是否补 `isActive`：

```txt
可以补，但 MySQL 下“同一订单只有一个 isActive=true”的部分唯一约束不好做。
MVP 可以先靠事务和业务规则保证。
```

建议派单状态枚举：

```txt
pending
accepted
rejected
cancelled
reassigned
```

建议补索引：

```prisma
@@index([orderId, assignStatus])
@@index([staffId, assignStatus])
```

原因：

```txt
师傅查待接单任务
后台查某订单派单历史
改派时定位当前有效派单
```

### 3.4 payments

当前字段摘要：

```txt
id
paymentNo
orderId
userId
channel
amount
status
transactionNo
prepayId
paidAt
callbackRaw
createdAt
updatedAt
```

已满足：

```txt
支付单号唯一
订单和用户关联
支付渠道
支付金额
支付状态
渠道交易号
预支付 ID
支付成功时间
回调原文
```

主要缺漏：

```txt
transactionNo 只有普通索引，不是唯一约束
缺少 closedAt/expiredAt
缺少 failReason
缺少 requestId
缺少 notifyCount 或 lastNotifyAt
缺少 channelRaw/statusRaw，可选
```

必须补或强约束：

```txt
transactionNo 应保证成功支付唯一
```

Prisma/MySQL 注意：

```txt
MySQL unique 允许多个 NULL。
如果 transactionNo 在未支付时为空，可以加 unique。
但要确认多渠道下 transactionNo 是否全局唯一。
更稳设计是 unique(channel, transactionNo)，但 Prisma 对 nullable composite unique 要结合实际验证。
```

建议补：

```prisma
expiredAt  DateTime? @map("expired_at")
closedAt   DateTime? @map("closed_at")
failReason String?   @map("fail_reason") @db.VarChar(256)
requestId  String?   @map("request_id") @db.VarChar(64)
```

建议支付状态：

```txt
pending
success
failed
closed
refunded
partial_refunded
```

建议补索引：

```prisma
@@index([orderId, status])
@@index([userId, status])
@@unique([channel, transactionNo])
```

如果暂不做 composite unique，也至少在业务层保证 `transactionNo` 幂等。

### 3.5 payment_notify_logs

当前字段摘要：

```txt
id
paymentId
paymentNo
channel
rawBody
processResult
createdAt
```

已满足：

```txt
记录支付回调原文
记录处理结果
可按 paymentNo 查回调
```

主要缺漏：

```txt
缺少 notifyType
缺少 transactionNo
缺少 requestId
缺少 errorMessage
缺少 headers/signature/serialNo
缺少 handledAt
processResult 长度 16 可能偏短
```

建议补：

```prisma
notifyType    String?   @map("notify_type") @db.VarChar(32)
transactionNo String?   @map("transaction_no") @db.VarChar(64)
requestId     String?   @map("request_id") @db.VarChar(64)
errorMessage  String?   @map("error_message") @db.VarChar(512)
handledAt     DateTime? @map("handled_at")
headers       Json?
```

原因：

```txt
微信支付回调验签和排错需要 headers/signature 信息
异常支付 after cancel 需要 errorMessage
notifyType 可区分 payment_success/refund_success
```

### 3.6 refunds

当前字段摘要：

```txt
id
refundNo
orderId
paymentId
amount
reason
status
channelRefundNo
operatedBy
refundedAt
createdAt
updatedAt
```

已满足：

```txt
退款单号唯一
关联订单和支付
退款金额
退款原因
退款状态
渠道退款号
操作人
退款完成时间
```

主要缺漏：

```txt
缺少 userId
缺少 channel
缺少 operatedByType
缺少 failedReason
缺少 callbackRaw
缺少 requestId
channelRefundNo 不是唯一索引
```

建议补：

```prisma
userId         BigInt?   @map("user_id")
channel        String?   @db.VarChar(16)
operatedByType String?   @map("operated_by_type") @db.VarChar(16)
failedReason   String?   @map("failed_reason") @db.VarChar(512)
callbackRaw    String?   @map("callback_raw") @db.Text
requestId      String?   @map("request_id") @db.VarChar(64)
```

建议补索引或唯一：

```prisma
@@index([orderId, status])
@@index([paymentId, status])
@@unique([channelRefundNo])
```

如果 `channelRefundNo` 为空较多，注意 MySQL unique nullable 行为。

建议退款状态：

```txt
pending
processing
success
failed
closed
```

### 3.7 service_checkins

当前字段摘要：

```txt
id
orderId
staffId
checkinType
latitude
longitude
addressText
photoUrl
createdAt
```

已满足：

```txt
记录订单、师傅、打卡类型
记录经纬度和地址
记录打卡照片
记录打卡时间
```

主要缺漏：

```txt
缺少 distanceMeters 或 locationAccuracy
缺少 requestId
缺少 remark
缺少 deviceInfo
缺少 ip
```

MVP 可不补，但建议补：

```prisma
requestId String? @map("request_id") @db.VarChar(64)
remark    String? @db.VarChar(256)
```

建议补索引：

```prisma
@@index([orderId, checkinType])
@@index([staffId, createdAt])
```

建议打卡类型：

```txt
on_the_way
arrived
start_service
finish_service
```

如果你已经用订单状态表达 `on_the_way/start_service`，打卡类型可以更偏记录证据：

```txt
depart
arrive
start
finish
```

### 3.8 service_photos

当前字段摘要：

```txt
id
orderId
staffId
photoType
url
remark
createdAt
```

已满足：

```txt
记录订单服务照片
记录照片类型
记录上传师傅
记录备注
```

主要缺漏：

```txt
缺少 fileId，与 files 表没有关联
缺少 audit/status，后续内容安全审核需要
缺少 sortOrder
缺少 requestId
```

建议补：

```prisma
fileId    BigInt? @map("file_id")
status    String? @db.VarChar(16)
sortOrder Int    @default(0) @map("sort_order")
requestId String? @map("request_id") @db.VarChar(64)
```

MVP 如果不做内容安全，`status` 可先不补。

建议补索引：

```prisma
@@index([orderId, photoType])
@@index([staffId, createdAt])
```

## 4. 横向缺漏

### 4.1 缺少乐观锁字段

当前 `orders` 没有 `version`。

影响：

```txt
无法可靠处理旧页面提交
无法做标准乐观锁
并发动作只能依赖 status 条件更新或 FOR UPDATE
```

建议优先级：

```txt
P0 必须补
```

### 4.2 缺少状态动作字段

当前 `order_status_logs` 只有 from/to，没有 action。

影响：

```txt
无法区分 pending_payment -> cancelled 是用户取消还是超时取消
无法区分 pending_confirm -> completed 是用户确认还是系统自动确认
```

建议优先级：

```txt
P0 必须补 action
P0 必须补 requestId
P1 补 detail JSON
```

### 4.3 缺少幂等表

当前没有 `idempotency_keys`。

影响：

```txt
重复提交订单可能创建多单
重复派单可能产生重复 assignment
网络重试难以安全返回第一次结果
```

建议优先级：

```txt
P1 建议补
Day 7 mock 阶段可先用业务条件兜底
接真实支付前建议补
```

### 4.4 缺少 Outbox 表

当前没有 `outbox_events`。

影响：

```txt
订单状态变更后通知无法可靠投递
可能出现订单状态已变但用户/师傅没收到通知
```

建议优先级：

```txt
P1 建议补
MVP 初期可先同步/简单异步通知
进入订阅消息、短信、站内信时建议补
```

### 4.5 缺少当前有效派单约束

当前 `order_assignments` 没有数据库层约束保证同一订单只有一个 active assignment。

影响：

```txt
多管理员并发派单时可能出现多个有效派单
需要靠事务和代码保证
```

建议：

```txt
短期用 FOR UPDATE 锁 orders 行，在事务内保证只有一条 active assignment
中期考虑增加 isActive 字段，但 MySQL partial unique 不好做，仍需业务约束
```

建议优先级：

```txt
P1 逻辑必须有
字段可后补
```

### 4.6 状态命名不一致

`docs/database/database-consolve.md` 里仍有：

```txt
assigned
after_sale
after_sale_done
```

而当前订单设计建议：

```txt
dispatched
after_sales
```

影响：

```txt
前端类型、后端常量、数据库文档可能不一致
```

建议优先级：

```txt
P0 文档和常量统一
```

## 5. 与当前计划文档的差异

### 5.1 Day 7 文档

`docs/plan/day7-api-development-plan.md` 已覆盖：

```txt
地址 CRUD
订单价格预览
创建订单
订单列表和详情
取消订单
确认完成
mock 支付
payments
payment_notify_logs
order_status_logs
```

但 Day 7 文档没有完全覆盖：

```txt
orders.version
order_status_logs.action/requestId
idempotency_keys
outbox_events
admin_assign/staff_accept 的并发字段需求
真实微信支付和退款回调的完整字段
```

### 5.2 数据库总结文档

`docs/database/database-consolve.md` 表结构概览正确，但状态枚举已经偏旧：

```txt
assigned 应改为 dispatched
after_sale 应改为 after_sales
after_sale_done 是否保留需要重新确认
```

建议更新该文档，或以 `docs/summary/order-consistency-locking-design-2026-05-28.md` 为新准。

## 6. 建议迁移优先级

### 6.1 P0：进入订单实现前建议立刻补

```txt
orders.version
order_status_logs.action
order_status_logs.request_id
orders 复合索引 userId/status
orders 复合索引 staffId/status
order_status_logs 索引 orderId/createdAt
统一状态常量 dispatched / after_sales
```

这些改动小，但能显著提升后续状态机实现质量。

### 6.2 P1：接派单、支付、师傅端前建议补

```txt
order_assignments.cancelled_at
order_assignments.cancel_reason
order_assignments.request_id
order_assignments.assigned_by_type
order_assignments 复合索引 orderId/assignStatus
order_assignments 复合索引 staffId/assignStatus
payments expired_at
payments closed_at
payments fail_reason
payments request_id
payment_notify_logs notify_type
payment_notify_logs transaction_no
payment_notify_logs request_id
payment_notify_logs error_message
payment_notify_logs handled_at
```

### 6.3 P2：接真实退款、售后、内容安全前补

```txt
refunds user_id
refunds channel
refunds operated_by_type
refunds failed_reason
refunds callback_raw
refunds request_id
service_checkins request_id
service_checkins remark
service_photos file_id
service_photos status
service_photos sort_order
service_photos request_id
idempotency_keys
outbox_events
```

## 7. 最小可行迁移建议

如果现在你正在实现订单模块，建议先做一版小迁移，不要一次把所有 P1/P2 都加上。

推荐最小迁移：

```prisma
model Order {
  version Int @default(0)

  @@index([userId, status])
  @@index([staffId, status])
  @@index([status, appointmentStartTime])
}

model OrderStatusLog {
  action    String? @db.VarChar(64)
  requestId String? @map("request_id") @db.VarChar(64)
  detail    Json?

  @@index([orderId, createdAt])
  @@index([requestId])
  @@index([action])
}
```

这能先支撑：

```txt
乐观锁
状态动作可追溯
requestId 追踪
用户订单列表
师傅任务列表
后台待派单列表
```

## 8. 一句话结论

当前数据库系统已经覆盖订单主链路所需的核心事实表，不缺大方向；真正缺的是“并发安全和可追溯的细节字段”。

建议在正式实现订单状态机前，至少先补：

```txt
orders.version
order_status_logs.action
order_status_logs.request_id
关键复合索引
统一状态命名
```

幂等表、Outbox、退款/支付回调增强字段可以按真实支付和通知接入节奏逐步补。
