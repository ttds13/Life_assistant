# 订单状态机与用户端/师傅端交互逻辑梳理

更新日期：2026-05-28

## 1. 先建立正确理解

订单系统不要理解成“用户端一套订单、师傅端一套订单”。正确模型是：

```txt
同一张 orders 表保存订单主状态
用户端展示“我的订单”
师傅端展示“我的任务”
后台展示“订单调度”
三端通过不同动作推动同一个订单状态机
```

也就是说，用户端、后台端、师傅端只是不同角色的操作入口，真正决定订单处于哪个阶段的是后端状态机。

核心原则：

```txt
前端只触发动作，不直接决定订单状态
后端校验当前状态、操作者身份、订单归属后推进状态
每次状态变化必须写 order_status_logs
金额、支付、派单、履约都以后端和数据库为准
```

## 2. 参与角色

订单闭环至少有四类参与者：

```txt
用户 user
  创建订单、支付、取消、查看进度、确认完成、评价、售后

后台管理员 admin
  查看待派单订单、人工派单、改派、处理异常、处理售后

师傅 staff
  查看分配给自己的任务、接单、拒单、上门、服务、上传照片、完成服务

系统 system
  微信支付回调、超时取消、通知发送、状态自动任务
```

这里要特别注意：微信支付成功不是用户端说了算，而是系统通过微信支付回调确认后推动订单状态。

## 3. 核心数据表职责

当前 `server/prisma/schema.prisma` 已经具备订单闭环需要的核心表。

### 3.1 orders

订单主表，保存当前订单的最终事实。

关键字段：

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
paidAt
completedAt
cancelledAt
cancelReason
```

理解重点：

```txt
orders.status 是当前状态
orders 不负责记录完整状态历史
历史状态必须看 order_status_logs
```

### 3.2 order_status_logs

订单状态日志表，保存每一次状态变化。

关键字段：

```txt
orderId
fromStatus
toStatus
operatorType
operatorId
remark
createdAt
```

理解重点：

```txt
所有状态变化都必须写日志
日志是排查支付、派单、履约争议的依据
不要只改 orders.status
```

### 3.3 payments 和 payment_notify_logs

支付记录和支付回调日志。

`payments` 记录一次支付行为：

```txt
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
```

`payment_notify_logs` 记录支付回调原始信息和处理结果：

```txt
paymentNo
channel
rawBody
processResult
createdAt
```

理解重点：

```txt
支付是否成功以微信回调为准
用户端支付成功提示不能直接把订单改成已支付
支付回调必须可重复处理，不能重复加钱或重复推进状态
```

### 3.4 order_assignments

派单记录表，保存后台把订单派给哪个师傅，以及师傅是否接单。

关键字段：

```txt
orderId
staffId
assignType
assignStatus
assignedBy
assignedAt
acceptedAt
rejectedAt
rejectReason
```

理解重点：

```txt
orders.staffId 表示当前服务师傅
order_assignments 保存派单过程
师傅拒单时，不要删除派单记录，应标记 rejected
改派时新增派单记录，保留历史
```

### 3.5 service_checkins 和 service_photos

履约过程记录。

`service_checkins` 记录上门、到达等打卡：

```txt
orderId
staffId
checkinType
latitude
longitude
addressText
photoUrl
createdAt
```

`service_photos` 记录服务照片：

```txt
orderId
staffId
photoType
url
remark
createdAt
```

理解重点：

```txt
师傅完成服务前最好要求至少上传服务照片
照片、打卡记录是用户确认和售后处理的依据
```

## 4. 推荐统一状态命名

当前文档里出现过 `assigned`，小程序类型里使用的是 `dispatched`。建议统一使用 `dispatched`，避免同一语义两套状态名。

MVP 推荐主状态：

```txt
pending_payment     待支付
pending_dispatch    待派单
dispatched          已派单，等待师傅接单
accepted            师傅已接单
on_the_way          师傅上门中
in_service          服务中
pending_confirm     待用户确认
completed           已完成
cancelled           已取消
refund_pending      退款中
refunded            已退款
after_sales         售后中
```

需要统一的点：

```txt
不要同时使用 assigned 和 dispatched
不要同时使用 after_sale 和 after_sales
前端类型、后端常量、数据库写入、UI 状态映射必须一致
```

## 5. 主流程状态机

MVP 主流程如下：

```txt
pending_payment
  用户已提交订单，等待支付

