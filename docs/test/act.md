# Apifox HTTP 项目接口配置清单

更新时间：2026-05-27

本文档用于在 Apifox 中手动创建 `Life Assistant Server` 的 HTTP 接口项目。

当前推荐测试新 NestJS 后端：

```txt
http://127.0.0.1:3100/api
```

## 1. 项目与环境配置

### 1.1 创建项目

在 Apifox 中创建：

```txt
项目类型：HTTP 项目
项目名称：Life Assistant Server
```

### 1.2 配置开发环境前置 URL

进入项目的“开发环境”页面，把“默认模块”的“前置 URL”填写为：

```txt
http://127.0.0.1:3100/api
```

配置完成后，每个接口的 URL 只填写后半段路径，例如：

```txt
/health
```

不要写成：

```txt
/api/health
```

也不要在使用“前置 URL”的同时再写：

```txt
{{baseUrl}}/health
```

否则路径容易重复。

### 1.3 可选环境变量

在“环境变量”中添加：

| 变量名 | 远程值 | 本地值 | 说明 |
| --- | --- | --- | --- |
| `baseUrl` | `http://127.0.0.1:3100/api` | `http://127.0.0.1:3100/api` | 如果不用前置 URL，可以用这个变量 |
| `accessToken` | 留空 | 留空 | 登录后自动保存 |
| `serviceId` | 留空 | 留空 | 服务列表接口后自动保存 |
| `categoryId` | 留空 | 留空 | 服务列表接口后自动保存 |
| `userId` | 留空 | 留空 | 登录后自动保存 |

推荐使用“前置 URL”方式。下文所有 URL 都按“前置 URL”方式填写。

## 2. 公共 Header

建议在项目级或目录级配置公共 Header：

| Header 名 | Header 值 |
| --- | --- |
| `Content-Type` | `application/json` |
| `X-Request-Source` | `miniapp` |
| `X-Client-Version` | `1.0.0` |

需要登录的接口额外增加：

| Header 名 | Header 值 |
| --- | --- |
| `Authorization` | `Bearer {{accessToken}}` |

### 2.1 Apifox 参数填写规则

Apifox 的“调试”页面里，Query 参数通常没有单独的“必填”勾选项。本文档表格里的“是否必填”表示：为了完成这一次测试，你必须手动添加这一行参数，并且确保这一行左侧是勾选状态。

Query 参数填写规则：

| 字段 | 怎么填 |
| --- | --- |
| 参数名 | 必须和文档完全一致，区分大小写 |
| 参数值 | 按文档示例填写 |
| 类型 | Query 参数本质会通过 URL 发出，可以保留 `string`；如果 Apifox 允许选择，也可以把数字参数设为 `integer` |
| 说明 | 可填可不填，只是给自己看的备注 |

特别注意这些参数名：

| 正确参数名 | 类型 | 错误示例 |
| --- | --- | --- |
| `page` | integer | `Page` |
| `pageSize` | integer | `pagesize`、`page_size`、`pageSIze` |
| `categoryId` | integer | `catagoryId`、`categoryID` |
| `status` | integer | `Status` |
| `keyword` | string | `keywords` |

如果参数名拼错，后端可能会忽略这个参数；如果参数值为空或者不是数字，后端会返回：

```txt
HTTP 400
code = 10002
```

Body JSON 字段类型规则：

| 字段 | 类型 | 示例 |
| --- | --- | --- |
| `phone` | string | `"13800001111"` |
| `loginCode` | string | `"test-login-code"` |
| `phoneCode` | string | `"test-phone-code"` |
| `nickname` | string | `"Apifox测试用户"` |
| `avatar` | string | `""` |
| `reset` | boolean | `false` |

## 3. 推荐测试顺序

按这个顺序创建并发送接口：

```txt
1. 健康检查
2. 服务分类列表
3. 服务列表
4. 保存第一个服务 ID
5. 服务详情
6. 按分类筛选服务
7. 关键词搜索服务
8. 模拟登录
9. 获取当前用户
10. 更新用户资料
11. 无 token 获取当前用户
12. 错误 token 获取当前用户
13. 微信登录参数校验
14. 开发环境 seed
```

## 4. 接口配置清单

### 4.1 健康检查

Apifox 填写：

```txt
接口名称：健康检查
方法：GET
URL：/health
完整 URL：http://127.0.0.1:3100/api/health
```

