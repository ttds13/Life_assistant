# 当前项目节点总结

更新日期：2026-05-28

## 1. 当前结论

结合 `docs/plan/day1.md` 到 `docs/plan/day7-api-development-plan.md`、`docs/plan/mvp.md`、`docs/ui/mvp.md` 以及当前代码，项目现在处在：

```txt
Day 6 已完成并落地到 server/
Day 7 已有计划和前端 API 类型/封装雏形，但真实地址、订单、支付接口尚未实现
MVP 主流程尚未形成真实闭环
```

更准确地说，当前项目已经完成了“工程地基 + 小程序服务浏览 + NestJS 后端迁移 + 服务/登录基础接口”的阶段，正在从“可浏览、可登录”进入“可下单、可支付、可追踪订单”的 Day 7 前置节点。

当前最关键的缺口是：

```txt
server/ 没有 AddressesModule、OrdersModule、PaymentsModule
miniapp/ 地址、下单、订单列表、订单详情仍主要依赖 mockDay4
admin-web 目录不存在，后台管理端尚未开始
师傅端页面和履约接口尚未开始
真实微信支付尚未开始
```

因此当前不能视为 MVP，只能视为 MVP 的基础设施阶段基本完成。

## 2. 当前代码结构状态

当前根目录实际结构：

```txt
Life_assistant/
  docs/       项目计划、UI 计划、数据库记录、总结
  miniapp/    uni-app 小程序端
  rear/       旧版 Node HTTP 原型后端，legacy/prototype
  server/     新版 NestJS 后端
  photo/      项目截图或参考图片
```

与 MVP 文档推荐结构相比：

```txt
miniapp/    已存在
server/     已存在
admin-web/  未存在
docs/       已存在
```

`rear/` 仍保留作为早期原型后端。Day 6 文档要求“不破坏 rear，新增 server 并行迁移”，当前代码符合这个迁移策略。

## 3. Day 1 到 Day 7 完成度

| 阶段 | 文档目标 | 当前状态 | 说明 |
|---|---|---|---|
| Day 1 | 小程序地基、请求封装、服务浏览、基础组件 | 基本完成 | `miniapp` 已有首页、服务详情、订单/我的占位、统一请求、服务 API、状态组件 |
| Day 2 | `rear` 最小后端闭环 | 已完成但已转为 legacy | `rear` 保留原型能力，当前主线已迁移到 `server` |
| Day 3 | 用户认证、微信/模拟登录、个人信息 | 部分完成 | `server` 有 `auth`/`users`，小程序有登录页和 token/user store；真实微信登录依赖微信接口和配置，手机号授权完整真机链路未验证 |
| Day 4 | 下单、地址、订单、支付结果 UI；师傅端 UI | 用户端 UI 部分完成，师傅端未完成 | `miniapp` 有地址、下单、订单列表、订单详情、支付结果页面和公共组件，但主要使用 mock；没有 `pages/staff` |
| Day 5 | Prisma/MySQL 接入，服务和用户改用数据库 | 基本完成 | `server/prisma/schema.prisma` 已有完整业务表，`services` 和 `users` 使用 Prisma |
| Day 6 | NestJS 后端迁移，统一响应/异常/JWT/服务接口/seed/测试 | 已完成主干 | `server` 已有 `health/services/auth/users/dev`，统一响应、异常、日志、Swagger、Prisma；`npm run build` 通过 |
| Day 7 | 地址、订单、模拟支付真实闭环 | 尚未落地 | 文档已写清楚，但 `server/src` 没有 `addresses/orders/payments` 模块，小程序页面仍使用 `mockDay4` |

## 4. 已完成能力

### 4.1 小程序端已完成

已落地页面：

```txt
miniapp/src/pages/home/index.vue
miniapp/src/pages/service/detail.vue
miniapp/src/pages/login/index.vue
miniapp/src/pages/profile/index.vue
miniapp/src/pages/address/list.vue
miniapp/src/pages/address/edit.vue
miniapp/src/pages/order/create.vue
miniapp/src/pages/order/list.vue
miniapp/src/pages/order/detail.vue
miniapp/src/pages/payment/result.vue
```

已落地公共组件：

```txt
service-category-grid
service-card
price-text
empty-state
loading-state
address-card
amount-detail
bottom-action-bar
form-section
order-card
order-status-tag
```

