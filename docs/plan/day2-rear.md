# Day 2 rear 最小后端行动计划

更新日期：2026-05-14

## 1. 目标

Day 2 目标是补齐 `rear` 后端最小可运行闭环，让 `mini-app` 能通过真实 HTTP 请求读取后端数据。

```txt
rear 启动
-> 本地数据 seed
-> 服务分类和服务项目接口返回统一响应
-> mini-app 首页读取真实数据
-> rear 日志可按 requestId 追踪请求
```

## 2. 本日边界

Day 2 只做后端地基和服务数据联调。

```txt
做：健康检查、统一响应、统一异常、requestId、请求日志、服务分类、服务项目、seed、接口文档
不做：真实登录、订单、支付、后台 CRUD、文件上传、Redis、生产部署
```

## 3. 地址规范

本地后端地址：

```txt
http://localhost:3000/api
```

地址必须从配置读取，后续替换云服务器时只改环境变量。

```txt
PORT=3000
API_PREFIX=/api
PUBLIC_BASE_URL=http://localhost:3000
```

`mini-app` 当前本地配置：

```txt
VITE_SERVER_BASEURL=http://localhost:3000/api
```

## 4. HTTP 响应规范

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "requestId": "req_xxx",
  "timestamp": "2026-05-14T10:00:00.000Z"
}
```

分页响应：

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
  "timestamp": "2026-05-14T10:00:00.000Z"
}
```

错误响应：

```json
{
  "code": 40001,
  "message": "服务不存在",
  "data": null,
  "requestId": "req_xxx",
  "timestamp": "2026-05-14T10:00:00.000Z"
}
```

## 5. Day 2 接口

```txt
GET /api/health
GET /api/service-categories
GET /api/services
GET /api/services/:id
POST /api/dev/seed
```

`POST /api/dev/seed` 仅用于本地开发环境，方便重置最小演示数据。

## 6. 数据模型

服务分类：

```txt
id
name
icon
sortOrder
status
createdAt
updatedAt
```

服务项目：

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

## 7. seed 数据

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

## 8. 验收标准

```txt
rear 可以启动
GET /api/health 返回统一响应
GET /api/service-categories 返回分类数组
GET /api/services 返回分页结构
GET /api/services/:id 返回服务详情
不存在的服务返回统一业务错误
响应都包含 requestId 和 timestamp
请求日志包含 method、url、statusCode、durationMs、source
mini-app 首页能展示 rear 返回的真实服务数据
后端地址可通过 env 替换为云服务器地址
```
