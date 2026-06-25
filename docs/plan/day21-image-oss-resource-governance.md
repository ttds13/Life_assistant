# Day 21 图片资源 OSS 规整计划

更新时间：2026-06-23  
主题：小程序只保留必要内置图标和默认图；用户上传、服务封面、订单照片、头像等业务图片统一上传 OSS；业务数据库字段只保存 OSS URL，避免小程序包体积膨胀和本地文件存储不可控。

## 1. 当前结论

当前图片资源不是全部在一个地方。

```txt
1. 小程序内置静态资源：
   miniapp/src/static/

2. 用户或业务上传图片：
   后端当前通过 POST /api/upload/image 接收，实际落到本地 uploads 目录。

3. 业务图片引用：
   分散存储在 users、staff、services、service_images、service_photos、review_images、ticket_messages、files 等表字段里。
```

当前 `miniapp/src/static` 文件总大小约 177 KB，包体压力暂时不大。真正需要治理的是后续业务图片不能再放进小程序源码，也不能再落本地 `uploads` 后长期由 `/api/upload/files/*` 服务。

## 1.1 已确定 OSS 目标

本项目图片资源统一上传到阿里云 OSS 深圳节点：

```txt
Bucket: gym-face-bucket
Endpoint: https://oss-cn-shenzhen.aliyuncs.com
Bucket Host: https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com
Root Prefix: life-assitant
```

实际对象路径必须落在：

```txt
life-assitant/{env}/{bizType}/...
```

例如：

```txt
https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com/life-assitant/prod/avatar/user/123/2026/06/uuid.jpg
```

注意：这里按已提供地址使用 `life-assitant` 作为固定前缀。实施前需要确认 OSS 上实际目录是否就是该拼写；如果要改成 `life-assistant`，必须数据库、迁移脚本、后端环境变量和对象路径一起统一修改。

Bucket 按私有读写处理。前端不直接持有 OSS AccessKey，也不把长期 AccessKey 写入小程序。上传由后端中转或后端签发临时上传凭证；下载由后端生成短期签名 URL，或由后端代理读取后返回。

## 2. 总目标

```txt
1. 小程序源码只保留运行必须的内置图标、tabbar 图标、默认头像和极少量占位图。
2. 用户头像、师傅头像、服务封面、服务详情图、订单履约照片、评价图片、工单图片全部上传 OSS。
3. 业务表只保存 gym-face-bucket/life-assitant 下的固定 OSS URL，展示时由后端生成 signedUrl/displayUrl。
4. 前端任何提交给后端的图片字段都不得是 tempFilePath、wxfile://、http://tmp、/static/* 或 /api/upload/files/*。
5. 后端上传接口保持统一入口，先由服务端转存 OSS，避免小程序端暴露 OSS AccessKey。
6. 小程序包体积建立检查规则，防止业务图片误提交到 static。
```

## 3. 资源分类标准

### 3.1 允许保留在小程序包内

这些资源可以继续在 `miniapp/src/static` 中保留：

```txt
miniapp/src/static/app/icons/*.png        App/平台图标
miniapp/src/static/tabbar/*.png           tabbar 图标
miniapp/src/static/images/default-avatar.png 默认头像
miniapp/src/static/logo.svg               如果启动页或品牌露出真实引用，则保留
```

保留原则：

```txt
1. 必须是产品运行基础资源。
2. 单个文件尽量小于 100 KB。
3. 总 static 图片体积建议长期控制在 500 KB 内。
4. 不放服务实拍图、用户头像、订单照片、营销海报、服务封面。
```

### 3.2 待确认后删除或替换

当前存在但未在扫描结果中发现明确引用的资源：

```txt
miniapp/src/static/images/avatar.jpg
miniapp/src/static/my-icons/copyright.svg
```

处理方式：

```txt
1. 再跑一次全局引用搜索。
2. 如果生产页面没有引用，删除。
3. 如果只是默认头像用途，统一改用 default-avatar.png。
```

### 3.3 必须走 OSS 的资源

```txt
用户头像 users.avatar_url
师傅头像 staff.avatar_url
服务封面 services.cover_image
服务详情图 service_images.url
上门/签到/履约打卡图 service_checkins.photo_url
订单履约照片 service_photos.url
评价图片 review_images.url
工单消息图片 ticket_messages.images
后台上传的服务类、员工类、运营类图片
```