已落地前端基础能力：

```txt
统一 HTTP 请求封装
统一响应 code/message/data 解包
401 / 认证失效处理
Authorization Bearer token 注入
X-Request-Source / X-Client-Version 请求头
Pinia token/user store
首页服务分类和服务列表接口封装
登录、获取用户信息、更新用户资料 API 封装
地址 API 封装
订单 API 封装
```

注意：地址和订单 API 文件已存在，但页面当前尚未切换为真实接口主数据源。

### 4.2 后端 `server/` 已完成

已落地模块：

```txt
HealthModule
ServicesModule
UsersModule
AuthModule
DevModule
PrismaModule
```

已落地接口：

```txt
GET  /api/health
GET  /api/service-categories
GET  /api/services
GET  /api/services/:id
POST /api/auth/mock-login
POST /api/auth/wechat-login
GET  /api/auth/me
PUT  /api/auth/profile
POST /api/dev/seed
```

已落地通用后端能力：

```txt
NestJS 项目骨架
全局 /api prefix
CORS
Swagger
ValidationPipe
统一成功响应
统一异常响应
BusinessException
ErrorCode
requestId middleware
请求日志 interceptor
JWT Guard
PrismaService
BigInt / Decimal / Date 序列化
服务数据 seed
contract-test / db-verify 脚本
```

### 4.3 数据库已完成

`server/prisma/schema.prisma` 已定义 MVP 所需的大部分核心表，包括：

```txt
users
user_addresses
staff
admin_users
service_categories
services
service_price_rules
service_images
orders
order_status_logs
order_assignments
payments
payment_notify_logs
refunds
service_checkins
service_photos
reviews
tickets
coupons
user_coupons
member_cards
user_member_cards
notifications
files
audit_logs
```

这说明数据模型已经比当前接口实现更靠前，后续 Day 7 到 MVP 可以基于现有 schema 继续补服务层和接口层。

## 5. 当前尚未完成但 Day 7 必须补齐

Day 7 的核心目标是用户端最小真实业务闭环：

```txt
用户登录
-> 管理地址
-> 选择服务
-> 预览价格
-> 创建订单
-> 查看订单列表
-> 查看订单详情
-> 取消待支付订单
-> 开发环境模拟支付
-> 订单状态从 pending_payment 变为 pending_dispatch
```

当前尚未完成：

```txt
server/src/addresses/*
server/src/orders/*
server/src/payments/*
地址 CRUD 接口
订单价格预览接口
创建订单接口
订单列表接口
订单详情接口
取消订单接口
确认完成接口
发起 mock 支付接口
mock 支付成功接口
订单状态日志写入
payment_notify_logs 写入
前端地址页接入真实 API
前端下单页接入真实 API
前端订单列表/详情接入真实 API
支付结果页接入真实订单状态
```

当前小程序仍使用 mock 的重点位置：

```txt
miniapp/src/pages/address/list.vue
miniapp/src/pages/address/edit.vue
miniapp/src/pages/order/create.vue
miniapp/src/pages/order/list.vue
miniapp/src/pages/order/detail.vue
miniapp/src/pages/profile/index.vue 的统计数据
```

## 6. 距离 MVP 的差距

MVP 文档要求的商用闭环是：

```txt
用户登录
-> 浏览服务
-> 预约下单
-> 微信支付
-> 后台派单
-> 师傅接单
-> 上门服务
-> 用户确认和评价
-> 售后处理
-> 平台查看数据
```

当前已经具备：

```txt
用户登录基础能力
服务分类/服务列表/服务详情基础能力
小程序用户端主要页面骨架
后端统一响应/异常/JWT/日志/Prisma 地基
数据库核心表结构
```

当前未具备：

```txt
真实地址管理闭环
真实预约下单闭环
真实订单状态机
真实微信支付和支付回调
后台人工派单
员工/师傅账号登录
师傅任务列表和履约操作
服务照片上传
用户确认完成
评价
售后投诉
优惠券真实核销
会员次数卡真实核销
文件上传
消息通知
后台服务管理
后台员工管理
后台订单管理
后台数据看板
Excel 导出
财务/收入记录
生产部署和小程序提审
```

