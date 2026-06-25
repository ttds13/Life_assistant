# Day 19 删除模拟支付与 0.01 测试卡片计划

更新时间：2026-06-22  
主题：删除支付 mock、删除 0.01 测试支付服务卡片、统一使用真实微信支付链路

## 1. 目标

删除当前项目里所有“支付模拟”能力和“0.01测试支付”专用服务卡片。

后续测试方式改为：

```txt
在后台或数据库中，把某个真实服务的价格临时改成 0.01
-> 小程序选择该真实服务
-> 创建真实订单
-> 调起真实微信支付
-> 微信支付回调推进订单状态
```

不再使用：

```txt
0.01测试支付 独立服务
fallback 0.01 测试卡片
POST /api/payments/mock-success
PAYMENT_MOCK_ENABLED
PAYMENT_MOCK_AMOUNT
VITE_ENABLE_MOCK_PAYMENT
provider=mock
channel=mock
LOCAL 订单
local=1
```

## 2. 删除边界

本计划删除：

```txt
支付 mock
0.01测试支付服务卡片
0.01测试支付 seed
0.01测试支付迁移补偿
前端 fallback 测试服务
前端 mock 支付按钮和分支
后端 mock-success 接口
后端 mock 支付渠道
```

本计划暂不删除：

```txt
auth/mock-login
登录页模拟登录入口
```

原因：模拟器登录问题和支付问题分开处理。当前只删除支付模拟，避免把本地/模拟器登录调试入口一起删掉。

## 3. 前端删除计划

### 3.1 删除 0.01 测试服务兜底

处理文件：

```txt
miniapp/src/utils/fallbackServices.ts
miniapp/src/pages/home/index.vue
miniapp/src/pages/service/detail.vue
miniapp/src/pages/order/create.vue
```

删除内容：

```txt
fallbackHotServices
id=-1001
name=0.01测试支付
getFallbackServiceById()
isFallbackServiceId()
normalizeServiceList() 中只服务 fallback 的逻辑
通过负数 ID 查找后端服务的逻辑
```

目标行为：

```txt
首页只展示 /api/services 返回的真实服务。
接口为空时显示空态或加载失败提示。
服务详情页只接受真实正整数 id。
下单页只接受真实正整数 serviceId。
```

### 3.2 删除前端模拟支付调用

处理文件：

```txt
miniapp/src/api/orders.ts
miniapp/src/api/types/orders.ts
miniapp/src/utils/wechatPayment.ts
miniapp/src/utils/mockRuntime.ts
miniapp/src/pages/payment/result.vue
miniapp/src/pages/order/detail.vue
miniapp/src/env.d.ts
miniapp/.env.development
miniapp/.env.production
```

删除内容：

```txt
mockSuccessPayment()
PayOrderResult.provider 的 'mock'
isMockPaymentEnabled()
VITE_ENABLE_MOCK_PAYMENT
payment.provider === 'mock' 分支
支付页调用 /payments/mock-success 的逻辑
订单详情页调用 /payments/mock-success 的逻辑
```

目标行为：

```txt
点击支付 -> POST /api/orders/:id/pay
拿到 provider=wechat 和 paymentParams
调用 wx.requestPayment
支付结果以后端微信回调为准
```

### 3.3 删除本地假订单路径

全局搜索并删除：

```txt
LOCAL
local=1
serviceId=-1001
orderId=LOCAL
```

目标行为：

```txt
订单必须由 POST /api/orders 创建。
支付页 orderId 必须是真实数字 ID。
订单列表必须来自 GET /api/orders。
```

## 4. 后端删除计划

### 4.1 删除 mock-success 接口

处理文件：

```txt
server/src/payments/payments.controller.ts
server/src/payments/dto/mock-success.dto.ts
```

删除内容：

```txt
MockSuccessDto import
@Post('payments/mock-success')
mockSuccess() controller method
server/src/payments/dto/mock-success.dto.ts 文件
```

目标行为：

```txt
POST /api/payments/mock-success 返回 404
```

### 4.2 删除 mock 支付服务逻辑

处理文件：

```txt
server/src/payments/payments.service.ts
server/src/payments/payments.repository.ts
server/src/payments/constants/payment-channel.ts
server/src/common/errors/error-code.ts
server/src/admin-business/admin-business.service.ts
```

删除内容：

```txt
MockSuccessDto import
mockSuccess()
findOrCreateMockPayment()
assertMockPaymentEnabled()
getMockPaymentAmount()
PAYMENT_CHANNEL.MOCK
PAYMENT_MOCK_DISABLED
findLatestOrderPayment() 中只服务 mock 的逻辑
paymentChannel('mock') 展示分支
MOCK 开头交易流水号
```

调整内容：

```txt
createPayment() 只调用 createWechatPayment()
markPaymentSuccess() 永远校验微信支付金额与订单金额一致
writeNotifyLog() 必须显式传入 channel=wechat
recordAbnormalPaymentSuccess() 必须显式传入 channel=wechat
```

目标行为：

```txt
支付成功只能来自 /api/payments/wechat/notify。
支付渠道只允许 wechat。
后端不会创建 channel=mock 的 payment。
```

### 4.3 删除 mock 支付配置

处理文件：

```txt
server/.env.example
server/.env.production.example
server/src/payments/wechat-pay.config.ts
Docker 运行环境中的 .env.production
```

