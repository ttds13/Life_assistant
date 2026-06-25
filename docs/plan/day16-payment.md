# Day 16 WeChat Payment Replacement Plan

更新日期：2026-06-18  
代号：day16-payment

## 1. 目标

本阶段目标是把当前项目中的模拟支付链路替换为真实微信支付 JSAPI 小程序支付链路，并保证后续只需要在一个后端配置文件中维护微信支付参数。

目标完成后的主流程：

```txt
用户创建订单
-> 后端创建微信支付预支付单
-> 小程序调起微信支付
-> 微信支付异步通知后端
-> 后端验签、解密、校验金额
-> 订单 pending_payment -> pending_dispatch
-> 复用现有支付后自动派单
-> 师傅接单履约
```

本计划强调：

```txt
商户号、证书、APIv3 Key、通知地址等敏感参数只在 server 侧配置
小程序不保存任何商户密钥
订单是否支付成功以后端收到并验证过的微信支付通知为准
前端 requestPayment success 只作为用户体验提示，不直接推进订单状态
```

## 2. 当前支付现状

当前项目仍是 mock 支付：

```txt
server/src/payments/payments.controller.ts
POST /api/orders/:id/pay -> createMockPayment()
POST /api/payments/mock-success -> mockSuccess()
```

小程序端仍显式调用 mock 成功接口：

```txt
miniapp/src/api/orders.ts
payOrder()
mockPaymentSuccess()

miniapp/src/pages/payment/result.vue
先 payOrder，再 mockPaymentSuccess

miniapp/src/pages/order/detail.vue
canMockPay 为 true 时直接调用 mock 支付成功
```

生产构建配置仍不满足上线：

```txt
miniapp/env/.env.production
VITE_SERVER_BASEURL = http://192.168.126.18:3100/api
VITE_ENABLE_MOCK_PAYMENT = true
```

后端已有可复用基础：

```txt
Payment 表已有 channel、transactionNo、prepayId、callbackRaw
PaymentNotifyLog 表已有通知记录能力
OrdersService 已有支付成功后自动派单方向
订单状态机已有 pay_success
```

## 3. 统一配置方案

### 3.1 单一配置文件

真实支付参数统一放在：

```txt
server/.env.production
```

开发示例同步维护：

```txt
server/.env.example
```

不要把商户私钥、APIv3 Key、商户号等信息写入小程序端配置。

### 3.2 建议新增配置项

```env
# payment provider
PAYMENT_PROVIDER=wechat
PAYMENT_MOCK_ENABLED=false

# WeChat Pay JSAPI
WECHAT_PAY_APPID=小程序AppID
WECHAT_PAY_MCH_ID=商户号
WECHAT_PAY_SERIAL_NO=商户API证书序列号
WECHAT_PAY_API_V3_KEY=APIv3密钥
WECHAT_PAY_PRIVATE_KEY_PATH=./certs/apiclient_key.pem
WECHAT_PAY_NOTIFY_URL=https://你的域名/api/payments/wechat/notify

# public service
PUBLIC_BASE_URL=https://你的域名
API_PREFIX=/api
```

建议私钥使用文件路径：

```txt
server/certs/apiclient_key.pem
```

并确保：

```txt
server/certs/
*.pem
```

不会被提交到 git。

### 3.3 配置读取规则

新增：

```txt
server/src/payments/wechat-pay.config.ts
```

职责：

```txt
集中读取微信支付配置
启动时校验 PAYMENT_PROVIDER=wechat 时的必填项
统一读取并缓存商户私钥
统一派生 notifyUrl
禁止在业务代码中到处读取 env
```

建议校验：

```txt
WECHAT_PAY_APPID 必填
WECHAT_PAY_MCH_ID 必填
WECHAT_PAY_SERIAL_NO 必填
WECHAT_PAY_API_V3_KEY 必填且长度符合 APIv3 Key 要求
WECHAT_PAY_PRIVATE_KEY_PATH 或 WECHAT_PAY_PRIVATE_KEY 至少一个必填
WECHAT_PAY_NOTIFY_URL 必须是 https 地址
生产环境 PAYMENT_MOCK_ENABLED 不能为 true
```

