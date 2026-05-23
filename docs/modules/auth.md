# 用户认证模块完整文档

更新日期：2026-05-14

## 1. 模块概述

本模块实现以手机号为用户主键的统一认证系统，支持微信小程序手机号快捷登录，预留支付宝等多渠道扩展能力。

核心设计原则：

- 手机号是用户唯一身份标识
- 同一手机号可绑定多个第三方渠道（微信、支付宝）
- 首次登录自动注册，无需单独注册流程
- JWT 无状态认证，前端持久化 token
- 开发环境提供模拟登录，不依赖真实微信接口

## 2. 登录流程

### 2.1 微信小程序手机号快捷登录（生产流程）

```txt
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   微信小程序端    │     │    后端服务       │     │   微信开放平台    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ 1. 用户点击登录按钮     │                       │
         │    (open-type=         │                       │
         │     getPhoneNumber)    │                       │
         │                       │                       │
         │ 2. 用户授权手机号       │                       │
         │    获得 phoneCode      │                       │
         │                       │                       │
         │ 3. wx.login()          │                       │
         │    获得 loginCode      │                       │
         │                       │                       │
         │ 4. POST /auth/         │                       │
         │    wechat-login        │                       │
         │    {loginCode,         │                       │
         │     phoneCode}         │                       │
         │──────────────────────>│                       │
         │                       │ 5. code2Session        │
         │                       │    (loginCode)         │
         │                       │──────────────────────>│
         │                       │                       │
         │                       │ 6. 返回 openid +       │
         │                       │    session_key         │
         │                       │<──────────────────────│
         │                       │                       │
         │                       │ 7. getPhoneNumber      │
         │                       │    (phoneCode)         │
         │                       │──────────────────────>│
         │                       │                       │
         │                       │ 8. 返回手机号          │
         │                       │<──────────────────────│
         │                       │                       │
         │                       │ 9. 查找/创建用户       │
         │                       │    绑定 oauth          │
         │                       │    签发 JWT            │
         │                       │                       │
         │ 10. 返回 token +      │                       │
         │     用户信息           │                       │
         │<──────────────────────│                       │
         │                       │                       │
         │ 11. 保存 token         │                       │
         │     跳转首页           │                       │
```

### 2.2 开发模拟登录（H5 开发环境）

```txt
小程序端 POST /api/auth/mock-login { phone: "13800001111" }
  -> 后端跳过微信接口调用
  -> 直接用手机号查找/创建用户
  -> 签发 JWT 返回
  -> 前端保存 token
```

仅 `NODE_ENV=development` 时可用，生产环境返回 403。

## 3. 数据模型

### 3.1 users 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 自增主键 |
| phone | string | 手机号（唯一，用户主键） |
| nickname | string | 昵称 |
| avatar | string | 头像 URL |
| status | number | 1=正常 0=禁用 |
| role | string | "user" \| "staff" |
| createdAt | string | ISO 时间 |
| updatedAt | string | ISO 时间 |

### 3.2 user_oauth 表（多渠道绑定）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 自增主键 |
| userId | number | 关联 users.id |
| provider | string | "wechat" \| "alipay" |
| openid | string | 渠道 openid |
| unionid | string | 渠道 unionid（可选） |
| sessionKey | string | 微信 session_key（不返回前端） |
| createdAt | string | ISO 时间 |
| updatedAt | string | ISO 时间 |

唯一约束：`provider + openid` 全局唯一。

### 3.3 多渠道扩展说明

```txt
同一手机号 13800001111 可以有：
  user_oauth: { provider: "wechat", openid: "wx_xxx", userId: 1 }
  user_oauth: { provider: "alipay", openid: "ali_xxx", userId: 1 }

无论从微信还是支付宝登录，只要手机号相同，都指向同一个用户。
```

## 4. 接口文档

### 4.1 微信登录

```txt
POST /api/auth/wechat-login
Content-Type: application/json

Request:
{
  "loginCode": "string (wx.login 返回的 code)",
  "phoneCode": "string (getPhoneNumber 返回的 code)"
}

Response 200:
{
  "code": 0,
  "message": "ok",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 604800,
    "user": {
      "id": 1,
      "phone": "138****1111",
      "nickname": "用户_001111",
      "avatar": "",
      "role": "user"
    }
  },
  "requestId": "req_xxx",
  "timestamp": "2026-05-14T10:00:00.000Z"
}

Response 400 (微信接口失败):
{
  "code": 20004,
  "message": "微信登录失败: invalid code",
  "data": null,
  "requestId": "req_xxx",
  "timestamp": "..."
}
```

