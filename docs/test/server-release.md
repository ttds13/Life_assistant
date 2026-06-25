# Server Release 执行清单
更新时间：2026-06-19

本清单对应发布包：`release/server-release.zip`

说明：
- 这是一个源码发布包，不包含本机镜像 tar
- 服务器上会通过 `docker build` 构建运行环境
- 宿主机 Node 版本不用管，实际运行环境走容器里的 Node 22

## 1. 包内内容

发布包里需要带上这些东西：

```txt
Dockerfile
deploy.sh
docker-entrypoint.sh
.env.production
certs/
prisma/
scripts/
src/
package.json
package-lock.json
nest-cli.json
tsconfig.json
tsconfig.build.json
.dockerignore
README.md
```

如果有 `uploads/` 历史文件，也一并带上。

## 2. Tar 路线

如果你本机已经装好 Docker，并且 Docker daemon 已经启动，可以直接在 `server/` 下生成镜像 tar：

```powershell
cd server
.\package-image.ps1
```

默认输出：

```txt
release/life-assistant-server.tar
```

服务器上直接执行：

```bash
docker load -i life-assistant-server.tar
bash deploy.sh
```

## 3. 上传与解压

把 `release/server-release.zip` 上传到服务器，例如：

```bash
mkdir -p /opt/life-assistant
cd /opt/life-assistant
unzip /path/to/server-release.zip -d server-release
cd server-release
```

如果服务器没有 `unzip`：

```bash
yum install -y unzip
```

## 4. 修改生产配置

只改 `server-release/.env.production` 里的生产值。

重点检查这几项：

```env
DATABASE_URL=你的生产 MySQL 8 连接串
PUBLIC_BASE_URL=https://www.xunhaoyou.com
SERVER_BASE_URL=https://www.xunhaoyou.com
CORS_ORIGIN=https://www.xunhaoyou.com
WECHAT_PAY_NOTIFY_URL=https://www.xunhaoyou.com/api/payments/wechat/notify
WECHAT_PAY_PRIVATE_KEY_PATH=./certs/apiclient_key.pem
WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH=./certs/wechatpay_public_key.pem
```

证书文件放在：

```txt
certs/apiclient_key.pem
certs/wechatpay_public_key.pem
```

## 5. 启动后端

先给脚本执行权限：

```bash
chmod +x deploy.sh docker-entrypoint.sh
```

然后启动：

```bash
bash deploy.sh
```

说明：
- `deploy.sh` 会把容器启动到 `127.0.0.1:3100`
- 容器启动时会自动执行 `prisma migrate deploy`
- 不需要手工先跑 Node

## 6. 首次上线补种数据

如果数据库是空的，再执行一次：

```bash
docker exec -it life_assistant_server npm run seed:db
```

如果已经有正式数据，不要重复种子。

## 7. 宝塔 / Nginx 反代

把域名反向代理到：

```txt
127.0.0.1:3100
```

建议配置：
- `www.xunhaoyou.com`
- 开启 HTTPS
- 反代到后端 `/api`

## 8. 验证

优先检查这几个点：

```bash
curl http://127.0.0.1:3100/api/health
curl https://www.xunhaoyou.com/api/health
docker logs -f life_assistant_server
```

再确认：
- 订单创建正常
- 微信预支付能返回真实参数
- 微信回调能打到 `/api/payments/wechat/notify`
- 上传文件 URL 正常

## 9. 下次换服务器

只需要换这些东西：

```txt
服务器 IP
域名
DATABASE_URL
证书文件
uploads/ 历史文件（如果要保留）
```

其余后端代码、支付逻辑、接口路径都不用改。

## 10. 如果 `docker build` 拉取 Node 镜像超时

如果你看到类似报错：

```txt
Get "https://registry-1.docker.io/v2/": dial tcp ...: i/o timeout
```

这不是项目代码问题，是服务器到 Docker Hub 的网络不通。

最简单的处理是给 Docker 配镜像加速器，然后重启 Docker。

在服务器上编辑：

```txt
/etc/docker/daemon.json
```

写入类似内容：

```json
{
  "registry-mirrors": ["https://你的镜像加速地址"]
}
```

然后执行：

```bash
systemctl daemon-reload
systemctl restart docker
docker info | grep -A3 "Registry Mirrors"
docker pull node:22-bookworm-slim
```

确认 `docker pull` 能成功后，再重新执行：

```bash
cd /opt/life-assistant/server-release
bash deploy.sh
```
