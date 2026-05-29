# 订单模块 Apifox 测试清单

更新时间：2026-05-28

本文档用于在 Apifox 中手动创建订单模块测试用例。  
推荐后端开发环境前置 URL：

```txt
http://127.0.0.1:3100/api
```

如果 Apifox 已配置前置 URL，则接口 URL 只填写后半段，并以 `/` 开头，例如：

```txt
/orders
```

不要写成：

```txt
/api/orders
```

## 1. 环境变量

建议在 Apifox 环境变量中添加：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `accessToken` | 空 | string | 登录后保存用户 token |
| `serviceId` | 空 | integer | 服务 ID，可从服务列表保存 |
| `addressId` | 空 | integer | 地址 ID，创建地址后保存 |
| `orderId` | 空 | integer | 主流程订单 ID |
| `paymentNo` | 空 | string | mock 支付单号 |
| `staffId` | `1` | integer | 师傅 ID，开发环境测试用 |
| `adminId` | `1` | integer | 管理员 ID，开发环境测试用 |

本文所有 Header、Query Params、Path Params、Body JSON 均按以下字段给出：

```txt
参数名 + 数值 + 参数类型 + 描述
```

## 2. 公共 Header

所有接口建议带上：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |

需要登录的接口额外带上：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Authorization` | `Bearer {{accessToken}}` | string | 用户登录 token |

管理端接口在非生产环境额外带上：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `X-Admin-Id` | `{{adminId}}` | integer | 开发环境模拟管理员身份；生产环境不可用 |

师傅端接口在非生产环境额外带上：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `X-Staff-Id` | `{{staffId}}` | integer | 开发环境模拟师傅身份；生产环境不可用 |

## 3. 推荐测试顺序

```txt
1. 模拟登录，保存 accessToken
2. 获取服务列表，保存 serviceId
3. 创建用户地址，保存 addressId
4. 价格预览
5. 创建订单，保存 orderId
6. 发起 mock 支付，保存 paymentNo
7. mock 支付成功，订单进入 pending_dispatch
8. 管理端派单，订单进入 dispatched
9. 师傅接单，订单进入 accepted
10. 师傅出发，订单进入 on_the_way
11. 师傅开始服务，订单进入 in_service
12. 师傅完成服务，订单进入 pending_confirm
13. 用户确认完成，订单进入 completed
14. 查询用户/管理端/师傅端订单列表和详情
```

## 4. 前置接口

### 4.1 模拟登录

Apifox 填写：

```txt
接口名称：模拟登录
方法：POST
URL：/auth/mock-login
完整 URL：http://127.0.0.1:3100/api/auth/mock-login
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |

Body JSON：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `phone` | `13800001111` | string | 测试手机号 |

Body 示例：

```json
{
  "phone": "13800001111"
}
```

期望：

```txt
HTTP 200
code = 0
data.accessToken 是字符串
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('mock login ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.accessToken).to.be.a('string')
})

pm.environment.set('accessToken', json.data.accessToken)
pm.environment.set('userId', String(json.data.user.id))
```

### 4.2 获取服务并保存 serviceId

Apifox 填写：

```txt
接口名称：保存第一个服务 ID
方法：GET
URL：/services
完整 URL：http://127.0.0.1:3100/api/services
```

Query Params：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `page` | `1` | integer | 查询第一页 |
| `pageSize` | `1` | integer | 只取一条服务数据 |

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |

期望：

```txt
HTTP 200
code = 0
data.items[0].id 是数字
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('save first service id', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.items).to.be.an('array')
  pm.expect(json.data.items.length).to.be.greaterThan(0)
})

pm.environment.set('serviceId', String(json.data.items[0].id))
```

### 4.3 创建用户地址并保存 addressId

Apifox 填写：

