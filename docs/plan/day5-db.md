# Day 5 数据库系统接入计划

## 1. 当前状态分析

### 已完成

```txt
Prisma schema 已定义 30 张表（rear/prisma/schema.prisma）
MySQL 8.4 本地数据库 life_assistant 已创建
迁移文件已执行，表结构已存在于 MySQL 中
Prisma Client 输出目录：rear/src/generated/prisma
package.json 已有 @prisma/client 和 prisma 依赖
```

### 未完成（本次目标）

```txt
后端代码仍使用 JSON 文件存储（rear/src/data/local-db.js）
services.repository.js 从 local-db 读取数据
users.repository.js 从 local-db 读取数据
Prisma Client 未生成（rear/src/generated/prisma 目录可能不存在）
没有数据库连接初始化模块
没有种子数据写入 MySQL
前端请求的数据来自 JSON 文件而非真实数据库
```

## 2. 本次目标

```txt
1. 生成 Prisma Client，建立数据库连接模块
2. 将 services 模块从 JSON 文件切换到 MySQL（Prisma）
3. 将 users/auth 模块从 JSON 文件切换到 MySQL（Prisma）
4. 编写数据库种子脚本，向 MySQL 写入初始数据
5. 本地跑通前后端完整链路：小程序 → 后端 API → MySQL
6. 保留 local-db 作为 fallback，但默认使用 Prisma
```

## 3. 改动文件清单

### 新增文件

```txt
rear/src/common/prisma.js              — Prisma Client 单例
rear/scripts/seed-db.js                — MySQL 种子数据脚本
rear/.env                              — 数据库连接字符串（已有则检查）
```

### 修改文件

```txt
rear/src/services/services.repository.js  — 改用 Prisma 查询
rear/src/users/users.repository.js        — 改用 Prisma 查询
rear/src/config/env.js                    — 新增 dbMode 配置项
rear/package.json                         — 新增 seed:db 脚本
```

### 不动文件

```txt
rear/prisma/schema.prisma              — 表结构已完善，不改
rear/src/data/local-db.js              — 保留作为 fallback
rear/src/auth/auth.service.js          — 业务逻辑不变，只依赖 repository 接口
rear/src/services/services.service.js  — 业务逻辑不变
```

## 4. 执行步骤

### Step 1：环境准备

```txt
1. 确认 rear/.env 存在且包含 DATABASE_URL
   格式：mysql://root:password@localhost:3306/life_assistant
2. 执行 npx prisma generate 生成 Prisma Client
3. 确认 rear/src/generated/prisma 目录生成成功
4. 执行 npx prisma migrate status 确认迁移状态正常
```

### Step 2：创建 Prisma Client 单例模块

新建 `rear/src/common/prisma.js`：

```txt
导出 PrismaClient 单例
开发环境防止热重载创建多个连接
提供 connect / disconnect 方法
提供健康检查方法（SELECT 1）
```

接口设计：

```js
// rear/src/common/prisma.js
const { PrismaClient } = require('./generated/prisma') // 注意路径

let prisma

function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
    })
  }
  return prisma
}

async function disconnectPrisma() {
  if (prisma) {
    await prisma.$disconnect()
    prisma = null
  }
}

module.exports = { getPrisma, disconnectPrisma }
```

### Step 3：修改 config/env.js

新增配置项：

```txt
dbMode: process.env.DB_MODE || 'prisma'
// 可选值：'prisma' | 'json'
// 默认 prisma，如果本地 MySQL 未启动可切回 json
```

### Step 4：改造 services.repository.js

改造为双模式：

```txt
if dbMode === 'prisma':
  findCategories → prisma.serviceCategory.findMany(...)
  findServices → prisma.service.findMany(...)
  findServiceById → prisma.service.findUnique(...)
else:
  保持当前 local-db 逻辑
```

Prisma 查询要点：

```txt
findCategories:
  where: { status: 1 }
  orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }]

findServices:
  where: { status: 1, categoryId?, name contains keyword? }
  orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }]
  skip / take 分页

findServiceById:
  where: { id: BigInt(id) }
  include: { category: true, images: true }
```

注意事项：

```txt
Prisma schema 中 id 为 BigInt，前端传入的是 Number
需要做 BigInt → Number 的序列化处理
返回格式需要与当前 JSON 格式兼容，避免前端改动
```

### Step 5：改造 users.repository.js

改造为双模式：

```txt
if dbMode === 'prisma':
  findUserByPhone → prisma.user.findFirst({ where: { phone, deletedAt: null } })
  findUserById → prisma.user.findFirst({ where: { id: BigInt(id), deletedAt: null } })
  createUser → prisma.user.create(...)
  updateUser → prisma.user.update(...)
else:
  保持当前 local-db 逻辑
```

OAuth 相关：

