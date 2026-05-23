# Day 5 数据库接入行动计划 Act 1

## 1. 执行目标

将后端从 JSON 文件存储切换到 MySQL（Prisma），跑通本地前后端数据库链路。

最终效果：

```txt
后端启动后连接 MySQL，API 从数据库读写数据
小程序首页正常加载分类和服务列表
模拟登录创建/查找数据库中的用户
DB_MODE=json 可回退到 JSON 文件模式
```

## 2. 前置条件

```txt
MySQL 8.4 本地服务已启动
数据库 life_assistant 已存在
rear/.env 中 DATABASE_URL 已配置
rear/prisma/schema.prisma 已定义 30 张表
迁移已执行（rear/prisma/migrations/20260514080222_init）
```

## 3. 本次改动文件

新增：

```txt
rear/src/common/prisma.js
rear/src/common/serialize.js
rear/scripts/seed-db.js
```

修改：

```txt
rear/src/config/env.js
rear/src/services/services.repository.js
rear/src/users/users.repository.js
rear/package.json
```

## 4. Step 1：生成 Prisma Client

执行命令：

```bash
cd rear
npx prisma generate
```

验证：

```bash
ls src/generated/prisma
# 应该看到 index.js、index.d.ts 等文件
```

如果 `src/generated/prisma` 不存在，检查 schema.prisma 中的 output 路径：

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}
```

## 5. Step 2：创建 Prisma Client 单例

新建 `rear/src/common/prisma.js`：

```js
const { PrismaClient } = require('../generated/prisma')

let prisma = null

function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error'],
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

async function checkDbConnection() {
  try {
    const client = getPrisma()
    await client.$queryRaw`SELECT 1`
    return true
  }
  catch (err) {
    console.error('[DB] 数据库连接失败:', err.message)
    return false
  }
}

module.exports = { getPrisma, disconnectPrisma, checkDbConnection }
```

## 6. Step 3：创建序列化工具

新建 `rear/src/common/serialize.js`：

```js
/**
 * 将 Prisma 返回的对象中的 BigInt 转为 Number
 * 将 Decimal 转为 Number
 */
function serialize(obj) {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'bigint') return Number(obj)
  if (typeof obj === 'object' && obj.constructor && obj.constructor.name === 'Decimal') {
    return Number(obj)
  }
  if (obj instanceof Date) return obj.toISOString()
  if (Array.isArray(obj)) return obj.map(serialize)
  if (typeof obj === 'object') {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serialize(value)
    }
    return result
  }
  return obj
}

module.exports = { serialize }
```

## 7. Step 4：修改 config/env.js

在 `config` 对象中新增 `dbMode`：

```js
// 在 const config = Object.freeze({ 内部新增：
dbMode: process.env.DB_MODE || 'prisma',
```

完整新增位置（在 `wechatSecret` 之后）：

```js
wechatSecret: process.env.WECHAT_SECRET || '',
dbMode: process.env.DB_MODE || 'prisma',
```

## 8. Step 5：改造 services.repository.js

替换为双模式实现：

```js
const { config } = require('../config/env')
const { serialize } = require('../common/serialize')

// JSON 模式
const { readDb } = require('../data/local-db')

// Prisma 模式
let getPrisma
if (config.dbMode === 'prisma') {
  getPrisma = require('../common/prisma').getPrisma
}

function sortByOrder(items) {
  return items.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.id - b.id
  })
}

// ===== JSON 模式实现 =====
async function findCategoriesJson(query = {}) {
  const db = await readDb()
  let items = [...db.serviceCategories]
  if (query.status !== undefined) {
    items = items.filter(item => item.status === query.status)
  }
  return sortByOrder(items)
}

async function findServicesJson(query = {}) {
  const db = await readDb()
  let items = [...db.services]
  if (query.status !== undefined) {
    items = items.filter(item => item.status === query.status)
  }
  if (query.categoryId !== undefined) {
    items = items.filter(item => item.categoryId === query.categoryId)
  }
  if (query.keyword) {
    const keyword = query.keyword.toLowerCase()
    items = items.filter(item =>
      item.name.toLowerCase().includes(keyword)
      || item.description.toLowerCase().includes(keyword),
    )
  }
  return sortByOrder(items)
}

