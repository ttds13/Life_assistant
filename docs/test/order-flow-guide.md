# 订单主流程接口调用顺序

更新时间：2026-05-28

本文档用于指导在 Apifox 中按正确顺序完成一笔订单的完整流转。订单接口不是单个接口独立乱序调用的，必须符合后端状态机，否则会返回：

```txt
HTTP 409
code = 50002
message = order status changed, refresh and retry
```

推荐开发环境前置 URL：

```txt
http://127.0.0.1:3100/api
```

接口 URL 只填写后半段，例如：

```txt
/orders/{{orderId}}/pay
```

不要写成：

```txt
/api/orders/{{orderId}}/pay
```

## 1. 必备环境变量

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `accessToken` | 登录后保存 | string | 用户登录 token |
| `serviceId` | 服务列表保存 | integer | 创建订单使用的服务 ID |
| `addressId` | 创建地址后保存 | integer | 创建订单使用的地址 ID |
| `orderId` | 创建订单后保存 | integer | 主流程订单 ID |
| `paymentNo` | 发起支付后保存 | string | mock 支付单号 |
| `orderVersion` | 订单详情或状态变更后保存 | integer | 订单版本号，用于状态变更并发校验 |
| `adminId` | `1` | integer | 开发环境模拟管理员身份 |
| `staffId` | `1` | integer | 开发环境模拟师傅身份 |

## 2. 公共 Header

用户端和支付接口：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 用户登录 token |

管理端接口额外添加：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `X-Admin-Id` | `{{adminId}}` | integer | 开发环境模拟管理员身份 |

师傅端接口额外添加：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `X-Staff-Id` | `{{staffId}}` | integer | 开发环境模拟师傅身份 |

## 3. 状态流转总览

| 步骤 | 接口 | 操作方 | 成功后状态 |
| --- | --- | --- | --- |
| 1 | `POST /orders` | 用户 | `pending_payment` |
| 2 | `POST /orders/{{orderId}}/pay` | 用户 | 支付单 `pending`，订单仍为 `pending_payment` |
| 3 | `POST /payments/mock-success` | 支付回调模拟 | `pending_dispatch` |
| 4 | `POST /admin/orders/{{orderId}}/assign` | 管理员 | `dispatched` |
| 5 | `POST /staff/orders/{{orderId}}/accept` | 师傅 | `accepted` |
| 6 | `POST /staff/orders/{{orderId}}/on-the-way` | 师傅 | `on_the_way` |
| 7 | `POST /staff/orders/{{orderId}}/start-service` | 师傅 | `in_service` |
| 8 | `POST /staff/orders/{{orderId}}/complete` | 师傅 | `pending_confirm` |
| 9 | `POST /orders/{{orderId}}/confirm` | 用户 | `completed` |

只有订单到达 `pending_confirm` 后，用户确认完成接口才可以成功。

## 4. 详细调用顺序

### 4.1 创建订单

```txt
方法：POST
URL：/orders
```

Body JSON：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `serviceId` | `{{serviceId}}` | integer | 服务 ID |
| `appointmentDate` | `2026-06-01` | string | 预约日期 |
| `appointmentTimeSlot` | `09:00-11:00` | string | 预约时间段 |
| `addressId` | `{{addressId}}` | integer | 地址 ID |
| `remark` | `Apifox订单测试` | string | 用户备注 |

```json
{
  "serviceId": {{serviceId}},
  "appointmentDate": "2026-06-01",
  "appointmentTimeSlot": "09:00-11:00",
  "addressId": {{addressId}},
  "remark": "Apifox订单测试"
}
```

期望：

```txt
HTTP 200
code = 0
data.status = pending_payment
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('create order ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.status).to.eql('pending_payment')
})

if (json.code === 0 && json.data?.id) {
  pm.environment.set('orderId', String(json.data.id))
  pm.environment.set('orderVersion', String(json.data.version || 0))
}
```

### 4.2 发起订单支付

```txt
方法：POST
URL：/orders/{{orderId}}/pay
```

Body：

```txt
无
```

期望：

```txt
HTTP 200
code = 0
data.paymentNo 是字符串
data.status = pending
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('pay order ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.paymentNo).to.be.a('string')
})

if (json.code === 0 && json.data?.paymentNo) {
  pm.environment.set('paymentNo', json.data.paymentNo)
}
```

### 4.3 Mock 支付成功

```txt
方法：POST
URL：/payments/mock-success
```

Body JSON：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `paymentNo` | `{{paymentNo}}` | string | 发起支付返回的支付单号 |

```json
{
  "paymentNo": "{{paymentNo}}"
}
```

期望：

```txt
HTTP 200
code = 0
data.status = success
data.order.status = pending_dispatch
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('mock success ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.order.status).to.eql('pending_dispatch')
})

if (json.code === 0 && json.data?.order?.version !== undefined) {
  pm.environment.set('orderVersion', String(json.data.order.version))
}
```

### 4.4 管理端派单

```txt
方法：POST
URL：/admin/orders/{{orderId}}/assign
```

Headers 需要包含：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Authorization` | `Bearer {{accessToken}}` | string | 登录 token |
| `X-Admin-Id` | `{{adminId}}` | integer | 开发环境模拟管理员 |

Body JSON：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `staffId` | `{{staffId}}` | integer | 指派给该师傅 |
| `remark` | `Apifox派单测试` | string | 派单备注 |

```json
{
  "staffId": {{staffId}},
  "remark": "Apifox派单测试"
}
```

期望：

```txt
HTTP 200
code = 0
data.status = dispatched
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('assign order ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.status).to.eql('dispatched')
})