删除内容：

```env
PAYMENT_MOCK_ENABLED=true
PAYMENT_MOCK_AMOUNT=0.01
PAYMENT_PROVIDER=mock
```

目标配置：

```env
PAYMENT_PROVIDER=wechat
```

如果后端已经不需要 provider 切换，也可以删除 `PAYMENT_PROVIDER`，代码默认只支持微信支付。

## 5. 数据与迁移删除计划

### 5.1 删除 seed 中的测试服务

处理文件：

```txt
server/src/seed/service-seeds.ts
```

删除内容：

```txt
name=0.01测试支付
description=用于小程序模拟支付链路测试...
basePrice=0.01
```

### 5.2 迁移处理策略

当前存在迁移：

```txt
server/prisma/migrations/20260622093000_add_mock_payment_service/migration.sql
```

处理规则：

```txt
如果该迁移从未部署到任何环境：
  可以删除整个迁移目录。

如果该迁移已经部署到服务器：
  不要删除历史迁移目录。
  新增一个补偿迁移，下线 0.01测试支付。
```

推荐补偿迁移：

```sql
UPDATE services
SET
  status = 0,
  deleted_at = COALESCE(deleted_at, NOW()),
  updated_at = NOW()
WHERE name = '0.01测试支付';
```

说明：

```txt
优先软删除，不直接物理删除。
如果这个服务已经关联过订单，物理删除可能破坏外键或历史订单展示。
```

## 6. 测试 0.01 支付的新方式

后续不再创建专用测试服务。

测试步骤：

```txt
1. 选择一个真实服务，例如“日常保洁”。
2. 在后台或数据库把该服务价格临时改为 0.01。
3. 小程序选择该真实服务下单。
4. 调用真实微信支付。
5. 支付完成后检查订单状态和支付记录。
6. 测试结束后把服务价格改回原价。
```

数据库示例：

```sql
UPDATE services
SET base_price = 0.01, min_price = 0.01, updated_at = NOW()
WHERE id = 真实服务ID;
```

恢复示例：

```sql
UPDATE services
SET base_price = 原价格, min_price = 原价格, updated_at = NOW()
WHERE id = 真实服务ID;
```

## 7. 静态搜索验收

删除后执行：

```powershell
rg -n "mock-success|MockSuccess|mockSuccessPayment|isMockPaymentEnabled|PAYMENT_MOCK|PAYMENT_CHANNEL\.MOCK|provider.*mock|channel.*mock" miniapp\src server\src server\.env.example
```

预期：

```txt
无结果
```

删除 0.01 测试服务后执行：

```powershell
rg -n "0\.01测试支付|0.01测试支付|-1001|fallbackHotServices|getFallbackServiceById|isFallbackServiceId|LOCAL|local=1" miniapp\src server\src server\prisma
```

预期：

```txt
无运行时代码结果
```

允许保留：

```txt
docs/plan 历史计划中的文字记录
auth/mock-login 登录模拟相关代码
```

## 8. 构建验收

后端：

```powershell
cd "D:\Code Program\Life_assistant\server"
pnpm build
```

小程序：

```powershell
cd "D:\Code Program\Life_assistant\miniapp"
pnpm type-check
pnpm build:mp
```

## 9. 接口验收

服务器部署后检查：

```bash
curl https://www.xunhaoyou.com/api/health
curl "https://www.xunhaoyou.com/api/services?page=1&pageSize=20"
```

预期：

```txt
/api/services 不包含 0.01测试支付
```

检查 mock-success 已删除：

```bash
curl -i -X POST https://www.xunhaoyou.com/api/payments/mock-success
```

预期：

```txt
404
```

检查真实支付创建：

```txt
小程序创建真实订单
点击支付
POST /api/orders/:id/pay 返回 provider=wechat
返回 paymentParams
小程序调起 wx.requestPayment
```

## 10. 完成标准

必须全部满足：

```txt
1. 首页不再出现 0.01测试支付卡片。
2. 前端不存在 -1001 服务 ID。
3. 前端不存在 LOCAL/local=1 假订单路径。
4. 前端不存在 mockSuccessPayment 调用。
5. 前端不存在 VITE_ENABLE_MOCK_PAYMENT。
6. 后端不存在 /payments/mock-success。
7. 后端不存在 PAYMENT_CHANNEL.MOCK。
8. 后端不存在 PAYMENT_MOCK_ENABLED/PAYMENT_MOCK_AMOUNT。
9. 后端不会创建 channel=mock 的支付单。
10. seed 不再插入 0.01测试支付。
11. 数据库中的 0.01测试支付已软删除或确认不存在。
12. 0.01 测试通过修改真实服务价格完成。
```

## 11. 执行顺序

```txt
1. 删除前端 0.01 fallback 服务卡片。
2. 删除前端 mock 支付调用。
3. 删除后端 mock-success 接口。
4. 删除后端 mock 支付服务逻辑。
5. 删除 mock 支付配置项。
6. 删除 seed 中的 0.01测试支付。
7. 新增补偿迁移，下线已插入的 0.01测试支付服务。
8. 执行静态搜索。
9. 执行后端 build。
10. 执行小程序 type-check 和 build:mp。
11. 打包 Docker。
12. 服务器部署。
13. 线上接口验收。
14. 使用真实服务临时改价 0.01 做支付验收。
```
