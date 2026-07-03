# 当前项目功能与设计审核总结

更新日期：2026-05-28

## 1. 审核范围

本次审核对照以下计划和当前代码实现：

- `docs/plan/day1.md`
- `docs/plan/day1-miniapp.md`
- `docs/plan/day2-rear.md`
- `docs/plan/day3-auth.md`
- `docs/plan/day3-auth-detail.md`
- `docs/plan/day5-db.md`
- `docs/plan/day6-server-nestjs-migration.md`
- `docs/plan/day6-server-nestjs-execution-log.md`
- `docs/plan/day7-api-development-plan.md`
- `docs/plan/day8-order.md`
- `docs/plan/mvp.md`
- 当前 `server/`、`miniapp/`、`docs/summary/`、`docs/order/`、`docs/test/` 代码和文档

本次结论以当前代码为准。旧的 `docs/summary/current-project-status-2026-05-28.md` 中关于 Day 7/Day 8 “尚未落地”的判断已经过时，因为当前项目已经新增并挂载了 `AddressesModule`、`OrdersModule`、`PaymentsModule`。

## 2. 当前总体结论

项目当前处于：

```txt
MVP 后端订单内核已完成，用户端真实闭环前端接入尚未完成，生产级三端体系尚未完成。
```

更准确地说：

- Day 1 到 Day 6 的工程地基、服务浏览、认证基础、数据库接入、NestJS 后端迁移已经基本完成。
- Day 7 的后端地址、订单、mock 支付接口已经落地，并通过契约测试覆盖主流程。
- Day 8 的订单状态机、状态日志、乐观锁/悲观锁、防冲突核心设计已经落地。
- 小程序用户端已经有地址、下单、订单列表、订单详情、支付结果等页面和 API 封装，但关键页面仍以 `mockDay4` 为主数据源，尚未形成真实前端闭环。
- 管理后台 `admin-web/` 不存在；管理端订单接口有后端能力，但没有后台 UI。
- 师傅端后端接口已有 MVP 能力，但没有师傅端页面、真实师傅登录和生产级权限体系。
- 真实微信支付、退款、评价、售后、文件上传、消息通知、营销、财务结算仍未进入可上线状态。

因此，当前项目不能称为完整 MVP，但已经具备继续推进 MVP 的核心后端基础。

## 3. 当前已完成的功能点

### 3.1 工程与基础设施

已完成：

- 根目录已有 `docs/`、`miniapp/`、`server/`、`photo/`。
- `server/` 已迁移为 NestJS 后端主线。
- `miniapp/` 已基于 uni-app 建立用户端小程序工程。
- `server` 已有统一 `/api` 前缀、CORS、Swagger、全局校验、统一响应、统一异常、请求日志、requestId 中间件。
- `server` 已接入 Prisma/MySQL。
- `server` 已有 `build`、`db:verify`、`test:contract`、`seed:db` 等脚本。
- `miniapp` 已有统一 HTTP 请求封装、token/user store、基础页面、组件体系和类型定义。

已验证：

```bash
server: npm run build          通过
server: npm run db:verify      通过，orderP0Schema=ok
server: npm run test:contract  通过
miniapp: pnpm type-check       通过
```

### 3.2 用户认证

后端已完成：

- `POST /api/auth/mock-login`
- `POST /api/auth/wechat-login`
- `GET /api/auth/me`
- `PUT /api/auth/profile`
- `JwtAuthGuard`
- JWT 签发和校验
- 非生产环境模拟登录
- 微信登录接口结构

小程序已完成：

- 登录页
- token store
- user store
- 请求头自动注入 `Authorization: Bearer <token>`
- 401 跳转登录逻辑

仍需注意：

- 真实微信手机号登录依赖微信配置和真机验证，当前不能视为生产闭环已验证。
- admin/staff 真实登录体系尚未完成。
- 当前普通用户 token 默认角色来自用户记录，管理端/师傅端生产级 RBAC 还没有完整设计落地。

