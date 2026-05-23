# Day 5 服务项目与服务分类重新规划

生成时间：2026-05-23

## 1. 本次目标

本报告用于重新规划服务项目和数据库服务分类，解决当前数据库中真实分类只有 5 个的问题。

你提供的完整服务项目为：

```txt
日常保洁
深度清洁
开荒保洁
家具养护
收纳整理
窗帘清洗
杀虫消毒
家电清洗
上门维修
搬家拉货
厨房深度
衣服洗护
保姆月嫂
爱宠服务
```

当前数据库真实分类为：

```txt
日常保洁
深度保洁
家电清洗
水电维修
搬家服务
```

结论：

```txt
当前数据库分类数量和名称都需要重新规划。
```

## 2. 数据库建模判断

当前 schema 中服务相关核心表为：

```txt
service_categories：服务分类入口
services：具体可售服务项目 / 套餐
service_price_rules：服务价格规则
service_images：服务图片
```

当前小程序首页逻辑是：

```txt
GET /api/service-categories
  -> 首页分类宫格
```

因此短期推荐：

```txt
把你提供的 14 个服务项目作为 service_categories 的正式分类入口。
```

原因：

```txt
1. 首页需要展示这些入口
2. 当前数据库没有 parentId 或多级分类字段
3. 当前前端直接把 service_categories 当首页入口使用
4. 这样改 seed 最小，接口不用大改
```

后续如果要做更复杂的分类体系，可以再加：

```txt
parent_id
category_type
display_scene
```

但本轮不建议改 schema。

## 3. 推荐服务分类清单

建议将 `service_categories` 改为以下 14 个分类。

| sortOrder | 分类名称 | 推荐 icon | 说明 |
|---:|---|---|---|
| 1 | 日常保洁 | i-carbon-clean | 高频基础保洁入口 |
| 2 | 深度清洁 | i-carbon-tools | 全屋深度清洁、重点区域清洁 |
| 3 | 开荒保洁 | i-carbon-clean | 新房、装修后首次清洁 |
| 4 | 厨房深度 | i-carbon-clean | 厨房油污、灶台、墙面、烟机周边 |
| 5 | 家电清洗 | i-carbon-clean | 空调、油烟机、洗衣机等 |
| 6 | 窗帘清洗 | i-carbon-clean | 窗帘拆洗、除尘、清洗 |
| 7 | 衣服洗护 | i-carbon-store | 衣物洗护、取送洗护 |
| 8 | 收纳整理 | i-carbon-store | 衣柜、厨房、全屋整理 |
| 9 | 家具养护 | i-carbon-home | 沙发、床垫、木质家具养护 |
| 10 | 杀虫消毒 | i-carbon-security | 除螨、消杀、空气治理 |
| 11 | 上门维修 | i-carbon-tools | 水电、五金、家居小修 |
| 12 | 搬家拉货 | i-carbon-delivery | 搬家、拉货、同城搬运 |
| 13 | 保姆月嫂 | i-carbon-user-avatar | 保姆、月嫂、育儿嫂 |
| 14 | 爱宠服务 | i-carbon-pet-image-b | 宠物照护、宠物上门服务 |

命名统一建议：

```txt
使用“深度清洁”，替代当前数据库中的“深度保洁”
使用“搬家拉货”，替代当前数据库中的“搬家服务”
使用“上门维修”，替代当前数据库中的“水电维修”
使用“家具养护”，按你给出的名称，不再写成“家居养护”
使用“衣服洗护”，按你给出的名称，不再写成“衣物洗护”
```

## 4. 分类与可售服务 SKU 规划

`service_categories` 只负责分类入口，`services` 负责真正下单的服务项目。

### 4.1 日常保洁

建议 SKU：

| 服务名称 | 基础价 | 单位 | 说明 |
|---|---:|---|---|
| 日常保洁 2 小时 | 120 | 次 | 小户型基础清洁 |
| 日常保洁 3 小时 | 170 | 次 | 标准家庭基础清洁 |
| 日常保洁 4 小时 | 220 | 次 | 大户型或加强清洁 |

### 4.2 深度清洁

建议 SKU：

| 服务名称 | 基础价 | 单位 | 说明 |
|---|---:|---|---|
| 深度清洁 4 小时 | 260 | 次 | 厨卫、客厅重点区域 |
| 全屋深度清洁 | 380 | 次 | 全屋无死角清洁 |
| 厨卫深度清洁套餐 | 299 | 次 | 厨房 + 卫生间重点清洁 |

### 4.3 开荒保洁

建议 SKU：

