# Day 3 用户认证模块详细设计

更新日期：2026-05-14

## 1. 核心设计思路

以手机号为用户主键，支持微信、支付宝等多渠道绑定同一账号。第一阶段跑通微信小程序端登录。

```txt
用户身份唯一标识：phone（手机号）
登录方式：微信小程序 getPhoneNumber 获取手机号
账号关联：同一手机号可绑定微信 openid、支付宝 openid
token 方式：JWT accessToken
```

## 2. 登录流程（微信小程序端）

```txt
步骤 1：用户点击登录按钮（button open-type="getPhoneNumber"）
步骤 2：用户授权后，小程序获得加密手机号 code
步骤 3：小程序同时调用 wx.login() 获得 login code
步骤 4：小程序将 phoneCode + loginCode 发送到后端
步骤 5：后端用 loginCode 调用微信 code2Session 获取 openid + session_key
步骤 6：后端用 phoneCode 调用微信 getPhoneNumber 获取真实手机号
步骤 7：后端以手机号查找或创建用户，绑定微信 openid
步骤 8：后端签发 JWT 返回
步骤 9：小程序保存 token，后续请求自动携带
```

开发环境模拟（H5 / 无真实微信环境）：

```txt
POST /api/auth/mock-login
Body: { "phone": "13800001111" }

仅 NODE_ENV=development 时可用
跳过微信接口调用，直接用手机号创建/查找用户
返回与正式登录相同的响应结构
```

## 3. 数据模型

### 3.1 users 表

```txt
id              number       自增主键
phone           string       手机号（唯一，用户主键）
nickname        string       昵称
avatar          string       头像 URL
status          number       1=正常 0=禁用
role            string       "user" | "staff"
createdAt       string       ISO 时间
updatedAt       string       ISO 时间
```

### 3.2 user_oauth 表（多渠道绑定）

```txt
id              number       自增主键
userId          number       关联 users.id
provider        string       "wechat" | "alipay"
openid          string       渠道 openid
unionid         string       渠道 unionid（可选）
sessionKey      string       微信 session_key（加密用，不返回前端）
createdAt       string       ISO 时间
updatedAt       string       ISO 时间
```

唯一约束：`provider + openid` 全局唯一

### 3.3 设计要点

```txt
- phone 是用户唯一身份标识，不同渠道登录只要手机号相同就是同一用户
- user_oauth 支持一个用户绑定多个渠道
- 后续支付宝登录时，只需新增 provider="alipay" 的记录
- session_key 存储在 user_oauth 中，用于后续解密微信数据
- 用户首次登录自动注册，无需单独注册流程
```

## 4. 接口设计

### 4.1 微信登录

```txt
POST /api/auth/wechat-login

Request Body:
{
  "loginCode": "wx.login() 返回的 code",
  "phoneCode": "getPhoneNumber 返回的 code"
}

Response:
{
  "code": 0,
  "message": "ok",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 604800,
    "user": {
      "id": 1,
      "phone": "138****1111",
      "nickname": "用户_a1b2c3",
      "avatar": "",
      "role": "user"
    }
  },
  "requestId": "req_xxx",
  "timestamp": "2026-05-14T10:00:00.000Z"
}
```

### 4.2 开发模拟登录

```txt
POST /api/auth/mock-login

仅 development 环境可用

Request Body:
{
  "phone": "13800001111"
}

Response: 同 wechat-login
```

### 4.3 获取当前用户

```txt
GET /api/auth/me

Headers:
  Authorization: Bearer <accessToken>

Response:
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": 1,
    "phone": "138****1111",
    "nickname": "用户_a1b2c3",
    "avatar": "",
    "role": "user"
  },
  "requestId": "req_xxx",
  "timestamp": "2026-05-14T10:00:00.000Z"
}
```

### 4.4 更新用户信息

```txt
PUT /api/auth/profile

Headers:
  Authorization: Bearer <accessToken>

Request Body:
{
  "nickname": "新昵称",
  "avatar": "https://..."
}

Response:
{
  "code": 0,
  "message": "ok",
  "data": { ...更新后的用户信息 },
  "requestId": "req_xxx",
  "timestamp": "2026-05-14T10:00:00.000Z"
}
```

## 5. JWT 规范

```txt
算法：HS256
有效期：7 天（604800 秒）
载荷：
{
  "userId": 1,
  "phone": "13800001111",
  "role": "user",
  "iat": 1715000000,
  "exp": 1715604800
}

签名密钥：从环境变量 JWT_SECRET 读取
```

## 6. 认证中间件

```txt
位置：src/common/middleware/auth.js

逻辑：
1. 从 req.headers.authorization 提取 Bearer token
2. 验证 JWT 签名和有效期
3. 解析 payload，挂载到 req.context.user
4. 验证失败返回 401 + code 20001

应用方式：
- 在 app.js 路由表中标记哪些路由需要认证
- 公开路由不经过认证中间件
```

需要认证的接口：

```txt
GET  /api/auth/me
PUT  /api/auth/profile
```

公开接口（不需要认证）：

```txt
POST /api/auth/wechat-login
POST /api/auth/mock-login
GET  /api/health
GET  /api/service-categories
GET  /api/services
GET  /api/services/:id
POST /api/dev/seed
```

