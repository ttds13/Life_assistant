# Day 3 用户认证与服务详情行动计划

更新日期：2026-05-14

## 1. 目标

Day 3 目标是实现用户端微信登录闭环和服务详情页完整交互，让用户能登录、查看服务详情、为后续下单做准备。

```txt
用户打开小程序
-> 微信登录获取 token
-> 首页展示服务数据
-> 点击服务进入详情页
-> 详情页展示完整信息
-> 未登录用户点击预约时跳转登录
-> 登录后可进入下单流程（Day 4）
```

## 2. 本日边界

```txt
做：微信登录、token 签发与校验、用户信息存储、登录态拦截、服务详情页完整交互、miniapp 登录流程对接
不做：手机号绑定、员工登录、后台管理员登录、RBAC 权限、订单、支付
```

## 3. 后端新增接口

```txt
POST /api/auth/wechat-login     微信登录（code 换 token）
GET  /api/auth/me                获取当前用户信息
POST /api/auth/logout            退出登录（可选，清理服务端状态）
```

## 4. 微信登录流程

```txt
1. 小程序调用 wx.login() 获取 code
2. 小程序将 code 发送到 POST /api/auth/wechat-login
3. 后端用 code 调用微信 code2Session 接口获取 openid + session_key
4. 后端查找或创建用户记录
5. 后端签发 JWT token 返回给小程序
6. 小程序保存 token 到 store，后续请求自动携带
```

开发阶段模拟方案（不依赖真实微信接口）：

```txt
POST /api/auth/wechat-login
Body: { "code": "mock_code_xxx" }

开发环境下：
- 不调用微信 code2Session
- 用 code 作为模拟 openid
- 直接创建或查找用户
- 签发 JWT 返回
```

## 5. 数据模型

用户表：

```txt
id
openid
unionid
nickname
avatar
phone
status
role
createdAt
updatedAt
```

## 6. JWT 规范

```txt
签发：登录成功后返回 accessToken
有效期：7 天（开发阶段可设长一些）
载荷：{ userId, openid, role }
校验：需要认证的接口通过 Authorization: Bearer <token> 校验
```

统一响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 1,
      "nickname": "用户_abc123",
      "avatar": "",
      "phone": "",
      "role": "user"
    }
  },
  "requestId": "req_xxx",
  "timestamp": "2026-05-14T10:00:00.000Z"
}
```

## 7. 认证中间件

需要认证的接口返回 401：

```json
{
  "code": 20001,
  "message": "未登录或 token 已过期",
  "data": null,
  "requestId": "req_xxx",
  "timestamp": "2026-05-14T10:00:00.000Z"
}
```

Day 3 需要认证的接口：

```txt
GET /api/auth/me
```

Day 3 不需要认证的接口（保持公开）：

```txt
GET /api/health
GET /api/service-categories
GET /api/services
GET /api/services/:id
POST /api/auth/wechat-login
POST /api/dev/seed
```

## 8. 后端任务清单

```txt
1. 安装 jsonwebtoken 依赖
2. 新增 src/auth/ 模块
   - auth.controller.js    处理登录/登出/获取用户信息路由
   - auth.service.js       登录逻辑、token 签发、token 校验
3. 新增 src/common/middleware/auth.js  认证中间件
4. 扩展 local-db 用户数据
   - seed-data.js 新增 users 集合
   - local-db.js 支持用户读写
5. 新增 src/users/ 模块
   - users.repository.js   用户数据访问
6. 在 app.js 中注册新路由
7. 在 config/env.js 中新增 JWT_SECRET 配置
8. 更新 contract-test.js 覆盖登录接口
```

## 9. 前端任务清单

```txt
1. 新增 src/api/auth.ts 封装登录接口
2. 完善 src/store/token.ts 保存 accessToken
3. 完善 src/store/user.ts 保存用户信息
4. 新增登录页或登录弹窗组件
5. 完善 src/pages/service/detail.vue 服务详情页
   - 展示服务名称、描述、价格
   - 展示服务须知（静态文案）
   - 底部固定预约按钮
   - 点击预约时检查登录态，未登录则跳转登录
6. 完善路由拦截：需要登录的页面自动跳转登录
7. 完善 src/pages/profile/index.vue 展示用户信息
```

## 10. 服务详情页设计

```txt
页面路径：/pages/service/detail?id=1

页面结构：
- 顶部服务封面图
- 服务名称 + 价格
- 服务描述
- 服务须知（静态文案：服务时长、服务范围、注意事项）
- 评价摘要占位（后续接入）
- 底部固定栏：价格 + 立即预约按钮

交互：
- 点击预约 -> 检查 token -> 有 token 跳转下单页 -> 无 token 跳转登录
```

## 11. 开发环境登录测试方式

H5 开发模式下无法调用 wx.login()，使用模拟方式：

```txt
1. 直接调用 POST /api/auth/wechat-login，body 传 { "code": "test_user_1" }
2. 后端开发环境跳过微信验证，用 code 当 openid
3. 返回 token，前端保存后即可测试需要认证的接口
```

miniapp H5 模式可在登录页提供"开发登录"按钮，仅 development 环境显示。

## 12. 验收标准

```txt
POST /api/auth/wechat-login 传入 code 返回 token 和用户信息
GET /api/auth/me 携带有效 token 返回用户信息
GET /api/auth/me 不携带 token 返回 401 错误
token 过期返回 401，前端自动跳转登录
服务详情页能展示完整服务信息
点击预约按钮，未登录跳转登录，已登录准备进入下单（Day 4）
我的页面展示当前登录用户信息
后端日志能看到 userId（已登录请求）
contract-test 覆盖登录和认证接口
```

## 13. 新增环境变量

```txt
JWT_SECRET=your-dev-secret-key-change-in-production
JWT_EXPIRES_IN=7d
WECHAT_APPID=wx_placeholder
WECHAT_SECRET=wx_secret_placeholder
```

## 14. 新增错误码

```txt
AUTH_NOT_LOGIN: 20001        未登录或 token 过期
AUTH_INVALID_TOKEN: 20002    token 无效
AUTH_FORBIDDEN: 20003        无权限（已有）
AUTH_WECHAT_FAIL: 20004      微信登录失败
```

## 15. 后续预留

```txt
手机号绑定（Day 4 或 Day 5）
员工登录（阶段 6-7）
后台管理员登录（阶段 6）
refresh token（上线前评估是否需要）
微信 unionid 多端打通
```