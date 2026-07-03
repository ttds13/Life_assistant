# Order 状态机与 Admin 接入口兼容检查

更新时间：2026-05-29

## 1. 文档目标

本文用于比对当前已经实现的订单状态机和后续需要接入的 admin 订单管理接口。

核心约束：

```txt
不修改已经完成的订单状态机
不修改 docs/order/order-review.md 已审核结论
不把 admin 做成另一套订单状态系统
不允许 admin 直接覆盖 orders.status
admin 只能作为一个角色入口兼容进现有 OrderTransitionService
```

本次检查依据：

```txt
docs/order/order-review.md
docs/plan/day10-admin-backend.md
server/src/orders/order-state-machine.ts
server/src/orders/order-transition.service.ts
server/src/orders/orders.controller.ts
server/src/orders/orders.service.ts
server/src/orders/orders.repository.ts
server/src/orders/order-presenter.ts
server/src/payments/payments.service.ts
admin/src/views/life/orders/index.vue
admin/src/views/life/orders/detail.vue
admin/src/api/life/index.ts
admin/src/api/life/types.ts
```

## 2. 当前订单状态机已实现内容

### 2.1 已实现状态

当前后端订单状态以 `server/src/orders/constants/order-status.ts` 为准：

```txt
pending_payment
pending_dispatch
dispatched
accepted
on_the_way
in_service
pending_confirm
completed
cancelled
refund_pending
refunded
after_sales
```

检查结论：

```txt
已实现状态名使用 dispatched
不能在 admin 中使用 assigned 作为真实后端状态
refund_pending/refunded/after_sales 当前是预留状态，不代表退款状态流转已实现
```

### 2.2 已实现动作与流转

当前后端订单动作以 `server/src/orders/constants/order-action.ts` 和 `order-state-machine.ts` 为准：

| 动作 | 状态变化 | 触发方 | 当前状态 |
|---|---|---|---|
| `create_order` | `null -> pending_payment` | user | 已实现 |
| `pay_success` | `pending_payment -> pending_dispatch` | system/payment | 已实现 |
| `admin_assign` | `pending_dispatch -> dispatched` | admin | 已实现 |
| `staff_accept` | `dispatched -> accepted` | staff | 已实现 |
| `staff_reject` | `dispatched -> pending_dispatch` | staff | 已实现 |
| `staff_on_the_way` | `accepted -> on_the_way` | staff | 已实现 |
| `staff_start` | `on_the_way -> in_service` | staff | 已实现 |
| `staff_complete` | `in_service -> pending_confirm` | staff | 已实现 |
| `user_confirm` | `pending_confirm -> completed` | user | 已实现 |
| `user_cancel_unpaid` | `pending_payment -> cancelled` | user | 已实现 |
| `timeout_unpaid` | `pending_payment -> cancelled` | system | Service 方法已实现 |
| `auto_confirm` | `pending_confirm -> completed` | system | Service 方法已实现 |

检查结论：

```txt
admin 当前只允许接入 admin_assign 这一个已实现订单状态动作
admin_cancel、admin_refund、admin_reopen 目前不存在，不能在 Day 10 直接接入
如未来需要新增 admin_cancel/admin_refund，必须先补状态机方案、action 常量、流转规则、测试和审核文档
```

### 2.3 状态推进服务

当前状态推进统一入口：

```txt
OrderTransitionService.transition()
```

创建订单的特殊入口：

```txt
OrderTransitionService.createInitialStatusLog()
```

状态推进服务已经负责：

```txt
根据 action 获取流转规则
校验当前 status
校验可选 version
执行业务归属和权限 check
在事务内执行 sideEffect
更新 orders.status
递增 orders.version
写入 order_status_logs
悲观锁动作有限重试
```

admin 兼容要求：

```txt
admin 接口不得直接调用 prisma.order.update({ data: { status } })
admin 派单必须继续调用 transition(action=admin_assign)
admin 派单的 staffId 写入必须放在 transition 的 orderData 或 sideEffect 内
admin 审计日志 AuditLog 可以新增，但不能替代 OrderStatusLog
```

## 3. 当前已实现订单接口

### 3.1 用户端接口

