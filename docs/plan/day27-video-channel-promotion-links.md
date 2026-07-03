# Day 27 视频号固定推广链接管理计划

## 1. 目标

实现一套适合当前项目的视频号跳转小程序方案：

视频号挂固定小程序路径，路径不直接绑定具体商品。管理员在 admin 后台维护多个推广链接，并可随时修改每个链接指向的服务商品或会员卡商品。用户从视频号点击后进入小程序固定落地页，再由落地页根据后台配置跳转到实际商品详情页。

目标链路：

```text
视频号
  -> /pages/promo/landing?key=cleaning_2h
  -> 后端读取 key 对应配置
  -> 跳转服务详情 / 会员卡详情 / 服务分类 / 首页
  -> 用户购买会员卡或预约服务
```

## 2. 设计原则

1. 视频号中使用稳定小程序路径，避免服务 ID、会员卡 ID、活动策略变化后需要修改已发布视频号内容。
2. 服务商品和会员卡商品仍由后端动态提供，前端只负责按路由参数加载。
3. admin 管理多个推广链接，支持新增、编辑、启用、停用、复制路径。
4. 推广链接必须可追踪来源，默认带 `source=channels`。
5. 链接失效、商品下架、配置错误时，落地页不能白屏，要展示降级入口。

## 3. 推荐小程序路径

视频号挂载路径统一使用：

```text
/pages/promo/landing?key={promotionKey}
```

示例：

```text
/pages/promo/landing?key=cleaning_2h
/pages/promo/landing?key=member_year_card
/pages/promo/landing?key=kitchen_clean_campaign
```

实际跳转由后台配置决定：

```text
targetType=service
  -> /pages/service/detail?code={serviceCode}&source=channels&promotionKey={key}

targetType=member_card
  -> /pages/member-card/detail?cardId={cardId}&source=channels&promotionKey={key}

targetType=category
  -> /pages/service/list?categoryId={categoryId}&source=channels&promotionKey={key}

targetType=home
  -> /pages/home/index?source=channels&promotionKey={key}
```

## 4. 数据库设计

新增表：`promotion_links`

字段建议：

```text
id                   bigint primary key
link_key             varchar(64) unique not null
title                varchar(100) not null
description          varchar(255) null
target_type          varchar(32) not null
target_id            bigint null
target_code          varchar(100) null
source               varchar(32) not null default 'channels'
campaign_id          bigint null
sort_order           int not null default 0
status               tinyint not null default 1
start_at             datetime null
end_at               datetime null
created_at           datetime not null
updated_at           datetime not null
```

`target_type` 枚举：

```text
service
member_card
category
home
```

约束建议：

```text
link_key 只允许小写字母、数字、下划线、短横线
service 优先保存 target_code，兼容 target_id
member_card 保存 target_id
category 保存 target_id
status=1 才允许前端解析
start_at/end_at 用于活动生效期
```

## 5. 后端 API 计划

### 5.1 小程序公开接口

新增：

```text
GET /api/promotion-links/:key
```

返回：

```json
{
  "key": "cleaning_2h",
  "title": "日常保洁 2 小时",
  "targetType": "service",
  "targetId": 12,
  "targetCode": "svc_jijie_daily_cleaning_3",
  "source": "channels",
  "campaignId": 1,
  "resolvedPath": "/pages/service/detail?code=svc_jijie_daily_cleaning_3&source=channels&promotionKey=cleaning_2h"
}
```

异常处理：

```text
key 不存在 -> 404
链接停用 -> 404 或返回 disabled 状态
未到开始时间/已过期 -> 404 或返回 expired 状态
目标商品下架 -> 返回 fallbackPath=/pages/home/index
```

建议前端拿到异常时跳首页，并提示：

```text
活动暂不可用，已为你返回首页
```

### 5.2 admin 管理接口

新增：

