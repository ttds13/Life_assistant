# Day49 两类订单、会员卡权益与 Admin 信息架构重构计划

更新时间：2026-07-14（已补充会员卡激活、分钟核销与人工调整规则）
前置依赖：Day48 已完成订单地址强关联、订单地址历史与三端统一 `OrderAddress`。Day49 必须保留这些能力，不回退到地址 JSON。
目标模块：订单领域、会员卡权益、核销、师傅任务与收益、用户中心、Admin 侧边栏与查询模型。
本计划性质：重构设计与实施蓝图；2026-07-15 已完成实现、本地验收、生产数据库迁移及后端/Admin 发布，Day48 订单地址模型保持不变。

> 本次确认补充：会员卡模板版本必须配置激活截止天数和激活后有效天数；服务与会员卡权益统一按整数分钟核销；Admin 仅可调整分钟数、暂停/恢复或完成卡并填写原因，全部操作写入账本和审计。

## 1. 最终设计结论

用户端存在两种订单，但两种订单不能用同一套履约语义解释：

1. **服务预约订单**：用户购买一次服务或使用权益预约一次服务。它有服务地址、预约时间、师傅、履约状态和师傅收益，是师傅真正执行的任务。
2. **会员卡购买订单**：用户购买一份会员卡权益的支付凭证。它没有师傅、没有服务地址、没有预约时间，不进入师傅任务队列。支付成功后只发放或补发一张用户会员卡。

用户可多次使用的不是购买订单，而是 `UserMemberCard`。每一次用卡都会创建一个新的服务预约订单，并为该订单创建唯一的核销关系。

```text
会员卡模板
-> 会员卡购买订单
-> 用户会员卡（未激活 / 激活中 / 激活完成）
-> 第一次服务预约并冻结权益（激活）
-> 师傅履约
-> 核销/释放
-> 下一次服务预约
```

### 1.1 统一购买入口，区分支付、任务和权益

服务预约和会员卡都可以共用“创建交易订单 -> 支付 -> 支付回调 -> 退款”的购买能力，但支付成功后的领域结果必须严格分开：

```text
购买服务预约
-> 支付成功
-> 立即形成可派单的 ServiceBookingOrder（服务、地址、预约时间）
-> 仅该服务预约任务发送给师傅
-> 师傅履约完成
-> 确认订单完成与师傅收益；不再次扣用户已支付的现金

购买会员卡
-> 支付成功
-> 发放 UserMemberCard.pending_activation
-> 不创建服务预约任务，不发送给师傅

使用会员卡预约服务
-> 创建新的 ServiceBookingOrder（服务、地址、预约时间）
-> 按已售卡的规则冻结权益，首次冻结同时激活卡
-> 仅该服务预约任务发送给师傅
-> 师傅履约完成后，按实际服务量最终核销或在取消时释放冻结权益
```

“核销”不是创建师傅任务的前置结果，而是服务预约创建时的**预留/冻结**和师傅履约完成后的**最终扣减**两个阶段。会员卡购买订单的金额在购买时支付；履约后扣除的是 `UserMemberCard` 的权益余额，而不是再次扣会员卡购买订单。现金服务预约订单同样在支付时完成收款，履约后只处理服务完成、师傅收益结算以及异常退款/售后。

Day49 采用“公共订单主表 + 订单类型扩展表 + 用户权益卡 + 单次核销表”的结构，禁止继续复用 `orders.member_card_id` 表达模板卡、用户卡和购买来源等不同语义。

## 2. 两类订单的用户视图

### 2.1 服务预约订单

服务预约订单必须展示以下字段：

| 字段 | 说明 |
| --- | --- |
| 订单号 | 统一订单号，用户、师傅、Admin 使用同一个值 |
| 订单类型 | `service_booking` 或 `consultation` |
| 订单状态 | 支付、派单、接单、出发、服务中、待确认、完成、取消、退款等履约状态 |
| 服务/商品 | 服务项目与下单时服务快照 |
| 用户 | 下单用户与联系人信息 |
| 师傅 | 当前被分配的师傅；未派单时为空 |
| 预约时间 | `appointmentStartAt`、`appointmentEndAt` |
| 下单时间 | `createdAt` |
| 完成时间 | `completedAt` |
| 服务地址 | Day48 `OrderAddress`，仅该订单的当前履约地址 |
| 实付金额 | 本次服务订单实际支付金额，可为现金、优惠券抵扣或会员卡权益抵扣后的金额 |
| 来源 | 小程序、Admin 线下录入、活动等 |
| 核销摘要 | 若使用会员卡，展示用户卡、计划冻结、实际核销、释放额度和核销状态 |
| 师傅收益 | 仅对有师傅的服务预约订单展示收益、结算和提现状态 |

