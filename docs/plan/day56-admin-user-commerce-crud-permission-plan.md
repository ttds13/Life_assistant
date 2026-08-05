# Day56 Admin 用户权益卡、服务预约与订单操作权限补全计划

## 1. 背景与目标

当前 Admin 已能查询用户订单、用户服务预约和用户权益卡，但三类页面的可操作能力不一致：

- “用户订单”“用户服务预约”列表主要是用户视角的只读投影，只能进入订单详情，不能直接在当前用户上下文创建、修改、取消或删除。
- “用户权益卡”已有发放、时长调整、暂停/恢复、完成等后端能力，但仍复用会员卡商品的通用权限，缺少用户资产专属权限、受控撤销和完整操作入口。
- 订单模块虽已有 Admin 创建、编辑和删除接口，但创建复用了 `order:update`；现有删除会级联物理删除支付、退款、评价、履约、权益流水和状态日志，风险过高，不能直接向普通运营开放。
- 当前只有 `super_admin`、`operator`、`finance` 三种角色，且页面按钮没有完整按权限和业务状态收敛，容易出现“看得见但点不了”或“有接口但找不到入口”。

Day56 的目标是：

1. 为三类业务建立独立、可扩展的权限命名和角色矩阵。
2. 在用户视角页面补齐创建、查看、受控编辑、取消/撤销和有限删除入口。
3. 后端以状态机、数据关联和财务事实为最终校验，不能依赖前端隐藏按钮保证安全。
4. 所有高风险操作记录原因、操作人、前后值、请求 ID 和关联业务流水。
5. 保留现有订单、支付、退款、积分和权益核销链路，不因“提高权限”破坏历史数据与账务一致性。

## 2. 设计边界

### 2.1 三个业务域必须分开

| 业务域 | 管理对象 | 允许的核心操作 | 不允许直接覆盖的事实 |
| --- | --- | --- | --- |
| 用户订单 | 交易主单、金额快照、支付/退款关联 | 后台代下单、待支付订单改价、备注、取消、草稿删除 | 成功支付金额、支付时间、退款结果、积分结算结果 |
| 用户服务预约 | 订单下的履约预约、时间、地址、服务人员和履约状态 | 新建预约、改期、改地址、派单、取消、合规状态流转 | 已完成履约记录、核销记录、服务人员收益 |
| 用户权益卡 | 已发到用户账户的权益资产 | 发放、调整余额、暂停、恢复、延期、撤销/完成 | 已核销流水、退款流水、来源订单和历史版本快照 |

订单与预约可共享订单 ID，但前端操作语义和后端状态规则不能合并成一个“万能编辑”表单。用户权益卡是资产，不按普通配置表处理。

### 2.2 CRUD 的业务含义

- `Create`：创建后台订单/预约，或给指定用户发放权益卡。
- `Read`：列表、详情、流水、关联支付/退款/积分/权益来源可追溯。
- `Update`：只修改当前状态允许修改的字段；支付、完成、退款、核销使用专用动作。
- `Delete`：只对没有财务和履约事实的草稿/待支付记录允许物理删除；其余使用取消、撤销、退款或冲正。

## 3. 当前能力与缺口

### 3.1 已有能力

订单后端已有：

```text
POST   /api/admin/orders
GET    /api/admin/orders/:id
PUT    /api/admin/orders/:id
DELETE /api/admin/orders/:id
POST   /api/admin/orders/:id/assign
POST   /api/admin/orders/:id/auto-assign
PUT    /api/admin/orders/:id/address
PUT    /api/admin/orders/:id/remark
POST   /api/admin/orders/:id/confirm-offline-payment
```

用户业务查询已有：

```text
GET /api/admin/user-orders
GET /api/admin/user-service-bookings
GET /api/admin/users/:id/commerce-overview
```

用户权益卡已有：

```text
GET  /api/admin/user-member-cards
GET  /api/admin/user-member-cards/:id
POST /api/admin/member-cards/grant
PUT  /api/admin/user-member-cards/:id/status
POST /api/admin/user-member-cards/:id/adjust-time
```

### 3.2 主要缺口