```txt
当前 schema 没有独立的 user_oauth 表
用户的 openid 直接存在 users 表的 openid 字段
需要调整 auth.service.js 中的 oauth 逻辑：
  - findOauthByProviderAndOpenid → prisma.user.findFirst({ where: { openid } })
  - createOauth → 合并到 createUser 或 updateUser
  - updateOauth → prisma.user.update({ where: { id }, data: { openid, unionid } })
```

### Step 6：编写 MySQL 种子数据脚本

新建 `rear/scripts/seed-db.js`：

```txt
功能：
  1. 清空 service_categories 和 services 表
  2. 插入与当前 seed-data.js 相同的分类和服务数据
  3. 插入一个测试用户（手机号 13800138000）
  4. 打印插入结果

执行方式：
  node scripts/seed-db.js
  或 package.json 中 "seed:db": "node scripts/seed-db.js"
```

种子数据内容（与当前 JSON 种子保持一致）：

```txt
服务分类：日常保洁、深度保洁、家电清洗、搬家服务、维修服务
服务项目：每个分类下 2-3 个服务
测试用户：13800138000 / 用户_138000
```

### Step 7：修改 package.json

新增脚本：

```json
{
  "scripts": {
    "prisma:generate": "npx prisma generate",
    "prisma:migrate": "npx prisma migrate dev",
    "prisma:studio": "npx prisma studio",
    "seed:db": "node scripts/seed-db.js"
  }
}
```

### Step 8：启动验证

验证流程：

```txt
1. 确认 MySQL 服务运行中
2. cd rear && npx prisma generate
3. node scripts/seed-db.js（写入种子数据）
4. node src/main.js（启动后端）
5. 用 curl 测试接口：
   GET http://localhost:3000/api/services/categories
   GET http://localhost:3000/api/services?page=1&pageSize=10
   POST http://localhost:3000/api/auth/mock-login { "phone": "13800138000" }
   GET http://localhost:3000/api/auth/me（带 token）
6. 小程序连接后端，确认首页数据正常加载
```

## 5. BigInt 序列化问题

Prisma 返回的 BigInt 字段在 JSON.stringify 时会报错。需要处理：

```txt
方案 A：在 repository 层做转换，将 BigInt 转为 Number
方案 B：全局添加 BigInt.prototype.toJSON
方案 C：使用 Prisma 的 @map 配合自定义序列化

推荐方案 A：在 repository 返回前统一转换
```

转换工具函数：

```js
function serializeBigInt(obj) {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'bigint') return Number(obj)
  if (Array.isArray(obj)) return obj.map(serializeBigInt)
  if (typeof obj === 'object') {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value)
    }
    return result
  }
  return obj
}
```

## 6. 返回格式兼容

当前前端期望的分类格式：

```json
{
  "id": 1,
  "name": "日常保洁",
  "icon": "i-carbon-clean",
  "sortOrder": 0,
  "status": 1
}
```

Prisma 返回的格式（字段名已通过 @map 映射）：

```json
{
  "id": 1n,
  "name": "日常保洁",
  "icon": "i-carbon-clean",
  "description": null,
  "sortOrder": 0,
  "status": 1,
  "createdAt": "2025-05-23T...",
  "updatedAt": "2025-05-23T..."
}
```

需要在 repository 层做字段筛选，只返回前端需要的字段。

## 7. 风险与回退

```txt
风险：MySQL 未启动时后端无法工作
回退：通过 DB_MODE=json 环境变量切回 JSON 文件模式
测试：启动前检查数据库连接，失败时打印明确错误信息
```

## 8. 验收清单

```txt
[ ] npx prisma generate 成功
[ ] npx prisma migrate status 显示所有迁移已应用
[ ] node scripts/seed-db.js 成功写入种子数据
[ ] npx prisma studio 能看到种子数据
[ ] GET /api/services/categories 返回数据库中的分类
[ ] GET /api/services 返回数据库中的服务列表
[ ] POST /api/auth/mock-login 能创建/查找数据库用户
[ ] GET /api/auth/me 能返回数据库用户信息
[ ] 小程序首页能正常加载分类和服务数据
[ ] DB_MODE=json 时仍能使用 JSON 文件模式
[ ] pnpm type-check（miniapp）通过
[ ] 后端无 BigInt 序列化报错
```

## 9. 暂不实现

```txt
订单相关表的 CRUD（后续 day6）
支付相关表的 CRUD（后续）
评价/售后相关表的 CRUD（后续）
优惠券/会员卡相关表的 CRUD（后续）
数据库连接池优化（当前单连接足够）
Redis 缓存层（当前不需要）
```

## 10. 预计耗时

```txt
Step 1 环境准备：5 分钟
Step 2 Prisma 单例：5 分钟
Step 3 config 修改：3 分钟
Step 4 services repository 改造：15 分钟
Step 5 users repository 改造：15 分钟
Step 6 种子数据脚本：10 分钟
Step 7 package.json：2 分钟
Step 8 启动验证：10 分钟
总计：约 65 分钟
```
