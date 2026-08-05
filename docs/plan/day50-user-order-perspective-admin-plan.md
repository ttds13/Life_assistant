# Day50 用户订单透视与 Admin 用户中心重构计划

更新时间：2026-07-15  
前置依赖：Day48 订单履约地址强关联与 Day49 两类订单、用户权益卡、分钟核销模型均已上线。  
目标：让 Admin 能以“一个用户购买了什么商品、使用了什么权益、形成了哪些服务预约”为入口查询数据，同时保留服务履约、会员模板和核销流水各自的运营职责。

> 本计划只调整 Admin 信息架构、查询接口和读模型，不改变商品购买交易、服务预约履约、用户权益卡状态机、支付、发卡、冻结、核销、退款或师傅收益的既有闭环。不得为了列表展示重新引入 `orders.member_card_id` 等旧字段作为新写入来源。

## 1. 问题与设计结论

Day49 已按领域将“会员卡购买订单”和“用户权益卡”放在“会员权益”下，将服务预约放在“服务履约”下。该划分适合运营模板、派单和核销，但不适合回答最常见的用户问题：

```text
这个用户买过什么？
他现在有哪些可用权益？
这些权益实际预约并完成了哪些服务？
```

当前 Admin 必须跨多个侧边栏、按不同订单类型反复搜索用户，造成“用户订单查不到”的体验。Day50 改为以用户为中心提供三个明确的读模型：

```text
用户
├─ 用户订单：所有商品购买交易
│  ├─ 服务商品
│  └─ 会员卡商品
├─ 用户服务预约：所有实际服务任务
│  ├─ 服务权益
│  └─ 会员卡权益
└─ 用户权益卡：用户已获得的会员卡
   ├─ 发卡后默认未激活
   ├─ 未激活 -> 激活中 -> 激活完成
   └─ 可追溯购买订单和每次核销预约
```

### 1.1 统一业务命名

Day50 后续产品文案、接口字段、筛选项和测试用例统一采用以下命名，不再混用“现金订单”“卡订单”“会员卡预约”等不完整表达：

| 层级 | 中文名称 | API 读模型代码 | 定义 |
| --- | --- | --- | --- |
| 商品 | 服务商品 | `service_product` | 用户直接购买的一次服务商品；购买完成后获得一次服务权益 |
| 商品 | 会员卡商品 | `member_card_product` | 用户购买的会员卡商品；支付成功后发放一张用户权益卡 |
| 权益 | 服务权益 | `service_entitlement` | 购买服务商品获得的一次性履约资格，对应一次服务预约，不存在卡余额 |
| 权益 | 会员卡权益 | `member_card_entitlement` | 用户从权益卡中冻结并核销的分钟权益，可形成多次服务预约 |
| 履约 | 服务预约 | `service_booking` | 师傅实际执行的任务，必须有服务、时间、订单地址和履约状态 |
| 用户资产 | 用户权益卡 | `user_member_card` | 购买会员卡商品后发放给用户的权益载体，保存分钟余额和状态机 |

`productType` 和 `entitlementType` 是 Day50 查询接口的读模型字段，用于表达业务语义；本计划不修改数据库现有 `orders.order_type`，也不新增重复订单类型。

对应关系：

```text
购买服务商品
-> 服务商品订单
-> 服务权益
-> 服务预约
-> 师傅履约完成
-> 服务权益完成

购买会员卡商品
-> 会员卡商品订单
-> 用户权益卡.pending_activation
-> 首次使用会员卡权益创建服务预约并冻结分钟
-> 用户权益卡.active
-> 多次预约、核销或释放
-> 用户权益卡.completed
```

当前 Day49 数据库没有独立的“服务权益表”，Day50 将其作为服务预约的明确读模型语义：