## 4. 数据库存储规则

业务表字段只保存固定 OSS URL，例如：

```txt
https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com/life-assitant/prod/avatar/user/2026/06/uuid.jpg
https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com/life-assitant/prod/service-cover/service-id/uuid.webp
https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com/life-assitant/prod/order-photo/order-id/uuid.jpg
```

禁止写入业务表：

```txt
/static/images/default-avatar.png
/api/upload/files/xxx.jpg
/prod-api/upload/files/xxx.jpg
http://tmp/xxx
wxfile://xxx
file://xxx
本机绝对路径
base64 图片内容
带 Expires、Signature、OSSAccessKeyId、x-oss-signature 的临时签名 URL
```

说明：

```txt
1. 用户未上传头像时，业务表 avatar_url 可以为空。
2. 前端展示时使用本地 default-avatar.png 作为兜底图，但不要把兜底图路径写入数据库。
3. files 表可以作为上传台账保存 url、storage_key、mime_type、size、uploader 信息，用于审计和删除；业务读取仍以各业务表的固定 OSS URL 为准。
4. 私有 Bucket 的临时签名下载 URL 只用于接口响应给前端展示，不能写入业务表，因为签名 URL 会过期。
5. 业务接口可以返回 displayUrl 或 signedUrl 给前端展示，但保存接口只能接收固定 OSS URL。
```

## 5. OSS 对象路径规范

建议按业务类型和环境隔离：

```txt
life-assitant/prod/avatar/user/{userId}/{yyyy}/{mm}/{uuid}.{ext}
life-assitant/prod/avatar/staff/{staffId}/{yyyy}/{mm}/{uuid}.{ext}
life-assitant/prod/service-cover/{serviceId}/{uuid}.{ext}
life-assitant/prod/service-image/{serviceId}/{uuid}.{ext}
life-assitant/prod/order-photo/{orderId}/{staffId}/{uuid}.{ext}
life-assitant/prod/review-image/{reviewId}/{uuid}.{ext}
life-assitant/prod/ticket-image/{ticketId}/{uuid}.{ext}
```

开发和测试环境使用：

```txt
life-assitant/dev/...
life-assitant/staging/...
```

命名规则：

```txt
1. 文件名使用 UUID，不使用用户原始文件名。
2. 扩展名由真实 MIME 类型决定。
3. 不在 URL 中暴露手机号、姓名、订单号等隐私信息。
4. 当前私有读写阶段，数据库保存固定 OSS URL，不保存临时签名 URL。
5. 如果后续接入私有 CDN，需重新明确数据库是否切换为 CDN 固定 URL。
```

## 6. 后端改造计划

### 6.1 当前问题

现状：

```txt
server/src/upload/upload.controller.ts
server/src/upload/upload.service.ts
server/src/upload/upload.module.ts
```

当前行为：

```txt
1. POST /api/upload/image 使用 memoryStorage 接收文件。
2. 服务端保存到本地 UPLOAD_DIR，默认 uploads。
3. 返回 /api/upload/files/{filename} 或 SERVER_BASE_URL + /api/upload/files/{filename}。
4. UploadModule 通过 ServeStaticModule 暴露本地上传目录。
5. Docker 部署脚本挂载 uploads:/app/uploads。
```

目标行为：

```txt
1. POST /api/upload/image 保持接口路径不变，减少前端改动面。
2. UploadService 不再写本地文件，改为上传 OSS。
3. 返回 { url, signedUrl?, fileId?, storageKey?, size?, mimeType? }。
4. 业务接口只接收并保存 url。
5. 迁移完成后下线 /api/upload/files 本地静态服务。
```

### 6.2 私有上传和私有下载

推荐先采用后端中转上传：

```txt
1. 小程序调用 POST /api/upload/image。
2. 后端校验登录态、文件大小、文件类型。
3. 后端用服务端 OSS AccessKey 上传到私有 Bucket。
4. 后端返回固定 OSS URL 和短期 signedUrl。
5. 前端保存或提交固定 OSS URL，页面展示优先使用 signedUrl。
```

下载展示有两种方案，优先使用方案 A：

