# Day38 闭环完善与模拟订单全链路测试计划

更新时间：2026-07-08  
基线版本：`1.0.2`  
来源：`docs/plan/day37-closed-loop-verification-analysis.md`  
目标：针对 Day37 已确认的未闭环和部分闭环问题，制定可按步骤执行的修复、验证和测试数据清理计划。

## 1. Day38 执行目标

Day38 的核心不是继续扩大功能范围，而是把已经存在但没有跑通的业务能力补成可验证闭环。

本次要完成 5 个目标：

1. 优惠券闭环：从 Admin 配券，补到用户领券、下单选择、后端校验、支付核销、取消/退款回滚和后台可查。
2. 积分闭环：保留现有支付成功积分能力，补失败补偿、退款扣回、订单详情展示和可重复验证能力。
3. 预约通知闭环：用户发起预约或支付后，Admin 能收到待处理通知；Admin 派单后，师傅端继续能收到站内新任务通知。
4. 订单记账闭环：现金订单、外来线下订单、退款、师傅收入和提现之间的账务副作用必须可追踪、不可绕过。
5. 模拟订单验证与清理：用模拟订单真实跑通每个闭环，测试完成后按批次号删除全部测试数据，不能污染真实业务库。

## 2. 本次不做

1. 不修改手机号授权/注册链路。扫码直接注册当前按 `1.0.2` 状态保持，不纳入 Day38。
2. 不接入复杂积分商城、积分兑换、会员等级或营销裂变。
3. 不把微信订阅消息作为 Day38 强依赖。师傅端和 Admin 通知先以站内通知闭环为准，订阅消息作为后续增强。
4. 不允许在业务代码中硬编码测试用户、测试订单、测试优惠券或测试金额。
5. 不允许用“按日期删除”“按状态删除”这类宽条件清理数据。所有测试数据必须带 Day38 批次标记后再删除。

## 3. 闭环问题固定

| 编号 | 来源 | 问题 | Day38 处理结果 |
| --- | --- | --- | --- |
| D38-01 | D37-C01 / D37-C02 | 优惠券只有后台配置，没有用户领取、下单校验、核销和回滚 | 补完整优惠券交易闭环 |
| D38-02 | D37-C05 / D37-02 | 积分基本闭环，但缺失败补偿、退款扣回和真实交易验证 | 强化为可补偿、可冲正、可验的积分闭环 |
| D38-03 | D37-C03 / D37-C04 | 用户预约后 Admin 没有订单事件通知，师傅通知需要真实测试 | 补 Admin 订单通知，复测师傅端通知 |
| D38-04 | D37-C06 | Admin 手动改订单状态可能绕过支付、积分、收入副作用 | 限制账务状态手改，增加账务动作入口和一致性检查 |
| D38-05 | D37-C07 | 外来订单线下收款没有 `offline` payment 记录 | 外来已收款订单创建或确认时写 `offline` 支付流水 |
| D38-06 | D37-C08 | 退款后积分、优惠券和师傅收入冲正规则不足 | 补退款冲正规则和审计日志 |
| D38-07 | Day38 新增 | 模拟测试数据必须完整删除 | 建立批次号、dry-run 清理和清理后复核 |

## 4. 执行总原则

1. 先本地或测试库跑通，再进入云端测试窗口。
2. 若必须在云端真实库验证，先备份数据库，再使用独立测试批次号。
3. 所有测试数据统一批次号：`DAY38_TEST_{yyyyMMddHHmmss}`。
4. 所有可写入备注、来源、回调原文、通知内容、审计详情的位置都要写入批次号。
5. 所有副作用必须在事务内或补偿任务内可追踪，不能只改订单状态。
6. 所有测试脚本必须支持 `--dry-run`，真正删除必须显式传入 `--confirm`。
7. 完成后执行清理复核 SQL，确保测试批次相关记录计数为 0。

## 5. 执行批次总览