1. `ServiceBookingOrder` **没有** `OrderRedemption` 时，权益来源为 `service_entitlement`，代表服务商品购买后的一次服务权益。
2. `ServiceBookingOrder` **存在** `OrderRedemption` 时，权益来源为 `member_card_entitlement`，代表从用户权益卡冻结分钟形成的服务预约。
3. 禁止通过 `paidAmount=0`、是否使用优惠券、是否已有师傅或旧 `orders.member_card_id` 判断权益来源。

三类事实进入各透视页的规则固定如下：

| 数据事实 | 用户订单 | 用户服务预约 | 用户权益卡 |
| --- | --- | --- | --- |
| 服务商品订单，无 `OrderRedemption` | 显示为 `service_product` | 同一 `orderId` 显示为 `service_entitlement` 预约 | 不生成用户权益卡 |
| 会员卡商品订单 | 显示为 `member_card_product` | 不显示 | 支付成功后发放一张 `pending_activation` 卡 |
| 会员卡权益预约，有 `OrderRedemption` | 不显示 | 显示为 `member_card_entitlement` 预约 | 关联并冻结/核销对应用户权益卡 |

服务商品订单同时出现在“用户订单”和“用户服务预约”是同一事实的购买与履约两种透视，必须使用同一个 `orderId/orderNo`，不得复制订单或产生第二个服务权益记录。

### 1.2 核心边界

1. **用户订单是商品购买透视**，只展示服务商品订单和会员卡商品订单。带 `OrderRedemption` 的会员卡权益预约不是新购买行为，不进入用户订单。
2. **用户服务预约是权益履约透视**，包含服务权益预约和会员卡权益预约；两者都是真实师傅任务，只是权益来源不同。
3. **用户权益卡是权益资产透视**，读取 `UserMemberCard` 的当前状态和分钟余额；新发卡默认 `pending_activation`，随后按状态机流转，它不是购买订单的重复副本。
4. **全局领域页继续保留**：服务履约用于派单和履约监控，会员权益用于配置模板和审计核销。Day50 只移除不适合作为全局入口的“会员卡购买订单”和“用户权益卡”。
5. “删除会员卡购买订单”仅指删除会员权益侧边栏的独立入口，不删除 `member_card_purchase_orders`、订单详情、退款链路、发卡关系或历史查询能力。

## 2. 目标侧边栏

### 2.1 用户中心

```text
用户中心
├─ 用户列表
├─ 用户订单
├─ 用户服务预约
├─ 用户权益卡
└─ 用户地址
```

| 入口 | 读模型 | 默认范围 | 主要用途 |
| --- | --- | --- | --- |
| 用户列表 | `users` | 全部用户 | 找到用户并进入其购买、服务、权益透视 |
| 用户订单 | `orders + 两种订单扩展` | 服务商品订单 + 会员卡商品订单 | 查看该用户所有商品购买、支付、发卡、退款和订单详情 |
| 用户服务预约 | `service_booking_orders + OrderAddress + OrderRedemption` | 服务权益 + 会员卡权益 | 查看用户实际预约、权益来源、地址、师傅、履约与本次核销 |
| 用户权益卡 | `user_member_cards` | 全部状态；新发卡默认 `pending_activation` | 查看未激活、激活中、已完成卡及余额、到期和来源购买 |
| 用户地址 | `addresses` | 用户服务地址 | 查看地址簿；不替代订单履约地址历史 |

### 2.2 会员权益

调整为：

```text
会员权益
├─ 优惠券
├─ 用户券明细
├─ 视频号链接管理
├─ 会员卡模板与版本
└─ 权益核销记录
```

需要移除的路由和菜单：

| 现有菜单 | Day50 处理 | 原因 |
| --- | --- | --- |
| `会员卡购买订单` | 从“会员权益”侧边栏移除 | 这是用户购买行为，应从用户中心按用户查看 |
| `用户权益卡` | 从“会员权益”侧边栏移至“用户中心” | 这是用户持有资产，应与用户订单和预约一起追溯 |