```txt
方案 A：后端签发短期下载 URL
- 列表/详情接口读取业务表固定 OSS URL。
- 后端解析 objectKey，生成 5-30 分钟有效的 signedUrl。
- 响应中额外返回 displayUrl 或 signedUrl。
- 前端 image src 使用 displayUrl/signedUrl。

方案 B：后端代理图片
- 前端请求 /api/files/:id/view 或 /api/files/view?url=...
- 后端鉴权后从 OSS 私有读取并流式返回。
- 小程序只需要配置 xunhaoyou.com 域名。
- 后端带宽压力更大，只适合小图或需要强鉴权的图片。
```

业务表保存规则：

```txt
users.avatar_url              固定 OSS URL
staff.avatar_url              固定 OSS URL
services.cover_image          固定 OSS URL
service_images.url            固定 OSS URL
service_photos.url            固定 OSS URL
review_images.url             固定 OSS URL
ticket_messages.images        固定 OSS URL 数组
接口响应 displayUrl/signedUrl 短期有效，不入库
```

### 6.3 存储抽象

新增对象存储服务：

```txt
server/src/storage/storage.module.ts
server/src/storage/storage.service.ts
server/src/storage/adapters/aliyun-oss.adapter.ts
server/src/storage/storage.types.ts
```

接口建议：

```ts
export interface PutObjectInput {
  buffer: Buffer
  mimeType: string
  originalName?: string
  bizType: string
  bizId?: string | number
  uploaderType: 'user' | 'staff' | 'admin'
  uploaderId: string | number
}

export interface PutObjectResult {
  url: string
  signedUrl?: string
  storageKey: string
  size: number
  mimeType: string
}
```

上传流程：

```txt
1. Controller 校验登录态和文件基础信息。
2. Service 校验文件大小、MIME、扩展名和图片魔数。
3. 根据 bizType 生成 OSS object key。
4. 上传 OSS。
5. 写 files 上传台账。
6. 返回固定 OSS URL 和短期 signedUrl。
```

### 6.4 环境变量

在 `server/.env.example` 和生产 `.env` 增加：

```env
STORAGE_PROVIDER=aliyun-oss
OSS_REGION=oss-cn-shenzhen
OSS_ENDPOINT=https://oss-cn-shenzhen.aliyuncs.com
OSS_BUCKET=gym-face-bucket
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
OSS_PUBLIC_BASE_URL=https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com
OSS_UPLOAD_PREFIX=life-assitant/prod
OSS_FORCE_PATH_STYLE=false
OSS_PRIVATE_READ=true
OSS_SIGNED_URL_EXPIRES_SECONDS=900
UPLOAD_MAX_IMAGE_SIZE_MB=5
```

注意：

```txt
1. OSS_ACCESS_KEY_ID 和 OSS_ACCESS_KEY_SECRET 只放服务端。
2. 小程序端不保存 OSS 密钥。
3. OSS_PUBLIC_BASE_URL 是固定 OSS URL 的 host，不代表公开可读。
4. 私有下载时，前端展示使用后端生成的 signedUrl。
```

### 6.5 上传安全规则

必须保留或新增：

```txt
1. 单张图片最大 5 MB。
2. 只允许 image/jpeg、image/png、image/webp。
3. 禁止 SVG 作为用户上传图片，避免脚本风险。
4. 校验文件头，不只相信 mimetype。
5. 生成随机文件名，忽略原始文件名。
6. 上传接口必须登录后调用。
7. 根据 uploaderType/uploaderId 记录上传人。
8. 对上传接口加速率限制或业务频率限制。
9. 签名下载 URL 过期时间建议 5-30 分钟，不长期缓存到数据库。
```

### 6.6 本地上传服务下线策略

分阶段处理：

```txt
1. 第一阶段保留 /api/upload/files/*，只用于历史图片兼容。
2. 新上传全部返回 OSS URL。
3. 历史数据迁移完成并确认无引用后，删除 ServeStaticModule 本地上传暴露。
4. 部署脚本移除 uploads 目录挂载。
```

### 6.7 阿里云 OSS 官方行为约束

依据阿里云 OSS/RAM 官方文档，本项目私有上传下载按以下规则落地：

