# 生活助手项目精简经验与工程地基规划

## 1. 文档定位

本文档用于指导生活助手新项目开工。

它不做旧项目细节复盘，只提炼两类内容：

```txt
1. 之前项目中值得保留的经验
2. 新项目必须先规避的坑和必须建立的工程规则
```

目标是让新项目从第一天开始就有清晰骨架，不再重复踩这些坑：

```txt
日志混乱
Git 仓库污染
职责边界不清
Model 层膨胀
响应格式不统一
异常处理不统一
前后端请求约定不稳定
业务结构被特定场景绑死
```

## 2. 直接弃用的旧结构

以下旧项目特异性结构不进入生活助手项目。

## 2.1 业务特异性模块直接弃用

```txt
门禁设备
MQTT 设备通信
人脸识别上传
入馆/离馆日志
健身房通行权限
设备人员同步
团购券核销
设备 token
is_in_gym 状态
```

这些能力只属于健身房场景。生活助手项目只保留其中的抽象经验，不迁移代码。

## 2.2 散装 Express 结构不复用

不再沿用：

```txt
routes 里直接写业务
controller 里直接写 SQL
controller 里同时处理支付、订单、副作用
model 里混合数据库操作和业务编排
每个接口自己 try/catch
每个接口自己拼响应
到处 console.log
配置和密钥硬编码
```

新项目直接采用：

```txt
NestJS + Prisma + TypeScript
```

## 3. 保留的可复用经验

旧项目真正值得保留的不是代码，而是开发经验。

## 3.1 业务闭环优先

继续保留“先跑通主流程”的习惯。

生活助手第一版主流程：

```txt
用户登录
-> 浏览服务
-> 预约下单
-> 支付
-> 后台派单
-> 师傅接单
-> 上门服务
-> 用户确认
-> 评价/售后
```

不要一开始陷入复杂会员、自动派单、复杂营销。

## 3.2 模块化意识保留

旧项目按订单、支付、用户、设备等拆模块的思路可以保留。

新项目升级为 NestJS 模块：

```txt
AuthModule
UserModule
StaffModule
ServiceModule
OrderModule
PaymentModule
DispatchModule
FileModule
ReviewModule
TicketModule
CouponModule
MembershipModule
NotificationModule
AuditModule
DashboardModule
```

## 3.3 状态机经验保留

继续使用状态驱动业务。

生活助手核心状态：

```txt
订单状态
支付状态
派单状态
服务履约状态
售后工单状态
优惠券状态
会员次数卡状态
```

所有关键状态变化必须写日志。

## 3.4 幂等意识保留

继续保留这些经验：

```txt
状态条件更新
唯一业务单号
重复回调保护
重复核销保护
affectedRows 判断
唯一索引约束
```

生活助手必须重点保证：

```txt
支付回调幂等
退款回调幂等
优惠券核销幂等
会员次数卡扣减幂等
师傅接单幂等
订单状态变更幂等
```

## 3.5 外部服务封装经验保留

旧项目对微信、OSS、第三方平台做封装的思路保留。

新项目改成：

```txt
WechatAuthService
WechatPayService
FileStorageService
NotificationService
MapService
SmsService
```

所有配置都走环境变量，不写死在代码中。

## 4. 新项目结构骨架

## 4.1 根目录结构

```txt
Life_assistant/
  miniapp/        # uni-app 小程序，用户端和师傅端第一版共用
  admin-web/      # Vue3 管理后台
  server/         # NestJS 后端
  docs/           # 项目文档
```

## 4.2 后端结构

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

## 4.3 每个业务模块标准结构

以订单模块为例：

```txt
orders/
  orders.module.ts
  orders.controller.ts
  orders.service.ts
  orders.repository.ts
  dto/
    create-order.dto.ts
    cancel-order.dto.ts
  constants/
    order-status.ts
```

## 5. P0 工程规则

下面是新项目第一天必须执行的规则。

## 5.1 日志系统

不再依赖散落的 `console.log`。

必须建立：

```txt
requestId
请求日志
异常日志
订单状态日志
支付回调日志
后台操作日志
```

建议文件：

```txt
common/middleware/request-id.middleware.ts
common/interceptors/request-logger.interceptor.ts
common/logger/app-logger.service.ts
orders/order-status-log.service.ts
payments/payment-notify-log.service.ts
audit/audit-log.service.ts
```

日志规则：

```txt
所有请求带 requestId
所有异常响应带 requestId
支付回调原文入库
订单状态变化入库
后台关键操作入库
生产环境不随意 console.log
```

必须落库的日志表：

```txt
audit_logs
order_status_logs
payment_notify_logs
```

## 5.2 Git 和项目卫生

第一天必须创建：

```txt
.gitignore
.env.example
README.md
```

`.gitignore` 必须包含：

```txt
node_modules/
dist/
build/
.env
.env.*
!.env.example
logs/
*.log
uploads/
cert/
*.pem
*.key
*.p12
coverage/
```

禁止提交：

```txt
真实密钥
真实证书
真实支付配置
本地日志
上传文件
node_modules
```

提交信息建议：

```txt
feat: 新功能
fix: 修复问题
docs: 文档
refactor: 重构
chore: 工程配置
test: 测试
```

## 5.3 职责收窄

必须明确：

```txt
Controller 只处理 HTTP
DTO 只做参数校验
Service 只做业务编排
Repository / Prisma 只做数据库操作
ExternalService 只封装外部平台
Filter 统一处理异常
Interceptor 统一处理响应
Guard 统一处理权限
```

禁止：

