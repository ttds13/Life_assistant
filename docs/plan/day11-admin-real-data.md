# Day 11 Admin 真实数据库接入计划

## 1. 目标

当前 admin 端已经完成基础搭建，并且订单模块已经接入真实后端数据库：

```txt
已接入真实数据：
- 管理员登录 / 当前管理员 / 退出登录
- 订单列表
- 订单详情
- 管理员派单
- 管理员备注
- 可派单师傅选项

仍然使用模拟数据：
- 首页 dashboard
- 用户管理
- 地址管理
- 服务分类
- 服务项目
- 履约记录
- 师傅列表
- 师傅认证审核
- 师傅工作状态
- 支付记录
- 退款审核
- 提现审核
- 用户评价
- 售后工单
- 优惠券
- 会员卡
- 审核中心
- 系统管理中的框架示例页面
```

Day 11 的目标是制定一套分阶段方案，把 admin 剩余模块从 `admin/mock/life.mock.ts` 和 `/api/v1/life/*` 迁移到真实的 `server` 数据库接口，让 admin 端可以真实管理后端数据。

本计划不重写订单状态机，不修改已完成的订单流转逻辑。订单模块只作为真实接口接入模板。

## 2. 改造原则

```txt
admin 端所有真实业务接口统一走 /api/admin/*
admin 端请求必须经过管理员登录态校验
前端页面风格保持当前 Element Plus 卡片式后台风格
先逐模块替换数据源，不一次性移除所有 mock
读接口先落地，写接口后落地
写接口必须记录 AuditLog
订单状态机和 OrderTransitionService 不纳入本次改造
admin-saved 只作为备份，不直接修改
```

接口返回标准：

```ts
{
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
```

admin 前端可以在 API 层继续适配成现有页面需要的：

```ts
{
  config: LifeResourceConfig;
  list: LifeResourceRecord[];
  total: number;
}
```

这样可以先保留 `life/resource/index.vue` 和 `life/audit/index.vue` 的通用页面结构，再逐步替换为专用页面。

## 3. 当前 mock 入口清单

需要从下面这些入口迁移：

```txt
admin/src/api/life/index.ts
- getDashboard()                 -> /api/v1/life/dashboard
- getResourcePage()              -> /api/v1/life/resources/:module
- updateResourceStatus()         -> /api/v1/life/resources/:module/:id/status
- getAuditItems()                -> /api/v1/life/audits
- reviewAuditItem()              -> /api/v1/life/audits/:id/review

admin/mock/life.mock.ts
- dashboard mock
- resources mock
- audits mock
```

已经真实接入的订单相关接口保持现状：

```txt
GET  /api/admin/orders
GET  /api/admin/orders/:id
POST /api/admin/orders/:id/assign
PUT  /api/admin/orders/:id/remark
GET  /api/admin/staff/options
```

## 4. 数据库映射

| admin 模块 | 当前 module/type | 真实数据表 |
| --- | --- | --- |
| 首页统计 | dashboard | users, orders, payments, staff, reviews, tickets, refunds, withdraw_requests, audit_logs |
| 用户列表 | users | users, orders, payments |
| 地址管理 | addresses | user_addresses, users |
| 服务分类 | serviceCategories | service_categories, services |
| 服务项目 | services | services, service_categories, service_price_rules, service_images |
| 履约记录 | fulfillments | orders, service_checkins, service_photos, staff |
| 师傅列表 | staff | staff, orders, reviews, staff_income_records |
| 师傅工作状态 | staffStatus | staff, orders |
| 支付记录 | payments | payments, orders, users, payment_notify_logs |
| 退款审核 | refund | refunds, payments, orders, users |
| 提现审核 | withdraw | withdraw_requests, staff |
| 用户评价 | reviews | reviews, review_images, orders, users, staff, services |
| 售后工单 | ticket | tickets, ticket_messages, orders, users, staff |
| 优惠券 | coupons | coupons, user_coupons |
| 会员卡 | memberCards | member_cards, user_member_cards, member_card_records |
| 审核中心 | all | refunds, withdraw_requests, tickets, staff, audit_logs |
| 操作日志 | system/log | audit_logs, login_logs |
| 管理员 | system/user | admin_users |

## 5. 后端实施阶段

### 5.1 第一阶段：首页 dashboard

目标：先让 admin 首页脱离 mock，展示真实业务概览。

新增接口：

```txt
GET /api/admin/dashboard
```

返回内容：

```txt
metrics:
- 今日新增用户数
- 今日订单数
- 今日订单金额
- 待派单订单数
- 待处理审核数

trend:
- 最近 7 天订单数量
- 最近 7 天订单金额

statusDistribution:
- 订单状态分布

todos:
- 待派单订单
- 待退款审核
- 待提现审核
- 待处理售后工单

audits:
- 最近审核/操作动态
```