async function findServiceByIdJson(id) {
  const db = await readDb()
  return db.services.find(item => item.id === id) || null
}

// ===== Prisma 模式实现 =====
async function findCategoriesPrisma(query = {}) {
  const prisma = getPrisma()
  const where = {}
  if (query.status !== undefined) where.status = query.status
  const items = await prisma.serviceCategory.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })
  return serialize(items)
}

async function findServicesPrisma(query = {}) {
  const prisma = getPrisma()
  const where = {}
  if (query.status !== undefined) where.status = query.status
  if (query.categoryId !== undefined) where.categoryId = BigInt(query.categoryId)
  if (query.keyword) {
    where.name = { contains: query.keyword }
  }

  const page = query.page || 1
  const pageSize = query.pageSize || 20
  const skip = (page - 1) * pageSize

  const items = await prisma.service.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    skip,
    take: pageSize,
  })
  return serialize(items)
}

async function findServiceByIdPrisma(id) {
  const prisma = getPrisma()
  const item = await prisma.service.findUnique({
    where: { id: BigInt(id) },
    include: { category: true, images: true },
  })
  return item ? serialize(item) : null
}

// ===== 导出（根据 dbMode 选择） =====
const usePrisma = config.dbMode === 'prisma'

module.exports = {
  findCategories: usePrisma ? findCategoriesPrisma : findCategoriesJson,
  findServices: usePrisma ? findServicesPrisma : findServicesJson,
  findServiceById: usePrisma ? findServiceByIdPrisma : findServiceByIdJson,
}
```

## 9. Step 6：改造 users.repository.js

替换为双模式实现：

```js
const fs = require('node:fs/promises')
const path = require('node:path')
const { config } = require('../config/env')
const { serialize } = require('../common/serialize')

// JSON 模式
const { readDb } = require('../data/local-db')

// Prisma 模式
let getPrisma
if (config.dbMode === 'prisma') {
  getPrisma = require('../common/prisma').getPrisma
}

const usePrisma = config.dbMode === 'prisma'

// ===== JSON 模式实现 =====
async function writeDb(db) {
  await fs.mkdir(path.dirname(config.dataFile), { recursive: true })
  await fs.writeFile(config.dataFile, `${JSON.stringify(db, null, 2)}\n`, 'utf8')
}

async function findUserByPhoneJson(phone) {
  const db = await readDb()
  return db.users.find(u => u.phone === phone) || null
}

async function findUserByIdJson(id) {
  const db = await readDb()
  return db.users.find(u => u.id === id) || null
}

async function createUserJson({ phone, nickname, avatar, role }) {
  const db = await readDb()
  const id = (db.users.length ? Math.max(...db.users.map(u => u.id)) : 0) + 1
  const now = new Date().toISOString()
  const user = { id, phone, nickname, avatar: avatar || '', status: 1, role: role || 'user', createdAt: now, updatedAt: now }
  db.users.push(user)
  await writeDb(db)
  return user
}

async function updateUserJson(id, fields) {
  const db = await readDb()
  const user = db.users.find(u => u.id === id)
  if (!user) return null
  Object.assign(user, fields, { updatedAt: new Date().toISOString() })
  await writeDb(db)
  return user
}

async function findOauthByProviderAndOpenidJson(provider, openid) {
  const db = await readDb()
  return db.userOauth.find(o => o.provider === provider && o.openid === openid) || null
}

async function createOauthJson({ userId, provider, openid, unionid, sessionKey }) {
  const db = await readDb()
  const id = (db.userOauth.length ? Math.max(...db.userOauth.map(o => o.id)) : 0) + 1
  const now = new Date().toISOString()
  const record = { id, userId, provider, openid, unionid: unionid || '', sessionKey: sessionKey || '', createdAt: now, updatedAt: now }
  db.userOauth.push(record)
  await writeDb(db)
  return record
}

