# Day 33 - 图片上传 OSS 统一链路与 Admin 图片管理计划

## 1. 目标

Day33 目标是把用户端、师傅端、Admin 端所有业务图片统一收口到后端上传服务，由后端统一写入 OSS、生成可展示签名 URL、落库 `File` 记录，并在 Admin 端提供一个可检索、可预览、可审计、可安全管理的图片管理中心。

最终要达到：

1. 所有业务图片都通过后端 `/upload/image` 或 `/upload/image-base64` 上传。
2. 业务表只保存永久 OSS URL，不保存临时签名 URL、本地临时路径、`wxfile://`、`blob:`、`http://tmp`。
3. 前端展示统一使用后端返回的 `displayUrl/signedUrl`，过期后通过重新拉取业务接口刷新。
4. `File` 表能记录所有图片上传记录，并能绑定到业务对象。
5. Admin 图片管理能查看和管理首页轮播、服务封面、服务附图、用户头像、师傅头像、师傅资质、履约照片、售后图片、反馈图片、富文本图片、默认头像等资源。
6. 已被业务引用的图片不能被误删，必须先展示引用位置并阻止危险删除。
7. 本地开发可以 fallback 到本地存储，但生产业务图片必须走 OSS。

## 2. 本次边界

本次做图片基础设施和现有业务接入，不把评价业务从无到有完整做出来。

本次要做：

- 修复小程序多图组件 `bizType` 写死问题。
- 补齐各上传点的 `bizType/bizId/source`。
- 补后端 File 绑定、签名、列表、引用检测、管理接口。
- 补 Admin 图片管理页面。
- 补 Admin 售后回复图片上传。
- 补服务商品附图 `ServiceImage` 的后端和 Admin 管理入口。
- 把默认头像改成后端/OSS 配置优先，静态图只做兜底。
- 回填历史业务图片到 `File` 表。

本次不做：

- 不新增完整评价发布流程。
- 不做图片裁剪、鉴黄、AI 审核。
- 不做 CDN 缓存刷新。
- 不做对象存储跨区域迁移。
- 不允许 Admin 直接删除已被业务引用的 OSS 对象。

## 3. 图片类型规范

新增统一 `bizType` 白名单，上传端和后端都按这套分类传递和展示。

| bizType | 来源 | 业务表/字段 | 说明 |
| --- | --- | --- | --- |
| `user_avatar` | 用户端 | `User.avatarUrl` | 用户头像 |
| `staff_avatar` | 师傅端/Admin | `Staff.avatarUrl` | 师傅头像 |
| `staff_application` | 用户端/师傅端 | `Staff.applicationImages` | 师傅申请、资质、证件材料 |
| `service_finish_photo` | 师傅端 | `ServicePhoto.url` | 服务完成凭证照片 |
| `service_checkin_photo` | 师傅端预留 | `ServiceCheckin.photoUrl` | 打卡照片，当前只纳入规范 |
| `feedback_image` | 用户端 | `Feedback.images` | 问题反馈凭证 |
| `after_sales_image` | 用户端/Admin | `TicketMessage.images` | 售后工单沟通图片 |
| `home_banner` | Admin | `HomeBanner.imageUrl` | 首页轮播图 |
| `service_cover` | Admin | `Service.coverImage` | 服务商品封面 |
| `service_image` | Admin | `ServiceImage.url` | 服务商品详情附图 |
| `admin_avatar` | Admin | Admin 用户资料头像 | 后台账号头像 |
| `rich_text_image` | Admin | 富文本内容 | 系统通知等富文本插图 |
| `review_image` | 预留 | `ReviewImage.url` | 评价图，当前仅纳入类型和图片库引用识别 |
| `system_default_avatar` | 系统/Admin | 配置项或 File | 默认头像 |
| `admin_image` | Admin | 兜底 | 未归类后台图片 |

验收：

- `upload-image-grid` 不再出现固定 `bizType: 'order_photo'`。
- `rg "order_photo" miniapp/src admin/src server/src` 只允许出现在兼容迁移或历史映射里。
- 所有业务上传点都能明确传递 `bizType`。