-> pending_dispatch
  支付成功，等待后台派单

-> dispatched
  后台已派单，等待师傅接单

-> accepted
  师傅已接单

-> on_the_way
  师傅已出发上门

-> in_service
  师傅开始服务

-> pending_confirm
  师傅完成服务，等待用户确认

-> completed
  用户确认完成
```

这条链路对应你现在关心的业务：

```txt
预约下单
-> 微信支付
-> 后台派单
-> 师傅接单
-> 上门服务
```

完整展开：

```txt
用户预约下单       -> pending_payment
微信支付成功       -> pending_dispatch
后台人工派单       -> dispatched
师傅接单           -> accepted
师傅出发上门       -> on_the_way
师傅开始服务       -> in_service
师傅提交完成       -> pending_confirm
用户确认完成       -> completed
```

## 6. 每一步由谁推动

### 6.1 预约下单

触发者：用户端。

接口建议：

```txt
POST /api/orders
```

用户提交：

```txt
serviceId
addressId
appointmentDate
appointmentTimeSlot
remark
```

后端必须做：

```txt
校验用户已登录
校验服务存在且上架
校验地址属于当前用户
后端计算金额
保存 serviceSnapshot
保存 addressSnapshot
创建 orders，status=pending_payment
写 order_status_logs: null -> pending_payment
```

注意：

```txt
前端不能提交最终金额
订单必须保存服务快照和地址快照
后续用户修改地址或后台修改服务价格，不能影响历史订单
```

### 6.2 微信支付

触发者：用户端发起支付，系统回调确认支付。

用户端发起：

```txt
POST /api/orders/:id/pay
```

后端发起支付时做：

```txt
校验订单属于当前用户
校验订单状态是 pending_payment
创建 payments 记录，status=pending
调用微信预支付接口
返回微信支付参数
```

微信回调：

```txt
POST /api/payments/wechat/notify
```

后端回调时做：

```txt
验签
校验支付金额等于订单 payableAmount
校验支付单状态
幂等处理重复回调
更新 payment.status=success
更新 orders.paidAt
更新 orders.paidAmount
订单 pending_payment -> pending_dispatch
写 order_status_logs
写 payment_notify_logs
```

注意：

```txt
用户端 wx.requestPayment success 只能作为页面提示
订单状态必须以服务端支付回调为准
支付回调可能重复到达，必须幂等
```

### 6.3 后台派单

触发者：后台管理员。

后台查询待派单：

```txt
GET /api/admin/orders?status=pending_dispatch
```

后台派单：

```txt
POST /api/admin/orders/:id/assign
```

后端必须做：

```txt
校验管理员权限
校验订单状态是 pending_dispatch
校验师傅存在、启用、可接单
创建 order_assignments
更新 orders.staffId
订单 pending_dispatch -> dispatched
写 order_status_logs
写 audit_logs
通知师傅
```

注意：

```txt
只有已支付待派单订单可以派单
不能给禁用或不可接单师傅派单
派单不是 completed，只是让师傅端出现待接单任务
```

### 6.4 师傅接单或拒单

触发者：师傅端。

师傅查询任务：

```txt
GET /api/staff/orders?status=dispatched
```

师傅接单：

```txt
POST /api/staff/orders/:id/accept
```

后端必须做：

```txt
校验师傅已登录
校验订单分配给当前师傅
校验订单状态是 dispatched
更新 order_assignments.assignStatus=accepted
订单 dispatched -> accepted
写 order_status_logs
通知用户
```

师傅拒单：

```txt
POST /api/staff/orders/:id/reject
```

推荐状态处理：

```txt
dispatched -> pending_dispatch
```

同时：

```txt
当前 order_assignment 标记 rejected
写 rejectReason
清空或保留 orders.staffId 需要统一规则
通知后台重新派单
```

建议：

```txt
拒单后清空 orders.staffId
保留历史 order_assignment
订单回到 pending_dispatch
```

### 6.5 上门服务

触发者：师傅端。

师傅出发：

```txt
POST /api/staff/orders/:id/on-the-way
```

状态：

```txt
accepted -> on_the_way
```

师傅开始服务：

```txt
POST /api/staff/orders/:id/start-service
```

状态：

```txt
on_the_way -> in_service
```

上传照片：

```txt
POST /api/staff/orders/:id/photos
```

注意：

```txt
上传照片通常不改变订单状态
它只写 service_photos
```

完成服务：

```txt
POST /api/staff/orders/:id/complete
```

状态：

```txt
in_service -> pending_confirm
```

注意：

```txt
师傅完成服务后不要直接 completed
必须等待用户确认，进入 pending_confirm
```

### 6.6 用户确认完成

触发者：用户端。

接口：

```txt
POST /api/orders/:id/confirm
```

后端必须做：

```txt
校验订单属于当前用户
校验订单状态是 pending_confirm
订单 pending_confirm -> completed
写 completedAt
写 order_status_logs
生成师傅收入记录，或预留后续处理
通知师傅
```

注意：

```txt
completed 之后才能进入评价
售后也可以在 completed 后发起
```

## 7. 三端在不同状态下能做什么

| 状态 | 用户端 | 后台端 | 师傅端 |
|---|---|---|---|
| `pending_payment` | 去支付、取消订单 | 可查看 | 不可见 |
| `pending_dispatch` | 查看详情、等待派单、可申请/取消 | 派单 | 不可见 |
| `dispatched` | 查看师傅信息、等待接单 | 改派/取消派单预留 | 接单、拒单 |
| `accepted` | 查看师傅信息、联系师傅 | 查看进度 | 出发上门 |
| `on_the_way` | 查看进度、联系师傅 | 查看进度 | 到达/开始服务 |
| `in_service` | 查看服务中状态 | 查看进度 | 上传照片、完成服务 |
| `pending_confirm` | 确认完成、申请售后预留 | 查看履约记录 | 查看详情 |
| `completed` | 评价、售后 | 查看、结算 | 查看收入/评价 |
| `cancelled` | 查看取消原因、再次预约 | 查看 | 通常不可操作 |
| `after_sales` | 查看售后进度 | 处理售后 | 配合处理 |
| `refund_pending` | 查看退款进度 | 处理退款 | 不可操作 |
| `refunded` | 查看退款结果 | 查看 | 不可操作 |

前端按钮必须由状态决定，不要在页面里随意拼逻辑。

## 8. 后端状态机实现方式

不要提供一个通用接口：

```txt
PATCH /orders/:id/status
```

这种接口很危险，因为它会让前端或后台绕过业务规则。

应该提供动作接口：

```txt
POST /orders
POST /orders/:id/pay
POST /orders/:id/cancel
POST /orders/:id/confirm

