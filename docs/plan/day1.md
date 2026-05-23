# Day 1 项目地基搭建计划

## 1. 文档目标

本文档根据 `docs/standards/development.md` 重新制定，用于指导生活助手项目第一天开工。

Day 1 不追求业务功能完整，目标是把项目地基搭好：

```txt
环境准备完成
三端项目骨架确定
后端工程规范落地
日志系统初版落地
Git 和环境变量规范落地
统一响应格式落地
统一异常处理落地
Model / Repository 职责收窄
前后端请求规范落地
基础页面规划确定
数据库与前后端最小链路打通
```

一天结束时，至少要跑通：

```txt
服务分类和服务项目 seed 入库
-> 后端通过统一响应格式返回服务数据
-> 小程序首页通过统一 request 读取服务数据
-> 后台服务列表通过统一 request 读取服务数据
-> 请求日志中能看到 requestId
-> 异常响应中能看到统一错误格式
```

## 2. Day 1 总原则

## 2.1 不迁移旧项目特异性结构

Day 1 不引入以下内容：

```txt
门禁设备
MQTT
人脸识别
入馆/离馆日志
健身房通行权限
设备人员同步
团购券核销
设备 token
```

这些不属于生活助手项目地基，直接弃用。

## 2.2 只保留可复用经验

保留这些方法论：

```txt
业务闭环优先
模块化
状态机
幂等
外部服务封装
关键动作留痕
```

## 2.3 Day 1 先建规则，再写业务

第一天必须先把工程规则落好：

```txt
日志系统
Git 项目卫生
职责边界
统一响应
统一异常
前后端请求规范
```

服务分类和服务列表只是用于验证地基是否可用。

## 3. 环境准备

## 3.1 本机基础环境

需要准备：

```txt
Node.js 20 LTS 或以上
pnpm 9 或以上
Git
MySQL 8
Redis 预留，可 Day 1 不启动
VS Code
HBuilderX 或 uni-app CLI
微信开发者工具仅用于预览、真机调试、上传，不作为主要开发工具
```

检查命令：

```txt
node -v
pnpm -v
git --version
mysql --version
```

## 3.2 数据库准备

Day 1 建议使用 MySQL 8。

数据库建议：

```txt
database: life_assistant_dev
charset: utf8mb4
timezone: +08:00
```

如果当天 MySQL 环境阻塞，可以临时用 SQLite 打通 Prisma 链路，但商用开发必须尽快切回 MySQL。

## 3.3 账号和平台准备

Day 1 只需要准备字段，不强接平台：

```txt
微信小程序 AppID 预留
微信支付商户号预留
对象存储 OSS/COS 配置预留
地图服务 Key 预留
短信服务配置预留
```

真实密钥不写入代码，不写入文档。

## 4. 根目录架构

项目根目录：

```txt
Life_assistant/
  miniapp/        # uni-app 小程序，用户端和师傅端第一版共用
  admin-web/      # Vue3 管理后台
  server/         # NestJS 后端
  docs/           # 规划、架构、接口和经验文档
```

Day 1 必须创建：

```txt
.gitignore
.env.example
README.md
docs/
```

## 5. Git 和项目卫生

## 5.1 .gitignore

第一天必须建立 `.gitignore`，至少包含：

```gitignore
node_modules/
dist/
build/
.output/

.env
.env.*
!.env.example

logs/
*.log
server.log
test-log.txt

uploads/
cert/
*.pem
*.key
*.p12

coverage/
.DS_Store
Thumbs.db
```

禁止提交：

```txt
真实密钥
真实证书
支付配置
本地日志
上传文件
node_modules
```

## 5.2 .env.example

Day 1 创建根目录或 `server/.env.example`：

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=
JWT_SECRET=
REDIS_URL=

WECHAT_APP_ID=
WECHAT_APP_SECRET=
WECHAT_PAY_MCH_ID=
WECHAT_PAY_API_V3_KEY=
WECHAT_PAY_CERT_SERIAL_NO=
WECHAT_PAY_PRIVATE_KEY_PATH=
WECHAT_PAY_NOTIFY_URL=

OSS_REGION=
OSS_BUCKET=
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
```

## 5.3 README

README 第一版必须包含：

```txt
项目结构
环境要求
安装依赖
数据库初始化
后端启动命令
小程序启动命令
后台启动命令
常用命令
环境变量说明
```

## 6. 后端架构准备

## 6.1 技术栈

```txt
NestJS
TypeScript
Prisma
MySQL
Swagger
class-validator
class-transformer
```

## 6.2 后端目录规划

```txt
server/src/
  main.ts
  app.module.ts
  common/
    decorators/
    errors/
    filters/
    guards/
    interceptors/
    logger/
    middleware/
    pipes/
  config/
  prisma/
  health/
  auth/
  users/
  staff/
  services/
  orders/
  payments/
  dispatch/
  files/
  reviews/
  tickets/
  coupons/
  memberships/
  notifications/
  audit/
  dashboard/
