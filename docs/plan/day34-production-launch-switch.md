# Day34 正式上线切换计划：关闭模拟登录和模拟支付

## 目标

将当前项目从本地调试模式切换到正式上线模式，确保后端 Docker、Admin 管理端、小程序前端都使用生产配置。

本计划重点解决：

1. 关闭模拟登录，生产环境只允许微信登录。
2. 关闭模拟支付，生产环境订单支付走微信支付 JSAPI。
3. 退款、提现、图片上传统一使用正式配置。
4. 后端使用 Docker 和 `.env.production` 启动。
5. Admin 和小程序打包产物不残留局域网地址、mock 开关、调试登录。
6. 小程序登录页、用户协议、隐私政策和客服联系方式满足上线审核要求。

## 一、后端生产环境变量

### 1. 新增 `server/.env.production`

在 `server/.env.production` 中维护正式环境变量，不复用 `server/.env`。

基础配置：

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3100
API_PREFIX=/api

PUBLIC_BASE_URL=https://www.xunhaoyou.com
SERVER_BASE_URL=https://www.xunhaoyou.com
CORS_ORIGIN=https://www.xunhaoyou.com

SEED_ON_START=false
SEED_ALLOW_SERVICE_RESET=false
```

认证配置：

```env
JWT_SECRET=替换为高强度随机字符串
JWT_EXPIRES_IN=604800
JWT_ACCESS_EXPIRES_IN=7200
REFRESH_TOKEN_TTL_DAYS=30
REFRESH_TOKEN_PEPPER=替换为高强度随机字符串

MOCK_LOGIN_ENABLED=false
```

数据库配置：

```env
DATABASE_URL=mysql://用户名:密码@数据库地址:3306/life_assistant
DB_MODE=mysql
```

微信登录配置：

```env
WECHAT_APPID=正式小程序appid
WECHAT_SECRET=正式小程序secret
```

微信支付、退款配置：

```env
PAYMENT_PROVIDER=wechat
REFUND_PROVIDER=wechat

WECHAT_PAY_APPID=正式小程序appid
WECHAT_PAY_MCH_ID=商户号
WECHAT_PAY_SERIAL_NO=商户证书序列号
WECHAT_PAY_API_V3_KEY=32位APIv3密钥
WECHAT_PAY_PRIVATE_KEY_PATH=certs/apiclient_key.pem
WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH=certs/wechatpay_public_key.pem
WECHAT_PAY_NOTIFY_URL=https://www.xunhaoyou.com/api/payments/wechat/notify
WECHAT_PAY_REFUND_NOTIFY_URL=https://www.xunhaoyou.com/api/payments/wechat/refund-notify
```

师傅提现配置：

```env
WITHDRAW_PROVIDER=wechat
WECHAT_TRANSFER_SCENE_ID=微信商家转账场景ID
WECHAT_TRANSFER_NOTIFY_URL=https://www.xunhaoyou.com/api/payments/wechat/transfer-notify
```

如果提现暂时不正式上线，则先使用：

```env
WITHDRAW_PROVIDER=mock
```

并在 Admin 端隐藏或限制提现执行操作，避免误操作。

OSS 图片配置：

```env
STORAGE_PROVIDER=aliyun-oss
UPLOAD_DIR=uploads
UPLOAD_MAX_IMAGE_SIZE_MB=5

OSS_REGION=oss-cn-shenzhen
OSS_ENDPOINT=https://oss-cn-shenzhen.aliyuncs.com
OSS_BUCKET=正式bucket
OSS_ACCESS_KEY_ID=正式accessKeyId
OSS_ACCESS_KEY_SECRET=正式accessKeySecret
OSS_PUBLIC_BASE_URL=https://正式OSS访问域名
OSS_UPLOAD_PREFIX=life-assitant/prod
OSS_SIGNATURE_VERSION=v4
OSS_SIGNED_URL_EXPIRES_SECONDS=900