业务闭环：

```text
用户选择服务 + 地址 + 时间
-> 创建服务预约订单
-> 现金/优惠券支付或会员卡冻结
-> 待派单
-> Admin 派单
-> 师傅接单、出发、到场、服务、完工
-> 核销权益 / 结算师傅收入
-> 用户确认或系统确认
```

### 2.2 会员卡购买订单和用户权益卡

会员卡购买订单需要保留支付和发卡信息：

| 字段 | 说明 |
| --- | --- |
| 订单号 | 购买交易凭证号 |
| 订单类型 | 固定 `member_card_purchase` |
| 订单状态 | 仅支付/退款交易状态，不使用派单或履约状态 |
| 服务/商品 | 会员卡模板、模板版本和购买时权益快照 |
| 用户 | 购买用户 |
| 用户卡 ID | 支付完成后发放的 `UserMemberCard.id` |
| 下单时间 / 支付时间 / 完成时间 | 购买交易时间线 |
| 实付金额 | 本次购买实际支付金额 |
| 来源 | 小程序、Admin 线下售卡、活动赠送等 |

“当前剩余、已冻结、可用余额、激活状态、有效期”属于 `UserMemberCard`，不应作为购买订单的可变字段复制保存。购买订单详情可以联表展示它们，但必须注明是“发放后的权益卡当前状态”。

## 3. 会员卡三态与有效期

### 3.1 面向用户的三种主状态

| 用户显示 | 系统代码 | 进入条件 | 允许操作 |
| --- | --- | --- |
| 未激活 | `pending_activation` | 购买支付成功或后台发放，尚未成功冻结过任何服务预约 | 查看权益、去预约、按规则退款 |
| 激活中 | `active` | 首次服务预约创建成功且该次权益冻结成功 | 继续预约、查看剩余权益和有效期 |
| 激活完成 | `completed` | 用完、到期、退款撤销或后台终止 | 查看历史，不可创建新的权益预约 |

`completedReason` 必须单独保存：`used_up`、`expired`、`refunded`、`disabled`。不要继续把这些原因作为并列主状态，让用户和运营人员自行猜测“卡为什么不可用”。

### 3.2 推荐激活规则

会员卡有效期从**首次成功创建服务预约并冻结权益**开始计算：

```text
购买完成
-> UserMemberCard.pending_activation
-> 用户首次预约
-> 创建服务预约订单 + OrderRedemption.reserved + 冻结权益
-> activatedAt = 当前时间
-> expireAt = activatedAt + validityDays
-> UserMemberCard.active
```

这满足“季卡/分钟卡在模板定义的激活后有效期内使用”的业务表达，避免购买后尚未使用就开始损失有效期。

会员卡模板的每个**已发布版本**必须固化以下时效规则；Admin 后续修改会生成新版本，只影响新售卡，不能追溯改变已发卡的截止时间和有效期：

| 模板规则 | 含义 | 生效时点 | Admin 可选项 |
| --- | --- | --- | --- |
| `activationDeadlineDays` | 购买后必须完成首次预约并冻结权益的天数 | 发卡时计算 `activationDeadlineAt = issuedAt + activationDeadlineDays` | 7、15、30、60、90 天或自定义正整数天数 |
| `validityDays` | 激活后的权益有效天数 | 首次冻结时计算 `expireAt = activatedAt + validityDays` | 30、90、180、365、730 天或自定义正整数天数 |

用户卡详情必须同时展示“请在某日之前激活”或“已于某日激活、将在某日到期”。`pending_activation` 卡到达 `activationDeadlineAt` 后，服务端定时任务将其变为 `completed + expired`，账本记录 `completed` 事件和 `activation_deadline_expired` 原因；该卡不能再创建预约或激活。

### 3.3 激活截止与到期规则

1. 发卡时必须计算并持久化 `activationDeadlineAt`；到达该时间仍为 `pending_activation` 时，禁止新建核销预约并完成该卡。
2. 激活后到达 `expireAt` 时禁止新建核销预约。
3. 到期前已冻结并已经生成服务预约订单的权益允许完成或取消结算。
4. 完成时按已冻结分钟数核销；取消时释放冻结分钟数。
5. 没有未结算冻结核销后，将用户卡更新为 `completed + expired`，写入不可变账本。
6. 激活截止和到期任务必须由服务端定时任务执行，不能只在用户查询卡包时临时隐藏。