| 接口 | 当前实现 | 说明 |
|---|---:|---|
| `GET /api/orders/price-preview` | 已实现 | 价格预览 |
| `GET /api/orders` | 已实现 | 当前用户订单列表 |
| `POST /api/orders` | 已实现 | 创建订单，写初始状态日志 |
| `GET /api/orders/:id` | 已实现 | 当前用户订单详情 |
| `POST /api/orders/:id/cancel` | 已实现 | `user_cancel_unpaid` |
| `POST /api/orders/:id/confirm` | 已实现 | `user_confirm` |
| `POST /api/orders/:id/pay` | 文档存在，实际支付创建在 payments 模块 | 需要以后端实际路由为准 |
| `POST /api/payments/mock-success` | 已实现 | `pay_success` |

兼容结论：

```txt
用户端当前以 /api/orders 为准
不要为了命名统一强制改成 /api/user/orders
如后续需要 /api/user/orders，只能作为 alias 或新 Controller 入口，底层继续复用现有 OrdersService
```

### 3.2 师傅端接口

| 接口 | 当前实现 | 状态动作 |
|---|---:|---|
| `GET /api/staff/orders` | 已实现 | 无状态变化 |
| `GET /api/staff/orders/:id` | 已实现 | 无状态变化 |
| `POST /api/staff/orders/:id/accept` | 已实现 | `staff_accept` |
| `POST /api/staff/orders/:id/reject` | 已实现 | `staff_reject` |
| `POST /api/staff/orders/:id/on-the-way` | 已实现 | `staff_on_the_way` |
| `POST /api/staff/orders/:id/start-service` | 已实现 | `staff_start` |
| `POST /api/staff/orders/:id/complete` | 已实现 | `staff_complete` |

兼容结论：

```txt
师傅端已经接入现有状态机
admin 不应复用师傅端接口
admin 只负责派单和后台查看，师傅履约动作仍由 staff 入口触发
```

### 3.3 Admin 订单接口

| 接口 | 当前实现 | 与 Day10 目标差距 | 处理方式 |
|---|---:|---|---|
| `GET /api/admin/orders` | 已实现 | 仅支持 `status/page/pageSize`，缺 `keyword/dateRange`；返回字段偏用户端 | 兼容增强查询和返回，不改状态机 |
| `GET /api/admin/orders/:id` | 已实现 | 返回详情字段偏用户端，缺 admin 页面需要的部分字段 | 增加 admin presenter 或适配层 |
| `POST /api/admin/orders/:id/assign` | 已实现 | 已走 `admin_assign`；还缺统一 AuditLog | 保留状态机调用，只补 admin 审计 |
| `PUT /api/admin/orders/:id/remark` | 未实现 | 只改 `adminRemark`，不应改变订单状态 | 可新增普通写接口，写 AuditLog，不走状态机 |
| `GET /api/admin/staff/options` | 未在 orders 模块实现 | admin 派单弹窗需要真实可派单师傅 | 新增 staff/admin 查询接口，不改订单状态机 |
| `POST /api/admin/orders/:id/cancel` | 未实现 | 状态机没有 admin_cancel | 本阶段不做 |
| `POST /api/admin/orders/:id/refund` | 未实现 | 状态机没有 admin_refund，退款流程未实现 | 本阶段不做 |

## 4. Admin 接入当前状态机的兼容点

### 4.1 鉴权兼容

当前 `OrdersController` 整体使用：

```txt
JwtAuthGuard
```

当前 admin 身份解析：

```txt
parseAdminId(request)
```

现状：

```txt
真实 admin token：已兼容 userType=admin/adminId
开发环境 header：仍兼容 X-Admin-Id
生产环境：拒绝 X-Admin-Id 模拟身份
```

需要兼容：

```txt
admin 订单接口后续应统一使用真实 admin token
可以逐步从 parseAdminId 迁移到 AdminAuthGuard
迁移时不得影响 OrderTransitionService.transition()
普通 user token 访问 /api/admin/orders 必须返回 403
staff token 访问 /api/admin/orders 必须返回 403
```

注意：

```txt
当前 JwtAuthGuard 会把非 admin token 解析为 user
parseAdminId 会在非生产环境允许 X-Admin-Id
如果 admin 前端已经真实登录，应优先去掉 admin 业务接口对 X-Admin-Id 的依赖
```

### 4.2 状态命名兼容

后端真实状态：

```txt
dispatched
```

admin 前端当前存在：

```txt
assigned
```

影响位置：

```txt
admin/src/views/life/orders/index.vue
admin/src/views/life/orders/detail.vue
```

必须处理：

