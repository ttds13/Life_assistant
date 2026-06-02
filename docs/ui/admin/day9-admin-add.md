# Day 9 管理员登录与固定权限行动计划

## 1. 目标

本计划用于把当前 `admin` 从 mock/模板后台，改造成由真实后端管理员身份驱动的后台入口。

本阶段只做四件事：

```txt
1. 移除 admin 前端注册入口
2. server 新增 AdminAuthController
3. 用 seed 或脚本创建初始管理员
4. 管理员权限先代码固定
```

本阶段不做完整 RBAC 配置界面，不开放管理员自助注册，不让普通用户、师傅端账号直接进入后台。

## 2. 设计原则

```txt
管理员账号不开放注册
管理员只能由代码开发者通过 seed/脚本创建
管理员密码必须加密存储，不能明文写死
权限规则可以先写死在代码常量中
POST /api/admin/auth/login 是公开登录接口，不要求 token
登录接口只校验管理员账号、密码、账号状态
登录成功后签发 admin token，后续后台接口再基于 admin token 校验
除 login 外的 /api/admin/* 接口都必须校验管理员身份
```

推荐第一阶段的身份模型：

```txt
AdminUser 表保存账号、密码哈希、角色、状态
role 字段先使用 super_admin / operator / finance
super_admin 固定拥有全部权限
前端菜单第一阶段可以使用固定后台菜单
后端 /api/admin/auth/me 返回固定 roles/perms
```

## 3. Phase 1：移除 admin 前端注册入口

### 3.1 当前检查点

当前模板仍存在注册组件和注册相关 UI：

```txt
admin/src/views/login/components/Register.vue
admin/src/views/login/index.vue 中动态引用 Register.vue
登录页可能还有注册 tab 或切换入口
```

当前认证 API 仍带模板能力：

```txt
admin/src/api/auth/index.ts
GET /api/v1/auth/captcha
POST /api/v1/auth/login
POST /api/v1/auth/refresh-token
DELETE /api/v1/auth/logout
```

### 3.2 改造任务

```txt
[ ] 删除或停止引用 Register.vue
[ ] 登录页移除注册 tab、注册按钮、注册切换逻辑
[ ] 登录页文案明确为“管理员登录”
[ ] 暂时保留验证码 UI 与否需要二选一：
    A. 第一阶段移除验证码，降低后端接入成本
    B. 保留验证码 UI，但后端必须补 captcha
[ ] 推荐第一阶段选择 A：移除验证码
[ ] AuthAPI.login 改为调用 /api/admin/auth/login
[ ] AuthAPI.logout 改为调用 /api/admin/auth/logout
[ ] AuthAPI.getCaptcha 如果不用验证码，则删除调用
[ ] AuthAPI.refreshToken 第一阶段可保留占位，但如果后端不做 refresh，需要前端避免自动刷新死循环
```

### 3.3 前端登录表单建议

第一阶段登录表单只保留：

```txt
username
password
rememberMe
```

不保留：

```txt
注册入口
手机号注册
验证码输入
第三方登录
租户选择
```

### 3.4 验收标准

```txt
[ ] 登录页没有注册入口
[ ] 代码中没有 Register.vue 的运行引用
[ ] 普通访问者无法通过前端创建 admin
[ ] pnpm exec vue-tsc --noEmit 通过
[ ] pnpm run build-only 通过
```

## 4. Phase 2：server 新增 AdminAuthController

### 4.1 建议新增文件

```txt
server/src/admin-auth/admin-auth.module.ts
server/src/admin-auth/admin-auth.controller.ts
server/src/admin-auth/admin-auth.service.ts
server/src/admin-auth/dto/admin-login.dto.ts
server/src/admin-auth/admin-permissions.ts
```

也可以放在：

```txt
server/src/auth/admin-auth.controller.ts
server/src/auth/admin-auth.service.ts
```

推荐新建 `admin-auth` 目录，避免和用户端微信/手机号登录混在一起。

### 4.2 目标接口

```txt
POST /api/admin/auth/login        公开接口，无 token 校验
GET /api/admin/auth/me            需要 admin token
DELETE /api/admin/auth/logout     需要 admin token
POST /api/admin/auth/refresh-token  可选；如实现，也应只校验 refresh token，不校验 access token
```

### 4.3 POST /api/admin/auth/login

接口安全定位：

```txt
这是后台登录入口，本身不能要求已有 token。
如果登录接口也要求 token，会形成“未登录无法登录”的死循环。
该接口只做账号密码校验、账号状态校验和必要的登录风控。
```

入参：

```json
{
  "username": "由生产环境初始化脚本创建",
  "password": "由生产环境初始化脚本设置"
}
```

处理逻辑：

