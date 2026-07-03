# Day 13 真实订单流转行动计划

更新日期：2026-06-02

## 1. 目标

Day 13 的目标是把订单从“部分真实、部分 mock”改成三端共享同一条真实订单状态链路。

由于当前没有条件接真实支付回调，本阶段不接微信支付、聚合支付或真实回调验签。支付环节先在用户端订单处理中加入一个“模拟支付成功”按钮，用它触发后端开发环境 mock 支付能力，生成真实 `pay_success` 状态日志，并把订单推进到 `pending_dispatch`。

除支付回调外，其余订单流转必须全部走真实后端 API 和真实数据库：

```txt
用户创建订单
用户点击模拟支付成功
后台管理员派单
师傅端看到真实订单
师傅接单
师傅上门
师傅开始服务
师傅完成服务
用户确认完成
后台、用户端、师傅端看到同一个 completed 订单
```

Day 13 完成后，订单系统应形成：

```txt
同一张 orders 表
同一个 orderId
同一套 order status
同一份 order_status_logs
三端通过 API 读写同一份订单数据
```

## 2. 不做什么

Day 13 暂不做：

```txt
真实微信支付
真实聚合支付
真实支付回调验签
真实退款
真实售后闭环
自动派单算法
复杂师傅排班
消息推送
生产级 staff 登录
```

这些能力不影响本阶段验证订单主流程。Day 13 的重点是先把订单主链路真实跑通。

## 3. 当前问题

根据当前代码和数据库检查，订单断点主要是：

```txt
用户端订单列表仍使用 getMockOrders
用户端订单详情仍使用 getMockOrderDetail
用户端确认完成没有调用 /orders/:id/confirm
用户端支付结果页没有调用 /orders/:id/pay 和 /payments/mock-success
师傅端订单 API 整体仍使用 mockStaffTasks
师傅端接单、上门、开始、完成都没有调用真实 /staff/orders 接口
当前数据库 activeStaff = 0，无法完成后台派单
开发环境师傅端请求没有 X-Staff-Id，无法识别模拟师傅身份
```

后端状态机和数据库结构基本可用，不优先重写。

## 4. 目标状态机

Day 13 必须跑通这条状态链：

```txt
create_order
  null -> pending_payment

pay_success
  pending_payment -> pending_dispatch

admin_assign
  pending_dispatch -> dispatched

staff_accept
  dispatched -> accepted

staff_on_the_way
  accepted -> on_the_way

staff_start
  on_the_way -> in_service

staff_complete
  in_service -> pending_confirm

user_confirm
  pending_confirm -> completed
```

最终验收时，`order_status_logs.action` 必须包含：

```txt
create_order
pay_success
admin_assign
staff_accept
staff_on_the_way
staff_start
staff_complete
user_confirm
```

## 5. 实施原则

### 5.1 前端不直接改状态

前端只能调用动作接口，不能在本地把订单状态改成目标状态后当作成功。

错误做法：

```txt
order.status = 'completed'
```

正确做法：

```txt
POST /orders/:id/confirm
重新拉取 GET /orders/:id
```

### 5.2 支付模拟也必须走后端

模拟支付按钮不能只改前端 UI。必须调用后端：

```txt
POST /orders/:id/pay
POST /payments/mock-success
GET  /orders/:id
```

这样数据库会真实写入：

```txt
payments
payment_notify_logs
order_status_logs(pay_success)
orders.paid_at
orders.paid_amount
orders.status = pending_dispatch
```

### 5.3 版本号跟随后端

涉及状态流转的接口应尽量带上当前订单 `version`：

```txt
cancel
confirm
staff on-the-way
staff start-service
staff complete
```

状态动作成功后必须刷新详情，拿最新 `version`。

### 5.4 师傅端只是订单的另一种视图

师傅端不再维护独立 mock task。师傅端任务卡片来自真实订单，`dispatched` 在师傅端展示为 `pending_accept`。

映射规则：