### 4.2 模拟登录（仅开发环境）

```txt
POST /api/auth/mock-login
Content-Type: application/json

Request:
{
  "phone": "13800001111"
}

Response 200: 同 wechat-login

Response 403 (生产环境):
{
  "code": 20003,
  "message": "生产环境禁用模拟登录",
  "data": null,
  "requestId": "req_xxx",
  "timestamp": "..."
}
```

### 4.3 获取当前用户

```txt
GET /api/auth/me
Authorization: Bearer <accessToken>

Response 200:
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": 1,
    "phone": "138****1111",
    "nickname": "用户_001111",
    "avatar": "",
    "role": "user"
  },
  "requestId": "req_xxx",
  "timestamp": "..."
}

Response 401 (未登录):
{
  "code": 20001,
  "message": "未登录或 token 已过期",
  "data": null,
  "requestId": "req_xxx",
  "timestamp": "..."
}

Response 401 (token 无效):
{
  "code": 20002,
  "message": "token 无效",
  "data": null,
  "requestId": "req_xxx",
  "timestamp": "..."
}
```

### 4.4 更新用户资料

```txt
PUT /api/auth/profile
Authorization: Bearer <accessToken>
Content-Type: application/json

Request:
{
  "nickname": "新昵称",
  "avatar": "https://example.com/avatar.jpg"
}

所有字段可选，只传需要更新的字段。

Response 200:
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": 1,
    "phone": "138****1111",
    "nickname": "新昵称",
    "avatar": "https://example.com/avatar.jpg",
    "role": "user"
  },
  "requestId": "req_xxx",
  "timestamp": "..."
}
```

## 5. JWT 规范

```txt
算法：HS256
有效期：604800 秒（7 天）
签名密钥：环境变量 JWT_SECRET

载荷结构：
{
  "userId": 1,
  "phone": "13800001111",
  "role": "user",
  "iat": 1715000000,
  "exp": 1715604800
}

传输方式：
  请求头 Authorization: Bearer <token>

前端存储：
  Pinia store + uni.setStorageSync 持久化
  存储 token 字符串和 expiresIn
  每次请求前检查是否过期
```

## 6. 认证中间件

### 6.1 工作流程

```txt
1. 从 req.headers.authorization 提取 Bearer token
2. 无 token → 抛出 BusinessError(20001, 401)
3. jwt.verify(token, secret)
   - TokenExpiredError → 抛出 BusinessError(20001, 401)
   - 其他错误 → 抛出 BusinessError(20002, 401)
4. 解析成功 → 挂载 req.context.user = { userId, phone, role }
5. 后续 handler 通过 req.context.user 获取当前用户
```

### 6.2 接口认证要求

| 接口 | 认证 |
|------|------|
| POST /api/auth/wechat-login | 公开 |
| POST /api/auth/mock-login | 公开 |
| GET /api/auth/me | 需要认证 |
| PUT /api/auth/profile | 需要认证 |
| GET /api/health | 公开 |
| GET /api/service-categories | 公开 |
| GET /api/services | 公开 |
| GET /api/services/:id | 公开 |
| POST /api/dev/seed | 公开 |

## 7. 错误码

| 错误码 | 常量 | HTTP 状态码 | 说明 |
|--------|------|-------------|------|
| 20001 | AUTH_NOT_LOGIN | 401 | 未登录或 token 已过期 |
| 20002 | AUTH_INVALID_TOKEN | 401 | token 无效或签名错误 |
| 20003 | AUTH_FORBIDDEN | 403 | 无权限 |
| 20004 | AUTH_WECHAT_FAIL | 400 | 微信接口调用失败 |
| 20005 | AUTH_PHONE_REQUIRED | 400 | 手机号获取失败 |
| 20006 | AUTH_USER_DISABLED | 403 | 用户已被禁用 |

## 8. 前端登录态管理

### 8.1 Token Store

