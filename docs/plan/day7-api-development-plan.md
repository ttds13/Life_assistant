# Day 7 用户端接口开发计划

更新日期：2026-05-27

## 1. 当前状态

Day 6 已完成并通过 Apifox 验证：

```txt
GET  /api/health
GET  /api/service-categories
GET  /api/services
GET  /api/services/:id
POST /api/auth/mock-login
POST /api/auth/wechat-login
GET  /api/auth/me
PUT  /api/auth/profile
POST /api/dev/seed
```

当前 `server/` 已具备：

```txt
NestJS
Prisma / MySQL
统一响应
统一异常
JWT 鉴权
requestId
请求日志
Swagger
服务数据 seed
契约测试
```

当前 `miniapp/` 已经有以下前端 API 文件，但部分页面仍在使用 mock：

```txt
miniapp/src/api/address.ts
miniapp/src/api/orders.ts
miniapp/src/api/types/address.ts
miniapp/src/api/types/orders.ts
```

仍在 mock 的重点页面：

```txt
miniapp/src/pages/address/list.vue
miniapp/src/pages/address/edit.vue
miniapp/src/pages/order/create.vue
miniapp/src/pages/order/list.vue
miniapp/src/pages/order/detail.vue
miniapp/src/pages/payment/result.vue
miniapp/src/pages/profile/index.vue 的统计数据
```

## 2. Day 7 目标

Day 7 不做完整后台管理，也不接真实微信支付。

Day 7 的目标是完成用户端最小真实业务闭环：

```txt
用户登录
-> 管理服务地址
-> 选择服务
-> 预览价格
-> 创建订单
-> 查看订单列表
-> 查看订单详情
-> 取消待支付订单
-> 开发环境模拟支付
-> 查看订单状态变化
```

完成后，`miniapp` 的地址页、下单页、订单页应优先使用真实后端接口，不再依赖 `mockDay4` 作为主数据源。

## 3. Day 7 开发边界

### 3.1 必须实现

```txt
UserAddressModule
OrdersModule
PaymentsModule 的开发环境模拟支付接口
订单状态日志写入
订单金额以后端计算为准
前端地址页接入真实 API
前端下单页接入真实 API
前端订单列表/详情接入真实 API
Apifox 测试文档
后端 contract-test 扩展
miniapp type-check / build:mp 验证
```

### 3.2 暂不实现

```txt
真实微信支付
支付回调验签
自动派单
师傅接单端
服务人员定位
评价系统
售后工单
优惠券真实核销
会员次卡真实核销
文件上传
后台 admin-web
复杂 RBAC
```

### 3.3 兼容原则

必须保持 Day 6 的统一响应格式：

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "requestId": "req_xxx",
  "timestamp": "2026-05-27T00:00:00.000Z"
}
```

所有需要登录的接口都使用：

```txt
Authorization: Bearer <accessToken>
```

## 4. 后端模块规划

### 4.1 UserAddressModule

新增目录：

```txt
server/src/addresses/
  addresses.module.ts
  addresses.controller.ts
  addresses.service.ts
  addresses.repository.ts
  dto/
    save-address.dto.ts