## 4. 三端职责边界

### 4.1 用户端

用户端展示的是“我的权益”和“我的服务预约”：

```text
卡包
├─ 未激活：权益总分钟数、激活截止日、剩余激活天数、去预约
├─ 激活中：可用/已冻结/已核销分钟数、激活日、到期日、剩余天数、预约记录
└─ 激活完成：完成原因、完成时间、历史核销记录

订单
├─ 服务预约：地址、时间、师傅、履约状态、服务结果、核销摘要
└─ 会员卡购买：支付状态、模板快照、发放用户卡入口
```

用户不需要从购买订单里理解师傅和地址，也不需要从服务订单里推断整张卡的生命周期。

### 4.2 师傅端

师傅端只展示服务预约任务，完全不展示会员卡购买订单：

```text
任务订单
├─ 用户和联系人
├─ 服务项目、预约时间、服务要求
├─ Day48 用户指定服务地址与导航
├─ 本单计划核销 / 实际核销 / 释放额度
└─ 本单师傅收益、结算状态
```

师傅只确认本单需要服务什么、服务多久、到哪里服务、最终核销多少；不查看用户的其他会员卡、剩余总资产、购买金额或营销优惠。

### 4.3 Admin 端

Admin 需要能从任意入口追溯完整链路：

```text
会员卡购买订单
-> 用户会员卡
-> 服务预约订单
-> 核销记录
-> 师傅任务
-> 师傅收益与结算
```

用户详情必须包含：服务预约、购买订单、用户会员卡、权益时间线。师傅详情必须包含：当前任务、历史履约、每单核销摘要、每单收益与结算状态。

## 5. Admin 侧边栏重构

当前“订单管理”同时放服务订单和会员卡购买订单，“营销管理”同时放模板、用户卡和流水，“师傅管理”又没有直接的任务/核销/收益视图。目标侧边栏按运营任务重组如下。

```text
工作台

用户中心
├─ 用户列表
├─ 用户详情（订单 / 权益卡 / 地址 / 售后）
└─ 用户地址

服务与商品
├─ 服务分类
└─ 服务项目

服务履约
├─ 服务预约订单
├─ 待派单
├─ 履约监控
├─ 服务异常与售后
└─ 订单地址变更记录

会员权益
├─ 会员卡模板与版本
├─ 会员卡购买订单
├─ 用户权益卡
├─ 权益核销记录
└─ 优惠券与活动

师傅运营
├─ 师傅档案与认证
├─ 师傅任务订单
├─ 师傅收益与结算
├─ 提现管理
└─ 师傅通知与资料变更

财务中心
├─ 收款与支付
├─ 退款
└─ 财务统计

内容与系统
├─ 图片、轮播、推广链接
├─ 客服与反馈
└─ 管理员、角色、权限
```

### 5.1 原菜单到目标菜单映射

| 当前入口 | 目标入口 | 调整原因 |
| --- | --- | --- |
| 订单管理 / 服务预约订单 | 服务履约 / 服务预约订单 | 这是唯一需要师傅和地址的订单类型 |
| 订单管理 / 会员卡购买订单 | 会员权益 / 会员卡购买订单 | 购买、发卡、退款是权益运营，不是履约派单 |
| 订单管理 / 待派单 | 服务履约 / 待派单 | 只包含服务预约订单 |
| 订单管理 / 履约记录 | 服务履约 / 履约监控 | 与派单、地址、师傅任务同域 |
| 营销管理 / 会员卡模板 | 会员权益 / 会员卡模板与版本 | 模板规则是权益商品配置 |
| 营销管理 / 用户会员卡 | 会员权益 / 用户权益卡 | 展示三态、到期、余额、来源和关联订单 |
| 营销管理 / 会员卡流水 | 会员权益 / 权益核销记录 | 聚合发放、激活、冻结、核销、释放、完成 |
| 师傅管理 / 师傅列表 | 师傅运营 / 师傅档案与认证 | 保留 |
| 无独立入口 | 师傅运营 / 师傅任务订单 | 只读服务预约、地址、核销和收益 |
| 无独立入口 | 师傅运营 / 师傅收益与结算 | 从 `StaffIncomeRecord` 反查服务订单和核销摘要 |