```text
GET    /api/admin/promotion-links
POST   /api/admin/promotion-links
PUT    /api/admin/promotion-links/:id
PUT    /api/admin/promotion-links/:id/status
DELETE /api/admin/promotion-links/:id
```

列表支持：

```text
keyword
targetType
status
page
pageSize
```

后端返回需要包含：

```text
miniappPath=/pages/promo/landing?key={link_key}
resolvedPath=最终跳转路径
targetName=服务名称或会员卡名称
```

## 6. 小程序前端改造

### 6.1 新增落地页

新增页面：

```text
miniapp/src/pages/promo/landing.vue
```

页面职责：

1. 读取 `key`。
2. 调用 `/promotion-links/:key`。
3. 根据后端返回的 `resolvedPath` 执行跳转。
4. 失败时展示错误状态和“返回首页”按钮。

跳转规则：

```text
tabbar 页面用 switchTab
普通页面用 redirectTo
```

初版可以不做复杂 UI，只展示加载状态和失败提示。

### 6.2 服务详情页保留现有能力

当前已有：

```text
/pages/service/detail?code=xxx
```

继续使用 `code` 加载后端服务详情。需要补充保存来源参数：

```text
source
promotionKey
campaignId
```

后续下单时把这些参数带入订单来源或备注，便于统计。

### 6.3 新增会员卡详情页

建议新增：

```text
miniapp/src/pages/member-card/detail.vue
```

不要直接用 `/pages/card/index` 作为视频号落地页，因为当前卡包页混合了“我的卡包”和“购买会员卡”。视频号用户更适合直接看到某张卡的购买详情。

会员卡详情页功能：

```text
读取 cardId
调用会员卡详情接口
展示卡名称、价格、有效期、适用服务、剩余额度规则
点击购买 -> createMemberCardPurchaseOrder
支付成功 -> 进入支付结果页/卡包
```

需要新增接口：

```text
GET /api/member-cards/shop/:id
```

## 7. admin 端改造

新增菜单：

```text
营销管理 -> 视频号链接管理
```

或如果想更清晰：

```text
推广管理 -> 视频号链接管理
```

### 7.1 列表字段

```text
ID
链接 key
标题
目标类型
目标商品
小程序路径
最终跳转路径
状态
生效时间
过期时间
更新时间
操作
```

操作：

```text
查看
编辑
启用/停用
删除
复制小程序路径
复制最终跳转路径
```

### 7.2 表单字段

```text
标题
链接 key
描述
目标类型
选择服务商品
选择会员卡商品
选择服务分类
来源 source，默认 channels
活动 ID，可选
排序
生效时间
过期时间
状态
```

目标选择逻辑：

```text
targetType=service
  显示服务商品选择器
  保存 service.id 和 service.code

targetType=member_card
  显示会员卡模板选择器
  保存 card.id

targetType=category
  显示服务分类选择器
  保存 category.id

targetType=home
  不需要选择商品
```

### 7.3 一键复制路径

复制给视频号使用的固定路径：

```text
/pages/promo/landing?key=cleaning_2h
```

复制给开发调试用的最终路径：

```text
/pages/service/detail?code=svc_jijie_daily_cleaning_3&source=channels&promotionKey=cleaning_2h
```

## 8. 和当前业务流程的关系

服务商品：

```text
视频号 -> promo landing -> 服务详情 -> 立即预约 -> 预约下单
```

会员卡商品：

```text
视频号 -> promo landing -> 会员卡详情 -> 购买会员卡 -> 支付 -> 入卡包 -> 后续预约
```

如果甲方只是投放单个服务，走服务详情即可。

如果甲方投放套餐卡或年卡，应该走会员卡详情页，而不是直接进卡包页。

## 9. 埋点与订单来源

建议在后续订单中保存：

```text
source=channels
promotionKey=cleaning_2h
campaignId=1
```

可落到：

```text
order.source
order.remark/detail json
payment source
```

第一阶段至少做到：