```txt
参考文档：
1. 服务端签名直传：
   https://help.aliyun.com/zh/oss/user-guide/obtain-signature-information-from-the-server-and-upload-data-to-oss
2. PostObject：
   https://help.aliyun.com/zh/oss/developer-reference/postobject
3. STS AssumeRole：
   https://help.aliyun.com/zh/ram/developer-reference/api-sts-2015-04-01-assumerole
4. 使用 Node.js SDK 生成下载预签名 URL：
   https://help.aliyun.com/zh/oss/developer-reference/download-objects-using-a-signed-url-generated-with-oss-sdk-for-node-js
5. 使用 Node.js SDK 生成上传预签名 URL：
   https://help.aliyun.com/zh/oss/developer-reference/authorized-access-3
6. V4 签名：
   https://help.aliyun.com/zh/oss/developer-reference/add-signatures-to-urls
```

官方规则落到本项目的解释：

```txt
1. 私有 Bucket 默认不能匿名读写，上传和下载都必须经授权。
2. 后端中转上传最简单稳定：小程序只访问业务后端，后端持有 RAM 用户 AccessKey 并调用 OSS SDK PutObject。
3. 预签名 URL 可以临时授权 GET/PUT。阿里云文档中 Node.js SDK 的预签名 URL 上传示例是 PUT 上传。
4. POST 表单直传不是普通 signedUrl，需要按 PostObject 规则构造 multipart/form-data 表单，并提供 policy、Signature、OSSAccessKeyId 等表单字段。
5. STS AssumeRole 可用于客户端直传，Token 有效期用 DurationSeconds 控制；文档显示最小值为 900 秒，默认 3600 秒。
6. 服务端签名直传文档要求直传场景配置 OSS CORS；如果当前采用后端中转上传，则暂不需要给小程序直连 OSS 配置上传 CORS。
7. 上传签名 URL 在有效期内可被多次访问；如果 objectKey 固定，重复上传会覆盖对象。本项目必须使用随机 UUID objectKey，并启用禁止覆盖策略。
8. 下载 signedUrl 只代表临时访问授权，不能入库，不能作为长期业务 URL。
```

本项目当前版本固定采用：

```txt
上传：后端中转上传 OSS
下载：后端生成 GET signedUrl 后返回给前端展示
入库：固定 OSS URL + files.storage_key
不采用：小程序端持有长期 AccessKey
暂不采用：小程序直传 OSS
```

后续如果要改为小程序直传 OSS，只允许二选一：

```txt
方案 A：STS 临时凭证直传
- 后端调用 AssumeRole 获取临时凭证。
- 临时凭证权限只允许写入 gym-face-bucket/life-assitant/{env}/{bizType}/ 指定前缀。
- DurationSeconds 建议 900 秒。
- 小程序端拿临时 AccessKeyId、AccessKeySecret、SecurityToken 上传。
- 不允许返回覆盖已有对象的 objectKey。

方案 B：PostObject 表单直传
- 后端生成 policy 和 Signature。
- policy 必须限制 bucket、key 前缀、content-length-range、过期时间。
- 表单上传必须使用 multipart/form-data。
- file 必须作为最后一个表单域。
- 必须携带 x-oss-forbid-overwrite=true 防止覆盖。
```

不建议在当前版本使用预签名 PUT URL 直传，原因：

```txt
1. 小程序上传 API 更适合 uploadFile/form-data，PUT 二进制上传需要额外适配。
2. 预签名 PUT URL 有效期内可重复使用，若 objectKey 控制不好会覆盖文件。
3. 当前图片最大 5 MB，后端中转带宽压力可接受，且鉴权、审计、MIME 校验更集中。
```

### 6.8 具体接口行为规范

#### 6.8.1 后端中转上传

接口：

```txt
POST /api/upload/image
Content-Type: multipart/form-data
字段名：file
可选字段：bizType, bizId
```

后端必须执行：

```txt
1. 校验 JWT 登录态。
2. 读取当前用户身份，推导 uploaderType/uploaderId。
3. 校验文件大小不超过 5 MB。
4. 校验 MIME 只允许 image/jpeg、image/png、image/webp。
5. 校验文件头，禁止伪造 MIME。
6. 根据 bizType 选择 objectKey 前缀。
7. 使用 UUID 生成 objectKey，禁止使用原始文件名作为对象名。
8. 上传到 gym-face-bucket，ACL 不设置为 public-read。
9. 设置 Content-Type 为真实图片 MIME。
10. 写入 files 表：url、storage_key、mime_type、size、uploader_type、uploader_id、biz_type、biz_id、filename。
11. 生成短期 GET signedUrl，默认 900 秒。
12. 返回固定 url 和 signedUrl。
```