| 批次 | 名称 | 目标 | 完成标准 |
| --- | --- | --- | --- |
| 0 | 基线和环境准备 | 确认 `1.0.2`、分支、数据库、备份和测试批次号 | 有可回滚基线和测试运行号 |
| 1 | 测试数据标记与清理工具 | 先建立可回收机制，再写测试数据 | `seed/e2e/cleanup` 均支持 `runId` |
| 2 | 优惠券闭环 | 用户券、订单券、支付核销、取消退款回滚 | 一张券可完整领用核销并可回滚 |
| 3 | 积分闭环强化 | 支付积分、补偿、退款扣回、前端可见 | 积分流水可重复验证且不重复写 |
| 4 | 预约通知闭环 | 用户预约/支付后通知 Admin，派单后通知师傅 | Admin 和师傅均能收到并处理通知 |
| 5 | 订单记账闭环 | 支付、线下收款、收入、提现、退款冲正 | 订单账务面板和一致性脚本通过 |
| 6 | 模拟订单全链路测试 | 用模拟订单真实跑通各闭环 | 每条测试用例有数据库和页面证据 |
| 7 | 测试数据清理 | 删除所有 Day38 测试数据 | 批次号查询全部为 0 |
| 8 | 构建部署和回归 | 构建、部署、健康检查、冒烟测试 | 后端、Admin、小程序构建通过 |

## 6. 批次 0：基线和环境准备

### 6.1 代码基线

执行前先确认当前代码已处在 `1.0.2` 基线或从 `1.0.2` 拉出 Day38 分支：

```bash
git status --short
git tag --list "1.0.2"
git checkout -b day38-closed-loop-fix 1.0.2
```

如果当前工作区已有未提交改动，只记录并确认来源，不回滚用户改动。

### 6.2 数据库安全

本地或测试库：

```bash
cd server
npx prisma validate
npx prisma migrate status
```

云端测试窗口：

```bash
ssh aliyun-backend
cd /www/wwwroot/life-assistant
docker ps
docker exec life_assistant_mysql mysqldump -u root -p life_assistant > /tmp/life_assistant_day38_before.sql
```

要求：

1. 写入测试数据前必须有备份。
2. 生产库只允许使用带批次号的数据。
3. 不在未知环境执行清理命令。

### 6.3 测试批次号

统一生成：

```text
DAY38_TEST_RUN_ID=DAY38_TEST_20260708HHmmss
```

使用位置：

```text
users.nickname / users.admin_remark
addresses.detail_address / formatted_address
orders.remark / orders.admin_remark / orders.source
coupons.name
notifications.title / content
payments.callback_raw
payment_notify_logs.raw_body
refunds.reason / notify_raw
order_status_logs.request_id / detail / remark
withdraw_requests.request_id / notify_raw
withdraw_status_logs.request_id / detail / remark
audit_logs.request_id / detail
files.remark / source
```

## 7. 批次 1：测试数据标记与清理工具

### 7.1 目标

先实现测试数据可清理，再执行任何模拟订单测试。否则后续闭环测试会污染真实库。

### 7.2 建议新增脚本

```text
server/scripts/day38-seed-test-data.ts
server/scripts/day38-run-e2e.ts
server/scripts/day38-clean-test-data.ts
server/scripts/day38-verify-clean.ts
```

脚本参数：

```bash
pnpm tsx server/scripts/day38-seed-test-data.ts --run-id DAY38_TEST_20260708HHmmss
pnpm tsx server/scripts/day38-run-e2e.ts --run-id DAY38_TEST_20260708HHmmss --case coupon-cash-order
pnpm tsx server/scripts/day38-clean-test-data.ts --run-id DAY38_TEST_20260708HHmmss --dry-run
pnpm tsx server/scripts/day38-clean-test-data.ts --run-id DAY38_TEST_20260708HHmmss --confirm
pnpm tsx server/scripts/day38-verify-clean.ts --run-id DAY38_TEST_20260708HHmmss
```

### 7.3 清理脚本硬性规则

1. 没有 `--run-id` 直接拒绝执行。
2. `runId` 不以 `DAY38_TEST_` 开头直接拒绝执行。
3. 默认只 dry-run 统计，不删除。
4. 删除必须传 `--confirm`。
5. 每一类数据必须先查询 ID 集合，再按 ID 删除。
6. 不允许仅凭 `createdAt`、`status`、`source=miniapp` 删除。
7. 删除前输出将删除的表名、数量、关键 ID 和订单号。
8. 删除后再次统计，目标批次残留必须为 0。

### 7.4 清理顺序

为避免外键约束和账务悬挂，按以下顺序清理：

1. 查询测试订单 ID、测试用户 ID、测试优惠券 ID、测试提现 ID、测试退款 ID。
2. 删除或解除提现相关记录：
   - `withdraw_status_logs`
   - `staff_income_records.withdraw_request_id` 置空或删除测试收入记录
   - `withdraw_requests`
3. 删除履约和售后相关记录：
   - `ticket_messages`
   - `tickets`
   - `review_images`
   - `reviews`
   - `service_photos`
   - `service_checkins`
