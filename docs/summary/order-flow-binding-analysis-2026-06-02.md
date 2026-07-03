# 订单绑定与状态流转问题分析

更新日期：2026-06-02

## 1. 当前结论

当前问题不是数据库不支持订单状态流转，也不是后端没有状态机。真正的问题是：

```txt
用户端只有“创建订单”接入了真实后端；
用户端订单列表、订单详情、确认完成、取消订单仍然使用 mock；
师傅端订单模块整体仍然使用本地 mock task；
支付结果页没有触发后端 mock 支付成功；
当前数据库没有 active 师傅，无法完成真实派单绑定。
```

所以现在用户端创建出来的真实订单，师傅端不会看到；师傅端操作的订单也不是数据库里的订单；用户端点击“确认完成”只是修改了前端 mock 数据，并没有调用后端 `/orders/:id/confirm`，因此数据库订单不会真实变成 `completed`。

一句话判断：

```txt
后端订单流转能力基本完整，但用户端和师傅端订单前端还没有接入同一套真实订单 API。
当前三端还没有形成“同一张 orders 表、同一个 orderId、同一套状态机”的闭环。
```

## 2. 理想订单闭环

真实订单闭环应该是：

```txt
用户创建订单
  -> orders.status = pending_payment

用户支付成功 / 开发环境 mock 支付成功
  -> orders.status = pending_dispatch

管理员后台派单给某个 active staff
  -> orders.staff_id = staff.id
  -> orders.status = dispatched
  -> order_assignments 写入派单记录

师傅接单
  -> orders.status = accepted
  -> order_assignments.assign_status = accepted

师傅上门
  -> orders.status = on_the_way
  -> service_checkins 写入 on_the_way

师傅开始服务
  -> orders.status = in_service
  -> service_checkins 写入 start

师傅完成服务
  -> orders.status = pending_confirm
  -> service_checkins 写入 finish
  -> service_photos 可写入履约照片

用户确认完成
  -> orders.status = completed
  -> orders.completed_at 写入时间
  -> order_status_logs 写入 user_confirm
```

当前后端已经支持这条链路，但前端没有真实触发完整链路。

## 3. 用户端订单模块现状

### 3.1 已接真实接口的部分

`miniapp/src/pages/order/create.vue` 已经调用：

```txt
miniapp/src/api/orders.ts -> createOrder()
POST /orders
```

这意味着用户从创建页提交订单时，理论上可以真实写入数据库。

### 3.2 未接真实接口的部分

`miniapp/src/pages/order/list.vue` 仍然使用：

```txt
getMockOrders()
```

该页面没有调用：

```txt
getOrders()
GET /orders
```

结果是：用户真实创建的订单不会出现在“我的订单”真实列表中，前端看到的是 mockDay4 里的假订单。

`miniapp/src/pages/order/detail.vue` 仍然使用：

```txt
getMockOrderDetail()
```

该页面没有调用：

```txt
getOrderDetail(id)
GET /orders/:id
```

并且用户点击“确认完成”时，当前逻辑是：

```txt
setTimeout 后把 order.value 改成另一个 mock 详情
```

没有调用：

```txt
confirmOrder(id)
POST /orders/:id/confirm
```

因此“确认完成”不会写数据库、不会触发后端状态机、不会写 `order_status_logs`，也不会更新 `orders.completed_at`。

### 3.3 支付结果页没有推进订单状态

`miniapp/src/pages/payment/result.vue` 当前只展示支付结果 UI，没有调用：

```txt
payOrder(id)
POST /orders/:id/pay

POST /payments/mock-success
```

后端开发环境下的 mock 支付链路是：

```txt
POST /orders/:id/pay
  -> 创建 payment，status = pending

POST /payments/mock-success
  -> payment.status = success
  -> orders.status 从 pending_payment 推进到 pending_dispatch
```

当前前端创建订单后跳到支付结果页，但没有真正把订单从 `pending_payment` 推进到 `pending_dispatch`。这会导致后台派单入口无法自然出现，后续师傅绑定也无法开始。

## 4. 师傅端订单模块现状

`miniapp/src/api/staff.ts` 当前是本地 mock 实现，核心数据来自：

```txt
mockStaffTasks
```

这些任务的订单号类似：

```txt
ST202605290901
ST202605290902
```

它们不是数据库 `orders` 表中的真实订单。

当前师傅端页面调用的是：

```txt
miniapp/src/pages/staff/home.vue
miniapp/src/pages/staff/orders.vue
miniapp/src/pages/staff/order-detail.vue
miniapp/src/pages/staff/upload-photos.vue

getStaffTasks()
getStaffTaskDetail()
acceptStaffTask()
rejectStaffTask()
checkinStaffTask()
startStaffTask()
completeStaffTask()
uploadStaffOrderPhotos()
```

