# Day 18 更新对齐计划

更新时间：2026-06-22  
主题：热门服务卡片、真实订单、0.01 测试支付、Docker 后端部署对齐

## 1. 对齐目标

把小程序首页“热门服务”到订单支付的链路统一成真实后端链路：

```txt
首页热门服务
-> 服务详情
-> 预约下单
-> POST /api/orders 创建真实订单
-> POST /api/orders/:id/pay 创建支付单
-> 模拟支付时 POST /api/payments/mock-success
-> 订单列表展示真实订单
```

完成后不允许再出现：

```txt
serviceId=-1001
orderId=LOCAL...
local=1
前端本地直接跳过下单或直接支付完成
```

## 2. 当前问题

前端热门服务存在兜底卡片：

```txt
id=-1001
name=0.01测试支付
price=0.01
```

这个 `-1001` 只能用于前端临时展示，不能直接传给后端。后端订单接口只接受真实数据库里的正整数服务 ID。

之前出现的错误链路是：

```txt
/pages/service/detail?id=-1001
-> /pages/order/create?serviceId=-1001
-> /pages/payment/result?orderId=LOCAL1782127592287&local=1&status=pending
```

这说明前端绕过了后端订单创建，没有调用 `POST /api/orders`，所以不会生成真实订单，订单列表也查不到。

## 3. 前端对齐规则

热门服务允许兜底展示，但点击后必须解析成后端真实服务：

```txt
如果 /api/services 有数据：
  首页直接展示后端服务，点击使用真实 serviceId。

如果 /api/services 暂时为空：
  首页展示 fallbackHotServices。
  点击 fallback 服务后，用服务名称调用 /api/services?keyword=服务名。
  找到同名服务后，替换为后端真实 serviceId。
  找不到时提示“服务数据未同步”，禁止下单。
```

订单创建页必须满足：

```txt
effectiveServiceId > 0
已选择预约日期
已选择预约时间
已选择服务地址
价格预览加载成功
```

提交订单时只能调用：

```txt
POST /api/orders
```

禁止：

```txt
生成 LOCAL 订单号
携带 local=1
使用 serviceId=-1001 创建订单
未创建订单就跳转支付结果页
```

## 4. 后端对齐规则

后端必须存在真实服务数据：

```txt
service_categories:
  name=日常保洁

services:
  name=0.01测试支付
  base_price=0.01
  min_price=0.01
  price_unit=次
  status=1
  deleted_at=NULL
```

后端接口职责：

```txt
GET /api/services
GET /api/services/:id
GET /api/orders/price-preview
POST /api/orders
POST /api/orders/:id/pay
POST /api/payments/mock-success
GET /api/orders
```

后端不需要识别 `-1001`，也不应该接受 `-1001`。前端必须先把兜底卡片解析成真实服务 ID。

## 5. 0.01 测试支付对齐

模拟支付只用于测试真实订单支付状态流转，不用于绕过订单创建。

配置：

```env
PAYMENT_MOCK_ENABLED=true
PAYMENT_MOCK_AMOUNT=0.01
VITE_ENABLE_MOCK_PAYMENT='true'
```

正确链路：

```txt
1. POST /api/orders 创建订单，订单状态 pending_payment。
2. POST /api/orders/:id/pay 创建支付单，provider=mock。
3. 前端调用 POST /api/payments/mock-success。
4. 后端写入 Payment 记录。
5. 后端推进订单状态。
6. 订单列表能看到该订单。
```

真实微信支付链路：

```env
PAYMENT_PROVIDER=wechat
PAYMENT_MOCK_ENABLED=false
VITE_ENABLE_MOCK_PAYMENT='false'
```

```txt
POST /api/orders/:id/pay
-> wx.requestPayment
-> /api/payments/wechat/notify
-> 后端确认支付成功并推进订单状态
```

## 6. 已完成代码方向

前端需要确认这些文件保持一致：

```txt
miniapp/src/utils/fallbackServices.ts
miniapp/src/pages/home/index.vue
miniapp/src/pages/service/detail.vue
miniapp/src/pages/order/create.vue
miniapp/src/pages/payment/result.vue
miniapp/src/utils/wechatPayment.ts
miniapp/src/api/orders.ts
```

