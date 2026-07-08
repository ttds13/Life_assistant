# Day37 功能闭环验证分析：优惠券、积分、预约通知与订单记账

更新时间：2026-07-08  
来源：Day35 问题纠察、Day36 实施结果、当前代码与云端只读验证  
目标：把“功能是否真的闭环”固定成可复核的问题清单、证据链、验证步骤和后续改进项。

## 1. 本次验证结论

| 闭环编号 | 闭环名称 | 当前结论 | 风险等级 | 处理结论 |
| --- | --- | --- | --- | --- |
| D37-01 | 优惠券功能闭环 | 未闭环 | P0 | 只有后台券配置和订单字段，缺用户领券、可用券、下单校验、核销和回滚 |
| D37-02 | 积分功能闭环 | 基本闭环，待交易压测 | P1 | 新支付成功后可写积分流水，前端有入口和明细；生产当前暂无积分流水数据 |
| D37-03 | 用户预约后师傅端和 Admin 接收通知闭环 | 部分闭环 | P0 | 后台派单后师傅端通知闭环已建立；用户刚发起预约后 Admin 只有列表/待办可见，未形成通知消息 |
| D37-04 | 订单记账闭环 | 部分闭环 | P0 | 支付、积分、师傅收入、提现表结构存在；现金服务订单要完成确认后才生成师傅收入，外来订单和优惠券记账仍有缺口 |

本次没有在生产库创建测试订单、发起真实支付或执行提现，只做了代码链路和云端只读验证。需要写数据的闭环验证步骤已在本文第 8 节列出。

## 2. 云端只读验证证据

执行环境：

```text
服务器：ssh aliyun-backend
后端目录：/www/wwwroot/life-assistant
后端容器：life_assistant_server
MySQL 容器：life_assistant_mysql
```

容器和健康检查：

```text
server=running
restart=0
health=/api/health -> code 0
publicBaseUrl=https://www.xunhaoyou.com
```

生产库结构确认：

```text
coupons 存在
user_coupons 存在
point_ledgers 存在
notifications 存在
staff_income_records 存在
withdraw_requests 存在
orders.coupon_id 存在
orders.discount_amount 存在
order_assignments.notification_id 存在
order_assignments.notification_status 存在
```

生产库当前计数：

```text
coupons=0
user_coupons=0
point_ledgers=0
notifications=0
orders=4
payments=4
staff_income_records=0
withdraw_requests=0
```

路由探测结果：

```text
GET  /api/user/points -> 401
GET  /api/user/points/records -> 401
GET  /api/staff/notifications -> 401
GET  /api/staff/notifications/unread-count -> 401
POST /api/admin/orders -> 401
GET  /api/admin/orders/1/dispatch-check -> 401
GET  /api/admin/coupons -> 401
```

401 说明路由已部署且进入鉴权层；不是 404。

## 3. D37-01 优惠券功能闭环

### 3.1 期望闭环

优惠券完整闭环应包含：

```text
Admin 创建优惠券
-> 用户可领取或被发放
-> 用户下单选择可用优惠券
-> 后端校验券状态、有效期、门槛、适用服务和归属用户
-> 订单锁定优惠券并计算 discountAmount / payableAmount
-> 支付成功后核销 user_coupons
-> 订单取消、退款或删除时释放或回滚优惠券
-> Admin 可查看发放数、领取数、使用数和订单关联
```

### 3.2 当前已存在能力

后端表结构存在：

```text
server/prisma/schema.prisma
- Coupon
- UserCoupon
- Order.couponId
- Order.discountAmount
```

Admin 管理接口存在：

```text
GET  /api/admin/coupons
POST /api/admin/coupons
PUT  /api/admin/coupons/:id
PUT  /api/admin/coupons/:id/status
```

Admin 页面入口存在：

```text
admin/src/router/life-admin-routes.ts
admin/src/api/life/index.ts
```

订单 DTO 有 `couponId` 字段：

```text
server/src/orders/dto/create-order.dto.ts
miniapp/src/api/types/orders.ts
```

### 3.3 当前缺口

优惠券当前判定为未闭环，原因：