1. 缺少 `order:create`，后台代下单错误复用 `order:update`。
2. `user-commerce:list/detail` 只是查询权限，不能表达订单、预约和权益卡的写权限。
3. 用户订单和预约列表只有查看入口，没有用户上下文创建和行级操作。
4. 用户权益卡操作复用 `member-card:update/grant`，未区分“商品卡模板”与“用户持有资产”。
5. 订单删除没有状态、支付、退款、履约、积分和权益资产保护，当前实现属于危险的级联硬删除。
6. 缺少统一的“可执行动作”返回，前端容易复制一套不完整的状态判断。
7. 高风险请求缺少统一的原因、幂等键和并发版本约束。

## 4. 权限模型

### 4.1 新增权限码

延续当前 `domain:action` 风格，新增：

```text
user-order:create
user-order:update
user-order:cancel
user-order:delete-draft

user-booking:create
user-booking:update
user-booking:reschedule
user-booking:address:update
user-booking:assign
user-booking:cancel
user-booking:delete-draft

user-member-card:grant
user-member-card:update
user-member-card:adjust
user-member-card:suspend
user-member-card:revoke
user-member-card:delete-draft
```

保留现有 `order:list/detail/update/delete/assign`、`member-card:*` 作为过渡权限。新接口和新按钮只使用新权限；过渡期在服务端建立旧权限到新权限的兼容映射，完成角色数据迁移后删除映射。

`member-card:create/update` 继续只管理权益卡商品/模板；`user-member-card:*` 只管理发到用户账户的资产，二者不得互相代替。

### 4.2 角色矩阵

| 能力 | 超级管理员 | 运营管理员 | 财务管理员 | 客服/只读角色 |
| --- | --- | --- | --- | --- |
| 查询三类用户业务 | 允许 | 允许 | 允许查看账务相关信息 | 允许脱敏查看 |
| 后台创建订单/预约 | 允许 | 允许 | 不允许 | 不允许 |
| 修改待支付订单非账务字段 | 允许 | 允许 | 不允许 | 不允许 |
| 待支付订单改价 | 允许 | 有独立授权时允许 | 允许复核，不直接改业务字段 | 不允许 |
| 改期、改地址、派单 | 允许 | 允许 | 不允许 | 可配置为仅提交申请 |
| 取消未履约预约 | 允许 | 允许 | 涉及退款时负责审核 | 不允许 |
| 发放权益卡 | 允许 | 有独立授权时允许 | 仅付费发卡复核 | 不允许 |
| 调整权益余额/有效期 | 允许 | 有独立授权时允许 | 可查看并复核付费资产 | 不允许 |
| 撤销权益卡 | 允许 | 仅免费赠送且未使用 | 涉及退款时负责审核 | 不允许 |
| 删除无业务事实草稿 | 允许 | 有独立授权时允许 | 不允许 | 不允许 |
| 查看审计记录 | 允许 | 允许查看自身业务范围 | 允许 | 不允许 |

首期不必立刻增加数据库角色类型，可先在现有角色权限集合中引入粒度更细的权限码：

- `super_admin`：继续返回 `*`，但仍必须通过状态机和数据完整性校验，不能绕过业务规则。
- `operator`：获得创建、预约编辑、改期、地址修改、派单和非财务取消；默认不获得硬删除、付费权益撤销和账务改写。
- `finance`：获得账务查询和退款审核；默认不获得预约履约编辑、发卡和权益余额直接调整。
- 后续若增加客服角色，只需配置权限集合，不需要改业务接口。

## 5. 状态与操作矩阵

### 5.1 用户订单

| 订单状态/事实 | 可修改 | 取消 | 物理删除 |
| --- | --- | --- | --- |
| 待支付，无成功支付、无退款、无积分、无权益发放/冻结、无履约记录 | 用户备注、后台备注、地址、预约时间、允许范围内的金额 | 允许 | 仅超级管理员或 `delete-draft`，且填写原因 |
| 已线下收款或存在成功支付 | 备注、允许的联系/地址更正 | 走取消加退款/冲正流程 | 禁止 |
| 待派单/已派单/履约中 | 备注；预约域允许的改期、地址和派单 | 走预约取消和退款判定 | 禁止 |
| 已完成 | 仅补充后台备注；账务错误走专用纠错 | 走售后/退款 | 禁止 |
| 退款中/已退款/售后中 | 仅专用流程和备注 | 不重复取消 | 禁止 |
| 已取消且从未产生业务事实 | 只读 | 已取消 | 可选：保留归档，默认不物理删除 |

