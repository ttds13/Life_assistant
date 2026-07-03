# Day 5 数据库服务分类重构行动计划 Act 2

生成时间：2026-05-23

## 1. 行动目标

基于 `docs/database/day5-db-verify3.md`，本行动计划用于把当前数据库中的服务分类和服务项目重新整理为更贴合家政小程序首页的结构。

目标结果：

```txt
service_categories 从当前 5 个分类调整为 14 个正式分类
services 从当前 10 个服务项目扩展为约 34 个可售 SKU
首页 GET /api/service-categories 能返回 14 个真实分类入口
GET /api/services 返回的价格字段为 number，不再是 Prisma Decimal 对象
不修改 schema.prisma
不新增多级分类字段
```

## 2. 本轮改动文件

优先改动：

```txt
rear/src/common/serialize.js
rear/scripts/seed-db.js
```

验证相关：

```txt
rear/package.json
rear/prisma/schema.prisma
miniapp/src/pages/home/index.vue
```

本轮暂不改：

```txt
rear/prisma/schema.prisma
rear/src/services/services.controller.js
rear/src/services/services.service.js
rear/src/services/services.repository.js
miniapp 首页 UI 结构
```

## 3. 执行前置条件

执行前必须确认：

```txt
MySQL 服务正在运行
rear/.env 中 DATABASE_URL 指向正确的本地 life_assistant 数据库
当前允许重建 service_categories 和 services 两张表的数据
已经知道 seed-db.js 会清空服务相关旧数据
```

注意：

```txt
seed-db.js 会 deleteMany 清空 service_images、service_price_rules、services、service_categories
不要在有正式业务数据时直接执行
如果当前数据有保留价值，先备份 MySQL
```

## 4. Step 1：修复 Decimal 序列化

优先级：P1

修改文件：

```txt
rear/src/common/serialize.js
```

当前问题：

```txt
Prisma Decimal 在当前运行环境下 constructor.name 不是 Decimal，而是压缩后的 i
所以原有判断无法命中
GET /api/services 返回 basePrice / rating 为对象结构
```

修改目标：

```js
function serialize(obj) {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'bigint') return Number(obj)
  if (obj && typeof obj === 'object' && typeof obj.toNumber === 'function') {
    return obj.toNumber()
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
```

验证命令：

```bash
cd rear
node -e "const s=require('./src/services/services.repository'); s.findServices({status:1,page:1,pageSize:1}).then(items=>{const x=items[0]; console.log(typeof x.basePrice, x.basePrice); console.log(typeof x.rating, x.rating);}).catch(e=>{console.error(e); process.exit(1)})"
```

验收标准：

```txt
basePrice 输出 number
rating 输出 number
```

## 5. Step 2：处理 Prisma generate 文件占用

优先级：P1

问题：

```txt
npm run prisma:generate 曾因 query_engine-windows.dll.node 被占用失败
```

执行方式：

```txt
1. 停止正在运行的 rear 服务
2. 确认没有 Node 进程占用 rear/node_modules/.prisma/client/query_engine-windows.dll.node
3. 执行 npm run prisma:generate
```

命令：

```bash
cd rear
npm run prisma:generate
```

验收标准：

```txt
命令成功结束
Prisma Client 正常生成
```

如果仍失败：

```txt
先不要强行删除 node_modules
检查当前 node 进程，确认是否有后端服务、Prisma Studio、测试脚本仍在运行
```

## 6. Step 3：重写服务分类 seed 数据

修改文件：

```txt
rear/scripts/seed-db.js
```

将分类数据改为 14 个：