## 4. 后端改造计划

### Phase 1：支付类型和返回结构调整

修改：

```txt
server/src/payments/constants/payment-channel.ts
server/src/payments/constants/payment-status.ts
miniapp/src/api/types/orders.ts
```

支付渠道保留：

```txt
mock
wechat
```

但生产只允许：

```txt
wechat
```

`payOrder` 返回结构从 mock 参数改为微信支付参数：

```ts
type WechatPayOrderResult = {
  paymentNo: string
  amount: number
  status: 'pending' | 'success'
  provider: 'wechat'
  paymentParams: {
    timeStamp: string
    nonceStr: string
    package: string
    signType: 'RSA'
    paySign: string
  }
}
```

兼容策略：

```txt
开发环境 PAYMENT_MOCK_ENABLED=true 时可以继续返回 mock 参数
生产环境只返回 wechat paymentParams
```

### Phase 2：新增微信支付客户端

新增：

```txt
server/src/payments/wechat-pay.client.ts
server/src/payments/wechat-pay.types.ts
```

客户端职责：

```txt
生成微信支付 API v3 Authorization 签名
调用 JSAPI 下单接口
生成小程序调起支付签名
验证微信支付通知签名
解密通知 resource
标准化微信支付错误
```

JSAPI 下单需要的核心字段：

```txt
appid
mchid
description
out_trade_no
notify_url
amount.total
payer.openid
```

金额换算规则：

```txt
订单金额 Decimal 元 -> 微信 amount.total 分
必须使用 Decimal 或字符串计算，不能用浮点数直接乘 100
例如 12.34 元 -> 1234 分
```

小程序调起支付签名字段：

```txt
appId
timeStamp
nonceStr
package = prepay_id=xxx
signType = RSA
paySign
```

注意：实际 `wx.requestPayment` 入参不传 `appId`，但签名串需要 appId。

### Phase 3：改造创建支付单

当前入口保留：

```txt
POST /api/orders/:id/pay
```

但实现替换为真实支付：

```txt
PaymentsService.payOrder()
```

处理流程：

```txt
1. 校验用户登录
2. 查询订单并校验归属
3. 校验订单状态必须为 pending_payment
4. 校验 payableAmount > 0
5. 如果已有 pending 的 wechat payment，可以复用或关闭后重建，第一版建议复用最新未过期 payment
6. 创建本地 Payment 记录，channel=wechat，status=pending
7. 调微信 JSAPI 下单，out_trade_no 使用 paymentNo
8. 保存 prepayId
9. 生成小程序 requestPayment 参数
10. 返回给小程序
```

建议 paymentNo 规则：

```txt
P + yyyyMMddHHmmss + 随机数
```

并明确：

```txt
paymentNo == 微信 out_trade_no
```

### Phase 4：新增微信支付通知接口

新增公开接口：

```txt
POST /api/payments/wechat/notify
```

控制器：

```txt
server/src/payments/payments.controller.ts
```

注意 raw body：

```txt
微信支付通知验签需要原始 body
NestJS 全局 JSON parser 如果不保留 raw body，会导致验签失败
```

需要在 `server/src/main.ts` 或专门中间件中为微信通知接口保留 raw body。

通知处理流程：

```txt
1. 读取 Wechatpay-Signature、Wechatpay-Timestamp、Wechatpay-Nonce、Wechatpay-Serial
2. 用微信平台证书/公钥验签
3. 解密 resource 得到支付结果
4. 校验 appid == WECHAT_PAY_APPID
5. 校验 mchid == WECHAT_PAY_MCH_ID
6. 用 out_trade_no 查询 Payment
7. 校验金额 total 与 Payment.amount 一致
8. 校验 trade_state == SUCCESS
9. 幂等更新 Payment 为 success
10. 订单 pay_success 状态流转
11. 写 PaymentNotifyLog
12. 事务提交后触发支付后自动派单
13. 返回微信要求的成功响应
```

幂等规则：