订单更新必须拆分普通字段与专用动作：

- 普通编辑不能直接写 `status`、`paidAmount`、`paidAt`、`completedAt`。
- 金额只允许待支付且无成功支付事实时修改，并记录改价原因和前后金额。
- 支付确认、完成、取消、退款继续走现有或新增专用服务，保证积分、优惠券和权益冻结同步处理。

### 5.2 用户服务预约

| 履约阶段 | 可用操作 |
| --- | --- |
| 待支付 | 修改时间、地址、备注；符合订单删除条件时删除草稿 |
| 待派单 | 改期、改地址、派单、取消 |
| 已派单/待出发 | 改期、改地址、改派；需要校验服务人员冲突并重新通知 |
| 已出发/服务中 | 默认禁止普通改期；超级管理员使用异常纠错动作并填写原因 |
| 待确认/已完成 | 禁止覆盖履约事实；只允许确认、售后、退款或审计纠错 |
| 已取消/已退款 | 只读，不能恢复成进行中；重新服务必须新建预约 |

预约操作必须同步检查：营业时间、不可预约时段、服务范围、地址版本、师傅时间冲突、会员卡冻结额度和优惠券/支付状态。

### 5.3 用户权益卡

| 权益卡状态/事实 | 可用操作 |
| --- | --- |
| 待激活、免费后台发放、无核销/冻结 | 修改激活截止时间、调整初始余额、暂停、撤销；满足严格条件时物理删除草稿 |
| 待激活、来源为已支付购买订单 | 暂停、延期；撤销必须先走订单退款 | 禁止物理删除 |
| 已激活且未冻结 | 增减余额、延期、暂停、恢复、完成/撤销，必须写原因和流水 |
| 存在冻结预约 | 余额不能低于冻结值；撤销前必须先取消/完成关联预约并释放冻结 |
| 已部分/全部核销 | 只能新增调整或冲正流水，不修改历史核销记录 | 禁止物理删除 |
| 已完成、已退款或已撤销 | 只读；错误处理用反向流水和显式恢复动作 | 禁止物理删除 |

权益卡调整使用正负流水，不直接改历史 `member_card_records`。付费卡撤销必须由订单退款流程驱动，避免出现“钱未退、卡已删”。

## 6. 后端补全方案

### 6.1 统一能力描述

订单详情、预约列表项和权益卡详情增加 `allowedActions`：

```json
{
  "allowedActions": {
    "update": true,
    "cancel": true,
    "deleteDraft": false,
    "reschedule": true,
    "assign": true,
    "reason": {
      "deleteDraft": "订单已支付，不能物理删除"
    }
  },
  "version": 7
}
```

`allowedActions` 由“管理员权限 + 当前状态 + 关联数据事实”共同计算，供前端控制按钮。请求提交后服务端必须重新计算，防止越权、旧页面操作和并发状态变化。

### 6.2 建议接口

订单：

```text
POST /api/admin/user-orders
PUT  /api/admin/user-orders/:id
POST /api/admin/user-orders/:id/cancel
DELETE /api/admin/user-orders/:id/draft
GET  /api/admin/user-orders/:id/actions
```

服务预约：

```text
POST /api/admin/user-service-bookings
PUT  /api/admin/user-service-bookings/:id
POST /api/admin/user-service-bookings/:id/reschedule
PUT  /api/admin/user-service-bookings/:id/address
POST /api/admin/user-service-bookings/:id/assign
POST /api/admin/user-service-bookings/:id/cancel
DELETE /api/admin/user-service-bookings/:id/draft
GET  /api/admin/user-service-bookings/:id/actions
```

用户权益卡：

```text
POST /api/admin/user-member-cards/grant
PUT  /api/admin/user-member-cards/:id
POST /api/admin/user-member-cards/:id/adjust
POST /api/admin/user-member-cards/:id/extend
POST /api/admin/user-member-cards/:id/suspend
POST /api/admin/user-member-cards/:id/resume
POST /api/admin/user-member-cards/:id/revoke
DELETE /api/admin/user-member-cards/:id/draft
GET  /api/admin/user-member-cards/:id/actions
```