```js
const categorySeeds = [
  { key: 'daily_cleaning', name: '日常保洁', icon: 'i-carbon-clean', sortOrder: 1 },
  { key: 'deep_cleaning', name: '深度清洁', icon: 'i-carbon-tools', sortOrder: 2 },
  { key: 'post_renovation_cleaning', name: '开荒保洁', icon: 'i-carbon-clean', sortOrder: 3 },
  { key: 'kitchen_deep_cleaning', name: '厨房深度', icon: 'i-carbon-clean', sortOrder: 4 },
  { key: 'appliance_cleaning', name: '家电清洗', icon: 'i-carbon-clean', sortOrder: 5 },
  { key: 'curtain_cleaning', name: '窗帘清洗', icon: 'i-carbon-clean', sortOrder: 6 },
  { key: 'clothing_care', name: '衣服洗护', icon: 'i-carbon-store', sortOrder: 7 },
  { key: 'storage_organizing', name: '收纳整理', icon: 'i-carbon-store', sortOrder: 8 },
  { key: 'furniture_care', name: '家具养护', icon: 'i-carbon-home', sortOrder: 9 },
  { key: 'pest_disinfection', name: '杀虫消毒', icon: 'i-carbon-security', sortOrder: 10 },
  { key: 'home_repair', name: '上门维修', icon: 'i-carbon-tools', sortOrder: 11 },
  { key: 'moving_delivery', name: '搬家拉货', icon: 'i-carbon-delivery', sortOrder: 12 },
  { key: 'nanny_maternity', name: '保姆月嫂', icon: 'i-carbon-user-avatar', sortOrder: 13 },
  { key: 'pet_service', name: '爱宠服务', icon: 'i-carbon-pet-image-b', sortOrder: 14 },
]
```

实现要求：

```txt
不要继续用 categories[0].id 这种下标绑定方式
使用 category.key 建立 Map
后续服务 SKU 通过 categoryKey 找分类 id
```

推荐结构：

```js
const categoryMap = new Map()

for (const seed of categorySeeds) {
  const category = await prisma.serviceCategory.create({
    data: {
      name: seed.name,
      icon: seed.icon,
      sortOrder: seed.sortOrder,
      status: 1,
    },
  })
  categoryMap.set(seed.key, category)
}
```

## 7. Step 4：重写服务 SKU seed 数据

修改文件：

```txt
rear/scripts/seed-db.js
```

建议服务 SKU：