Headers：

```txt
使用公共 Header
```

Params：

```txt
无
```

Body：

```txt
无
```

期望：

```txt
HTTP 200
code = 0
data.status = ok
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('health ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.status).to.eql('ok')
  pm.expect(json.requestId).to.be.a('string')
})
```

### 4.2 服务分类列表

Apifox 填写：

```txt
接口名称：服务分类列表
方法：GET
URL：/service-categories
完整 URL：http://127.0.0.1:3100/api/service-categories
```

Headers：

```txt
使用公共 Header
```

Params：

| 参数名 | 是否必填 | Apifox 类型 | 示例值 | 说明 |
| --- | --- | --- | --- | --- |
| `status` | 否 | integer | `1` | 分类状态。不填表示查询全部 |

Body：

```txt
无
```

期望：

```txt
HTTP 200
code = 0
data 是数组
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('service categories ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data).to.be.an('array')
  pm.expect(json.data.length).to.be.greaterThan(0)
  pm.expect(json.data[0].id).to.be.a('number')
  pm.expect(json.data[0].name).to.be.a('string')
})
```

### 4.3 服务列表

Apifox 填写：

```txt
接口名称：服务列表
方法：GET
URL：/services
完整 URL：http://127.0.0.1:3100/api/services
```

Headers：

```txt
使用公共 Header
```

Params：

| 参数名 | 是否必填 | Apifox 类型 | 示例值 | 说明 |
| --- | --- | --- | --- | --- |
| `page` | 否 | integer | `1` | 页码，最小值 1 |
| `pageSize` | 否 | integer | `10` | 每页数量，最小值 1，最大值 100 |
| `categoryId` | 否 | integer | `1` | 服务分类 ID |
| `status` | 否 | integer | `1` | 服务状态 |
| `keyword` | 否 | string | `保洁` | 搜索关键词 |

建议先只填：

```txt
page = 1
pageSize = 10
```

Body：

```txt
无
```

期望：

```txt
HTTP 200
code = 0
data.items 是数组
data.total 是数字
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('services page ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.items).to.be.an('array')
  pm.expect(json.data.page).to.eql(1)
  pm.expect(json.data.pageSize).to.eql(10)
  pm.expect(json.data.total).to.be.a('number')
  pm.expect(json.data.items.length).to.be.greaterThan(0)
  pm.expect(json.data.items[0].id).to.be.a('number')
  pm.expect(json.data.items[0].categoryId).to.be.a('number')
  pm.expect(json.data.items[0].basePrice).to.be.a('number')
})
```

### 4.4 保存第一个服务 ID

这个接口用于从真实数据库中取第一个服务 ID，后续服务详情不要手写 `/services/1`。

Apifox 填写：

```txt
接口名称：保存第一个服务 ID
方法：GET
URL：/services
完整 URL：http://127.0.0.1:3100/api/services
```

Headers：

```txt
使用公共 Header
```

Params：

| 参数名 | 是否必填 | Apifox 类型 | 示例值 | 说明 |
| --- | --- | --- | --- | --- |
| `page` | 是 | integer | `1` | 查询第一页 |
| `pageSize` | 是 | integer | `1` | 只取一条数据 |

Apifox 里具体填成：

| 参数名 | 参数值 | 类型 | 说明 |
| --- | --- | --- | --- |
| `page` | `1` | `integer` 或 `string` | 查询第一页 |
| `pageSize` | `1` | `integer` 或 `string` | 只取一条数据 |

注意：`pageSize` 的 `S` 必须大写，不能写成 `pagesize`。

Body：

```txt
无
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

const first = json.data.items[0]
pm.environment.set('serviceId', String(first.id))
pm.environment.set('categoryId', String(first.categoryId))
console.log('serviceId =', first.id)
console.log('categoryId =', first.categoryId)
```

如果返回中看到：

```json
{
  "id": 11,
  "categoryId": 6
}
```

说明本次数据库里的第一个服务是：

```txt
serviceId = 11
categoryId = 6
```

这是正常结果，后续服务详情接口会使用 `{{serviceId}}` 自动替换成 `11`。

### 4.5 服务详情

执行本接口前，先执行“保存第一个服务 ID”。

Apifox 填写：

```txt
接口名称：服务详情
方法：GET
URL：/services/{{serviceId}}
完整 URL：http://127.0.0.1:3100/api/services/{{serviceId}}
```