async function updateOauthJson(id, fields) {
  const db = await readDb()
  const record = db.userOauth.find(o => o.id === id)
  if (!record) return null
  Object.assign(record, fields, { updatedAt: new Date().toISOString() })
  await writeDb(db)
  return record
}

// ===== Prisma 模式实现 =====
async function findUserByPhonePrisma(phone) {
  const prisma = getPrisma()
  const user = await prisma.user.findFirst({
    where: { phone, deletedAt: null },
  })
  if (!user) return null
  return formatPrismaUser(user)
}

async function findUserByIdPrisma(id) {
  const prisma = getPrisma()
  const user = await prisma.user.findFirst({
    where: { id: BigInt(id), deletedAt: null },
  })
  if (!user) return null
  return formatPrismaUser(user)
}

async function createUserPrisma({ phone, nickname, avatar, role }) {
  const prisma = getPrisma()
  const user = await prisma.user.create({
    data: {
      phone,
      nickname: nickname || `用户_${phone.slice(-6)}`,
      avatarUrl: avatar || '',
      status: 1,
    },
  })
  return formatPrismaUser(user)
}

async function updateUserPrisma(id, fields) {
  const prisma = getPrisma()
  const data = {}
  if (fields.nickname !== undefined) data.nickname = fields.nickname
  if (fields.avatar !== undefined) data.avatarUrl = fields.avatar
  if (fields.openid !== undefined) data.openid = fields.openid
  if (fields.unionid !== undefined) data.unionid = fields.unionid

  const user = await prisma.user.update({
    where: { id: BigInt(id) },
    data,
  })
  return formatPrismaUser(user)
}

async function findOauthByProviderAndOpenidPrisma(provider, openid) {
  // schema 中 openid 直接在 users 表
  const prisma = getPrisma()
  const user = await prisma.user.findFirst({
    where: { openid, deletedAt: null },
  })
  if (!user) return null
  // 返回兼容格式
  return { id: Number(user.id), userId: Number(user.id), provider, openid, unionid: user.unionid || '', sessionKey: '' }
}

async function createOauthPrisma({ userId, provider, openid, unionid, sessionKey }) {
  // 直接更新 user 的 openid 字段
  const prisma = getPrisma()
  await prisma.user.update({
    where: { id: BigInt(userId) },
    data: { openid, unionid: unionid || '' },
  })
  return { id: Number(userId), userId: Number(userId), provider, openid, unionid: unionid || '', sessionKey: sessionKey || '' }
}

async function updateOauthPrisma(id, fields) {
  // id 就是 userId
  const prisma = getPrisma()
  const data = {}
  if (fields.sessionKey !== undefined) { /* sessionKey 不存在于 schema，忽略 */ }
  if (fields.unionid !== undefined) data.unionid = fields.unionid
  if (fields.openid !== undefined) data.openid = fields.openid

  if (Object.keys(data).length > 0) {
    await prisma.user.update({
      where: { id: BigInt(id) },
      data,
    })
  }
  return { id: Number(id), ...fields }
}

// 格式化 Prisma User 为兼容格式
function formatPrismaUser(user) {
  return {
    id: Number(user.id),
    phone: user.phone || '',
    nickname: user.nickname || '',
    avatar: user.avatarUrl || '',
    status: user.status,
    role: 'user',
    openid: user.openid || '',
    createdAt: user.createdAt?.toISOString() || '',
    updatedAt: user.updatedAt?.toISOString() || '',
  }
}

// ===== 导出 =====
module.exports = {
  findUserByPhone: usePrisma ? findUserByPhonePrisma : findUserByPhoneJson,
  findUserById: usePrisma ? findUserByIdPrisma : findUserByIdJson,
  createUser: usePrisma ? createUserPrisma : createUserJson,
  updateUser: usePrisma ? updateUserPrisma : updateUserJson,
  findOauthByProviderAndOpenid: usePrisma ? findOauthByProviderAndOpenidPrisma : findOauthByProviderAndOpenidJson,
  createOauth: usePrisma ? createOauthPrisma : createOauthJson,
  updateOauth: usePrisma ? updateOauthPrisma : updateOauthJson,
}
```

## 10. Step 7：编写种子数据脚本

新建 `rear/scripts/seed-db.js`：

```js
const path = require('node:path')