```js
const serviceSeeds = [
  { categoryKey: 'daily_cleaning', name: '日常保洁 2 小时', basePrice: 120, priceUnit: '次', sortOrder: 1 },
  { categoryKey: 'daily_cleaning', name: '日常保洁 3 小时', basePrice: 170, priceUnit: '次', sortOrder: 2 },
  { categoryKey: 'daily_cleaning', name: '日常保洁 4 小时', basePrice: 220, priceUnit: '次', sortOrder: 3 },

  { categoryKey: 'deep_cleaning', name: '深度清洁 4 小时', basePrice: 260, priceUnit: '次', sortOrder: 4 },
  { categoryKey: 'deep_cleaning', name: '全屋深度清洁', basePrice: 380, priceUnit: '次', sortOrder: 5 },
  { categoryKey: 'deep_cleaning', name: '厨卫深度清洁套餐', basePrice: 299, priceUnit: '次', sortOrder: 6 },

  { categoryKey: 'post_renovation_cleaning', name: '新居开荒保洁', basePrice: 399, priceUnit: '次', sortOrder: 7 },
  { categoryKey: 'post_renovation_cleaning', name: '开荒保洁按面积计费', basePrice: 8, priceUnit: '平米', sortOrder: 8 },

  { categoryKey: 'kitchen_deep_cleaning', name: '厨房深度清洁', basePrice: 199, priceUnit: '次', sortOrder: 9 },
  { categoryKey: 'kitchen_deep_cleaning', name: '重油污厨房清洁', basePrice: 299, priceUnit: '次', sortOrder: 10 },

  { categoryKey: 'appliance_cleaning', name: '空调清洗', basePrice: 99, priceUnit: '台', sortOrder: 11 },
  { categoryKey: 'appliance_cleaning', name: '油烟机清洗', basePrice: 159, priceUnit: '台', sortOrder: 12 },
  { categoryKey: 'appliance_cleaning', name: '洗衣机清洗', basePrice: 129, priceUnit: '台', sortOrder: 13 },
  { categoryKey: 'appliance_cleaning', name: '冰箱清洗', basePrice: 139, priceUnit: '台', sortOrder: 14 },

  { categoryKey: 'curtain_cleaning', name: '窗帘上门拆洗', basePrice: 20, priceUnit: '平米', sortOrder: 15 },
  { categoryKey: 'curtain_cleaning', name: '窗帘除尘护理', basePrice: 99, priceUnit: '次', sortOrder: 16 },

  { categoryKey: 'clothing_care', name: '衣服取送洗护', basePrice: 39, priceUnit: '单', sortOrder: 17 },
  { categoryKey: 'clothing_care', name: '大件衣物洗护', basePrice: 59, priceUnit: '件', sortOrder: 18 },
  { categoryKey: 'clothing_care', name: '床品洗护', basePrice: 49, priceUnit: '件', sortOrder: 19 },

  { categoryKey: 'storage_organizing', name: '衣柜收纳整理', basePrice: 199, priceUnit: '次', sortOrder: 20 },
  { categoryKey: 'storage_organizing', name: '厨房收纳整理', basePrice: 199, priceUnit: '次', sortOrder: 21 },
  { categoryKey: 'storage_organizing', name: '全屋收纳整理', basePrice: 499, priceUnit: '次', sortOrder: 22 },

  { categoryKey: 'furniture_care', name: '沙发清洗养护', basePrice: 199, priceUnit: '次', sortOrder: 23 },
  { categoryKey: 'furniture_care', name: '床垫除螨养护', basePrice: 169, priceUnit: '张', sortOrder: 24 },
  { categoryKey: 'furniture_care', name: '木质家具养护', basePrice: 199, priceUnit: '次', sortOrder: 25 },

  { categoryKey: 'pest_disinfection', name: '全屋杀虫消毒', basePrice: 299, priceUnit: '次', sortOrder: 26 },
  { categoryKey: 'pest_disinfection', name: '厨卫蟑螂治理', basePrice: 199, priceUnit: '次', sortOrder: 27 },
  { categoryKey: 'pest_disinfection', name: '除螨消毒', basePrice: 169, priceUnit: '次', sortOrder: 28 },

  { categoryKey: 'home_repair', name: '水龙头维修', basePrice: 80, priceUnit: '次', sortOrder: 29 },
  { categoryKey: 'home_repair', name: '电路维修', basePrice: 100, priceUnit: '次', sortOrder: 30 },
  { categoryKey: 'home_repair', name: '家具小修', basePrice: 120, priceUnit: '次', sortOrder: 31 },

  { categoryKey: 'moving_delivery', name: '居民搬家', basePrice: 300, priceUnit: '次', sortOrder: 32 },
  { categoryKey: 'moving_delivery', name: '小件拉货', basePrice: 120, priceUnit: '次', sortOrder: 33 },
  { categoryKey: 'moving_delivery', name: '搬运工服务', basePrice: 80, priceUnit: '小时', sortOrder: 34 },

  { categoryKey: 'nanny_maternity', name: '住家保姆咨询', basePrice: 0, priceUnit: '咨询', sortOrder: 35 },
  { categoryKey: 'nanny_maternity', name: '月嫂服务咨询', basePrice: 0, priceUnit: '咨询', sortOrder: 36 },
  { categoryKey: 'nanny_maternity', name: '育儿嫂服务咨询', basePrice: 0, priceUnit: '咨询', sortOrder: 37 },

  { categoryKey: 'pet_service', name: '宠物上门喂养', basePrice: 59, priceUnit: '次', sortOrder: 38 },
  { categoryKey: 'pet_service', name: '宠物陪伴照看', basePrice: 99, priceUnit: '次', sortOrder: 39 },
  { categoryKey: 'pet_service', name: '宠物用品清洁', basePrice: 89, priceUnit: '次', sortOrder: 40 },
]
```

写入逻辑：

```js
for (const seed of serviceSeeds) {
  const category = categoryMap.get(seed.categoryKey)
  if (!category)
    throw new Error(`missing category: ${seed.categoryKey}`)

  await prisma.service.create({
    data: {
      categoryId: category.id,
      name: seed.name,
      description: seed.description || seed.name,
      basePrice: seed.basePrice,
      priceUnit: seed.priceUnit,
      sortOrder: seed.sortOrder,
      status: 1,
    },
  })
}
```

## 8. Step 5：保留测试用户写入逻辑

