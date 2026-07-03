# Day 26 - 预约改期、会员卡冻结释放与 Admin 会员卡视图拆分计划

## 1. 本轮目标

本轮只处理两个 P0 项：

1. 用户修改预约时间、取消预约后的会员卡冻结释放/退款规则完整验收。
2. Admin 拆分服务预约订单、会员卡购买订单、用户会员卡、会员卡流水视图。

不纳入本轮：

- 用户评价提交。
- 用户售后工单提交。
- 师傅独立账号登录体系。
- 消息通知、收藏、优惠券完整抵扣。

## 2. 当前基础

当前项目已经具备以下基础：

- 用户可以创建服务预约订单。
- 用户可以购买会员卡。
- 会员卡购买订单支付成功后自动发卡。
- 用户可以使用会员卡预约服务。
- 使用会员卡预约时会冻结预计扣减额度。
- 服务完成时会正式核销会员卡额度。
- Admin 订单列表已经支持通过 `orderType` 筛选服务预约和会员卡购买订单。

主要缺口：

- 用户端没有修改预约时间入口。
- 后端没有用户侧预约改期接口。
- 取消预约后的会员卡冻结释放需要补充幂等验收。
- 现金订单取消后的退款规则没有明确分层。
- Admin 端仍以通用订单列表为主，会员卡购买订单、用户会员卡、会员卡流水没有独立管理视图。

## 3. 业务规则设计

### 3.1 订单类型边界

继续保持订单类型拆分：

```text
service_booking       服务预约订单
consultation          咨询订单
member_card_purchase  会员卡购买订单
```

规则：

- 服务预约订单可以改期、派单、履约、取消。
- 咨询订单可以改期、派单、取消，但不支付、不核销会员卡。
- 会员卡购买订单不能改期、不能派单、不能进入师傅端。
- 会员卡购买订单只关注支付、发卡、退款、发卡回滚。

### 3.2 用户改期规则

允许用户改期的状态：

```text
pending_payment
pending_dispatch
```

暂不允许用户自行改期的状态：