响应：

```json
{
  "url": "https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com/life-assitant/prod/avatar/user/123/2026/06/uuid.jpg",
  "signedUrl": "https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com/life-assitant/prod/avatar/user/123/2026/06/uuid.jpg?...",
  "storageKey": "life-assitant/prod/avatar/user/123/2026/06/uuid.jpg",
  "mimeType": "image/jpeg",
  "size": 123456,
  "expiresIn": 900
}
```

#### 6.8.2 私有下载签名

后端在列表、详情、个人资料接口中处理图片字段：

```txt
1. 数据库读取固定 OSS URL 或 files.storage_key。
2. 解析并校验 objectKey 必须以 life-assitant/{env}/ 开头。
3. 校验当前用户是否有权查看该业务图片。
4. 调用 OSS SDK 生成 GET signedUrl。
5. 接口响应同时返回原始字段和展示字段。
```

响应字段约定：

```txt
avatar             固定 OSS URL，业务保存用
avatarDisplayUrl   signedUrl，前端 image src 用
coverImage         固定 OSS URL
coverImageUrl      signedUrl，前端 image src 用
servicePhotos      固定 OSS URL 数组
servicePhotoUrls   signedUrl 数组，前端 image src 用
```

签名 URL 规范：

```txt
1. 默认有效期 900 秒。
2. 最大不超过 1800 秒，除非是后台低频查看场景。
3. 不写入数据库。
4. 不进入本地 storage 长期缓存。
5. 接口刷新时重新签发。
6. 过期后前端重新请求业务详情，不直接复用旧 signedUrl。
```

#### 6.8.3 objectKey 与 URL 校验

保存业务图片字段时必须校验：

```txt
1. URL host 必须是 gym-face-bucket.oss-cn-shenzhen.aliyuncs.com。
2. pathname 必须以 /life-assitant/prod/ 开头。
3. URL 不能包含 Expires、Signature、OSSAccessKeyId、x-oss-signature、x-oss-expires 等签名参数。
4. URL 解码后不能包含 ../、反斜杠、空字节。
5. bizType 与目标业务匹配，例如 user_avatar 不能保存到 service-cover 字段。
```

推荐在后端统一实现：

```txt
assertPermanentOssUrl(url)
extractOssObjectKey(url)
signOssGetUrl(urlOrKey, expiresSeconds)
```

#### 6.8.4 RAM 权限最小化

服务端 RAM 用户或 RAM 角色只授予必要权限：

```txt
oss:PutObject
oss:GetObject
oss:HeadObject
oss:DeleteObject 仅在后台删除图片功能真正实现后再开放
```

资源范围限制到：

```txt
acs:oss:*:*:gym-face-bucket/life-assitant/*
```

如果区分生产和测试环境，生产服务只允许：

```txt
acs:oss:*:*:gym-face-bucket/life-assitant/prod/*
```

后台或迁移脚本如需访问 `dev/staging`，单独配置权限，不和生产运行时 AccessKey 混用。

#### 6.8.5 OSS 控制台配置

```txt
1. Bucket ACL：private。
2. 阻止公共访问：开启。
3. 版本控制：可选；若开启，迁移和删除脚本需记录 versionId。
4. CORS：当前后端中转上传不需要配置给小程序直传的 CORS。
5. 如果启用小程序直传，再配置 CORS：
   - AllowedOrigin：小程序环境按阿里云/微信要求配置，不能长期使用 *。
   - AllowedMethod：POST、PUT、GET 按实际方案最小化。
   - AllowedHeader：authorization、content-type、x-oss-security-token、x-oss-forbid-overwrite 等必要头。
   - ExposeHeader：ETag、x-oss-request-id。
6. 当前版本不得开启 public-read，不得接公开 CDN；如后续要接 CDN，需要单独评审鉴权、缓存和防盗链方案。
```

#### 6.8.6 错误处理