```txt
dispatched -> pending_accept
accepted -> accepted
on_the_way -> on_the_way
in_service -> in_service
pending_confirm -> pending_confirm
completed -> completed
cancelled -> cancelled
```

## 6. P0 后端准备

### 6.1 确认现有接口可用

需要确认这些接口继续可用：

```txt
GET  /orders
GET  /orders/:id
POST /orders
POST /orders/:id/cancel
POST /orders/:id/confirm

POST /orders/:id/pay
POST /payments/mock-success

GET  /admin/orders
GET  /admin/orders/:id
POST /admin/orders/:id/assign
GET  /admin/staff/options

GET  /staff/orders
GET  /staff/orders/:id
POST /staff/orders/:id/accept
POST /staff/orders/:id/reject
POST /staff/orders/:id/on-the-way
POST /staff/orders/:id/start-service
POST /staff/orders/:id/complete
```

### 6.2 补充模拟支付前端 API

当前小程序已有：

```txt
payOrder(id)
```

需要补：

```txt
mockPaymentSuccess(data)
POST /payments/mock-success
```

建议放在：

```txt
miniapp/src/api/orders.ts
```

返回结果使用后端 `mockSuccess` 的真实返回值。

### 6.3 确认 OrderDetail 类型

需要在：

```txt
miniapp/src/api/types/orders.ts
```

补充：

```ts
version: number
paidAt?: string | null
completedAt?: string | null
servicePhotos?: string[]
```

`version` 是状态流转按钮的关键字段。

## 7. P0 数据准备

当前开发库没有 active staff。Day 13 必须先准备一个可派单师傅。

推荐方案：

```txt
通过 admin 师傅管理页面创建一个师傅
或补一个开发 seed 脚本创建 dev staff
```

开发师傅要求：

```txt
status = 1
deleted_at = null
work_status = 1
phone 可识别
name 可识别，例如 Dev Staff
```

同时记录该师傅的 `staffId`，给小程序师傅端开发调试使用。

## 8. P0 用户端订单真实化

### 8.1 订单列表改真实 API

修改：

```txt
miniapp/src/pages/order/list.vue
```

动作：

```txt
移除 getMockOrders
调用 getOrders({ status, page, pageSize })
使用后端返回 items 渲染 order-card
onShow 时刷新列表
取消订单调用 cancelOrder(id)
支付按钮跳转订单详情或支付结果页
```

验收：

```txt
创建订单后，订单列表能看到真实订单
筛选待支付、待派单、服务中、待确认、已完成能返回真实数据
刷新页面后订单仍存在
```

### 8.2 订单详情改真实 API

修改：

```txt
miniapp/src/pages/order/detail.vue
```

动作：

```txt
移除 getMockOrderDetail
onLoad 调用 getOrderDetail(id)
状态按钮根据真实 order.status 展示
取消订单调用 cancelOrder(id, version)
确认完成调用 confirmOrder(id, version)
动作成功后重新拉取 getOrderDetail(id)
```

验收：

```txt
详情页展示真实 orderNo
详情页展示真实 staffName / staffPhone
详情页展示真实 statusLogs
pending_confirm 点击确认完成后，数据库订单变 completed
completed 后用户端、admin、师傅端状态一致
```

### 8.3 加入模拟支付成功按钮

推荐位置：

```txt
miniapp/src/pages/order/detail.vue
miniapp/src/pages/payment/result.vue
```

展示条件：

```txt
order.status === 'pending_payment'
开发环境或非 production 环境
```

按钮文案：

```txt
模拟支付成功
```

按钮行为：

```txt
1. 调用 payOrder(order.id)
2. 拿到 paymentNo
3. 调用 mockPaymentSuccess({ paymentNo })
4. 重新拉取订单详情
5. 提示“支付已模拟成功”
6. 订单状态应变为 pending_dispatch
```

失败处理：

```txt
如果订单已支付，刷新详情并提示当前订单已支付
如果订单状态不是 pending_payment，提示当前状态不可支付
如果后端返回 mock payment disabled，提示当前环境不允许模拟支付
```

