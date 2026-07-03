# Day 6 NestJS 后端并行迁移计划

更新日期：2026-05-27

## 1. 目标

本计划用于把当前 `rear` 中已经跑通的后端能力，并行复制迁移到符合 `docs/plan/day1.md` 规划的 `server` 架构中。

本次迁移的核心原则：

```txt
不改动现有 rear 代码
不破坏当前 miniapp 可用链路
新建 server 作为 NestJS 后端
保持现有 API 路径、响应结构和错误码兼容
以契约测试验证前端兼容性
以 Prisma / MySQL 校验数据库操作准确性
```

迁移完成后的目标结构：

```txt
Life_assistant/
  miniapp/        当前小程序端，优先保持少改或不改
  rear/           当前 Node HTTP 原型后端，迁移期间保留
  server/         新建 NestJS 后端，逐步替代 rear
  admin-web/      暂不实现，仅保留后续管理端方向
  docs/
```

本计划只迁移后端 API，不实现 `admin-web` 可视化管理后台。

## 2. 当前 rear 能力盘点

当前 `rear` 是 Node.js 原生 HTTP 服务，不是 NestJS。它已经实现以下能力：

```txt
HTTP 服务启动
手写路由
全局 /api 前缀
CORS
requestId
统一响应
统一异常
请求日志
服务分类查询
服务列表查询
服务详情查询
模拟登录
微信登录接口占位
JWT 签发与校验
获取当前用户
更新用户资料
Prisma / MySQL 访问
JSON fallback 模式
MySQL seed 脚本
后端契约测试
```

当前主要文件对应关系：

```txt
rear/src/app.js
rear/src/main.js
rear/src/common/http/response.js
rear/src/common/errors/business-error.js
rear/src/common/errors/error-code.js
rear/src/common/logger/app-logger.js
rear/src/common/middleware/auth.js
rear/src/common/prisma.js
rear/src/common/serialize.js
rear/src/config/env.js
rear/src/services/
rear/src/auth/
rear/src/users/
rear/prisma/schema.prisma
rear/scripts/seed-db.js
rear/scripts/contract-test.js
```

## 3. 迁移边界

### 3.1 本次必须迁移

```txt
server NestJS 项目骨架
ConfigModule
PrismaModule
CommonModule
HealthModule
ServicesModule
AuthModule
UsersModule
统一响应 Interceptor
统一异常 Filter
requestId Middleware
请求日志 Interceptor
JWT Guard
Prisma schema 与迁移文件
MySQL seed 脚本
契约测试
Swagger 文档
```

### 3.2 本次暂不实现

```txt
admin-web 管理后台页面
管理员可视化 CRUD
订单真实闭环
支付真实闭环
师傅端真实接单接口
文件上传
Redis
生产部署
复杂 RBAC
```

### 3.3 保持兼容的 API

迁移后 `server` 必须先兼容这些路径：

```txt
GET  /api/health
GET  /api/service-categories
GET  /api/services
GET  /api/services/:id
POST /api/auth/wechat-login
POST /api/auth/mock-login
GET  /api/auth/me
PUT  /api/auth/profile
POST /api/dev/seed
```

说明：

```txt
/api/dev/seed 在 server 中应明确区分 MySQL seed 与 JSON fallback。
默认 DB_MODE=prisma 时，dev seed 必须写 MySQL，不能只写 JSON。
```

## 4. 目标 server 技术栈

```txt
NestJS
TypeScript
Prisma
MySQL
Swagger / OpenAPI
class-validator
class-transformer
JWT
pnpm 或 npm，优先跟项目实际包管理保持一致
```

建议本地端口：

```txt
rear    http://localhost:3000/api  迁移期间保留
server  http://localhost:3100/api  迁移验证端口
```

最终切换后：

```txt
server  http://localhost:3000/api
rear    停止使用或归档
```

迁移期间不要让 `rear` 和 `server` 抢占同一个端口。

## 5. 目标目录结构