```txt
1. OSS 上传失败：业务接口返回上传失败，不写业务表。
2. files 表写入失败：如果 OSS 已上传成功，记录错误并尝试删除 OSS 对象；删除失败则写补偿日志。
3. 签名 URL 生成失败：业务接口仍可返回固定 OSS URL，但 displayUrl 为空，前端展示占位图并允许刷新。
4. 前端收到 403 图片加载失败：重新请求业务详情获取新的 signedUrl。
5. 迁移脚本遇到缺失本地文件：只输出报告，不把字段清空。
```

## 7. 前端改造计划

### 7.1 统一上传工具

新增或收敛为一个小程序上传工具：

```txt
miniapp/src/utils/uploadImage.ts
```

职责：

```txt
1. 调用 uni.chooseMedia/uni.chooseImage。
2. 前端先做 5 MB 大小限制。
3. 统一调用 POST /upload/image。
4. 解析后端返回，保存固定 OSS URL，展示使用 signedUrl/displayUrl。
5. 统一 loading、progress、error 文案。
```

返回结构：

```ts
interface UploadedImage {
  url: string
  signedUrl?: string
  displayUrl?: string
  fileId?: string
  size?: number
  mimeType?: string
}
```

### 7.2 当前需要替换的直接上传点

```txt
miniapp/src/pages/settings/index.vue
miniapp/src/pages/staff/settings.vue
```

目标：

```txt
1. 删除页面内重复的 uni.uploadFile 逻辑。
2. 统一调用 uploadImage({ bizType: 'user_avatar' }) 或 uploadImage({ bizType: 'staff_avatar' })。
3. updateProfile/updateStaffProfile 只提交 OSS URL。
4. 未设置头像时前端展示 default-avatar.png，不把 default-avatar.png 写入接口。
5. 如果上传接口返回 signedUrl，当前页面立即展示 signedUrl；刷新后由 profile 接口重新返回 displayUrl。
```

### 7.3 图片网格组件改造

当前组件：

```txt
miniapp/src/components/upload-image-grid/upload-image-grid.vue
```

现状问题：

```txt
1. 只选择本地压缩图。
2. modelValue 中保存 tempFilePath。
3. 师傅订单照片通过本地 storage 暂存，不是真正上传。
```

目标：

```txt
1. 选择图片后立即上传 OSS。
2. 上传中显示 uploading。
3. 上传成功后 item.url 保存固定 OSS URL，item.displayUrl 保存 signedUrl，status = done。
4. 上传失败 status = error，并允许删除重选。
5. 对外 emit 的 modelValue 中不再出现 tempFilePath。
```

### 7.4 师傅订单照片链路

当前相关文件：

```txt
miniapp/src/api/staff.ts
miniapp/src/pages/staff/upload-photos.vue
miniapp/src/pages/staff/write-order.vue
miniapp/src/pages/staff/order-detail.vue
```

当前问题：

```txt
1. STAFF_ORDER_PHOTOS_{orderId} 中可能保存本地路径。
2. completeStaffTask 可能把本地路径作为 photoUrls 提交后端。
```

目标：

```txt
1. 订单照片选择后立即上传 OSS。
2. 本地 storage 只允许短期保存 OSS URL 和上传状态，不保存 tempFilePath。
3. completeStaffTask 提交的 photoUrls 必须全部是 https:// 的 OSS URL。
4. 后端在写 service_photos.url 前再次校验 URL 来源。
5. 订单详情展示照片时，后端需要把 service_photos.url 转成可访问的 signedUrl/displayUrl。
```

### 7.5 服务封面和后台图片

后台管理端如果有服务封面、服务图、员工头像上传：

```txt
1. 统一使用同一个后端上传接口。
2. 表单字段只保存 OSS URL。
3. 不允许手工填写 /uploads、/api/upload/files、本地路径。
4. 保存服务时校验 coverImage 和 images 是否是 gym-face-bucket/life-assitant 下的固定 OSS URL。
5. 后台列表和详情展示图片时同样使用后端返回的 signedUrl/displayUrl。
```

## 8. 微信小程序域名配置

如果小程序走后端中转上传 + 后端签发 OSS 私有下载 URL：

```txt
request 合法域名：https://xunhaoyou.com
uploadFile 合法域名：https://xunhaoyou.com
downloadFile 合法域名：https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com
```

如果采用后端代理下载方案，则只需要：