4. 删除财务交易记录：
   - `refunds`
   - `payment_notify_logs`
   - `payments`
5. 删除权益和通知记录：
   - `point_ledgers`
   - `user_coupons`
   - `notifications`
   - `member_card_records`，仅限测试订单关联
6. 删除订单过程记录：
   - `order_assignments`
   - `order_status_logs`
   - `orders`
7. 删除客户侧测试资料：
   - `addresses`
   - `service_favorites`，仅限测试用户
   - `user_refresh_tokens`，仅限测试用户
   - `users`
8. 删除营销和文件测试资料：
   - `coupons`
   - `files`，仅限 `source` 或 `remark` 带 runId 的文件
9. 删除测试审计记录：
   - `audit_logs`，仅限 `requestId` 或 `detail` 带 runId

### 7.5 清理后验收

清理后执行批次残留检查：

```sql
SELECT COUNT(*) FROM orders WHERE admin_remark LIKE '%DAY38_TEST_20260708HHmmss%' OR remark LIKE '%DAY38_TEST_20260708HHmmss%';
SELECT COUNT(*) FROM users WHERE admin_remark LIKE '%DAY38_TEST_20260708HHmmss%' OR nickname LIKE '%DAY38_TEST_20260708HHmmss%';
SELECT COUNT(*) FROM addresses WHERE detail_address LIKE '%DAY38_TEST_20260708HHmmss%' OR formatted_address LIKE '%DAY38_TEST_20260708HHmmss%';
SELECT COUNT(*) FROM coupons WHERE name LIKE '%DAY38_TEST_20260708HHmmss%';
SELECT COUNT(*) FROM notifications WHERE title LIKE '%DAY38_TEST_20260708HHmmss%' OR content LIKE '%DAY38_TEST_20260708HHmmss%';
SELECT COUNT(*) FROM payment_notify_logs WHERE raw_body LIKE '%DAY38_TEST_20260708HHmmss%';
```

所有结果必须为 `0`。

## 8. 批次 2：优惠券闭环

### 8.1 当前问题

Day37 结论：优惠券表、用户券表、订单 `couponId` 和 `discountAmount` 已存在，但缺少用户领券、下单校验、金额计算、支付核销和取消/退款回滚。

### 8.2 后端改造

新增或完善优惠券用户侧能力：

```text
GET  /api/coupons/available
POST /api/coupons/:id/receive
GET  /api/user/coupons
GET  /api/user/coupons/usable?serviceId=&amount=
```

核心规则：

1. 只展示 `status=1` 且在有效期内的券。
2. 领取时检查 `totalCount`、`issuedCount`、用户是否已领取、有效期。
3. `UserCoupon.status` 建议明确为：

```text
available
locked
used
expired
released
invalid
```

4. 下单事务内校验用户券归属、状态、有效期、门槛、适用服务。
5. 下单成功时将用户券从 `available` 改为 `locked`，写 `usedOrderId=order.id`，但 `usedAt` 暂不写。
6. 支付成功时将 `locked` 改为 `used`，写 `usedAt`。
7. 未支付取消时将 `locked` 改回 `available`，清空 `usedOrderId`。
8. 已支付退款成功后规则固定：
   - 未过期券：改为 `available` 或 `released` 后重新可用，二选一并在接口文案说明。
   - 已过期券：改为 `expired`，不重新发放。
9. 重复支付回调、重复退款回调不能重复核销或重复释放。

涉及文件：

```text
server/src/coupons/*
server/src/orders/orders.service.ts
server/src/orders/dto/create-order.dto.ts
server/src/payments/payments.service.ts
server/src/refunds/refunds.service.ts
server/prisma/schema.prisma
```

### 8.3 Admin 改造

Admin 需要能看到优惠券不只是“配置”，而是“发放和使用结果”：

```text
admin/src/views/life/resource 或 admin/src/views/life/marketing
admin/src/api/life/index.ts
```

页面能力：

1. 创建、编辑、上下架优惠券。
2. 查看发放数、领取数、锁定数、使用数、过期数。
3. 查看用户券明细：用户、状态、领取时间、使用订单、使用时间。
4. 支持给指定用户发券，必须写审计日志。

### 8.4 小程序改造

涉及文件：

```text
miniapp/src/pages/coupon/index.vue
miniapp/src/pages/order/create.vue
miniapp/src/api/coupons.ts
miniapp/src/api/orders.ts
```

页面能力：

1. “我的优惠券”展示可用、已使用、已过期。
2. 下单页加载当前服务和金额可用券。
3. 用户选择优惠券后，订单金额区展示：