DEFAULT_AVATAR_URL=https://正式OSS访问域名/life-assitant/prod/system_default_avatar/default-avatar.png
```

地图配置：

```env
MAP_PROVIDER=tencent
TENCENT_MAP_KEY=正式腾讯地图key
AMAP_KEY=
MAP_API_TIMEOUT_MS=5000
```

### 2. 确认证书目录

后端发布包必须包含：

```text
server/certs/apiclient_key.pem
server/certs/wechatpay_public_key.pem
```

部署脚本会检查这两个文件。缺失时 Docker 发布会失败。

### 3. 禁用生产 mock 和开发能力

检查并确认：

1. `MOCK_LOGIN_ENABLED=false`
2. `PAYMENT_PROVIDER=wechat`
3. `REFUND_PROVIDER=wechat`
4. `SEED_ON_START=false`
5. `NODE_ENV=production`
6. `CORS_ORIGIN` 不使用 `*`

关键代码位置：

```text
server/src/auth/auth.service.ts
server/src/payments/payments.service.ts
server/src/refunds/refunds.service.ts
server/src/dev/dev.controller.ts
server/src/main.ts
```

### 4. Swagger 生产处理

当前 `server/src/main.ts` 会始终暴露 `/api/docs`。

上线前二选一：

1. 生产环境关闭 Swagger。
2. 在 Nginx 对 `/api/docs` 做 IP 白名单或 Basic Auth。

推荐第一版先关闭生产 Swagger，降低接口暴露面。

## 二、小程序正式环境切换

### 1. 修正 `miniapp/env/.env.production`

当前 production 环境不能保留局域网地址和本地调试登录。

正式配置应为：

```env
NODE_ENV=production
VITE_WX_APPID=正式小程序appid

VITE_SERVER_BASEURL=https://www.xunhaoyou.com/api
VITE_SERVER_BASEURL_SECONDARY=https://www.xunhaoyou.com/api

VITE_DELETE_CONSOLE=true
VITE_SHOW_SOURCEMAP=false