## 4. 后端第一阶段：File 模型和存储服务升级

### 4.1 扩展 Prisma File 模型

文件：

```text
server/prisma/schema.prisma
```

建议扩展字段：

```text
status          active / deleted / orphaned
source          miniapp_user / miniapp_staff / admin / system / migration
visibility      private / public
alt             图片说明
remark          管理备注
deletedAt
deletedBy
updatedAt
```

保留现有字段：

```text
uploaderType
uploaderId
bizType
bizId
filename
url
storageKey
mimeType
size
createdAt
```

新增索引：

```text
@@index([bizType, bizId])
@@index([status, createdAt])
@@index([uploaderType, uploaderId])
@@index([url])
```

执行步骤：

1. 修改 `schema.prisma`。
2. 新增 migration。
3. 生成 Prisma Client。
4. 保证历史 `File` 记录默认 `status=active`、`source` 可为空或 `legacy`。

验收：

- `prisma migrate dev` 成功。
- `File` 表能区分正常、已删除、孤立图片。
- 旧上传接口不因新增字段报错。

### 4.2 增强 ObjectStorageService

文件：

```text
server/src/storage/storage.service.ts
```

新增/调整方法：

```text
putImage(input)
signUrl(urlOrKey)
signNullableUrl(url)
signUrlList(urls)
assertPermanentImageUrl(url, options)
isManagedPermanentUrl(url)
bindFilesToBiz(urls, bizType, bizId)
findImageReferences(url)
softDeleteFile(fileId, adminContext)
```

执行步骤：

1. 把 `assertPermanentOssUrl` 升级为更清晰的 `assertPermanentImageUrl`。
2. 禁止保存含签名参数的 URL。
3. 禁止保存 `wxfile://`、`blob:`、`http://tmp`、本机临时路径。
4. 生产环境 `STORAGE_PROVIDER=aliyun-oss` 时，强制业务图片必须是配置 OSS 域名。
5. 本地开发允许 `/api/upload/files/...`，但不能在生产放行本地 URL。
6. `bindFilesToBiz` 根据 URL 找到 `File` 记录，补齐 `bizType/bizId/source`。
7. 如果业务保存的是允许目录下的历史 OSS URL，但没有 File 记录，允许由回填脚本补记录，不在正常请求里静默创建。

验收：

- 保存签名 URL 返回 400。
- 保存本地临时路径返回 400。
- 上传后返回永久 `url` 和展示用 `displayUrl/signedUrl`。
- 业务创建后能把已上传图片绑定到具体 `bizId`。

### 4.3 上传服务补 actor 和 bizType 校验

文件：

```text
server/src/upload/upload.service.ts
server/src/upload/upload.controller.ts
server/src/storage/storage.types.ts
```

执行步骤：

1. 建立 `IMAGE_BIZ_TYPES` 常量。
2. 上传接口校验 `bizType` 必须在白名单内，缺省时使用 `admin_image` 或 `image` 兼容旧逻辑。
3. 根据登录上下文识别上传来源：
   - Admin token：`uploaderType=admin`
   - 用户端：`uploaderType=user`
   - 师傅端：如果当前 user 已绑定 staff 且 bizType 属于师傅业务，记录 `source=miniapp_staff`，必要时记录 staffId 到扩展字段或 bizId。
4. 支持 `bizId` 可选，先上传后创建业务对象时允许为空。
5. 上传返回统一结构：

```text
id
uuid
url
displayUrl
signedUrl
storageKey
bizType
bizId
mimeType
size
expiresIn
```

验收：

- 所有上传返回 `url` 是永久 URL。
- Admin 和小程序都能拿 `displayUrl` 预览。
- 无效 `bizType` 返回 400。

## 5. 后端第二阶段：业务保存时绑定 File

### 5.1 用户头像

文件：

```text
server/src/auth/auth.service.ts
server/src/users/users.repository.ts
```

执行步骤：

1. `updateProfile` 保存头像前调用 `assertPermanentImageUrl(..., { force: true })`。
2. 更新 `User.avatarUrl` 后调用 `bindFilesToBiz([avatar], 'user_avatar', userId)`。
3. `formatUser` 返回：
   - `avatarOssUrl`
   - `avatarDisplayUrl`
   - `avatar`