```txt
Payment 已经 success：记录 duplicate_success，直接返回成功
Payment 仍 pending：处理成功
Payment failed/closed/refunded：记录 status_conflict，返回成功或失败需按业务策略定
订单已经 completed/accepted 等后续状态：不重复推进订单，只返回成功
```

异常支付规则：

```txt
订单已取消但收到 SUCCESS：记录 abnormal_cancel，不自动派单，后续走退款或人工处理
金额不一致：记录 amount_mismatch，拒绝推进订单
用户不一致：记录 user_mismatch，拒绝推进订单
签名失败：不落业务成功记录，返回失败
```

### Phase 5：复用支付后自动派单

真实支付回调成功后复用现有方向：

```txt
PaymentsService.tryAutoAssignAfterPayment()
```

目标状态：

```txt
有可用师傅：
pending_payment -> pending_dispatch -> dispatched

无可用师傅：
pending_payment -> pending_dispatch
```

必须保证：

```txt
支付成功不因无师傅而失败
自动派单失败只记录，不回滚支付状态
重复回调不会重复派单
```

### Phase 6：mock 支付隔离

保留开发入口但强约束：

```txt
POST /api/payments/mock-success
```

限制：

```txt
NODE_ENV=production 永远 403
PAYMENT_MOCK_ENABLED=false 时 403
PAYMENT_PROVIDER=wechat 且生产环境 403
```

建议把当前方法重命名：

```txt
createMockPayment()
mockSuccess()
```

并在代码上标记为开发工具路径，不允许生产主流程调用。

## 5. 小程序改造计划

### Phase 1：API 类型改造

修改：

```txt
miniapp/src/api/types/orders.ts
miniapp/src/api/orders.ts
```

删除或开发环境隔离：

```txt
mockPaymentSuccess()
```

新增类型：

```ts
export interface WechatPaymentParams {
  timeStamp: string
  nonceStr: string
  package: string
  signType: 'RSA'
  paySign: string
}
```

`payOrder(id)` 返回：

```txt
paymentNo
provider
paymentParams
```

### Phase 2：支付结果页替换

修改：

```txt
miniapp/src/pages/payment/result.vue
```

当前逻辑：

```txt
payOrder()
mockPaymentSuccess()
```

替换为：

```txt
payOrder()
uni.requestPayment(paymentParams)
支付成功后轮询或刷新订单详情
跳转订单详情
```

注意：

```txt
前端 requestPayment success 不等于订单已支付成功
页面文案应显示“支付处理中，正在确认订单”
最终状态以后端订单详情为准
```

### Phase 3：订单详情页替换

修改：

```txt
miniapp/src/pages/order/detail.vue
```

移除：

```txt
canMockPay
onMockPay()
mockPaymentSuccess import
开发环境模拟支付提示条
```

新增：

```txt
onPay()
```

逻辑：

```txt
1. payOrder(order.id)
2. 调 uni.requestPayment
3. success 后提示支付确认中
4. reload order detail
5. 如果仍是 pending_payment，提示稍后刷新
6. fail/cancel 时保持 pending_payment
```

### Phase 4：生产环境变量调整

修改：

```txt
miniapp/env/.env.production
```

目标：

```env
VITE_SERVER_BASEURL = 'https://你的域名/api'
VITE_ENABLE_MOCK_PAYMENT = 'false'
```

要求：

```txt
正式小程序 request 合法域名包含 https://你的域名
如果后续图片上传走同域名，也要配置 uploadFile 合法域名
```

## 6. Admin 改造计划

### 6.1 支付记录展示

修改：

```txt
admin/src/api/life/index.ts
server/src/admin-business/admin-business.service.ts
```

支付渠道显示：

```txt
wechat -> 微信支付
mock -> 模拟支付，仅开发环境可能存在
```

支付状态显示：

```txt
pending -> 待支付
success -> 已支付
failed -> 支付失败
closed -> 已关闭
refunded -> 已退款
```

建议新增字段展示：

```txt
transactionNo
prepayId
paidAt
notifyResult
```

第一版不一定新增页面，只要支付记录列表能看出微信支付真实流水即可。

