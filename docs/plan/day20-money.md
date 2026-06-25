# Day 20 资金与审核可见功能收口计划

更新时间：2026-06-23  
主题：删除生产可见的模拟登录入口，下线钱包功能，优惠券未实现功能清零，避免微信审核误判为虚假交易、虚假资产或测试能力外露。

## 1. 背景

微信审核已拒绝当前版本，主要风险点集中在：

```txt
登录页存在“模拟登录”按钮
我的钱包页面展示固定假余额和历史交易流水
我的优惠券页面展示固定假优惠券，并允许点击“立即使用”跳转下单
个人中心展示钱包、卡包、优惠券等未真实接入的数据入口
```

这些内容对审核人员来说属于生产环境可见的模拟能力或虚拟资产展示。钱包还涉及完整提现流程、资金流水和余额合规闭环，当前后端未完成提现接口，因此 Day 20 先将钱包功能从小程序生产版本下线；优惠券在真实发放/核销完成前只保留空状态。

## 2. 总目标

本次只做审核收口：

```txt
1. 小程序生产包不出现模拟登录入口。
2. 钱包功能入口和页面从小程序生产版本删除。
3. 优惠券列表全部清空，不出现可使用的假券。
4. 个人中心不再展示钱包余额，卡包、优惠券统计统一显示 0。
5. 未实现功能不得跳转到下单、支付、充值、提现等真实交易路径。
6. 保留真实微信手机号登录。
7. 不删除后端真实订单和真实支付链路。
```

## 3. 修改边界

### 3.1 本次删除或隐藏

```txt
miniapp/src/pages/login/index.vue 中的模拟登录按钮
miniapp/src/pages/login/index.vue 中的 onMockLoginTap 生产可见逻辑
miniapp/src/pages/wallet/index.vue 钱包页面文件
miniapp/src/pages/profile/index.vue 中的钱包余额统计和钱包跳转
miniapp/src/pages/staff/profile.vue 中的“我的钱包”入口
miniapp/src/pages/coupon/index.vue 中的固定假优惠券
miniapp/src/pages/coupon/index.vue 中的“立即使用”跳转下单逻辑
```

### 3.2 本次保留

```txt
真实微信手机号登录
真实订单列表、订单支付、订单状态
个人中心页面结构
优惠券页空状态页面
后端 /api/orders、/api/payments/wechat/notify 等真实链路
```

### 3.3 本次不做

```txt
余额充值系统
提现系统
钱包页面空状态
优惠券领取、发放、核销系统
会员卡/卡包真实权益系统
资金流水后端接口
优惠券后端接口
```

这些功能后续要独立立项，不能在当前审核版本中用假数据顶替。

## 4. 登录页收口

处理文件：

```txt
miniapp/src/pages/login/index.vue
miniapp/src/api/auth.ts
miniapp/src/utils/mockRuntime.ts
miniapp/src/api/types/auth.ts
miniapp/env/.env.production
miniapp/env/.env.development
miniapp/src/env.d.ts
```

### 4.1 生产包要求

登录页只保留：

```txt
微信手机号快捷登录
用户协议/隐私政策勾选
```

删除或隐藏：

```txt
模拟登录按钮
mockLoading
mockEnabled
onMockLoginTap()
mockLogin import
getMockLoginPhone / isMockLoginEnabled import
```

### 4.2 环境变量要求

生产环境不得启用：

```env
VITE_ENABLE_MOCK_LOGIN=true
VITE_MOCK_LOGIN_PHONE=...
```

推荐处理：

```txt
从 production 环境文件删除 VITE_ENABLE_MOCK_LOGIN
如果本地开发仍需保留 mock-login，只允许开发环境使用，并通过条件编译或开发环境文件控制
```

### 4.3 后端接口说明

本计划不强制删除后端：

```txt
POST /api/auth/mock-login
```

但生产小程序包不得有任何入口调用它。后续如需进一步安全收口，再单独做后端生产禁用。

## 5. 钱包功能下线

处理文件：

```txt
miniapp/src/pages/wallet/index.vue
miniapp/src/pages/profile/index.vue
miniapp/src/pages/staff/profile.vue
```