验收：

```txt
点击模拟支付成功后，订单从 pending_payment 变 pending_dispatch
admin 订单列表出现待派单订单
order_status_logs 出现 pay_success
payments 出现 success 记录
```

## 9. P0 admin 派单走查

admin 当前已有订单详情派单入口。Day 13 重点是联调，而不是大改 admin。

需要确认：

```txt
pending_dispatch 订单显示“审核并派单”
GET /admin/staff/options 能返回 active staff
POST /admin/orders/:id/assign 能成功
派单后订单状态变 dispatched
订单 staffId / staffName 写入
order_assignments 写入 pending 记录
order_status_logs 写入 admin_assign
```

如果 admin 页面无法操作，允许先用接口工具完成派单，但最终验收必须回到 admin 页面能看到真实派单结果。

## 10. P0 师傅端订单真实化

### 10.1 替换 staff mock API

修改：

```txt
miniapp/src/api/staff.ts
```

动作：

```txt
移除或隔离 mockStaffTasks
getStaffTasks 调用 GET /staff/orders
getStaffTaskDetail 调用 GET /staff/orders/:id
acceptStaffTask 调用 POST /staff/orders/:id/accept
rejectStaffTask 调用 POST /staff/orders/:id/reject
checkinStaffTask 调用 POST /staff/orders/:id/on-the-way
startStaffTask 调用 POST /staff/orders/:id/start-service
completeStaffTask 调用 POST /staff/orders/:id/complete
```

需要新增映射函数：

```txt
OrderDetail/UserOrder -> StaffTask
```

映射重点：

```txt
id = order.id
orderNo = order.orderNo
status = order.status === 'dispatched' ? 'pending_accept' : order.status
group = 'dispatch'
serviceName = order.serviceName
serviceSpec = order.service?.priceUnit
appointmentTime = order.appointmentTime
customerName = order.address.contactName
customerPhone = order.address.contactPhone
addressText = order.addressText
remark = order.remark
incomeAmount = order.payableAmount
photos = order.servicePhotos
```

### 10.2 开发环境师傅身份

后端开发环境支持：

```txt
X-Staff-Id
```

需要在小程序师傅端 API 请求中带上模拟师傅 ID。

推荐方案：

```txt
新增 staff dev identity 工具
优先从本地 storage 读取 DEV_STAFF_ID
没有时使用 .env 中 VITE_DEV_STAFF_ID
只给 /staff/orders 请求加 X-Staff-Id
```

不要给用户端普通订单请求加 `X-Staff-Id`。

### 10.3 师傅端页面接真实动作

修改：

```txt
miniapp/src/pages/staff/home.vue
miniapp/src/pages/staff/orders.vue
miniapp/src/pages/staff/order-detail.vue
miniapp/src/pages/staff/upload-photos.vue
```

动作：

```txt
列表读取真实任务
详情读取真实任务
接单后刷新详情
上门后刷新详情
开始服务后刷新详情
完成服务调用 completeStaffTask(id, { version, photoUrls, remark })
上传照片如果暂时没有真实文件模块，可先使用本地已可展示的 URL 或后端已有文件接口
```

验收：

```txt
admin 派单后，师傅端能看到该订单
师傅接单后，用户端订单状态变 accepted
师傅上门后，用户端订单状态变 on_the_way
师傅开始服务后，用户端订单状态变 in_service
师傅完成服务后，用户端订单状态变 pending_confirm
```

## 11. P1 支付体验与开发保护

模拟支付按钮必须避免误进生产。

前端保护：

```txt
只在 VITE_APP_ENV !== 'production' 或 VITE_ENABLE_MOCK_PAYMENT === 'true' 时展示
按钮旁不写过多说明，只保留开发调试所需文案
```

后端保护已经存在：

```txt
NODE_ENV === 'production' 时 mock payment disabled
```

建议补充：