// 加载 .env
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

const { PrismaClient } = require('../src/generated/prisma')

const prisma = new PrismaClient()

async function main() {
  console.log('[seed-db] 开始写入种子数据...')

  // 清空现有数据（按外键顺序）
  await prisma.serviceImage.deleteMany()
  await prisma.servicePriceRule.deleteMany()
  await prisma.service.deleteMany()
  await prisma.serviceCategory.deleteMany()

  // 写入分类
  const categories = await Promise.all([
    prisma.serviceCategory.create({ data: { name: '日常保洁', icon: 'i-carbon-clean', sortOrder: 1, status: 1 } }),
    prisma.serviceCategory.create({ data: { name: '深度保洁', icon: 'i-carbon-tools', sortOrder: 2, status: 1 } }),
    prisma.serviceCategory.create({ data: { name: '家电清洗', icon: 'i-carbon-clean', sortOrder: 3, status: 1 } }),
    prisma.serviceCategory.create({ data: { name: '水电维修', icon: 'i-carbon-tools', sortOrder: 4, status: 1 } }),
    prisma.serviceCategory.create({ data: { name: '搬家服务', icon: 'i-carbon-delivery', sortOrder: 5, status: 1 } }),
  ])

  console.log(`[seed-db] 写入 ${categories.length} 个分类`)

  // 写入服务
  const servicesData = [
    { categoryId: categories[0].id, name: '日常保洁 2 小时', description: '专业保洁人员上门，2 小时标准清洁', basePrice: 120, priceUnit: '次', sortOrder: 1, status: 1 },
    { categoryId: categories[0].id, name: '日常保洁 3 小时', description: '专业保洁人员上门，3 小时深度清洁', basePrice: 170, priceUnit: '次', sortOrder: 2, status: 1 },
    { categoryId: categories[1].id, name: '深度保洁 4 小时', description: '厨房、卫生间、客厅重点区域深度清洁', basePrice: 260, priceUnit: '次', sortOrder: 3, status: 1 },
    { categoryId: categories[1].id, name: '全屋深度保洁', description: '全屋无死角深度清洁，含擦窗', basePrice: 380, priceUnit: '次', sortOrder: 4, status: 1 },
    { categoryId: categories[2].id, name: '空调清洗', description: '挂机空调滤网、蒸发器和外壳清洁', basePrice: 99, priceUnit: '台', sortOrder: 5, status: 1 },
    { categoryId: categories[2].id, name: '油烟机清洗', description: '油烟机外壳、滤网和油杯清洗', basePrice: 159, priceUnit: '台', sortOrder: 6, status: 1 },
    { categoryId: categories[2].id, name: '洗衣机清洗', description: '滚筒/波轮洗衣机内筒深度清洁', basePrice: 129, priceUnit: '台', sortOrder: 7, status: 1 },
    { categoryId: categories[3].id, name: '水龙头维修', description: '水龙头漏水、松动和更换基础维修', basePrice: 80, priceUnit: '次', sortOrder: 8, status: 1 },
    { categoryId: categories[3].id, name: '电路维修', description: '开关插座更换、线路检修', basePrice: 100, priceUnit: '次', sortOrder: 9, status: 1 },
    { categoryId: categories[4].id, name: '居民搬家', description: '同城居民搬家，含搬运', basePrice: 300, priceUnit: '次', sortOrder: 10, status: 1 },
  ]

  const services = await Promise.all(
    servicesData.map(data => prisma.service.create({ data })),
  )

  console.log(`[seed-db] 写入 ${services.length} 个服务`)

  // 写入测试用户（如果不存在）
  const existingUser = await prisma.user.findFirst({ where: { phone: '13800138000' } })
  if (!existingUser) {
    await prisma.user.create({
      data: {
        phone: '13800138000',
        nickname: '测试用户',
        status: 1,
      },
    })
    console.log('[seed-db] 写入测试用户: 13800138000')
  }
  else {
    console.log('[seed-db] 测试用户已存在，跳过')
  }

  console.log('[seed-db] 种子数据写入完成!')
}