### 3.3 服务浏览

后端已完成：

- `GET /api/service-categories`
- `GET /api/services`
- `GET /api/services/:id`
- 服务分类、服务项目 seed
- 服务价格 Decimal 序列化
- 服务列表分页、分类筛选、关键词查询

小程序已完成：

- 首页服务展示
- 服务分类宫格
- 服务卡片
- 服务详情页
- 服务 API 封装

数据库验证显示：

```txt
categories: 14
services: 40
apiTotal: 40
basePriceType: number
```

### 3.4 地址管理

后端已完成：

- `GET /api/user/addresses`
- `POST /api/user/addresses`
- `PUT /api/user/addresses/:id`
- `DELETE /api/user/addresses/:id`
- 地址归属当前用户校验
- 默认地址处理
- 软删除

小程序已完成：

- `miniapp/src/api/address.ts`
- 地址列表页
- 地址编辑页
- 地址卡片组件

缺口：

- 地址列表页、地址编辑页当前仍从 `mockDay4` 读取和写入。
- 小程序页面尚未调用 `getUserAddresses/createUserAddress/updateUserAddress/deleteUserAddress`。
- 地址省市区、门牌号、经纬度、定位/地图选择等产品规则仍偏简化。

### 3.5 订单后端内核

用户端后端接口已完成：

- `GET /api/orders/price-preview`
- `GET /api/orders`
- `GET /api/orders/:id`
- `POST /api/orders`
- `POST /api/orders/:id/cancel`
- `POST /api/orders/:id/confirm`
- `POST /api/orders/:id/pay`

管理端后端接口已完成：

- `GET /api/admin/orders`
- `GET /api/admin/orders/:id`
- `POST /api/admin/orders/:id/assign`

师傅端后端接口已完成：

- `GET /api/staff/orders`
- `GET /api/staff/orders/:id`
- `POST /api/staff/orders/:id/accept`
- `POST /api/staff/orders/:id/reject`
- `POST /api/staff/orders/:id/on-the-way`
- `POST /api/staff/orders/:id/start-service`
- `POST /api/staff/orders/:id/complete`

支付占位接口已完成：

- `POST /api/payments/mock-success`

订单后端已完成的关键设计：

- 订单创建时校验服务和地址归属。
- 金额以后端服务价格为准。
- 创建订单时保存 `serviceSnapshot` 和 `addressSnapshot`。
- 每次成功状态变化写入 `order_status_logs`。
- 订单状态推进统一收口到 `OrderTransitionService`。
- 高冲突动作使用悲观锁。
- 履约动作和用户确认使用乐观锁。
- 支付成功、派单、接单、拒单、履约、用户确认都通过状态机校验。
- 支付成功和支付记录更新在同一事务内完成。
- 已覆盖取消订单与支付成功冲突、重复派单冲突、接单与拒单冲突。

当前已实现状态流：

```txt
create_order        null -> pending_payment
pay_success         pending_payment -> pending_dispatch
admin_assign        pending_dispatch -> dispatched
staff_accept        dispatched -> accepted
staff_reject        dispatched -> pending_dispatch
staff_on_the_way    accepted -> on_the_way
staff_start         on_the_way -> in_service
staff_complete      in_service -> pending_confirm
user_confirm        pending_confirm -> completed
user_cancel_unpaid  pending_payment -> cancelled
timeout_unpaid      pending_payment -> cancelled
auto_confirm        pending_confirm -> completed
```

### 3.6 小程序用户端 UI

已完成页面：

- `miniapp/src/pages/home/index.vue`
- `miniapp/src/pages/service/detail.vue`
- `miniapp/src/pages/login/index.vue`
- `miniapp/src/pages/profile/index.vue`
- `miniapp/src/pages/address/list.vue`
- `miniapp/src/pages/address/edit.vue`
- `miniapp/src/pages/order/create.vue`
- `miniapp/src/pages/order/list.vue`
- `miniapp/src/pages/order/detail.vue`
- `miniapp/src/pages/payment/result.vue`

