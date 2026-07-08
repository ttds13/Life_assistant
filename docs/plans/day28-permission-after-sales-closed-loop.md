# Day 28 - 后台接口权限与售后闭环修复计划

## 1. 目标

本计划修复当前项目中两个上线前高优先级缺口：

1. 后台接口只有管理员登录校验，缺少接口级权限拦截。
2. 售后工单只有数据表和后台处理骨架，缺少小程序用户申请、补充材料、查看进度的闭环。

本计划不包含模拟登录和模拟支付相关内容。

## 2. 总体执行顺序

```text
权限元数据与后端拦截
  -> 后台敏感接口标注权限
  -> 前端菜单/按钮权限对齐
  -> 权限用例验收
  -> 售后业务规则确认
  -> 后端 AfterSales/Tickets 用户接口
  -> 小程序售后申请与详情页
  -> 后台工单详情与回复动作增强
  -> 售后闭环联调与回归测试
```

执行原则：
- 后端权限是最终安全边界，前端权限只负责减少误操作入口。
- 售后工单要和订单状态机、订单状态日志、后台审计日志保持一致。
- 同一个订单不能无限重复创建进行中的售后工单，需要做幂等保护。
- 用户只能操作自己的订单和自己的工单，后台只能按权限操作工单。

## 3. 第一部分：后台接口级权限修复

### 3.1 当前问题

当前已有角色和权限定义：

- `server/src/admin-auth/admin-permissions.ts`
- `operator`
- `finance`
- `super_admin`
- `finance:refund:audit`

但后端控制器基本只使用 `AdminAuthGuard` 判断是否是管理员 token，没有按接口校验权限。风险包括：

- 运营角色可能调用退款审核、提现审核接口。
- 财务角色可能调用订单删除、用户删除、服务上下架接口。
- 前端隐藏按钮不能作为安全边界，直接请求接口仍可能成功。

### 3.2 业务规则

建议先落地三类后台角色：

| 角色 | 定位 | 权限边界 |
|---|---|---|
| `super_admin` | 超级管理员 | 拥有 `*`，可访问所有后台接口 |
| `operator` | 运营/客服 | 可看订单、用户、师傅、服务；可派单、处理售后；不可审核退款/提现，不可删除关键财务数据 |
| `finance` | 财务 | 可看支付、退款、提现；可审核退款/提现；不可修改服务、删除订单、修改用户角色 |

后续如果要细分客服、审核员、城市管理员，可以在这套权限元数据上扩展。

### 3.3 后端实现步骤

#### Step 1：补权限装饰器

新增文件：

- `server/src/admin-auth/admin-permission.decorator.ts`

计划内容：

- 定义 `ADMIN_PERMISSION_KEY`。
- 定义 `RequireAdminPermissions(...permissions: string[])`。
- 支持方法级和类级权限标注。

预期用法：

```ts
@RequireAdminPermissions('finance:refund:audit')
@Post('admin/refunds/:id/approve')
approveRefund(...) {}
```

#### Step 2：改造 `AdminAuthGuard`

修改文件：

- `server/src/admin-auth/admin-auth.guard.ts`

具体动作：

1. 注入 `Reflector`。
2. 验证 admin token 后，读取 handler/class 上的权限元数据。
3. 使用 `getAdminPermissions(payload.role)` 计算当前管理员权限。
4. 如果权限包含 `*`，直接放行。
5. 如果接口没有标注权限，只要求登录。
6. 如果接口标注权限，必须满足全部必需权限；不满足返回 403。
7. 把 `roles`、`perms` 写入 `request.user` 或 `request.context.user`，方便日志和后续业务判断。

验收点：

- 未登录仍返回 401。
- 普通非 admin token 仍返回 403。
- admin token 没有对应权限时返回 403。
- `super_admin` 仍能访问所有后台接口。

#### Step 3：扩展后台权限字典

修改文件：

- `server/src/admin-auth/admin-permissions.ts`

建议补充权限：

```text
dashboard:view
user:list
user:detail
user:update
user:delete
user:role:update
service:list
service:create
service:update
service:delete
order:list
order:detail
order:update
order:delete
order:assign
staff:list
staff:create
staff:update
staff:delete
staff:audit
finance:payment:list
finance:refund:list
finance:refund:audit
finance:refund:retry
finance:withdraw:list
finance:withdraw:audit
after-sales:ticket:list
after-sales:ticket:detail
after-sales:ticket:reply
after-sales:ticket:resolve
marketing:coupon:list
marketing:coupon:create
marketing:coupon:update
audit-log:list
```