现有接口可以在内部复用，外部逐步迁移到语义明确的新接口。`DELETE /api/admin/orders/:id` 在完成保护前应临时仅允许超级管理员访问，并尽快替换为 `/draft` 受控删除。

### 6.3 DTO、并发与幂等

所有写请求至少包含：

```json
{
  "expectedVersion": 7,
  "reason": "客户来电要求改期",
  "idempotencyKey": "admin-booking-123-reschedule-20260728-001"
}
```

- `reason`：取消、删除、撤销、余额调整、延期、改价和异常状态纠错必填，长度 2 至 200。
- `expectedVersion`：使用乐观锁；版本不一致返回 `409`，前端刷新后重新确认。
- `idempotencyKey`：创建、取消、撤销、发卡和余额调整必须幂等，重复提交返回第一次结果。
- DTO 使用 `class-validator` 白名单，不接收数据库字段透传。
- 金额统一用 Decimal；时间统一 ISO 8601，并校验开始早于结束。

### 6.4 删除策略改造

废弃当前“先删除关联数据，再删除订单”的通用级联方式。新增删除前置校验器：

```text
assertOrderDraftDeletable
assertBookingDraftDeletable
assertUserMemberCardDraftDeletable
```

检查项至少包括：成功支付、退款、积分奖励事件、优惠券使用、会员卡发放/冻结/核销、师傅派单/收益、签到、服务照片、评价、售后工单和通知。

若任何业务事实存在，返回 `409` 和阻止原因，不尝试清除事实。允许删除时也优先采用 `deletedAt` 软删除；只有测试数据清理脚本可执行明确范围内的物理删除。

### 6.5 审计要求

每个写操作在同一数据库事务中写 `admin_audit_logs`，包含：

```text
adminId / role / permission
action / targetType / targetId
before / after / reason
requestId / idempotencyKey / ip
关联 orderId / paymentId / refundId / userMemberCardId
createdAt
```

订单状态日志、权益流水和 Admin 审计分别承担业务轨迹、资产轨迹和管理员责任追溯，不能互相替代。

## 7. Admin 页面补全

### 7.1 用户订单页

- 顶部增加“新建用户订单”，从 `userId` 查询条件或用户详情进入时自动带入用户。
- 行操作增加：详情、编辑、取消、删除草稿；按钮按权限和 `allowedActions` 显示。
- 编辑弹窗只展示当前可编辑字段，账务字段只读并提供“查看支付/退款/积分流水”链接。
- 删除草稿使用危险确认弹窗，展示订单号、用户、金额、关联检查结果，并要求输入删除原因。

### 7.2 用户服务预约页

- 顶部增加“新建服务预约”，复用现有后台代下单表单和价格预览。
- 行操作增加：改期、改地址、派单/改派、取消、删除草稿、详情。
- 改期弹窗实时执行预约冲突检查；改地址沿用订单地址快照和版本控制。
- 已履约记录不显示编辑按钮，展示明确状态与可用专用操作。

### 7.3 用户权益卡页

- 顶部增加“发放权益卡”，从用户详情进入时锁定用户，模板使用可搜索下拉选项，不要求手输模板 ID。
- 行操作保留调整、暂停/恢复、完成、查看流水和来源订单，新增延期和受控撤销。
- 将“完成并停用”与“撤销”分开：完成表示权益生命周期结束，撤销表示业务纠错/退款结果。
- 余额调整弹窗展示总量、已用、冻结、可用、调整后结果；禁止调整到冻结值以下。
- 所有按钮使用 `v-permission`/`hasPerm` 和 `allowedActions` 双重控制；无权限不显示，状态不允许时禁用并提示原因。

### 7.4 用户业务总览

用户详情 `/users/detail/:id/commerce` 增加三个快捷动作：

```text
为该用户创建订单
为该用户创建服务预约
为该用户发放权益卡
```

创建完成后刷新最近订单、最近预约和权益卡汇总，保持在当前用户上下文，减少管理员重复搜索用户。

## 8. 数据模型与兼容