已完成组件：

- `service-category-grid`
- `service-card`
- `price-text`
- `empty-state`
- `loading-state`
- `address-card`
- `amount-detail`
- `bottom-action-bar`
- `form-section`
- `order-card`
- `order-status-tag`

主要缺口：

- 地址、下单、订单列表、订单详情、支付结果仍没有接入真实后端主链路。
- `miniapp/src/api/address.ts` 和 `miniapp/src/api/orders.ts` 已存在，但页面没有使用。
- 支付结果页只是展示页面，没有调用真实 mock 支付接口。

## 4. 对照 Day1-Day8 完成度

| 阶段 | 计划目标 | 当前状态 | 说明 |
|---|---|---|---|
| Day 1 | 工程地基、统一规范、小程序骨架 | 基本完成 | 前后端基础结构、请求封装、服务浏览、通用组件已落地 |
| Day 2 | 最小后端闭环 | 已完成并被 server 主线替代 | 当前主后端是 `server/`，不再以旧 rear/rear-like 原型为主 |
| Day 3 | 用户认证与服务详情 | 基本完成 | mock 登录、JWT、用户信息、服务详情已落地；真实微信链路待真机验证 |
| Day 4 | 用户端 UI、地址/下单/订单页面、师傅端 UI 规划 | 部分完成 | 用户端页面完成较多；师傅端 UI 未落地 |
| Day 5 | MySQL/Prisma 数据库接入 | 基本完成 | schema、迁移、seed、db verify 均已具备 |
| Day 6 | NestJS 后端迁移 | 完成主线 | `server/` 已承担主后端能力 |
| Day 7 | 地址、订单、mock 支付真实接口 | 后端完成，前端未接完 | 后端接口和契约测试通过；小程序页面仍 mock |
| Day 8 | 订单状态机、防冲突、三端订单后端接口 | 后端 MVP 完成 | 状态机、锁策略、状态日志、三端接口已落地 |

## 5. 对照 MVP 计划的差距

MVP 文档要求的第一版核心闭环是：

```txt
用户登录
-> 浏览服务
-> 预约下单
-> 支付
-> 后台派单
-> 师傅履约
-> 用户确认/评价
-> 售后
-> 后台查看和管理
```

当前已经具备：

- 用户登录基础能力
- 服务浏览基础能力
- 后端地址管理
- 后端预约下单
- 后端 mock 支付
- 后端后台派单接口
- 后端师傅履约接口
- 后端用户确认完成
- 后端订单状态机和日志
- 订单主链路契约测试

当前不具备或未完成：

- 小程序真实地址管理闭环
- 小程序真实下单闭环
- 小程序真实订单列表/详情/取消/确认闭环
- 小程序真实 mock 支付闭环
- admin-web 后台
- 真实管理员登录和权限
- 真实师傅登录和师傅端页面
- 真实微信支付、回调验签和退款
- 评价模块
- 售后工单模块
- 文件上传模块
- 消息通知模块
- 优惠券和会员次卡真实核销
- 后台服务管理、员工管理、订单调度 UI
- 数据看板、导出、财务结算
- 生产部署、上线检查和小程序提审

## 6. 当前设计需要完善的地方

### 6.1 前端真实化是当前最大缺口

后端订单内核已经可用，但小程序关键页面仍使用 `mockDay4`：

- `miniapp/src/pages/address/list.vue`
- `miniapp/src/pages/address/edit.vue`
- `miniapp/src/pages/order/create.vue`
- `miniapp/src/pages/order/list.vue`
- `miniapp/src/pages/order/detail.vue`
- `miniapp/src/pages/payment/result.vue`

建议优先补齐：