角色默认分配建议：

- `operator`：订单、用户、师傅、服务、售后相关权限，不含财务审核和危险删除。
- `finance`：支付、退款、提现、财务审核相关权限。
- `super_admin`：`*`。

#### Step 4：给后台控制器标注权限

重点文件：

- `server/src/admin-business/admin-business.controller.ts`
- `server/src/refunds/refunds.controller.ts`
- `server/src/orders/orders.controller.ts`
- `server/src/addresses/admin-addresses.controller.ts`
- `server/src/addresses/admin-owner-addresses.controller.ts`
- `server/src/member-cards/member-cards.controller.ts`
- `server/src/promotion-links/promotion-links.controller.ts`

标注原则：

- 查询类接口使用 `*:list` 或 `*:detail`。
- 新增/修改/删除类接口使用 `*:create`、`*:update`、`*:delete`。
- 退款审核、提现审核、退款重试必须单独标注财务权限。
- 订单删除必须限制为 `order:delete`，默认只给 `super_admin`。
- 审计日志只读接口使用 `audit-log:list`。

关键权限映射：

| 接口 | 权限 |
|---|---|
| `GET /admin/dashboard` | `dashboard:view` |
| `GET /admin/users` | `user:list` |
| `PUT /admin/users/:id/role` | `user:role:update` |
| `DELETE /admin/users/:id` | `user:delete` |
| `GET /admin/orders` | `order:list` |
| `PUT /admin/orders/:id` | `order:update` |
| `DELETE /admin/orders/:id` | `order:delete` |
| `POST /admin/orders/:id/assign` | `order:assign` |
| `GET /admin/refunds` | `finance:refund:list` |
| `POST /admin/refunds/:id/approve` | `finance:refund:audit` |
| `POST /admin/refunds/:id/reject` | `finance:refund:audit` |
| `POST /admin/refunds/:id/retry` | `finance:refund:retry` |
| `POST /admin/withdraw-requests/:id/review` | `finance:withdraw:audit` |
| `POST /admin/tickets/:id/messages` | `after-sales:ticket:reply` |
| `POST /admin/tickets/:id/resolve` | `after-sales:ticket:resolve` |

#### Step 5：前端后台权限对齐

重点文件：

- `admin/src/stores/user.ts`
- `admin/src/stores/permission.ts`
- `admin/src/directives/permission/index.ts`
- `admin/src/views/life/audit/index.vue`
- `admin/src/views/life/orders/index.vue`
- `admin/src/views/life/orders/detail.vue`

具体动作：

1. 确认 admin 登录返回的 `perms` 已进入 user store。
2. 页面按钮用现有 `v-permission` 或 `hasPerm` 控制显示。
3. 退款通过/拒绝/重试按钮分别绑定 `finance:refund:audit`、`finance:refund:retry`。
4. 订单删除按钮绑定 `order:delete`。
5. 工单回复/处理按钮绑定 `after-sales:ticket:reply`、`after-sales:ticket:resolve`。
6. 403 响应时给出明确提示，并刷新权限快照。

注意：前端权限只是体验优化，不能替代后端拦截。

### 3.4 权限测试清单

后端构建：

```bash
cd server
npm run build
```

手工/API 测试：

1. `operator` 调用退款审核接口，期望 403。
2. `finance` 调用退款审核接口，期望成功或进入业务校验。
3. `finance` 调用订单删除接口，期望 403。
4. `operator` 调用订单派单接口，期望成功或进入业务校验。
5. `super_admin` 调用退款审核、订单删除、用户角色修改，期望通过权限校验。
6. 未登录请求后台接口，期望 401。
7. 普通用户 token 请求后台接口，期望 403。
8. 没有标注权限但使用 `AdminAuthGuard` 的接口仍能按登录校验正常访问。

前端测试：

1. 使用运营账号登录，看不到退款审核按钮。
2. 使用财务账号登录，看不到订单删除、服务维护按钮。
3. 使用超级管理员登录，所有按钮按业务页面显示。
4. 直接复制接口请求绕过页面按钮时，后端仍能返回 403。