### 5.2 Admin 关键列表字段

| 列表 | 必须字段 |
| --- | --- |
| 服务预约订单 | 订单号、状态、服务、用户、师傅、预约时间、地址摘要、支付/核销方式、实付、来源、收益状态 |
| 会员卡购买订单 | 订单号、支付状态、模板/版本、用户、实付、发放用户卡、购买时间、来源、退款状态 |
| 用户权益卡 | 用户、卡模板/版本、三态、完成原因、激活日、到期日、剩余/冻结/可用、来源购买订单、最近一次核销 |
| 权益核销记录 | 核销号、服务订单、用户卡、用户、师傅、服务、冻结/实际/释放、状态、操作人、时间 |
| 师傅任务订单 | 师傅、服务订单、用户、地址、预约时间、履约状态、本单核销、收益、结算/提现状态 |

## 6. 目标数据库模型

### 6.1 公共订单主表 `orders`

`orders` 仅保存两类订单的共同交易字段：

```text
id / order_no / order_type / status / version
user_id
original_amount / discount_amount / payable_amount / paid_amount
source / remark / admin_remark
created_at / paid_at / completed_at / cancelled_at / updated_at
```

目标约束：

1. `order_type=service_booking` 只能由服务预约扩展表承载服务和履约字段。
2. `order_type=member_card_purchase` 只能由会员卡购买扩展表承载模板和发卡字段。
3. 不再把 `serviceId`、`staffId`、`appointment*`、`memberCardId` 作为所有订单的公共语义字段。
4. Day48 `OrderAddress` 保持与服务预约订单一对一；购买订单不得拥有 `OrderAddress`。

### 6.2 服务预约扩展表 `service_booking_orders`

```prisma
model ServiceBookingOrder {
  orderId              BigInt   @id @map("order_id")
  serviceId            BigInt   @map("service_id")
  serviceSnapshot      Json     @map("service_snapshot")
  staffId              BigInt?  @map("staff_id")
  appointmentStartAt   DateTime @map("appointment_start_at")
  appointmentEndAt     DateTime @map("appointment_end_at")
  fulfilledAt          DateTime? @map("fulfilled_at")

  order   Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  service Service @relation(fields: [serviceId], references: [id])
  staff   Staff?  @relation(fields: [staffId], references: [id])
  redemption OrderRedemption?

  @@index([staffId, appointmentStartAt])
  @@index([serviceId, appointmentStartAt])
  @@map("service_booking_orders")
}
```

每个 `service_booking_orders` 必须关联 Day48 `OrderAddress`、可选 `OrderAssignment`、可选 `OrderRedemption` 和服务完成后的 `StaffIncomeRecord`。

### 6.3 会员卡购买扩展表 `member_card_purchase_orders`

```prisma
model MemberCardPurchaseOrder {
  orderId                  BigInt   @id @map("order_id")
  memberCardPlanId         BigInt   @map("member_card_plan_id")
  memberCardPlanVersion    Int      @map("member_card_plan_version")
  planSnapshot             Json     @map("plan_snapshot")
  grantedUserMemberCardId  BigInt?  @unique @map("granted_user_member_card_id")
  grantedAt                DateTime? @map("granted_at")

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
  plan  MemberCard @relation(fields: [memberCardPlanId], references: [id])
  userCard UserMemberCard? @relation(fields: [grantedUserMemberCardId], references: [id])

  @@index([memberCardPlanId])
  @@map("member_card_purchase_orders")
}
```

该表没有 `staffId`、`appointment*`、`OrderAddress`、师傅收入和履约状态。

会员卡模板及其版本由 Admin 在“会员卡模板与版本”中管理。模板版本至少包含以下不可变快照规则：

```text
totalMinutes                 // 总权益分钟数
activationDeadlineDays       // 购买后必须激活的天数
validityDays                 // 激活后的有效天数
redemptionRules[]            // 按服务项目配置的核销分钟规则
```

`redemptionRules[]` 的账本单位统一为**整数分钟**，不在数据库中存储浮点的“0.5 次”。每个服务项目可配置 `fixed_minutes`（固定扣 30/60/90 分钟等）、`half_service`（按该服务标准时长的 50% 换算为分钟）或 `custom_minutes`（Admin 配置允许的分钟档位和最小扣减分钟数）。规则至少包含 `consumeMinutes`、`minConsumeMinutes` 与允许的分钟档位；半次核销只是面向运营的展示标签，最终仍记为例如 30 分钟的冻结和核销。