优先复用现有 `Order`、`ServiceBookingOrder`、`UserMemberCard`、`OrderStatusLog`、`MemberCardRecord` 和 `AdminAuditLog`。按实现核对结果决定是否增加：

- 业务记录 `version Int @default(1)`，用于乐观锁。
- 管理员操作幂等表或现有审计表上的唯一 `idempotencyKey`。
- 软删除字段和删除原因字段；若现有模型已有 `deletedAt` 则直接复用。
- 权益卡撤销状态/完成原因枚举，明确区分 `completed`、`revoked`、`refunded`。

迁移原则：

1. 不回写、不重算历史订单金额、积分、权益余额和流水。
2. 历史记录的 `version` 初始化为 `1`。
3. 新权限先加入超级管理员和指定角色，旧权限兼容一个版本后移除。
4. 旧订单删除接口先加保护，再迁移前端，最后废弃。
5. 所有数据库迁移先执行本地审计脚本，暂不连接云数据库。

## 9. 预计修改范围

| 位置 | 主要修改 |
| --- | --- |
| `server/src/admin-auth/admin-permissions.ts` | 新增三类用户业务写权限和角色默认映射 |
| `server/src/orders/orders.controller.ts` | 增加用户订单/预约语义接口及权限装饰器，限制旧删除接口 |
| `server/src/orders/orders.service.ts` | 拆分普通编辑与专用动作，增加状态、关联事实、幂等、版本和删除保护 |
| `server/src/orders/dto/*` | 新增创建、改期、取消、删除草稿等白名单 DTO |
| `server/src/admin-business/admin-business.controller.ts` | 拆分用户权益卡权限并增加延期、撤销、草稿删除接口 |
| `server/src/admin-business/admin-business.service.ts` | 增加用户权益卡状态规则、关联检查、流水和审计 |
| `server/src/member-cards/*` | 复用发卡、冻结、释放、退款撤销等领域服务，避免控制器直接写资产 |
| `server/prisma/schema.prisma` | 按需要增加版本、幂等和撤销字段 |
| `server/prisma/migrations/<day56_admin_user_commerce_crud>/` | 本地迁移与历史兼容回填 |
| `admin/src/api/life/index.ts`、`types.ts` | 新增三类写 API、DTO、`allowedActions` 和版本字段 |
| `admin/src/views/life/users/commerce-list.vue` | 补齐用户订单/预约创建和行级操作 |
| `admin/src/views/life/users/overview.vue` | 增加当前用户快捷创建入口 |
| `admin/src/views/life/resource/index.vue` | 补齐用户权益卡发放、延期、撤销及权限控制；必要时拆成专页 |
| `admin/src/views/life/orders/index.vue`、`detail.vue` | 复用订单编辑组件并统一状态动作 |
| `admin/src/router/life-admin-routes.ts` | 为三类页面声明访问权限元数据 |
| `server/scripts/day56-admin-user-commerce-crud-smoke.ts` | 新增权限、状态、审计、幂等和删除保护烟测 |

若 `resource/index.vue` 的用户权益卡分支继续增长，应在 Day56 将其拆为 `admin/src/views/life/users/member-cards.vue`；不继续向通用资源页堆叠资产领域逻辑。

## 10. 实施顺序

1. 编写只读审计脚本，统计订单、预约、权益卡状态及关联支付、退款、积分、冻结、核销数据，确认历史异常。
2. 新增权限码与角色映射，先让超级管理员具备全部新权限，运营只获得低风险操作。
3. 增加 DTO、`allowedActions` 计算器、乐观锁、幂等和删除保护；先限制旧危险删除接口。
4. 完成用户订单创建、受控编辑、取消和草稿删除服务，复用既有支付、退款、积分逻辑。
5. 完成预约改期、改地址、派单、取消和草稿删除，接入预约锁与通知。
6. 完成权益卡发放、调整、延期、暂停/恢复、撤销和草稿删除，保证流水和来源订单一致。
7. 在用户订单、服务预约、用户权益卡及用户详情页接入按钮权限和状态能力。
8. 执行单元、集成、权限矩阵、并发、烟测和 Admin 构建；修复后补充 Day56 实施记录。
9. 只在本地数据库应用迁移和测试，不连接、不迁移、不部署云服务器。

