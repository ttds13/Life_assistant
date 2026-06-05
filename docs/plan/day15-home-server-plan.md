# Day 15 Home Service Search Plan

更新日期：2026-06-05  
代号：day15-home-server-plan

## 1. 目标

完善小程序首页关键词搜索服务能力。用户在首页点击搜索入口后，进入独立的服务搜索页面；搜索页面根据关键词展示匹配到的服务卡片；用户点击服务卡片后，再跳转到对应服务详情页。

本阶段不做复杂搜索推荐，不做自动跳转详情页，只跑通最基础、最稳定的搜索闭环。

目标流程：

```txt
首页搜索入口
-> 搜索页面
-> 输入关键词
-> 展示匹配服务卡片
-> 点击服务卡片
-> 服务详情页
-> 预约下单
```

## 2. 当前状态

当前首页已有搜索入口：

```txt
miniapp/src/pages/home/index.vue
```

但现在 `onSearchTap()` 仍是 TODO，只提示搜索功能建设中，没有真实页面跳转。

当前服务接口已经存在：

```txt
GET /api/services
```

前端 API：

```txt
miniapp/src/api/services.ts
getServices(params?: QueryServicesParams)
```

查询参数类型已经包含：

```ts
export interface QueryServicesParams {
  keyword?: string
  categoryId?: number
  status?: number
  page?: number
  pageSize?: number
}
```

因此本期重点不是重新设计接口，而是把首页入口、搜索页面、服务卡片展示和后端基础关键词匹配连成完整链路。

## 3. 产品形态

### 3.1 首页搜索入口

首页顶部搜索框只作为入口。

点击后跳转：

```txt
/pages/service/search
```

首页不直接展示搜索结果，避免首页状态变复杂。

### 3.2 搜索页面

新增页面：

```txt
miniapp/src/pages/service/search.vue
```

搜索页面包含：

```txt
顶部关键词输入框
搜索按钮或键盘搜索确认
服务卡片列表
加载中状态
空结果状态
加载失败状态
```

搜索结果以服务卡片形式展示，每个卡片代表一个可选择的服务项目。

### 3.3 服务卡片跳转

搜索页面中的服务卡片点击后跳转服务详情：

```txt
/pages/service/detail?id={serviceId}
```

点击卡片后再由用户在详情页决定是否下单。

本期明确不做：

```txt
搜索到一个结果就自动跳详情
搜索词强匹配后自动下单
首页直接嵌入搜索结果
```

原因：一个关键词可能对应多个服务，例如“保洁”可能匹配日常保洁、深度保洁、开荒保洁。必须让用户先看到服务选项，再点击确认。

## 4. 基础关键词匹配算法

本期搜索算法采用最基础的关键词包含匹配。

### 4.1 输入处理

前端处理：

```txt
keyword = keyword.trim()
```

规则：

```txt
空关键词不触发搜索
关键词原样传给后端
中文、英文、数字都支持
每次新搜索从 page=1 开始
```

请求格式：

```txt
GET /api/services?keyword=保洁&page=1&pageSize=20
```

### 4.2 后端匹配字段

后端使用基础 `contains` 匹配。

匹配范围：

```txt
services.name contains keyword
services.description contains keyword
services.detail contains keyword
service_categories.name contains keyword
```

过滤范围：

```txt
services.deleted_at is null
services.status = 1
service_categories.status = 1
```

### 4.3 排序规则

本期不引入搜索权重，只使用稳定排序：

```txt
sort_order ASC
id DESC
```

后续再考虑：

```txt
名称命中优先
分类命中优先
销量排序
价格排序
距离排序
同义词
拼音搜索
```

## 5. 前端实现计划

### 5.1 注册搜索页面

修改：

```txt
miniapp/src/pages.json
```

新增页面：

```txt
{
  "path": "pages/service/search",
  "type": "page",
  "style": {
    "navigationBarTitleText": "搜索服务"
  }
}
```

### 5.2 首页入口跳转

修改：