1. 小程序没有真实优惠券 API。`miniapp/src/pages/coupon/index.vue` 中 `visibleCoupons` 固定为空数组。
2. 用户没有领券接口，例如 `GET /api/user/coupons`、`POST /api/coupons/:id/receive` 当前不存在。
3. 下单页只显示“暂无可用”，没有加载用户可用券，也没有把 `couponId` 传入 `createOrder()`。
4. 后端 `createOrder()` 只保存 `couponId`，没有校验 `user_coupons` 归属、状态、有效期、门槛和适用服务。
5. 后端没有按优惠券金额计算 `discountAmount` 和 `payableAmount`。
6. 支付成功后没有把 `user_coupons.status` 改为 used，也没有写 `usedOrderId` / `usedAt`。
7. 订单取消和退款没有完整释放优惠券；删除订单只清空了 `usedOrderId` / `usedAt`，但没有统一状态恢复规则。
8. Admin 只有创建/上下架优惠券，没有发券、领取记录、使用记录和订单关联查看。

### 3.4 可执行修复项

| 编号 | 任务 | 落地文件 |
| --- | --- | --- |
| D37-01-01 | 新增用户优惠券列表和可用券接口 | `server/src/coupons/*`、`miniapp/src/api/coupons.ts` |
| D37-01-02 | 新增领券/后台发券能力 | `CouponService.receive()`、Admin 发券入口 |
| D37-01-03 | 下单前计算可用券和优惠金额 | `OrdersService.getPricePreview()`、`orders/create.vue` |
| D37-01-04 | 下单事务内锁定优惠券 | `OrdersService.createOrder()` |
| D37-01-05 | 支付成功后核销优惠券 | `PaymentsService.markPaymentSuccess()` |
| D37-01-06 | 取消/退款/删除回滚优惠券 | `OrdersService.cancelOrder()`、`RefundsService`、`deleteAdminOrder()` |
| D37-01-07 | Admin 查看发放、领取、使用明细 | `admin/src/views/life/resource` 或独立营销页面 |

### 3.5 验收标准

1. Admin 创建一张满减券并发布。
2. 用户可在“我的优惠券”看到未使用券。
3. 用户下单时可选择该券，金额明细显示优惠金额。
4. 支付成功后优惠券状态变为 used，并关联订单号。
5. 重复支付回调不会重复核销。
6. 取消未支付订单可释放锁定券。
7. 退款完成后的券处理规则明确：退回、作废或保持已用，不能无规则。

## 4. D37-02 积分功能闭环

### 4.1 期望闭环

```text
用户创建现金订单
-> 支付成功
-> payment 成功落库
-> order 进入 pending_dispatch，写 paidAt / paidAmount
-> point_ledgers 写入 earn 流水
-> 用户个人中心显示积分
-> 积分页显示汇总和明细
-> 订单详情能关联本单积分
```

### 4.2 当前已存在能力

后端积分表存在：

```text
PointLedger
@@unique([orderId, type])
```

积分写入逻辑存在：

```text
server/src/payments/payments.service.ts
- markPaymentSuccess()
- await this.users.ensureEarnedPointsForOrder(payment.orderId)

server/src/users/users.service.ts
- ensureEarnedPointsForOrder()
- getUserPoints()
- getUserPointRecords()
```

积分接口存在：

```text
GET /api/user/points
GET /api/user/points/records
```

小程序入口存在：

```text
miniapp/src/pages/profile/index.vue
miniapp/src/pages/points/index.vue
miniapp/src/api/points.ts
```

积分规则：

```text
每实际支付 0.1 元积 1 分
积分使用 Math.floor(amount * 10)
会员卡购买订单不写服务消费积分
```

### 4.3 当前验证结论

积分功能判断为基本闭环，但尚未完成生产交易压测。

已确认：

1. 数据表存在。
2. 支付成功路径调用积分写入。
3. `point_ledgers` 对同一订单同一类型有唯一约束，能防重复写入。
4. 小程序有积分汇总和明细页面。
5. 云端接口已部署。

当前生产计数：

```text
point_ledgers=0
```

这说明生产还没有真实积分流水，不能宣称“业务已跑通”，只能说明能力已部署。

### 4.4 当前缺口

1. 历史订单没有回填积分流水。`getUserPoints()` 有 legacy 聚合兜底，但 `points/records` 只查 `point_ledgers`。
2. 积分写入在支付事务后单独调用，如果积分写入失败，支付成功不会自动补偿。
3. 退款后没有积分扣回流水，例如 `refund_deduct`。
4. 当前只有 earn，没有 consume、adjust、expire、refund_deduct 的完整规则。
5. 订单详情是否显示本单积分要继续检查前端详情页，目前核心闭环在积分页。

### 4.5 可执行验证步骤