```txt
前端按钮点击时二次确认
成功后跳转订单详情
失败时展示后端 message
```

## 12. P1 状态刷新与三端一致性

用户端、师傅端、admin 端都需要状态动作后刷新数据。

规则：

```txt
动作成功后不信任本地状态
统一重新 GET 详情或列表
详情页 onShow 刷新
列表页 onShow 刷新
状态按钮 loading 防重复点击
```

对于旧页面已有的本地 mock 状态切换，全部删除。

## 13. P1 空状态与异常状态

需要处理：

```txt
没有订单
没有可派单师傅
订单状态已变化
订单 version 已变化
当前师傅不是订单绑定师傅
订单已取消
订单已完成
重复点击模拟支付成功
重复点击确认完成
```

后端返回 409 时，前端处理方式：

```txt
提示“订单状态已更新”
重新拉取详情
根据最新状态重绘按钮
```

## 14. 验收路径

### 14.1 用户端创建订单

```txt
用户登录
选择服务
选择真实地址
提交订单
订单状态 = pending_payment
用户订单列表能看到该订单
订单详情能看到真实 orderNo
```

### 14.2 模拟支付成功

```txt
订单详情点击“模拟支付成功”
订单状态 = pending_dispatch
admin 订单列表能看到待派单订单
order_status_logs 有 pay_success
```

### 14.3 admin 派单

```txt
admin 打开订单详情
选择 active staff
确认派单
订单状态 = dispatched
orders.staff_id 有值
order_assignments 有记录
```

### 14.4 师傅端履约

```txt
师傅端进入订单列表
看到 admin 派给自己的订单
点击接单
订单状态 = accepted
点击上门
订单状态 = on_the_way
点击开始服务
订单状态 = in_service
点击完成服务
订单状态 = pending_confirm
```

### 14.5 用户确认完成

```txt
用户端订单详情显示待确认
点击确认完成
订单状态 = completed
orders.completed_at 有值
order_status_logs 有 user_confirm
admin、用户端、师傅端均显示已完成
```

## 15. 必须跑的验证

后端：

```txt
cd server
pnpm build
pnpm test:contract
```

小程序：

```txt
cd miniapp
pnpm build:mp
```

真机或开发者工具走查：

```txt
创建订单
模拟支付
admin 派单
师傅接单
师傅履约
用户确认
三端刷新一致
```

数据库抽查：

```sql
select id, order_no, status, staff_id, version, paid_at, completed_at
from orders
order by id desc
limit 5;

select action, from_status, to_status, operator_type, operator_id
from order_status_logs
where order_id = <orderId>
order by id asc;
```

预期最终订单：

```txt
orders.status = completed
orders.staff_id is not null
orders.paid_at is not null
orders.completed_at is not null
order_status_logs action 序列完整
```

## 16. 推荐执行顺序

```txt
1. 准备 active staff 和 DEV_STAFF_ID
2. 用户端订单列表改真实 getOrders
3. 用户端订单详情改真实 getOrderDetail / cancelOrder / confirmOrder
4. 用户端加入“模拟支付成功”按钮并调用 payOrder + mockPaymentSuccess
5. admin 用真实 pending_dispatch 订单完成派单走查
6. 师傅端 staff.ts 替换 mockStaffTasks 为真实 /staff/orders API
7. 师傅端列表、详情、动作按钮接真实状态流转
8. 三端完整跑一单到 completed
9. 跑 server build、contract test、miniapp build:mp
10. 把验收结果补充到 docs/summary
```

## 17. 完成标准

Day 13 完成的标准不是“页面按钮都能点”，而是数据库中存在一条完整真实流转订单：

```txt
pending_payment
pending_dispatch
dispatched
accepted
on_the_way
in_service
pending_confirm
completed
```

并且：

```txt
用户端看到的是这条真实订单
师傅端看到的是这条真实订单
admin 看到的是这条真实订单
三个前端刷新后状态一致
所有状态变化都来自后端动作接口
order_status_logs 能解释每一步是谁操作的
```