```text
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

说明：

- `pending_payment`：未支付现金预约订单，改期只更新预约时间。
- `pending_dispatch`：已支付现金订单或会员卡预约订单，尚未派单，改期只更新预约时间。
- 已派单后如果要改期，本轮先走 Admin 人工处理，避免影响师傅日程和派单责任。

### 3.2.1 预约时间段规则

预约页面和后端改期/下单校验必须统一执行以下规则：

- 每天可预约时间范围为 `08:00-17:00`。
- 不允许预约早于当前时间的时间段。
- 如果预约日期是今天，只展示并允许提交当前时间之后的可预约时间段。
- 如果当前时间已经达到或超过 `17:00`，今天不再展示可预约时间段。
- 如果预约日期是明天或更晚，展示完整的 `08:00-17:00` 可预约时间段。
- 前端负责隐藏不可选时段，后端必须再次校验，防止绕过前端直接提交过期时间。

时间段展示粒度沿当前预约页实现统一调整；如果继续使用固定时间段，必须覆盖 `08:00-17:00`，且不得出现 `17:00` 之后的预约结束时间。

### 3.3 用户取消规则

现金服务预约：

```text
pending_payment -> cancelled
```

- 未支付，直接取消。
- 不产生退款。

```text
pending_dispatch -> cancelled 或 refund_pending
```

- 已支付但未派单。
- 本轮建议先进入 `refund_pending`，由 Admin 审核退款。
- 如果本地模拟环境暂不做真实退款，也必须保留退款记录或审核事项，不能静默丢失。

会员卡服务预约：

```text
pending_dispatch -> cancelled
```

- 释放冻结额度。
- 写入 `member_card_records.release`。
- 订单记录 `cancelledAt`、`cancelReason`。
- 重复取消不得重复释放。

咨询订单：

```text
pending_dispatch -> cancelled
```

- 不支付。
- 不释放会员卡。
- 不产生退款。

会员卡购买订单：

- 用户不能通过服务预约取消接口取消。
- 后续退款需要单独走会员卡购买退款规则。

### 3.4 会员卡冻结释放规则

冻结：

```text
创建会员卡预约订单
-> user_member_cards.frozenUnits 增加
-> member_card_records 写入 freeze
```

释放：

```text
取消未履约会员卡预约
-> user_member_cards.frozenUnits 减少
-> member_card_records 写入 release
```

核销：

```text
师傅完成服务
-> user_member_cards.remainingUnits 减少
-> user_member_cards.frozenUnits 减少
-> member_card_records 写入 consume
-> 如半次核销有未用冻结额度，额外写入 release
```

幂等要求：

- 同一个订单只能释放一次冻结额度。
- 如果订单已经 `cancelled`，再次取消直接返回当前订单，不再写 release。
- 如果 `frozenUnits` 小于订单冻结额度，只释放当前可释放额度，并记录异常审计。
- 如果订单没有 `memberCardId` 或 `memberCardConsumeUnits <= 0`，取消时不调用释放。

## 4. 后端改造计划

### 4.1 新增 DTO

新增文件：

```text
server/src/orders/dto/reschedule-order.dto.ts
```

字段：

```ts
appointmentDate: string
appointmentTimeSlot: string
version?: number
reason?: string
```

校验：

- 日期必填。
- 时间段必填。
- 时间段格式沿用当前下单页，但必须落在 `08:00-17:00` 可预约范围内。
- 不允许预约过去时间。
- 当预约日期为今天时，不允许提交早于当前时间的时间段。

### 4.2 新增用户改期接口

修改：

```text
server/src/orders/orders.controller.ts
server/src/orders/orders.service.ts
```

接口：

```text
POST /orders/:id/reschedule
```

处理逻辑：

1. 校验订单属于当前用户。
2. 禁止 `member_card_purchase`。
3. 校验订单状态是否允许用户改期。
4. 根据日期和时间段计算新的 `appointmentStartTime`、`appointmentEndTime`。
5. 乐观锁校验 `version`。
6. 更新订单时间、`version`。
7. 写入 `order_status_logs` 或订单操作日志，action 使用 `user_reschedule`。
8. 返回最新订单详情。

### 4.3 强化取消接口

修改：

```text
server/src/orders/orders.service.ts
server/src/member-cards/member-cards.service.ts
```

目标：

- 明确禁止会员卡购买订单走服务取消。
- 会员卡预约取消时释放冻结额度。
- 现金已支付未派单订单生成退款待处理语义。
- 重复取消保持幂等。

建议实现：

```text
cancelOrder(userId, orderId, dto)
```

分支：

- `pending_payment`：取消订单。
- `pending_dispatch + memberCardId`：释放冻结额度后取消订单。
- `pending_dispatch + paidAt`：改为 `refund_pending` 或创建退款审核记录。
- 其他状态：拒绝用户取消。

如果当前状态已经是：

```text
cancelled
refund_pending
refunded
```

直接返回当前订单详情，不重复执行副作用。

### 4.4 退款规则最小闭环

本轮不一定接入真实微信退款，但必须形成可审计记录：

- 对已支付现金订单取消，创建 `refunds` 记录，状态 `pending`。
- 订单状态进入 `refund_pending`。
- Admin 退款审核页能看到该记录。

会员卡预约取消：

- 不创建退款记录。
- 只释放会员卡冻结。

会员卡购买订单退款：

- 本轮只在 Admin 视图中展示购买订单和发卡状态。
- 自动回滚会员卡权益可作为下一阶段。

### 4.5 Admin 订单改期接口

可选但建议本轮实现：

```text
POST /admin/orders/:id/reschedule
```

用途：

- 支持 Admin 对 `dispatched`、`accepted` 等状态进行人工改期。
- 记录 admin 操作日志。
- 如果已派单，保留师傅绑定，不自动重派。

如果工期受限，本轮至少让 Admin 通过现有编辑订单能力修改预约时间，但需要在 UI 上标明人工改期。

## 5. 用户端改造计划

### 5.1 API

修改：

```text
miniapp/src/api/orders.ts
miniapp/src/api/types/orders.ts
```

新增：

```ts
export function rescheduleOrder(id: number, data: RescheduleOrderPayload)
```

类型：

```ts
interface RescheduleOrderPayload {
  appointmentDate: string
  appointmentTimeSlot: string
  version?: number
  reason?: string
}
```

### 5.2 订单详情页入口

修改：

```text
miniapp/src/pages/order/detail.vue
```

新增能力：

- 在 `pending_payment`、`pending_dispatch` 状态显示“修改时间”。
- 弹出日期和时间段选择面板。
- 时间段只展示每天 `08:00-17:00` 内的可预约时段。
- 当天自动过滤早于当前时间的时段。
- 提交后刷新订单详情。
- 提交时传 `version`。
- 失败时展示后端错误。

按钮策略：

```text
pending_payment:
  主按钮：去支付
  次按钮：取消订单
  辅助按钮：修改时间