```txt
miniapp/src/pages/home/index.vue
```

将：

```ts
function onSearchTap() {
  showTodo('搜索功能建设中')
}
```

改为：

```ts
function onSearchTap() {
  uni.navigateTo({ url: '/pages/service/search' })
}
```

### 5.3 新增搜索页面

新增：

```txt
miniapp/src/pages/service/search.vue
```

页面状态：

```ts
const keyword = ref('')
const services = ref<Service[]>([])
const loading = ref(false)
const isError = ref(false)
const searched = ref(false)
const page = ref(1)
const pageSize = 20
```

核心方法：

```txt
handleSearch()
loadServices()
normalizeServiceList()
onServiceTap(service)
```

行为：

```txt
用户输入关键词
点击搜索或键盘确认
调用 getServices({ keyword, page: 1, pageSize: 20 })
把返回 items 渲染为服务卡片
点击卡片进入服务详情
```

### 5.4 服务卡片展示

优先复用现有组件：

```txt
miniapp/src/components/service-card/service-card.vue
```

如果组件已经内置点击跳转，则搜索页直接使用：

```vue
<service-card
  v-for="item in services"
  :key="item.id"
  :service="item"
/>
```

如果需要搜索页控制点击行为，则增加可选事件或直接在搜索页自定义卡片。原则是保持卡片样式和首页热门服务一致。

## 6. 后端实现计划

### 6.1 扩展服务列表关键词匹配

修改：

```txt
server/src/services/services.repository.ts
```

当前 `keyword` 如果只匹配服务名称，需要扩展为 OR 条件：

```txt
name contains keyword
description contains keyword
detail contains keyword
category.name contains keyword
```

伪代码：

```ts
if (query.keyword) {
  where.OR = [
    { name: { contains: query.keyword } },
    { description: { contains: query.keyword } },
    { detail: { contains: query.keyword } },
    { category: { name: { contains: query.keyword } } },
  ]
}
```

### 6.2 保持线上服务过滤

服务搜索只返回可展示、可下单的服务：

```txt
deletedAt = null
status = 1
```

如果分类被禁用，则该分类下服务不进入搜索结果。

## 7. 验收流程

### 7.1 首页跳转

操作：

```txt
打开首页
点击顶部搜索框
```

预期：

```txt
进入 pages/service/search
```

### 7.2 关键词搜索

操作：

```txt
在搜索页输入“保洁”
点击搜索
```

预期：

```txt
页面展示包含“保洁”的服务卡片
```

### 7.3 点击服务卡片

操作：

```txt
点击任意搜索结果服务卡片
```

预期：

```txt
跳转到 /pages/service/detail?id=服务ID
详情页展示对应服务信息
```

### 7.4 无结果

操作：

```txt
搜索一个不存在的关键词
```

预期：

```txt
展示“未找到相关服务”
不跳转详情页
不报错
```

### 7.5 空关键词

操作：

```txt
不输入关键词直接点搜索
```

预期：

```txt
提示请输入关键词
不发起无意义请求
```

## 8. 验收标准

功能标准：

```txt
首页搜索入口可跳转搜索页
搜索页可输入关键词
搜索结果以服务卡片展示
点击服务卡片可进入服务详情
搜索算法为基础关键词 contains 匹配
空结果、加载中、加载失败状态完整
```

接口标准：

```txt
GET /api/services?keyword=保洁&page=1&pageSize=20
```

返回分页服务数据，且每条数据能被服务卡片正常渲染。

工程标准：

```txt
miniapp 构建或类型检查通过
server TypeScript 检查通过
server build 通过
```

## 9. 后续增强

本期只做基础关键词匹配。后续可以继续增加：

```txt
搜索历史
热门搜索词
分类快捷筛选
服务价格排序
销量排序
评分排序
同义词搜索，例如“打扫”匹配“保洁”
拼音和首字母搜索
基于用户地址的可服务范围过滤
```

这些增强不影响本期先跑通“搜索页展示服务卡片并点击跳转”的主流程。