```txt
接口名称：创建用户地址
方法：POST
URL：/user/addresses
完整 URL：http://127.0.0.1:3100/api/user/addresses
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 用户登录 token |

Body JSON：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `contactName` | `Apifox测试用户` | string | 联系人姓名 |
| `contactPhone` | `13800001111` | string | 联系人手机号 |
| `cityName` | `上海市` | string | 城市 |
| `districtName` | `浦东新区` | string | 区县 |
| `detailAddress` | `测试路 1 号` | string | 详细地址 |
| `houseNumber` | `1-101` | string | 门牌号，可选 |
| `isDefault` | `true` | boolean | 是否默认地址 |
| `latitude` | `31.2304000` | number | 纬度，可选 |
| `longitude` | `121.4737000` | number | 经度，可选 |

Body 示例：

```json
{
  "contactName": "Apifox测试用户",
  "contactPhone": "13800001111",
  "cityName": "上海市",
  "districtName": "浦东新区",
  "detailAddress": "测试路 1 号",
  "houseNumber": "1-101",
  "isDefault": true,
  "latitude": 31.2304,
  "longitude": 121.4737
}
```

期望：

```txt
HTTP 200
code = 0
data.id 是数字
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('create address ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.id).to.be.a('number')
})

pm.environment.set('addressId', String(json.data.id))
```

## 5. 用户端订单接口

### 5.1 订单价格预览

Apifox 填写：

```txt
接口名称：订单价格预览
方法：GET
URL：/orders/price-preview
完整 URL：http://127.0.0.1:3100/api/orders/price-preview
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 用户登录 token |

Query Params：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `serviceId` | `{{serviceId}}` | integer | 服务 ID |

期望：

```txt
HTTP 200
code = 0
data.payableAmount 是数字
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('price preview ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.serviceAmount).to.be.a('number')
  pm.expect(json.data.payableAmount).to.be.a('number')
})
```

### 5.2 创建订单

Apifox 填写：

```txt
接口名称：创建订单
方法：POST
URL：/orders
完整 URL：http://127.0.0.1:3100/api/orders
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 用户登录 token |

Body JSON：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `serviceId` | `{{serviceId}}` | integer | 服务 ID |
| `appointmentDate` | `2026-06-01` | string | 预约日期，格式 `YYYY-MM-DD` |
| `appointmentTimeSlot` | `09:00-11:00` | string | 预约时间段，格式 `HH:mm-HH:mm` |
| `addressId` | `{{addressId}}` | integer | 用户地址 ID |
| `remark` | `Apifox订单测试` | string | 用户备注，可选 |
| `couponId` | 空 | integer | 优惠券 ID，可选，当前可不传 |
| `memberCardId` | 空 | integer | 会员卡 ID，可选，当前可不传 |

Body 示例：

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
  pm.expect(json.data.id).to.be.a('number')
  pm.expect(json.data.status).to.eql('pending_payment')
  pm.expect(json.data.orderNo).to.be.a('string')
})

pm.environment.set('orderId', String(json.data.id))
pm.environment.set('orderVersion', String(json.data.version || 0))
```

### 5.3 用户订单列表

Apifox 填写：

```txt
接口名称：用户订单列表
方法：GET
URL：/orders
完整 URL：http://127.0.0.1:3100/api/orders
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 用户登录 token |

Query Params：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `status` | `all` | string | 订单状态筛选，可填 `all` 或具体状态 |
| `page` | `1` | integer | 页码 |
| `pageSize` | `10` | integer | 每页数量，最大 100 |

期望：

```txt
HTTP 200
code = 0
data.items 是数组
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('user orders ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.items).to.be.an('array')
  pm.expect(json.data.total).to.be.a('number')
})
```

### 5.4 用户订单详情

Apifox 填写：

```txt
接口名称：用户订单详情
方法：GET
URL：/orders/{{orderId}}
完整 URL：http://127.0.0.1:3100/api/orders/{{orderId}}
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 用户登录 token |

Path Params：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `id` | `{{orderId}}` | integer | 订单 ID |

期望：