```text
服务原价
优惠券抵扣
实付金额
预计获得积分
```

4. 提交订单必须带 `couponId`。
5. 如果券被抢占、过期或不满足门槛，后端返回明确错误，前端刷新可用券列表。

### 8.5 优惠券验收用例

用例 `DAY38-A coupon-cash-order`：

1. Admin 创建 `DAY38_TEST_RUN_ID 满50减10` 优惠券。
2. 测试用户领取优惠券。
3. 用户创建服务金额 `>= 50` 的现金订单。
4. 下单页选择该券。
5. 订单创建后验证：

```sql
SELECT coupon_id, original_amount, discount_amount, payable_amount
FROM orders
WHERE order_no = ?;

SELECT status, used_order_id, used_at
FROM user_coupons
WHERE user_id = ? AND coupon_id = ?;
```

期望：

```text
orders.discount_amount=10
orders.payable_amount=original_amount-10
user_coupons.status=locked
used_order_id=测试订单 ID
used_at IS NULL
```

6. mock 支付成功后验证 `user_coupons.status=used`、`used_at` 有值。
7. 重复触发支付成功逻辑，确认状态仍为 `used` 且无重复副作用。
8. 发起退款并处理成功后，按固定规则验证券回滚或过期。

## 9. 批次 3：积分闭环强化

### 9.1 当前问题

Day37 结论：支付成功后写积分流水已基本闭环，但缺少失败补偿、退款扣回、历史订单回填和真实交易验证。

### 9.2 后端改造

继续保留当前规则：

```text
每实际支付 0.1 元积 1 分
Math.floor(amount * 10)
会员卡购买订单不写服务消费积分
```

需要补齐：

1. 支付成功事务或事务后补偿机制：
   - 首选把积分写入纳入支付成功事务。
   - 如果继续事务后执行，必须有补偿脚本或定时任务扫描 `payments.status=success` 且缺少 `point_ledgers(type=earn)` 的订单。
2. 积分类型固定：

```text
earn
refund_deduct
adjust
expire
```

3. 退款成功后写 `refund_deduct`：
   - 全额退款：扣回本单全部 `earn` 积分。
   - 部分退款：按退款金额折算扣回，累计扣回不能超过本单已发积分。
   - 如果用户当前余额不足，允许余额为负还是进入待扣状态必须固定。Day38 建议允许负数，但订单和积分页明确显示退款扣回流水。
4. 增加幂等约束：
   - `earn` 使用现有 `@@unique([orderId, type])`。
   - 如果部分退款会有多笔 `refund_deduct`，需要扩展唯一键或用 `remark/detail` 关联 `refundNo`。若 schema 不扩展，则 Day38 先限制同一订单只生成一条汇总扣回流水。
5. 订单详情返回本单积分：
   - `earnedPoints`
   - `refundDeductedPoints`
   - `pointLedgerIds`

涉及文件：

```text
server/src/users/users.service.ts
server/src/payments/payments.service.ts
server/src/refunds/refunds.service.ts
server/src/orders/order-presenter.ts
miniapp/src/pages/points/index.vue
miniapp/src/pages/order/detail.vue
```

### 9.3 积分验收用例

用例 `DAY38-B points-idempotent-and-refund`：

1. 测试用户创建一笔实付 `39.90` 的现金订单。
2. mock 支付成功。
3. 验证积分：

```sql
SELECT type, points, amount, balance_after
FROM point_ledgers
WHERE order_id = ?;
```

期望：

```text
earn.points=399
earn.amount=39.90
```

4. 重复执行支付成功回调，确认 `earn` 仍只有 1 条。
5. 小程序积分页展示本单积分流水。
6. 申请并处理全额退款。
7. 验证出现 `refund_deduct` 流水，扣回积分不超过本单 `earn`。
8. 小程序积分页展示退款扣回明细。

## 10. 批次 4：预约通知闭环

### 10.1 当前问题

Day37 将通知拆成两个链路：

```text
A. 用户发起预约 -> Admin 知道有待处理订单
B. Admin 派单 -> 师傅端收到新任务通知
```

当前 B 已有站内通知能力，但需要真实测试；A 只有列表和待办统计，没有消息通知。

### 10.2 后端改造

新增 Admin 订单事件通知：

```text
NotificationsService.createAdminOrderCreatedNotification()
NotificationsService.createAdminOrderPaidNotification()
NotificationsService.createAdminPendingDispatchNotification()
```