pending_dispatch:
  主按钮：查看进度
  次按钮：取消预约
  辅助按钮：修改时间
```

### 5.3 取消提示文案

现金未支付：

```text
确定取消该订单吗？
```

现金已支付待派单：

```text
订单已支付，取消后将进入退款审核，确认继续吗？
```

会员卡预约：

```text
取消后将释放本次冻结的会员卡额度，确认继续吗？
```

## 6. Admin 视图拆分计划

### 6.1 菜单结构

修改：

```text
admin/src/router/life-admin-routes.ts
```

建议菜单：

```text
订单管理
  服务预约订单
  会员卡购买订单
  履约记录

营销管理
  会员卡模板
  用户会员卡
  会员卡流水
  优惠券
  首页轮播图
```

### 6.2 服务预约订单页面

复用：

```text
admin/src/views/life/orders/index.vue
```

进入页面时固定：

```text
orderType=bookings
```

展示字段：

- 订单号
- 订单类型
- 用户
- 服务
- 预约时间
- 地址
- 支付金额
- 使用会员卡
- 冻结额度
- 师傅
- 状态

允许操作：

- 查看详情。
- 派单。
- 改期。
- 取消。
- 删除仅保留开发/管理能力，正式环境建议隐藏。

禁止展示：

- 会员卡购买订单。

### 6.3 会员卡购买订单页面

复用或拆出：

```text
admin/src/views/life/orders/index.vue
```

进入页面时固定：

```text
orderType=member_card_purchase
```

展示字段：

- 购买订单号
- 用户
- 会员卡模板
- 金额
- 支付状态
- 发卡状态
- 用户会员卡 ID
- 支付时间
- 完成时间

允许操作：

- 查看详情。
- 查看用户会员卡。
- 查看会员卡流水。
- 发卡异常时手动补发，若本轮来不及则只预留按钮和后端接口设计。

禁止操作：

- 派单。
- 自动派单。
- 师傅相关操作。
- 服务履约操作。
- 用户改期。

### 6.4 用户会员卡页面

新增模块 key：

```text
userMemberCards
```

后端接口：

```text
GET /admin/user-member-cards
GET /admin/user-member-cards/:id
PUT /admin/user-member-cards/:id/status
```

前端配置：

```text
admin/src/api/life/types.ts
admin/src/api/life/index.ts
admin/src/router/life-admin-routes.ts
```

展示字段：

- ID
- 用户昵称
- 用户手机号
- 卡名称
- 卡类型
- 来源：purchase/admin
- 剩余额度
- 冻结额度
- 可用额度
- 有效期
- 状态
- 创建时间

操作：

- 查看详情。
- 禁用/启用。
- 查看流水。

本轮暂不做：

- 手动调整额度。
- 延期。
- 批量发卡。

### 6.5 会员卡流水页面

新增模块 key：

```text
memberCardRecords
```

后端接口：

```text
GET /admin/member-card-records
```

筛选条件：

- 用户关键词。
- 卡名称。
- 订单号。
- 流水类型。
- 时间范围。

展示字段：

- ID
- 用户
- 手机号
- 卡名称
- 订单号
- 流水类型
- 变动额度
- 变动前额度
- 变动后额度
- 操作人类型
- 操作人 ID
- 备注
- 创建时间

流水类型中文：

```text
grant    发放
freeze   冻结
release  释放
consume  核销
adjust   调整
refund_revoke 退款回滚
```

操作：

- 只读查看。

## 7. 后端 Admin API 计划

修改：

```text
server/src/admin-business/admin-business.controller.ts
server/src/admin-business/admin-business.service.ts
```

新增：

```text
GET /admin/user-member-cards
GET /admin/member-card-records
GET /admin/user-member-cards/:id
PUT /admin/user-member-cards/:id/status
```

列表分页沿用：

```text
page
pageSize
keyword
status
type
```

新增查询：

- `recordType`
- `cardType`
- `source`
- `dateStart`
- `dateEnd`

## 8. 测试计划

### 8.1 后端测试

建议覆盖：

1. 现金未支付订单可以改期。
2. 现金待派单订单可以改期。
3. 会员卡预约待派单订单可以改期。
4. 已派单订单用户不能改期。
5. 会员卡购买订单不能改期。
6. 预约时间早于 `08:00` 或晚于 `17:00` 时后端拒绝。
7. 当天预约早于当前时间段时后端拒绝。
8. 当前时间超过 `17:00` 后不能预约当天。
9. 会员卡预约取消后释放冻结额度。
10. 重复取消不重复释放。
11. 已支付现金待派单订单取消后进入退款审核。
12. Admin 用户会员卡列表能返回发卡数据。
13. Admin 会员卡流水列表能返回 grant/freeze/release/consume。

### 8.2 前端手工验收

用户端：

1. 创建现金预约订单，未支付时修改预约时间。
2. 支付现金订单，待派单时修改预约时间。
3. 从卡包预约服务，确认冻结额度。
4. 修改会员卡预约时间，冻结额度不变化。
5. 当天只展示当前时间之后、且在 `08:00-17:00` 内的时间段。
6. 明天及以后展示完整 `08:00-17:00` 可预约时间段。
7. 取消会员卡预约，卡包额度恢复。
8. 再次点击取消，不产生二次释放。

Admin：

1. 服务预约订单页面只展示预约/咨询订单。
2. 会员卡购买订单页面只展示买卡订单。
3. 买卡订单没有派单按钮。
4. 用户会员卡页面能看到购买发放和后台发放的卡。
5. 会员卡流水页面能看到发放、冻结、释放、核销记录。

## 9. 验收标准

本轮完成的验收标准：

1. 用户可以在订单详情修改未派单前的预约时间。
2. 改期后订单详情、订单列表、Admin 订单页展示新时间。
3. 预约和改期都只能选择每天 `08:00-17:00` 的可预约时间段。
4. 当天不能选择早于当前时间的时间段。
5. 会员卡预约取消后冻结额度释放。
6. 释放动作有会员卡流水记录。
7. 重复取消不会重复释放额度。
8. 已支付现金预约取消后进入退款审核或生成退款待处理记录。
9. Admin 菜单拆分服务预约订单和会员卡购买订单。
10. 会员卡购买订单不显示派单类操作。
11. Admin 可以查看用户会员卡列表。
12. Admin 可以查看会员卡流水列表。

## 10. 实施顺序

推荐按以下顺序执行：

1. 后端补 `reschedule` DTO、接口和 service 逻辑。
2. 后端强化取消逻辑和退款待处理逻辑。
3. 后端新增 Admin 用户会员卡/流水接口。
4. 用户端订单详情加入改期入口和取消提示。
5. Admin 路由拆分服务预约订单、会员卡购买订单。
6. Admin 增加用户会员卡、会员卡流水资源配置。
7. 跑后端构建和前端类型检查。
8. 按验收清单手工跑通现金订单和会员卡订单。

## 11. 风险点

1. 已派单后的改期会影响师傅日程，本轮先不开放用户自助改期。
2. 现金已支付订单取消涉及真实退款，当前可先做退款审核记录，不直接自动退款。
3. 会员卡释放必须保证幂等，否则会出现余额异常。
4. Admin 通用资源页可以快速接入列表，但复杂操作如额度调整、延期、补发需要专门页面，建议下一阶段再做。
5. 如果历史订单缺少 `orderType` 或会员卡字段，需要迁移或兼容展示。