```txt
server/
  package.json
  tsconfig.json
  nest-cli.json
  .env.example
  README.md
  prisma/
    schema.prisma
    migrations/
  scripts/
    seed-db.ts
    contract-test.ts
  src/
    main.ts
    app.module.ts
    config/
      env.schema.ts
      configuration.ts
    common/
      decorators/
        skip-response-transform.decorator.ts
        public.decorator.ts
      errors/
        business-exception.ts
        error-code.ts
      filters/
        global-exception.filter.ts
      guards/
        jwt-auth.guard.ts
      interceptors/
        response-transform.interceptor.ts
        request-logger.interceptor.ts
      logger/
        app-logger.service.ts
      middleware/
        request-id.middleware.ts
      serialize/
        serialize.ts
    prisma/
      prisma.module.ts
      prisma.service.ts
    health/
      health.module.ts
      health.controller.ts
    services/
      services.module.ts
      services.controller.ts
      services.service.ts
      services.repository.ts
      dto/
        query-services.dto.ts
      constants/
        service-status.ts
    auth/
      auth.module.ts
      auth.controller.ts
      auth.service.ts
      dto/
        mock-login.dto.ts
        wechat-login.dto.ts
        update-profile.dto.ts
    users/
      users.module.ts
      users.repository.ts
    dev/
      dev.module.ts
      dev.controller.ts
      dev.service.ts
```

## 6. rear 到 server 的映射关系

| rear 文件 | server 目标 | 迁移说明 |
|---|---|---|
| `rear/src/main.js` | `server/src/main.ts` | NestFactory 启动、全局 prefix、CORS、Swagger、ValidationPipe |
| `rear/src/app.js` | `AppModule` + 各模块 Controller | 手写路由改为 Nest Controller 装饰器 |
| `common/http/response.js` | `ResponseTransformInterceptor` | 保持 `code/message/data/requestId/timestamp` |
| `common/errors/business-error.js` | `BusinessException` | 保持 code/httpStatus/data 语义 |
| `common/errors/error-code.js` | `ErrorCode enum` | 错误码必须兼容 miniapp |
| `common/logger/app-logger.js` | `AppLoggerService` + `RequestLoggerInterceptor` | 请求日志字段保持一致 |
| `common/middleware/auth.js` | `JwtAuthGuard` | Bearer token 校验 |
| `common/prisma.js` | `PrismaService` | PrismaClient 生命周期由 Nest 管理 |
| `common/serialize.js` | `serialize.ts` | BigInt / Decimal / Date 输出兼容 |
| `services/*` | `ServicesModule` | 保持公开接口返回结构 |
| `auth/*` | `AuthModule` | mock-login、wechat-login、me、profile |
| `users/*` | `UsersModule` | 用户数据库访问 |
| `scripts/seed-db.js` | `scripts/seed-db.ts` | 默认写 MySQL |
| `scripts/contract-test.js` | `scripts/contract-test.ts` | 不能硬编码服务 ID |

## 7. 迁移步骤

### Step 1：新建 server，不改 rear

执行目标：

```txt
创建 server/ NestJS 项目
安装依赖
配置 TypeScript
配置启动脚本
配置 .env.example
配置 README 初版
```

建议脚本：

```json
{
  "scripts": {
    "dev": "nest start --watch",
    "start": "node dist/main.js",
    "build": "nest build",
    "lint": "eslint \"src/**/*.ts\"",
    "test:contract": "tsx scripts/contract-test.ts",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio",
    "seed:db": "tsx scripts/seed-db.ts"
  }
}
```

验收：

```txt
server 能启动
GET /api/health 返回 NestJS 版本的统一响应
Swagger 可访问
```

### Step 2：迁移配置和基础设施

实现：

```txt
ConfigModule
全局 /api prefix
CORS
ValidationPipe
RequestIdMiddleware
ResponseTransformInterceptor
GlobalExceptionFilter
RequestLoggerInterceptor
AppLoggerService
SkipResponseTransform decorator
```