```text
下单页读取 source/promotionKey
创建订单时传 source
admin 订单列表可按 source 筛选
```

## 10. 实施步骤

### 阶段一：后端基础能力

1. Prisma schema 新增 `PromotionLink` 模型。
2. 新增迁移文件。
3. 新增公开接口 `GET /api/promotion-links/:key`。
4. 新增 admin CRUD 接口。
5. 补目标解析逻辑：
   - 服务商品校验服务存在且上架。
   - 会员卡校验卡模板存在且发布。
   - 分类校验分类存在且启用。
6. 返回 `miniappPath` 和 `resolvedPath`。

### 阶段二：小程序落地页

1. 新增 `/pages/promo/landing`。
2. 注册到 `pages.json`。
3. 新增 `promotionLinks.ts` API。
4. 落地页读取 `key` 并跳转。
5. 异常时跳首页或展示降级页。

### 阶段三：会员卡详情页

1. 新增 `/pages/member-card/detail`。
2. 新增 `GET /api/member-cards/shop/:id`。
3. 详情页展示会员卡商品信息。
4. 点击购买复用现有 `createMemberCardPurchaseOrder`。

### 阶段四：admin 视频号链接管理

1. 新增 `promotionLinks` 资源配置。
2. 新增菜单入口。
3. 表格展示多条推广链接。
4. 表单支持选择服务商品/会员卡商品。
5. 增加复制小程序路径按钮。
6. 增加启用/停用操作。

### 阶段五：来源追踪

1. 服务详情页保留 `source/promotionKey/campaignId`。
2. 下单页继续透传来源参数。
3. 创建订单时写入订单来源。
4. admin 订单列表增加来源筛选。

## 11. 测试清单

后端：

```text
创建服务推广链接
创建会员卡推广链接
重复 key 拒绝
非法 key 拒绝
停用链接不可解析
过期链接不可解析
目标商品下架后的 fallback 行为
admin 启用/停用生效
```

小程序：

```text
/pages/promo/landing?key=service_xxx 能跳服务详情
/pages/promo/landing?key=card_xxx 能跳会员卡详情
无效 key 展示错误或跳首页
从视频号进入后未登录，点击购买/预约能进入登录流程
登录后能继续购买/预约
```

admin：

```text
新增链接
编辑链接指向
选择服务商品
选择会员卡商品
复制小程序路径
启用/停用
多链接分页和搜索
```

## 12. 工作量评估

后端：

```text
PromotionLink 表和迁移：0.5 天
公开解析接口：0.5 天
admin CRUD：1 天
会员卡详情接口：0.5 天
```

小程序：

```text
promo landing 页：0.5 天
会员卡详情页：1 天
来源参数透传：0.5 天
```

admin：

```text
视频号链接管理列表/表单：1 天
商品选择器和复制路径：0.5-1 天
```

测试与修复：

```text
联调和回归：1 天
```

总计：

```text
5-6 个工作日
```

如果只做“服务商品固定链接，不做会员卡详情页和来源追踪”，可以压缩到：

```text
2-3 个工作日
```

## 13. 风险点

1. 视频号后台可挂的小程序路径规则需要在微信后台实际验证。
2. 会员卡当前没有独立详情页，需要新增页面，否则用户体验不够直接。
3. 链接 key 一旦投放，不建议删除，只建议停用或改目标。
4. 服务下架后必须有 fallback，否则视频号旧内容会变成死链。
5. 如果后续甲方要求“视频号商品橱窗/直播购物袋”，这不是本方案，需要另走微信小店/交易组件接入。

## 14. 第一阶段推荐范围

建议第一阶段落地以下内容：

```text
promotion_links 表
公开解析接口
小程序 /pages/promo/landing
admin 视频号链接管理
服务商品跳转
会员卡详情页和会员卡跳转
复制固定小程序路径
启用/停用
```

暂缓：

```text
复杂投放统计报表
多渠道归因模型
微信小店/交易组件
直播间购物袋
```
