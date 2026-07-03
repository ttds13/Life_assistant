# Life Assistant Server

NestJS backend migrated in parallel from `rear/`.

## Local

```powershell
npm install
npm run prisma:generate
npm run dev
npm run build
npm run db:verify
```

Migration port defaults to `3100`; `rear` can continue running on `3000`.

## Docker deploy

```powershell
cd server
bash deploy.sh
```

To package on Windows first:

```powershell
.\package-release.ps1 -Zip
```

If Docker Hub is blocked on your machine, point `NODE_IMAGE` at a reachable Node 22 image before packaging:

```powershell
$env:NODE_IMAGE="your.registry/node:22-bookworm-slim"
.\package-image.ps1
```

Required files:

```txt
server/.env.production
server/certs/apiclient_key.pem
server/certs/wechatpay_public_key.pem
```

`uploads/` is mounted too, so uploaded files survive rebuilds. Production env should include `PUBLIC_BASE_URL`, `SERVER_BASE_URL`, and `WECHAT_PAY_NOTIFY_URL`. The container listens on `127.0.0.1:3100`, so put Nginx, Caddy, or Baota in front of it.