Headers：

```txt
使用公共 Header
```

Params：

```txt
无
```

Body：

```txt
无
```

期望：

```txt
HTTP 200
code = 0
data.id = {{serviceId}}
```

后置脚本：

```javascript
const json = pm.response.json()
const serviceId = Number(pm.environment.get('serviceId'))

pm.test('service detail ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.id).to.eql(serviceId)
  pm.expect(json.data.name).to.be.a('string')
  pm.expect(json.data.description).to.be.a('string')
  pm.expect(json.data.coverImage).to.be.a('string')
  pm.expect(json.data.basePrice).to.be.a('number')
})
```

### 4.6 按分类筛选服务

执行本接口前，先执行“保存第一个服务 ID”。

Apifox 填写：

```txt
接口名称：按分类筛选服务
方法：GET
URL：/services
完整 URL：http://127.0.0.1:3100/api/services
```

Headers：

```txt
使用公共 Header
```

Params：

| 参数名 | 是否必填 | Apifox 类型 | 示例值 | 说明 |
| --- | --- | --- | --- | --- |
| `categoryId` | 是 | integer | `{{categoryId}}` | 上一个接口保存的分类 ID |
| `page` | 是 | integer | `1` | 页码 |
| `pageSize` | 是 | integer | `10` | 每页数量 |

Body：

```txt
无
```

后置脚本：

```javascript
const json = pm.response.json()
const categoryId = Number(pm.environment.get('categoryId'))

pm.test('filter by category ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.items).to.be.an('array')
  json.data.items.forEach(function (item) {
    pm.expect(item.categoryId).to.eql(categoryId)
  })
})
```

### 4.7 关键词搜索服务

Apifox 填写：

```txt
接口名称：关键词搜索服务
方法：GET
URL：/services
完整 URL：http://127.0.0.1:3100/api/services
```

Headers：

```txt
使用公共 Header
```

Params：

| 参数名 | 是否必填 | Apifox 类型 | 示例值 | 说明 |
| --- | --- | --- | --- | --- |
| `keyword` | 是 | string | `保洁` | 搜索关键词 |
| `page` | 是 | integer | `1` | 页码 |
| `pageSize` | 是 | integer | `10` | 每页数量 |

Body：

```txt
无
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('keyword search ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.items).to.be.an('array')
  pm.expect(json.data.total).to.be.a('number')
})
```

### 4.8 不存在的服务详情

Apifox 填写：

```txt
接口名称：不存在的服务详情
方法：GET
URL：/services/999999999
完整 URL：http://127.0.0.1:3100/api/services/999999999
```

Headers：

```txt
使用公共 Header
```

Params：

```txt
无
```

Body：

```txt
无
```

期望：

```txt
HTTP 404
code = 40001
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('missing service returns 404', function () {
  pm.response.to.have.status(404)
  pm.expect(json.code).to.eql(40001)
  pm.expect(json.message).to.be.a('string')
  pm.expect(json.requestId).to.be.a('string')
})
```

### 4.9 非法服务 ID

Apifox 填写：

```txt
接口名称：非法服务 ID
方法：GET
URL：/services/abc
完整 URL：http://127.0.0.1:3100/api/services/abc
```

Headers：

```txt
使用公共 Header
```

Params：

```txt
无
```

Body：

```txt
无
```

期望：

```txt
HTTP 400
code = 10002
```

如果你看到类似：

```txt
page must not be less than 1
page must be an integer number
```

这是正常的错误测试结果，表示后端正确拒绝了非法分页参数。

后置脚本：

```javascript
const json = pm.response.json()

pm.test('bad service id returns 400', function () {
  pm.response.to.have.status(400)
  pm.expect(json.code).to.eql(10002)
  pm.expect(json.requestId).to.be.a('string')
})
```

### 4.10 非法分页 page=0

Apifox 填写：

```txt
接口名称：非法分页 page=0
方法：GET
URL：/services
完整 URL：http://127.0.0.1:3100/api/services
```

Headers：

```txt
使用公共 Header
```

Params：

| 参数名 | 是否必填 | Apifox 类型 | 示例值 | 说明 |
| --- | --- | --- | --- | --- |
| `page` | 是 | integer | `0` | 故意填错 |
| `pageSize` | 是 | integer | `10` | 每页数量 |

Body：

```txt
无
```