POST /admin/orders/:id/assign
POST /admin/orders/:id/reassign

POST /staff/orders/:id/accept
POST /staff/orders/:id/reject
POST /staff/orders/:id/on-the-way
POST /staff/orders/:id/start-service
POST /staff/orders/:id/photos
POST /staff/orders/:id/complete

POST /payments/wechat/notify
```

每个动作接口内部按统一模板处理：

```txt
1. 鉴权
2. 角色校验
3. 订单归属校验
4. 当前状态校验
5. 业务数据校验
6. 数据库事务
7. 更新 orders 当前状态
8. 写 order_status_logs
9. 写相关业务表
10. 发送通知或预留通知
11. 返回最新订单详情
```

## 9. 状态流转校验表

后端应维护一张允许流转表。

建议规则：

```txt
create_order:
  null -> pending_payment

pay_success:
  pending_payment -> pending_dispatch

assign:
  pending_dispatch -> dispatched

staff_accept:
  dispatched -> accepted

staff_reject:
  dispatched -> pending_dispatch

staff_on_the_way:
  accepted -> on_the_way

staff_start_service:
  on_the_way -> in_service

staff_complete:
  in_service -> pending_confirm

user_confirm:
  pending_confirm -> completed

user_cancel_unpaid:
  pending_payment -> cancelled

admin_cancel_before_dispatch:
  pending_dispatch -> cancelled
