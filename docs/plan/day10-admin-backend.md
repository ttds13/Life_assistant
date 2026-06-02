# Day 10 Admin Backend API 补全计划

## 1. 文档目标

当前后台管理系统基础已经搭好：

```txt
admin 登录页已去掉注册入口
server 已有管理员登录接口
管理员账号可由脚本创建
管理员权限第一阶段代码固定
admin 前端可以进入后台框架
```

Day 10 的目标是补全后端 API，使同一套 `server` 能同时服务：

```txt
小程序用户端
师傅端
admin 后台管理端
```

后续四端改造口径：

```txt
用户端：用户视角的下单、支付、取消、确认、评价
师傅端：师傅视角的接单、出发、开始服务、完成服务、上传履约凭证
admin 端：管理员视角的派单、审核、异常处理、退款、全局查询
server 端：订单状态机、鉴权、审计、真实数据读写的统一业务核心
```

三端请求同一批业务数据，但交互方式不同：

```txt
用户端：只操作自己的数据，以创建订单、支付、地址、评价为主
师傅端：只操作分配给自己的订单，以接单、履约、上传照片为主
管理员端：管理全局数据，以列表、筛选、详情、审核、上下架、派单、禁用、财务处理为主
```

## 2. Day 10 总原则

```txt
不把 admin 端做成独立后端
不让 admin 复用用户端接口绕权限
不让用户端/师傅端访问 admin 接口
不在前端拼装复杂业务数据
不绕过审计日志做关键写操作
```

订单领域的核心原则：

```txt
订单不是 user/staff/admin 任意一端的附属资源，而是一套独立的状态机系统
user、staff、admin 只是不同角色入口，不能各自维护一套订单流转逻辑
URL 负责表达谁在操作，action 负责表达要做什么，状态机负责判断当前状态能不能转、转到哪里
前端、师傅端、admin 端都不能直接提交目标 status 覆盖订单状态，只能提交业务动作和必要 payload
所有订单状态变化继续进入已实现的 OrderTransitionService.transition()
创建订单初始状态继续使用已实现的 createInitialStatusLog() 特例
Day 10 不重写订单状态机，不修改 docs/order/order-review.md 已审核结论
所有订单状态变化必须写 OrderStatusLog，管理员关键操作额外写 AuditLog
```

推荐 API 分层：

```txt
/api/*                    公共接口或历史兼容接口
/api/user/*               用户端私有接口
/api/staff/*              师傅端接口
/api/admin/*              管理员后台接口
```

推荐代码分层：

```txt
Controller：负责身份边界、路径、参数 DTO
Service：负责业务规则、状态流转、审计
Repository：负责 Prisma 查询和事务
Presenter：负责不同端的数据返回形状
DTO：负责入参校验和分页、筛选、排序规范
```

## 3. 当前后端现状

已具备：

```txt
Auth：用户 mock-login / wechat-login / me / profile
AdminAuth：管理员 login / me / logout
Services：服务分类查询、服务列表查询、服务详情
Addresses：当前用户地址 CRUD
Orders：用户端订单、admin 订单查询/派单、师傅端订单流转
Payments：模拟支付创建、模拟支付成功
Prisma schema：已覆盖用户、师傅、订单、支付、退款、评价、售后、营销、通知、文件、收入、提现、审计日志
```

主要缺口：

```txt
admin 用户管理接口缺失
admin 师傅管理接口缺失
admin 服务管理写接口缺失
admin 财务管理接口缺失
admin 评价与售后接口缺失
admin 营销管理接口缺失
admin 审核中心和审计日志接口缺失
admin dashboard 真实统计接口缺失
文件上传接口缺失
统一 admin 审计写入机制缺失
```

## 4. API 分层标准

### 4.1 公共接口

用于未登录或所有端可读的数据。

```txt
GET /api/health
GET /api/service-categories
GET /api/services
GET /api/services/:id
```

要求：

```txt
只返回上架、未删除、可展示的数据
不能返回后台管理字段
不能返回成本、内部备注、审核信息
```

### 4.2 用户端接口

用户端接口只允许用户访问自己的数据。