验收：

- 用户头像上传后 `File.bizType=user_avatar`。
- 用户资料接口返回可展示签名头像。

### 5.2 师傅头像和资料图

文件：

```text
server/src/orders/orders.service.ts
server/src/support/support.service.ts
server/src/admin-business/admin-business.service.ts
```

执行步骤：

1. 师傅端更新头像时绑定 `staff_avatar + staffId`。
2. Admin 创建/编辑师傅头像时绑定 `staff_avatar + staffId`。
3. 师傅申请、证件、资质图片统一使用 `staff_application`。
4. `submitStaffApplication` 创建或更新 Staff 后，调用 `bindFilesToBiz(images, 'staff_application', staff.id)`。
5. Admin 展示申请图片时返回签名图和原始 OSS URL。

验收：

- 师傅头像、资质图都能在图片管理中按师傅筛选。
- `Staff.applicationImages` 只保存永久 OSS URL。

### 5.3 服务封面、服务附图、首页轮播

文件：

```text
server/src/admin-business/admin-business.service.ts
server/src/services/services.service.ts
server/src/services/services.repository.ts
```

执行步骤：

1. 服务封面保存时绑定 `service_cover + serviceId`。
2. 首页轮播保存时绑定 `home_banner + bannerId`。
3. 补服务附图管理：
   - Admin 新增/编辑服务时可提交 `images: string[]`。
   - 后端事务内维护 `ServiceImage`。
   - `ServiceImage.url` 保存永久 OSS URL。
   - 保存后绑定 `service_image + serviceId`。
4. 服务接口返回 `images[].urlOss`、`images[].displayUrl`。
5. 小程序服务详情可以展示服务附图；如果暂不设计展示区，至少保证接口字段签名正确。

验收：

- Admin 服务封面上传后能在服务列表和图片库预览。
- 服务附图能新增、排序、删除。
- 首页轮播图能在图片库显示业务引用。

### 5.4 履约照片

文件：

```text
server/src/orders/orders.service.ts
server/src/orders/order-presenter.ts
server/src/orders/orders.repository.ts
```

执行步骤：

1. `staffComplete` 校验 `photoUrls` 全部是永久图片 URL。
2. 写入 `ServicePhoto` 后调用 `bindFilesToBiz(photoUrls, 'service_finish_photo', order.id)`。
3. 订单详情返回：
   - `servicePhotoOssUrls`
   - `servicePhotoUrls/displayUrl`
   - `servicePhotos` 继续兼容前端展示
4. Admin 订单详情使用签名 URL 预览。

验收：

- 师傅完成服务上传 1-6 张照片后，订单详情和 Admin 均可预览。
- 重复刷新不会丢图。
- 图片库能按订单找到履约照片。

### 5.5 反馈和售后图片

文件：

```text
server/src/support/support.service.ts
server/src/after-sales/after-sales.service.ts
server/src/admin-business/admin-business.service.ts
```

执行步骤：

1. 反馈图片保存时绑定 `feedback_image + feedbackId`。
2. 售后创建时，创建 ticket/message 后绑定 `after_sales_image + ticketId`。
3. 用户追加售后消息后绑定 `after_sales_image + ticketId`。
4. Admin 追加售后消息也支持 images，并绑定 `after_sales_image + ticketId`。
5. 废弃或改造 `AdminBusinessService.addTicketMessage` 的纯文本版本，避免和 `AfterSalesService.addAdminMessage` 能力不一致。

验收：

- 用户反馈图在 Admin 反馈详情和图片管理都能看到。
- 用户售后图、Admin 售后回复图都能在工单详情和图片管理中看到。

### 5.6 富文本图片和 Admin 头像

文件：

```text
admin/src/components/WangEditor/index.vue
admin/src/views/profile/index.vue
server/src/upload/upload.service.ts
```

执行步骤：

1. WangEditor 上传时传 `bizType=rich_text_image`。
2. Admin 个人头像上传时传 `bizType=admin_avatar`。
3. 后端保存 File 记录，Admin 图片管理可筛选。
4. 如果 Admin 用户表保存头像，后端保存前也要校验永久 URL。