```

## 6.3 Day 1 必建模块

Day 1 只实现地基模块：

```txt
ConfigModule
PrismaModule
HealthModule
ServicesModule
CommonModule
```

其中 `ServicesModule` 只做服务分类和服务列表，用来验证数据库和前后端请求链路。

## 6.4 后端主干模块预留

Day 1 不实现，但目录和边界先规划：

```txt
AuthModule          登录认证
UsersModule         用户
StaffModule         服务人员
ServicesModule      服务分类和服务项目
OrdersModule        订单
PaymentsModule      支付
DispatchModule      派单
FilesModule         文件上传
ReviewsModule       评价
TicketsModule       售后工单
CouponsModule       优惠券
MembershipsModule   会员次数卡
NotificationsModule 消息通知
AuditModule         操作日志
DashboardModule     数据看板
```

## 7. 后端开发规范落地

## 7.1 职责边界

Day 1 必须按这个边界写代码：

```txt
Controller 只处理 HTTP 入参和调用 Service
DTO 只做参数校验
Service 只做业务流程编排
Repository / Prisma 只做数据库操作
ExternalService 只封装外部平台
Filter 统一处理异常
Interceptor 统一处理响应
Guard 统一处理权限
```

禁止：

```txt
Controller 写 SQL
Controller 拼统一响应
Controller 大量 try/catch
Repository 读取 req/res
Repository 调支付、短信、文件上传
Service 操作 res 对象
```

## 7.2 业务模块标准结构

以 `services` 模块为 Day 1 示例：

```txt
services/
  services.module.ts
  services.controller.ts
  services.service.ts
  services.repository.ts
  dto/
    query-services.dto.ts
  constants/
    service-status.ts
```

## 8. 统一响应格式

普通业务接口统一返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "requestId": "req_xxx",
  "timestamp": "2026-05-13T10:00:00.000Z"
}
```