main()
  .catch((err) => {
    console.error('[seed-db] 错误:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

## 11. Step 8：修改 package.json

在 scripts 中新增：

```json
"prisma:generate": "npx prisma generate",
"prisma:studio": "npx prisma studio",
"seed:db": "node scripts/seed-db.js"
```

## 12. Step 9：验证流程

按顺序执行：

```bash
# 1. 确认 MySQL 运行
mysql -u root -p -e "SELECT 1"

# 2. 生成 Prisma Client
cd rear
npx prisma generate

# 3. 确认迁移状态
npx prisma migrate status

# 4. 写入种子数据
node scripts/seed-db.js

# 5. 用 Prisma Studio 查看数据
npx prisma studio
# 浏览器打开 http://localhost:5555 确认数据存在

# 6. 启动后端
node src/main.js

# 7. 测试分类接口
curl http://localhost:3000/api/service-categories

# 8. 测试服务列表接口
curl "http://localhost:3000/api/services?page=1&pageSize=10"

# 9. 测试模拟登录
curl -X POST http://localhost:3000/api/auth/mock-login -H "Content-Type: application/json" -d "{\"phone\":\"13800138000\"}"

# 10. 测试获取用户信息（用上一步返回的 token）
curl http://localhost:3000/api/auth/me -H "Authorization: Bearer <token>"

# 11. 测试 JSON 回退模式
# 停止后端，设置 DB_MODE=json，重新启动
set DB_MODE=json
node src/main.js
curl http://localhost:3000/api/service-categories
# 应该返回 JSON 文件中的数据
```

## 13. 注意事项

### Prisma Client 路径

```txt
schema.prisma 中 output = "../src/generated/prisma"
所以 require 路径为：require('../generated/prisma')（从 src/common/ 出发）
```

### BigInt 处理

```txt
Prisma 的 BigInt 字段在 JSON.stringify 时会报错
所有 repository 返回前必须经过 serialize() 处理
前端传入的 id 在查询时需要 BigInt(id) 转换
```

### 字段映射

```txt
Prisma model 字段名是 camelCase（如 avatarUrl）
数据库列名是 snake_case（如 avatar_url）
@map 已处理映射，代码中使用 camelCase
但返回给前端时需要注意字段名兼容
```

### 前端期望格式

```txt
ServiceCategory: { id, name, icon, sortOrder, status }
Service: { id, categoryId, name, description, basePrice, priceUnit, coverImage, status, sortOrder }
User: { id, phone, nickname, avatar, role }
```

## 14. 执行顺序总览

```txt
Step 1：npx prisma generate
Step 2：创建 rear/src/common/prisma.js
Step 3：创建 rear/src/common/serialize.js
Step 4：修改 rear/src/config/env.js（加 dbMode）
Step 5：改造 rear/src/services/services.repository.js
Step 6：改造 rear/src/users/users.repository.js
Step 7：创建 rear/scripts/seed-db.js
Step 8：修改 rear/package.json
Step 9：按验证流程逐步测试
```

## 15. 验收清单

```txt
[ ] npx prisma generate 成功，src/generated/prisma 目录存在
[ ] rear/src/common/prisma.js 创建完成
[ ] rear/src/common/serialize.js 创建完成
[ ] rear/src/config/env.js 包含 dbMode 配置
[ ] services.repository.js 支持双模式
[ ] users.repository.js 支持双模式
[ ] node scripts/seed-db.js 成功写入数据
[ ] GET /api/service-categories 返回数据库分类
[ ] GET /api/services 返回数据库服务列表
[ ] POST /api/auth/mock-login 成功
[ ] GET /api/auth/me 返回用户信息
[ ] DB_MODE=json 回退正常
[ ] 无 BigInt 序列化报错
[ ] 小程序首页正常加载
```