因此，当前项目距离 MVP 的主要差距不是 UI 组件，而是“真实业务状态流”和“三端管理能力”。

## 7. MVP 待完成清单

### 7.1 P0：必须完成

```txt
1. Day 7 用户端真实订单闭环
   - 地址 CRUD
   - 价格预览
   - 创建订单
   - 订单列表和详情
   - 取消订单
   - mock 支付推动订单到 pending_dispatch

2. 订单状态机
   - pending_payment
   - pending_dispatch
   - dispatched
   - accepted
   - on_the_way
   - in_service
   - pending_confirm
   - completed
   - cancelled
   - 全部状态变化写 order_status_logs

3. 微信支付
   - 创建微信预支付
   - 支付记录
   - 回调验签
   - 回调幂等
   - 支付成功后订单进入 pending_dispatch

4. 后台管理端
   - 创建 admin-web
   - 后台登录
   - 订单列表
   - 订单详情
   - 人工派单
   - 员工管理
   - 服务管理

5. 师傅端
   - 员工登录
   - 工作台
   - 待接单/进行中/历史任务
   - 接单/拒单
   - 上门打卡
   - 上传服务照片
   - 完成服务

6. 用户端订单后半程
   - 订单状态展示
   - 师傅信息展示
   - 服务照片展示
   - 确认完成
   - 评价入口和提交
   - 售后投诉入口和提交

7. 文件上传
   - 服务照片
   - 评价图片
   - 售后凭证
```

### 7.2 P1：上线前建议完成

```txt
优惠券基础能力
会员次数卡基础能力
消息通知
操作日志完整落库
后台数据看板
订单导出 Excel
师傅收入明细
售后工单消息
评价图片
基础财务结算记录
```

### 7.3 P2：上线后迭代

```txt
支付宝支付
自动派单
自动提现
复杂会员等级
积分体系
复杂营销活动
多城市
多门店
企业客户
内容安全审核
财务对账
复杂 BI
```

## 8. 推荐下一步

建议下一步不要直接做后台或支付，而是先完成 Day 7，因为它是 MVP 后续所有模块的基础数据源。

推荐执行顺序：

```txt
1. server 新增 AddressesModule
2. miniapp 地址列表/编辑页切真实接口
3. server 新增 OrdersModule 的 price-preview 和 create-order
4. miniapp 下单页切真实接口
5. server 新增订单列表、详情、取消、确认
6. miniapp 订单列表/详情切真实接口
7. server 新增 PaymentsModule mock 支付
8. miniapp 支付结果页接入 mock 支付
9. 扩展 contract-test 和 db-verify
10. 运行 server build、miniapp type-check、miniapp build:mp
```

Day 7 完成后，项目才真正进入 MVP 的“订单闭环开发阶段”。届时再二选一：

```txt
路线 A：先做 admin-web + 后台人工派单
路线 B：先做师傅端任务履约
```

从 MVP 闭环角度，建议优先：

```txt
Day 8：admin-web 后台订单管理和人工派单
Day 9：师傅端接单、打卡、上传照片、完成服务
Day 10：微信支付替换 mock 支付
```

## 9. 本次代码核查验证

本次执行过的验证：

```txt
server: npm run build
结果：通过

miniapp: pnpm type-check
结果：失败
```

`miniapp` 类型检查失败信息：

```txt
无法写入 miniapp/dist/tsconfig.tsbuildinfo：EPERM
无法写入 node_modules/.vue-global-types/vue_3.4_0.d.ts：EPERM
src/main.ts 引入的 src/App.vue 被识别为不是模块
```

判断：

```txt
前两个 EPERM 和当前执行环境/文件权限有关
App.vue 不是模块的问题需要后续单独复核 vue-tsc / tsconfig / App.vue 识别链路
```

这个问题不改变当前阶段判断，但会影响后续 Day 7 验收，必须在切真实接口前或切换过程中处理。

## 10. 一句话总结

项目当前不是“功能 MVP 阶段”，而是“MVP 地基完成、准备进入真实订单闭环”的阶段。Day 6 的 NestJS 后端迁移已经完成主干，Day 7 是当前最应该推进的节点；只有完成地址、订单、mock 支付真实化后，后续后台派单、师傅履约、微信支付、评价售后才有稳定业务基础。