## 11. 测试矩阵

### 11.1 权限测试

| 用例 | 预期 |
| --- | --- |
| 超级管理员创建订单、预约、发卡 | 成功，且写入审计 |
| 运营管理员改期、改地址、派单 | 在状态允许时成功 |
| 运营管理员删除已支付订单 | `403` 或权限通过后仍由业务规则返回 `409`，数据不变 |
| 财务管理员修改预约时间 | `403` |
| 客服/无写权限管理员调用写接口 | `403`，不能依赖页面隐藏 |
| 操作员手工构造越权请求 | 服务端拒绝并保留业务数据 |

### 11.2 订单与预约测试

| 用例 | 预期 |
| --- | --- |
| 为指定用户创建待支付预约 | 订单、预约、地址快照和状态日志一致 |
| 重复提交相同幂等键 | 只创建一笔订单/预约 |
| 两名管理员同时改期 | 一人成功，另一人收到 `409` 版本冲突 |
| 待支付无关联事实订单删除 | 软删除成功，审计原因完整 |
| 已支付/已发积分/已冻结权益订单删除 | 被阻止，不删除任何关联数据 |
| 已派单预约改期 | 校验师傅冲突并发送变更通知 |
| 服务中预约普通改期 | 被阻止；只有异常纠错专用动作可处理 |
| 取消会员卡抵扣预约 | 冻结权益正确释放且不重复释放 |

### 11.3 用户权益卡测试

| 用例 | 预期 |
| --- | --- |
| Admin 从用户详情发放免费权益卡 | 用户、模板版本、余额、来源、发放流水和审计一致 |
| 重复发卡请求 | 幂等返回同一结果，不重复发卡 |
| 增加/扣减/目标余额调整 | 余额与调整流水前后值一致 |
| 调整后余额小于冻结值 | `409`，余额和流水均不变化 |
| 有冻结预约的权益卡撤销 | 被阻止并返回关联预约原因 |
| 付费权益卡直接撤销 | 被阻止，提示先走来源订单退款 |
| 已核销权益卡物理删除 | 被阻止，历史流水完整保留 |
| 延期、暂停、恢复 | 状态、有效期、流水和审计一致 |

### 11.4 回归与构建

```text
Prisma validate / migration deploy / migration status
Server unit tests / integration tests / build
Admin type-check / production build
Day48-Day55 订单、地址、权益卡、积分和拉新关键烟测
Day56 Admin CRUD 与权限烟测
```

特别回归 Day55：后台取消、退款或权益撤销不能造成消费积分和拉新积分重复发放、漏冲正或重复冲正。

## 12. 验收标准

1. 超级管理员可从用户详情、用户订单、用户服务预约和用户权益卡页面完成对应的新增与受控操作，不需要跳到无用户上下文的通用页面。
2. 运营、财务及只读角色看到的按钮和服务端权限一致，直接调用越权接口仍返回 `403`。
3. 订单创建使用独立 `user-order:create`，不再复用 `order:update`；用户权益资产不再复用卡模板权限。
4. 待支付且无业务事实的草稿可以按权限删除；任何已支付、已退款、已履约、已发积分、已发/核销权益记录都不能被级联硬删除。
5. 预约改期、地址修改和派单遵守营业时间、预约锁、地址版本和人员冲突规则。
6. 用户权益卡的发放、调整、延期、暂停、恢复、撤销均有资产流水和 Admin 审计，余额永远不低于冻结余额。
7. 所有高风险操作要求原因，创建/取消/撤销/调整支持幂等，并发修改可检测冲突。
8. 订单、预约和权益卡详情能返回统一的 `allowedActions`，前端按钮与后端最终校验一致。
9. Server、Admin、Prisma 和 Day56 烟测全部通过，Day48-Day55 关键链路无回归。
10. 本次只完成本地代码、迁移和测试，不部署云服务器。

## 13. 明确不做

1. 不给 Admin 提供绕过状态机、支付、退款、积分和权益账本的万能编辑接口。
2. 不允许物理删除已支付订单、已履约预约、已核销/已退款权益卡及其流水。
3. 不直接修改支付成功记录、退款成功记录、积分账本或权益核销历史。
4. 不把订单、预约和权益卡合并成一个通用 CRUD 配置页。
5. 不在 Day56 重做完整组织架构或多租户权限系统；权限码保持可扩展，为后续自定义角色预留。
6. 不连接、迁移或部署云服务器与云数据库。