必须保持响应格式：

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "requestId": "req_xxx",
  "timestamp": "2026-05-27T00:00:00.000Z"
}
```

错误格式：

```json
{
  "code": 40001,
  "message": "服务不存在",
  "data": null,
  "requestId": "req_xxx",
  "timestamp": "2026-05-27T00:00:00.000Z"
}
```

验收：

```txt
成功响应字段完整
业务异常字段完整
参数校验错误字段完整
日志中有 requestId/method/url/statusCode/durationMs/source/userAgent
```

### Step 3：迁移 Prisma 与数据库连接

执行：

```txt
复制 rear/prisma/schema.prisma 到 server/prisma/schema.prisma
复制 rear/prisma/migrations 到 server/prisma/migrations
实现 PrismaModule / PrismaService
实现 serialize 工具
迁移 seed-db 脚本
```

数据库连接要求：

```txt
DATABASE_URL 从 server/.env 读取
不要提交 server/.env
server/.env.example 只保留占位
默认连接 MySQL
保留 DB_MODE，但 server 默认必须使用 prisma
```

数据库准确性验收：

```txt
prisma validate 通过
prisma migrate status 显示数据库最新
seed:db 后 service_categories 数量符合预期
seed:db 后 services 数量符合预期
seed:db 不清空 users 表中的真实用户，除非明确是开发环境重建
服务 ID 不依赖从 1 开始
BigInt 转 number
Decimal 转 number
Date 转 ISO string
软删除字段 deletedAt 被正确过滤
```

### Step 4：迁移 ServicesModule

目标接口：

```txt
GET /api/service-categories
GET /api/services
GET /api/services/:id
```

DTO：

```txt
keyword?: string
categoryId?: number
status?: number
page?: number
pageSize?: number
```

Repository 要求：

```txt
只做 Prisma 查询
不读取 req/res
不拼统一响应
不处理 toast 文案
过滤 deletedAt
默认只返回 status=1
分页使用 skip/take
total 使用 count
```

返回格式必须兼容 miniapp：

```json
{
  "items": [],
  "page": 1,
  "pageSize": 10,
  "total": 40
}
```

前端兼容验收：

```txt
miniapp/src/api/services.ts 不需要改路径
首页仍能调用 getServiceCategories()
首页仍能调用 getServices({ page: 1, pageSize: 10 })
服务详情仍能调用 getServiceDetail(id)
首页 normalizeServiceList 不需要为了 server 增加新分支
服务卡片 price-text 能拿到 number 类型 basePrice
分类 icon 字段保持 string
不存在服务返回 code=40001
```

### Step 5：迁移 UsersModule 与 AuthModule

目标接口：

```txt
POST /api/auth/mock-login
POST /api/auth/wechat-login
GET  /api/auth/me
PUT  /api/auth/profile
```

DTO：

```txt
mock-login: { phone: string }
wechat-login: { loginCode: string, phoneCode: string }
profile: { nickname?: string, avatar?: string }
```

认证要求：

```txt
JWT_SECRET 从 env 读取
JWT_EXPIRES_IN 从 env 读取
Authorization: Bearer <token>
未登录返回 code=20001
无效 token 返回 code=20002
生产环境禁用 mock-login
```

前端兼容验收：

```txt
miniapp/src/api/auth.ts 不需要改接口路径
login/index.vue 能继续保存 accessToken/expiresIn/user
tokenStore.setTokenInfo 输入结构不变
userStore.setFromProfile 输入结构不变
getMe 返回 UserProfile 结构不变
401 时 miniapp 统一跳登录逻辑不变
```

### Step 6：迁移 Dev Seed

当前 `rear` 的问题：

```txt
默认 DB_MODE=prisma
但 POST /api/dev/seed 只写 JSON fallback
contract-test 在默认 Prisma 模式下会出现语义不一致
```

server 中必须修正：

```txt
DB_MODE=prisma 时 POST /api/dev/seed 写 MySQL
DB_MODE=json 时 POST /api/dev/seed 写 JSON fallback
生产环境禁用 /api/dev/seed
seed 返回实际写入的 categories/services/users 数量
```

验收：

```txt
默认 Prisma 模式下 contract-test 通过
契约测试不能假设服务 ID 从 1 开始
契约测试必须先请求 /services?page=1&pageSize=1，再用返回的 id 请求详情
```

### Step 7：复制并升级契约测试

契约测试重点不是“server 内部怎么写”，而是“miniapp 是否无感切换”。

测试必须覆盖：

```txt
所有响应都有 code/message/data/requestId/timestamp
GET /health
GET /service-categories
GET /services?page=1&pageSize=10
GET /services/:id 使用列表返回的真实 id
GET /services/999999999 返回 code=40001
GET /services?page=0 返回统一参数错误
GET /services?pageSize=101 返回统一参数错误
POST /auth/mock-login
GET /auth/me with token
GET /auth/me without token
GET /auth/me invalid token
PUT /auth/profile
同手机号重复 mock-login 返回同一用户
请求头 X-Request-Source 能进入日志
```

### Step 8：前端切换验证

迁移期间不直接改 `miniapp` 主配置，先增加临时验证方式。

建议验证策略：

```txt
rear 保持 3000
server 启动 3100
临时把 VITE_SERVER_BASEURL 指向 http://localhost:3100/api
运行 miniapp type-check
运行 miniapp build:mp
H5 或小程序开发工具验证首页、登录、详情页
确认通过后再决定正式切换
```

前端重点页面：

```txt
miniapp/src/pages/home/index.vue
miniapp/src/pages/service/detail.vue
miniapp/src/pages/login/index.vue
miniapp/src/pages/profile/index.vue
```

前端接口重点文件：

```txt
miniapp/src/http/http.ts
miniapp/src/http/interceptor.ts
miniapp/src/api/services.ts
miniapp/src/api/auth.ts
miniapp/src/store/token.ts
miniapp/src/store/user.ts
```

前端兼容清单：

```txt
不改 API 路径也能请求成功
不改 IResponse 类型也能解包成功
不改 PageData 类型也能展示服务列表
HTTP 401 仍会清 token 并跳登录
业务 code 20001 / 20002 仍会清 token 并跳登录
网络错误、业务错误 toast 仍可用
basePrice 是 number
rating 是 number
id 是 number
createdAt/updatedAt 是 string
```

## 8. 数据库操作准确性专项检查

### 8.1 服务分类

检查 SQL / Prisma 逻辑：

```txt
只返回 status=1 的分类
按 sortOrder asc, id asc 排序
id 从 BigInt 转 number
icon/name/sortOrder/status 字段完整
```

验收 API：

```txt
GET /api/service-categories
```

断言：

```txt
data 是数组
data.length >= 4
每项 id 是 number
每项 name 是 string
每项 sortOrder 是 number
```

### 8.2 服务列表

检查 Prisma 逻辑：

```txt
where.status 默认 1
where.deletedAt 默认 null
categoryId 正确转换 BigInt
keyword 至少匹配 name，后续可扩展 description
分页使用 skip/take
total 使用 prisma.service.count 同样 where
orderBy sortOrder asc, id asc
```

验收 API：

```txt
GET /api/services?page=1&pageSize=10
GET /api/services?categoryId=<id>&page=1&pageSize=10
GET /api/services?keyword=保洁&page=1&pageSize=10
```

断言：

```txt
data.items 是数组
data.page 是 number
data.pageSize 是 number
data.total 是 number
items.length <= pageSize
basePrice 是 number
priceUnit 是 string
categoryId 是 number
```

### 8.3 服务详情

检查 Prisma 逻辑：

```txt
id 参数必须是正整数
id 转 BigInt 查询
未找到返回 BusinessException(SERVICE_NOT_FOUND)
status 非 1 返回 SERVICE_NOT_FOUND
deletedAt 非 null 返回 SERVICE_NOT_FOUND
include category/images 时仍能序列化
```

验收 API：

```txt
GET /api/services/<真实 id>
GET /api/services/999999999
GET /api/services/abc
```

断言：

```txt
真实 id 返回 200
不存在 id 返回 404 + code=40001
非法 id 返回 400 + code=10002
```

### 8.4 用户认证

检查 Prisma 逻辑：

```txt
手机号查找过滤 deletedAt
重复手机号不创建重复用户
用户 id 转 number
openid 唯一冲突有明确错误
profile 更新只允许 nickname/avatar
禁用用户 status != 1 时拒绝登录
```

验收 API：

```txt
POST /api/auth/mock-login
GET /api/auth/me
PUT /api/auth/profile
```

断言：

```txt
accessToken 是 string
expiresIn 是 number
user.id 是 number
user.phone 是脱敏手机号
无 token 返回 code=20001
坏 token 返回 code=20002
```

### 8.5 Seed

seed 必须满足：

```txt
开发环境可重复执行
不依赖自增 ID 固定值
服务和分类通过 key 或 name 绑定，不通过数组下标
默认不清空用户真实数据
清空服务相关表前明确只在开发环境执行
输出实际写入数量
```

验收：

```txt
npm run seed:db
Prisma count 分类数量
Prisma count 服务数量
GET /api/services total 与数据库 count 一致
```

## 9. 前端契合度专项检查

### 9.1 miniapp 请求层兼容

server 必须适配当前小程序请求层：

```txt
X-Request-Source: miniapp
X-Client-Version: 1.0.0
Authorization: Bearer <token>
```

不要要求小程序新增额外 header。

### 9.2 miniapp 响应层兼容

当前小程序 `http.ts` 只把 `response.data` 返回给页面。

server 必须确保：

```txt
成功 code=0
message 默认 ok
data 承载业务数据
requestId 是 string
timestamp 是 string
```

不允许改成：

```txt
{ success: true, result: ... }
{ statusCode: 0, data: ... }
{ data: { code, message, data } }
```

### 9.3 页面级验证

首页：

```txt
加载分类
加载热门服务
后端异常时进入错误态
服务为空时进入空态
```

服务详情：

```txt
从首页服务卡片点击进入
用真实 id 获取详情
不存在服务显示空态
未登录点击预约进入登录页
```

登录：

```txt
H5 development 可 mock-login
MP-WEIXIN 可 wechat-login
登录成功写 tokenStore/userStore
```

我的：

```txt
未登录显示未登录
登录后显示用户昵称和脱敏手机号
退出登录清理 token 和 user
```

## 10. 切换策略

### 10.1 并行期

```txt
rear 保持当前可用
server 独立端口验证
miniapp 默认仍连 rear
server 通过全部契约测试后，才允许 miniapp 切换
```

### 10.2 灰度切换

```txt
本地 H5 先切 server
微信开发工具再切 server
真机预览最后切 server
```

### 10.3 完成切换

满足以下条件后，才能停止使用 `rear`：

```txt
server 契约测试通过
server 数据库 seed 和查询验证通过
miniapp type-check 通过
miniapp build:mp 通过
首页真实数据展示通过
服务详情通过
登录 / auth/me 通过
requestId 日志可追踪
错误响应格式与 rear 一致
```

### 10.4 rear 归档

切换完成后不要立即删除 `rear`。建议：

```txt
保留 rear 至少一个阶段
docs 中标记 rear 为 legacy prototype
确认 server 稳定后再删除或迁出
```

## 11. 验收清单

### 11.1 server 基础

```txt
[ ] server/ 目录存在
[ ] NestJS 项目可启动
[ ] 全局 /api prefix 可用
[ ] CORS 可用
[ ] Swagger 可访问
[ ] .env.example 完成
[ ] README 完成
```

### 11.2 通用能力

```txt
[ ] 成功响应统一
[ ] 错误响应统一
[ ] requestId 生成和透传
[ ] 请求日志包含核心字段
[ ] ValidationPipe 参数错误统一
[ ] BusinessException 可用
[ ] SkipResponseTransform 可用
```

### 11.3 数据库

```txt
[ ] Prisma schema 迁移完成
[ ] Prisma validate 通过
[ ] Prisma migrate status 通过
[ ] PrismaService 可连接 MySQL
[ ] BigInt/Decimal/Date 序列化正确
[ ] seed:db 可重复执行
[ ] service_categories 数量正确
[ ] services 数量正确
[ ] total 与数据库 count 一致
```

### 11.4 Services

```txt
[ ] GET /api/service-categories 通过
[ ] GET /api/services 通过
[ ] GET /api/services/:id 通过
[ ] categoryId 筛选通过
[ ] keyword 搜索通过
[ ] page/pageSize 校验通过
[ ] 不存在服务返回 code=40001
```

### 11.5 Auth / Users

```txt
[ ] POST /api/auth/mock-login 通过
[ ] GET /api/auth/me 携带 token 通过
[ ] GET /api/auth/me 无 token 返回 code=20001
[ ] GET /api/auth/me 坏 token 返回 code=20002
[ ] PUT /api/auth/profile 通过
[ ] 同手机号重复登录返回同一用户
```

### 11.6 前端契合

```txt
[ ] miniapp 不改 services API 路径也能请求
[ ] miniapp 不改 auth API 路径也能请求
[ ] 首页分类展示正常
[ ] 首页热门服务展示正常
[ ] 服务详情展示正常
[ ] 登录成功正常
[ ] 我的页登录态正常
[ ] 401 自动跳登录正常
[ ] miniapp type-check 通过
[ ] miniapp build:mp 通过
```

## 12. 风险与处理

### 12.1 双后端并行导致数据不一致

风险：

```txt
rear 和 server 使用不同 seed 或不同 DATABASE_URL
```

处理：

```txt
迁移期间明确 rear/server 的 DATABASE_URL
server 契约测试只信 server 自己的 seed 与查询
不要混用 rear 的 /api/dev/seed 验证 server
```

### 12.2 前端路径变动导致页面失效

风险：

```txt
NestJS Controller 路径写成 /api/services/categories 等新路径
```

处理：

```txt
第一阶段严格保持 rear 现有路径
新增路径只能作为兼容扩展，不能替代旧路径
```

### 12.3 ID 自增不从 1 开始

风险：

```txt
测试硬编码 /services/1
```

处理：

```txt
所有测试先从列表取真实 id
业务代码不得假设 id 从 1 开始
```

### 12.4 Decimal 返回对象

风险：

```txt
前端 price-text 收到对象导致显示异常
```

处理：

```txt
server Repository 或全局 serialize 必须把 Decimal 转 number
契约测试断言 basePrice typeof number
```

### 12.5 dev seed 误伤生产数据

风险：

```txt
/api/dev/seed 清空生产服务数据
```

处理：

```txt
生产环境禁用 dev seed
seed 脚本启动前检查 NODE_ENV
开发 seed 与生产初始化脚本分离
```

## 13. 推荐执行顺序

```txt
1. 创建 server NestJS 骨架
2. 实现 Common 基础设施
3. 迁移 Prisma schema 和 PrismaService
4. 实现 HealthModule
5. 实现 ServicesModule
6. 写 server 版 contract-test
7. 实现 AuthModule / UsersModule
8. 迁移 seed-db
9. 跑数据库专项检查
10. 临时切 miniapp 到 server 端口做前端兼容检查
11. 全部通过后再决定是否让 server 替代 rear
```

## 14. 迁移完成定义

当且仅当以下条件全部满足，才认为本次迁移完成：

```txt
server 可以独立替代 rear 支撑 miniapp 当前功能
server API 响应与 rear 对 miniapp 的契约一致
server 默认使用 Prisma/MySQL
server 数据库读写结果准确
server 契约测试覆盖服务、认证、错误、分页
miniapp 无需重构请求层即可切换 server
rear 可以停止运行但保留代码作为 legacy 参考
```