```txt
文件：miniapp/src/store/token.ts

状态：
  tokenInfo: { token: string, expiresIn: number }
  expireTime: number (绝对过期时间戳)

计算属性：
  validToken: 未过期时返回 token，否则返回空字符串
  hasLogin: validToken 是否非空

方法：
  setTokenInfo(val): 保存 token 并计算过期时间
  logout(): 清空 token + 清空用户信息

持久化：pinia-plugin-persistedstate → uni.setStorageSync
```

### 8.2 User Store

```txt
文件：miniapp/src/store/user.ts

状态：
  userInfo: { userId, phone, nickname, avatar, role }

方法：
  setFromProfile(profile): 从后端响应设置用户信息
  clearUserInfo(): 重置为默认值
  fetchUserInfo(): 调用 GET /api/auth/me 刷新用户信息

持久化：pinia-plugin-persistedstate → uni.setStorageSync
```

### 8.3 请求拦截器自动注入 Token

```txt
文件：miniapp/src/http/interceptor.ts

逻辑：
  const token = tokenStore.validToken
  if (token) {
    options.header.Authorization = `Bearer ${token}`
  }

所有请求自动携带，无需页面手动处理。
```

### 8.4 401 自动跳转登录

```txt
文件：miniapp/src/http/http.ts

逻辑：
  HTTP 401 或 业务码 20001/20002 时：
    tokenStore.logout()
    toLoginPage()

用户无感知地回到登录页，登录后可返回原页面。
```

## 9. 前端登录页

### 9.1 页面路径

```txt
/pages/login/index
```

### 9.2 页面结构

```txt
- Logo + 应用名
- 说明文案
- 微信手机号快捷登录按钮（仅微信小程序端显示）
- 开发模拟登录按钮（仅 H5 端显示）
- 用户协议勾选
```

### 9.3 微信登录按钮实现

```vue
<!-- #ifdef MP-WEIXIN -->
<button
  open-type="getPhoneNumber"
  @getphonenumber="onGetPhoneNumber"
>
  微信手机号快捷登录
</button>
<!-- #endif -->
```

### 9.4 登录逻辑

```txt
1. 检查用户协议是否勾选
2. 从 e.detail.code 获取 phoneCode
3. 调用 wx.login() 获取 loginCode
4. 调用 POST /api/auth/wechat-login { loginCode, phoneCode }
5. 保存 token 到 tokenStore
6. 保存用户信息到 userStore
7. 跳转回上一页或首页
```

### 9.5 条件编译

```txt
#ifdef MP-WEIXIN  → 显示微信手机号登录按钮
#ifdef H5         → 显示开发模拟登录按钮
```

## 10. 登录态拦截

### 10.1 页面级拦截

需要登录的操作（如预约下单）在触发时检查：

```typescript
if (!tokenStore.hasLogin) {
  uni.navigateTo({ url: '/pages/login/index' })
  return
}
```

### 10.2 接口级拦截

后端需要认证的接口无 token 时返回 401，前端 HTTP 层统一处理跳转登录。

## 11. 环境变量

### 11.1 后端 (rear/.env)

```txt
JWT_SECRET=dev-secret-key-change-in-production
JWT_EXPIRES_IN=604800
WECHAT_APPID=your_wechat_appid
WECHAT_SECRET=your_wechat_secret
```

### 11.2 前端 (miniapp/env/.env.development)

```txt
VITE_SERVER_BASEURL=http://localhost:3000/api
```

### 11.3 生产环境注意事项

```txt
- JWT_SECRET 必须使用强随机字符串，至少 32 位
- WECHAT_APPID 和 WECHAT_SECRET 从微信公众平台获取
- WECHAT_SECRET 绝不能暴露到前端或日志中
- 生产环境 mock-login 接口自动禁用
```

## 12. 微信开放平台配置

### 12.1 前置条件

```txt
1. 注册微信小程序账号
2. 完成小程序认证（企业主体）
3. 获取 AppID 和 AppSecret
4. 在小程序后台配置服务器域名：
   - request 合法域名：https://your-api-domain.com
```

### 12.2 手机号快速验证组件

```txt
微信要求：
- 小程序已完成认证
- 使用 button 组件 open-type="getPhoneNumber"
- 用户主动点击触发（不能自动弹出）
- 返回的 code 有效期 5 分钟，只能使用一次
```

### 12.3 后端调用微信接口