```txt
[ ] login 接口必须显式标记为 Public 或不挂 AdminAuthGuard/JwtAuthGuard
[ ] 根据 username 查询 admin_users
[ ] 校验 status 是否启用
[ ] 使用 bcrypt/argon2 校验 passwordHash
[ ] 校验失败时返回统一错误，不暴露账号是否存在
[ ] 签发 JWT
[ ] token payload 至少包含：
    adminId
    username
    role
    userType: "admin"
[ ] 返回 accessToken、tokenType、expiresIn
```

返回建议：

```json
{
  "accessToken": "jwt",
  "tokenType": "Bearer",
  "expiresIn": 604800
}
```

如果前端暂时仍要求 refreshToken，可以二选一：

```txt
A. 后端返回 refreshToken，但 refreshToken 也用服务端签发，过期时间更长
B. 前端第一阶段移除 refresh-token 依赖，只使用 accessToken
```

返回兼容示例：

```json
{
  "accessToken": "jwt",
  "refreshToken": "jwt",
  "tokenType": "Bearer",
  "expiresIn": 604800
}
```

### 4.4 GET /api/admin/auth/me

要求：

```txt
[ ] 使用 JwtAuthGuard 或 AdminAuthGuard
[ ] 只允许 userType=admin 或 role=admin/super_admin 访问
[ ] 返回管理员基础信息、角色、权限
```

返回建议：

```json
{
  "userId": "1",
  "username": "admin",
  "nickname": "系统管理员",
  "avatar": "",
  "roles": ["SUPER_ADMIN"],
  "perms": ["*"]
}
```

### 4.5 DELETE /api/admin/auth/logout

第一阶段 JWT 可无状态退出：

```txt
[ ] 直接返回成功
[ ] 前端清理本地 token
```

后续如需更严格，可加 token blacklist 或 session 表。

### 4.6 Guard 设计

第一阶段可选方案：

```txt
方案 A：扩展现有 JwtAuthGuard
  让 request.user 支持 userType/adminId/role

方案 B：新增 AdminAuthGuard
  复用 JwtService 校验 token
  额外检查 payload.userType === "admin"
```

推荐：

```txt
短期使用 AdminAuthGuard，更清晰隔离后台接口。
后续再统一身份体系。
```

### 4.7 验收标准

```txt
[ ] POST /api/admin/auth/login 能用 admin_users 真实账号登录
[ ] POST /api/admin/auth/login 不需要 Authorization header
[ ] 密码错误返回明确错误
[ ] 禁用账号无法登录
[ ] GET /api/admin/auth/me 能返回 roles/perms
[ ] 普通用户 token 不能访问 /api/admin/auth/me
[ ] 后端 npm run build 通过
```

## 5. Phase 3：用生产环境标准创建初始管理员

### 5.1 推荐方式

推荐新增独立脚本：

```txt
server/scripts/seed-admin.ts
```

原因：

```txt
管理员初始化和服务数据 seed 分开
避免每次 seed 服务数据时误改管理员账号
便于生产环境部署时手动执行一次
避免在前端或后端暴露管理员注册入口
```

### 5.2 脚本职责

```txt
[ ] 读取环境变量 ADMIN_USERNAME
[ ] 读取环境变量 ADMIN_PASSWORD
[ ] 读取环境变量 ADMIN_NAME
[ ] 读取环境变量 ADMIN_ROLE，默认 super_admin
[ ] 如果 admin_users 中不存在该 username，则创建
[ ] 如果已存在，则可选择只更新 name/role/status，不默认覆盖密码
[ ] password 使用 bcrypt/argon2 哈希
[ ] status 默认 1
```

生产环境变量要求：

```env
ADMIN_USERNAME=<部署时填写的管理员账号>
ADMIN_PASSWORD=<部署时填写的强密码>
ADMIN_NAME=系统管理员
ADMIN_ROLE=super_admin
```

安全要求：

```txt
[ ] 不在文档、源码、git、前端环境变量中保存真实管理员密码
[ ] 脚本输出不能打印明文密码
[ ] passwordHash 不能在代码中硬编码
[ ] 如果 ADMIN_PASSWORD 缺失，脚本应失败退出
[ ] 如果 ADMIN_PASSWORD 不满足强度要求，脚本应失败退出
[ ] 如果 NODE_ENV=production，禁止使用明显弱密码或和 username 相同的密码
[ ] 真实密码由部署人员在服务器环境变量或安全密钥系统中注入
```

管理员凭证替换策略：

```txt
旧计划中的开发账号密码不再作为默认值使用。
本计划不记录真实生产账号和真实生产密码。
如果本地仍需联调，也必须通过本机环境变量设置 ADMIN_USERNAME 和 ADMIN_PASSWORD。
seed-admin.ts 不应内置任何默认账号或默认密码。
```

### 5.3 package.json 命令

建议新增：

```json
{
  "scripts": {
    "seed:admin": "tsx scripts/seed-admin.ts"
  }
}
```

如果当前项目没有 `tsx`，可以使用现有 TypeScript 执行方案，或编译后执行。

### 5.4 验收标准