## 4. 第二部分：售后闭环修复

### 4.1 当前问题

当前已有基础结构：

- `Ticket`
- `TicketMessage`
- 后台审核中心能读取 `ticket` 类型审核项。
- 后台能处理 `reviewTicket` 和 `addTicketMessage`。

缺口：

- 小程序订单详情点击“申请售后”只是提示联系客服。
- 用户不能创建售后工单。
- 用户不能上传售后凭证。
- 用户不能查看工单进度和后台回复。
- 订单进入售后状态的动作没有从用户入口完整触发。

### 4.2 售后业务规则

第一版建议只支持订单售后，不做独立客服工单。

允许申请售后的订单状态：

```text
accepted
on_the_way
in_service
pending_confirm
completed
after_sales
```

不建议走售后的订单状态：

```text
pending_payment     -> 直接取消
pending_dispatch    -> 取消或退款申请
cancelled           -> 默认不允许，后续可扩展客服介入
refunded            -> 默认不允许重复售后
refund_pending      -> 已在退款审核中，不重复建售后
```

售后类型建议：

```text
refund          退款/费用争议
service_quality 服务质量问题
reschedule      改期/未履约
complaint       投诉
other           其他
```

售后状态建议沿用现有 `Ticket.status` 字符串：

```text
open       用户已提交
pending    平台处理中/等待补充材料
resolved   已解决
rejected   已拒绝
closed     用户关闭或系统关闭
```

幂等规则：

- 同一用户、同一订单，如果已有 `open` 或 `pending` 工单，再次申请直接返回已有工单。
- `resolved/rejected/closed` 后是否允许再次申请，第一版建议允许，但需要记录新的 `ticketNo`。
- 用户只能查看和追加自己工单的消息。
- 后台回复和处理结果必须写 admin audit log。

### 4.3 后端实现步骤

#### Step 1：新增售后模块

新增目录：

- `server/src/after-sales/`

建议文件：

```text
server/src/after-sales/after-sales.module.ts
server/src/after-sales/after-sales.controller.ts
server/src/after-sales/after-sales.service.ts
server/src/after-sales/dto/create-ticket.dto.ts
server/src/after-sales/dto/add-ticket-message.dto.ts
server/src/after-sales/constants/ticket-status.ts
server/src/after-sales/constants/ticket-type.ts
```

接入：

- 在 `server/src/app.module.ts` 引入 `AfterSalesModule`。
- 复用 `PrismaService`、`OrderTransitionService`、`ObjectStorageService`、`AdminAuditService`。

#### Step 2：补用户售后接口

新增接口：

```text
POST /orders/:id/after-sales
GET  /orders/:id/after-sales
GET  /after-sales/tickets/:id
POST /after-sales/tickets/:id/messages
POST /after-sales/tickets/:id/close
```

接口行为：

- `POST /orders/:id/after-sales`
  - 校验订单属于当前用户。
  - 校验订单状态允许售后。
  - 校验图片 URL 是系统上传后的永久地址。
  - 如果有进行中的工单，返回已有工单。
  - 创建 `Ticket`。
  - 创建第一条 `TicketMessage`，保存用户描述和图片。
  - 触发订单状态机 `AFTER_SALES_REQUEST`，把订单置为 `after_sales`。
  - 写订单状态日志。

- `GET /orders/:id/after-sales`
  - 返回当前订单下用户可见的工单列表。
  - 包含工单状态、类型、标题、最近一条消息、创建时间。

- `GET /after-sales/tickets/:id`
  - 返回工单详情和消息列表。
  - 用户只能看自己的工单。

- `POST /after-sales/tickets/:id/messages`
  - 用户追加补充说明和图片。
  - 只允许 `open/pending` 状态追加。
  - 后台已 `resolved/rejected/closed` 后不允许追加，除非后续定义“重新打开”。

- `POST /after-sales/tickets/:id/close`
  - 用户主动关闭工单。
  - 工单进入 `closed`。
  - 如果订单仍是 `after_sales`，按业务决定是否回到 `completed`。
  - 第一版建议：已完成订单关闭售后后回到 `completed`，服务中订单不自动回退，需要后台处理。

#### Step 3：完善订单状态机

重点文件：

- `server/src/orders/order-state-machine.ts`
- `server/src/orders/constants/order-action.ts`