### 6.4 用户权益卡 `user_member_cards`

用户卡权益统一以分钟计量，新增或规范以下字段：

```text
id / user_id / member_card_plan_id / purchase_order_id
plan_version / plan_snapshot
status: pending_activation | active | completed
completed_reason: used_up | expired | refunded | disabled | null
issued_at / activation_deadline_at / activated_at / expire_at / completed_at
total_minutes / remaining_minutes / frozen_minutes
availability_state: available | suspended
suspended_at / suspended_reason
source / created_at / updated_at
```

约束：

1. `remaining_minutes >= frozen_minutes >= 0`，全部为整数分钟。
2. `pending_activation` 时 `activation_deadline_at` 非空，`activated_at` 和 `expire_at` 为空。
3. `active` 时 `activated_at` 与 `expire_at` 非空。
4. `completed` 时 `completed_at` 与 `completed_reason` 非空，禁止新建核销。
5. `suspended` 是独立于三态生命周期的可用性标记；暂停时禁止新建预约，但不伪造为已过期或已用完。
6. 已售卡只读取 `plan_snapshot` 和 `plan_version` 解释权益；模板后续修改仅影响新购买。

### 6.5 单次核销表 `order_redemptions`

```prisma
model OrderRedemption {
  id                   BigInt   @id @default(autoincrement())
  orderId              BigInt   @unique @map("order_id")
  userMemberCardId     BigInt   @map("user_member_card_id")
  state                String   @db.VarChar(16) // reserved | consumed | released
  reservedMinutes      Int      @map("reserved_minutes")
  consumedMinutes      Int      @default(0) @map("consumed_minutes")
  releasedMinutes      Int      @default(0) @map("released_minutes")
  actualServiceMinutes Int?     @map("actual_service_minutes")
  ruleSnapshot         Json     @map("rule_snapshot")
  activatedCard        Boolean  @default(false) @map("activated_card")
  reservedAt           DateTime @default(now()) @map("reserved_at")
  settledAt            DateTime? @map("settled_at")

  order    ServiceBookingOrder @relation(fields: [orderId], references: [orderId], onDelete: Cascade)
  userCard UserMemberCard      @relation(fields: [userMemberCardId], references: [id])

  @@index([userMemberCardId, state])
  @@map("order_redemptions")
}
```

一张服务预约订单最多核销一张用户卡；一个核销表记录一次冻结到结算的完整事实，取代通过订单字段和多条流水反向猜测本单权益状态。

### 6.6 权益账本 `member_card_ledgers`

现有 `member_card_records` 演进为不可变账本，至少新增：

```text
redemption_id
event_type: issued | activated | reserved | consumed | released | completed | refunded | admin_adjust | suspended | resumed
before_remaining_minutes / after_remaining_minutes
before_frozen_minutes / after_frozen_minutes
order_id / operator_type / operator_id / reason / created_at
```

账本是用户卡余额、激活和完成原因的唯一审计来源；Admin 调整权益只能通过账本服务写入，禁止直接改余额字段。

### 6.7 师傅收益 `staff_income_records`

保留现有 `staff_income_records(order_id, staff_id, amount, settlement_status, withdraw_status)`，但其 `order_id` 必须只指向 `service_booking`。Admin 师傅任务视图通过：

```text
StaffIncomeRecord
-> ServiceBookingOrder
-> OrderAddress / OrderRedemption
-> UserMemberCard / 服务快照
```

展示收益与核销关系，但会员卡购买金额不计入师傅收益。

## 7. 两类订单状态边界

| 类型 | 允许状态 | 禁止状态 |
| --- | --- | --- |
| 服务预约订单 | 待支付、待派单、已派单、已接单、出发、服务中、待确认、完成、取消、退款/售后 | 仅购买发卡语义 |
| 会员卡购买订单 | 待支付、支付成功/完成、取消、退款/售后 | 派单、接单、出发、服务中、地址修改、师傅收入 |
| 用户会员卡 | 未激活、激活中、激活完成 | 不能代替订单支付或履约状态 |
| 单次核销 | 预留、已核销、已释放 | 不能代替服务订单状态 |

订单状态、用户卡生命周期、核销状态是三套正交状态机。任何页面不得用其中一套状态推断另外两套。