验收：

- 系统通知富文本图片不再是无分类上传。
- Admin 头像图片能在图片库筛选。

### 5.7 默认头像

文件：

```text
miniapp/src/store/user.ts
miniapp/src/hooks/useProfileEditor.ts
miniapp/src/pages/staff/profile.vue
miniapp/src/pages/staff/settings.vue
server/src/support/support.service.ts 或新增配置服务
```

执行步骤：

1. 增加后端配置项 `DEFAULT_AVATAR_URL`。
2. 提供默认头像展示 URL，可由配置服务返回签名后的 OSS URL。
3. 把当前 `miniapp/src/static/images/default-avatar.png` 作为兜底，不作为主链路。
4. 增加脚本把默认头像上传到 OSS，并写入 File：
   - `bizType=system_default_avatar`
   - `source=system`
5. 用户和师傅资料接口无头像时优先返回默认头像 display URL。

验收：

- 默认头像不依赖小程序 `/static/images/default-avatar.png` 正常加载。
- 静态图 500 时，远端默认头像仍能展示。

## 6. 后端第三阶段：Admin 图片管理 API

### 6.1 新增 Images 模块

建议新增：

```text
server/src/images/images.module.ts
server/src/images/images.controller.ts
server/src/images/images.service.ts
server/src/images/dto/query-images.dto.ts
server/src/images/dto/update-image.dto.ts
```

Admin 路由：

```text
GET    /admin/images
GET    /admin/images/:id
GET    /admin/images/:id/references
PATCH  /admin/images/:id
DELETE /admin/images/:id
POST   /admin/images/:id/rebind
POST   /admin/images/backfill
```

### 6.2 列表能力

`GET /admin/images` 支持筛选：

```text
keyword
bizType
bizId
uploaderType
uploaderId
source
status
dateStart
dateEnd
onlyOrphaned
page
pageSize
```

返回字段：

```text
id
uuid
filename
url
displayUrl
storageKey
bizType
bizId
uploaderType
uploaderId
source
mimeType
size
status
referenceCount
createdAt
updatedAt
```

验收：

- 图片库分页正常。
- 图片预览使用签名 URL。
- 能按 `home_banner/service_cover/service_finish_photo` 等分类筛选。

### 6.3 引用检测

`findImageReferences(url)` 需要扫描：

```text
User.avatarUrl
Staff.avatarUrl
Staff.applicationImages
Service.coverImage
ServiceImage.url
HomeBanner.imageUrl
ServicePhoto.url
ServiceCheckin.photoUrl
ReviewImage.url
TicketMessage.images
Feedback.images
```

返回引用：

```text
type
table
field
recordId
bizNo
title
adminPath
```

验收：

- 首页轮播图能显示引用到哪个 banner。
- 服务封面能显示引用到哪个服务。
- 履约照片能显示引用到哪个订单。
- 售后图片能显示引用到哪个工单。

### 6.4 删除和管理规则

执行规则：

1. `referenceCount > 0` 时禁止删除 OSS 对象。
2. 被引用图片只能更新备注、alt、状态，不允许物理删除。
3. 未引用图片允许软删除。
4. 软删除只更新 `File.status=deleted/deletedAt/deletedBy`，第一版不物理删除 OSS 对象。
5. 所有删除、重绑、备注更新写 Admin 审计日志。

验收：

- 删除被引用图片返回 409，并返回引用列表。
- 删除孤立图片成功后列表标记为 deleted。
- 审计日志能看到操作者、动作、图片 ID。

### 6.5 权限

文件：

```text
server/src/admin-auth/admin-permissions.ts
admin/src/router/life-admin-routes.ts
admin/src/utils/permission 或权限按钮逻辑
```

新增权限：

```text
image:list
image:detail
image:update
image:delete
image:rebind
image:backfill
```

验收：

- 没有 `image:list` 不能访问图片管理列表。
- 没有 `image:delete` 不显示删除按钮，接口也拒绝。

## 7. 小程序端改造步骤

### 7.1 改造 upload-image-grid

文件：