```txt
POST /api/auth/mock-login
POST /api/auth/wechat-login
GET  /api/auth/me
PUT  /api/auth/profile

GET    /api/user/addresses
POST   /api/user/addresses
PUT    /api/user/addresses/:id
DELETE /api/user/addresses/:id

GET  /api/orders
POST /api/orders
GET  /api/orders/:id
POST /api/orders/:id/cancel
POST /api/orders/:id/confirm
POST /api/orders/:id/pay

POST /api/reviews
GET  /api/user/reviews
GET  /api/user/coupons
GET  /api/user/member-cards
```

兼容期处理：

```txt
当前用户端订单接口以 docs/order/order-review.md 已实现的 /api/orders 为准
如后续统一命名为 /api/user/orders，只新增 alias 或新 Controller 入口
新增 /api/user/orders 时不得改动现有 OrderTransitionService 状态机规则
等用户端全部迁移后，再评估是否废弃 /api/orders
```

要求：

```txt
所有 user 资源必须校验 userId
用户不能传 staffId/adminId 控制核心状态
订单状态流转必须走状态机
支付、取消、确认必须做幂等和版本校验
```

### 4.3 师傅端接口

师傅端接口只允许师傅访问自己的任务。

```txt
POST /api/staff/auth/login
GET  /api/staff/auth/me

GET  /api/staff/orders
GET  /api/staff/orders/:id
POST /api/staff/orders/:id/accept
POST /api/staff/orders/:id/reject
POST /api/staff/orders/:id/on-the-way
POST /api/staff/orders/:id/start-service
POST /api/staff/orders/:id/complete

POST /api/staff/orders/:id/checkins
POST /api/staff/orders/:id/photos
GET  /api/staff/income-records
POST /api/staff/withdraw-requests
```

要求：

```txt
staffId 必须来自 token，不允许前端传入覆盖
师傅只能操作分配给自己的订单
履约照片和打卡必须落 ServicePhoto / ServiceCheckin
完成服务必须产生订单状态日志
```

### 4.4 管理员端接口

管理员端接口管理全局数据，必须走 admin token。

```txt
POST   /api/admin/auth/login
GET    /api/admin/auth/me
DELETE /api/admin/auth/logout

GET /api/admin/dashboard
GET /api/admin/audit-logs

GET /api/admin/users
GET /api/admin/users/:id
PUT /api/admin/users/:id/status

GET  /api/admin/staff
GET  /api/admin/staff/options
GET  /api/admin/staff/:id
POST /api/admin/staff
PUT  /api/admin/staff/:id
PUT  /api/admin/staff/:id/status
POST /api/admin/staff/:id/audit

GET  /api/admin/service-categories
POST /api/admin/service-categories
PUT  /api/admin/service-categories/:id
PUT  /api/admin/service-categories/:id/status

GET  /api/admin/services
GET  /api/admin/services/:id
POST /api/admin/services
PUT  /api/admin/services/:id
PUT  /api/admin/services/:id/status

GET  /api/admin/orders
GET  /api/admin/orders/:id
POST /api/admin/orders/:id/assign
PUT  /api/admin/orders/:id/remark

GET  /api/admin/payments
GET  /api/admin/refunds
POST /api/admin/refunds/:id/review
GET  /api/admin/staff-income-records
GET  /api/admin/withdraw-requests
POST /api/admin/withdraw-requests/:id/review

GET  /api/admin/reviews
PUT  /api/admin/reviews/:id/status
GET  /api/admin/tickets
GET  /api/admin/tickets/:id
POST /api/admin/tickets/:id/messages
POST /api/admin/tickets/:id/resolve

GET  /api/admin/coupons
POST /api/admin/coupons
PUT  /api/admin/coupons/:id
PUT  /api/admin/coupons/:id/status
GET  /api/admin/member-cards
POST /api/admin/member-cards
PUT  /api/admin/member-cards/:id
PUT  /api/admin/member-cards/:id/status
```

要求：

```txt
除 /admin/auth/login 外全部校验 AdminAuthGuard
关键写操作必须写 AuditLog
列表接口统一支持 page/pageSize/keyword/status
后台接口返回后台所需完整字段，避免前端多次补查
当前订单状态机只实现 admin_assign；admin cancel/refund 不在 Day 10 直接新增
如后续需要 admin_cancel/admin_refund，必须先进入订单状态机方案审核，再补 action/status/test
```