## 8. 关键业务流程

### 8.1 现金服务预约

```text
用户选服务、地址、时间
-> ServiceBookingOrder + OrderAddress
-> 创建待支付服务预约订单
-> 支付成功
-> 订单进入待派单；该订单成为唯一可发送给师傅的服务任务
-> Admin 派单 / 师傅履约
-> 确认服务完成并生成/确认 StaffIncomeRecord
-> 服务预约订单完成
```

实付金额在支付成功时已收取。履约完成不得再次扣款；仅在取消、拒单、售后等异常路径中按原支付记录退款或调整。

### 8.2 会员卡购买

```text
用户选会员卡模板
-> MemberCardPurchaseOrder
-> 支付完成
-> UserMemberCard.pending_activation
-> issued 账本
-> 购买订单完成
```

此流程没有 `OrderAddress`、预约时间、师傅、派单、履约或师傅收益；它只产生支付凭证和一张待激活的用户权益卡。

### 8.3 会员卡首次使用

```text
用户从未激活卡选择适用服务、地址、时间
-> 创建 ServiceBookingOrder + OrderAddress
-> 创建 OrderRedemption.reserved
-> 按用户卡的已售版本规则计算并冻结分钟数
-> 写 activated 账本、activatedAt、expireAt
-> 用户卡变 active
-> 服务预约订单进入待派单；仅该订单发送给师傅
-> 师傅履约完成后写 consumed 账本，或取消时写 released 账本
```

这里创建的服务预约订单是师傅执行的任务；`OrderRedemption.reserved` 只是为该任务预留权益，不能被当作“已经服务完成”或“已经最终扣卡”。

### 8.4 师傅完成服务

```text
师傅确认服务内容、地址、实际服务时长
-> 完成 ServiceBookingOrder
-> 按用户卡计划快照中的服务项目、时长和核销规则计算实际服务分钟数
-> OrderRedemption: reserved -> consumed；取消或未履约时 reserved -> released
-> 更新用户卡余额与状态
-> 若余额为 0：UserMemberCard.completed + used_up
-> 生成/确认 StaffIncomeRecord
```

师傅只能确认本单的计划核销和实际服务分钟数。实际核销偏离预留分钟数时，必须由 Admin 配置的核销规则决定是否允许、如何补扣/释放以及是否需要人工审核；所有变更写入 `OrderRedemption` 和不可变权益账本。师傅不查看用户的其他会员卡、购买价格或总权益余额。

## 9. 数据迁移与切换策略

Day49 不直接删除 Day48 表。先扩展、回填、核对、切换读写，再删除 Day49 已废弃的旧字段。

### 阶段 A：迁移前审计

1. 审计所有 `member_card_purchase` 订单、`granted_user_member_card_id`、`purchase_card_id`。
2. 审计服务预约订单的 `member_card_id`、冻结/核销/释放流水是否能唯一对应用户卡。
3. 审计是否存在一个服务订单对应多个用户卡或无来源卡的异常记录。
4. 输出异常清单；异常数据不得静默猜测或覆盖。

### 阶段 B：扩展和回填

1. 创建订单类型扩展表、`order_redemptions`、分钟制账本字段、激活截止字段、用户卡生命周期字段与独立暂停字段。
2. 用购买订单回填 `MemberCardPurchaseOrder` 和用户卡购买来源。
3. 对已有服务订单，用冻结流水/订单规则快照回填 `OrderRedemption`。
4. 回填规则：已有 `freeze/consume/release` 的卡按最早冻结时间设为 `active`；无使用流水的已售卡设为 `pending_activation`；历史用完/退款/禁用/到期卡设为 `completed` 并写完成原因。
5. 对未激活存量卡，以购买/发卡时间和其计划快照回填 `activation_deadline_at`；无法确定模板时效规则的卡进入人工处理清单，不得猜测截止日或自动过期。
6. 现有权益数值迁移为分钟字段前，审计每种旧卡模板的单位和换算规则；确认均为分钟后才写入 `total_minutes`、`remaining_minutes` 和 `frozen_minutes`。
7. 对无法确定激活时点的存量卡记录 `activationSource=migration`，保留原始创建和到期信息供人工复核。

### 阶段 C：切换写入

1. 购买支付只写购买扩展、用户权益卡和账本。
2. 服务预约用卡只写 `OrderRedemption`，不再写入复用的 `orders.member_card_id`。
3. 师傅完成和订单取消只通过核销服务结算权益。
4. 到期任务只处理权益卡和未结算核销，不直接修改服务订单履约状态。