```txt
request 合法域名：https://xunhaoyou.com
uploadFile 合法域名：https://xunhaoyou.com
downloadFile 合法域名：https://xunhaoyou.com
```

推荐当前使用“后端中转上传 + 后端签发短期下载 URL”。这样上传鉴权集中在后端，下载不占用后端图片带宽。

如果后续改成小程序直传 OSS：

```txt
1. 后端必须签发临时上传凭证或 policy。
2. uploadFile 合法域名需要增加 https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com 或 OSS 表单上传域名。
3. 小程序端仍不能保存长期 AccessKey。
```

## 9. 历史数据迁移计划

### 9.1 数据扫描

先扫描所有图片字段，找出非 OSS URL：

```sql
SELECT id, avatar_url FROM users
WHERE avatar_url IS NOT NULL
  AND avatar_url != ''
  AND avatar_url NOT LIKE 'https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com/life-assitant/%';

SELECT id, avatar_url FROM staff
WHERE avatar_url IS NOT NULL
  AND avatar_url != ''
  AND avatar_url NOT LIKE 'https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com/life-assitant/%';

SELECT id, cover_image FROM services
WHERE cover_image IS NOT NULL
  AND cover_image != ''
  AND cover_image NOT LIKE 'https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com/life-assitant/%';

SELECT id, url FROM service_images
WHERE url NOT LIKE 'https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com/life-assitant/%';

SELECT id, photo_url FROM service_checkins
WHERE photo_url IS NOT NULL
  AND photo_url != ''
  AND photo_url NOT LIKE 'https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com/life-assitant/%';

SELECT id, url FROM service_photos
WHERE url NOT LIKE 'https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com/life-assitant/%';

SELECT id, url FROM review_images
WHERE url NOT LIKE 'https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com/life-assitant/%';
```

`ticket_messages.images` 是 JSON 字段，建议用迁移脚本解析，不直接手写 SQL 改 JSON。

### 9.2 本地文件映射

对历史 URL 做映射：

```txt
https://xunhaoyou.com/prod-api/upload/files/{filename}
https://xunhaoyou.com/api/upload/files/{filename}
/api/upload/files/{filename}
/prod-api/upload/files/{filename}
```

映射到服务器本地：

```txt
/www/wwwroot/life-assistant/uploads/{filename}
或 Docker 容器挂载的 /app/uploads/{filename}
```

### 9.3 迁移脚本行为

```txt
1. 读取待迁移 URL。
2. 解析 filename。
3. 在 uploads 目录查找源文件。
4. 找到则上传到 gym-face-bucket/life-assitant，拿到固定 OSS URL。
5. 更新原业务字段为 OSS URL。
6. 写迁移日志。
7. 找不到源文件时生成缺失报告，不静默改为空。
```

迁移必须支持 dry-run：

```txt
node scripts/migrate-local-images-to-oss.js --dry-run
node scripts/migrate-local-images-to-oss.js --apply
```

### 9.4 迁移后验证

```sql
SELECT COUNT(*) FROM users
WHERE avatar_url LIKE '%/upload/files/%'
   OR avatar_url LIKE 'http://tmp/%'
   OR avatar_url LIKE 'wxfile://%';

SELECT COUNT(*) FROM staff
WHERE avatar_url LIKE '%/upload/files/%'
   OR avatar_url LIKE 'http://tmp/%'
   OR avatar_url LIKE 'wxfile://%';

SELECT COUNT(*) FROM service_photos
WHERE url LIKE '%/upload/files/%'
   OR url LIKE 'http://tmp/%'
   OR url LIKE 'wxfile://%';
```

所有关键字段应返回 0。

## 10. 包体和静态资源检查

本地检查命令：

```powershell
Get-ChildItem -Recurse -File miniapp\src\static | Select-Object FullName,Length
(Get-ChildItem -Recurse -File miniapp\src\static | Measure-Object -Property Length -Sum).Sum
```

引用检查：

```powershell
rg -n "static/images/avatar.jpg|avatar.jpg|default-avatar|static/app/icons|static/tabbar|logo.svg|copyright.svg" miniapp\src miniapp\manifest.config.ts miniapp\pages.config.ts
```

禁止项检查：

```powershell
rg -n "http://tmp|wxfile://|/upload/files|/api/upload/files|/prod-api/upload/files|tempFilePath" miniapp\src server\src
```