## 5. 统一请求与返回规范

### 5.1 分页规范

请求：

```txt
page: number
pageSize: number
keyword?: string
status?: string | number
sortBy?: string
order?: asc | desc
```

返回：

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0
}
```

前端适配：

```txt
admin 可以在 API 层把 items -> list
小程序可以直接使用 items
页面层不直接处理原始 Prisma 字段
```

### 5.2 身份来源

```txt
用户端 userId 来自 JWT
师傅端 staffId 来自 JWT
管理员端 adminId 来自 JWT
```

禁止：

```txt
前端传 userId/staffId/adminId 控制权限范围
后台接口用 query.userId 代替 token 身份
```

### 5.3 状态流转

订单状态继续使用状态机：

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

状态机调用模型：

```ts
this.transitions.transition({
  orderId,
  action: ORDER_ACTION.ADMIN_ASSIGN,
  operatorType: 'user' | 'staff' | 'admin' | 'system',
  operatorId,
  requestId,
  version,
  remark,
  detail,
  orderData,
  check,
  sideEffect,
})
```

角色动作边界：

```txt
user：create_order / user_cancel_unpaid / user_confirm
staff：staff_accept / staff_reject / staff_on_the_way / staff_start / staff_complete
admin：admin_assign
system：pay_success / timeout_unpaid / auto_confirm
```

与 order-review 对齐要求：

```txt
状态名使用 dispatched，不使用 assigned
动作名使用 admin_assign、staff_start、pay_success 等已实现常量，不使用概念化的 assign/start_service/pay
除 create_order 使用 createInitialStatusLog() 外，状态变化都走 OrderTransitionService.transition()
refund_pending/refunded/after_sales 目前是预留状态，Day 10 不新增未审核的退款状态流转
```

禁止：

```txt
Controller 直接 update orders.status
前端传入 status=xxx 要求后端直接覆盖
admin 绕过状态机强制把订单改成任意状态
user/staff/admin 三套 Controller 各写一套状态判断
```

写操作要求：

```txt
订单状态变化写 OrderStatusLog
管理员关键操作写 AuditLog
支付回调写 PaymentNotifyLog
派单写 OrderAssignment
履约打卡写 ServiceCheckin
服务照片写 ServicePhoto
```

## 6. Day 10 实施阶段

### Phase 0A：Order 兼容边界确认

来源：

```txt
docs/order/order-check.md
```

目标：

```txt
先确认当前订单状态机哪些已经实现、哪些只能适配、哪些暂时禁止新增。
Day 10 的 admin 订单接入只做兼容层，不改已完成的 order 状态机。
```

已经实现，可以直接复用：

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

已经实现，但 admin 需要适配：

```txt
GET /api/admin/orders：需要扩展查询字段和 admin 返回字段
GET /api/admin/orders/:id：需要扩展 admin 详情字段
POST /api/admin/orders/:id/assign：需要补 AuditLog 和真实 admin guard 收口
分页返回：后端 items，admin 前端目前用 list
状态展示：后端 dispatched，admin 前端目前部分使用 assigned
statusLogs：后端当前 label/time/active，admin 需要更完整的操作人和描述
servicePhotos：后端当前字段名，admin 页面当前读取 photos
```

缺失，但可以新增且不影响状态机：

```txt
GET /api/admin/staff/options
PUT /api/admin/orders/:id/remark
AdminAuditService
AdminOrdersQueryDto
AdminOrderPresenter
admin 订单合同测试
普通 user/staff token 禁止访问 admin order 的测试
```

缺失，暂不允许直接新增：

```txt
POST /api/admin/orders/:id/cancel
POST /api/admin/orders/:id/refund
POST /api/admin/orders/:id/reopen
PATCH /api/admin/orders/:id/status
任意 status 覆盖接口
任何把订单状态写成 assigned 的兼容逻辑
```

禁止原因：

```txt
这些动作会改变订单状态，但当前状态机没有对应 action
直接新增会破坏 order-review 已审核的状态机闭环
必须另开状态机设计和审核后再实现
```

### Phase 0B：Admin Order 读取兼容

目标：

```txt
admin 能真实读取订单列表和详情。
本阶段不改变任何订单状态。
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