期望：

```txt
HTTP 400
code = 10002
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('bad page returns 400', function () {
  pm.response.to.have.status(400)
  pm.expect(json.code).to.eql(10002)
})
```

### 4.11 非法分页 pageSize=101

Apifox 填写：

```txt
接口名称：非法分页 pageSize=101
方法：GET
URL：/services
完整 URL：http://127.0.0.1:3100/api/services
```

Headers：

```txt
使用公共 Header
```

Params：

| 参数名 | 是否必填 | Apifox 类型 | 示例值 | 说明 |
| --- | --- | --- | --- | --- |
| `page` | 是 | integer | `1` | 页码 |
| `pageSize` | 是 | integer | `101` | 故意超过最大值 100 |

Body：

```txt
无
```

注意：这个用例测的是 `pageSize=101`，不是 `page=101`。

正确实际请求应该是：

```txt
GET /services?page=1&pageSize=101
```

如果写成下面任意一种，都不是这个测试：

```txt
GET /services?page=101&pageSize=10
GET /services?page=1&pageSIze=101
GET /services?page=1&pagesize=101
```

在 Apifox 里可以点响应区的“实际请求”确认最终发出的 URL。

期望：

```txt
HTTP 400
code = 10002
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('bad pageSize returns 400', function () {
  pm.response.to.have.status(400)
  pm.expect(json.code).to.eql(10002)
})
```

### 4.12 模拟登录

Apifox 填写：

```txt
接口名称：模拟登录
方法：POST
URL：/auth/mock-login
完整 URL：http://127.0.0.1:3100/api/auth/mock-login
```

Headers：

```txt
使用公共 Header
```

Params：

```txt
无
```

Body 类型：

```txt
JSON
```

Body 内容：

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
  pm.expect(json.data.expiresIn).to.be.a('number')
  pm.expect(json.data.user.id).to.be.a('number')
  pm.expect(json.data.user.phone).to.include('****')
})

pm.environment.set('accessToken', json.data.accessToken)
pm.environment.set('userId', String(json.data.user.id))
console.log('accessToken saved')
```

### 4.13 获取当前用户

执行本接口前，先执行“模拟登录”。

Apifox 填写：

```txt
接口名称：获取当前用户
方法：GET
URL：/auth/me
完整 URL：http://127.0.0.1:3100/api/auth/me
```

Headers：

| Header 名 | Header 值 |
| --- | --- |
| `Content-Type` | `application/json` |
| `X-Request-Source` | `miniapp` |
| `X-Client-Version` | `1.0.0` |
| `Authorization` | `Bearer {{accessToken}}` |

Params：

```txt
无
```

Body：

```txt
无
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