```txt
接口 1：code2Session
  URL: https://api.weixin.qq.com/sns/jscode2session
  参数: appid, secret, js_code, grant_type=authorization_code
  返回: openid, session_key, unionid(可选)

接口 2：获取 access_token
  URL: https://api.weixin.qq.com/cgi-bin/token
  参数: grant_type=client_credential, appid, secret
  返回: access_token, expires_in

接口 3：获取手机号
  URL: https://api.weixin.qq.com/wxa/business/getuserphonenumber
  参数: access_token (query), code (body)
  返回: phone_info.purePhoneNumber
```

### 12.4 access_token 缓存优化（后续）

```txt
当前实现：每次登录都重新获取 access_token
优化方向：缓存 access_token（有效期 2 小时），避免频繁调用
实现方式：Redis 或内存缓存，key 为 wechat:access_token
```

## 13. 安全要点

```txt
1. session_key 不能返回给前端，仅存储在 user_oauth 表中
2. JWT_SECRET 不能硬编码，必须从环境变量读取
3. 手机号在响应中脱敏显示（138****1111）
4. mock-login 仅开发环境可用
5. token 过期后必须重新登录，不做静默续期（第一版）
6. 同一手机号重复登录返回同一用户，不会创建重复账号
7. 禁用用户（status=0）无法登录
8. 后端日志记录登录请求但不记录 token 明文
```

## 14. 文件清单

### 14.1 后端文件

```txt
rear/src/auth/auth.controller.js       认证路由处理
rear/src/auth/auth.service.js          登录逻辑、JWT、微信 API
rear/src/users/users.repository.js     用户数据访问
rear/src/common/middleware/auth.js     JWT 认证中间件
rear/src/common/errors/error-code.js   错误码（已扩展）
rear/src/config/env.js                 配置（已扩展）
rear/src/data/seed-data.js             种子数据（已扩展）
rear/src/data/local-db.js              本地数据库（已扩展）
rear/src/app.js                        路由注册（已扩展）
```

### 14.2 前端文件

```txt
miniapp/src/api/auth.ts                认证接口封装
miniapp/src/api/types/auth.ts          认证类型定义
miniapp/src/pages/login/index.vue      登录页
miniapp/src/store/token.ts             Token 状态管理（已适配）
miniapp/src/store/user.ts              用户状态管理（已适配）
miniapp/src/pages/service/detail.vue   服务详情（已增加登录检查）
miniapp/src/pages/profile/index.vue    我的页面（已增加登录状态）
miniapp/src/http/interceptor.ts        请求拦截器（自动注入 token）
miniapp/src/http/http.ts               HTTP 层（401 自动跳转登录）
```

## 15. 测试验证

### 15.1 合约测试覆盖

```txt
✅ POST /api/auth/mock-login → 返回 token + 用户信息
✅ GET /api/auth/me (有效 token) → 返回用户信息
✅ GET /api/auth/me (无 token) → 401 + code 20001
✅ GET /api/auth/me (无效 token) → 401 + code 20002
✅ PUT /api/auth/profile → 更新成功
✅ 同一手机号重复登录 → 返回同一用户 ID
✅ 原有服务接口不受影响
```

### 15.2 真机测试步骤

```txt
1. 配置 rear/.env 中 WECHAT_APPID 和 WECHAT_SECRET
2. 部署后端到可公网访问的服务器
3. 配置小程序后台 request 合法域名
4. pnpm build:mp 构建小程序
5. 微信开发者工具导入 dist/build/mp-weixin
6. 真机预览
7. 点击登录 → 授权手机号 → 验证登录成功
8. 查看我的页面 → 验证用户信息展示
9. 退出登录 → 验证 token 清除
10. 点击服务详情预约 → 验证跳转登录页
```

## 16. 后续扩展路线

```txt
Phase 2: 支付宝登录
  - 新增 POST /api/auth/alipay-login
  - user_oauth 新增 provider="alipay" 记录
  - 前端支付宝小程序条件编译

Phase 3: 员工登录
  - users 表 role="staff"
  - 新增 POST /api/auth/staff-login（账号密码）
  - 师傅端工作台入口

Phase 4: 后台管理员
  - 独立 admin_users 表
  - POST /api/auth/admin-login
  - RBAC 权限守卫

Phase 5: 安全增强
  - refresh token 机制
  - access_token 缓存
  - 登录日志记录
  - 异常登录检测
  - 手机号换绑
```