```txt
HTTP 200
code = 0
data.id = orderId
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('user order detail ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.id).to.eql(Number(pm.environment.get('orderId')))
  pm.expect(json.data.status).to.be.a('string')
  pm.expect(json.data.statusLogs).to.be.an('array')
})

pm.environment.set('orderVersion', String(json.data.version || 0))
```

### 5.5 发起订单支付

Apifox 填写：

```txt
接口名称：发起订单支付
方法：POST
URL：/orders/{{orderId}}/pay
完整 URL：http://127.0.0.1:3100/api/orders/{{orderId}}/pay
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 用户登录 token |

Path Params：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `id` | `{{orderId}}` | integer | 订单 ID |

Body：

```txt
无
```

期望：

```txt
HTTP 200
code = 0
data.paymentNo 是字符串
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('pay order ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.paymentNo).to.be.a('string')
})

pm.environment.set('paymentNo', json.data.paymentNo)
```

### 5.6 取消未支付订单

注意：该接口只允许取消 `pending_payment` 订单。  
如果当前 `{{orderId}}` 已经支付成功，请重新创建一个新订单再测试取消。

Apifox 填写：

```txt
接口名称：取消未支付订单
方法：POST
URL：/orders/{{orderId}}/cancel
完整 URL：http://127.0.0.1:3100/api/orders/{{orderId}}/cancel
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 用户登录 token |

Path Params：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `id` | `{{orderId}}` | integer | 订单 ID |

Body JSON：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `version` | `{{orderVersion}}` | integer | 订单版本号，可选；用于旧页面提交校验 |
| `reason` | `用户取消测试` | string | 取消原因，可选 |

Body 示例：

```json
{
  "version": {{orderVersion}},
  "reason": "用户取消测试"
}
```

期望：

```txt
HTTP 200
code = 0
data.status = cancelled
```

### 5.7 用户确认完成

注意：该接口只允许确认 `pending_confirm` 订单。  
需要先完成支付、派单、接单、履约后再测试。

Apifox 填写：

```txt
接口名称：用户确认完成
方法：POST
URL：/orders/{{orderId}}/confirm
完整 URL：http://127.0.0.1:3100/api/orders/{{orderId}}/confirm
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 用户登录 token |

Path Params：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `id` | `{{orderId}}` | integer | 订单 ID |

Body JSON：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `version` | `{{orderVersion}}` | integer | 订单版本号，可选 |

Body 示例：

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

## 6. 管理端订单接口

### 6.1 管理端订单列表

Apifox 填写：

```txt
接口名称：管理端订单列表
方法：GET
URL：/admin/orders
完整 URL：http://127.0.0.1:3100/api/admin/orders
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 登录 token |
| `X-Admin-Id` | `{{adminId}}` | integer | 开发环境模拟管理员身份 |

Query Params：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `status` | `all` | string | 订单状态筛选，可填 `all` 或具体状态 |
| `page` | `1` | integer | 页码 |
| `pageSize` | `10` | integer | 每页数量 |

期望：

```txt
HTTP 200
code = 0
data.items 是数组
```

### 6.2 管理端订单详情

Apifox 填写：

```txt
接口名称：管理端订单详情
方法：GET
URL：/admin/orders/{{orderId}}
完整 URL：http://127.0.0.1:3100/api/admin/orders/{{orderId}}
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 登录 token |
| `X-Admin-Id` | `{{adminId}}` | integer | 开发环境模拟管理员身份 |

Path Params：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `id` | `{{orderId}}` | integer | 订单 ID |

期望：

```txt
HTTP 200
code = 0
data.id = orderId
```

### 6.3 管理端派单

注意：该接口只允许 `pending_dispatch -> dispatched`。  
需要先执行订单支付成功。

Apifox 填写：

```txt
接口名称：管理端派单
方法：POST
URL：/admin/orders/{{orderId}}/assign
完整 URL：http://127.0.0.1:3100/api/admin/orders/{{orderId}}/assign
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 登录 token |
| `X-Admin-Id` | `{{adminId}}` | integer | 开发环境模拟管理员身份 |

