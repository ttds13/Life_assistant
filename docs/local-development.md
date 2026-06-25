# 本地开发切换说明

当前线上小程序和服务器镜像作为稳定版本保留；日常开发默认回到本地环境，只绕开登录和支付。

## 本地开发

后端：

```bash
cd server
npm run dev
```

小程序：

```bash
cd miniapp
pnpm dev:mp
```

本地默认配置：

- `miniapp/env/.env.development`
  - `VITE_SERVER_BASEURL='http://127.0.0.1:3100/api'`
  - `VITE_LOCAL_DEBUG_LOGIN=true`
  - `VITE_LOCAL_DEBUG_PAYMENT=true`
- `server/.env`
  - `MOCK_LOGIN_ENABLED=true`
  - `PAYMENT_PROVIDER=mock`
  - `OSS_UPLOAD_PREFIX=life-assitant/dev`

本地开发时可以完善除真实支付以外的页面、订单、上传、服务、师傅端等功能。支付请求会走 mock 分支，不触发微信支付证书、HTTPS 回调和真实扣款。

## 连接线上后端调试

```bash
cd miniapp
pnpm dev:mp:online
```

这个模式请求：

```text
https://www.xunhaoyou.com/api
```

不启用本地模拟登录和模拟支付。

## 发布线上

小程序正式构建：

```bash
cd miniapp
pnpm build:mp:prod
```

线上服务器环境必须保持：

```text
PAYMENT_PROVIDER=wechat
MOCK_LOGIN_ENABLED=false
OSS_UPLOAD_PREFIX=life-assitant/prod
WECHAT_PAY_NOTIFY_URL=https://www.xunhaoyou.com/api/payments/wechat/notify
```

不要把本地 `server/.env` 直接上传覆盖线上环境。
