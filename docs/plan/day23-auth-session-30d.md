# Day 23 30天长期登录态改造计划

更新日期：2026-06-25

## 1. 背景

当前小程序重新进入后经常需要重新登录。直接原因是前端只保存了 token 信息，没有稳定持久化 token 的绝对过期时间；小程序重启后本地状态恢复不完整，导致前端判断登录态失效。

临时修复可以只持久化 `expireTime`，但这不适合长期线上使用。为了让用户在 30 天内保持登录，同时允许后端主动失效、退出登录、封禁和风控，需要升级为短期 Access Token + 长期 Refresh Token 的登录态体系。

## 2. 改造目标

```txt
用户登录一次后，30 天内无需反复登录。
普通接口继续使用 Authorization: Bearer <accessToken>。
accessToken 过期时，前端自动使用 refreshToken 静默续期。
refreshToken 过期、被撤销、用户被禁用时，前端清空登录态并跳转登录页。
后端可以按用户、设备、会话主动撤销登录态。
```

## 3. 设计原则

```txt
accessToken 短期有效，建议 2 小时。
refreshToken 长期有效，建议 30 天。
accessToken 使用 JWT，保持接口鉴权轻量。
refreshToken 使用随机不透明字符串，不使用 JWT。
数据库只保存 refreshToken 的 hash，不保存原始 refreshToken。
每次 refresh 成功后都轮换 refreshToken，旧 token 立即失效。
小程序本地只保存当前设备的 token 对和过期时间。
```

不建议直接把 JWT 改成 30 天有效期。长效 JWT 泄露后难以及时失效，也不利于退出登录、多设备管理和后续风控。

## 4. 后端接口契约

### 4.1 登录接口响应统一升级

适用接口：

```txt
POST /api/auth/wechat-login
POST /api/auth/mock-login
```

响应 data：

```json
{
  "accessToken": "access.jwt",
  "refreshToken": "refresh_opaque_token",
  "expiresIn": 7200,
  "refreshExpiresIn": 2592000,
  "tokenType": "Bearer",
  "user": {
    "id": 1,
    "phone": "138****1111",
    "nickname": "用户_a1b2c3",
    "avatar": "",
    "role": "user"
  }
}
```

字段说明：

```txt
expiresIn: accessToken 剩余有效秒数，建议 7200 秒。
refreshExpiresIn: refreshToken 剩余有效秒数，30 天为 2592000 秒。
tokenType: 固定 Bearer。
```

### 4.2 刷新登录态

```txt
POST /api/auth/refresh
```

请求：

```json
{
  "refreshToken": "refresh_opaque_token"
}
```

成功响应 data：

```json
{
  "accessToken": "new_access.jwt",
  "refreshToken": "new_refresh_opaque_token",
  "expiresIn": 7200,
  "refreshExpiresIn": 2592000,
  "tokenType": "Bearer",
  "user": {
    "id": 1,
    "phone": "138****1111",
    "nickname": "用户_a1b2c3",
    "avatar": "",
    "role": "user"
  }
}
```

处理规则：

```txt
1. 对请求中的 refreshToken 做 hash。
2. 查询 refresh token 会话记录。
3. 校验记录存在、未过期、未撤销。
4. 校验用户仍然存在且状态正常。
5. 撤销旧 refreshToken。
6. 创建新 refreshToken 会话记录。
7. 签发新的 accessToken。
8. 返回新的 token 对。
```

失败响应：

```txt
refreshToken 不存在、过期、已撤销、用户被禁用时，返回 401。
前端收到后清空本地登录态并跳转登录页。
```

### 4.3 退出登录

```txt
DELETE /api/auth/logout
```

请求：

```json
{
  "refreshToken": "refresh_opaque_token"
}
```

处理规则：

```txt
1. 对 refreshToken 做 hash。
2. 找到当前会话记录。
3. 设置 revoked_at。
4. 即使 token 不存在，也返回成功，保证退出接口幂等。
```

## 5. 数据库设计

新增用户刷新会话表：

```sql
CREATE TABLE user_refresh_tokens (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  source VARCHAR(32) DEFAULT 'miniapp',
  device_id VARCHAR(128) NULL,
  user_agent VARCHAR(255) NULL,
  ip VARCHAR(64) NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  replaced_by_id BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_expires_at (expires_at)
);
```

Prisma 参考模型：