当前已有 `AFTER_SALES_REQUEST`，需要确认：

1. `accepted/on_the_way/in_service/pending_confirm/completed -> after_sales` 可走通。
2. 重复 `after_sales -> after_sales` 要么允许记录日志，要么在服务层直接幂等返回。
3. 不允许 `pending_payment/pending_dispatch/refund_pending/refunded/cancelled` 直接走售后。

如果状态机已覆盖，则只在 `AfterSalesService` 中使用，不再手写 `order.update`。

#### Step 4：订单详情返回售后信息

修改文件：

- `server/src/orders/orders.repository.ts`
- `server/src/orders/order-presenter.ts`
- `miniapp/src/api/types/orders.ts`

计划增加字段：

```ts
tickets?: Array<{
  id: number
  ticketNo: string
  type: string
  title: string
  status: string
  latestMessage?: string
  createdAt: string
  updatedAt: string
}>
latestTicket?: {
  id: number
  ticketNo: string
  type: string
  title: string
  status: string
}
```

用途：

- 小程序订单详情直接展示售后进度。
- 售后中订单可跳转到工单详情。
- 后台订单详情也能看到关联工单。

#### Step 5：增强后台工单接口

当前后台有：

- `POST /admin/tickets/:id/resolve`
- `POST /admin/tickets/:id/messages`
- 审核中心 `ticket` 列表

建议补充：

```text
GET /admin/tickets
GET /admin/tickets/:id
POST /admin/tickets/:id/reject
POST /admin/tickets/:id/close
```

第一版如果不新增完整列表页，也至少要让审核中心能查看详情：

- 订单号
- 用户
- 师傅
- 售后类型
- 标题
- 描述
- 图片凭证
- 消息时间线
- 当前状态
- 处理人

后台动作：

- 回复用户：`after-sales:ticket:reply`
- 标记处理中：`after-sales:ticket:reply` 或 `after-sales:ticket:resolve`
- 解决工单：`after-sales:ticket:resolve`
- 拒绝工单：`after-sales:ticket:resolve`
- 关闭工单：`after-sales:ticket:resolve`

每次后台动作都写 `AdminAuditLog`。

### 4.4 小程序实现步骤

#### Step 1：新增 API

新增或修改：

- `miniapp/src/api/afterSales.ts`
- `miniapp/src/api/types/afterSales.ts`
- 或扩展 `miniapp/src/api/orders.ts`

建议函数：

```ts
createOrderAfterSales(orderId, payload)
getOrderAfterSales(orderId)
getAfterSalesTicket(ticketId)
addAfterSalesMessage(ticketId, payload)
closeAfterSalesTicket(ticketId)
```

#### Step 2：新增售后申请页

新增页面：

- `miniapp/src/pages/order/after-sales-create.vue`

页面字段：

- 售后类型
- 问题标题
- 问题描述
- 图片凭证，最多 6 张
- 联系电话，默认订单联系人电话

提交逻辑：

1. 校验描述长度。
2. 上传图片到现有上传接口。
3. 调用 `POST /orders/:id/after-sales`。
4. 成功后跳转售后详情页。

#### Step 3：新增售后详情页

新增页面：

- `miniapp/src/pages/order/after-sales-detail.vue`

展示：

- 工单状态
- 售后类型
- 订单号
- 用户描述
- 图片凭证
- 平台回复时间线
- 追加说明入口
- 关闭工单按钮

交互：

- `open/pending` 可追加说明。
- `resolved/rejected/closed` 只读展示。
- 管理员回复后用户能看到最新消息。

#### Step 4：改造订单详情入口

修改文件：

- `miniapp/src/pages/order/detail.vue`
- `miniapp/src/pages/order/list.vue`
- `miniapp/src/components/order-card/order-card.vue`

具体动作：

1. `onSecondary()` 中非取消场景不再 toast “联系客服”，改为跳转售后申请页或售后详情页。
2. 如果已有进行中 `latestTicket`，按钮文案显示“查看售后”。
3. 如果无工单但订单状态允许售后，按钮文案显示“申请售后”。
4. 订单详情增加售后状态卡片：
   - 待处理
   - 处理中
   - 已解决
   - 已拒绝
   - 已关闭
5. 售后 tab 中展示 `after_sales/refund_pending/refunded`，并能进入工单详情。