### 6.2 异常支付观测

`PaymentNotifyLog` 建议支持查看：

```txt
duplicate_success
success
amount_mismatch
signature_invalid
abnormal_cancel
status_conflict
auto_assign_fail
```

如果 admin 暂不做详情页，至少后端日志要可查。

## 7. 数据库策略

当前 schema 可先不改：

```txt
Payment.channel
Payment.transactionNo
Payment.prepayId
Payment.callbackRaw
PaymentNotifyLog.rawBody
PaymentNotifyLog.processResult
```

建议后续增强字段，但不是第一版阻塞：

```txt
Payment.closedAt
Payment.expiredAt
Payment.errorCode
Payment.errorMessage
PaymentNotifyLog.headers
PaymentNotifyLog.eventType
```

第一版必须保证：

```txt
paymentNo 唯一
out_trade_no 使用 paymentNo
transactionNo 保存微信 transaction_id
prepayId 保存微信 prepay_id
callbackRaw 保存解密后的通知核心字段
```

## 8. 安全要求

必须满足：

```txt
商户私钥不进 git
APIv3 Key 不进小程序
小程序不保存 mchId、serialNo、privateKey、apiV3Key
微信支付通知必须验签
通知 resource 必须解密
金额必须以后端订单金额为准
不能信任前端传入金额
支付成功以后端回调为准
生产环境禁止 mock payment
```

建议补充：

```txt
回调接口限制只处理 POST
所有支付错误写 structured log
支付回调不依赖用户 JWT
支付回调不要打印完整 APIv3 Key 或私钥
callbackRaw 避免保存过多敏感信息
```

## 9. 实施步骤

### Step 1：配置和启动校验

```txt
1. server/.env.example 增加微信支付配置项
2. 新增 wechat-pay.config.ts
3. PAYMENT_PROVIDER=wechat 时启动校验必填项
4. 生产环境 PAYMENT_MOCK_ENABLED=true 时启动失败
```

验收：

```txt
缺少任一关键配置时后端启动失败并给出明确错误
开发环境仍可不配置微信支付参数启动
```

### Step 2：微信支付客户端

```txt
1. 新增 wechat-pay.client.ts
2. 实现 API v3 请求签名
3. 实现 JSAPI 下单
4. 实现小程序支付参数签名
5. 实现通知解密
6. 预留通知验签
```

验收：

```txt
单元测试覆盖签名串生成
可以在测试订单上成功拿到 prepay_id
```

### Step 3：真实预支付

```txt
1. 改造 PaymentsService.createPayment 或新增 createWechatPayment
2. /orders/:id/pay 根据 PAYMENT_PROVIDER 走 wechat
3. Payment 写入 channel=wechat status=pending
4. 微信返回 prepay_id 后更新 Payment.prepayId
5. 返回 requestPayment 参数
```

验收：

```txt
待支付订单可以创建微信预支付单
重复点击支付不会生成不可控脏数据
订单金额和微信金额一致
```

### Step 4：支付通知

```txt
1. main.ts 支持微信通知 raw body
2. 新增 /payments/wechat/notify
3. 实现验签、解密、金额校验
4. success 通知推进 Payment 和 Order
5. 写 PaymentNotifyLog
6. 触发自动派单
```

验收：

```txt
真实微信支付成功后，订单能自动变成 pending_dispatch 或 dispatched
重复通知不会重复创建 assignment
金额不一致不会推进订单
签名错误不会推进订单
```

### Step 5：小程序真实支付

```txt
1. 修改 orders API 类型
2. payment/result.vue 改为 requestPayment
3. order/detail.vue 删除 mock 支付逻辑
4. 支付成功后刷新订单详情
5. 支付取消后保持待支付状态
```

验收：

```txt
真机能调起微信支付
用户取消支付不会改变订单状态
用户支付成功后订单最终刷新为待派单或已派单
```

### Step 6：mock 支付下线

```txt
1. 后端 mock-success 加强环境限制
2. 小程序删除 mockPaymentSuccess 调用
3. miniapp production 配置改为正式 HTTPS 域名
4. VITE_ENABLE_MOCK_PAYMENT=false
5. 文档标记 mock 支付仅供本地开发
```