```text
miniapp/src/components/upload-image-grid/upload-image-grid.vue
```

新增 props：

```text
bizType: string
bizId?: number | string
source?: string
maxSizeMb?: number
```

执行步骤：

1. 删除写死的 `bizType: 'order_photo'`。
2. 上传时使用 props：

```text
uploadImage({ filePath, bizType: props.bizType, bizId: props.bizId })
```

3. 如果未传 `bizType`，直接 toast 并拒绝上传，避免再次出现无分类图片。
4. 上传成功后 item 保留：
   - `url` 永久 URL
   - `ossUrl` 永久 URL
   - `displayUrl` 签名展示 URL
   - `fileId/uuid` 如果后端返回
5. 预览使用 `displayUrl || url`。

验收：

- 组件调用方必须传 `bizType`。
- 失败图片不会进入最终提交 payload。

### 7.2 替换所有小程序上传点

逐个修改：

```text
miniapp/src/pages/staff/upload-photos.vue
  bizType=service_finish_photo
  bizId=orderId/taskId

miniapp/src/pages/staff/order-detail.vue
  只读展示，不上传；确认 displayUrl 优先

miniapp/src/pages/profile/apply-staff.vue
  bizType=staff_application

miniapp/src/pages/staff/certificates.vue
  bizType=staff_application

miniapp/src/pages/profile/feedback.vue
  bizType=feedback_image

miniapp/src/pages/order/after-sales-create.vue
  bizType=after_sales_image
  bizId=orderId 可先传 orderId，后端创建 ticket 后重绑到 ticketId

miniapp/src/pages/order/after-sales-detail.vue
  bizType=after_sales_image
  bizId=ticketId
```

头像单独处理：

```text
miniapp/src/hooks/useProfileEditor.ts
  bizType=user_avatar

miniapp/src/pages/staff/settings.vue
  bizType=staff_avatar
```

验收：

- 每个上传点生成的 File 记录 bizType 正确。
- 资质图不再归到订单照片。
- 售后图、反馈图、履约图能按分类筛选。

### 7.3 修复小程序加载链路

执行步骤：

1. 所有页面展示远端图片时优先使用 `displayUrl` 字段：
   - `imageDisplayUrl || imageUrl`
   - `coverImageDisplayUrl || coverImage`
   - `avatarDisplayUrl || avatar`
   - `displayUrl || url`
2. 业务提交时只提交 `ossUrl || url`，不得提交 `displayUrl`。
3. 对头像、订单照片、售后图增加 `@error` 降级：
   - 头像降级到后端默认头像或本地静态兜底。
   - 业务图加载失败展示占位，不把失败 URL 写回业务数据。
4. 如果图片签名过期，页面重新拉取业务详情刷新签名 URL。

验收：

- 首页轮播、服务封面、订单凭证、售后图片、头像均能展示。
- 签名 URL 过期后重新进入页面能恢复。

## 8. Admin 端改造步骤

### 8.1 上传组件增强

文件：

```text
admin/src/components/Upload/SingleImageUpload.vue
admin/src/components/Upload/MultiImageUpload.vue
admin/src/api/file/index.ts
```

执行步骤：

1. 上传组件必须透传 `data.bizType/bizId/source`。
2. 上传成功后 modelValue 只保存永久 `fileInfo.url`。
3. 预览使用 `fileInfo.displayUrl || fileInfo.signedUrl || fileInfo.url`。
4. `MultiImageUpload` 支持外部传入 `displayUrlMap` 或后端返回 `displayUrls`。
5. 删除按钮只从当前表单移除，不直接删 OSS 文件。

验收：

- Admin 新上传图片保存永久 URL。
- 刷新页面后通过业务接口返回的 displayUrl 可继续预览。

### 8.2 资源管理页接入

文件：

```text
admin/src/views/life/resource/index.vue
admin/src/api/life/index.ts
```

执行步骤：

1. 服务列表 columns 增加 `coverImage` 图片列。
2. 服务表单保留 `coverImage` 单图上传，`bizType=service_cover`。
3. 服务表单新增服务附图 `images`，使用 `MultiImageUpload`，`bizType=service_image`。
4. 首页轮播继续使用 `bizType=home_banner`。
5. 师傅头像继续使用 `bizType=staff_avatar`。
6. 表格预览统一走 `tableImageUrl`。