构建后检查：

```powershell
cd miniapp
pnpm type-check
pnpm build:mp
Get-ChildItem -Recurse -File dist\build\mp-weixin | Measure-Object -Property Length -Sum
```

验收标准：

```txt
1. 小程序源码 static 目录只包含白名单资源。
2. dist/build/mp-weixin 包体满足微信上传限制和内部 5 MB 控制线。
3. 业务上传链路不再产生本地 /upload/files URL。
```

## 11. 分阶段执行顺序

### Phase 1：资源审计和白名单

```txt
1. 固化 miniapp/src/static 白名单。
2. 删除未引用的 avatar.jpg、copyright.svg 等非必要资源。
3. 建立包体积检查命令或脚本。
```

### Phase 2：后端 OSS 上传

```txt
1. 新增 StorageModule 和 Aliyun OSS adapter。
2. 改造 UploadService 上传 OSS。
3. POST /api/upload/image 保持兼容，返回固定 OSS URL、storageKey、signedUrl、expiresIn。
4. files 表写上传台账。
5. 新增 assertPermanentOssUrl、extractOssObjectKey、signOssGetUrl。
6. 用户、服务、订单等详情接口为图片字段补充 displayUrl/signedUrl。
7. 保留本地 /api/upload/files 只读兼容。
```

### Phase 3：小程序统一上传

```txt
1. 新增 miniapp/src/utils/uploadImage.ts。
2. 用户头像、师傅头像改用统一上传工具。
3. upload-image-grid 改为选择后立即上传。
4. 师傅订单照片只提交 OSS URL。
```

### Phase 4：后台业务图片统一

```txt
1. 服务封面上传改走统一上传接口。
2. 服务详情图改走统一上传接口。
3. 员工头像、运营图等后台上传统一返回 OSS URL。
4. 后端保存服务/员工资料时校验 URL 域名。
```

### Phase 5：历史数据迁移

```txt
1. dry-run 扫描本地 URL。
2. 上传 uploads 历史文件到 OSS。
3. 更新数据库图片字段。
4. 输出缺失文件和失败记录。
5. 人工抽查用户头像、服务详情、订单详情、师傅履约照片。
```

### Phase 6：下线本地上传目录

```txt
1. 确认数据库无 /upload/files 引用。
2. 删除或禁用 ServeStaticModule 的 /api/upload/files。
3. 部署脚本移除 uploads 挂载。
4. Nginx 不再依赖本地上传目录。
```

## 12. 完成标准

```txt
1. 小程序包内没有用户头像、服务封面、订单照片、评价图片等业务资源。
2. 新上传图片全部落 OSS。
3. 业务表图片字段全部是空值或 gym-face-bucket/life-assitant 下的固定 OSS URL。
4. 前端不提交 tempFilePath、wxfile://、http://tmp、/static/* 作为业务图片。
5. 后端不再生成新的 /api/upload/files URL。
6. 旧 /api/upload/files 数据已迁移或有明确缺失报告。
7. 微信后台已配置 API 域名和 OSS 私有签名下载域名。
8. `pnpm type-check` 通过。
9. `pnpm build:mp` 通过。
10. 体验版验证头像、服务封面、订单照片通过 signedUrl/displayUrl 展示正常。
11. 私有 OSS 固定 URL 裸访问不可匿名读取。
12. 后端生成的 signedUrl 在有效期内可读取图片。
13. signedUrl 过期后不可继续读取，前端刷新详情可重新获取。
14. 数据库中不存在 Expires、Signature、OSSAccessKeyId、x-oss-signature 等签名参数。
15. files.storage_key 全部以 life-assitant/prod/ 开头。
```

## 13. 推荐优先级

优先做：

```txt
1. 后端上传 OSS 化。
2. 用户头像和师傅头像改造。
3. 订单照片 upload-image-grid 改造。
4. 服务封面后台上传改造。
```

随后做：

```txt
1. 历史 uploads 数据迁移。
2. 下线本地上传静态服务。
3. 加 CI 包体和禁止本地图片路径检查。
```

原因：

```txt
只要新上传先全部进入 OSS，就能阻止问题继续扩大；历史数据可以在新链路稳定后单独迁移，降低发布风险。
```