```prisma
model UserRefreshToken {
  id           BigInt    @id @default(autoincrement())
  userId       BigInt
  tokenHash    String    @unique
  source       String?   @default("miniapp")
  deviceId     String?
  userAgent    String?
  ip           String?
  expiresAt    DateTime
  revokedAt    DateTime?
  replacedById BigInt?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@index([userId])
  @@index([expiresAt])
}
```

## 6. 后端实现任务

```txt
1. 新增 user_refresh_tokens 表和迁移脚本。
2. 新增 refresh token 生成方法：
   - crypto.randomBytes(32).toString('base64url')
3. 新增 refresh token hash 方法：
   - sha256(refreshToken)
   - 如需加强，可加入服务端 pepper 环境变量
4. 登录成功后同时创建 refresh token 会话。
5. 登录接口返回 accessToken + refreshToken + 两类过期时间。
6. 新增 POST /api/auth/refresh。
7. 新增 DELETE /api/auth/logout。
8. JWT accessToken 过期时间改为 2 小时。
9. 增加定期清理过期 refresh token 的脚本或后台任务。
10. 补充接口测试和本地联调脚本。
```

## 7. 前端实现任务

### 7.1 Token Store 改造

当前 token store 需要从只保存 token，升级为保存完整登录态：

```ts
interface TokenInfo {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: number
  refreshTokenExpiresAt: number
  tokenType: 'Bearer'
}
```

登录成功后计算绝对过期时间：

```txt
accessTokenExpiresAt = Date.now() + expiresIn * 1000
refreshTokenExpiresAt = Date.now() + refreshExpiresIn * 1000
```

必须持久化：

```txt
accessToken
refreshToken
accessTokenExpiresAt
refreshTokenExpiresAt
user
```

### 7.2 HTTP 请求层改造

请求前：

```txt
1. accessToken 未过期：正常携带 Authorization。
2. accessToken 已过期、refreshToken 未过期：先刷新，再继续请求。
3. refreshToken 已过期：清空登录态，跳转登录页。
```

请求后：

```txt
1. 接口返回 401 或业务码 20001/20002。
2. 如果当前请求不是 refresh 请求，则尝试 refresh。
3. refresh 成功后重试原请求一次。
4. refresh 失败后清空登录态并跳转登录页。
```

并发控制：

```txt
首页可能同时发多个接口。
如果多个请求同时发现 accessToken 过期，只允许发起一个 refresh 请求。
其他请求等待同一个 refreshPromise。
refresh 成功后所有请求继续。
refresh 失败后所有请求统一失败并跳转登录页。
```

### 7.3 小程序启动逻辑

```txt
1. App 启动时从 Pinia 持久化缓存恢复 tokenInfo 和 user。
2. refreshToken 未过期时，认为处于可恢复登录态。
3. accessToken 未过期时，不主动打断用户。
4. accessToken 已过期时，可在首个接口请求时静默 refresh。
5. 进入“我的”“下单”等强登录页面时，如果 refreshToken 已过期才跳转登录。
```

## 8. 错误码约定

沿用已有认证错误码：

```txt
AUTH_NOT_LOGIN: 20001        未登录或 token 过期
AUTH_INVALID_TOKEN: 20002    token 无效
AUTH_FORBIDDEN: 20003        无权限
AUTH_WECHAT_FAIL: 20004      微信登录失败
AUTH_USER_DISABLED: 20006    用户被禁用
```

可新增：

```txt
AUTH_REFRESH_EXPIRED: 20007  refresh token 已过期
AUTH_SESSION_REVOKED: 20008  登录会话已撤销
```

## 9. 环境变量

```txt
JWT_SECRET=change-me
JWT_ACCESS_EXPIRES_IN=2h
REFRESH_TOKEN_TTL_DAYS=30
REFRESH_TOKEN_PEPPER=optional-server-side-pepper
```

说明：

```txt
JWT_SECRET 和 REFRESH_TOKEN_PEPPER 只能放在后端环境变量。
不要写入前端代码。
不要提交真实生产密钥到 git。
```

## 10. 安全策略

```txt
refreshToken 原文只返回给客户端一次，后端不落原文。
数据库只保存 tokenHash。
refreshToken 每次刷新都轮换，旧 token 立即 revoked。
退出登录只撤销当前 refreshToken 对应会话。
用户被禁用时，refresh 和普通鉴权接口都必须失败。
后台如后续增加用户管理，可支持撤销某用户全部 refresh 会话。
```

## 11. 验收标准

后端：