验收：

```txt
production 构建日志不再出现 VITE_ENABLE_MOCK_PAYMENT=true
production 构建日志不再出现 192.168 局域网接口
生产后端访问 /payments/mock-success 返回 403
```

### Step 7：admin 和可观测性

```txt
1. 支付记录渠道显示微信支付
2. 支付记录展示 transactionNo
3. 后端日志记录回调处理结果
4. admin 审核中心保留退款/异常支付后续处理入口
```

验收：

```txt
admin 可以看到微信支付记录
支付成功时间和微信交易号可查
异常通知有日志可追踪
```

## 10. 测试清单

### 10.1 后端测试

```txt
创建待支付订单后创建微信预支付单
未登录不能创建支付单
非本人订单不能创建支付单
非 pending_payment 订单不能创建支付单
金额为 0 或负数不能创建支付单
重复创建支付单策略符合预期
微信通知验签失败不推进订单
微信通知金额不一致不推进订单
微信通知重复到达保持幂等
订单取消后支付成功进入异常记录，不派单
支付成功后自动派单不影响支付事务
```

### 10.2 小程序真机测试

```txt
待支付订单点击支付能调起微信支付
取消支付后订单仍是待支付
支付成功后页面提示确认中
支付成功后刷新进入待派单或已派单
弱网下不会重复创建多笔不可控支付
返回订单详情后金额、支付方式、状态展示正确
```

### 10.3 回归测试

```txt
用户下单链路仍可用
支付成功自动派单仍可用
师傅端 dispatched 订单可见
师傅接单、拒单、出发、开始、完成仍可用
用户确认完成仍可用
admin 支付记录、订单详情仍可用
```

## 11. 验收路径

### 11.1 成功支付并自动派单

```txt
1. 准备一个真实微信登录用户，确保 users.openid 存在
2. 准备一个在线可用师傅
3. 用户创建订单
4. 订单状态 pending_payment
5. 用户点击支付，调起微信支付
6. 用户完成支付
7. 微信通知后端
8. Payment.status = success
9. Order.status = dispatched
10. Order.staff_id 不为空
11. 师傅端看到订单并可接单
```

### 11.2 支付成功但无可用师傅

```txt
1. 所有师傅离线或禁用
2. 用户支付成功
3. Payment.status = success
4. Order.status = pending_dispatch
5. Order.staff_id = null
6. admin 可人工派单
```

### 11.3 用户取消支付

```txt
1. 用户点击支付
2. 微信支付弹窗中取消
3. 后端未收到 SUCCESS 通知
4. Payment 保持 pending 或后续关闭
5. Order 保持 pending_payment
```

### 11.4 重复通知

```txt
1. 真实支付成功
2. 模拟或等待微信重复通知
3. Payment 仍只成功一次
4. Order 不重复流转
5. order_assignments 不重复写入
```

## 12. 风险和注意事项

### 12.1 raw body 风险

如果 NestJS 没有保留微信通知原始 body，验签会失败。必须在接入前先处理 raw body。

### 12.2 平台证书/公钥风险

微信支付通知验签需要微信支付平台证书或平台公钥。实现时必须明确选一种方案，并保证证书/公钥更新策略。

### 12.3 openid 风险

JSAPI 支付必须使用当前小程序 appid 下的用户 openid。用户如果通过 mock-login 登录，没有 openid，不能发起真实支付。

### 12.4 金额精度风险

不要使用 JS number 做金额分转换。必须使用 Decimal 或字符串，避免 `0.29 * 100` 之类精度问题。

### 12.5 前端成功回调风险

`requestPayment success` 只能代表用户端支付流程完成，不代表后端已经确认支付成功。订单状态必须以后端通知处理为准。

## 13. 非本期范围

本期不做：

```txt
支付宝支付
微信退款真实出款
分账
企业付款到零钱
微信支付账单下载与对账
支付超时自动关单
支付分
复杂优惠券抵扣
会员卡次数抵扣
```