验收：

- 服务列表能看到封面预览。
- 服务编辑能上传多张服务附图。
- 首页轮播、服务封面、师傅头像都能在图片库看到。

### 8.3 Admin 售后回复支持图片

文件：

```text
admin/src/views/life/audit/index.vue
admin/src/api/life/index.ts
server/src/after-sales/after-sales.controller.ts
server/src/after-sales/after-sales.service.ts
```

执行步骤：

1. 审核中心售后工单回复区增加 `MultiImageUpload`。
2. 上传参数：

```text
bizType=after_sales_image
bizId=ticketId
```

3. `replyAfterSalesTicket` 提交 `{ content, images }`。
4. 回复成功后清空文本和图片。
5. 工单消息列表继续用 `el-image` 预览。

验收：

- Admin 能带图片回复售后工单。
- 用户端售后详情能看到 Admin 回复图片。
- 图片库能按 `after_sales_image` 看到 Admin 上传图。

### 8.4 新增图片管理页面

文件建议：

```text
admin/src/views/life/images/index.vue
admin/src/api/images/index.ts
admin/src/api/images/types.ts
admin/src/router/life-admin-routes.ts
```

页面能力：

1. 筛选区：
   - 关键词
   - 图片类型
   - 上传来源
   - 上传人类型
   - 业务 ID
   - 状态
   - 日期范围
   - 仅孤立图片
2. 表格列：
   - 预览图
   - 文件名
   - 图片类型
   - 业务 ID
   - 引用数量
   - 上传人
   - 大小
   - MIME
   - 状态
   - 上传时间
3. 操作：
   - 查看详情
   - 查看引用
   - 复制永久 URL
   - 刷新预览 URL
   - 编辑备注/alt
   - 删除孤立图片
4. 详情弹窗：
   - 大图预览
   - OSS URL
   - storageKey
   - File 元数据
   - 业务引用列表
   - 审计记录入口

验收：

- `/images/files` 或 `/images/library` 可进入图片管理。
- 能看到所有新上传图片。
- 被引用图片删除按钮禁用或接口返回 409。

## 9. 历史数据回填

### 9.1 新增回填脚本

建议新增：

```text
server/scripts/backfill-image-files.ts
```

扫描来源：

```text
User.avatarUrl -> user_avatar
Staff.avatarUrl -> staff_avatar
Staff.applicationImages -> staff_application
Service.coverImage -> service_cover
ServiceImage.url -> service_image
HomeBanner.imageUrl -> home_banner
ServicePhoto.url -> service_finish_photo
ServiceCheckin.photoUrl -> service_checkin_photo
ReviewImage.url -> review_image
TicketMessage.images -> after_sales_image
Feedback.images -> feedback_image
默认头像配置 -> system_default_avatar
```

执行步骤：

1. 遍历业务表收集 URL。
2. 跳过空值、临时路径、无法识别的外部 URL。
3. 对允许 OSS 域名内的 URL 创建缺失 `File` 记录。
4. 已存在相同 URL 的 File 只补 `bizType/bizId/source`。
5. 输出回填报告：
   - 新增数量
   - 更新数量
   - 跳过数量
   - 非法 URL 列表

验收：

- 运行脚本后，历史首页轮播、服务封面、反馈图、售后图等能出现在图片库。
- 非法或外部 URL 不静默接入业务图片库。

### 9.2 历史 `order_photo` 兼容

执行步骤：

1. 如果历史 File 里存在 `bizType=order_photo`，按引用表重算真实类型。
2. 被 `ServicePhoto.url` 引用的改为 `service_finish_photo`。
3. 被 `TicketMessage.images` 引用的改为 `after_sales_image`。
4. 被 `Feedback.images` 引用的改为 `feedback_image`。
5. 无引用的标记 `orphaned`，保留不删。

验收：

- 图片库中 `order_photo` 数量降到 0 或仅保留历史兼容。

## 10. 测试计划

### 10.1 后端测试