1. 地址列表/编辑页切换到真实地址 API。
2. 下单页调用 `getOrderPricePreview` 和 `createOrder`。
3. 支付入口调用 `payOrder` 和开发环境 `mockSuccess`。
4. 订单列表页调用 `getOrders`。
5. 订单详情页调用 `getOrderDetail`、`cancelOrder`、`confirmOrder`。
6. 删除或降级 `mockDay4`，只保留为本地 demo fallback。

### 6.2 生产级 admin/staff 鉴权还没有完成

当前管理端和师傅端后端接口支持：

- JWT 角色为 `admin` / `staff` 时走真实角色。
- 非生产环境通过 `X-Admin-Id` / `X-Staff-Id` 模拟身份。
- 生产环境拒绝模拟身份。

这适合联调和契约测试，但不等于生产级权限体系。

需要补齐：

- admin 登录接口
- staff 登录接口
- admin/staff 独立 token 签发
- RBAC 权限表或权限枚举
- 管理端专用 Guard
- 师傅端专用 Guard
- 管理端操作日志
- 管理员禁用、师傅禁用后的 token 失效策略

### 6.3 admin-web 尚未开始

MVP 需要后台人工派单和管理能力，但当前根目录没有 `admin-web/`。

需要至少完成：

- 后台登录页
- 订单列表
- 订单详情
- 派单弹窗
- 师傅列表/可用师傅选择
- 服务管理
- 员工管理
- 基础操作日志查看

没有后台 UI 时，虽然后端接口存在，但运营侧无法完成真实人工派单。

### 6.4 师傅端 UI 尚未落地

当前有师傅端后端接口，但没有小程序师傅端页面。

需要补齐：

- 师傅工作台
- 待接单任务
- 进行中任务
- 历史任务
- 任务详情
- 接单/拒单
- 出发
- 开始服务
- 上传服务照片
- 完成服务
- 联系用户

同时需要明确用户端和师傅端是同一个小程序按角色切换，还是拆分为两个小程序/端。

### 6.5 支付仍是 mock，不具备上线能力

当前支付只完成开发环境模拟支付：

- 生成 mock payment
- mock success 推动订单进入 `pending_dispatch`
- 记录 payment notify log
- 处理重复成功和取消后支付成功冲突

上线前需要补齐：

- 微信预支付下单
- 支付参数签名
- 支付回调验签
- 回调幂等
- 支付证书配置
- 退款单
- 退款回调
- 取消已支付订单的退款策略
- 支付超时关单

### 6.6 幂等键和 Outbox 还没有落表

Day8 已经实现了状态锁和关键冲突控制，但还没有：

- `idempotency_keys`
- `outbox_events`

短期可接受，因为当前契约测试覆盖了主要冲突。但进入真实支付、消息通知、自动任务后需要补齐：

- 支付回调幂等键
- 用户重复提交订单幂等
- 师傅重复动作幂等
- 状态变更事件 outbox
- 通知发送失败重试

### 6.7 订单派单数据约束还可以更强

当前一致性主要依赖锁住 `orders` 行和业务逻辑保证。

建议后续加强：

- `order_assignments` 增加“当前有效派单唯一性”约束或业务字段。
- 明确 rejected assignment 与重新派单的历史保留规则。
- 增加改派动作 `admin_reassign`。
- 增加后台取消已支付订单和退款联动规则。

### 6.8 履约凭证规则偏宽

当前 `staff_complete` 允许空照片，照片只在传入时写入。

建议明确：

- 哪些服务必须上传完工照片。
- 至少几张照片。
- 照片是否需要现场定位。
- 出发/到达/开始/完成是否都需要 checkin。
- 打卡是否校验经纬度和服务地址距离。

### 6.9 地址模型需要产品化细化

当前地址后端为了兼容前端类型，将 `cityName` 同时写入 province/city，`detailAddress + houseNumber` 合并写入 `address`，返回时 `houseNumber` 为空。

建议后续完善：

- province/city/district 明确分离。
- 单独存储门牌号。
- 地址选择器接入省市区/地图。
- 经纬度来源和精度规则。
- 服务城市、服务范围、超区不可下单。

