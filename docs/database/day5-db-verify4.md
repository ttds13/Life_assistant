# Day 5 数据库 Act 2 执行验证报告 Verify 4

生成时间：2026-05-23

## 1. 本次验证结论

本次已按照 `docs/database/day5-db-act2.md` 执行完成数据库服务分类与服务 SKU 重建。

结论：

```txt
Act 2 已执行成功。
service_categories 已重建为 14 个正式分类。
services 已重建为 40 个可售服务 SKU。
GET /api/services 返回的 Decimal 字段已转换为 number。
小程序 type-check 与 mp-weixin 构建均通过。
```

本次未修改：

```txt
rear/prisma/schema.prisma
小程序首页 UI 结构
师傅端逻辑
订单 / 支付 / 地址 / 优惠券业务逻辑
```

## 2. 本次实际改动文件

本轮核心改动：

```txt
rear/src/common/serialize.js
rear/scripts/seed-db.js
rear/src/services/services.repository.js
```

### 2.1 serialize.js

完成内容：

```txt
增加对 Prisma Decimal 的通用识别：
只要对象存在 toNumber() 方法，就转换为 number。
```

解决问题：

```txt
GET /api/services 中 basePrice / rating 不再返回 Decimal 对象结构。
前端价格展示不会再出现 [object Object] 或对象字段。
```

### 2.2 seed-db.js

完成内容：

```txt
重建服务分类 seed。
重建服务 SKU seed。
保留 users 表，不清空用户。
保留测试用户 13800138000 的写入或跳过逻辑。
使用 categoryKey -> category.id 的映射，不再依赖数组下标绑定分类。
```

执行 seed 时清空的服务相关表：

```txt
service_images
service_price_rules
service_favorites
services
service_categories
```

### 2.3 services.repository.js

本轮 API 验证时发现：

```txt
数据库已有 40 个 services。
但 GET /api/services?page=1&pageSize=10 返回 total=20。
```

原因：

```txt
repository 层默认 pageSize=20 提前截断。
service 层又基于截断后的 allItems 计算 total。
```

已修复：

```txt
repository.findServicesPrisma 在未传 page/pageSize 时不分页。
service 层继续负责分页与 total 计算。
```

修复后：

```txt
GET /api/services?page=1&pageSize=10 返回 total=40。
```

## 3. 当前数据库服务分类实现

当前 `service_categories` 为 14 个正式分类：

| sortOrder | 分类名称 | categoryKey | SKU 数 |
| --- | --- | --- | --- |
| 1 | 日常保洁 | daily_cleaning | 3 |
| 2 | 深度清洁 | deep_cleaning | 3 |
| 3 | 开荒保洁 | post_renovation_cleaning | 2 |
| 4 | 厨房深度 | kitchen_deep_cleaning | 2 |
| 5 | 家电清洗 | appliance_cleaning | 4 |
| 6 | 窗帘清洗 | curtain_cleaning | 2 |
| 7 | 衣服洗护 | clothing_care | 3 |
| 8 | 收纳整理 | storage_organizing | 3 |
| 9 | 家具养护 | furniture_care | 3 |
| 10 | 杀虫消毒 | pest_disinfection | 3 |
| 11 | 上门维修 | home_repair | 3 |
| 12 | 搬家拉货 | moving_delivery | 3 |
| 13 | 保姆月嫂 | nanny_maternity | 3 |
| 14 | 爱宠服务 | pet_service | 3 |

合计：

```txt
14 个分类
40 个服务 SKU
```

## 4. 命令执行记录

### 4.1 语法检查

执行：

```bash
node --check rear/src/common/serialize.js
node --check rear/scripts/seed-db.js
node --check rear/src/services/services.repository.js
```

结果：

```txt
全部通过，无语法错误。
```

### 4.2 Prisma Client 生成

执行：

```bash
cd rear
npm run prisma:generate
```

结果：

```txt
Generated Prisma Client (v6.19.3)
执行成功。
```

说明：

```txt
执行前已停止占用 3000 端口的 rear 后端进程。
之前 Windows 下 query_engine-windows.dll.node 被占用的问题已解除。
```

### 4.3 数据库 seed

执行：

```bash
cd rear
npm run seed:db
```

结果：

```txt
[seed-db] 开始重建服务分类和服务 SKU...
[seed-db] 已清空旧服务数据
[seed-db] 写入 14 个分类
[seed-db] 写入 40 个服务
[seed-db] 测试用户已存在，跳过: 13800138000
[seed-db] 种子数据写入完成
```

### 4.4 数据库数量校验

校验结果：

```json
{"categories":14,"services":40,"users":1}
```

当前分类顺序：

```txt
1.日常保洁
2.深度清洁
3.开荒保洁
4.厨房深度
5.家电清洗
6.窗帘清洗
7.衣服洗护
8.收纳整理
9.家具养护
10.杀虫消毒
11.上门维修
12.搬家拉货
13.保姆月嫂
14.爱宠服务
```