```

接口：

```txt
GET    /api/user/addresses
GET    /api/user/addresses/:id
POST   /api/user/addresses
PUT    /api/user/addresses/:id
DELETE /api/user/addresses/:id
```

全部需要登录。

前端已有路径：

```txt
GET    /user/addresses
POST   /user/addresses
PUT    /user/addresses/:id
DELETE /user/addresses/:id
```

建议额外补充：

```txt
GET /user/addresses/:id
```

用于编辑页直接按 ID 加载地址，避免先拉列表再查找。

DTO：

```ts
{
  contactName: string
  contactPhone: string
  cityName?: string
  districtName?: string
  detailAddress: string
  houseNumber?: string
  isDefault?: boolean
  latitude?: number | null
  longitude?: number | null
}
```

数据库映射：

| 前端字段 | 数据库字段 | 说明 |
| --- | --- | --- |
| `contactName` | `contact_name` | 联系人 |
| `contactPhone` | `contact_phone` | 手机号 |
| `cityName` | `city` | 城市 |
| `districtName` | `district` | 区县 |
| `detailAddress + houseNumber` | `address` | Day 7 不改表结构，组合保存 |
| `latitude` | `latitude` | 可空 |
| `longitude` | `longitude` | 可空 |
| `isDefault` | `is_default` | 默认地址 |

返回给前端时拆分策略：

```txt
如果后端无法可靠拆分 houseNumber，则返回：
detailAddress = address
houseNumber = ''
```

Day 7 不改 `user_addresses` 表结构，避免引入数据库迁移风险。后续如果确实需要独立门牌号，再新增字段。

默认地址规则：

```txt
同一用户只能有一个默认地址
创建第一条地址时自动设为默认
创建/更新 isDefault=true 时，事务内取消其他地址默认状态
删除默认地址后，如果用户还有地址，则把最新一条设为默认
软删除使用 deletedAt，不物理删除
用户只能操作自己的地址
```

错误码建议：

```txt
30001 USER_ADDRESS_NOT_FOUND
30002 USER_ADDRESS_FORBIDDEN
```

### 4.2 OrdersModule

新增目录：

```txt
server/src/orders/
  orders.module.ts
  orders.controller.ts
  orders.service.ts
  orders.repository.ts
  order-presenter.ts
  constants/
    order-status.ts
  dto/
    query-orders.dto.ts
    create-order.dto.ts
    price-preview.dto.ts
    cancel-order.dto.ts
```

接口：

```txt
GET  /api/orders
GET  /api/orders/:id
GET  /api/orders/price-preview
POST /api/orders
POST /api/orders/:id/cancel
POST /api/orders/:id/confirm
```

全部需要登录。

前端已有路径：

```txt
GET  /orders
GET  /orders/:id
GET  /orders/price-preview
POST /orders
POST /orders/:id/cancel
POST /orders/:id/confirm
```

#### 4.2.1 价格预览

```txt
GET /api/orders/price-preview
```

Query：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `serviceId` | integer | 是 | 服务 ID |
| `appointmentDate` | string | 否 | 预约日期 |
| `appointmentTimeSlot` | string | 否 | 时间段 |
| `addressId` | integer | 否 | 地址 ID |
| `couponId` | integer | 否 | Day 7 暂不生效 |
| `memberCardId` | integer | 否 | Day 7 暂不生效 |

返回：

```json
{
  "serviceAmount": 120,
  "discountAmount": 0,
  "payableAmount": 120,
  "items": [
    { "label": "服务金额", "amount": 120 },
    { "label": "优惠金额", "amount": 0, "type": "discount" }
  ]
}
```

计算规则：

```txt
读取 services.basePrice
Day 7 不信任前端金额
Day 7 暂不应用 coupon/memberCard
discountAmount 固定 0
payableAmount = serviceAmount
```

#### 4.2.2 创建订单

```txt
POST /api/orders
```

Body：

```json
{
  "serviceId": 11,
  "appointmentDate": "2026-05-28",
  "appointmentTimeSlot": "09:00-11:00",
  "addressId": 1,
  "remark": "请自带清洁工具",
  "couponId": null,
  "memberCardId": null
}
```

创建订单时必须：

```txt
校验用户已登录
校验服务存在、status=1、deletedAt=null
校验地址属于当前用户、deletedAt=null
以后端服务价格计算金额
生成 orderNo
写 orders
写 order_status_logs：null -> pending_payment
保存 serviceSnapshot
保存 addressSnapshot
```

初始状态：

```txt
pending_payment
```

orderNo 建议：

```txt
LA + yyyyMMddHHmmss + 4位随机数
```

需要事务：

```txt
创建订单
创建状态日志
```

#### 4.2.3 订单列表

```txt
GET /api/orders
```

Query：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `status` | string | 否 | `all` 或具体状态 |
| `page` | integer | 否 | 默认 1 |
| `pageSize` | integer | 否 | 默认 10，最大 100 |

只返回当前登录用户的订单。

返回结构必须匹配：

```ts
PageData<UserOrder>
```

单条返回：

```ts
{
  id: number
  orderNo: string
  status: OrderStatus
  serviceName: string
  serviceImage?: string
  appointmentTime: string
  addressText: string
  totalAmount: number
  payableAmount: number
  remark?: string
  staffName?: string
  staffPhone?: string
  staffRating?: number
  createdAt: string
}
```

#### 4.2.4 订单详情

```txt
GET /api/orders/:id
```

必须校验：

```txt
订单存在
订单属于当前用户
```

返回结构必须匹配：

```ts
OrderDetail
```

需要包含：

```txt
订单基本信息
服务快照
地址快照
师傅信息，如果已分配
状态日志
金额明细
支付状态
服务照片
```

#### 4.2.5 取消订单

```txt
POST /api/orders/:id/cancel
```

Body 可选：

```json
{
  "reason": "用户主动取消"
}
```

允许取消的状态：

```txt
pending_payment
pending_dispatch
```

Day 7 先只强制支持：

```txt
pending_payment
```

状态变化：

```txt
pending_payment -> cancelled
```

必须写：

```txt
orders.cancelledAt
orders.cancelReason
order_status_logs
```

#### 4.2.6 确认完成

```txt
POST /api/orders/:id/confirm
```

允许状态：

```txt
pending_confirm
```

状态变化：

```txt
pending_confirm -> completed
```

Day 7 因为还没有师傅履约端，真实订单默认不会自然进入 `pending_confirm`。这个接口先实现状态规则，测试可以通过 dev 接口或数据库准备一条 pending_confirm 订单。

### 4.3 PaymentsModule

Day 7 不接真实微信支付，只做开发环境模拟支付，帮助前端订单流转。

新增目录：

```txt
server/src/payments/
  payments.module.ts
  payments.controller.ts
  payments.service.ts
  payments.repository.ts
  dto/
    mock-pay.dto.ts