可以预留但不阻塞本次真实支付上线。

## 14. 完成标准

day16-payment 完成后必须满足：

```txt
所有微信支付商户参数只需改 server/.env.production
小程序 production 使用 HTTPS 正式 API
小程序 production 不再启用 mock payment
/orders/:id/pay 创建真实微信预支付单
小程序能真机调起微信支付
微信支付通知能验签、解密并推进订单状态
支付成功后自动派单继续生效
重复通知幂等
金额不一致不推进订单
订单取消后支付成功不自动派单
admin 能看到真实微信支付记录
生产环境 /payments/mock-success 不可用
server build 通过
miniapp type-check 通过
miniapp build:mp 通过
```

## 15. 执行记录

更新时间：2026-06-18

已完成代码改造：

```txt
1. 后端新增微信支付配置集中读取：
   server/src/payments/wechat-pay.config.ts

2. 后端新增微信支付客户端：
   server/src/payments/wechat-pay.client.ts
   server/src/payments/wechat-pay.types.ts

3. 后端 /api/orders/:id/pay 已改为根据 PAYMENT_PROVIDER 分流：
   PAYMENT_PROVIDER=wechat -> 创建真实微信 JSAPI 预支付单
   PAYMENT_PROVIDER=mock -> 保留开发 mock 支付

4. 后端新增微信支付通知接口：
   POST /api/payments/wechat/notify

5. 后端已启用 rawBody：
   server/src/main.ts

6. 微信通知接口已绕开用户 JWT，并跳过统一响应包装。

7. 生产环境 mock 支付已加双重限制：
   NODE_ENV=production 禁止
   PAYMENT_MOCK_ENABLED=false 禁止

8. 小程序支付结果页已从 mockPaymentSuccess 改为 uni.requestPayment。

9. 小程序订单详情页已删除模拟支付按钮和 canMockPay 逻辑。

10. 小程序 production env 已改为：
    VITE_ENABLE_MOCK_PAYMENT=false
    VITE_SERVER_BASEURL=https://your-domain.example.com/api
    VITE_SERVER_BASEURL_SECONDARY=https://your-domain.example.com/api

11. admin 支付记录增加微信交易号展示，并将渠道转换为：
    wechat -> 微信支付
    mock -> 模拟支付

12. .gitignore 已排除 server/certs、pem、key 文件。

13. 后端 ConfigModule 已改为优先读取：
    .env.${NODE_ENV}
    .env
```

待上线前手工填写：

```txt
server/.env.production

PAYMENT_PROVIDER=wechat
PAYMENT_MOCK_ENABLED=false
WECHAT_PAY_APPID=小程序AppID
WECHAT_PAY_MCH_ID=商户号
WECHAT_PAY_SERIAL_NO=商户API证书序列号
WECHAT_PAY_API_V3_KEY=APIv3密钥
WECHAT_PAY_PRIVATE_KEY_PATH=./certs/apiclient_key.pem
WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH=./certs/wechatpay_public_key.pem
WECHAT_PAY_NOTIFY_URL=https://你的正式域名/api/payments/wechat/notify
PUBLIC_BASE_URL=https://你的正式域名

miniapp/env/.env.production

VITE_SERVER_BASEURL='https://你的正式域名/api'
VITE_SERVER_BASEURL_SECONDARY='https://你的正式域名/api'
VITE_ENABLE_MOCK_PAYMENT='false'
```

已通过的本地验证：

```txt
server pnpm build
miniapp pnpm type-check
admin pnpm type-check
miniapp pnpm build:mp
```

仍需真实环境验收：

```txt
1. 确认微信支付平台公钥或平台证书配置正确。
2. 确认小程序用户通过真实微信登录获取 openid。
3. 真机发起一笔小额支付。
4. 确认微信支付通知能访问公网 HTTPS 后端。
5. 确认 Payment.status 变为 success。
6. 确认 Order 从 pending_payment 推进到 pending_dispatch 或 dispatched。
7. 确认重复通知不会重复派单。
8. 确认 admin 支付记录能看到微信交易号。
```