前 5 个服务价格校验：

```txt
日常保洁 2 小时|120|次|5
日常保洁 3 小时|170|次|5
日常保洁 4 小时|220|次|5
深度清洁 4 小时|260|次|5
全屋深度清洁|380|次|5
```

## 5. API 验证结果

当前后端已重新启动，监听端口：

```txt
http://127.0.0.1:3000
```

本次启动进程：

```txt
PID: 61492
Command: node src/main.js
```

注意：PID 只代表本次验证时的进程号，后续重启会变化。

### 5.1 分类接口

请求：

```txt
GET /api/service-categories
```

结果：

```json
{"count":14,"firstName":"日常保洁","lastName":"爱宠服务"}
```

验收：

```txt
通过。
首页分类入口可以拿到 14 个真实分类。
```

### 5.2 服务列表接口

请求：

```txt
GET /api/services?page=1&pageSize=10
```

结果：

```json
{
  "total": 40,
  "pageSize": 10,
  "itemCount": 10,
  "firstName": "日常保洁 2 小时",
  "basePrice": 120,
  "basePriceType": "Int32",
  "rating": 5,
  "ratingType": "Int32"
}
```

验收：

```txt
通过。
total 已修复为 40。
basePrice 是 number。
rating 是 number。
```

### 5.3 分类筛选接口

请求：

```txt
GET /api/services?categoryId=<日常保洁分类id>&page=1&pageSize=10
```

结果：

```json
{
  "total": 3,
  "names": "日常保洁 2 小时,日常保洁 3 小时,日常保洁 4 小时"
}
```

验收：

```txt
通过。
按分类筛选可以只返回该分类下的服务 SKU。
```

## 6. 小程序验证结果

### 6.1 类型检查

执行：

```bash
cd miniapp
pnpm type-check
```

结果：

```txt
通过。
```

### 6.2 微信小程序构建

执行：

```bash
cd miniapp
pnpm build:mp
```

结果：

```txt
DONE Build complete.
```

构建产物：

```txt
miniapp/dist/build/mp-weixin
```

当前构建环境中测试 AppID：

```txt
VITE_WX_APPID=touristappid
```

当前接口地址：

```txt
VITE_SERVER_BASEURL=http://192.168.126.18:3000/api
VITE_SERVER_BASEURL_SECONDARY=http://localhost:3000/api
```

## 7. 验收清单

```txt
[x] serialize.js 已修复 Decimal -> number
[x] npm run prisma:generate 执行成功
[x] seed-db.js 已重建 14 个 categorySeeds
[x] seed-db.js 使用 categoryKey 绑定服务 SKU
[x] npm run seed:db 执行成功
[x] service_categories 数据量为 14
[x] services 数据量为 40
[x] users 至少保留 1 个测试用户
[x] GET /api/service-categories 返回 14 项
[x] GET /api/services 返回服务列表
[x] GET /api/services total 返回 40
[x] basePrice / rating 为 number
[x] 分类筛选接口可用
[x] 小程序 type-check 通过
[x] 小程序 build:mp 通过
```

## 8. 剩余风险与后续建议

### 8.1 Git 上传前仍需处理 env 文件

当前历史报告中已指出：

```txt
miniapp/env/.env 当前已被 Git 跟踪。
```

建议在上传 GitHub 前处理：

```txt
确认是否包含真实接口地址、密钥、账号或环境敏感信息。
如果包含敏感信息，需要从 Git 跟踪中移除并改为 .env.example。
```

### 8.2 当前服务分类还没有图片资源

本轮只写入：

```txt
分类名称
Carbon icon class
排序
服务 SKU
价格
单位
描述
```

未写入：

```txt
service_images
cover_image
服务详情图
分类封面图
```

后续如果首页或详情页需要真实图片，需要单独补充图片 seed 或文件上传逻辑。

### 8.3 价格规则仍未启用

当前 40 个 SKU 使用 `basePrice + priceUnit` 作为基础价格。

未启用：

```txt
service_price_rules
按面积计价规则
按小时计价规则
加项规则
节假日加价规则
```

后续做下单页和价格计算时，需要再补价格规则设计。

### 8.4 当前 seed 会清空服务相关数据

`npm run seed:db` 会重建服务分类和服务 SKU，因此仍属于开发期 seed。

后续上线前建议拆分为：

```txt
开发 seed：允许清空重建
生产迁移：只做 upsert，不清空真实业务数据
```

## 9. 下一步建议

推荐下一步进入：

```txt
Day 5 / Day 6 首页接真实分类与服务数据的最终 UI 验证
服务详情页数据结构规划
下单页所需字段规划
价格规则 service_price_rules 设计
GitHub 上传前 env 与敏感文件清理
```

本次数据库层已经满足首页 14 分类与 40 服务 SKU 的基础展示需求。