```

接口：

```txt
POST /api/orders/:id/pay
POST /api/payments/mock-success
```

前端已有：

```txt
POST /orders/:id/pay
```

#### 4.3.1 发起支付

```txt
POST /api/orders/:id/pay
```

Day 7 返回开发环境占位：

```json
{
  "paymentNo": "PAY202605270001",
  "paymentParams": {
    "mock": true
  }
}
```

同时写入：

```txt
payments
status = pending
channel = mock
amount = order.payableAmount
```

#### 4.3.2 模拟支付成功

```txt
POST /api/payments/mock-success
```

Body：

```json
{
  "orderId": 1
}
```

仅开发环境可用。

状态变化：

```txt
order.pending_payment -> order.pending_dispatch
payment.pending -> payment.success
```

必须写：

```txt
payments.paidAt
orders.paidAt
orders.paidAmount
order_status_logs
payment_notify_logs
```

## 5. 数据库操作准确性要求

### 5.1 事务边界

必须使用事务的操作：

```txt
设置默认地址
删除默认地址并补默认地址
创建订单 + 状态日志
取消订单 + 状态日志
发起支付 + Payment 写入
模拟支付成功 + Payment 更新 + Order 更新 + 状态日志 + notify log
确认完成 + 状态日志
```

### 5.2 金额规则

前端提交订单时不得提交金额。

后端必须从数据库读取：

```txt
services.basePrice
coupons 暂不参与
member_cards 暂不参与
```

Day 7 金额计算：

```txt
originalAmount = service.basePrice
discountAmount = 0
payableAmount = originalAmount
paidAmount = 0
```

支付成功后：

```txt
paidAmount = payableAmount
paidAt = now
status = pending_dispatch
```

### 5.3 快照规则

订单创建时必须保存快照，避免服务和地址后续修改影响历史订单。

`serviceSnapshot`：

```json
{
  "id": 11,
  "name": "日常保洁 2 小时",
  "description": "适合小户型基础清洁...",
  "coverImage": "",
  "basePrice": 120,
  "priceUnit": "次"
}
```

`addressSnapshot`：

```json
{
  "id": 1,
  "contactName": "张女士",
  "contactPhone": "13800000000",
  "cityName": "上海市",
  "districtName": "浦东新区",
  "detailAddress": "世纪大道 100 号 8 栋 1201",
  "latitude": null,
  "longitude": null
}
```

### 5.4 ID 与序列化

所有返回给前端的字段必须满足：

```txt
BigInt -> number
Decimal -> number
Date -> ISO string 或前端展示字符串
JSON 快照 -> 普通对象
```

不要返回 Prisma Decimal 对象。

### 5.5 权限边界

用户只能访问自己的：

```txt
addresses
orders
payments
```

不允许通过改 URL id 读取或修改别人的数据。

## 6. 前端开发计划

### 6.1 地址页真实化

文件：

```txt
miniapp/src/pages/address/list.vue
miniapp/src/pages/address/edit.vue
miniapp/src/api/address.ts
miniapp/src/api/types/address.ts
```

改造：

```txt
list.vue 使用 getUserAddresses()
edit.vue 新增 getUserAddress(id) 或从列表查询
edit.vue 保存时使用 createUserAddress/updateUserAddress
edit.vue 删除时使用 deleteUserAddress
选择地址时继续写本地 selectedAddress，供下单页回显
```

注意：

```txt
地址列表接口需要登录
401 交给现有 http.ts 自动跳登录
```

### 6.2 下单页真实化

文件：

```txt
miniapp/src/pages/order/create.vue
miniapp/src/api/orders.ts
miniapp/src/api/address.ts
```

改造：

```txt
loadService 继续用 getServiceDetail
syncSelectedAddress 改为优先读取真实地址列表默认地址
选择地址后使用本地 selectedAddress 缓存
价格明细改用 getOrderPricePreview
提交订单改用 createOrder
创建成功后跳 payment/result 或 order/detail
```

提交后建议跳转：

```txt
/pages/payment/result?orderId=<真实订单id>&status=pending&amount=<payableAmount>
```

### 6.3 订单列表真实化

文件：

```txt
miniapp/src/pages/order/list.vue
miniapp/src/api/orders.ts
```

改造：

```txt
loadOrders 使用 getOrders({ status, page: 1, pageSize: 20 })
切换 tab 时重新请求接口
取消订单使用 cancelOrder(id)
取消成功后刷新列表
```

`in_service` tab 当前是聚合状态，前端可以继续聚合：

```txt
dispatched
accepted
on_the_way
in_service
```

也可以后端增加：

```txt
statusGroup=in_service
```

Day 7 推荐先前端聚合，减少后端复杂度。

### 6.4 订单详情真实化

文件：

```txt
miniapp/src/pages/order/detail.vue
miniapp/src/api/orders.ts
```

改造：

```txt
loadOrder 使用 getOrderDetail(id)
去支付调用 payOrder(id)
确认完成调用 confirmOrder(id)
取消订单调用 cancelOrder(id)
操作成功后重新 loadOrder()
```

### 6.5 支付结果页真实化

文件：

```txt
miniapp/src/pages/payment/result.vue
miniapp/src/api/orders.ts
```

Day 7 推荐：

```txt
如果 status=pending，页面显示“订单已提交”
提供“模拟支付成功”按钮，仅 H5/development 展示
点击后调用 POST /payments/mock-success
成功后跳订单详情
```

正式微信支付后再替换。

### 6.6 我的页统计数据

Day 7 可选实现：

```txt
GET /api/users/me/stats
```

返回：

```json
{
  "orders": {
    "pendingPayment": 1,
    "pendingDispatch": 0,
    "pendingConfirm": 0,
    "pendingReview": 0,
    "afterSales": 0
  },
  "profile": {
    "coupons": 0,
    "memberCards": 0,
    "favorites": 0
  }
}
```

如果 Day 7 时间不足，统计数据仍可暂时 mock，不影响下单闭环。

## 7. Apifox 测试清单

新增文档：

```txt
docs/test/day7-user-order-api.md
```

测试顺序：

```txt
1. POST /auth/mock-login，保存 accessToken
2. GET /auth/me，确认登录态
3. POST /user/addresses，创建地址
4. GET /user/addresses，保存 addressId
5. PUT /user/addresses/{{addressId}}，更新地址
6. GET /services?page=1&pageSize=1，保存 serviceId
7. GET /orders/price-preview?serviceId={{serviceId}}&addressId={{addressId}}
8. POST /orders，创建订单，保存 orderId
9. GET /orders
10. GET /orders/{{orderId}}
11. POST /orders/{{orderId}}/pay
12. POST /payments/mock-success
13. GET /orders/{{orderId}}，确认 status=pending_dispatch
14. 新建第二个订单
15. POST /orders/{{orderId}}/cancel，确认 status=cancelled
16. DELETE /user/addresses/{{addressId}}
17. GET /user/addresses，确认已删除或 deletedAt 被过滤
```

必须断言：

```txt
所有成功响应 code=0
所有错误响应有 requestId/timestamp
地址只能操作当前用户数据
订单只能操作当前用户数据
basePrice/payableAmount 是 number
orderId/addressId 是 number
订单创建不接受前端金额
取消已支付订单要返回业务错误
```

## 8. 后端测试计划

新增或扩展：

```txt
server/scripts/contract-test.ts
server/scripts/db-verify.ts
```

Day 7 contract-test 必须覆盖：

```txt
地址 CRUD
默认地址唯一性
订单价格预览
创建订单
订单列表
订单详情
取消订单
发起支付
模拟支付成功
跨用户访问禁止
无 token 返回 401 + code=20001
错误 token 返回 401 + code=20002
```

数据库专项验证：

```txt
user_addresses count 正确
orders count 正确
order_status_logs 随订单状态变化增加
payments 记录正确
payment_notify_logs 记录正确
order.serviceSnapshot 不因服务修改而变化
order.addressSnapshot 不因地址修改而变化
```

## 9. 错误码扩展

在 `server/src/common/errors/error-code.ts` 中扩展：

```ts
USER_ADDRESS_NOT_FOUND = 30001
USER_ADDRESS_FORBIDDEN = 30002
ORDER_NOT_FOUND = 50001
ORDER_STATUS_INVALID = 50002
ORDER_FORBIDDEN = 50003
ORDER_PRICE_CHANGED = 50004
PAYMENT_NOT_FOUND = 60001
PAYMENT_STATUS_INVALID = 60002
PAYMENT_MOCK_DISABLED = 60003
```

Day 7 不需要把错误码设计得过细，但必须避免所有业务错误都返回 `COMMON_BAD_REQUEST`。

## 10. 推荐执行顺序

### Step 1：后端地址模块

```txt
实现 AddressesModule
实现 DTO 校验
实现 Repository
实现默认地址事务
Apifox 跑通地址 CRUD
```

验收：

```txt
GET /user/addresses 返回真实数据库地址
POST /user/addresses 创建地址
PUT /user/addresses/:id 更新地址
DELETE /user/addresses/:id 软删除地址
默认地址只有一个
```

### Step 2：前端地址页接入真实 API

```txt
list.vue 替换 getMockAddresses
edit.vue 替换 saveMockAddresses
保留 selectedAddress 本地缓存用于下单页选择态
```

验收：

```txt
登录后能新增地址
能编辑地址
能删除地址
能选择地址返回下单页
刷新后地址仍存在
```

### Step 3：后端订单价格预览与创建订单

```txt
实现 OrdersModule 基础结构
实现 GET /orders/price-preview
实现 POST /orders
创建订单写 order_status_logs
```

验收：

```txt
价格来自 services.basePrice
订单创建成功
orders/serviceSnapshot/addressSnapshot 正确
order_status_logs 有 pending_payment
```

### Step 4：前端下单页接入真实 API

```txt
getOrderPricePreview 替代 createMockPricePreview
createOrder 替代 setTimeout 假提交
提交成功跳真实 orderId
```

验收：

```txt
选择服务和地址后可提交订单
提交后数据库出现订单
订单详情能打开真实订单
```

### Step 5：后端订单列表/详情/取消/确认

```txt
实现 GET /orders
实现 GET /orders/:id
实现 POST /orders/:id/cancel
实现 POST /orders/:id/confirm
```

验收：

```txt
列表只返回当前用户订单
详情只返回当前用户订单
取消 pending_payment 成功
取消不可取消状态返回 50002
确认完成状态规则正确
```

### Step 6：前端订单列表/详情接入真实 API

```txt
order/list.vue 替换 getMockOrders
order/detail.vue 替换 getMockOrderDetail
取消/确认操作调用后端
操作成功后刷新
```

验收：

```txt
订单列表显示真实订单
订单详情显示真实订单
取消订单后列表状态同步
```

### Step 7：支付占位

```txt
实现 POST /orders/:id/pay
实现 POST /payments/mock-success
payment/result.vue 开发环境支持模拟支付成功
```

验收：

```txt
待支付订单可发起 mock 支付
mock 支付成功后订单变 pending_dispatch
payments 和 payment_notify_logs 有记录
```

### Step 8：文档和自动测试

```txt
新增 docs/test/day7-user-order-api.md
扩展 contract-test
扩展 db-verify
运行 server build
运行 miniapp type-check
运行 miniapp build:mp
```

## 11. Day 7 验收清单

### 11.1 后端

```txt
[ ] AddressesModule 完成
[ ] OrdersModule 完成
[ ] PaymentsModule mock 支付完成
[ ] 所有新增接口走统一响应
[ ] 所有新增接口有 DTO 校验
[ ] 所有用户资源接口有 JWT 鉴权
[ ] 地址默认值事务正确
[ ] 订单金额以后端计算为准
[ ] 订单创建保存快照
[ ] 订单状态变化写日志
[ ] mock 支付写 payments 和 payment_notify_logs
[ ] contract-test 通过
[ ] npm run build 通过
```

### 11.2 前端

```txt
[ ] 地址列表不再使用 getMockAddresses 作为主数据源
[ ] 地址编辑不再使用 saveMockAddresses 作为主数据源
[ ] 下单页价格预览来自后端
[ ] 下单页提交订单来自后端
[ ] 订单列表来自后端
[ ] 订单详情来自后端
[ ] 取消订单调用后端
[ ] 支付结果页能跳转真实订单详情
[ ] pnpm type-check 通过
[ ] pnpm build:mp 通过
```

### 11.3 Apifox

```txt
[ ] 地址 CRUD 全部通过
[ ] 价格预览通过
[ ] 创建订单通过
[ ] 订单列表通过
[ ] 订单详情通过
[ ] 取消订单通过
[ ] 发起支付通过
[ ] 模拟支付成功通过
[ ] 无 token 场景返回 code=20001
[ ] 错误 token 场景返回 code=20002
```

## 12. Day 7 完成定义

满足以下条件才认为 Day 7 完成：

```txt
用户可以在 miniapp 中登录
用户可以新增/编辑/删除真实地址
用户可以从服务详情进入下单页
用户可以选择真实地址创建真实订单
用户可以查看真实订单列表
用户可以查看真实订单详情
用户可以取消待支付订单
开发环境可以模拟支付成功并推动订单状态
所有新增数据真实写入 MySQL
所有新增接口通过 Apifox 和 contract-test
miniapp 构建验证通过
```

## 13. Day 8 方向

Day 7 完成后，Day 8 再进入：

```txt
师傅端任务列表
师傅接单/拒单
履约打卡
服务照片上传
订单 pending_dispatch -> dispatched -> accepted -> on_the_way -> in_service -> pending_confirm 流程
```

或者进入：

```txt
admin-web 管理后台
订单管理
人工派单
员工管理
服务管理 CRUD
```

具体 Day 8 方向取决于 Day 7 后你更想先打通“师傅履约端”还是“管理员后台端”。