通知触发时机：

| 订单类型 | 触发时机 | 通知类型 |
| --- | --- | --- |
| 咨询预约 | 创建后直接进入待处理 | `admin_order_created` |
| 会员卡预约 | 创建后进入待派单 | `admin_pending_dispatch` |
| 现金服务订单 | 支付前不提醒派单 | 无或低优先级 `admin_order_unpaid` |
| 现金服务订单 | 支付成功进入待派单 | `admin_pending_dispatch` |
| 外来线下已收款订单 | 创建后可派单 | `admin_pending_dispatch` |

通知写入规则：

1. `receiverType=admin`。
2. `receiverId` 可先写 `0` 表示全体管理员；如果现有权限体系要求单人通知，则写入有订单权限的管理员 ID。
3. `bizType=order`。
4. `bizId=order.id`。
5. `title/content` 必须包含订单号、服务名、预约时间。
6. Day38 测试通知必须带 `DAY38_TEST_RUN_ID`。

涉及文件：

```text
server/src/notifications/notifications.service.ts
server/src/notifications/notifications.controller.ts
server/src/orders/orders.service.ts
server/src/payments/payments.service.ts
server/src/admin-business/admin-business.service.ts
admin/src/views/dashboard/index.vue
admin/src/layout 或通知中心相关组件
miniapp/src/pages/staff/home.vue
miniapp/src/pages/staff/notifications.vue
```

### 10.3 Admin 页面改造

Admin 侧需要有一个明确入口消费订单通知：

1. 顶部通知中心显示未读订单事件数。
2. Dashboard 待办继续保留，但和通知中心数据口径分开。
3. 通知列表支持按订单跳转详情。
4. 通知可以标记已读。
5. 订单详情展示通知状态：

```text
Admin 通知：已创建 / 已读 / 未读
师傅通知：notification_id / send_status / read_status
```

### 10.4 通知验收用例

用例 `DAY38-C appointment-admin-staff-notification`：

1. 测试用户发起咨询预约。
2. 验证 Admin 通知：

```sql
SELECT receiver_type, receiver_id, type, biz_type, biz_id, is_read, send_status
FROM notifications
WHERE biz_id = ? AND receiver_type = 'admin';
```

期望：

```text
receiver_type=admin
type=admin_order_created 或 admin_pending_dispatch
biz_type=order
is_read=false
```

3. Admin 通知中心出现未读数。
4. Admin 点击通知进入订单详情并标记已读。
5. Admin 派单给测试师傅。
6. 验证师傅通知：

```sql
SELECT notification_id, notification_status
FROM order_assignments
WHERE order_id = ?;

SELECT receiver_type, receiver_id, type, is_read, send_status
FROM notifications
WHERE biz_id = ? AND receiver_type = 'staff';
```

7. 师傅端首页未读数增加。
8. 师傅通知页显示新任务。
9. 师傅点击通知进入订单详情后，通知变为已读。

## 11. 批次 5：订单记账闭环

### 11.1 当前问题

Day37 结论：订单记账是部分闭环，主要风险在 4 个位置：

1. Admin 手动改订单状态可能绕过支付、积分、收入副作用。
2. 外来订单线下收款没有 `offline` payment 记录。
3. 优惠券未闭环会导致实收金额、积分和收入金额不准。
4. 退款后缺少积分扣回、优惠券回滚和师傅收入冲正。

### 11.2 账务状态改造

Admin 订单编辑需要分层：

| 操作类型 | 是否允许普通编辑 | 正确入口 |
| --- | --- | --- |
| 客户备注、预约时间、服务地址 | 允许 | `updateAdminOrder()` |
| 金额、优惠金额、实付金额 | 限制 | 调价专用接口，写审计和重算 |
| pending_payment -> pending_dispatch | 不允许直接编辑 | 支付成功或线下收款确认接口 |
| pending_confirm -> completed | 不允许直接编辑 | 用户确认、自动确认或 Admin 完成服务确认接口 |
| completed 后产生收入 | 不允许手填 | `createIncomeForCompletedOrder()` |
| paid/refunded 状态 | 不允许直接编辑 | 支付/退款服务 |

建议新增动作接口：

```text
POST /api/admin/orders/:id/confirm-offline-payment
POST /api/admin/orders/:id/complete-service
POST /api/admin/orders/:id/accounting-check
GET  /api/admin/orders/:id/accounting
```

### 11.3 外来订单线下收款

外来订单分两类：