### 5.1 当前问题

钱包页存在固定假数据：

```txt
balance = 21898.00
充值记录 1000 / 500
提现记录 -300
历史消费记录
充值按钮
提现按钮
```

审核风险：

```txt
展示未真实产生的余额资产
展示未真实发生的充值/提现流水
提供充值/提现入口但功能未接入
提现流程不完整，无法满足微信对资金类能力的审核要求
```

### 5.2 目标行为

当前版本不保留钱包功能：

```txt
个人中心不展示“钱包余额”
个人中心不跳转 /pages/wallet/index
师傅端个人中心不展示“我的钱包”
小程序页面产物中不生成 pages/wallet/index
```

删除内容：

```txt
miniapp/src/pages/wallet/index.vue
StatAction 中的 wallet
emptyProfileStats.walletBalance
statEntries 中的钱包余额项
goWalletPage()
onStatEntryTap(action === 'wallet') 分支
所有 /pages/wallet/index 跳转
师傅端 appEntries 中的“我的钱包”
```

页面访问预期：

```txt
用户在正常小程序路径中无法进入钱包页面。
如果历史版本或缓存路径尝试访问 /pages/wallet/index，应由小程序路由生成结果决定为不可访问页面，不提供半成品资金界面。
```

### 5.3 实现建议

删除页面后执行全局搜索，确保不再有钱包路由引用：

```txt
rg -n "wallet|钱包|/pages/wallet/index|goWalletPage|walletBalance" miniapp\src miniapp\pages.config.ts
```

## 6. 优惠券页清零

处理文件：

```txt
miniapp/src/pages/coupon/index.vue
miniapp/src/pages/order/create.vue
miniapp/src/pages/profile/index.vue
```

### 6.1 当前问题

优惠券页存在固定假数据：

```txt
新人礼金券 50
新人礼金券 30
新人礼金券 20
已使用券
已过期券
```

并且未使用券可执行：

```txt
/pages/order/create?couponId=...
```

审核风险：

```txt
展示未真实发放的优惠权益
优惠券可点击使用但后端优惠核销未完成
下单页可能收到无效 couponId
```

### 6.2 目标行为

优惠券页统一展示空状态：

```txt
全部：暂无优惠券
未使用：暂无优惠券
已使用：暂无优惠券
已过期：暂无优惠券
```

删除或禁用：

```txt
固定 coupons 数组数据
立即使用按钮
onUseCoupon() 跳转下单
任何 couponId 透传到 order/create 的入口
```

推荐实现：

```ts
const coupons: CouponItem[] = []
```

模板中当列表为空时只显示空状态，不展示券卡片和操作按钮。

## 7. 个人中心入口收口

处理文件：

```txt
miniapp/src/pages/profile/index.vue
miniapp/src/pages/card/index.vue
```

### 7.1 统计数据

个人中心统计必须保持：

```txt
我的卡包：0
优惠券：0
```

钱包余额统计必须删除，不再用 0.00 占位展示。

### 7.2 点击行为

两种可选方案，推荐方案 A。

方案 A：优惠券、卡包保留入口，但页面只展示空状态。

```txt
优惠券 -> /pages/coupon/index，显示空优惠券
卡包 -> /pages/card/index，如未实现也必须显示空状态或暂不开放
```

方案 B：入口不可点击。

```txt
点击卡包、优惠券只提示“当前暂无可用内容”
不跳转到半成品页面
```

钱包不适用方案 A 或 B，必须直接从当前版本入口中删除。

## 8. 下单页优惠券参数收口

处理文件：

```txt
miniapp/src/pages/order/create.vue
miniapp/src/api/types/orders.ts
```

目标：

```txt
当前版本不从优惠券页传 couponId
如果 URL 中仍带 couponId，下单页不得展示虚假优惠抵扣
创建订单时 couponId 只在真实优惠券系统接入后再传后端
```

检查点：

```txt
搜索 couponId
确认没有从假券页面进入下单
确认 payableAmount 不因本地假 couponId 被减免
```

## 9. 静态搜索验收

执行：