继续保留：

```txt
测试手机号：13800138000
测试昵称：测试用户
```

要求：

```txt
如果用户已存在，不重复创建
不要清空 users 表
```

## 9. Step 6：执行前语法检查

执行：

```bash
cd rear
node --check src/common/serialize.js
node --check scripts/seed-db.js
```

验收：

```txt
两个文件都无语法错误
```

## 10. Step 7：执行 seed-db

执行前提醒：

```txt
该命令会重建 service_categories 和 services 数据
```

执行：

```bash
cd rear
npm run seed:db
```

验收输出应包含：

```txt
写入 14 个分类
写入 40 个服务
测试用户已存在或写入成功
```

实际服务数量以最终 serviceSeeds 数组为准。

## 11. Step 8：验证数据库数据量

执行：

```bash
cd rear
node -e "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); Promise.all([p.serviceCategory.count(), p.service.count(), p.user.count()]).then(([c,s,u])=>{console.log({categories:c, services:s, users:u})}).finally(()=>p.$disconnect())"
```

验收：

```txt
categories: 14
services: 40
users: >= 1
```

## 12. Step 9：验证 API

如果后端已启动，重启后端再测。

启动：

```bash
cd rear
npm run dev
```

验证分类：

```bash
curl http://localhost:3000/api/service-categories
```

验收：

```txt
返回 14 个分类
分类名称与 day5-db-verify3 一致
sortOrder 从 1 到 14
```

验证服务列表：

```bash
curl "http://localhost:3000/api/services?page=1&pageSize=10"
```

验收：

```txt
total 为 40
items 中 basePrice 是 number
items 中 rating 是 number
```

验证按分类筛选：

```bash
curl "http://localhost:3000/api/services?categoryId=<分类id>&page=1&pageSize=10"
```

验收：

```txt
只返回该分类下的服务 SKU
```

## 13. Step 10：验证小程序首页

执行：

```bash
cd miniapp
pnpm type-check
pnpm build:mp
```

导入：

```txt
D:\Code Program\Life_assistant\miniapp\dist\build\mp-weixin
```

验收：

```txt
首页分类区展示 14 个真实分类
分类名称与数据库一致
热门服务列表能展示服务
价格显示正常，不出现 [object Object]
```

注意：

```txt
14 个分类在 5 列宫格中显示为 5 + 5 + 4
这是符合本次服务清单的结果
不再强行补第 15 项
```

## 14. 回滚方案

如果 seed 后发现问题：

```txt
方案 A：修正 seed-db.js 后重新 npm run seed:db
方案 B：从 MySQL 备份恢复
方案 C：临时设置 DB_MODE=json 回退 JSON 数据
```

注意：

```txt
DB_MODE=json 只适合临时开发回退
最终仍应以 MySQL 数据为准
```

## 15. 最终验收清单

完成后必须满足：

```txt
[ ] serialize.js 已修复 Decimal 转 number
[ ] npm run prisma:generate 可成功执行
[ ] seed-db.js 使用 14 个 categorySeeds
[ ] seed-db.js 使用 categoryKey 绑定服务 SKU
[ ] npm run seed:db 成功
[ ] service_categories 数据量为 14
[ ] services 数据量为 40
[ ] users 至少保留 1 个测试用户
[ ] GET /api/service-categories 返回 14 项
[ ] GET /api/services 返回服务列表
[ ] basePrice / rating 为 number
[ ] 小程序 type-check 通过
[ ] 小程序 build:mp 通过
[ ] 微信开发者工具首页分类展示正常
```

## 16. 本轮不做的事

```txt
不新增多级分类
不修改 schema.prisma
不接入服务图片
不实现分类页
不实现服务搜索页
不接入地址 / 订单 / 支付
不处理 GitHub 上传
```

## 17. 执行结论

Act 2 的核心是把服务数据从“演示用 5 分类 + 10 服务”升级为“正式业务用 14 分类 + 40 服务 SKU”。

本轮完成后，首页分类入口和数据库真实数据会统一，后续才能继续做：

```txt
分类页
服务详情页
下单页
订单创建
优惠次卡
服务运营位
```