### Phase 0C：Admin Order 派单兼容

目标：

```txt
admin 派单进入现有 admin_assign 状态机。
只补 admin 兼容能力，不改 OrderTransitionService 和 order-state-machine。
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

### Phase 0D：Admin Order 备注和审计兼容

目标：

```txt
admin 能维护后台备注，但不改变订单状态。
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

### Phase 0：统一基础设施

目标：

```txt
为 admin API 补齐统一鉴权、分页、审计工具
```

任务：

```txt
[ ] 新增 AdminAuthGuard 在所有 /admin/* 业务 Controller 使用
[ ] 新增 AdminAuditService，封装 AuditLog 写入
[ ] 新增 PaginationDto / PageResult helper
[ ] 新增 keyword/status/dateRange 通用查询 DTO
[ ] 复核 admin 新增订单接口继续调用现有 OrderTransitionService.transition()
[ ] 不新增未经过 order-review 审核的订单 action/status
[ ] 明确 server 返回 code=0/message/data 的格式保持不变
```

验收：

```txt
[ ] 普通用户 token 不能访问 /api/admin/*
[ ] admin token 可以访问已实现后台接口
[ ] 关键写操作能记录 AuditLog
[ ] 订单状态变化都能记录 OrderStatusLog
[ ] 非法状态流转返回明确错误，不修改订单数据
```

### Phase 1：Admin Dashboard 与订单闭环

优先原因：

```txt
订单是当前后端最完整的真实业务链路
admin 页面已经有订单列表、详情、派单 UI
```

任务：

```txt
[ ] GET /api/admin/dashboard
[ ] GET /api/admin/orders 支持 keyword/status/page/pageSize/dateRange
[ ] GET /api/admin/orders/:id 补全 userName/userPhone/paidAmount/statusLogs/photos
[ ] POST /api/admin/orders/:id/assign 使用 admin token，不再依赖 X-Admin-Id
[ ] GET /api/admin/staff/options 返回真实可派单师傅
[ ] POST /api/admin/orders/:id/assign 继续调用 OrderTransitionService.transition(action=admin_assign)
[ ] POST /api/admin/orders/:id/assign 写 OrderAssignment、OrderStatusLog、AuditLog
[ ] 不在本阶段新增 admin cancel/refund 订单状态动作
```

验收：

```txt
[ ] admin 订单列表读取真实 orders
[ ] admin 订单详情读取真实订单详情
[ ] admin 派单真实更新 orders.staffId
[ ] 派单产生 OrderAssignment、OrderStatusLog、AuditLog
[ ] admin、user、staff 三个入口对同一订单状态机规则一致
```

### Phase 2：服务管理后台化

任务：

```txt
[ ] GET /api/admin/service-categories
[ ] POST /api/admin/service-categories
[ ] PUT /api/admin/service-categories/:id
[ ] PUT /api/admin/service-categories/:id/status
[ ] GET /api/admin/services
[ ] GET /api/admin/services/:id
[ ] POST /api/admin/services
[ ] PUT /api/admin/services/:id
[ ] PUT /api/admin/services/:id/status
[ ] ServiceImage / ServicePriceRule 预留接口结构
```

交互差异：

```txt
用户端 /services 只看上架服务
admin /admin/services 能看全部服务，包括停用和草稿
admin 能新增、编辑、上下架
```

验收：

```txt
[ ] admin 上下架服务后，小程序服务列表同步变化
[ ] admin 能编辑服务价格、单位、时长、描述
[ ] 修改记录写 AuditLog
```

### Phase 3：用户与地址管理

任务：

```txt
[ ] GET /api/admin/users
[ ] GET /api/admin/users/:id
[ ] PUT /api/admin/users/:id/status
[ ] GET /api/admin/addresses
```

交互差异：

```txt
用户端只能管理自己的地址
admin 能查看全量用户和地址
admin 能禁用用户
```

验收：