| 类型 | 创建后状态 | payment |
| --- | --- | --- |
| 外来未收款 | `pending_payment` 或 `pending_dispatch` 前置待确认 | 无 success payment |
| 外来已收款 | `pending_dispatch` | 创建 `channel=offline`、`status=success` 的 payment |

线下收款确认规则：

1. 必须输入收款金额、收款时间、收款备注。
2. 生成 `payments`：

```text
channel=offline
status=success
amount=订单 payableAmount
transactionNo=OFFLINE_{orderNo}_{runId}
callbackRaw 包含 runId、operatorId、remark
paidAt=收款时间
```

3. 更新订单：

```text
paidAmount=payment.amount
paidAt=payment.paidAt
status=pending_dispatch
```

4. 写 `payment_notify_logs` 或审计日志，记录线下确认来源。
5. 触发积分和 Admin 待派单通知。

### 11.4 师傅收入记账

收入生成时机保持：

```text
服务完成并被用户确认或自动确认后，生成 staff_income_records
```

规则：

1. 收入金额以 `payableAmount` 为主。
2. 如果 `payableAmount=0` 且存在会员卡核销，不生成现金服务收入。
3. 外来已收款订单必须有 `offline` payment 后才能生成现金收入。
4. 同一 `staffId + orderId + type` 保持幂等。
5. Admin 手动完成服务必须走专用接口，并调用收入生成逻辑。

### 11.5 退款冲正

退款成功后按订单所处阶段处理：

| 阶段 | 积分 | 优惠券 | 师傅收入 |
| --- | --- | --- | --- |
| 未派单或未服务 | 写 `refund_deduct` | 按规则释放或过期 | 无收入 |
| 已派单未完成 | 写 `refund_deduct` | 按规则处理 | 无收入 |
| 已完成未提现 | 写 `refund_deduct` | 按规则处理 | 生成负向冲正或将收入标记 reversed |
| 已提现或提现中 | 写 `refund_deduct` | 按规则处理 | 创建财务异常待人工处理，不直接删账 |

Day38 建议先实现最小安全规则：

1. 未完成订单退款：扣回积分，处理优惠券，不涉及收入。
2. 已完成但未提现订单退款：写负向收入冲正记录或标记原收入 `status=reversed`。
3. 已提现订单退款：不自动改提现账，创建财务待办和审计日志。

### 11.6 账务一致性检查脚本

新增：

```text
server/scripts/day38-check-order-accounting.ts
```

输入：

```bash
pnpm tsx server/scripts/day38-check-order-accounting.ts --order-id 123
pnpm tsx server/scripts/day38-check-order-accounting.ts --run-id DAY38_TEST_20260708HHmmss
```

检查项：

1. `paidAt` 有值时，必须存在 success payment。
2. `paidAmount` 必须等于 success payment 净额或与退款状态一致。
3. 现金服务订单支付成功后必须有 `point_ledgers(type=earn)`。
4. 使用优惠券的订单必须能找到对应 `user_coupons.usedOrderId`。
5. `completed` 且有 `staffId` 的现金服务订单必须有师傅收入或明确豁免原因。
6. `refunded` 订单必须有退款记录和积分扣回记录。
7. 外来已收款订单必须有 `channel=offline` payment。

### 11.7 记账验收用例

用例 `DAY38-D full-accounting-with-withdraw`：

1. 用户创建现金订单。
2. mock 支付成功。
3. Admin 派单。
4. 师傅接单、出发、开始、完成服务。
5. 用户确认完成。
6. 验证：

```sql
SELECT status, paid_amount, paid_at, completed_at
FROM orders
WHERE id = ?;

SELECT status, channel, amount, paid_at
FROM payments
WHERE order_id = ?;

SELECT type, points, amount
FROM point_ledgers
WHERE order_id = ?;

SELECT amount, type, status, settlement_status, withdraw_status
FROM staff_income_records
WHERE order_id = ?;
```

7. 师傅发起提现。
8. 验证收入记录进入 `withdrawStatus=frozen`。
9. Admin mock 打款成功。
10. 验证提现 `status=paid`，收入记录进入 `withdrawn`。

用例 `DAY38-E external-offline-order`：

1. Admin 创建外来订单，备注写入 `DAY38_TEST_RUN_ID`。
2. 确认线下已收款。
3. 验证存在 `channel=offline`、`status=success` 的 payment。
4. 验证订单进入可派单状态。
5. 派单、履约、确认完成后生成师傅收入。

用例 `DAY38-F refund-reversal`：