### 6.10 价格体系仍是基础价

当前价格预览基本等于服务基础价。

MVP 上线前至少需要明确：

- 是否有上门费。
- 是否有时段加价。
- 是否按面积、数量、时长计价。
- 优惠券是否参与预览。
- 会员次卡是否抵扣。
- 前端展示金额和后端下单金额不一致时的处理。

### 6.11 评价、售后、文件、消息仍是空壳或预留

数据库 schema 已预留大量表：

- reviews
- tickets
- files
- notifications
- coupons
- member_cards
- staff_income_records

但当前没有相应业务接口和页面闭环。需要避免误判为“功能完成”。当前只能说数据库预留完成。

### 6.12 文档与实现状态需要同步

已有 summary 中存在过时判断，例如旧文档认为 `server/src/addresses`、`server/src/orders`、`server/src/payments` 不存在。建议后续保持：

- 每个 Day 完成后新增当日验收文档。
- 旧结论不覆盖，但新文档明确“过时项”。
- README 中增加当前项目状态入口。
- Apifox/接口文档随代码更新。

## 7. 推荐优先级

### P0：下一步必须做

1. 小程序地址页接入真实 API。
2. 小程序下单页接入真实价格预览和创建订单。
3. 小程序支付页接入 mock 支付接口。
4. 小程序订单列表/详情接入真实订单 API。
5. 小程序取消订单、确认完成调用真实接口。
6. 跑通用户端真实链路：登录 -> 地址 -> 下单 -> mock 支付 -> 订单详情。
7. 更新 `mockDay4` 使用策略，避免继续作为主数据源。

### P1：MVP 闭环核心

1. 创建 `admin-web/`。
2. 后台订单列表、详情、派单。
3. 师傅端页面和真实师傅登录。
4. 师傅接单、出发、开始服务、上传照片、完成服务前端闭环。
5. 用户端展示师傅信息、服务照片和状态进度。
6. 真实 admin/staff Guard 和权限。

### P2：上线前必须补强

1. 微信支付和回调。
2. 退款流程。
3. 文件上传。
4. 评价。
5. 售后工单。
6. 消息通知。
7. 幂等键和 outbox。
8. 操作日志完整落库。
9. 上线部署和小程序提审材料。

### P3：上线后迭代

1. 自动派单。
2. 优惠券和会员次卡复杂规则。
3. 财务结算和提现。
4. 数据看板和导出。
5. 多城市、多门店。
6. 更复杂的售后、风控和 BI。

## 8. 验证记录

本次执行验证：

```bash
cd server
npm run build
```

结果：通过。

```bash
cd server
npm run db:verify
```

结果：

```json
{
  "db": "ok",
  "categories": 14,
  "services": 40,
  "apiTotal": 40,
  "firstServiceIdType": "number",
  "basePriceType": "number",
  "createdAtType": "string",
  "orderP0Schema": "ok"
}
```

```bash
cd server
npm run test:contract
```

结果：通过，输出 `contract-test-ok`。

契约测试覆盖：

- mock 登录
- 健康检查
- 服务分类、服务列表、服务详情
- 地址创建
- 价格预览
- 创建订单
- mock 支付
- 后台派单
- 师傅接单
- 师傅出发
- 师傅开始服务
- 师傅完成服务
- 用户确认完成
- 用户取消与支付成功冲突
- 双管理员重复派单冲突
- 师傅接单与拒单冲突

```bash
cd miniapp
pnpm type-check
```

结果：通过。

## 9. 一句话总结

当前项目的后端已经从“可浏览、可登录”推进到了“订单状态机和三端订单后端内核可用”的阶段；下一步不要继续扩大后端预留表和文档范围，应优先把小程序用户端从 mock 切到真实接口，先形成用户端真实下单和 mock 支付闭环，再进入后台派单 UI、师傅端履约 UI 和真实微信支付。