但这些函数都只是修改 `mockStaffTasks`，没有调用后端真实接口：

```txt
GET  /staff/orders
GET  /staff/orders/:id
POST /staff/orders/:id/accept
POST /staff/orders/:id/reject
POST /staff/orders/:id/on-the-way
POST /staff/orders/:id/start-service
POST /staff/orders/:id/complete
```

所以当前师傅端无法看到用户端创建的真实订单；师傅端点击接单、上门、开始、完成，也不会改变数据库中的 `orders.status`。

## 5. 后端订单能力检查

后端订单模块已经具备完整状态机。

状态流转规则在：

```txt
server/src/orders/order-state-machine.ts
```

核心流转包括：

```txt
create_order:      null -> pending_payment
pay_success:       pending_payment -> pending_dispatch
admin_assign:      pending_dispatch -> dispatched
staff_accept:      dispatched -> accepted
staff_on_the_way:  accepted -> on_the_way
staff_start:       on_the_way -> in_service
staff_complete:    in_service -> pending_confirm
user_confirm:      pending_confirm -> completed
```

状态推进服务在：

```txt
server/src/orders/order-transition.service.ts
```

已经支持：

```txt
状态前置校验
version 并发校验
乐观锁 / 悲观锁
状态日志 order_status_logs
事务内副作用
锁冲突重试
```

订单服务在：

```txt
server/src/orders/orders.service.ts
```

已经支持：

```txt
用户创建订单
用户订单列表
用户订单详情
用户取消未支付订单
用户确认完成

管理员订单列表
管理员订单详情
管理员派单
管理员备注
可派单师傅列表

师傅订单列表
师傅订单详情
师傅接单
师傅拒单
师傅上门
师傅开始服务
师傅完成服务
```

接口控制器在：

```txt
server/src/orders/orders.controller.ts
server/src/payments/payments.controller.ts
```

已经暴露真实 API。

## 6. 数据库结构检查

`server/prisma/schema.prisma` 支持当前订单流转需要的核心结构。

`orders` 表支持：

```txt
status
version
user_id
staff_id
service_snapshot
address_snapshot
paid_at
completed_at
cancelled_at
cancel_reason
```

`order_status_logs` 支持每次状态变化审计：

```txt
order_id
from_status
to_status
operator_type
operator_id
action
request_id
detail
remark
created_at
```

`order_assignments` 支持派单与接拒单记录：

```txt
order_id
staff_id
assign_type
assign_status
assigned_by
assigned_at
accepted_at
rejected_at
reject_reason
```

`payments` 和 `payment_notify_logs` 支持支付与回调记录。

`service_checkins` 和 `service_photos` 支持师傅上门、开始、完成、履约照片。

结论：

```txt
数据库系统可以支撑订单状态流转机制。
当前问题不是数据库结构缺失，而是前端真实 API 接入和当前数据初始化不足。
```

## 7. 当前数据库状态

本次查询当前开发库得到：

```json
{
  "users": 4,
  "activeStaff": 0,
  "orders": 0,
  "activeAddresses": 1,
  "activeServices": 40,
  "byStatus": {},
  "latestOrders": [],
  "staff": []
}
```

这说明：

```txt
当前库里没有真实订单；
当前没有 active staff；
即使用户端创建订单成功，也需要先有 active staff 才能后台派单；
没有 staff_id 绑定的订单不会出现在真实师傅端订单列表。
```

后端管理员派单接口会检查：

```txt
staff.status = 1
staff.deleted_at is null
```

如果没有这样的师傅，派单会失败。

## 8. 身份与调试限制

后端师傅接口当前支持两种身份来源：

```txt
真实 JWT 中 role = staff
开发环境请求头 X-Staff-Id
```

当前小程序统一请求拦截器只自动添加：

```txt
Authorization
X-Request-Source
X-Client-Version
```

没有自动添加：

```txt
X-Staff-Id
```

因此即使把师傅端 API 改成真实 `/staff/orders`，开发调试时也需要明确处理模拟师傅身份：

```txt
方案 A：开发环境在师傅端请求中带 X-Staff-Id
方案 B：补真实 staff 登录，JWT 里带 staff role
```

当前更适合先走方案 A，等师傅端稳定后再补真实 staff 登录。

## 9. 为什么“用户确认完成”没有真实完成

直接原因：

```txt
miniapp/src/pages/order/detail.vue 没有调用 confirmOrder(id)
```

深层原因：