pm.test('get me ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.id).to.be.a('number')
  pm.expect(json.data.phone).to.include('****')
  pm.expect(json.data.role).to.eql('user')
})
```

### 4.14 更新用户资料

执行本接口前，先执行“模拟登录”。

Apifox 填写：

```txt
接口名称：更新用户资料
方法：PUT
URL：/auth/profile
完整 URL：http://127.0.0.1:3100/api/auth/profile
```

Headers：

| Header 名 | Header 值 |
| --- | --- |
| `Content-Type` | `application/json` |
| `X-Request-Source` | `miniapp` |
| `X-Client-Version` | `1.0.0` |
| `Authorization` | `Bearer {{accessToken}}` |

Params：

```txt
无
```

Body 类型：

```txt
JSON
```

Body 内容：

```json
{
  "nickname": "Apifox测试用户",
  "avatar": ""
}
```

期望：

```txt
HTTP 200
code = 0
data.nickname = Apifox测试用户
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('update profile ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.nickname).to.eql('Apifox测试用户')
  pm.expect(json.data.id).to.be.a('number')
})
```

### 4.15 无 token 获取当前用户

Apifox 填写：

```txt
接口名称：无 token 获取当前用户
方法：GET
URL：/auth/me
完整 URL：http://127.0.0.1:3100/api/auth/me
```

Headers：

```txt
只使用公共 Header
不要填写 Authorization
```

Params：

```txt
无
```

Body：

```txt
无
```

期望：

```txt
HTTP 401
code = 20001
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('no token returns 401', function () {
  pm.response.to.have.status(401)
  pm.expect(json.code).to.eql(20001)
  pm.expect(json.requestId).to.be.a('string')
})
```

### 4.16 错误 token 获取当前用户

Apifox 填写：

```txt
接口名称：错误 token 获取当前用户
方法：GET
URL：/auth/me
完整 URL：http://127.0.0.1:3100/api/auth/me
```

Headers：

| Header 名 | Header 值 |
| --- | --- |
| `Content-Type` | `application/json` |
| `X-Request-Source` | `miniapp` |
| `X-Client-Version` | `1.0.0` |
| `Authorization` | `Bearer invalid.token.here` |

Params：

```txt
无
```

Body：

```txt
无
```

期望：

```txt
HTTP 401
code = 20002
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('bad token returns 401', function () {
  pm.response.to.have.status(401)
  pm.expect(json.code).to.eql(20002)
  pm.expect(json.requestId).to.be.a('string')
})
```

### 4.17 微信登录参数校验

这个接口是真实微信登录入口。没有微信小程序真实 `loginCode` 和 `phoneCode` 时，通常只能用于参数格式检查。

Apifox 填写：

```txt
接口名称：微信登录参数校验
方法：POST
URL：/auth/wechat-login
完整 URL：http://127.0.0.1:3100/api/auth/wechat-login
```

Headers：

```txt
使用公共 Header
```

Params：

```txt
无
```

Body 类型：

```txt
JSON
```

Body 内容：

```json
{
  "loginCode": "test-login-code",
  "phoneCode": "test-phone-code"
}
```

期望：

```txt
没有真实微信凭证时，可能返回业务错误。
只要响应结构包含 code/message/data/requestId/timestamp，就说明后端路由和统一错误结构是通的。
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('wechat login response shape ok', function () {
  pm.expect(json).to.have.property('code')
  pm.expect(json).to.have.property('message')
  pm.expect(json).to.have.property('data')
  pm.expect(json).to.have.property('requestId')
  pm.expect(json).to.have.property('timestamp')
})
```

### 4.18 开发环境 seed

这个接口只用于开发环境补齐服务分类和服务数据。默认 `reset=false` 是安全模式，不会清空用户、订单、支付数据。

Apifox 填写：

```txt
接口名称：开发环境 seed
方法：POST
URL：/dev/seed
完整 URL：http://127.0.0.1:3100/api/dev/seed
```

Headers：

```txt
使用公共 Header
```

Params：

```txt
无
```

Body 类型：

```txt
JSON
```

Body 内容：

```json
{
  "reset": false
}
```

期望：

```txt
HTTP 200
code = 0
data.after.categories = 14
data.after.services = 40
```

后置脚本：

```javascript
const json = pm.response.json()

pm.test('dev seed ok', function () {
  pm.response.to.have.status(200)
  pm.expect(json.code).to.eql(0)
  pm.expect(json.data.after.categories).to.eql(14)
  pm.expect(json.data.after.services).to.eql(40)
  pm.expect(json.data.after.users).to.be.at.least(json.data.before.users)
  pm.expect(json.data.after.orders).to.be.at.least(json.data.before.orders)
  pm.expect(json.data.after.payments).to.be.at.least(json.data.before.payments)
})
```

不要在 Apifox 里随便测试：

```json
{
  "reset": true
}
```

`reset=true` 只应该在明确开发环境、没有重要订单和支付数据，并且后端显式设置 `SEED_ALLOW_SERVICE_RESET=true` 时使用。

## 5. 常见错误

### 5.1 Cannot POST /api/health

原因：健康检查接口被配置成了 POST。

正确配置：

```txt
方法：GET
URL：/health
```

### 5.2 Cannot GET /api/api/health

原因：前置 URL 已经写了 `/api`，接口 URL 又写了 `/api/health`。

正确配置：

```txt
前置 URL：http://127.0.0.1:3100/api
接口 URL：/health
```

### 5.3 /services/1 返回 404

原因：当前数据库里的服务 ID 不一定从 1 开始。

正确做法：

```txt
先执行：GET /services?page=1&pageSize=1
保存：data.items[0].id 到 serviceId
再执行：GET /services/{{serviceId}}
```

### 5.4 GET /auth/me 返回 401

原因：没有携带登录 token，或者 token 写错。

正确流程：

```txt
先执行：POST /auth/mock-login
保存：data.accessToken 到 accessToken
再执行：GET /auth/me
Header：Authorization: Bearer {{accessToken}}
```