### 阶段 D：切换读取和清理

1. 用户、师傅、Admin 改为读取目标查询模型。
2. 对账服务订单、购买订单、用户卡、账本、师傅收益的数量和金额。
3. 通过审计后再删除 `orders.member_card_id`、`purchase_card_id`、`granted_user_member_card_id` 等被新模型替代的复用字段和兼容代码。

## 10. 验收标准

1. 用户能分别查看服务预约订单、会员卡购买订单和全部用户权益卡。
2. 用户卡严格展示未激活、激活中、激活完成及完成原因、剩余权益和有效期。
3. 未激活用户卡展示模板版本定义的激活截止日；截止后服务端自动完成该卡并拒绝激活。
4. 首次成功冻结才按模板版本的 `validityDays` 开始计算有效期。
5. 每次服务预约的冻结、实际核销和释放都有唯一 `OrderRedemption` 和不可变账本，所有权益数值均为整数分钟。
6. 半次和自定义核销均按模板版本规则换算为分钟，已售卡不受模板后续修改影响。
7. Admin 对用户卡只能经由受控操作调整分钟数、暂停/恢复或完成并记录原因；全部动作具备账本和审计记录。
8. 师傅只看到服务预约任务：服务内容、地址、时间、本单核销和本单收益。
9. 会员卡购买订单不进入师傅任务、派单、地址和收益查询。
10. Admin 可从用户卡追溯购买订单、每次服务预约、核销、师傅和收益；也可从师傅任务反查用户卡和核销。
11. Admin 编辑模板仅影响新售卡；已售用户卡权益以版本快照为准。
12. 卡到期后不能新预约，已冻结的预约可以安全完成或取消。
13. 订单、权益卡、核销和收益状态在三端使用各自明确的状态机，不再靠字段推断。

## 11. 已确认产品规则与剩余决策

### 11.1 已确认

1. **激活截止时间存在且由模板版本管理**：购买后必须在 `activationDeadlineDays` 内完成首次预约并冻结权益；Admin 使用 7、15、30、60、90 天或自定义天数配置。逾期未激活的卡由服务端自动转为 `completed + expired`。
2. **有效期由模板版本管理且从激活开始计算**：Admin 使用 30、90、180、365、730 天或自定义天数配置 `validityDays`；购买后不直接消耗有效期。
3. **权益统一按分钟核算**：服务和会员卡均以分钟为底层单位。Admin 可在模板版本按服务配置固定分钟、半次服务或自定义分钟档位；“半次”只是一种业务显示，账本和核销表不存浮点次数。
4. **Admin 人工操作受控**：仅允许调整权益分钟数、暂停/恢复卡、完成卡并填写原因。暂停使用独立可用性状态，不改变未激活/激活中/激活完成三态；所有人工操作必须写入不可变账本和审计日志。人工完成默认使用 `disabled`，退款必须走退款流程写入 `refunded`，不得伪造 `used_up` 或 `expired`。

### 11.2 剩余待确认

1. 到期时已预约但未服务的订单是否统一允许结算？本计划建议允许结算、不允许新增预约。

## 12. 实施进度（2026-07-15）

### 12.1 已完成

1. 已新增并回填 `service_booking_orders`、`member_card_purchase_orders`、`member_card_plan_versions`、`order_redemptions`，本地 Day49 迁移状态和迁移后审计均通过。
2. 新建会员卡服务预约只写 `OrderRedemption.user_member_card_id`；新建购卡订单只写 `MemberCardPurchaseOrder` 和 `UserMemberCard.purchaseOrderId`。不再写 `orders.member_card_id`、`purchase_card_id`、`granted_user_member_card_id` 等旧权益列，旧列只保留历史兼容读取。
3. 会员卡购买支付成功后发放 `pending_activation` 用户卡；首次冻结切换为 `active` 并计算有效期；用完、到期、退款和人工停用统一进入 `completed + completedReason`。
4. 已实现激活截止和有效期定时任务，存在未结算冻结时不提前完成卡。
5. 已实现整数分钟冻结、核销、释放和不可变流水；固定、半次及自定义档位均固化在模板版本快照中。
6. 用户端和 Admin 创建会员卡预约时可按已购版本选择自定义分钟档位；师傅只能按该订单规则允许的档位确认实际服务分钟，不能绕过规则手输任意值。
7. Admin 的可用卡查询同时包含未过激活截止日的 `pending_activation` 和未到期的 `active` 卡，因此后台可代用户创建首次预约。
8. Admin 已具备模板版本查看、用户权益卡查询、分钟调整、暂停、恢复、完成和权益流水入口；人工操作同时写权益流水和审计日志。
9. 用户订单页和 Admin 侧边栏均已将服务预约与会员卡购买拆分查询；购卡详情只展示购买、支付、发卡和退款状态，会员卡购买订单不进入师傅任务、派单、订单地址或师傅收益视图。
10. 未使用会员卡购买订单可以发起退款；审核成功后购买订单进入 `refunded`，对应用户卡进入 `completed + refunded` 并写撤卡流水。
11. Day46/Day49 闭环冒烟已覆盖购买发卡、两类订单查询隔离、新购卡与新预约仅写 Day49 关系、未激活卡 Admin 可见、首次冻结激活、自定义 60/120 分钟、履约核销与释放、取消释放、人工调整、退款撤卡、三端余额一致和测试数据清理。