### 4.5 后台前端实现步骤

重点文件：

- `admin/src/views/life/audit/index.vue`
- `admin/src/api/life/index.ts`
- `admin/src/api/life/types.ts`

具体动作：

1. 审核中心 `ticket` 行增加“查看详情”。
2. 详情弹窗展示消息时间线和图片凭证。
3. 增加“回复用户”输入框。
4. 增加“解决”“拒绝”“关闭”动作。
5. 操作按钮接入权限：
   - `after-sales:ticket:reply`
   - `after-sales:ticket:resolve`
6. 提交后刷新审核中心列表和 dashboard 待办数量。

### 4.6 售后测试清单

后端构建：

```bash
cd server
npm run build
```

小程序类型检查：

```bash
cd miniapp
npm run type-check
```

后台类型检查：

```bash
cd admin
npm run type-check
```

功能测试：

1. 用户对 `completed` 订单申请售后，生成 `Ticket.open`，订单进入 `after_sales`。
2. 用户重复申请同一订单售后，返回已有进行中工单，不创建第二条。
3. 用户上传图片凭证，`TicketMessage.images` 正确保存。
4. 用户查看售后详情，能看到自己提交的内容和后台回复。
5. 用户不能查看别人的工单，期望 403 或 404。
6. `pending_payment` 订单不能申请售后，提示应取消订单。
7. `refund_pending` 订单不能重复申请售后，提示退款处理中。
8. 后台回复工单后，用户端时间线展示回复。
9. 后台解决工单后，`Ticket.status = resolved`，后台审计日志存在。
10. 后台拒绝工单后，`Ticket.status = rejected`，用户端展示拒绝原因。
11. 操作员账号可处理售后，但不能处理退款审核。
12. 财务账号不能处理售后工单，除非明确授予权限。

## 5. Day 28 时间拆分

### 上午：权限安全底座

1. 新增 `RequireAdminPermissions` 装饰器。
2. 改造 `AdminAuthGuard`，完成接口级权限校验。
3. 扩展 `admin-permissions.ts` 权限字典。
4. 给退款、提现、订单、用户、服务、售后、审计日志等后台接口标注权限。
5. 跑后端构建。
6. 用不同后台角色做 403/通过用例验证。

### 下午：售后后端闭环

1. 新增 `AfterSalesModule`。
2. 实现用户创建工单、查询工单、查看详情、追加消息、关闭工单接口。
3. 接入订单状态机 `AFTER_SALES_REQUEST`。
4. 订单详情 presenter 返回 `latestTicket/tickets`。
5. 后台补工单详情、回复、解决、拒绝、关闭接口。
6. 给售后后台接口加权限标注。
7. 跑后端构建和 API 烟测。

### 晚上：前端联调与验收

1. 小程序新增售后申请页。
2. 小程序新增售后详情页。
3. 改造订单详情和订单卡片的“申请售后/查看售后”入口。
4. 后台审核中心增加工单详情、回复和处理按钮。
5. 前端按钮权限和后端权限联调。
6. 跑后台 `type-check`。
7. 跑小程序 `type-check`。
8. 完成权限与售后测试清单。

## 6. 完成标准

权限完成标准：

- 所有后台敏感接口都有权限标注。
- 非授权角色直接请求接口会返回 403。
- 前端按钮显示和后端权限结果一致。
- 超级管理员不受影响。

售后完成标准：

- 用户能从订单详情发起售后。
- 系统生成唯一工单并进入 `open`。
- 订单进入 `after_sales` 并写状态日志。
- 用户能查看工单详情和平台回复。
- 用户能追加说明和凭证。
- 后台能回复、解决、拒绝、关闭工单。
- 后台每次处理写审计日志。
- 重复申请不会创建重复进行中工单。

## 7. 风险与注意事项

- 后台权限一旦收紧，前端页面可能出现按钮仍显示但接口 403，需要同步修正按钮权限。
- 部分老接口如果没有标注权限，会退化成“只登录即可访问”，第一轮必须覆盖所有 `/admin/**` 敏感接口。
- 售后状态会影响订单列表筛选，需确认 `after_sales` tab 不漏单。
- 订单处于退款中时不要重复进入售后，避免退款和售后两条流程抢同一个订单状态。
- 图片凭证必须使用上传接口返回的永久地址，不保存临时签名地址。