现有 `会员卡模板与版本` 和 `权益核销记录` 保持在会员权益中：前者是商品/规则配置，后者是跨用户的审计与对账工具。

### 2.3 保留的服务履约页

```text
服务履约
├─ 服务预约订单
├─ 待派单
└─ 履约记录
```

这些页面仍按任务运营，不改为用户中心的替代品。它们与“用户服务预约”读取同一预约事实，但筛选条件、默认列和操作权限不同：前者用于调度，后者用于回答某个用户经历了哪些服务。

## 3. 页面与数据透视设计

### 3.1 用户订单

页面定位：Admin 查看用户购买的**服务商品和会员卡商品**，默认按下单时间倒序。支持先从用户列表进入并自动带入 `userId`，也支持在侧边栏中跨用户搜索。

用户订单的集合定义为：

```text
服务商品订单 = ServiceBookingOrder 且不存在 OrderRedemption
会员卡商品订单 = MemberCardPurchaseOrder
用户订单 = 服务商品订单 UNION ALL 会员卡商品订单
```

使用会员卡权益创建的 `ServiceBookingOrder + OrderRedemption` 具有订单号，但其业务语义是服务预约，不是再次购买服务商品，因此不得出现在用户订单中。

统一行模型：

```text
id / orderNo / productType
userId / userName / userPhone
productName / productSnapshot
transactionStatus / paidAmount / payableAmount / source
createdAt / paidAt / refundedAt
serviceProductSummary?        // 仅服务商品
memberCardProductSummary?     // 仅会员卡商品
```

| 商品类型 | 必须显示 | 不显示或不混用 |
| --- | --- | --- |
| 服务商品 | 订单号、服务商品、用户、交易状态、实付、下单/支付时间、对应服务预约、详情入口 | 不显示“发放用户卡”；不混入会员卡权益预约 |
| 会员卡商品 | 订单号、卡模板/版本、用户、交易状态、实付、下单/支付时间、发放用户权益卡、退款状态、详情入口 | 不显示地址、师傅、预约时间、师傅收益 |

筛选与操作：

1. 用户关键词、用户 ID、订单号、商品/服务关键词。
2. 商品类型、交易状态、来源、下单/支付时间、是否退款。
3. 服务商品附加筛选：服务项目、是否使用优惠券、对应服务预约状态。
4. 会员卡商品附加筛选：模板、模板版本、是否已发卡、用户权益卡状态。
5. 行操作仅为查看订单详情、查看用户、查看关联服务预约或用户权益卡；原订单编辑、退款、支付确认仍必须走既有订单详情和权限检查。

### 3.2 用户服务预约

页面定位：Admin 从用户视角查看**每次实际服务**，并按权益来源明确区分“服务权益”和“会员卡权益”。会员卡商品购买交易不进入本页；会员卡权益预约只出现一次，并显示其关联用户权益卡和本次冻结/核销/释放分钟数。

统一行模型：

```text
orderId / orderNo / userId / userName / userPhone
serviceId / serviceName / serviceSnapshot
appointmentStartAt / appointmentEndAt / fulfillmentStatus
orderAddressSummary / staffId / staffName
entitlementType: service_entitlement | member_card_entitlement
userMemberCardId?
reservedMinutes? / consumedMinutes? / releasedMinutes? / redemptionState?
paidAmount / staffIncomeSummary / createdAt / completedAt
```

必须遵守：

1. 地址只从 Day48 `OrderAddress` 读取；不得回退到用户地址簿或订单 JSON。
2. 会员卡商品订单不得进入本列表，且不得显示为待派单或师傅任务。
3. 没有 `OrderRedemption` 的预约标记为服务权益；存在 `OrderRedemption` 的预约标记为会员卡权益。
4. 师傅、地址、收益和履约状态仅对服务预约展示。
5. 用户订单中的服务商品行可跳转到对应服务预约；用户权益卡的核销记录可跳转到对应会员卡权益预约详情。