1. 创建一笔使用优惠券的现金订单。
2. mock 支付成功，验证优惠券 used、积分 earn。
3. 发起退款并审核通过。
4. mock 退款成功。
5. 验证退款后：

```text
payments.status=refunded 或 partial_refunded
refunds.status=refunded
orders.status=refunded 或 after_sales 对应状态
point_ledgers 出现 refund_deduct
user_coupons 按规则 released/available/expired
staff_income_records 按服务阶段无收入、reversed 或进入财务待办
```

## 12. 批次 6：模拟订单全链路测试矩阵

| 用例 | 闭环 | 订单类型 | 核心验证 |
| --- | --- | --- | --- |
| DAY38-A | 优惠券 | 小程序现金订单 | 领券、锁券、折扣、支付核销、退款回滚 |
| DAY38-B | 积分 | 小程序现金订单 | 支付加积分、幂等、退款扣回、积分页展示 |
| DAY38-C | 通知 | 咨询预约 + 派单 | Admin 通知、师傅通知、通知已读 |
| DAY38-D | 记账 | 现金服务订单 | 支付、派单、履约、收入、提现 |
| DAY38-E | 外来订单 | Admin 外来线下订单 | offline payment、派单、收入 |
| DAY38-F | 退款冲正 | 已支付订单 | 退款、积分扣回、券处理、收入处理 |

### 12.1 测试账号和测试资料

测试数据统一格式：

```text
用户昵称：DAY38_TEST_RUN_ID 用户
手机号：19938000001 到 19938000009
地址：DAY38_TEST_RUN_ID 测试地址
优惠券：DAY38_TEST_RUN_ID 满50减10
订单备注：DAY38_TEST_RUN_ID + 用例编号
师傅：优先复用已有 active 测试师傅；若新增，名称和备注必须带 runId
```

### 12.2 每个用例必须留存的验证证据

1. 前端页面截图或手工记录：
   - 用户优惠券页
   - 下单页金额明细
   - 积分页
   - Admin 通知中心
   - 师傅通知页
   - Admin 订单账务面板
2. 数据库检查结果：
   - `orders`
   - `payments`
   - `payment_notify_logs`
   - `user_coupons`
   - `point_ledgers`
   - `notifications`
   - `order_assignments`
   - `staff_income_records`
   - `withdraw_requests`
   - `refunds`
3. 清理前数据统计。
4. 清理后数据统计。

### 12.3 验证命令建议

```bash
cd server
npx prisma validate
npm run build

cd ../admin
pnpm type-check
pnpm build

cd ../miniapp
pnpm type-check
pnpm build:mp
```

如果项目当前没有对应脚本，则记录实际可用脚本，例如 `npm run build` 或 `pnpm build`，不能跳过构建验证。

## 13. 批次 7：测试数据删除和代码洁净

### 13.1 数据删除

所有模拟订单测试完成后，必须立即执行：

```bash
pnpm tsx server/scripts/day38-clean-test-data.ts --run-id DAY38_TEST_20260708HHmmss --dry-run
pnpm tsx server/scripts/day38-clean-test-data.ts --run-id DAY38_TEST_20260708HHmmss --confirm
pnpm tsx server/scripts/day38-verify-clean.ts --run-id DAY38_TEST_20260708HHmmss
```

完成标准：

1. 所有 Day38 测试订单删除。
2. 所有 Day38 测试用户、地址、用户券删除。
3. 所有 Day38 测试支付、退款、通知、积分、收入、提现删除。
4. 所有 Day38 测试优惠券删除。
5. 所有 Day38 测试审计、状态日志、回调日志删除。
6. `verify-clean` 输出全部为 0。

### 13.2 代码洁净

Day38 开发完成后检查：

1. 业务代码中不包含固定测试手机号、测试订单号、测试优惠券名。
2. 测试脚本只位于 `server/scripts` 或测试目录，不被生产启动流程调用。
3. `.env`、密钥、数据库备份文件不提交。
4. 新增迁移只包含业务需要的字段和索引。
5. 如果 `day38-seed-test-data.ts` 是一次性脚本，完成后可删除；如果保留，必须明确标记为手工测试工具且默认 dry-run。

检查命令：

```bash
rg -n "DAY38_TEST|199380000|满50减10|OFFLINE_.*DAY38" server admin miniapp
git status --short
```

允许保留：

```text
docs/plan/day38-closed-loop-completion-and-simulated-order-test-plan.md
server/scripts/day38-*.ts
```

不允许保留：