## 7. 错误码

```txt
AUTH_NOT_LOGIN: 20001          未登录或 token 过期
AUTH_INVALID_TOKEN: 20002      token 无效或签名错误
AUTH_FORBIDDEN: 20003          无权限（已有）
AUTH_WECHAT_FAIL: 20004        微信接口调用失败
AUTH_PHONE_REQUIRED: 20005     手机号获取失败
AUTH_USER_DISABLED: 20006      用户已被禁用
```

## 8. 环境变量新增

```txt
JWT_SECRET=dev-secret-key-change-in-production
JWT_EXPIRES_IN=604800
WECHAT_APPID=your_appid
WECHAT_SECRET=your_secret
```

## 9. 后端文件结构

```txt
rear/src/
  auth/
    auth.controller.js       路由处理
    auth.service.js          登录逻辑、JWT 签发校验、微信 API 调用
  users/
    users.repository.js      用户数据访问（CRUD）
  common/
    middleware/
      auth.js                JWT 认证中间件
    errors/
      error-code.js          新增认证错误码
  data/
    seed-data.js             新增 users + user_oauth 种子数据
    local-db.js              支持 users + user_oauth 读写
```

## 10. 前端文件结构

```txt
miniapp/src/
  api/
    auth.ts                  登录、获取用户信息、更新资料接口
    types/
      auth.ts                登录请求/响应类型定义
  pages/
    login/
      index.vue              登录页（微信手机号授权 + 开发模拟）
  store/
    token.ts                 保存 accessToken（已有，适配）
    user.ts                  保存用户信息（已有，适配）
```

## 11. 前端登录页设计

```txt
页面路径：/pages/login/index

页面结构：
- 顶部 Logo + 应用名
- 中间说明文案："登录后享受更多服务"
- 微信手机号快捷登录按钮（button open-type="getPhoneNumber"）
- 底部用户协议勾选
- 开发环境：额外显示模拟登录入口

交互流程：
1. 用户点击"手机号快捷登录"
2. 微信弹出手机号授权弹窗
3. 用户同意后，获得 phoneCode
4. 同时调用 wx.login() 获得 loginCode
5. 调用 POST /api/auth/wechat-login
6. 成功后保存 token + userInfo
7. 跳转回上一页或首页
```

## 12. 行动步骤

### 第一步：后端认证基础

```txt
1. 安装 jsonwebtoken 依赖
2. config/env.js 新增 JWT_SECRET、JWT_EXPIRES_IN、WECHAT_APPID、WECHAT_SECRET
3. common/errors/error-code.js 新增认证错误码
4. 创建 common/middleware/auth.js 认证中间件
5. 创建 users/users.repository.js 用户数据访问
6. 创建 auth/auth.service.js 登录逻辑
7. 创建 auth/auth.controller.js 路由处理
8. app.js 注册新路由，标记认证要求
9. data/seed-data.js 新增 users + user_oauth 结构
10. 更新 contract-test.js 覆盖认证接口
```

### 第二步：后端验证

```txt
1. npm run test:contract 全部通过
2. POST /api/auth/mock-login 返回 token
3. GET /api/auth/me 带 token 返回用户信息
4. GET /api/auth/me 不带 token 返回 401
5. 原有服务接口不受影响
```

### 第三步：前端登录对接

```txt
1. 创建 src/api/types/auth.ts 类型定义
2. 创建 src/api/auth.ts 接口封装
3. 创建 src/pages/login/index.vue 登录页
4. 适配 src/store/token.ts 对接新响应
5. 适配 src/store/user.ts 对接新响应
6. pages.config.ts 注册登录页路由
```

### 第四步：前端交互完善

```txt
1. 服务详情页预约按钮增加登录检查
2. 我的页面展示登录/未登录状态
3. 登录成功后跳转回来源页
4. token 过期自动跳转登录页
```

### 第五步：真机验证

```txt
1. pnpm build:mp 构建微信小程序
2. 微信开发者工具导入
3. 真机预览测试手机号授权登录
4. 验证 token 持久化和自动携带
```

## 13. 验收标准

```txt
后端：
- POST /api/auth/mock-login 传手机号返回 token + 用户信息
- POST /api/auth/wechat-login 传 loginCode + phoneCode 返回 token（真机）
- GET /api/auth/me 带有效 token 返回用户信息
- GET /api/auth/me 无 token 或过期 token 返回 code 20001
- PUT /api/auth/profile 可更新昵称和头像
- 同一手机号多次登录返回同一用户
- 原有服务接口不受影响（无需认证）
- contract-test 全部通过

前端：
- 登录页可通过微信手机号授权登录（真机）
- 登录页开发环境可模拟登录（H5）
- 登录成功后 token 持久化
- 后续请求自动携带 Authorization header
- 我的页面展示用户信息
- 服务详情页点击预约检查登录态
- token 过期自动跳转登录页
- pnpm build:mp 构建通过
```

## 14. 后续预留

```txt
- 支付宝登录：新增 provider="alipay" 的 user_oauth 记录
- 员工登录：users 表 role="staff"，单独登录入口
- 后台管理员：独立 admin_users 表
- refresh token：上线前评估是否需要
- 手机号换绑
- 微信 unionid 多端打通
- 登录日志记录
```