VITE_LOCAL_DEBUG_LOGIN=false
VITE_LOCAL_DEBUG_AUTO_LOGIN=false
VITE_LOCAL_DEBUG_PAYMENT=false
```

如果继续使用 `miniapp/env/.env.online`，需要保证它和 production 的正式配置一致。

### 2. 修改微信上传脚本

文件：

```text
miniapp/scripts/upload-weixin.js
```

将上传前自动构建命令从：

```bash
pnpm build:mp:prod
```

改为：

```bash
pnpm build:mp:online
```

或者先统一把 `.env.production` 修成正式配置后继续使用 `build:mp:prod`。

推荐使用 `build:mp:online`，因为当前 online 文件已经指向正式域名。

### 3. 小程序正式打包命令

推荐命令：

```bash
cd miniapp
pnpm build:mp:online
```

不要直接使用旧的：

```bash
pnpm build:mp:prod
```

除非已经确认 `.env.production` 完全正式化。

### 4. 小程序产物检查

打包后执行：

```bash
cd miniapp
rg "192.168|127.0.0.1|localhost|VITE_LOCAL_DEBUG|13800001111" dist/build/mp-weixin
```

验收标准：

1. 不出现局域网地址。
2. 不出现本地测试手机号。
3. 不出现启用本地调试登录的值。
4. 可以存在 `/auth/mock-login` 函数定义，但生产页面不能展示本地调试登录按钮，不能自动调用 mock 登录。

### 5. 登录页与协议隐私合规处理

上线审核前需要处理两个前端风险点：

1. 登录按钮不能使用“微信”字样，按钮统一展示为“绑定手机号”。
2. 登录页“已阅读并同意用户协议和隐私政策”处，未勾选和已勾选状态的勾选框外框均使用黑色，避免弱提示。

落地文件：

```text
miniapp/src/pages/login/index.vue
```

处理要求：

1. `button open-type="getPhoneNumber"` 保留平台手机号授权能力，但按钮文案只展示“绑定手机号”。
2. H5 兜底按钮同样展示“绑定手机号”，异常提示也使用中性表述。
3. 登录页源码和小程序产物中不应再出现旧按钮文案：

```text
微信手机号快捷登录
微信小程序登录
```

4. 《用户协议》和《隐私政策》必须为可点击入口，点击协议链接时不触发勾选状态切换。
5. 协议、隐私页必须允许未登录访问，避免用户在登录前无法查看协议。

验收命令：

```bash
cd miniapp
rg "微信手机号快捷登录|微信小程序登录" src/pages/login dist/build/mp-weixin
rg "pages/legal|用户协议|隐私政策|绑定手机号" dist/build/mp-weixin
```

第一条应无输出；第二条应能命中协议页和“绑定手机号”相关产物。

### 6. 用户协议、隐私政策和联系方式完善

小程序上线前必须提供可访问、内容完整的协议和隐私页面。

落地文件：

```text
miniapp/src/pages/legal/user-agreement.vue
miniapp/src/pages/legal/privacy-policy.vue
miniapp/src/constants/company.ts
miniapp/src/constants/support.ts
```

协议页面至少包含：

1. 协议范围。
2. 账号与手机号绑定说明。
3. 服务预约与履约规则。
4. 支付、取消与退款说明。
5. 用户行为规范。
6. 平台责任边界。
7. 协议更新与联系方式。

隐私政策至少包含：

1. 个人信息收集范围。
2. 个人信息使用目的。
3. 手机号、地址、相册、拍照、定位等权限说明。
4. 信息共享与第三方处理说明。
5. 信息保存与安全措施。
6. 用户查询、更正、删除、注销等权利。
7. 未成年人保护。
8. 个人信息处理者联系方式。
9. 政策更新说明。

品牌和联系信息以 `photo/example/brand.png` 为准：

```text
服务品牌：吉喆家政
服务定位：双鸭山便民居家服务
联系地址：黑龙江省双鸭山市大润发
门店热线：0469-8596888
服务咨询：15645777033 / 13384692200
```

注意事项：

1. 协议、隐私页中必须展示品牌、地址、门店热线和服务咨询号码。
2. 小程序默认客服配置必须使用真实热线，不能继续使用 `400-100-2026`、`life-assistant-service` 等占位值。
3. 客服页面第二联系方式如展示手机号，应标为“服务咨询”，不要标为“客服微信”。
4. 后端 `/support/config` 如果仍是旧占位值，运行时需要自动替换为真实联系方式，避免前端请求后被旧配置覆盖。
5. Admin 客服配置页文案同步为“服务咨询”，方便运营后台维护。

相关文件：

```text
server/src/support/support.service.ts
server/prisma/schema.prisma
server/prisma/migrations/20260705100000_support_faq_config/migration.sql
admin/src/api/life/index.ts
miniapp/src/pages/profile/contact-service.vue
miniapp/src/pages/staff/contact-service.vue
```

验收命令：

```bash
rg "吉喆家政|双鸭山市大润发|0469-8596888|15645777033|13384692200|服务咨询" miniapp/src admin/src server/src server/prisma
rg "400-100-2026|life-assistant-service|客服微信|微信手机号快捷登录|微信小程序登录" miniapp/src admin/src server/src server/prisma
```

第一条应能命中真实品牌、地址和联系方式；第二条只允许命中后端兼容替换逻辑中的旧占位常量，不允许出现在最终展示文案和小程序产物中。

## 三、Admin 正式环境切换

### 1. 确认 `admin/.env.production`

当前推荐配置：

```env
VITE_APP_BASE_API=/prod-api
VITE_APP_TITLE=生活助手管理后台
VITE_APP_PUBLIC_PATH=/admin/
```

### 2. Admin 打包命令

```bash
cd admin
pnpm build
```

### 3. Admin 产物检查

```bash
cd admin
rg "192.168|127.0.0.1" dist
rg "localhost" dist
```

验收标准：

1. 不出现本地 API 地址。
2. `dist/index.html` 的静态资源路径以 `/admin/` 开头。
3. API 请求最终通过 `/prod-api` 反向代理进入后端。
4. 如果 `localhost` 只出现在 axios、URL validator 等第三方库内部逻辑中，不作为本地 API 地址失败；如果出现在业务 API 配置、请求 baseURL、SSE URL 或页面文案中，必须修复。

## 四、Nginx 反向代理要求

生产 Nginx 至少需要三类路由。

### 1. Admin 静态资源

```nginx
location /admin/ {
  alias /www/wwwroot/life-assistant/admin/;
  try_files $uri $uri/ /admin/index.html;
}
```

### 2. 小程序 API

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:3100/api/;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 3. Admin API

Admin 配置为 `/prod-api`，而前端接口里本身包含 `/api/...`。

推荐代理：

```nginx
location /prod-api/ {
  proxy_pass http://127.0.0.1:3100/;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

注意：不要把 `/prod-api/api/...` 错误代理成 `/api/api/...`。

## 五、后端 Docker 发布流程

### 1. 本地重新构建后端

```bash
cd server
pnpm build
```

### 2. 重新生成发布包

不要复用旧的 `release/server-release`。

```powershell
cd server
.\package-release.ps1 -Zip
```

发布包必须包含：

```text
.env.production
deploy.sh
docker-entrypoint.sh
Dockerfile
life-assistant-server.tar
certs/apiclient_key.pem
certs/wechatpay_public_key.pem
```

### 3. 上传到服务器

上传新的 release 目录或 zip 到服务器。

### 4. 服务器执行部署

```bash
cd server-release
chmod +x deploy.sh
./deploy.sh
```

`docker-entrypoint.sh` 会自动执行：

```bash
npm run prisma:migrate:deploy
```

只有当 `SEED_ON_START=true` 时才会 seed。生产必须保持 `false`。

## 六、数据库迁移检查

上线前本地检查：

```bash
cd server
pnpm prisma:migrate:status
```

服务器容器启动后检查：

```bash
docker logs life_assistant_server --tail=200
```

确认：

1. Prisma migrate deploy 成功。
2. 没有缺字段错误。
3. 没有微信支付证书缺失错误。
4. 没有 OSS 配置缺失错误。

## 七、上线前完整验证

### 1. 后端

```bash
cd server
pnpm build
pnpm prisma:migrate:status
```

### 2. Admin

```bash
cd admin
pnpm build
rg "192.168|127.0.0.1" dist
rg "localhost" dist
```

### 3. 小程序

```bash
cd miniapp
pnpm build:mp:online
rg "192.168|127.0.0.1|localhost|VITE_LOCAL_DEBUG|13800001111" dist/build/mp-weixin
rg "微信手机号快捷登录|微信小程序登录|400-100-2026|life-assistant-service|客服微信" dist/build/mp-weixin
rg "pages/legal|绑定手机号|吉喆家政|双鸭山市大润发|0469-8596888|15645777033|13384692200|服务咨询" dist/build/mp-weixin
```

前两条应无输出；第三条应能命中新协议页、登录按钮文案和真实联系方式。

### 4. 后端环境文件

检查生产 env 是否包含：

```text
NODE_ENV=production
MOCK_LOGIN_ENABLED=false
PAYMENT_PROVIDER=wechat
REFUND_PROVIDER=wechat
SEED_ON_START=false
STORAGE_PROVIDER=aliyun-oss
OSS_UPLOAD_PREFIX=life-assitant/prod
PUBLIC_BASE_URL=https://www.xunhaoyou.com
```

## 八、上线后冒烟测试

按顺序执行：

1. 访问 `GET https://www.xunhaoyou.com/api/health`。
2. Admin 登录。
3. Admin 上传图片，确认图片写入 OSS 并可预览。
4. 小程序微信登录。
5. 登录页按钮展示为“绑定手机号”，不展示旧按钮文案。
6. 登录页协议勾选框外框为黑色，协议链接可点击且不触发勾选状态切换。
7. 用户协议和隐私政策页面可未登录访问，内容包含吉喆家政、双鸭山市大润发、门店热线和服务咨询号码。
8. 小程序联系客服页展示真实客服电话和服务咨询号码。
9. 用户头像上传。
10. 首页轮播图、热门服务图加载。
11. 用户下单。
12. 微信支付 JSAPI 能正常唤起。
13. 支付回调后订单变为已支付。
14. 已支付订单取消后生成退款单。
15. Admin 审核退款，微信退款请求正常发出。
16. 师傅端登录、查看订单、上传服务完成照片。
17. 用户提交售后或反馈图片，Admin 可预览。
18. 如果提现正式上线，测试提现申请、Admin 审核、微信转账、回调更新状态。

## 九、回滚预案

### 1. 后端回滚

保留上一个 Docker 镜像和上一个 `.env.production`。

如果新版本启动失败：

```bash
docker logs life_assistant_server --tail=300
docker rm -f life_assistant_server
```

然后使用上一版 release 重新执行：

```bash
./deploy.sh
```

### 2. Admin 回滚

保留上一版 `admin/dist`。

如果新后台异常，恢复上一版静态目录并 reload Nginx。

### 3. 小程序回滚

微信公众平台保留线上版本。

如果新开发版异常，不提交审核；如果审核上线后异常，使用微信平台版本回退能力或发布修复版本。

## 十、最终验收标准

1. 生产后端不使用模拟登录。
2. 生产后端不使用模拟支付。
3. 小程序包不包含局域网 API 地址。
4. 小程序包不自动 mock 登录。
5. Admin 能通过正式域名访问后端。
6. 图片上传统一进入 OSS，Admin 图片管理可管理。
7. 微信支付、退款、提现相关回调地址均为 HTTPS 正式域名。
8. Docker 容器重启后服务能自动恢复。
9. 数据库 migration 已应用到服务器。
10. 上线后核心订单链路、图片链路、支付链路完成冒烟测试。
11. 小程序登录页无旧登录按钮文案，协议勾选框黑色外框展示正常。
12. 用户协议、隐私政策可访问，且展示真实品牌、地址和联系方式。
13. 客服配置不再展示旧占位电话和“客服微信”误标。