```text
业务服务里的硬编码测试数据
提交到仓库的数据库 dump
提交到仓库的真实 token / cookie / openid
```

## 14. 批次 8：部署和冒烟回归

### 14.1 本地构建

```bash
cd server
npm run build

cd ../admin
pnpm build

cd ../miniapp
pnpm build:mp
```

### 14.2 云端部署准备

如果 Day38 进入云端测试，按当前项目服务器路径执行：

```bash
ssh aliyun-backend
cd /www/wwwroot/life-assistant
git status --short
git fetch --all --tags
git checkout day38-closed-loop-fix
docker compose build server
docker compose up -d server
docker ps
```

实际命令以当前云端 `docker-compose.yml` 或 `compose.yaml` 为准。

### 14.3 冒烟检查

```bash
curl -i https://www.xunhaoyou.com/api/health
curl -i https://www.xunhaoyou.com/api/user/points
curl -i https://www.xunhaoyou.com/api/staff/notifications
curl -i https://www.xunhaoyou.com/api/admin/coupons
```

预期：

1. `health` 返回正常。
2. 需要鉴权的接口返回 `401` 或业务鉴权错误，不应返回 `404`。
3. 后端容器无启动错误。
4. 数据库 migration 状态正常。

## 15. Day38 完成定义

Day38 完成必须同时满足：

1. D38-01 到 D38-06 均有代码落地或明确延期原因。
2. 六个模拟订单用例至少跑通 A、B、C、D、E；F 如果因退款策略需要产品确认，可先固定规则并完成未完成订单退款验证。
3. 每个闭环都有数据库证据和前端页面证据。
4. 订单账务一致性检查脚本对 Day38 测试订单通过。
5. 所有 Day38 测试数据已按 `runId` 删除。
6. 清理后残留检查全部为 0。
7. 本地构建通过，云端测试后健康检查通过。
8. 代码中没有测试数据硬编码、临时 token、数据库 dump 或无用调试输出。

## 16. Day38 交付物

| 交付物 | 路径或位置 | 说明 |
| --- | --- | --- |
| 闭环修复代码 | `server/src`、`admin/src`、`miniapp/src` | 优惠券、积分、通知、记账闭环 |
| 数据库迁移 | `server/prisma/migrations` | 仅在确有字段或索引缺口时新增 |
| 测试数据脚本 | `server/scripts/day38-*.ts` | 支持 runId、dry-run、confirm |
| 闭环验证记录 | `docs/plan/day38-test-result.md` 或 Day38 文档追加章节 | 记录每个用例结果和清理结果 |
| 清理证明 | `verify-clean` 输出 | 所有 Day38 测试数据计数为 0 |

## 17. 执行顺序建议

Day38 实施时按以下顺序推进：

1. 建立 `runId`、seed、cleanup、verify-clean 脚本。
2. 补优惠券用户侧接口和下单事务校验。
3. 补支付成功核销优惠券和积分事务/补偿。
4. 补退款成功后的优惠券、积分和收入冲正规则。
5. 补 Admin 订单通知和通知中心入口。
6. 限制 Admin 手动状态编辑，新增线下收款和账务检查入口。
7. 跑 `DAY38-A` 到 `DAY38-F` 模拟订单。
8. 执行 dry-run 清理，确认数量无误后 confirm 清理。
9. 执行清理后复核和构建。
10. 记录 Day38 测试结果，准备进入下一版本发布。

## 18. 实际落地脚本

本轮实现后，Day38 本地闭环验证使用以下脚本：

```bash
cd server
npx tsx scripts/day38-run-smoke.ts --run-id DAY38_TEST_yyyyMMddHHmmss
npx tsx scripts/day38-check-order-accounting.ts --run-id DAY38_TEST_yyyyMMddHHmmss
npx tsx scripts/day38-clean-test-data.ts --run-id DAY38_TEST_yyyyMMddHHmmss --dry-run
npx tsx scripts/day38-clean-test-data.ts --run-id DAY38_TEST_yyyyMMddHHmmss --confirm
npx tsx scripts/day38-clean-test-data.ts --run-id DAY38_TEST_yyyyMMddHHmmss --dry-run
```

`day38-run-smoke.ts` 会在缺少可复用服务资料时创建带 `DAY38_TEST_` 标记的临时服务分类和现金服务；测试结束后由 `day38-clean-test-data.ts` 一并清理。脚本覆盖优惠券领用、下单锁券、mock 支付核销、积分入账、Admin 通知、师傅派单通知、完成服务后收入入账、外来订单线下收款和账务检查。