筛选：用户、订单号、服务、师傅、履约状态、预约时间、权益来源、核销状态、地址城市/区域（已有数据可用时）。

### 3.3 用户权益卡

页面定位：用户持有权益的资产列表，名称为“用户权益卡”。会员卡商品支付并发卡后，用户权益卡的初始状态必须为 `pending_activation`；列表默认展示全部状态，并提供“未激活 / 激活中 / 已完成”筛选，完整呈现状态机而不是只展示已激活卡。

状态机固定为：

```text
会员卡商品支付成功并发卡
-> pending_activation（未激活）
-> 首次成功冻结会员卡权益
-> active（激活中）
-> used_up / expired / refunded / disabled
-> completed（激活完成，完成原因单独保存）
```

`availabilityState=available | suspended` 仍是独立可用性状态，不得替代上述三态。暂停不会把卡改成未激活或已完成。

保留并补强字段：

```text
user / phone / card template / plan version
status / completed reason / availability state
total minutes / remaining minutes / frozen minutes / usable minutes
activation deadline / activated at / expire at / completed at
purchase order / latest redemption / source
```

操作边界保持 Day49：调整分钟、暂停/恢复、完成并填写原因、查看权益流水、查看来源购买订单；不允许在列表直接修改购买金额、伪造核销或绕过退款流程。

### 3.4 用户 360 度进入方式

从用户列表增加“用户业务详情”入口，进入一个固定用户上下文的页面或抽屉，至少包含：

```text
用户概览
├─ 商品购买汇总：服务商品数、会员卡商品数、累计实付、退款金额
├─ 用户权益卡：未激活、激活中、已完成、可用分钟、即将到期
├─ 服务预约摘要：服务权益/会员卡权益、待服务、服务中、已完成、已取消
├─ 最近用户订单
├─ 最近用户服务预约
└─ 最近用户权益卡
```

概览中的“查看全部”必须跳转到上述三个用户中心列表，并传递固定 `userId`。它不能通过前端过滤已加载的全局列表模拟，必须由服务端按用户查询和分页。

## 4. 后端查询接口与权限

### 4.1 新增只读接口

| 接口 | 用途 | 参数 |
| --- | --- | --- |
| `GET /api/admin/user-orders` | 服务商品和会员卡商品购买透视 | `userId?`、`keyword?`、`productType?`、交易状态、来源、日期、分页 |
| `GET /api/admin/user-service-bookings` | 服务权益和会员卡权益预约透视 | `userId?`、`entitlementType?`、服务/师傅/履约/核销状态、日期、分页 |
| `GET /api/admin/users/:id/commerce-overview` | 单用户汇总和最近记录 | 用户 ID、可选最近记录条数 |

现有 `GET /api/admin/user-member-cards` 继续作为用户权益卡的唯一数据源，扩展明确的 `userId`、`status`、`availabilityState` 和到期区间查询契约。接口未传 `status` 时返回全部状态；新发卡的业务默认状态是 `pending_activation`。不能新建第二张用户卡投影表。

### 4.2 查询实现规则

1. `user-orders` 以 `orders.user_id` 为唯一用户归属条件；`MemberCardPurchaseOrder` 映射为 `member_card_product`，没有 `OrderRedemption` 的 `ServiceBookingOrder` 映射为 `service_product`。
2. 存在 `OrderRedemption` 的 `ServiceBookingOrder` 必须从 `user-orders` 排除；它是 `member_card_entitlement` 服务预约，不是新的服务商品购买。
3. `orders.order_type` 继续作为数据库领域类型，但用户订单接口必须输出明确的 `productType`；前端不得把 `service_booking` 原样翻译成“服务商品”，因为其中可能包含会员卡权益预约。
4. 用户服务预约只从 `service_booking_orders` 驱动，联接 `OrderAddress`、`OrderRedemption`、师傅和收益；依据 `OrderRedemption` 是否存在输出 `service_entitlement` 或 `member_card_entitlement`。
5. 没有服务预约扩展、扩展类型冲突或核销来源不一致的数据进入审计异常，不做静默丢弃或前端猜测。
6. 用户权益卡只从 `user_member_cards` 驱动，购买来源从 `purchase_order_id` / `MemberCardPurchaseOrder` 获取，已售规则从 `plan_snapshot` 获取。
7. 金额、分钟、商品类型、权益来源、状态和时间必须由服务端格式化为明确字段；前端不基于旧兼容列二次推导。
8. 所有列表均在数据库完成过滤、排序和分页；默认排序为 `created_at DESC, id DESC`，不得先取全量再在浏览器按用户过滤。