```txt
用户端订单详情页展示的是 mock 订单，不是真实订单；
师傅端完成服务也是 mock，不会把真实订单推进到 pending_confirm；
后端 user_confirm 只允许 pending_confirm -> completed；
当前真实订单链路没有先到 pending_confirm，所以即使调用真实 confirm，也需要满足前置状态。
```

也就是说，真实完成必须满足：

```txt
订单真实存在
订单属于当前用户
订单已支付
订单已被后台派给真实 active staff
师傅已真实接单
师傅已真实上门
师傅已真实开始服务
师傅已真实完成服务
订单状态已经是 pending_confirm
用户再调用 /orders/:id/confirm
```

当前前端没有做到这些，所以“确认完成”只能是视觉上的 mock 完成。

## 10. 修复优先级建议

### P0：让用户端订单页接真实订单 API

需要改：

```txt
miniapp/src/pages/order/list.vue
miniapp/src/pages/order/detail.vue
miniapp/src/api/types/orders.ts
```

动作：

```txt
订单列表改用 getOrders()
订单详情改用 getOrderDetail(id)
确认完成改用 confirmOrder(id)
取消订单改用 cancelOrder(id)
OrderDetail 类型补 version
状态操作后重新拉取订单详情
```

### P0：让开发支付能真实推进订单

需要改：

```txt
miniapp/src/api/orders.ts
miniapp/src/pages/payment/result.vue
```

动作：

```txt
支付页调用 payOrder(id)
开发环境调用 /payments/mock-success
支付成功后订单状态进入 pending_dispatch
```

如果暂时不想自动 mock 支付，可以在订单详情或支付页放一个开发调试按钮，但按钮必须真实调用后端支付接口。

### P0：创建或恢复 active staff

当前数据库 `activeStaff = 0`，必须先有一个：

```txt
status = 1
deleted_at = null
```

的师傅，后台才能派单。

可以通过 admin 师傅管理模块创建，也可以通过 seed 脚本创建开发师傅。

### P0：师傅端订单 API 从 mock 改为真实接口

需要改：

```txt
miniapp/src/api/staff.ts
miniapp/src/pages/staff/home.vue
miniapp/src/pages/staff/orders.vue
miniapp/src/pages/staff/order-detail.vue
miniapp/src/pages/staff/upload-photos.vue
```

动作：

```txt
GET /staff/orders 映射为 StaffTask[]
GET /staff/orders/:id 映射为 StaffTask
POST /staff/orders/:id/accept
POST /staff/orders/:id/reject
POST /staff/orders/:id/on-the-way
POST /staff/orders/:id/start-service
POST /staff/orders/:id/complete
开发环境请求头带 X-Staff-Id
```

注意后端订单状态是：

```txt
dispatched
accepted
on_the_way
in_service
pending_confirm
completed
cancelled
```

而当前师傅端 UI 类型使用：

```txt
pending_accept
accepted
on_the_way
in_service
pending_confirm
completed
rejected
cancelled
```

需要做映射：

```txt
dispatched -> pending_accept
```

其余状态基本可以直接复用。

### P1：后台派单真实走查

admin 当前已有派单入口：

```txt
admin/src/views/life/orders/detail.vue
admin/src/views/life/orders/index.vue
admin/src/api/life/index.ts
```

但必须满足：

```txt
订单状态为 pending_dispatch
存在 active staff
管理员身份可用
```

建议在完成用户端支付接入后，用 admin 跑一次真实派单。

### P1：增加一条端到端开发验收脚本

后端 contract test 已经覆盖完整主链路，建议前端联调时也按同样顺序手工验收：

```txt
用户创建订单
开发支付成功
admin 派单
师傅端看到该订单
师傅接单
师傅上门
师傅开始服务
师傅上传照片并完成
用户端看到待确认
用户确认完成
admin 看到 completed
order_status_logs 包含完整 action 序列
```

预期日志序列：

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

## 11. 最终判断

当前订单模块的后端基础是够的，数据库也支持真实状态流转。现在主要断点在前端：

```txt
用户端订单读写没有完全真实化；
师傅端订单仍是 mock；
支付页没有推进真实支付成功；
当前库里没有 active staff；
开发环境师傅身份没有传给后端。
```

因此后续修复不应该优先重写数据库或状态机，而应该优先把用户端、师傅端、admin 端统一接到同一个真实订单 API 和同一条状态机上。

推荐下一步直接按以下顺序实施：

```txt
1. 用户端订单列表/详情/确认完成真实化
2. 开发支付 mock-success 真实推进订单到 pending_dispatch
3. 创建 active staff
4. admin 完成派单
5. 师傅端订单列表/详情/状态动作真实化
6. 端到端验证 completed 与 order_status_logs
```