Path Params：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `id` | `{{orderId}}` | integer | 订单 ID |

Body JSON：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `staffId` | `{{staffId}}` | integer | 派单给该师傅 |
| `remark` | `Apifox派单测试` | string | 派单备注，可选 |

Body 示例：

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
data.staffName 有值
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('assign order ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.status).to.eql('dispatched')
})

pm.environment.set('orderVersion', String(json.data.version || 0))
```

## 7. 师傅端订单接口

### 7.1 师傅端订单列表

Apifox 填写：

```txt
接口名称：师傅端订单列表
方法：GET
URL：/staff/orders
完整 URL：http://127.0.0.1:3100/api/staff/orders
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 登录 token |
| `X-Staff-Id` | `{{staffId}}` | integer | 开发环境模拟师傅身份 |

Query Params：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `status` | `all` | string | 订单状态筛选，可填 `all` 或具体状态 |
| `page` | `1` | integer | 页码 |
| `pageSize` | `10` | integer | 每页数量 |

期望：

```txt
HTTP 200
code = 0
data.items 是数组
```

### 7.2 师傅端订单详情

Apifox 填写：

```txt
接口名称：师傅端订单详情
方法：GET
URL：/staff/orders/{{orderId}}
完整 URL：http://127.0.0.1:3100/api/staff/orders/{{orderId}}
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 登录 token |
| `X-Staff-Id` | `{{staffId}}` | integer | 开发环境模拟师傅身份 |

Path Params：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `id` | `{{orderId}}` | integer | 订单 ID |

期望：

```txt
HTTP 200
code = 0
data.id = orderId
```

### 7.3 师傅接单

注意：只允许 `dispatched -> accepted`。

Apifox 填写：

```txt
接口名称：师傅接单
方法：POST
URL：/staff/orders/{{orderId}}/accept
完整 URL：http://127.0.0.1:3100/api/staff/orders/{{orderId}}/accept
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 登录 token |
| `X-Staff-Id` | `{{staffId}}` | integer | 开发环境模拟师傅身份 |

Path Params：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `id` | `{{orderId}}` | integer | 订单 ID |

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

pm.environment.set('orderVersion', String(json.data.version || 0))
```

### 7.4 师傅拒单

注意：只允许 `dispatched -> pending_dispatch`。  
如果已经接单，则该接口应返回 409；建议另起一单，执行到派单成功后再测试拒单。

Apifox 填写：

```txt
接口名称：师傅拒单
方法：POST
URL：/staff/orders/{{orderId}}/reject
完整 URL：http://127.0.0.1:3100/api/staff/orders/{{orderId}}/reject
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 登录 token |
| `X-Staff-Id` | `{{staffId}}` | integer | 开发环境模拟师傅身份 |

Path Params：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `id` | `{{orderId}}` | integer | 订单 ID |

Body JSON：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `reason` | `时间冲突` | string | 拒单原因，可选 |
| `version` | `{{orderVersion}}` | integer | 订单版本号，可选 |

Body 示例：

```json
{
  "reason": "时间冲突",
  "version": {{orderVersion}}
}
```

期望：

```txt
HTTP 200
code = 0
data.status = pending_dispatch
```

### 7.5 师傅出发

注意：只允许 `accepted -> on_the_way`。

Apifox 填写：

```txt
接口名称：师傅出发
方法：POST
URL：/staff/orders/{{orderId}}/on-the-way
完整 URL：http://127.0.0.1:3100/api/staff/orders/{{orderId}}/on-the-way
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 登录 token |
| `X-Staff-Id` | `{{staffId}}` | integer | 开发环境模拟师傅身份 |

Path Params：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `id` | `{{orderId}}` | integer | 订单 ID |

Body JSON：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `version` | `{{orderVersion}}` | integer | 订单版本号，可选 |

Body 示例：

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
pm.environment.set('orderVersion', String(json.data.version || 0))
```