1. 准备测试用户、地址和现金服务。
2. 创建现金预约订单，状态应为 `pending_payment`。
3. 使用 mock 或沙箱支付成功。
4. 查询：

```sql
SELECT id, order_id, type, points, amount, balance_after
FROM point_ledgers
WHERE order_id = ?;
```

5. 重复触发支付成功回调或重复调用支付成功逻辑，确认仍只有一条 `earn` 流水。
6. 小程序进入“我的积分”，确认汇总和明细出现该订单。

### 4.6 改进项

| 编号 | 任务 |
| --- | --- |
| D37-02-01 | 增加支付成功后积分写入失败补偿任务 |
| D37-02-02 | 增加历史订单积分回填脚本 |
| D37-02-03 | 增加退款扣回积分流水 |
| D37-02-04 | 在订单详情展示本单获得积分 |

## 5. D37-03 用户预约后师傅端和 Admin 接收通知闭环

### 5.1 需要区分的两个通知闭环

本问题拆成两个闭环：

```text
A. 用户发起预约 -> Admin 知道有待派单订单
B. Admin 派单 -> 师傅端收到新任务通知
```

当前系统只完成了 B 的站内通知闭环；A 只有后台列表、首页指标和待办入口，不是消息通知闭环。

### 5.2 用户发起预约 -> Admin 可见链路

已存在链路：

```text
miniapp/src/pages/order/create.vue
-> POST /api/orders
-> OrdersService.createOrder()
-> 现金订单 status=pending_payment
-> 咨询/会员卡预约 status=pending_dispatch
-> Admin 订单列表可查
-> Admin Dashboard 统计 pending_dispatch 数量
```

Admin 可见证据：

```text
server/src/admin-business/admin-business.service.ts
- getDashboard()
- pendingDispatch = order.count({ status: pending_dispatch })
- todos 中有 pending_dispatch 待派单订单

admin/src/views/life/orders/index.vue
- 待派单优先处理
- pending_dispatch 筛选
```

当前缺口：

1. `NotificationsService` 只有 `createOrderAssignedNotification()`，没有 `createAdminOrderCreatedNotification()`。
2. 没有 `receiverType=admin` 的预约通知写入。
3. Admin 顶部通知中心走的是系统通知，不是订单事件通知。
4. 现金订单在支付前是 `pending_payment`，此阶段是否需要通知 Admin 规则不明确。
5. 支付成功进入 `pending_dispatch` 后，也没有写 Admin 待派单通知。

结论：Admin 能看见待派单订单，但不是“接收通知闭环”。

### 5.3 Admin 派单 -> 师傅端通知链路

已存在闭环：

```text
Admin 点击派单
-> POST /api/admin/orders/:id/assign
-> OrdersService.assignOrder()
-> 状态 pending_dispatch -> dispatched
-> order_assignments 创建记录
-> notifications 创建 staff 站内通知
-> order_assignments.notificationId / notificationStatus 回写
-> 师傅端 GET /api/staff/notifications/unread-count
-> 师傅端通知页 GET /api/staff/notifications
-> 点击通知可标记已读并进入订单详情
```

核心文件：

```text
server/src/orders/orders.service.ts
server/src/notifications/notifications.service.ts
server/src/notifications/notifications.controller.ts
miniapp/src/pages/staff/home.vue
miniapp/src/pages/staff/notifications.vue
admin/src/views/life/orders/detail.vue
```

### 5.4 当前缺口

1. 师傅端通知是站内通知，微信订阅消息目前未接入，只记录 `sendStatus=created`。
2. 没有 Admin 端订单通知消息表视图。
3. 没有“支付成功进入待派单后提醒 Admin”的通知。
4. 生产当前 `notifications=0`，说明还没有真实派单通知流水，需要执行测试订单验证。

### 5.5 可执行修复项

| 编号 | 任务 | 说明 |
| --- | --- | --- |
| D37-03-01 | 新增 Admin 待派单通知 | 支付成功或咨询/会员卡预约创建后写 `receiverType=admin` |
| D37-03-02 | Admin 通知中心接入订单事件 | 可在顶部通知或待办中心显示 |
| D37-03-03 | 区分现金订单通知时机 | 支付前不通知或仅进入待支付池；支付后通知待派单 |
| D37-03-04 | 接入微信订阅消息可选能力 | 不阻塞站内通知 |

### 5.6 验收标准