分页接口统一返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "items": [],
    "page": 1,
    "pageSize": 20,
    "total": 0
  },
  "requestId": "req_xxx",
  "timestamp": "2026-05-13T10:00:00.000Z"
}
```

Day 1 必须实现：

```txt
ResponseTransformInterceptor
SkipResponseTransform decorator
```

例外接口：

```txt
微信支付回调
支付宝支付回调
第三方平台要求的特殊响应
```

Day 1 暂不实现支付回调，但装饰器要预留。

## 9. 统一异常处理

## 9.1 错误返回格式

```json
{
  "code": 40002,
  "message": "服务已下架",
  "data": null,
  "requestId": "req_xxx",
  "timestamp": "2026-05-13T10:00:00.000Z"
}
```

## 9.2 Day 1 必须实现

```txt
BusinessException
ErrorCode enum
GlobalExceptionFilter
ValidationPipe
```

错误码分段：

```txt
10000 通用错误
20000 认证权限
30000 用户员工
40000 服务价格
50000 订单
60000 支付
70000 优惠券会员
80000 文件上传
90000 外部平台
```

## 9.3 Controller 规则

Controller 不写重复 `try/catch`。

目标写法：

```txt
Controller 接收 DTO
调用 Service
直接返回 Service 结果
业务错误抛 BusinessException
参数错误交给 ValidationPipe
系统异常交给 GlobalExceptionFilter
```

## 10. 日志系统规划

## 10.1 Day 1 日志目标

第一天至少实现：

```txt
requestId
请求日志
异常日志
统一日志服务
订单状态日志表预留
支付回调日志表预留
后台操作日志表预留
```

## 10.2 日志文件规划

```txt
common/middleware/request-id.middleware.ts
common/interceptors/request-logger.interceptor.ts
common/logger/app-logger.service.ts
common/logger/logger.module.ts
audit/audit-log.service.ts
orders/order-status-log.service.ts
payments/payment-notify-log.service.ts
```

Day 1 如果订单和支付模块不实现，先在 Prisma 中预留表结构，或在文档中明确后续建表。

## 10.3 请求日志字段

```txt
requestId
method
url
statusCode
durationMs
source
ip
userAgent
userId
staffId
adminId
```

## 10.4 必须落库的业务日志表

### audit_logs

```txt
id
operator_type
operator_id
action
target_type
target_id
before_json
after_json
remark
request_id
ip
created_at
```

### order_status_logs

```txt
id
order_id
from_status
to_status
operator_type
operator_id
reason
request_id
created_at
```

### payment_notify_logs

```txt
id
payment_id
order_id
channel
notify_type
raw_body
verify_status
handle_status
error_message
request_id
created_at
```

## 11. 数据库和 Prisma 规划

## 11.1 Day 1 实际使用模型

```txt
ServiceCategory
Service
```

## 11.2 Day 1 预留模型

```txt
User
Staff
AdminUser
AuditLog
OrderStatusLog
PaymentNotifyLog
```

订单、支付、派单后续再完整建模。

## 11.3 ServiceCategory

```txt
id
name
icon
sortOrder
status
createdAt
updatedAt
```

## 11.4 Service

```txt
id
categoryId
name
description
basePrice
priceUnit
coverImage
status
sortOrder
createdAt
updatedAt
```

## 11.5 Seed 数据

服务分类：

```txt
日常保洁
深度保洁
家电清洗
水电维修
```

服务项目：

```txt
日常保洁 2 小时
深度保洁 4 小时
空调清洗
油烟机清洗
水龙头维修
```

## 12. 后端接口规划

Day 1 只做最小接口：

```txt
GET /api/health
GET /api/service-categories
GET /api/services
GET /api/services/:id
```

服务列表参数：

```txt
keyword
categoryId
status
page
pageSize
```

所有普通接口必须走统一响应格式。

## 13. 前后端请求规范

## 13.1 请求头

统一请求头：

```txt
Authorization: Bearer <token>
X-Request-Source: miniapp / admin-web / staff
X-Client-Version: 1.0.0
```

Day 1 暂无登录时，`Authorization` 可以为空，但请求封装要预留。

## 13.2 小程序请求封装

目录：

```txt
miniapp/src/api/request.ts
miniapp/src/api/modules/services.ts
miniapp/src/types/api.ts
```

规则：

```txt
统一 baseURL
统一处理 code
统一处理 message
统一处理 401
统一处理 403
统一处理网络错误
统一加载和错误提示
```

## 13.3 后台请求封装

目录：

```txt
admin-web/src/api/request.ts
admin-web/src/api/modules/services.ts
admin-web/src/types/api.ts
```

规则：

```txt
统一 Axios 实例
统一 token 注入
统一错误提示
统一分页参数
统一响应解包
统一 401 跳登录
```

## 13.4 前端不得直接相信的数据

后续业务中，前端不得直接相信：

```txt
订单金额
优惠金额
支付成功结果
订单状态
师傅收入
```

这些必须以后端返回和后端状态为准。

## 14. 小程序页面规划

Day 1 只做页面骨架和首页视觉，不做完整业务。

## 14.1 Tab 规划

第一版小程序建议：

```txt
首页
订单
我的
```

师傅端第一版在角色入口中进入，不单独拆小程序。

## 14.2 Day 1 页面

```txt
/pages/home/index
/pages/service/detail
/pages/order/list
/pages/profile/index
/pages/staff/dashboard
```

## 14.3 Day 1 首页结构

```txt
城市定位 / 问候语
搜索框
服务分类宫格
优惠活动占位
热门服务卡片
底部 Tab
```

## 14.4 Day 1 小程序组件

```txt
ServiceCategoryGrid
ServiceCard
PriceText
EmptyState
LoadingState
BottomActionBar
```

## 14.5 小程序基础视觉

```txt
页面背景：#F5F7FA
卡片背景：#FFFFFF
主色：#1677FF
成功色：#16A34A
警告色：#F59E0B
错误色：#EF4444
卡片圆角：8px
页面左右边距：16px
按钮高度：44px
```

## 15. 管理后台页面规划

## 15.1 Day 1 页面

```txt
/login
/dashboard
/services
/orders
/staff
```

## 15.2 Day 1 后台布局

```txt
左侧菜单
顶部栏
内容区
服务列表表格
订单列表占位
员工列表占位
```

## 15.3 服务列表字段

```txt
服务名称
分类
基础价格
价格单位
状态
排序
创建时间
操作
```

Day 1 操作按钮只做占位：

```txt
查看
编辑
```

不要求真正编辑服务。

## 16. 三端主干划分

## 16.1 小程序主干

```txt
用户浏览主干：首页 -> 服务详情 -> 下单预留
订单主干：订单列表 -> 订单详情预留
我的主干：个人信息 -> 地址/优惠券/客服预留
师傅主干：工作台 -> 任务列表预留
```

## 16.2 后台主干

```txt
经营看板
订单调度
员工管理
服务管理
营销管理
售后管理
财务统计
系统设置
```

Day 1 只实现：

```txt
经营看板占位
服务管理列表
订单管理占位
员工管理占位
```

## 16.3 后端主干

```txt
认证主干
服务主干
订单主干
支付主干
派单主干
履约主干
售后主干
营销主干
日志审计主干
```

Day 1 实现：

```txt
服务主干最小查询
日志审计地基
统一响应地基
统一异常地基
Prisma 地基
```

## 17. Day 1 时间安排

## 17.1 第 0.5 小时：环境确认

完成：

```txt
Node
pnpm
Git
MySQL
VS Code
uni-app 开发工具
```

验收：

```txt
node -v 可用
pnpm -v 可用
mysql 可连接
```

## 17.2 第 1 小时：仓库和项目卫生

完成：

```txt
.gitignore
.env.example
README.md
根目录结构
```

验收：

```txt
仓库不包含密钥、日志、证书、node_modules
README 有启动说明框架
```

## 17.3 第 2 小时：后端 NestJS 地基

完成：

```txt
server 初始化
ConfigModule
PrismaModule
HealthModule
全局 /api 前缀
CORS
Swagger
```

验收：

```txt
GET /api/health 可访问
Swagger 可访问
```

## 17.4 第 3 小时：统一响应、异常、日志

完成：

```txt
RequestIdMiddleware
ResponseTransformInterceptor
BusinessException
ErrorCode enum
GlobalExceptionFilter
ValidationPipe
RequestLoggerInterceptor
AppLoggerService
```

验收：

```txt
成功接口返回统一格式
错误接口返回统一格式
日志中出现 requestId
```

## 17.5 第 4 小时：数据库和服务模型

完成：

```txt
Prisma schema
ServiceCategory
Service
AuditLog 预留
OrderStatusLog 预留
PaymentNotifyLog 预留
seed 脚本
```

验收：

```txt
迁移成功
seed 成功
数据库有服务分类和服务项目
```

## 17.6 第 5 小时：服务接口

完成：

```txt
GET /api/service-categories
GET /api/services
GET /api/services/:id
ServicesController
ServicesService
ServicesRepository
QueryServicesDto
```

验收：

```txt
接口能返回数据库数据
分页结构统一
参数错误走统一异常
Repository 只做数据库查询
```

## 17.7 第 6 小时：小程序骨架

完成：

```txt
miniapp 初始化
基础样式变量
request 封装
services API 模块
首页
服务详情占位
订单页占位
我的页占位
```

验收：

```txt
小程序能启动
首页能展示真实服务分类
首页能展示真实服务卡片
加载、空状态、错误状态可用
```

## 17.8 第 7 小时：后台骨架

完成：

```txt
admin-web 初始化
Element Plus
Router
Pinia
request 封装
后台基础布局
服务列表页
订单页占位
员工页占位
```

验收：

```txt
后台能启动
服务列表能展示真实数据
接口错误能统一提示
```

## 17.9 第 8 小时：总体验收和文档补齐

完成：

```txt
README 更新
启动命令记录
数据库命令记录
接口地址记录
Day 2 待办记录
```

验收：

```txt
server 可启动
miniapp 可启动
admin-web 可启动
数据库 seed 可重复执行
前后端链路跑通
```

## 18. Day 1 不做事项

第一天明确不做：

```txt
微信真实登录
微信支付
订单完整流程
师傅接单流程
后台完整权限
文件上传
优惠券
会员次数卡
自动派单
生产部署
复杂 UI
```

## 19. Day 1 最终验收清单

必须全部满足：

```txt
环境检查完成
Git 忽略规则完成
.env.example 完成
README 初版完成
server 初始化完成
Prisma 连接数据库成功
统一响应完成
统一异常完成
requestId 完成
请求日志完成
服务分类和服务项目入库
服务接口返回统一格式
小程序首页展示真实服务数据
后台服务列表展示真实服务数据
前后端 request 封装完成
页面规划和主干划分明确
```

## 20. Day 2 进入方向

Day 1 完成后，Day 2 再进入：

```txt
AuthModule
后台管理员登录
员工账号模型
用户微信登录预留
JWT 鉴权
前端登录态
后台登录态
```

Day 3 再进入：

```txt
服务管理 CRUD
服务上下架
价格配置
服务详情编辑
```

Day 4 再进入：

```txt
预约下单
订单状态机
订单日志
```