### 7.6 师傅开始服务

注意：只允许 `on_the_way -> in_service`。

Apifox 填写：

```txt
接口名称：师傅开始服务
方法：POST
URL：/staff/orders/{{orderId}}/start-service
完整 URL：http://127.0.0.1:3100/api/staff/orders/{{orderId}}/start-service
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 登录 token |
| `X-Staff-Id` | `{{staffId}}` | integer | 开发环境模拟师傅身份 |

Path Params：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `id` | `{{orderId}}` | integer | 订单 ID |

Body JSON：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `version` | `{{orderVersion}}` | integer | 订单版本号，可选 |

Body 示例：

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
pm.environment.set('orderVersion', String(json.data.version || 0))
```

### 7.7 师傅完成服务

注意：只允许 `in_service -> pending_confirm`。

Apifox 填写：

```txt
接口名称：师傅完成服务
方法：POST
URL：/staff/orders/{{orderId}}/complete
完整 URL：http://127.0.0.1:3100/api/staff/orders/{{orderId}}/complete
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 登录 token |
| `X-Staff-Id` | `{{staffId}}` | integer | 开发环境模拟师傅身份 |

Path Params：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `id` | `{{orderId}}` | integer | 订单 ID |

Body JSON：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `remark` | `服务已完成` | string | 完成备注，可选 |
| `photoUrls` | `["/static/logo.svg"]` | array<string> | 服务照片 URL 数组，可选 |
| `version` | `{{orderVersion}}` | integer | 订单版本号，可选 |

Body 示例：

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

pm.environment.set('orderVersion', String(json.data.version || 0))
```

## 8. 支付接口

### 8.1 Mock 支付成功

注意：该接口用于开发环境模拟支付回调。  
执行前需要先调用 `POST /api/orders/:id/pay` 获取 `paymentNo`。

Apifox 填写：

```txt
接口名称：Mock 支付成功
方法：POST
URL：/payments/mock-success
完整 URL：http://127.0.0.1:3100/api/payments/mock-success
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 登录 token |

Body JSON：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `paymentNo` | `{{paymentNo}}` | string | 支付单号，推荐使用 |
| `orderId` | `{{orderId}}` | integer | 订单 ID，可选；未传 `paymentNo` 时可用 |

Body 示例：

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

pm.test('mock payment success ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.status).to.eql('success')
  pm.expect(json.data.order.status).to.eql('pending_dispatch')
})

pm.environment.set('orderVersion', String(json.data.order.version || 0))
```

## 9. 常见错误验证

### 9.1 未登录访问订单列表

Apifox 填写：

```txt
接口名称：未登录访问订单列表
方法：GET
URL：/orders
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |

不要填写 `Authorization`。

期望：

```txt
HTTP 401
code = 20001
```

### 9.2 状态冲突

示例：订单已经 `completed` 后，再调用师傅完成服务或用户取消订单。

期望：

```txt
HTTP 409
code = 50002
message 包含状态已变化或状态非法含义
```

### 9.3 师傅身份缺失

Apifox 填写：

```txt
接口名称：师傅身份缺失
方法：GET
URL：/staff/orders
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 登录 token |

不要填写 `X-Staff-Id`。

期望：

```txt
HTTP 403
code = 70002
```

### 9.4 管理员身份缺失

Apifox 填写：

```txt
接口名称：管理员身份缺失
方法：GET
URL：/admin/orders
```

Headers：

| 参数名 | 数值 | 参数类型 | 描述 |
| --- | --- | --- | --- |
| `Content-Type` | `application/json` | string | 请求体类型 |
| `X-Request-Source` | `miniapp` | string | 请求来源 |
| `X-Client-Version` | `1.0.0` | string | 客户端版本 |
| `Authorization` | `Bearer {{accessToken}}` | string | 登录 token |

不要填写 `X-Admin-Id`。

期望：

```txt
HTTP 403
code = 20003
```