1. 用户提交咨询预约后，Admin 首页待办数量增加。
2. 用户支付现金订单成功后，Admin 收到待派单通知或待办事件。
3. Admin 派单后，师傅端首页未读数增加。
4. 师傅端通知页出现订单通知。
5. 师傅点击通知进入订单详情，通知变为已读。
6. Admin 订单详情能看到派单通知状态和通知 ID。

## 6. D37-04 整个订单记账闭环

### 6.1 现金服务订单期望闭环

```text
用户下单
-> orders 创建 pending_payment
-> payments 创建 pending
-> 微信或 mock 支付成功
-> payments 更新 success
-> payment_notify_logs 写 success
-> orders 更新 pending_dispatch、paidAt、paidAmount
-> point_ledgers 写 earn
-> Admin 派单
-> staff 接单、出发、开始、完成
-> 用户确认或自动确认
-> orders 更新 completed
-> staff_income_records 写 service_income
-> 师傅提现时冻结收入
-> Admin 审核和打款
-> withdraw_requests 更新 paid
-> staff_income_records 更新 withdrawn
```

### 6.2 当前已存在能力

支付记账：

```text
server/src/payments/payments.service.ts
- createPayment()
- createMockPayment()
- createWechatPayment()
- handleWechatNotify()
- markPaymentSuccess()
```

订单状态机：

```text
pending_payment
-> pending_dispatch
-> dispatched
-> accepted
-> on_the_way
-> in_service
-> pending_confirm
-> completed
```

收入记账：

```text
server/src/orders/orders.service.ts
- confirmOrder()
- autoConfirm()

server/src/withdrawals/withdrawals.service.ts
- createIncomeForCompletedOrder()
- createWithdrawRequest()
- handleTransferSuccess()
- handleTransferFailed()
```

收入表：

```text
staff_income_records
withdraw_requests
withdraw_status_logs
```

### 6.3 当前验证结论

订单记账是部分闭环。

已闭合部分：

1. 支付成功会更新 payment、订单 paid 字段和订单状态。
2. 支付成功会写 payment notify log。
3. 支付成功后会写积分流水。
4. 用户确认或自动确认完成后会创建师傅收入记录。
5. 提现会冻结收入记录，打款成功后改为 withdrawn。
6. 失败、取消、过期提现会释放冻结收入。

未完全闭合部分：

1. 生产当前 `staff_income_records=0`，说明还没有完成订单产生收入流水。
2. 外来订单由 Admin 创建时默认 `payableAmount=0`、`paidAmount=0`，如果后续完成，会按 `originalAmount` 生成师傅收入，但现金收款来源不清晰。
3. Admin 直接编辑订单金额、状态、paidAt、completedAt 不会自动补齐 payment、point_ledger、staff_income_record。
4. 优惠券未闭环，会影响折扣和实收金额准确性。
5. 退款后是否扣减积分、调整师傅收入，需要继续补规则。
6. 会员卡订单有冻结/核销闭环，但它和现金收入记账不是同一条链路，不能混在现金订单账里。

### 6.4 关键风险

#### 风险 1：Admin 手动改状态绕过记账

`updateAdminOrder()` 可以更新订单状态、金额、支付时间、完成时间，但没有调用支付成功、积分、收入的副作用。如果运营直接把订单改成 completed，可能出现：

```text
订单显示已完成
但 payments 没有成功记录
point_ledgers 没有积分流水
staff_income_records 没有师傅收入
```

建议：Admin 手动改状态只能走明确动作接口，或增加补账检查。

#### 风险 2：外来订单现金收款口径不清

Admin 外来订单现在可直接进入 `pending_dispatch`，金额字段可填，但没有 payment 记录。如果它代表线下已收款，需要单独写：

```text
payment.channel=offline
payment.status=success
order.paidAt / paidAmount
point_ledgers 是否计入
```

#### 风险 3：积分和收入生成时机不同

积分在支付成功后生成；师傅收入在用户确认或自动确认后生成。这是合理的，但文档和后台应明确：

```text
支付成功 != 师傅可提现收入
服务完成并确认后才进入收入结算
```

### 6.5 订单记账验证 SQL

完成一笔测试订单后，应检查：