```

后续再扩展：

```txt
refund_request:
  pending_dispatch / dispatched / accepted -> refund_pending

refund_success:
  refund_pending -> refunded

after_sales_open:
  completed / pending_confirm -> after_sales

after_sales_done:
  after_sales -> completed 或 after_sales_done
```

注意：售后完成后是否回到 `completed`，还是使用独立 `after_sales_done`，需要产品层确认。MVP 可以先只做 `after_sales` 和后台处理记录。

## 10. 取消、拒单、退款的区别

这三个概念不要混在一起。

### 10.1 取消订单

取消是订单业务状态变化。

适合场景：

```txt
用户未支付前取消
已支付但尚未派单时取消，是否直接退款由规则决定
后台因异常取消
```

### 10.2 师傅拒单

拒单不是取消订单。

它只是当前师傅不接这个任务：

```txt
order_assignment -> rejected
orders.status -> pending_dispatch
等待后台重新派单
```

### 10.3 退款

退款是支付资金状态变化。

适合场景：

```txt
订单已支付后取消
售后协商退款
服务无法履约
```

退款需要：

```txt
refunds 表
微信退款接口
退款回调
订单状态和支付状态同步
```

MVP 初期可以先不做完整自动退款，但状态设计必须给它留位置。

## 11. 前端页面如何配合状态机

### 11.1 用户端订单列表

用户端展示 `orders` 中属于当前用户的订单。

常见 tab：

```txt
全部
待支付
待派单
服务中
待确认
已完成
售后
```

其中“服务中”可以聚合：

```txt
dispatched
accepted
on_the_way
in_service
```

### 11.2 用户端订单详情

订单详情应展示：

```txt
当前状态
下一步提示
服务快照
地址快照
预约时间
师傅信息
支付信息
状态日志
服务照片
底部操作按钮
```

底部按钮按状态展示：

```txt
pending_payment: 去支付、取消订单
pending_dispatch: 查看详情、取消/联系客服
dispatched: 查看师傅
accepted: 联系师傅
on_the_way: 联系师傅、查看进度
in_service: 查看进度
pending_confirm: 确认完成、申请售后
completed: 去评价、申请售后
cancelled: 再次预约
```

### 11.3 师傅端任务列表

师傅端不展示所有订单，只展示：

```txt
orders.staffId = 当前师傅 id
或 order_assignments.staffId = 当前师傅 id
```

建议 tab：

```txt
待接单: dispatched
进行中: accepted / on_the_way / in_service
待用户确认: pending_confirm
已完成: completed
```

### 11.4 师傅端任务详情

任务详情应突出：

```txt
当前任务状态
下一步动作
预约时间
服务地址
用户联系方式
服务内容
用户备注
导航入口
照片上传
履约记录
```

师傅端按钮按状态展示：

```txt
dispatched: 接单、拒单
accepted: 出发上门
on_the_way: 开始服务
in_service: 上传照片、完成服务
pending_confirm: 查看详情
completed: 查看评价/收入
```

## 12. 必须注意的实现点

### 12.1 状态只能后端推进

前端不要传：

```json
{ "status": "completed" }
```

前端只能触发动作：

```txt
confirm
accept
reject
complete
```

状态由后端计算。

### 12.2 所有状态变化必须事务化

例如师傅接单必须在同一个事务中完成：

```txt
更新 order_assignments
更新 orders.status
写 order_status_logs
```

否则中间失败会造成订单状态和派单记录不一致。

### 12.3 每个动作都要校验当前状态

例如：

```txt
只有 dispatched 可以 accept
只有 accepted 可以 on-the-way
只有 on_the_way 可以 start-service
只有 in_service 可以 complete
只有 pending_confirm 可以 confirm
```

如果用户或师傅重复点击，后端应该返回明确业务错误。

### 12.4 订单归属必须严格校验

用户端：

```txt
只能查看和操作自己的订单
```

师傅端：

```txt
只能查看和操作派给自己的订单
```

后台端：

```txt
必须有管理员权限和对应操作权限
```

不要只靠前端隐藏按钮。

### 12.5 支付回调必须幂等

微信可能重复通知。

后端要能处理：

```txt
第一次回调：更新支付和订单
第二次回调：发现已处理，直接返回成功
```

不能重复写入收入、重复推进订单状态、重复发通知。

### 12.6 金额必须以后端为准

下单时：

```txt
前端不传最终金额
后端读取 services.basePrice
后端计算优惠和应付金额
```

支付回调时：

```txt
微信支付金额必须等于 orders.payableAmount
```

### 12.7 快照必须保存

订单创建时保存：

```txt
serviceSnapshot
addressSnapshot
```

原因：

```txt
服务名称和价格后续会改
用户地址后续会改或删除
历史订单必须保持当时下单内容
```

### 12.8 状态命名必须统一

项目里最容易出错的是状态名不一致：

```txt
assigned / dispatched
after_sale / after_sales
pending_confirm / pending_complete
```

建议尽早建立：

```txt
server/src/orders/constants/order-status.ts
miniapp/src/api/types/orders.ts
后台前端状态映射
```

三端共用同一套状态名和文案。

### 12.9 不要过早做复杂实时能力

MVP 可以先用：

```txt
页面进入时刷新
操作成功后刷新
订单详情下拉刷新
关键节点消息通知预留
```

暂时不需要一开始做 WebSocket 或实时地图。

## 13. MVP 推荐先实现的最小闭环

建议先做这条链路：

```txt
1. 用户创建订单
2. mock 支付成功，订单进入 pending_dispatch
3. 后台或开发接口派单给师傅，订单进入 dispatched
4. 师傅接单，订单进入 accepted
5. 师傅出发，订单进入 on_the_way
6. 师傅开始服务，订单进入 in_service
7. 师傅上传照片
8. 师傅完成服务，订单进入 pending_confirm
9. 用户确认完成，订单进入 completed
```

这条链路跑通后，再替换：

```txt
mock 支付 -> 微信支付
开发派单 -> admin-web 后台派单
本地照片 -> 文件上传/对象存储
基础完成 -> 评价和售后
```

## 14. 建议接口清单

### 14.1 用户端接口

```txt
GET    /api/orders
GET    /api/orders/:id
POST   /api/orders
POST   /api/orders/:id/pay
POST   /api/orders/:id/cancel
POST   /api/orders/:id/confirm
POST   /api/orders/:id/reviews
POST   /api/orders/:id/tickets
```

### 14.2 后台端接口

```txt
GET    /api/admin/orders
GET    /api/admin/orders/:id
GET    /api/admin/staff/available
POST   /api/admin/orders/:id/assign
POST   /api/admin/orders/:id/reassign
POST   /api/admin/orders/:id/cancel
```

### 14.3 师傅端接口

```txt
GET    /api/staff/orders
GET    /api/staff/orders/:id
POST   /api/staff/orders/:id/accept
POST   /api/staff/orders/:id/reject
POST   /api/staff/orders/:id/on-the-way
POST   /api/staff/orders/:id/start-service
POST   /api/staff/orders/:id/photos
POST   /api/staff/orders/:id/complete
```

### 14.4 支付接口

```txt
POST   /api/orders/:id/pay
POST   /api/payments/wechat/notify
POST   /api/payments/mock-success
```

`mock-success` 只允许开发环境使用。

## 15. 后端模块建议

可以按下面模块拆分：

```txt
orders
  用户端订单查询、创建、取消、确认
  订单状态机核心服务
  订单 presenter

payments
  支付单创建
  微信支付回调
  mock 支付

admin-orders
  后台订单列表
  后台派单
  后台改派

staff-orders
  师傅任务列表
  师傅接单/拒单
  师傅履约动作

files
  服务照片上传

notifications
  订单节点通知
```

如果前期想简单，也可以先把 `admin-orders` 和 `staff-orders` 放在 `orders` 模块下，等复杂后再拆。

## 16. 一句话总结

订单系统的核心不是页面，而是状态机。用户端、后台端、师傅端都只是触发动作；后端根据状态机规则推进 `orders.status`，同时写入 `order_status_logs` 和相关业务表。只要这个状态机清晰，预约、支付、派单、接单、上门、完成、确认、评价、售后都能自然接上。