后端需要确认这些文件保持一致：

```txt
server/src/orders/orders.controller.ts
server/src/orders/orders.service.ts
server/src/payments/payments.controller.ts
server/src/payments/payments.service.ts
server/src/services/services.controller.ts
server/prisma/migrations
```

关键要求：

```txt
order/create.vue 不再生成 LOCAL 订单。
payment/result.vue 不再通过 local=1 判断本地支付。
wechatPayment.ts 的 mock 分支必须调用 /payments/mock-success。
后端 /orders/:id/pay 与 /payments/mock-success 已存在真实响应。
```

## 7. Docker 后端更新流程

本地打包：

```powershell
cd "D:\Code Program\Life_assistant\server"
.\package-release.ps1 -NodeImage docker.m.daocloud.io/library/node:22-bookworm-slim
```

上传文件：

```txt
server/release/life-assistant-server.tar
```

服务器更新：

```bash
cd /www/wwwroot/life-assistant
docker load -i life-assistant-server.tar
docker rm -f life_assistant_server 2>/dev/null || true
docker run -d \
  --name life_assistant_server \
  --network life_assistant_net \
  --env-file .env.production \
  -p 127.0.0.1:3100:3100 \
  -v "$(pwd)/certs:/app/certs:ro" \
  -v "$(pwd)/uploads:/app/uploads" \
  -v "$(pwd)/logs:/app/logs" \
  --restart unless-stopped \
  life-assistant-server:latest
```

数据库连接要求：

```txt
server 容器必须加入 life_assistant_net。
DATABASE_URL 中的 host 使用 life_assistant_mysql。
不要只用 -p 127.0.0.1:3307:3306 作为容器间连接方式。
```

## 8. 服务器验证命令

后端健康检查：

```bash
curl http://127.0.0.1:3100/api/health
curl https://www.xunhaoyou.com/api/health
```

服务数据检查：

```bash
curl "https://www.xunhaoyou.com/api/services?page=1&pageSize=10"
curl "https://www.xunhaoyou.com/api/services?keyword=0.01%E6%B5%8B%E8%AF%95%E6%94%AF%E4%BB%98&page=1&pageSize=20"
```

预期：

```txt
items 不为空
包含 name=0.01测试支付
该服务 id 是正整数
basePrice=0.01
```

迁移和日志检查：

```bash
docker logs --tail=200 life_assistant_server
docker exec -it life_assistant_server npm run prisma:migrate:status
```

如果再次出现：

```txt
P1001: Can't reach database server at life_assistant_mysql:3306
```

优先检查：

```bash
docker inspect life_assistant_mysql --format '{{json .NetworkSettings.Networks}}'
docker inspect life_assistant_server --format '{{json .NetworkSettings.Networks}}'
```

两个容器必须都在 `life_assistant_net`。

## 9. 小程序验收流程

操作路径：

```txt
首页
-> 热门服务
-> 0.01测试支付
-> 立即预约
-> 选择日期
-> 选择时间
-> 选择地址
-> 提交订单
-> 支付
-> 查看订单列表
```

正确日志：

```txt
serviceId=后端真实正整数
orderId=后端真实正整数
无 LOCAL
无 local=1
订单列表新增订单
支付后订单状态变化
```

错误日志：

```txt
serviceId=-1001
orderId=LOCAL...
local=1
点击支付后直接完成
订单列表没有新增订单
```

## 10. 验收标准

必须全部满足：

```txt
1. 首页热门服务始终有卡片展示。
2. 0.01测试支付卡片能进入详情页。
3. 详情页能解析到后端真实服务 ID。
4. 下单页不能使用 -1001。
5. 提交订单必须调用 POST /api/orders。
6. 支付页 orderId 必须是真实数字 ID。
7. 模拟支付必须调用 POST /api/payments/mock-success。
8. 订单列表能看到新增订单。
9. 服务器 Docker 更新时 server 容器必须加入 life_assistant_net。
10. /api/services 必须返回 0.01测试支付。
```