## 14. 实施记录（2026-07-28）

### 14.1 已完成

1. 新增 `user-order:*`、`user-booking:*`、`user-member-card:*` 三组权限码，并更新超级管理员、运营管理员和财务管理员权限快照。财务管理员获得用户业务只读权限，不获得预约和权益资产写权限。
2. 后台服务预约创建继续复用成熟的 `/api/admin/orders` 创建链路，但使用 `user-booking:create`；新增预约语义接口：

   ```text
   POST   /api/admin/user-service-bookings/:id/reschedule
   POST   /api/admin/user-service-bookings/:id/cancel
   DELETE /api/admin/user-service-bookings/:id/draft
   ```

3. 订单普通更新要求 `expectedVersion`；取消和草稿删除要求 `version + reason`。改期同步更新 `Order` 和 `ServiceBookingOrder`，版本不一致返回 `409`。
4. 新增 Admin 取消动作：未支付预约取消并释放优惠券/冻结权益；已支付现金预约进入退款待处理；会员卡购买订单仍必须走来源订单退款流程。
5. 废弃原有订单危险级联删除语义。删除在事务内锁定订单并重新校验版本、支付、退款、派单、签到、服务照片、评价、售后、师傅收益、积分、权益和文件事实；只允许删除无业务事实的待支付草稿。
6. 用户权益卡新增延期、暂停、恢复、撤销和草稿删除接口。延期、调整、状态变化和撤销均写权益流水及 Admin 审计；付费/线下卡、有冻结/核销/调整事实的卡禁止直接撤销或删除。
7. 订单、预约和用户权益卡返回 `allowedActions`。权益卡能力计算读取实际流水类型，避免调整过的卡错误显示“可撤销”。
8. Admin 用户订单、用户服务预约、订单列表、订单详情、用户业务总览和用户权益卡页面已接入创建、编辑/改期、取消、删除草稿、发卡、调整、延期、暂停/恢复及撤销入口，并同时校验权限码和 `allowedActions`。
9. 发卡模板改为可搜索下拉框；从用户详情进入时自动携带用户上下文。所有取消、删除、撤销、延期和暂停/恢复操作要求填写原因。

### 14.2 数据与兼容决定

- 本轮不新增 Prisma 迁移。订单已有 `version`，权益卡已有状态、完成原因、权益流水和审计表，现有模型足以承载本轮状态保护。
- 安全草稿仍执行物理删除，但仅限无任何财务、履约、积分和权益事实的待支付订单，或无使用事实的后台免费待激活权益卡。其余记录只能取消、退款、撤销或追加冲正流水。
- Admin 路由框架当前只支持角色元数据，不支持权限码级菜单过滤。本轮在页面按钮使用 `hasPerm`，后端接口使用权限守卫作为最终边界；后续若增加自定义角色菜单，需要先扩展路由权限过滤器。
- 请求级 `idempotencyKey` 尚无唯一约束和持久化表。本轮取消/撤销依靠状态机实现结果幂等，订单创建和余额调整尚不提供跨请求强幂等保证；上线前应通过独立迁移补充管理员操作幂等记录，不能只依赖前端防重复提交。

### 14.3 本地验证结果

以下命令于 2026-07-28 在本地 MySQL 和本地构建服务执行通过：

```text
server: npx prisma validate
server: npx prisma migrate status
server: npm run build
server: npm run day55:points-referral-smoke
server: npm run day56:admin-user-commerce-crud-smoke
admin:  npm run type-check
admin:  npm run build
```

Day56 烟测覆盖：权限快照、财务写接口 `403`、预约创建和改期同步、版本冲突、未支付取消、安全草稿删除、支付事实删除保护、免费发卡、延期、余额调整、暂停/恢复、免费卡撤销、付费卡撤销拒绝、调整后卡删除拒绝、权益流水和 Admin 审计。

本次只修改并验证本地代码和本地数据库测试数据，没有连接、迁移或部署任何云服务器或云数据库。