```txt
[ ] npm run seed:admin 能创建 admin_users 记录
[ ] 重复执行不会创建重复管理员
[ ] 数据库中 password_hash 是哈希值
[ ] 使用该账号能通过 /api/admin/auth/login 登录
[ ] 不设置 ADMIN_PASSWORD 时脚本失败
[ ] 使用弱密码或账号密码相同时脚本失败
```

## 6. Phase 4：管理员权限先代码固定

### 6.1 权限常量文件

建议新增：

```txt
server/src/admin-auth/admin-permissions.ts
```

内容示例：

```txt
SUPER_ADMIN:
  roles: ["SUPER_ADMIN"]
  perms: ["*"]

OPERATOR:
  roles: ["OPERATOR"]
  perms:
    dashboard:view
    order:list
    order:detail
    order:assign
    user:list
    staff:list
    service:list
    service:update

FINANCE:
  roles: ["FINANCE"]
  perms:
    finance:payment:list
    finance:refund:list
    finance:refund:audit
    finance:withdraw:list
    finance:withdraw:audit
```

### 6.2 第一阶段角色建议

```txt
super_admin：开发者/系统管理员，拥有所有权限
operator：运营人员，管理用户、订单、服务、师傅
finance：财务人员，管理支付、退款、提现
```

第一阶段可以只真正启用：

```txt
super_admin
```

其他角色先预留常量，不急着做 UI 配置。

### 6.3 前端权限返回

`GET /api/admin/auth/me` 第一阶段返回：

```json
{
  "roles": ["SUPER_ADMIN"],
  "perms": ["*"]
}
```

如果前端按钮权限暂时依赖具体字符串，也可以返回完整列表：

```txt
dashboard:view
order:list
order:detail
order:assign
user:list
staff:list
staff:audit
service:list
service:create
service:update
finance:payment:list
finance:refund:audit
system:admin:list
system:role:list
system:menu:list
system:dict:list
system:log:list
```

### 6.4 后端权限校验

第一阶段可以简单做：

```txt
[ ] POST /api/admin/auth/login 不需要 token
[ ] 除 login 外的所有 /api/admin/* 接口必须是 admin token
[ ] super_admin 默认放行
[ ] 具体权限装饰器后续再做
```

后续增强：

```txt
@RequireAdminPerm("order:assign")
@RequireAdminPerm("finance:refund:audit")
```

### 6.5 验收标准

```txt
[ ] /api/admin/auth/me 返回固定 roles/perms
[ ] 前端能根据 roles/perms 正常进入后台
[ ] 普通用户 token 无法调用后台接口
[ ] super_admin 能访问所有已实现后台接口
```

## 7. 推荐实施顺序

```txt
1. 后端先做 AdminAuthController 和 AdminAuthService
2. 新增 seed-admin.ts 创建初始管理员
3. seed-admin.ts 使用生产环境变量，不内置默认账号密码
4. 新增固定权限常量
5. 调通 /api/admin/auth/login 和 /api/admin/auth/me
   login 无 token，me 需要 admin token
6. admin 前端移除注册入口和验证码依赖
7. admin AuthAPI 改为 /api/admin/auth/*
8. 前端登录后能拿到真实 token 和 me
9. 再接入 /api/admin/orders 等真实业务接口
```

## 8. 风险与注意事项

```txt
1. 不要把管理员明文密码写进 git
   只能通过生产环境变量、部署密钥或一次性安全输入提供。

2. 不要开放 POST /api/admin/register
   管理员注册只能由开发者脚本完成。

3. 不要复用普通用户 mock-login 作为正式后台登录
   普通用户 token 和 admin token 必须能区分。

4. 前端删除注册入口不等于安全
   后端也不能提供公开注册接口。

5. 如果短期不做 refresh-token
   前端 request.ts 的刷新逻辑需要适配，否则 token 过期时会调用不存在的接口。

6. 管理员权限先写死是合理的
   但要集中写在一个常量文件，后续才容易迁移到 Role.permissions。

7. 登录接口不做 token 校验是正确设计
   登录前没有 token，不能要求 Authorization header。
   登录接口的安全性来自账号密码校验、密码哈希、限流、日志和账号状态控制。
```

## 9. 最终交付物

完成本计划后，应具备：

```txt
admin 登录页无注册入口
server 拥有真实管理员登录接口
数据库拥有一个由脚本创建的初始管理员
管理员 token 与普通用户 token 可区分
GET /api/admin/auth/me 返回固定角色和权限
后续 /api/admin/* 真实业务接口可以基于管理员身份继续接入
```

## 10. 验收命令建议

前端：

```bash
cd admin
pnpm exec vue-tsc --noEmit
pnpm run build-only
```

后端：

```bash
cd server
npm run build
npm run seed:admin
```

接口手工验收：

```txt
POST http://127.0.0.1:3100/api/admin/auth/login
GET  http://127.0.0.1:3100/api/admin/auth/me
```