重点用例：

1. 上传合法 jpeg/png/webp，返回永久 URL 和签名展示 URL。
2. 上传超过 5MB 返回 400。
3. 上传非法 MIME 返回 400。
4. 无效 `bizType` 返回 400。
5. 保存签名 URL 到业务表返回 400。
6. 保存 `wxfile://`、`blob:`、`http://tmp` 返回 400。
7. `bindFilesToBiz` 能把无 bizId 的上传记录绑定到业务 ID。
8. 图片列表支持 bizType、状态、日期筛选。
9. 被引用图片删除返回 409。
10. 孤立图片软删除成功。

### 10.2 小程序联调

逐项验证：

1. 用户头像上传、刷新、重新登录后可展示。
2. 师傅头像上传、师傅个人中心和设置页可展示。
3. 师傅申请资质图上传，Admin 能查看。
4. 师傅证件材料上传，Admin 图片库能按 `staff_application` 查到。
5. 师傅完成服务上传 1-6 张照片，订单详情和 Admin 订单详情可展示。
6. 用户反馈上传图片，Admin 反馈详情和图片库可展示。
7. 用户创建售后上传图片，Admin 审核中心和图片库可展示。
8. 用户追加售后图片，Admin 和用户端都可展示。
9. 默认头像不再触发 `/static/images/default-avatar.png` 500 主链路问题。

### 10.3 Admin 联调

逐项验证：

1. 首页轮播上传、保存、表格预览、小程序首页展示。
2. 服务封面上传、保存、服务列表预览、小程序服务页展示。
3. 服务附图上传、保存、接口返回签名 URL。
4. 师傅头像 Admin 上传后师傅端可展示。
5. Admin 个人头像上传后顶部头像和个人资料可展示。
6. WangEditor 上传图片后内容中可展示。
7. Admin 售后回复带图片，用户端可看到。
8. 图片管理能筛选、预览、查看引用、复制 URL。
9. 删除已引用图片被阻止。
10. 删除孤立图片写审计日志。

### 10.4 构建和静态资源验证

必须执行：

```text
server: npm run build
admin: npm run build
miniapp: npm run build:mp-weixin 或当前项目对应构建命令
```

额外检查：

```text
rg "bizType: 'order_photo'|bizType: \"order_photo\"" miniapp/src admin/src server/src
rg "wxfile://|http://tmp|blob:" server/src miniapp/src admin/src
rg "/static/images/default-avatar.png" miniapp/src
```

验收：

- 构建通过。
- 不再有写死 `order_photo`。
- 后端不会保存临时图片路径。

## 11. 执行顺序

严格按下面顺序实施：

1. 后端新增 `bizType` 白名单、File 字段、存储服务方法。
2. 后端上传接口返回统一 File 信息。
3. 后端业务服务保存图片时绑定 File。
4. 新增 Admin 图片管理 API。
5. 新增历史回填脚本。
6. 改小程序 `upload-image-grid`，补齐所有调用点 `bizType/bizId`。
7. 改 Admin 上传组件和资源管理页。
8. 新增 Admin 图片管理页面。
9. 补 Admin 售后回复图片上传。
10. 上传默认头像到 OSS，并接入默认头像配置。
11. 跑回填脚本。
12. 跑后端、Admin、小程序构建。
13. 按测试清单逐项验收。

## 12. 完成标准

Day33 完成后，必须满足：

- [ ] 用户端、师傅端、Admin 端所有业务图片都从后端上传。
- [ ] 生产环境业务图片统一保存 OSS 永久 URL。
- [ ] 所有页面展示使用后端签名 URL 或 display URL。
- [ ] File 表能记录并绑定图片到业务对象。
- [ ] Admin 图片管理能看到所有新上传和回填图片。
- [ ] Admin 可以查看图片引用，不能误删已引用图片。
- [ ] 首页轮播、服务封面、师傅头像、用户头像、履约照片、售后图片、反馈图片全部跑通。
- [ ] `upload-image-grid` 不再写死 `order_photo`。
- [ ] 默认头像不再依赖小程序静态资源作为主链路。
- [ ] 后端、Admin、小程序构建通过。