### 4.3 权限和隐私

1. 新增只读权限 `user-commerce:list` 和 `user-commerce:detail`，分别授予需要查看用户交易列表与单用户 360 度详情的 Admin 角色；首次发布仅默认授予超级管理员和当前具备用户详情、订单查看、会员卡查看权限的运营角色。
2. `user-orders`、`user-service-bookings` 和 `commerce-overview` 必须由后端守卫校验新权限，不能只靠前端隐藏菜单。
3. 用户订单列表默认不展示详细服务地址、身份证明或完整支付流水；地址仅在有订单详情权限的服务预约详情中展示。
4. 所有深链必须再次按目标资源权限校验，不能因从用户中心进入而绕过订单、会员卡或地址权限。
5. 只读查询不写 `AuditLog`；既有权益调整、退款、暂停/恢复、完成卡操作继续写审计。

## 5. 前端实施范围

1. 在 `admin/src/router/life-admin-routes.ts` 将“用户订单”“用户服务预约”“用户权益卡”加入用户中心，并删除会员权益下的购卡订单和用户权益卡路由。
2. 新建用户订单、用户服务预约和用户 360 度视图；不要继续为用户维度复用当前全局 `life/orders/index.vue` 的标题、筛选和列定义，否则会把派单操作和购卡字段混入同一屏。
3. 详情内部仍可按数据库 `orderType` 加载，但页面对用户订单展示 `productType`，对服务预约展示 `entitlementType`；会员卡商品详情只展示交易/发卡/退款，服务预约详情展示地址/师傅/履约/核销/收益。
4. 用户权益卡可沿用当前资源页数据源与受控操作；列表默认展示全部状态，新发卡显示为 `pending_activation`，并提供“未激活 / 激活中 / 已完成”状态切换。
5. 从用户列表、订单、预约、权益卡和核销流水之间实现带 `userId`、`orderId`、`userMemberCardId` 的深链；所有跳转保留当前筛选上下文。
6. 页面空态必须按当前用户范围说明“暂无商品购买订单”“暂无服务预约”或“暂无用户权益卡”，不能把空数据解释为用户不存在。

## 6. 数据库与性能

Day50 默认**不做数据库迁移**，不增加订单副本、用户订单汇总表或新的权益字段。先基于 Day49 已有关系读取：

```text
orders.user_id
service_booking_orders.order_id
member_card_purchase_orders.order_id
user_member_cards.user_id / purchase_order_id
order_redemptions.order_id / user_member_card_id
order_addresses.order_id
```

实施前后需执行：

1. 检查 `orders(user_id, created_at)`、`user_member_cards(user_id, status)`、`service_booking_orders(staff_id, appointment_start_at)` 等索引的实际存在与 `EXPLAIN` 结果。
2. 仅在用户订单或用户预约分页查询出现全表扫描且现有索引无法覆盖时，单独评审并添加最小化联合索引；索引迁移不与 UI 菜单调整混在同一无审计发布中。
3. 对同一用户的订单、预约、权益卡数量做对账：用户订单数量等于“无 `OrderRedemption` 的服务商品订单 + 会员卡商品订单”，用户服务预约数量等于该用户全部 `service_booking_orders` 数量，用户权益卡数量等于 `user_member_cards` 数量。
4. 对权益来源单独对账：服务权益预约数等于没有 `OrderRedemption` 的服务预约数，会员卡权益预约数等于存在 `OrderRedemption` 的服务预约数，两者之和必须等于用户服务预约总数。