if (json.code === 0 && json.data?.version !== undefined) {
  pm.environment.set('orderVersion', String(json.data.version))
}
```

### 4.5 师傅接单

```txt
方法：POST
URL：/staff/orders/{{orderId}}/accept
```

Headers 需要包含：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Authorization` | `Bearer {{accessToken}}` | string | 登录 token |
| `X-Staff-Id` | `{{staffId}}` | integer | 开发环境模拟师傅 |

Body：

```txt
无
```

期望：

```txt
HTTP 200
code = 0
data.status = accepted
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('staff accept ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.status).to.eql('accepted')
})

if (json.code === 0 && json.data?.version !== undefined) {
  pm.environment.set('orderVersion', String(json.data.version))
}
```

### 4.6 师傅出发

```txt
方法：POST
URL：/staff/orders/{{orderId}}/on-the-way
```

Body JSON：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `version` | `{{orderVersion}}` | integer | 当前订单版本号 |

```json
{
  "version": {{orderVersion}}
}
```

期望：

```txt
HTTP 200
code = 0
data.status = on_the_way
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('staff on the way ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.status).to.eql('on_the_way')
})

if (json.code === 0 && json.data?.version !== undefined) {
  pm.environment.set('orderVersion', String(json.data.version))
}
```

### 4.7 师傅开始服务

```txt
方法：POST
URL：/staff/orders/{{orderId}}/start-service
```

Body JSON：

```json
{
  "version": {{orderVersion}}
}
```

期望：

```txt
HTTP 200
code = 0
data.status = in_service
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('staff start service ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.status).to.eql('in_service')
})

if (json.code === 0 && json.data?.version !== undefined) {
  pm.environment.set('orderVersion', String(json.data.version))
}
```

### 4.8 师傅完成服务

```txt
方法：POST
URL：/staff/orders/{{orderId}}/complete
```

Body JSON：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `remark` | `服务已完成` | string | 完成备注 |
| `photoUrls` | `["/static/logo.svg"]` | array<string> | 服务照片，可选 |
| `version` | `{{orderVersion}}` | integer | 当前订单版本号 |

```json
{
  "remark": "服务已完成",
  "photoUrls": ["/static/logo.svg"],
  "version": {{orderVersion}}
}
```

期望：

```txt
HTTP 200
code = 0
data.status = pending_confirm
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('staff complete ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.status).to.eql('pending_confirm')
})

if (json.code === 0 && json.data?.version !== undefined) {
  pm.environment.set('orderVersion', String(json.data.version))
}
```

### 4.9 用户确认完成

```txt
方法：POST
URL：/orders/{{orderId}}/confirm
```

Body JSON：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `version` | `{{orderVersion}}` | integer | 当前订单版本号 |

```json
{
  "version": {{orderVersion}}
}
```

期望：

```txt
HTTP 200
code = 0
data.status = completed
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('user confirm ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.status).to.eql('completed')
})

if (json.code === 0 && json.data?.version !== undefined) {
  pm.environment.set('orderVersion', String(json.data.version))
}
```

## 5. 每一步前的状态检查

如果不确定当前该调用哪个接口，先查订单详情：

```txt
GET /orders/{{orderId}}
```

查看：

```txt
data.status
data.version
```

然后按下表选择下一步：

| 当前状态 | 下一步接口 |
| --- | --- |
| `pending_payment` | `POST /orders/{{orderId}}/pay`，然后 `POST /payments/mock-success` |
| `pending_dispatch` | `POST /admin/orders/{{orderId}}/assign` |
| `dispatched` | `POST /staff/orders/{{orderId}}/accept` |
| `accepted` | `POST /staff/orders/{{orderId}}/on-the-way` |
| `on_the_way` | `POST /staff/orders/{{orderId}}/start-service` |
| `in_service` | `POST /staff/orders/{{orderId}}/complete` |
| `pending_confirm` | `POST /orders/{{orderId}}/confirm` |
| `completed` | 主流程已结束，不要继续调用状态变更接口 |

## 6. 常见错误

### 6.1 用户只调用用户端接口

用户端只能完成：

```txt
创建订单 -> 发起支付 -> 用户确认完成
```

但用户确认完成之前，必须经过管理端派单和师傅端履约。所以如果只在用户端操作，直接调用 `confirm` 会报：

```txt
code = 50002
```

### 6.2 orderVersion 过期

每次状态变化后，`version` 会变化。带旧 `version` 调用后续接口，也可能返回：

```txt
code = 50002
message = order status changed, refresh and retry
```

处理方式：

```txt
1. GET /orders/{{orderId}}
2. 把 data.version 保存到 orderVersion
3. 再调用下一步状态变更接口
```

### 6.3 URL 多写了 /api

如果前置 URL 是：

```txt
http://127.0.0.1:3100/api
```

接口 URL 应写：

```txt
/orders
```

不要写：

```txt
/api/orders
```

否则会变成：

```txt
/api/api/orders
```

### 6.4 Header 放错位置

`Authorization` 必须放在 Headers 或 Auth 中，不能放在 Params。

正确 Header：

```txt
Authorization: Bearer {{accessToken}}
```

如果放在 Params，后端无法识别登录态，会返回：

```txt
HTTP 401
code = 20001
```