验收：

```txt
admin 首页刷新后不再请求 /api/v1/life/dashboard
dashboard 数字来自真实数据库
无数据时返回 0 和空数组，不让页面报错
```

### 5.2 第二阶段：用户与地址

新增接口：

```txt
GET /api/admin/users
GET /api/admin/users/:id
PUT /api/admin/users/:id/status

GET /api/admin/addresses
GET /api/admin/addresses/:id
```

功能边界：

```txt
用户列表支持 keyword/status/page/pageSize
keyword 匹配 nickname/phone/openid
用户状态只允许管理员禁用或恢复
地址先只读，不提供后台新增地址
```

审计：

```txt
PUT /api/admin/users/:id/status 写 AuditLog
```

验收：

```txt
用户列表、地址管理从真实 users 和 user_addresses 读取
禁用用户后数据库 status 更新
```

### 5.3 第三阶段：服务分类与服务项目

新增接口：

```txt
GET  /api/admin/service-categories
POST /api/admin/service-categories
GET  /api/admin/service-categories/:id
PUT  /api/admin/service-categories/:id
PUT  /api/admin/service-categories/:id/status

GET  /api/admin/services
POST /api/admin/services
GET  /api/admin/services/:id
PUT  /api/admin/services/:id
PUT  /api/admin/services/:id/status
```

功能边界：

```txt
服务分类支持新增、编辑、排序、启用、停用
服务项目支持新增、编辑、上下架
服务项目列表需要带出分类名称
图片和价格规则第一版可以只读或保留基础字段，后续再扩展完整编辑
```

审计：

```txt
新增/编辑/上下架服务分类写 AuditLog
新增/编辑/上下架服务项目写 AuditLog
```

验收：

```txt
服务分类和服务项目不再使用 mock
小程序服务列表能读取到 admin 维护后的服务数据
```

### 5.4 第四阶段：师傅管理

新增接口：

```txt
GET  /api/admin/staff
POST /api/admin/staff
GET  /api/admin/staff/:id
PUT  /api/admin/staff/:id
PUT  /api/admin/staff/:id/status
GET  /api/admin/staff/status
```

已有接口继续保留：

```txt
GET /api/admin/staff/options
```

功能边界：

```txt
师傅列表支持 keyword/status/workStatus/page/pageSize
师傅新增需要由 admin 后台创建初始账户
师傅状态支持启用/禁用
师傅工作状态先只读，来源于 staff.workStatus
师傅认证审核目前缺少独立认证资料表，第一版先基于 staff.status 表达 pending/active/disabled
```

数据缺口：

```txt
当前 schema 没有 staff_certifications 或 staff_audit_records 表。
如果后续需要真实身份证、证书、审核材料，需要新增认证资料表。
Day 11 第一版不强行扩 schema，先兼容现有 staff 表。
```

审计：

```txt
新增师傅写 AuditLog
编辑师傅写 AuditLog
启用/禁用师傅写 AuditLog
认证通过/驳回如果落地，也必须写 AuditLog
```

验收：

```txt
师傅列表和工作状态读取真实 staff
订单派单下拉仍可正常读取可用师傅
禁用师傅后不可作为可派单对象
```

### 5.5 第五阶段：履约记录

新增接口：

```txt
GET /api/admin/fulfillments
GET /api/admin/fulfillments/:orderId
```

数据来源：

```txt
orders
service_checkins
service_photos
staff
services
```

功能边界：

```txt
履约记录第一版只读
展示订单号、服务、师傅、打卡时间、照片数量、订单状态
详情展示打卡记录和服务照片
不允许 admin 直接修改订单履约状态
```

验收：

```txt
履约记录页面不再使用 fulfillments mock
师傅端上传的打卡和照片能在 admin 端看到
```

### 5.6 第六阶段：财务管理

新增接口：

```txt
GET /api/admin/payments
GET /api/admin/payments/:id

GET  /api/admin/refunds
GET  /api/admin/refunds/:id
POST /api/admin/refunds/:id/review

GET  /api/admin/withdraw-requests
GET  /api/admin/withdraw-requests/:id
POST /api/admin/withdraw-requests/:id/review
```

功能边界：

```txt
支付记录第一版只读
退款审核只改变 refunds.status，不直接重写订单状态机
提现审核只改变 withdraw_requests.status
真实支付渠道没有接入前，支付数据仍可能来自 mock 支付流程，但必须读真实 payments 表
```

审计：

```txt
退款审核写 AuditLog
提现审核写 AuditLog
```

验收：

```txt
支付记录读取真实 payments
退款审核读取真实 refunds
提现审核读取真实 withdraw_requests
审核后对应表 status 更新，AuditLog 有记录
```

### 5.7 第七阶段：评价与售后

新增接口：