```powershell
rg -n "模拟登录|mockLogin|isMockLoginEnabled|getMockLoginPhone|VITE_ENABLE_MOCK_LOGIN|VITE_MOCK_LOGIN_PHONE" miniapp\src miniapp\env miniapp\manifest.config.ts
```

生产包预期：

```txt
miniapp/src/pages/login/index.vue 无命中
miniapp/env/.env.production 无命中
如果保留开发环境 mock，只允许出现在 env/.env.development、api/auth.ts、utils/mockRuntime.ts 这类非生产入口
```

执行：

```powershell
rg -n "wallet|钱包|/pages/wallet/index|goWalletPage|walletBalance|余额充值|提现到银行卡|充值功能待接入|提现功能待接入" miniapp\src miniapp\pages.config.ts
```

预期：

```txt
无钱包页面、无钱包入口、无钱包跳转、无充值/提现待接入提示
```

执行：

```powershell
rg -n "新人礼金券|立即使用|couponId=|onUseCoupon|const coupons" miniapp\src\pages\coupon\index.vue miniapp\src\pages\order\create.vue
```

预期：

```txt
优惠券页无固定假券
无从优惠券页跳转 /pages/order/create?couponId=...
```

全局审核风险搜索：

```powershell
rg -n "模拟|mock|测试|待接入|待完善|暂未|未实现|充值|提现|优惠券" miniapp\src
```

处理原则：

```txt
生产可见页面不得出现模拟、测试、待接入、未实现等文案
开发工具、注释、类型文件可保留，但要确认不会展示给用户
```

## 10. 构建验收

执行：

```powershell
cd "D:\Code Program\Life_assistant\miniapp"
pnpm type-check
pnpm build:mp
```

检查产物：

```txt
dist/build/mp-weixin
```

上传微信开发者工具前，使用体验版检查：

```txt
1. 登录页无“模拟登录”
2. 个人中心无钱包余额入口
3. 师傅端个人中心无“我的钱包”入口
4. 我的优惠券为空，不存在“立即使用”
5. 从个人中心进入优惠券不会进入支付或下单流程
6. 下单和微信支付真实链路不受影响
```

## 11. 微信审核说明建议

提交审核时可在备注中说明：

```txt
本版本仅开放家政服务浏览、下单、微信手机号登录、订单管理和微信支付能力。
钱包、提现、优惠券、会员卡等营销/资金功能尚未开放；当前版本不提供钱包、充值、提现能力，优惠券仅为空状态，不支持领券或券抵扣。
```

不要在备注中提“模拟登录”“测试支付”“mock”等字样。

## 12. 完成标准

必须全部满足：

```txt
1. 登录页生产版本没有模拟登录按钮。
2. 小程序生产包不调用 /api/auth/mock-login。
3. 小程序源码中不存在 /pages/wallet/index 跳转。
4. 个人中心不展示钱包余额。
5. 师傅端个人中心不展示“我的钱包”。
6. 钱包页面文件不进入小程序页面产物。
7. 优惠券页没有固定假券。
8. 优惠券页没有“立即使用”跳转下单。
9. 个人中心卡包/优惠券统计全部为 0。
10. 下单页不因本地假 couponId 产生抵扣。
11. 全局生产可见页面无“模拟”“测试”“待接入”“未实现”等审核风险文案。
12. miniapp type-check 通过。
13. miniapp build:mp 通过。
14. 体验版人工检查通过后再提交审核。
```

## 13. 执行顺序

```txt
1. 删除登录页模拟登录按钮和相关 import/状态/函数。
2. 确认 production 环境不启用 VITE_ENABLE_MOCK_LOGIN。
3. 删除钱包页面文件。
4. 删除个人中心和师傅端的钱包入口。
5. 优惠券页假数据清空。
6. 优惠券页“立即使用”与 couponId 跳转删除。
7. 检查个人中心统计和入口行为。
8. 检查下单页 couponId 不产生本地假抵扣。
9. 执行静态搜索。
10. 执行 type-check 和 build:mp。
11. 微信开发者工具体验版人工验收。
12. 提交微信审核。
```