```sql
SELECT id, order_no, status, payable_amount, paid_amount, paid_at, completed_at
FROM orders
WHERE id = ?;

SELECT id, payment_no, status, amount, paid_at
FROM payments
WHERE order_id = ?;

SELECT id, order_id, type, points, amount, balance_after
FROM point_ledgers
WHERE order_id = ?;

SELECT id, order_id, staff_id, amount, type, status, settlement_status, withdraw_status
FROM staff_income_records
WHERE order_id = ?;

SELECT id, order_id, from_status, to_status, action, operator_type, created_at
FROM order_status_logs
WHERE order_id = ?
ORDER BY id;
```

### 6.6 可执行修复项

| 编号 | 任务 |
| --- | --- |
| D37-04-01 | 增加订单账务一致性检查脚本 |
| D37-04-02 | 外来订单支持 `offline` 支付记录 |
| D37-04-03 | Admin 状态编辑限制为非账务字段，账务动作走专用接口 |
| D37-04-04 | 退款成功后补积分扣回和收入冲正规则 |
| D37-04-05 | 增加订单详情账务面板：支付、积分、师傅收入、提现关联 |

## 7. 闭环问题清单

| 问题编号 | 问题 | 当前状态 | 下一步 |
| --- | --- | --- | --- |
| D37-C01 | 优惠券只有后台配置，没有用户领取和核销链路 | 未闭环 | 优先补用户优惠券服务 |
| D37-C02 | 下单传 `couponId` 但后端不校验券归属和状态 | 高风险 | 下单事务内校验并锁券 |
| D37-C03 | 用户预约后 Admin 没有消息通知 | 部分闭环 | 支付成功/待派单时写 Admin 通知 |
| D37-C04 | 师傅通知只支持站内通知 | 可接受缺口 | 微信订阅消息作为增强项 |
| D37-C05 | 生产暂无积分和通知流水 | 待压测 | 使用测试账号跑闭环 |
| D37-C06 | Admin 手动改订单状态可能绕过账务副作用 | 高风险 | 限制编辑或增加补账 |
| D37-C07 | 外来订单线下收款没有 payment 记录 | 高风险 | 增加 offline payment |
| D37-C08 | 退款后积分扣回和收入冲正规则不足 | 高风险 | 补冲正流水 |

## 8. Day37 手工闭环验证步骤

### 8.1 优惠券闭环验证

当前不能完整执行，因为功能未闭环。补齐后按以下步骤验证：

1. Admin 创建满减券并发布。
2. 用户领取优惠券。
3. 用户进入下单页，查看可用券。
4. 选择优惠券，价格预览显示优惠金额。
5. 提交订单，订单写入 `couponId`、`discountAmount`、`payableAmount`。
6. 支付成功后 `user_coupons.status=used`。
7. 取消或退款时按规则释放或冲正优惠券。

### 8.2 积分闭环验证

1. 用测试用户创建现金服务订单。
2. mock 或沙箱支付成功。
3. 验证 `payments.status=success`。
4. 验证 `orders.status=pending_dispatch`、`paidAt`、`paidAmount`。
5. 验证 `point_ledgers` 出现一条 `earn`。
6. 重复支付回调，确认没有重复积分。
7. 小程序个人中心和积分页可见积分。

### 8.3 预约和派单通知闭环验证

1. 用户创建咨询预约或支付现金订单。
2. Admin 首页待派单数量增加。
3. Admin 订单列表出现待派单订单。
4. Admin 派单给 active 师傅。
5. 验证 `notifications` 出现 `receiverType=staff`、`type=order_assigned`。
6. 验证 `order_assignments.notification_id` 有值。
7. 师傅端首页未读数增加。
8. 师傅端通知页出现新任务。
9. 点击通知进入订单详情后通知变为已读。

### 8.4 订单记账闭环验证

1. 用户创建现金服务订单。
2. 完成支付。
3. Admin 派单。
4. 师傅接单、出发、开始服务、完成服务并上传照片。
5. 用户确认完成。
6. 验证 `staff_income_records` 出现服务收入。
7. 师傅发起提现。
8. 验证收入记录 `withdrawStatus=frozen`。
9. Admin 审核并执行打款。
10. mock 模式下验证提现进入 paid，收入记录进入 withdrawn。

## 9. Day37 完成定义

Day37 不是新增开发日，而是闭环验证和问题固定日。完成标准为：

1. 每个闭环都有明确结论：已闭环、部分闭环、未闭环。
2. 每个结论都有代码证据和云端只读验证证据。
3. 未闭环项被固定为可执行任务。
4. 需要写生产数据的验证步骤已明确，但未在无测试窗口时直接执行。
5. 后续 Day38 可以直接按 D37-Cxx 问题编号进入修复。