```txt
admin 前端状态筛选的“已派单” value 必须改为 dispatched
admin 前端 statusMeta 必须支持 dispatched
不能让后端兼容返回 assigned
不能在数据库中写 assigned
```

正确方向：

```txt
后端状态机保持 dispatched
admin 页面把 dispatched 展示为“已派单”
如短期需要兼容旧 mock 数据，可前端同时展示 assigned/dispatched，但请求真实接口必须传 dispatched
```

### 4.3 返回结构兼容

当前后端分页返回：

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0
}
```

admin 前端当前期望：

```txt
data.list
data.total
query.pageNum
query.pageSize
```

需要兼容：

```txt
前端 API 层把 items -> list
前端 API 层把 pageNum -> page
不要在 Vue 页面里直接拼接后端原始结构
```

### 4.4 查询参数兼容

当前后端 `QueryOrdersDto` 支持：

```txt
status
page
pageSize
```

admin 页面当前传：

```txt
keywords
status
pageNum
pageSize
```

Day10 需要补：

```txt
keyword 或 keywords
dateRange / startedAt / endedAt
按订单号、手机号、服务名、用户名搜索
```

推荐兼容方式：

```txt
后端 AdminOrdersQueryDto 支持 keyword/page/pageSize/status/dateStart/dateEnd
admin 前端 API 层把 keywords 映射为 keyword
admin 前端 API 层把 pageNum 映射为 page
保留现有 QueryOrdersDto 给 user/staff 使用，避免影响已完成端
```

### 4.5 详情字段兼容

当前 `presentOrderDetail()` 主要返回用户端通用详情：

```txt
id
orderNo
status
serviceName
serviceImage
appointmentTime
addressText
totalAmount
payableAmount
remark
staffName
staffPhone
version
service
address
paymentMethod
statusLogs
amountItems
servicePhotos
```

admin 页面当前需要：

```txt
userName
userPhone
paidAmount
source
adminRemark
serviceSpec
statusLogs.title/time/operator/description
photos
```

需要兼容：

```txt
新增 presentAdminOrderListItem()
新增 presentAdminOrderDetail()
不要修改 presentUserOrder() 的现有语义，避免影响用户端/师傅端
admin 详情可以把 servicePhotos 映射为 photos
admin statusLogs 应返回 action/operatorType/operatorId/fromStatus/toStatus/remark/detail
```

### 4.6 派单兼容

当前 admin 派单已经实现：

```txt
POST /api/admin/orders/:id/assign
action = admin_assign
pending_dispatch -> dispatched
写 orders.staffId
写 order_assignments
写 order_status_logs
```

仍需补齐：

```txt
使用真实 admin token，不依赖 X-Admin-Id
写 AuditLog，记录管理员派单行为
返回 admin detail 或 admin list item，字段满足 admin 页面刷新
派单前校验师傅可用、未删除，后续可扩展城市/技能/时间可用性校验
```

不能修改：

```txt
不能把 admin_assign 改名为 assign
不能把 dispatched 改成 assigned
不能把派单状态跳到 accepted
不能绕过 OrderTransitionService 直接写 orders.status
```

## 5. 已实现 vs 需要兼容清单

### 5.1 已经实现，可以直接复用

```txt
订单状态常量
订单动作常量
订单状态机流转表
OrderTransitionService.transition()
OrderTransitionService.createInitialStatusLog()
订单状态日志 order_status_logs
用户创建订单
用户未支付取消
用户确认完成
mock 支付成功推进订单
admin 人工派单推进订单
师傅接单/拒单/出发/开始/完成
状态流转的悲观锁和乐观锁
基础 admin token 对 OrdersController 的兼容
```

### 5.2 已经实现，但 admin 需要适配

```txt
GET /api/admin/orders：需要扩展查询字段和 admin 返回字段
GET /api/admin/orders/:id：需要扩展 admin 详情字段
POST /api/admin/orders/:id/assign：需要补 AuditLog 和真实 admin guard 收口
分页返回：后端 items，admin 前端目前用 list
状态展示：后端 dispatched，admin 前端目前部分使用 assigned
statusLogs：后端当前 label/time/active，admin 需要更完整的操作人和描述
servicePhotos：后端当前字段名，admin 页面当前读取 photos
```

### 5.3 缺失，但可以新增且不影响状态机

```txt
GET /api/admin/staff/options
PUT /api/admin/orders/:id/remark
AdminAuditService
AdminOrdersQueryDto
AdminOrderPresenter
admin 订单合同测试
普通 user/staff token 禁止访问 admin order 的测试
```

### 5.4 缺失，暂不允许直接新增

```txt
POST /api/admin/orders/:id/cancel
POST /api/admin/orders/:id/refund
POST /api/admin/orders/:id/reopen
PATCH /api/admin/orders/:id/status
任意 status 覆盖接口
任何把订单状态写成 assigned 的兼容逻辑
```

原因：

```txt
这些动作会改变订单状态，但当前状态机没有对应 action
直接新增会破坏 order-review 已审核的状态机闭环
必须另开状态机设计和审核后再实现
```

## 6. Admin 兼容实施建议

### Phase A：只做读取兼容

目标：

```txt
admin 能真实读取订单列表和详情
不改变任何订单状态
```

任务：

```txt
[ ] 新增 AdminOrdersQueryDto，支持 page/pageSize/status/keyword/dateStart/dateEnd
[ ] OrdersRepository.findAdminOrders 增加 keyword/dateRange 查询
[ ] 新增 presentAdminOrderListItem()
[ ] 新增 presentAdminOrderDetail()
[ ] admin 前端 API 从 /api/v1/life/orders 切到 /api/admin/orders
[ ] admin 前端 API 层适配 items -> list，pageNum -> page
[ ] admin 前端状态值改为 dispatched
```

验收：

```txt
[ ] admin 订单列表显示真实 orders
[ ] pending_dispatch/dispatched 等状态展示正确
[ ] keyword 查询不影响 user/staff 订单接口
[ ] 用户端和师傅端订单接口返回不变
```

### Phase B：派单兼容

目标：

```txt
admin 派单进入现有 admin_assign 状态机
```

任务：

```txt
[ ] POST /api/admin/orders/:id/assign 保持调用 OrderTransitionService.transition(action=admin_assign)
[ ] 新增 GET /api/admin/staff/options
[ ] 新增 AdminAuditService
[ ] 派单成功后额外写 AuditLog
[ ] 逐步去掉 admin 业务接口对 X-Admin-Id 的依赖
```

验收：

```txt
[ ] pending_dispatch -> dispatched
[ ] orders.staffId 更新
[ ] order_assignments 写入
[ ] order_status_logs 写入 action=admin_assign
[ ] audit_logs 写入 admin 派单记录
[ ] 重复派单返回 409，不覆盖已有状态
```

### Phase C：备注和审计

目标：

```txt
admin 能维护后台备注，但不改变订单状态
```

任务：

```txt
[ ] 新增 PUT /api/admin/orders/:id/remark
[ ] 只更新 orders.adminRemark
[ ] 写 AuditLog
[ ] 不写 OrderStatusLog
[ ] 不调用 OrderTransitionService
```

验收：

```txt
[ ] 修改备注不改变 orders.status
[ ] 修改备注不递增 orders.version，除非后续明确把备注纳入版本控制
[ ] 修改备注写 AuditLog
```

## 7. 合同测试建议

建议新增或扩展：

```txt
server/scripts/admin-order-contract-test.ts
```

覆盖：

```txt
admin 登录
admin token 访问 /api/admin/orders 成功
user token 访问 /api/admin/orders 返回 403
staff token 访问 /api/admin/orders 返回 403
订单列表支持 status=pending_dispatch
订单列表支持 status=dispatched
订单详情返回 statusLogs
派单 pending_dispatch -> dispatched
派单写 order_status_logs.action=admin_assign
派单写 order_assignments
派单写 audit_logs
重复派单返回 409
传入 status=assigned 查询不作为真实状态使用
```

## 8. 最终结论

当前订单状态机已经完成主链路实现，admin 订单口不需要也不允许重做状态机。

后续 admin 接入的正确边界是：

```txt
读接口：增强 admin 查询和返回结构
派单接口：复用 admin_assign 状态机动作
备注接口：只写 adminRemark 和 AuditLog，不改变订单状态
审计接口：补 AuditLog，不替代 OrderStatusLog
前端适配：把 assigned 改为 dispatched，把 list/pageNum 映射到后端 items/page
```

明确禁止：

```txt
修改现有 order-state-machine.ts
修改现有 ORDER_STATUS.DISPATCHED 的值
新增 PATCH /api/admin/orders/:id/status
让 admin 直接提交目标 status
在没有状态机审核的情况下新增 admin_cancel/admin_refund
为了适配 admin 前端把后端真实状态改成 assigned
```