## 7. 实施步骤

1. 补充查询 DTO、返回类型、权限常量和 Admin 路由授权；先为三类查询定义字段契约和空值规则。
2. 实现 `user-orders`、`user-service-bookings`、`commerce-overview` 服务端查询，并复用 Day49 订单扩展、订单地址、核销和权益卡关系。
3. 为查询添加单元/集成测试：同一用户同时存在服务商品订单、会员卡商品订单、服务权益预约、会员卡权益预约、未激活卡、退款卡和已完成卡的完整夹具。
4. 实现用户中心三张列表与用户 360 度入口，完成行间深链；保留服务履约和会员权益的全局运营页。
5. 从会员权益菜单移除购卡订单和用户权益卡，仅保留模板、规则、券和核销流水。
6. 执行 Admin 构建、后端构建、权限回归和浏览器验收；核对新旧入口数量、筛选、分页与订单详情跳转。
7. 发布时不执行 Prisma 迁移；部署后用真实脱敏用户核对两类商品购买、两类权益预约、用户权益卡状态机和深链的一致性。

## 8. 验收标准

1. Admin 能从“用户中心 / 用户订单”按用户查到该用户全部服务商品订单和会员卡商品订单，且两类商品均能打开正确详情。
2. 会员卡商品订单不再出现在“会员权益”侧边栏，但其支付、发卡和退款数据仍可从用户订单、用户权益卡和订单详情追溯。
3. 使用会员卡权益产生的服务预约不会被误算为服务商品购买，不进入用户订单。
4. “用户中心 / 用户服务预约”只显示实际服务预约，并明确标记 `service_entitlement` 或 `member_card_entitlement`；会员卡商品订单不会出现地址、师傅、派单、收益或核销操作。
5. 每个会员卡权益预约在用户服务预约中恰好出现一次，并能看到关联用户权益卡和本单冻结/核销/释放分钟数。
6. 新发放的用户权益卡状态为 `pending_activation`；首次成功冻结会员卡权益后变为 `active`，最终变为 `completed + completedReason`。
7. “用户中心 / 用户权益卡”默认展示全部状态，并可分别筛选 `pending_activation`、`active`、`completed` 及完成原因。
8. 从用户列表进入 360 度详情后，商品购买汇总、权益预约统计、用户权益卡和最近记录与三个列表按同一 `userId` 的结果一致。
9. 任何跨用户 `userId` 参数都不会泄露其他用户的订单、地址、卡或核销详情；缺少新权限时返回 403。
10. 原有服务履约、待派单、师傅任务、会员卡模板、权益核销记录、退款和分钟核销闭环不发生行为回归。
11. 所有用户维度列表为服务端分页，百万级订单量下使用索引查询；不得通过前端全量加载实现。
12. Admin 与 Server 构建通过，查询测试、权限测试、商品/权益分类对账和浏览器回归通过。

## 9. 明确不做

1. 不合并商品购买交易状态、服务预约履约状态和用户权益卡状态机。
2. 不删除 Day49 的 `member_card_purchase_orders`、`user_member_cards`、`order_redemptions` 或任何历史订单。
3. 不把用户地址簿当成订单履约地址，不回退 Day48 `OrderAddress`。
4. 不在用户订单页直接修改卡余额、完成卡、退款或派单；这些操作继续经过既有受控工作流和审计。
5. 不在本计划中删除 Day49 旧兼容列；仍按 Day49 稳定观察期后的单独清理流程执行。

## 10. 实施与生产发布记录