```txt
GET /api/admin/reviews
GET /api/admin/reviews/:id
PUT /api/admin/reviews/:id/status

GET  /api/admin/tickets
GET  /api/admin/tickets/:id
POST /api/admin/tickets/:id/messages
POST /api/admin/tickets/:id/resolve
```

功能边界：

```txt
评价支持查看、隐藏、恢复展示
售后工单支持查看详情、追加管理员回复、标记已解决
不在售后工单接口中直接修改订单状态
如确实需要订单异常处理，后续单独走订单兼容接口设计
```

审计：

```txt
评价状态变更写 AuditLog
售后回复和结单写 AuditLog
```

验收：

```txt
评价列表读取真实 reviews
售后工单读取真实 tickets 和 ticket_messages
管理员处理记录能落库
```

### 5.8 第八阶段：营销管理

新增接口：

```txt
GET  /api/admin/coupons
POST /api/admin/coupons
GET  /api/admin/coupons/:id
PUT  /api/admin/coupons/:id
PUT  /api/admin/coupons/:id/status

GET  /api/admin/member-cards
POST /api/admin/member-cards
GET  /api/admin/member-cards/:id
PUT  /api/admin/member-cards/:id
PUT  /api/admin/member-cards/:id/status
```

功能边界：

```txt
优惠券支持创建、编辑、发布、停用
会员卡支持创建、编辑、发布、停用
用户领取优惠券、购买会员卡属于用户端流程，不在 admin 第一版中实现
admin 第一版只负责配置和上下架
```

审计：

```txt
优惠券新增/编辑/发布/停用写 AuditLog
会员卡新增/编辑/发布/停用写 AuditLog
```

验收：

```txt
优惠券页面读取真实 coupons
会员卡页面读取真实 member_cards
小程序后续可以读取 admin 配置后的营销数据
```

### 5.9 第九阶段：审核中心与操作日志

新增接口：

```txt
GET /api/admin/audits
POST /api/admin/audits/:id/review

GET /api/admin/audit-logs
GET /api/admin/login-logs
```

审核中心聚合来源：

```txt
staff pending
refunds pending
withdraw_requests pending
tickets open/pending
```

注意：

```txt
审核中心不是一张单独的万能表。
第一版可以做聚合查询，把不同业务表统一转换成 AuditItem 返回给前端。
审核提交时根据 type 分发到具体业务 service。
```

验收：

```txt
审核中心不再使用 audit mock
不同审核类型能进入各自真实业务表
审核完成后写 AuditLog
操作日志页面读取真实 audit_logs
```

### 5.10 第十阶段：系统管理页面

当前系统管理页面来自开源框架示例，和 Life Assistant 业务后台不是完全一致。

建议处理方式：

```txt
system/user:
  接入 admin_users，只做管理员查看和状态管理。
  管理员创建仍优先使用 seed 或脚本，不开放公开注册。

system/role:
  当前管理员权限先代码固定。
  第一版不做完整 RBAC。
  页面可以暂时隐藏，或只展示固定角色说明。

system/menu:
  当前菜单来自前端静态 lifeAdminRoutes。
  第一版不做后端动态菜单。

system/dict:
  业务字典暂时不强行接入。
  状态枚举优先放在后端常量和前端映射中。

system/config:
  暂不接生产配置写入。
  生产环境配置继续使用环境变量。

system/log:
  优先接入 audit_logs 和 login_logs。
```

## 6. 前端改造阶段

### 6.1 拆分 API 文件

当前 `admin/src/api/life/index.ts` 承担了订单、dashboard、resource、audit 多种职责。后续建议拆分：

```txt
admin/src/api/admin/dashboard.ts
admin/src/api/admin/users.ts
admin/src/api/admin/services.ts
admin/src/api/admin/staff.ts
admin/src/api/admin/fulfillments.ts
admin/src/api/admin/finance.ts
admin/src/api/admin/after-sales.ts
admin/src/api/admin/marketing.ts
admin/src/api/admin/audits.ts
admin/src/api/admin/orders.ts
```

兼容策略：

```txt
第一步保留 LifeAPI 对外导出，内部改为调用新模块 API
第二步页面逐步直接引用对应 admin API
第三步所有模块完成后移除 /api/v1/life 依赖
```

### 6.2 保留通用页面，逐步专用化

第一阶段可以继续使用：

```txt
admin/src/views/life/resource/index.vue
admin/src/views/life/audit/index.vue
```

但 API 层需要把真实后端字段转换成当前页面需要的字段。

当某个模块需要复杂表单时，再拆成专用页面：

```txt
服务项目编辑页
师傅详情页
退款审核详情页
售后工单详情页
优惠券编辑页
会员卡编辑页
```

### 6.3 mock 移除策略

