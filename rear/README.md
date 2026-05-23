# rear

生活助手后端 Day 2 最小实现。

## 本地启动

```powershell
cd rear
node scripts/seed.js
node src/main.js
```

默认地址：

```txt
http://localhost:3000/api
```

## 常用命令

```powershell
npm run seed
npm run dev
npm run test:contract
```

## 环境变量

复制 `.env.example` 为 `.env` 后可修改：

```txt
PORT=3000
API_PREFIX=/api
PUBLIC_BASE_URL=http://localhost:3000
DATA_FILE=./data/db.json
```

后续部署到云服务器时，优先替换 `PUBLIC_BASE_URL`、`HOST`、`PORT` 和小程序端的 `VITE_SERVER_BASEURL`。

## Day 2 接口

```txt
GET  /api/health
GET  /api/service-categories
GET  /api/services
GET  /api/services/:id
POST /api/dev/seed
```

所有业务响应统一：

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "requestId": "req_xxx",
  "timestamp": "2026-05-14T10:00:00.000Z"
}
```