实施及发布时间：2026-07-15 12:48-13:18（Asia/Shanghai）  
服务器：`47.113.201.201`，后端容器：`life_assistant_server`

### 10.1 已完成实现

1. 新增 `GET /api/admin/user-orders`，只返回服务商品订单和会员卡商品订单；存在 `OrderRedemption` 的会员卡权益预约不会进入购买透视。
2. 新增 `GET /api/admin/user-service-bookings`，返回全部真实服务预约并输出 `service_entitlement` 或 `member_card_entitlement`。
3. 新增 `GET /api/admin/users/:id/commerce-overview`，汇总用户商品购买、服务预约、用户权益卡和最近记录。
4. 新增 `user-commerce:list`、`user-commerce:detail` 后端权限，并授予既有运营角色；超级管理员继续通过通配权限访问。
5. Admin 用户中心已新增“用户订单”“用户服务预约”“用户权益卡”和隐藏的用户业务详情页；用户列表新增“业务透视”入口。
6. “会员权益”已移除“会员卡购买订单”和“用户权益卡”两个侧边栏入口，保留会员卡模板、券和权益核销记录。
7. 旧权益卡深链已迁移到 `/users/member-cards`；用户筛选、用户权益卡筛选、订单详情和预约详情可以互相追溯。
8. 新增只读 `day50-user-commerce-audit.ts`，对商品集合、权益预约集合和用户权益卡生命周期执行数量守恒审计。
9. Day50 没有新增表、字段或 Prisma migration，生产数据库仍为 24 个迁移。

### 10.2 本地与生产验收

1. Server `pnpm build`、`pnpm exec tsc --noEmit`、Admin `pnpm type-check` 和 `pnpm build` 全部通过。
2. 本地 Day50 审计 6 项全部通过；隔离夹具中 2 条会员卡商品订单只进入用户订单，2 条会员卡权益预约只进入服务预约，集合重叠为 0，随后测试数据清理完成。
3. 生产发布前后 Day50 审计均通过：当前 6 条商品订单由 5 条服务商品和 1 条会员卡商品组成，5 条服务预约均完成权益来源归类。
4. 生产三个新接口已使用 Admin 身份执行真实 HTTP 验收；返回的 `productType`、`entitlementType`、用户概览和集合排除规则均通过断言。
5. Day49 订单/会员卡闭环回归 11 个断言全部通过，覆盖购卡发卡、首次激活、分钟冻结/核销/释放、Admin 调整和退款撤卡；测试数据清理后各类记录均为 0。
6. 公网 `https://www.xunhaoyou.com/api/health`、`https://www.xunhaoyou.com/admin/`、用户订单页面资源和用户概览页面资源均返回 HTTP 200。
7. Admin 公网入口 SHA-256 与本地构建一致；后端容器运行正常、重启次数为 0，发布后日志未发现错误级别记录。

### 10.3 发布包与回滚

1. 生产备份目录：`/www/wwwroot/life-assistant/backups/day50-20260715-130351/`，包含数据库 SQL、Day49 后端镜像、旧 Admin 和生产环境配置，SHA-256 复核全部通过。
2. 发布包目录：`/www/wwwroot/life-assistant/releases/day50-20260715-130351/`。
3. 后端发布包 SHA-256：`ba48170171458cfcae603f2d5827d082bd23e86ddc2f745904d1aa758ab2e765`。
4. Admin 发布包 SHA-256：`de82e1df07d4caba7b753f37a8e07656cac2cd1330a631648d7f3b0fc325cb78`。
5. 当前生产后端镜像 ID：`sha256:7e35639a3d8ef6d0fb2af8323e549367feb121608183001cd93b386660d4c2da`。
6. 旧后端容器保留为 `life_assistant_server_before_day50_20260715`，旧 Admin 目录保留为 `admin-dist.before-day50-20260715-130351`；本次无数据库迁移，可直接恢复旧容器和旧静态目录。