```txt
Controller 写 SQL
Controller 调多个外部平台并处理复杂状态
Repository 读取 req/res
Repository 返回 HTTP 状态码
Repository 拼响应结构
Service 直接操作响应对象
```

正确调用链：

```txt
Controller
-> Service
-> Repository / Prisma
-> ExternalService
-> LogService
```

## 5.4 Model / Repository 只管数据库

Repository 允许做：

```txt
create
findById
findMany
update
softDelete
count
exists
事务内读写
查询条件组装
```

Repository 不允许做：

```txt
支付签名
微信接口调用
短信发送
文件上传
通知推送
订单业务编排
响应格式封装
权限判断
```

复杂业务放在 Service。

## 5.5 统一响应格式

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

只允许这些接口例外：

```txt
微信支付回调
支付宝支付回调
第三方平台要求的特殊响应
```

实现方式：

```txt
ResponseTransformInterceptor
SkipResponseTransform decorator
```

## 5.6 统一异常处理

不要每个接口重复写 `try/catch`。

错误统一返回：

```json
{
  "code": 50002,
  "message": "订单状态不允许当前操作",
  "data": null,
  "requestId": "req_xxx",
  "timestamp": "2026-05-13T10:00:00.000Z"
}
```

必须建立：

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

Controller 示例目标：

```txt
Controller 不手写 try/catch
业务错误抛 BusinessException
参数错误由 DTO + ValidationPipe 处理
系统异常由 GlobalExceptionFilter 兜底
```

## 5.7 前后端请求规范

前端请求不能每个页面自己随便写。

小程序端和后台端都必须统一封装请求层。

小程序端：

```txt
miniapp/src/api/request.ts
miniapp/src/api/modules/
miniapp/src/types/api.ts
```

后台端：

```txt
admin-web/src/api/request.ts
admin-web/src/api/modules/
admin-web/src/types/api.ts
```

统一请求规则：

```txt
所有请求带 Authorization
所有请求带 X-Request-Source
所有响应统一判断 code
code !== 0 统一错误提示
401 统一跳登录
403 统一无权限提示
网络错误统一提示
重复提交要禁用按钮
分页参数统一 page/pageSize
时间格式统一 ISO 或 yyyy-MM-dd HH:mm:ss
```

请求头建议：

```txt
Authorization: Bearer <token>
X-Request-Source: miniapp / admin-web / staff
X-Client-Version: 1.0.0
```

前端不直接相信：

```txt
支付成功结果
订单金额
优惠金额
订单状态
```

这些必须以后端结果为准。

## 6. 前后端接口命名规范

## 6.1 后端接口前缀

```txt
/api/auth
/api/users
/api/staff
/api/services
/api/orders
/api/payments
/api/admin
```

## 6.2 管理后台接口

后台接口统一放到：

```txt
/api/admin/*
```

示例：

```txt
GET  /api/admin/orders
POST /api/admin/orders/:id/assign
GET  /api/admin/services
POST /api/admin/services
```

## 6.3 用户端接口

示例：

```txt
GET  /api/services
GET  /api/services/:id
POST /api/orders
GET  /api/orders
GET  /api/orders/:id
POST /api/orders/:id/cancel
```

## 6.4 师傅端接口

示例：

```txt
GET  /api/staff/orders
GET  /api/staff/orders/:id
POST /api/staff/orders/:id/accept
POST /api/staff/orders/:id/reject
POST /api/staff/orders/:id/checkin
POST /api/staff/orders/:id/complete
```

## 7. Day 1 执行顺序

第一天先做地基，不急着做完整业务。

```txt
1. 创建根目录结构
2. 创建 .gitignore
3. 创建 .env.example
4. 创建 README
5. 初始化 server
6. 初始化 Prisma
7. 建立统一响应
8. 建立统一异常
9. 建立 requestId
10. 建立请求日志
11. 建立 ServiceCategory / Service 模型
12. seed 服务分类和服务数据
13. 提供服务分类和服务列表接口
14. 初始化 miniapp
15. 初始化 admin-web
16. 两端统一封装 request
17. 小程序首页展示服务数据
18. 后台服务列表展示服务数据
```

Day 1 验收标准：

```txt
后端能启动
数据库能迁移
seed 能写入
接口成功返回统一格式
接口失败返回统一异常格式
日志中能看到 requestId
小程序能读取真实服务数据
后台能读取真实服务数据
仓库没有密钥、日志、证书、node_modules
```

## 8. 第一阶段项目骨架目标

第一阶段只实现地基和最小服务展示：

```txt
健康检查
统一响应
统一异常
统一日志
Prisma 数据库连接
服务分类表
服务项目表
seed 数据
小程序首页
后台服务列表
前后端请求封装
```

不要在第一阶段做：

```txt
支付
订单全流程
优惠券
会员卡
自动派单
复杂后台权限
文件上传
```

## 9. 最终开工准则

以后写任何模块前，都按这个顺序：

```txt
先定义 DTO
再定义响应结构
再写 Service 流程
再写 Repository 数据库操作
再补日志
再补异常
再接前端请求
最后做页面状态
```

每个模块完成时必须检查：

```txt
有没有统一响应
有没有统一异常
有没有 requestId
有没有必要的业务日志
Repository 是否只做数据库操作
前端请求是否走统一封装
是否有加载、空状态、错误状态
是否有权限校验
是否有幂等保护
```

## 10. 一句话总结

新项目不要复制旧项目的具体结构，只继承旧项目的经验：

```txt
业务闭环优先
模块化
状态机
幂等
外部服务封装
关键动作留痕
```

同时从第一天补齐旧项目踩过的坑：

```txt
日志系统
Git 卫生
职责边界
统一响应
统一异常
前后端请求规范
```