### 12.2 验证命令

```bash
cd server
pnpm build
pnpm day49:order-card-audit -- --phase=post
pnpm day49:order-card-smoke -- --run-id=DAY46_MEMBER_CARD_TIME_BALANCE_TEST_DAY49_20260715

cd ../admin
pnpm build

cd ../miniapp
pnpm type-check
```

### 12.3 生产发布记录

发布时间：2026-07-15 11:25-11:38（Asia/Shanghai）  
服务器：`47.113.201.201`，容器：`life_assistant_server`

1. 停止后端写入后完成生产全库、Day48 后端镜像、Admin 静态目录和生产环境配置备份；备份目录为 `/www/wwwroot/life-assistant/backups/day49-20260715-112011/`，四份备份的 SHA-256 复核均通过。
2. 生产迁移前 7 项审计全部通过，没有会员卡余额、购卡模板来源或服务预约用户卡引用异常。
3. `20260714213000_day49_order_member_card_domain` 已成功应用，生产数据库当前共 24 个迁移且 `prisma migrate status` 为最新。
4. 生产迁移后及最终复核的 17 项审计全部通过；服务预约扩展、购卡扩展、模板版本、用户卡生命周期、核销来源和分钟结算均无异常。
5. 生产闭环冒烟 11 个业务断言全部通过，覆盖购卡发卡、两类订单隔离、首次激活、120 分钟冻结、60 分钟核销与释放、Admin 调整、取消释放和未使用卡退款撤销；测试数据清理后各类记录均为 0。
6. 当前后端镜像 ID 为 `sha256:c980e35cbf863c08f2107bb2957400a60e92d1819c036c0e7e89051263c44317`；旧 Day48 容器以停止状态保留为 `life_assistant_server_before_day49_20260715`。
7. Admin 已切换到 Day49 构建，旧目录保留为 `admin-dist.before-day49-20260715-112011`；公网 Admin 入口文件与本地构建 SHA-256 一致。
8. 发布包目录为 `/www/wwwroot/life-assistant/releases/day49-20260715-112011/`；后端 tar SHA-256 为 `a25a618d21d0e4e67594dd4d1578d44642fb4e3ae9ca25b1983df4d7eeb35788`，Admin tar SHA-256 为 `5ca7f61b4195f794759acbfe0a85a2b975bf1b04303674705d9cd8c389171cc7`。
9. `https://www.xunhaoyou.com/api/health` 与 `https://www.xunhaoyou.com/admin/` 均返回 HTTP 200；地图逆地理编码接口缺少坐标时返回预期 HTTP 400；主容器发布后日志未发现错误级别记录。

### 12.4 剩余验收项

1. 使用微信 Android/iOS 真机完成自动定位、地图选址、导航、授权拒绝后的手动地址兜底、会员卡分钟档位选择和师傅核销确认验收。
2. 使用一笔受控真实交易验证微信支付回调幂等、线上通知和退款渠道；自动化生产冒烟没有调用真实支付渠道。
3. 观察到期定时任务在实际运行周期中的单实例执行与并发锁日志，并核对首批真实会员卡预约的冻结、核销、释放和师傅收益。
4. 经过稳定观察期并完成历史对账后，再单独审批删除 `orders.member_card_id` 等 Day49 兼容列；本次迁移未删除这些列。