```txt
POST /api/auth/mock-login 返回 accessToken + refreshToken。
POST /api/auth/wechat-login 返回 accessToken + refreshToken。
GET /api/auth/me 携带有效 accessToken 正常返回用户信息。
accessToken 过期后，POST /api/auth/refresh 能返回新的 token 对。
旧 refreshToken 刷新成功后再次使用必须失败。
DELETE /api/auth/logout 后，该 refreshToken 不能再刷新。
refreshToken 过期后返回 401。
用户被禁用后 refresh 返回 401。
```

前端：

```txt
登录成功后关闭并重新进入小程序，不需要重新登录。
accessToken 未过期时，接口正常请求。
accessToken 过期但 refreshToken 未过期时，自动刷新并重试原接口。
多个接口同时 401 时，只发起一次 refresh 请求。
refreshToken 过期时，清空本地状态并跳转登录页。
用户主动退出后，再进入需要重新登录。
pnpm build:mp 构建通过。
```

## 12. 联调测试步骤

```txt
1. 本地启动后端和 MySQL。
2. 执行数据库迁移。
3. 小程序使用 mock-login 登录。
4. 关闭并重新打开小程序，确认仍然登录。
5. 手动把 accessTokenExpiresAt 改成过去时间，确认接口自动 refresh。
6. 连续打开首页、订单、我的，确认并发 refresh 不重复。
7. 调用 logout，确认本地状态清空。
8. 使用已 logout 的 refreshToken 调 /auth/refresh，确认失败。
9. 手动把 refresh token 记录设置为过期，确认前端跳登录。
10. 真机调试验证微信登录路径。
```

## 13. 实施顺序

```txt
第一步：后端新增 refresh token 数据表。
第二步：后端登录接口返回 token 对。
第三步：后端实现 /auth/refresh。
第四步：后端实现 /auth/logout。
第五步：前端 token store 持久化完整登录态。
第六步：前端 auth API 增加 refresh/logout。
第七步：前端 http 层加入自动 refresh 和请求重试。
第八步：小程序启动和页面守卫改成按 refreshToken 判断可恢复登录态。
第九步：补充本地和真机测试。
第十步：上线前备份数据库并执行迁移。
```

## 14. 回滚方案

如果上线后出现 refresh 逻辑异常：

```txt
1. 保留旧登录接口兼容 accessToken。
2. 前端可临时关闭自动 refresh，只在 401 时跳登录页。
3. 后端保留 user_refresh_tokens 表，不影响已有业务表。
4. 修复后重新开启 refresh 逻辑。
```

## 15. 本地执行记录

执行日期：2026-06-25

已完成：

```txt
1. miniapp 前端登录态改造完成。
2. token store 已持久化 accessToken、refreshToken、accessTokenExpiresAt、refreshTokenExpiresAt。
3. hasLogin 改为按 accessToken 或 refreshToken 判断可恢复登录态。
4. http 请求层已支持 401 / 20001 / 20002 自动 refresh。
5. 多接口并发过期时，共用同一个 refreshPromise。
6. refresh 成功后自动重试原请求一次。
7. logout 时会尽力调用 DELETE /api/auth/logout 撤销当前 refreshToken。
8. server 本地运行产物已增加 POST /api/auth/refresh。
9. server 本地运行产物已增加 DELETE /api/auth/logout。
10. 后端登录接口已返回 accessToken + refreshToken + expiresIn + refreshExpiresIn + tokenType。
11. 后端会通过 raw SQL 自动确保 user_refresh_tokens 表存在。
12. refreshToken 后端只保存 sha256 hash。
13. refresh 成功后会轮换 refreshToken，旧 refreshToken 立即 revoked。
```

验证结果：

```txt
pnpm type-check 通过。
pnpm build:mp 通过。
node --check server/dist/auth/auth.service.js 通过。
node --check server/dist/auth/auth.controller.js 通过。
POST /api/auth/mock-login 返回 accessToken + refreshToken。
GET /api/auth/me 携带 accessToken 返回 200。
POST /api/auth/refresh 返回新的 token 对。
DELETE /api/auth/logout 返回 200。
logout 后旧 refreshToken 再调用 /auth/refresh 返回 401。
```

重要限制：

```txt
当前仓库 server/src 源码缺失，只有 server/dist 运行产物完整。
本次后端改造为了本地立即可运行，落在 server/dist/auth/auth.service.js 和 server/dist/auth/auth.controller.js。
如果后续找回 NestJS TypeScript 源码，需要把本次 dist 补丁迁移回源码层，再重新 build。
```