| 服务名称 | 基础价 | 单位 | 说明 |
|---|---:|---|---|
| 新居开荒保洁 | 399 | 次 | 新房装修后首次清洁 |
| 开荒保洁按面积计费 | 8 | 平米 | 大面积按平米计费 |

### 4.4 厨房深度

建议 SKU：

| 服务名称 | 基础价 | 单位 | 说明 |
|---|---:|---|---|
| 厨房深度清洁 | 199 | 次 | 灶台、台面、墙面油污 |
| 重油污厨房清洁 | 299 | 次 | 长期油污深度处理 |

### 4.5 家电清洗

建议 SKU：

| 服务名称 | 基础价 | 单位 | 说明 |
|---|---:|---|---|
| 空调清洗 | 99 | 台 | 挂机空调基础清洗 |
| 油烟机清洗 | 159 | 台 | 油烟机外壳、滤网、油杯 |
| 洗衣机清洗 | 129 | 台 | 滚筒 / 波轮内筒清洗 |
| 冰箱清洗 | 139 | 台 | 冰箱内外部除味清洁 |

### 4.6 窗帘清洗

建议 SKU：

| 服务名称 | 基础价 | 单位 | 说明 |
|---|---:|---|---|
| 窗帘上门拆洗 | 20 | 平米 | 拆卸、清洗、安装 |
| 窗帘除尘护理 | 99 | 次 | 轻度除尘护理 |

### 4.7 衣服洗护

建议 SKU：

| 服务名称 | 基础价 | 单位 | 说明 |
|---|---:|---|---|
| 衣服取送洗护 | 39 | 单 | 上门取送，按件计费 |
| 大件衣物洗护 | 59 | 件 | 羽绒服、大衣等 |
| 床品洗护 | 49 | 件 | 四件套、被套等 |

### 4.8 收纳整理

建议 SKU：

| 服务名称 | 基础价 | 单位 | 说明 |
|---|---:|---|---|
| 衣柜收纳整理 | 199 | 次 | 衣柜分区、折叠、分类 |
| 厨房收纳整理 | 199 | 次 | 厨房用品归类整理 |
| 全屋收纳整理 | 499 | 次 | 多空间收纳规划 |

### 4.9 家具养护

建议 SKU：

| 服务名称 | 基础价 | 单位 | 说明 |
|---|---:|---|---|
| 沙发清洗养护 | 199 | 次 | 布艺 / 皮质沙发护理 |
| 床垫除螨养护 | 169 | 张 | 除螨、吸尘、护理 |
| 木质家具养护 | 199 | 次 | 木质家具清洁保养 |

### 4.10 杀虫消毒

建议 SKU：

| 服务名称 | 基础价 | 单位 | 说明 |
|---|---:|---|---|
| 全屋杀虫消毒 | 299 | 次 | 常规虫害处理 |
| 厨卫蟑螂治理 | 199 | 次 | 厨房、卫生间重点治理 |
| 除螨消毒 | 169 | 次 | 床垫、沙发、地毯除螨 |

### 4.11 上门维修

建议 SKU：

| 服务名称 | 基础价 | 单位 | 说明 |
|---|---:|---|---|
| 水龙头维修 | 80 | 次 | 漏水、松动、更换 |
| 电路维修 | 100 | 次 | 开关插座、线路检查 |
| 家具小修 | 120 | 次 | 门锁、合页、家具配件 |

### 4.12 搬家拉货

建议 SKU：

| 服务名称 | 基础价 | 单位 | 说明 |
|---|---:|---|---|
| 居民搬家 | 300 | 次 | 同城居民搬家 |
| 小件拉货 | 120 | 次 | 小件运输 |
| 搬运工服务 | 80 | 小时 | 单独搬运人力 |

### 4.13 保姆月嫂

建议 SKU：

| 服务名称 | 基础价 | 单位 | 说明 |
|---|---:|---|---|
| 住家保姆咨询 | 0 | 次 | 需求登记，后续报价 |
| 月嫂服务咨询 | 0 | 次 | 需求登记，后续报价 |
| 育儿嫂服务咨询 | 0 | 次 | 需求登记，后续报价 |

说明：

```txt
保姆月嫂通常不是固定单价服务，更适合先做咨询 / 留资 / 人工报价。
如果必须进入 services 表，可先用 basePrice = 0，priceUnit = '咨询'。
```

### 4.14 爱宠服务

建议 SKU：