```txt
[ ] 禁用用户后用户端登录/下单被拦截
[ ] 用户详情能看到地址、订单、支付概览
[ ] 禁用/启用写 AuditLog
```

### Phase 4：师傅管理与师傅端身份

任务：

```txt
[ ] POST /api/staff/auth/login
[ ] GET /api/staff/auth/me
[ ] GET /api/admin/staff
[ ] GET /api/admin/staff/options
[ ] GET /api/admin/staff/:id
[ ] POST /api/admin/staff
[ ] PUT /api/admin/staff/:id
[ ] PUT /api/admin/staff/:id/status
[ ] POST /api/admin/staff/:id/audit
```

交互差异：

```txt
师傅端只能看自己的订单和收入
admin 能查看全部师傅、认证信息、技能、评分和订单
```

验收：

```txt
[ ] 师傅登录后 staffId 来自 token
[ ] 禁用师傅后不能登录，不能被派单
[ ] 认证审核写 AuditLog
```

### Phase 5：财务管理

任务：

```txt
[ ] GET /api/admin/payments
[ ] GET /api/admin/refunds
[ ] POST /api/admin/refunds/:id/review
[ ] GET /api/admin/staff-income-records
[ ] GET /api/admin/withdraw-requests
[ ] POST /api/admin/withdraw-requests/:id/review
```

交互差异：

```txt
用户端只看到自己的支付结果
师傅端只看到自己的收入和提现
admin 能看到全平台支付、退款、提现和收入记录
```

验收：

```txt
[ ] 支付流水来自真实 payments
[ ] 退款审核更新 refunds.status
[ ] 提现审核更新 withdraw_requests.status/handledBy/handledAt
[ ] 财务审核写 AuditLog
```

### Phase 6：评价、售后、营销

任务：

```txt
[ ] GET /api/admin/reviews
[ ] PUT /api/admin/reviews/:id/status
[ ] GET /api/admin/tickets
[ ] GET /api/admin/tickets/:id
[ ] POST /api/admin/tickets/:id/messages
[ ] POST /api/admin/tickets/:id/resolve
[ ] GET/POST/PUT /api/admin/coupons
[ ] PUT /api/admin/coupons/:id/status
[ ] GET/POST/PUT /api/admin/member-cards
[ ] PUT /api/admin/member-cards/:id/status
```

验收：

```txt
[ ] admin 能查看并隐藏评价
[ ] admin 能处理售后工单
[ ] admin 能维护优惠券和会员卡
[ ] 用户端只看到可用、已发布、未过期营销数据
```

## 7. Admin 前端接入计划

当前 admin 已有通用 mock 页面。Day 10 接入顺序：

```txt
1. 保留登录走真实 /api/admin/auth/*
2. 订单页面先改真实接口，并通过 action 调用订单状态机
3. Dashboard 改真实统计接口
4. 服务管理从 resource 通用页拆成专用页
5. 用户/师傅/财务/审核逐步从 resource mock 替换为真实 API
6. mock 只保留未完成模块，不影响已真实接入模块
```

四端订单改造顺序：

```txt
1. server 复用 order-review 已审核的 OrderTransitionService.transition()
2. user 端当前继续使用 /api/orders；如后续加 /api/user/orders，仅作为入口别名或迁移层
3. staff 端继续使用 /api/staff/orders，接单、出发、开始、完成保持现有 action
4. admin 端继续使用 /api/admin/orders，Day 10 重点完善派单、详情、筛选、审计
5. 四端联调用同一批真实订单数据验证状态一致性，不重写状态机
```

前端 API 文件建议：

```txt
admin/src/api/admin/dashboard.ts
admin/src/api/admin/orders.ts
admin/src/api/admin/users.ts
admin/src/api/admin/staff.ts
admin/src/api/admin/services.ts
admin/src/api/admin/finance.ts
admin/src/api/admin/audits.ts
admin/src/api/admin/marketing.ts
```

适配原则：

```txt
页面层使用 UI 类型
API 层适配 server 原始返回
不要在 Vue 页面里做大量字段拼接
```

## 8. 后端模块建议

新增或扩展：

