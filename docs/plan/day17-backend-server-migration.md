# Day 17 后端服务器迁移计划

更新时间：2026-06-19  
目标：把 `server/` 作为唯一后端交付单元，能从本机迁到任意服务器，以后换机器只改配置，不改代码。

## 1. 迁移包

每次只带这几样：

```txt
server/
server/.env.production
server/certs/apiclient_key.pem
server/certs/wechatpay_public_key.pem
```

数据库仍然放在外部 MySQL，不跟代码绑定。

## 2. 一次性准备

目标服务器先准备好：

```txt
Docker
MySQL 8+（本机、云数据库都可以）
可公网访问的 HTTPS 域名
Nginx / Caddy / 宝塔反向代理
```

然后在服务器上放好：

```txt
server/.env.production
server/certs/*
```

## 3. 固定流程

每次迁移都按这个顺序做：

```bash
cd server
bash deploy.sh
```

如果是第一次上线，且基础数据没进库，再补一次：

```bash
docker exec -it life_assistant_server npm run seed:db
```

如果先在本机打包再上传服务器：

```powershell
cd server
.\package-release.ps1 -Zip
```

发布包里会带上：

```txt
Docker 镜像 tar
server/.env.production
server/certs/*
server/uploads/
```

## 4. 生产配置只改这里

这些值跟服务器有关，换机器时只改它们：

```env
DATABASE_URL=
PUBLIC_BASE_URL=https://你的正式域名
SERVER_BASE_URL=https://你的正式域名
CORS_ORIGIN=https://你的正式域名
WECHAT_PAY_NOTIFY_URL=https://你的正式域名/api/payments/wechat/notify
```

微信支付参数继续只放在 `server/.env.production`，不要写进小程序端。

## 5. 验收

迁移完成后只看四件事：

```txt
容器能启动
/api/health 正常
/api/orders/:id/pay 能创建真实微信预支付单
/api/payments/wechat/notify 能回调入库并更新订单
```

## 6. 下次换服务器

直接重复同一套流程，不需要改代码。  
只要替换：

```txt
服务器地址
域名
DATABASE_URL
证书文件
uploads 目录（如需保留历史文件）
```

其余后端代码、接口和支付逻辑保持不变。