| 服务名称 | 基础价 | 单位 | 说明 |
|---|---:|---|---|
| 宠物上门喂养 | 59 | 次 | 上门喂食、换水 |
| 宠物陪伴照看 | 99 | 次 | 短时陪伴照看 |
| 宠物用品清洁 | 89 | 次 | 猫砂盆、宠物垫等清洁 |

## 5. 推荐 seed 结构

后续建议把 `rear/scripts/seed-db.js` 改成以下结构。

### 5.1 分类数据

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

### 5.2 服务数据组织方式

建议不要直接依赖创建顺序数组下标：

```js
const categoryMap = new Map()
for (const seed of categorySeeds) {
  const category = await prisma.serviceCategory.create({ data: seed })
  categoryMap.set(seed.key, category)
}
```

然后服务项目使用 `categoryKey` 绑定：

```js
const serviceSeeds = [
  {
    categoryKey: 'daily_cleaning',
    name: '日常保洁 2 小时',
    basePrice: 120,
    priceUnit: '次',
    sortOrder: 1,
  },
]
```

这样比 `categories[0].id` 更稳，后续调整顺序不会绑错分类。

## 6. 是否需要修改 schema

本轮不建议修改 schema。

当前表已经能支持：

```txt
服务分类入口
服务 SKU
基础价格
价格单位
服务详情
服务图片
价格规则
城市维度
上下架状态
排序
软删除
```

但如果后续要支持更完整的分类体系，可以考虑新增字段：

```prisma
model ServiceCategory {
  parentId    BigInt?  @map("parent_id")
  level       Int      @default(1)
  scene       String?  @db.VarChar(32) // home, category, staff 等
}
```

当前不改的原因：

```txt
1. 首页当前只需要一级入口
2. 14 个服务分类已经能覆盖当前需求
3. 改 schema 会引入迁移和前后端接口调整
4. 先把数据规划和 seed 跑通更重要
```

## 7. 对首页 UI 的影响

如果按本规划调整数据库 seed：

```txt
GET /api/service-categories 将返回 14 个分类
首页分类宫格将展示 14 个真实入口
当前 P2 “真实 API 只返回 5 个分类”将被解决
```

注意：

```txt
day4-ui-home-action 原计划中首页参考图是 15 项
你现在提供的是 14 项
因此后续首页应以这 14 项为准，不再强行补第 15 项
```

如果 UI 仍希望 5 列完整排版：

```txt
14 项会显示为 5 + 5 + 4
视觉上最后一行少 1 项
可接受
```

如果必须补满 15 项，可以后续新增：

```txt
上门美业
```

但这不在你本次提供的完整服务项目中，本轮不建议擅自加入。

## 8. 对后端 API 的影响

需要调整：

```txt
rear/scripts/seed-db.js
```

暂不需要调整：

```txt
rear/prisma/schema.prisma
rear/src/services/services.repository.js
rear/src/services/services.service.js
rear/src/services/services.controller.js
```

但仍要先修复已有 P1：

```txt
rear/src/common/serialize.js 中 Decimal 转 number 问题
```

否则新增服务价格后，前端仍会拿到 Decimal 对象。

## 9. 对 GitHub 上传前的注意事项

这次服务分类规划会影响 seed 数据，但不应该提交真实环境文件。

上传前仍需处理：

```txt
miniapp/env/.env 当前已被 Git 跟踪
rear/.env 不要提交
根目录需要 .gitignore
```

## 10. 下一步执行建议

建议按以下顺序推进：

```txt
1. 修复 Decimal 序列化问题
2. 停止占用 Prisma engine 的 Node 进程，重新执行 npm run prisma:generate
3. 按本报告重写 rear/scripts/seed-db.js
4. 明确是否允许 seed-db 清空并重建 service_categories / services
5. 执行 seed-db 写入 14 分类和服务 SKU
6. 验证 GET /api/service-categories 返回 14 项
7. 验证 GET /api/services 返回 price 为 number
8. 小程序首页导入微信开发者工具查看分类展示
```

## 11. 最终推荐结论

本轮推荐采用：

```txt
14 个 service_categories
每个分类下 1-4 个 services SKU
暂不修改 schema
暂不新增多级分类字段
```

这样能最快解决当前问题：

```txt
数据库真实分类不足
首页分类无法贴合服务业务
服务项目数量过少
seed 数据和当前家政业务不匹配
```

完成后，数据库服务模块会从当前的：

```txt
5 个分类 + 10 个服务
```

升级为：

```txt
14 个分类 + 约 34 个服务 SKU
```

这会更接近真实家政小程序的业务结构，也能支撑后续首页、分类页、服务详情页和下单页联调。