```txt
server/src/admin-dashboard
server/src/admin-users
server/src/admin-staff
server/src/admin-services
server/src/admin-finance
server/src/admin-audits
server/src/admin-marketing
server/src/audit-log
server/src/files
```

也可以按业务域复用现有模块：

```txt
orders 中保留 user/staff/admin Controller
orders 中复用已实现的 OrderTransitionService / order-state-machine
services 中新增 AdminServicesController
users 中新增 AdminUsersController
staff 新建 StaffModule
finance 新建 FinanceModule
```

推荐：

```txt
按业务域组织，不按前端页面组织。
例如 ServicesModule 内同时有 ServicesController 和 AdminServicesController。
例如 OrdersModule 内同时有 UserOrdersController、StaffOrdersController、AdminOrdersController，但只允许一个 OrderTransitionService 修改订单状态。
```

## 9. 审计日志策略

必须写 AuditLog 的操作：

```txt
管理员登录成功/失败 可选
订单派单
订单备注修改
用户禁用/启用
师傅新增/编辑/禁用/认证审核
服务新增/编辑/上下架
退款审核
提现审核
评价隐藏/恢复
售后工单处理
优惠券/会员卡新增、编辑、发布、停用
```

AuditLog 建议 detail：

```json
{
  "before": {},
  "after": {},
  "remark": "管理员填写原因",
  "requestSource": "admin"
}
```

## 10. 安全要求

```txt
admin login 不要求 token，但必须账号密码校验
admin login 后续可加限流和登录失败日志
admin token 必须包含 userType=admin/adminId/role
普通 user token 不能访问 admin 接口
staff token 不能访问 admin 接口
admin 接口不能用前端传入的 adminId
生产环境禁止 mock 登录和 dev seed reset
```

## 11. Day 10 验收标准

最低验收：

```txt
[ ] admin token 可以访问 /api/admin/auth/me
[ ] 普通 user token 访问 /api/admin/orders 返回 403
[ ] /api/admin/dashboard 返回真实统计
[ ] /api/admin/orders 支持真实分页和状态筛选
[ ] /api/admin/orders/:id 返回真实详情
[ ] /api/admin/staff/options 返回真实师傅
[ ] admin 派单真实落库并写 AuditLog
[ ] user/staff/admin 订单状态变更都经过 OrderTransitionService
[ ] 直接提交目标 status 的订单写接口被拒绝
[ ] 非法状态流转不落库，并返回统一业务错误
[ ] admin 服务列表读取真实 services
[ ] admin 用户列表读取真实 users
[ ] npm run build 通过
[ ] npm run test:contract 或新增 admin contract test 通过
```

建议新增合同测试：

```txt
server/scripts/admin-contract-test.ts
```

覆盖：

```txt
管理员登录
管理员 me
普通用户禁止访问 admin
订单列表
订单详情
师傅 options
派单
AuditLog 验证
合法状态流转验证
非法状态流转拦截验证
```

## 12. Day 10 不做内容

```txt
不做完整可视化 RBAC 菜单配置
不做复杂财务结算规则
不做客服 IM
不做生产支付网关真实退款
不做多租户
不做 BI 报表系统
```

## 13. 推荐执行顺序

```txt
1. 先按 docs/order/order-check.md 确认 order 兼容边界，不改现有状态机
2. 补 AdminOrdersQueryDto / AdminOrderPresenter，完成 admin order 读取兼容
3. admin 前端订单页切真实 /api/admin/orders，并适配 items/list、page/pageNum、dispatched
4. 补 AdminAuditService 和通用分页 DTO
5. 补 GET /api/admin/staff/options
6. 保持 admin_assign 状态机不变，补派单 AuditLog 和真实 admin token 收口
7. 补 PUT /api/admin/orders/:id/remark，只写 adminRemark 和 AuditLog
8. 补 admin dashboard
9. user/staff 订单动作保持现有状态机实现，只做接口兼容和前端接入
10. 补 admin services 写接口
11. admin 前端服务页切真实接口
12. 补 admin users/staff
13. 补 admin finance/audits
14. 补 admin contract test 和订单状态机合同测试
15. 逐步关闭已接入模块 mock
```