```txt
不要一次性删除 admin/mock/life.mock.ts
每完成一个模块，就让该模块请求 /api/admin/*
确认页面稳定后，再从 mock 清单中标记该模块已废弃
所有业务模块完成后，再清理 /api/v1/life 相关 mock
```

## 7. 后端代码结构建议

按业务域新增 admin 模块，不把所有逻辑塞进一个控制器：

```txt
server/src/admin-dashboard/
server/src/admin-users/
server/src/admin-services/
server/src/admin-staff/
server/src/admin-fulfillments/
server/src/admin-finance/
server/src/admin-after-sales/
server/src/admin-marketing/
server/src/admin-audits/
server/src/admin-system/
```

每个模块保持统一结构：

```txt
*.controller.ts    路由、鉴权、DTO
*.service.ts       业务规则、审计、状态校验
*.repository.ts    Prisma 查询
dto/*.dto.ts       分页、筛选、写入参数
```

共用能力：

```txt
AdminAuthGuard
AdminAuditService
PrismaService
分页 DTO
日期范围 DTO
BigInt/Decimal 序列化
```

## 8. 字段与状态映射规则

后端真实表通常使用数字状态，前端页面目前使用字符串状态。建议在 admin presenter 中统一转换。

示例：

```txt
User.status:
1 -> active
0 -> disabled

Staff.status:
1 -> active
0 -> disabled
2 -> pending

Staff.workStatus:
0 -> offline
1 -> online
2 -> busy

ServiceCategory.status / Service.status:
1 -> active
0 -> disabled

Review.status:
1 -> published
0 -> rejected
2 -> pending

Coupon.status / MemberCard.status:
1 -> published
0 -> draft
```

要求：

```txt
前端不直接理解数据库数字状态
后端 admin presenter 负责状态转换
写接口入参使用字符串业务状态，service 层再映射为数据库值
```

## 9. 数据缺口与暂缓项

当前 schema 已覆盖大多数业务表，但仍有一些真实管理场景缺口：

```txt
师傅认证材料：
  当前没有 staff_certifications 表。
  只能用 staff.status 简化表达认证状态。

文件上传：
  schema 有 files 表，但后端上传接口还需要单独实现。
  服务图片、履约照片、认证材料后续都需要统一文件模块。

真实支付渠道：
  当前支付流程仍有 mock payment。
  admin 财务第一版只要求读取真实 payments/refunds 表。

完整 RBAC：
  当前管理员权限先代码固定。
  role/menu/dict/config 不作为 Day 11 第一优先级。

营销发放流程：
  coupons 和 member_cards 可以先做配置管理。
  user_coupons、user_member_cards 的发放和购买流程后续接用户端。
```

## 10. 推荐实施顺序

```txt
1. admin dashboard 接真实数据库
2. 用户列表、地址管理接真实数据库
3. 服务分类、服务项目接真实数据库并支持上下架
4. 师傅列表、师傅状态接真实数据库
5. 履约记录接真实数据库，只读展示
6. 支付记录、退款审核、提现审核接真实数据库
7. 评价、售后工单接真实数据库
8. 优惠券、会员卡接真实数据库
9. 审核中心聚合真实审核事项
10. 系统日志接 audit_logs/login_logs
11. 最后清理 /api/v1/life mock 依赖
```

优先级理由：

```txt
dashboard 可以最早暴露整体数据是否真实
用户、服务、师傅是订单运行的基础主数据
财务、售后、营销涉及写操作和审核，放在基础主数据稳定之后
系统管理和 RBAC 当前不是业务闭环的阻塞点，最后处理
```

## 11. 每阶段验收清单

每完成一个模块，都按下面清单审核：

```txt
后端：
- 接口路径是否为 /api/admin/*
- 是否经过 AdminAuthGuard
- 分页、keyword、status 是否可用
- BigInt 和 Decimal 是否正确序列化
- 写操作是否校验入参
- 写操作是否写 AuditLog
- 是否避免修改订单状态机

前端：
- 页面是否停止请求对应 /api/v1/life mock
- 列表是否展示真实数据库数据
- 空数据是否正常展示
- 筛选、分页、刷新是否正常
- 状态标签是否和真实状态一致
- 写操作成功后是否重新拉取真实数据

验证：
- server npm run build
- server 相关接口测试
- admin pnpm exec vue-tsc --noEmit
- admin pnpm run build-only
- 浏览器手动验证页面请求路径和数据变化
```

## 12. 最终完成标准

```txt
admin 业务模块不再依赖 admin/mock/life.mock.ts
admin/src/api/life/index.ts 中不再存在 LIFE_BASE_URL = /api/v1/life
所有业务数据均来自 server Prisma 真实数据库
所有 admin 写操作均写入 audit_logs
订单状态机相关实现保持不变
admin 可以真实管理用户、服务、师傅、财务、售后、营销数据
```

