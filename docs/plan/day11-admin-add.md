# Day 11 Admin 增删改操作完善计划

## 1. 目标

当前 admin 已经可以连接真实后端数据库，并能读取、部分修改真实业务数据。下一步需要把后台管理系统从“列表查看 + 状态切换”升级为真正的管理后台：

```txt
用户管理：管理员可以查看、修改、删除用户
服务管理：管理员可以新增、编辑、删除服务分类和服务项目
师傅管理：管理员可以新增、编辑、删除师傅
```

本计划只补 admin 管理能力，不修改订单状态机，不改用户端/师傅端既有业务流转。

## 2. 核心原则

```txt
真实业务数据默认软删除，不做物理删除
所有写操作必须经过管理员 token
所有新增、编辑、删除必须写 AuditLog
删除前必须做关联数据检查
已产生订单、支付、履约、评价的数据不能被真实清除
前端操作栏清晰区分：查看 / 编辑 / 删除 / 启用停用
```

删除策略：

```txt
User:
  使用 users.deletedAt 软删除，同时 status 置为 disabled。

Staff:
  使用 staff.deletedAt 软删除，同时 status 置为 disabled。
  如果师傅存在进行中订单，不允许删除。

Service:
  使用 services.deletedAt 软删除，同时 status 置为 disabled。
  历史订单继续依赖 order.serviceSnapshot，不受影响。

ServiceCategory:
  当前 schema 没有 deletedAt。
  第一版建议：如果分类下还有未删除服务，禁止删除；如果无服务，可物理删除。
  更稳妥版本：给 service_categories 增加 deletedAt 字段，再做软删除。
```

## 3. 当前差距

当前已经具备：

```txt
GET /api/admin/users
PUT /api/admin/users/:id/status

GET  /api/admin/service-categories
POST /api/admin/service-categories
PUT  /api/admin/service-categories/:id
PUT  /api/admin/service-categories/:id/status

GET  /api/admin/services
POST /api/admin/services
PUT  /api/admin/services/:id
PUT  /api/admin/services/:id/status

GET  /api/admin/staff
POST /api/admin/staff
PUT  /api/admin/staff/:id
PUT  /api/admin/staff/:id/status
```

仍需补齐：

```txt
用户编辑接口
用户删除接口
服务分类删除接口
服务项目删除接口
师傅删除接口
前端操作栏删除按钮
前端用户编辑表单
删除确认弹窗和危险操作提示
```

## 4. 后端接口计划

### 4.1 用户管理

新增接口：

```txt
PUT    /api/admin/users/:id
DELETE /api/admin/users/:id
```

用户编辑允许字段：

```txt
nickname
phone
gender
cityCode
status
```

用户编辑禁止字段：

```txt
openid
unionid
uuid
createdAt
deletedAt
```

删除逻辑：

```txt
1. 查询用户是否存在且 deletedAt 为空
2. 如果不存在，返回 404
3. 软删除：deletedAt = now，status = 0
4. 写 AuditLog：user:delete
5. 返回删除后的基础信息
```

注意：

```txt
用户有历史订单时仍允许软删除
软删除用户不应再出现在 admin 用户列表
历史订单详情仍可通过 order.user 或 order snapshot 展示必要信息
```

### 4.2 服务分类管理

新增接口：

```txt
DELETE /api/admin/service-categories/:id
```

第一版删除策略：

```txt
如果分类下存在未删除服务：
  不允许删除，提示“分类下仍有服务项目，请先删除或迁移服务”

如果分类下不存在服务：
  可以物理删除 service_categories 记录
  写 AuditLog：service-category:delete
```

可选增强：

```txt
给 service_categories 增加 deletedAt 字段
列表过滤 deletedAt = null
删除时改为软删除
```

建议优先级：

```txt
如果当前阶段不想改 schema，先采用“有关联则禁止删除，无关联才物理删除”。
如果要按生产标准继续完善，增加 deletedAt 更合理。
```

### 4.3 服务项目管理

新增接口：

```txt
DELETE /api/admin/services/:id
```

删除逻辑：

```txt
1. 查询服务是否存在且 deletedAt 为空
2. 软删除：deletedAt = now，status = 0
3. 写 AuditLog：service:delete
4. 小程序公共服务列表不再返回该服务
5. admin 服务列表不再返回该服务
```

关联规则：

```txt
服务已有订单时仍允许软删除
历史订单依赖 serviceSnapshot，不直接依赖服务实时展示字段
不能物理删除 services，避免破坏 orders、reviews、favorites 等关联
```

### 4.4 师傅管理

新增接口：

```txt
DELETE /api/admin/staff/:id
```

删除前校验：

```txt
如果师傅存在进行中订单，不允许删除。

进行中订单状态包括：
pending_dispatch 之后且未 completed/cancelled/refunded 的状态
例如 dispatched、accepted、on_the_way、in_service、pending_confirm、after_sales
```

删除逻辑：

```txt
1. 查询师傅是否存在且 deletedAt 为空
2. 检查是否存在进行中订单
3. 如果存在，返回 409
4. 软删除：deletedAt = now，status = 0，workStatus = 0
5. 写 AuditLog：staff:delete
6. 派单候选接口不再返回该师傅
```

注意：

```txt
师傅有历史订单、收入记录、评价时不能物理删除
历史订单详情仍需要能展示师傅历史信息
```

## 5. 前端页面计划

### 5.1 通用资源页操作栏

当前通用资源页操作栏需要升级为：

```txt
查看
编辑
删除
启用/停用
```

展示规则：

```txt
users:
  查看 / 编辑 / 删除 / 启用停用

serviceCategories:
  查看 / 编辑 / 删除 / 启用停用

services:
  查看 / 编辑 / 删除 / 启用停用

staff:
  查看 / 编辑 / 删除 / 启用停用

addresses / fulfillments / payments / reviews / staffStatus:
  保持查看为主，不默认开放删除
```

删除按钮样式：

```txt
type="danger"
link
二次确认弹窗
确认文案必须包含业务对象名称
```

示例确认文案：

```txt
确认删除用户「张三」吗？删除后该用户不能继续登录，但历史订单不会被清除。
确认删除服务「日常保洁」吗？删除后小程序将不再展示该服务。
确认删除师傅「李师傅」吗？如果存在进行中订单，系统会拒绝删除。
```

### 5.2 用户编辑表单

给 users 模块补充 `editable` 和 `formItems`：

```txt
nickname
phone
gender
cityCode
status
```

前端提交：

```txt
PUT /api/admin/users/:id
```

### 5.3 删除 API 封装

在 `admin/src/api/life/index.ts` 中新增：

```ts
deleteResource(module, id)
```

模块路径映射：

```txt
users -> /api/admin/users/:id
serviceCategories -> /api/admin/service-categories/:id
services -> /api/admin/services/:id
staff -> /api/admin/staff/:id
```

不支持删除的模块直接在前端隐藏删除按钮。

### 5.4 页面刷新规则

```txt
新增成功：关闭弹窗，刷新当前页
编辑成功：关闭弹窗，刷新当前页
删除成功：刷新当前页
如果当前页删除后为空，页码回退一页再刷新
后端返回 409 时，前端展示具体原因
```

## 6. 审计日志计划

所有操作必须写入 `audit_logs`：

```txt
user:update
user:delete

service-category:update
service-category:delete

service:update
service:delete

staff:update
staff:delete
```

审计 detail 建议包含：

```txt
before
after
deleteReason 可选
blockedReason 可选
```

示例：

```json
{
  "before": { "status": 1, "nickname": "张三" },
  "after": { "status": 0, "deletedAt": "2026-05-29T..." }
}
```

## 7. 实施顺序

### 第一阶段：后端删除能力

```txt
1. 增加 DELETE /api/admin/users/:id
2. 增加 DELETE /api/admin/services/:id
3. 增加 DELETE /api/admin/staff/:id
4. 增加 DELETE /api/admin/service-categories/:id
5. 每个删除接口写 AuditLog
6. 增加关联校验和 409 错误
```

### 第二阶段：后端用户编辑

```txt
1. 增加 PUT /api/admin/users/:id
2. 限制可编辑字段
3. 写 AuditLog
4. 列表返回最新用户字段
```

### 第三阶段：前端资源页操作栏

```txt
1. LifeResourceConfig 增加 deletable
2. users/services/serviceCategories/staff 开启 deletable
3. 操作栏加入删除按钮
4. 删除前二次确认
5. 删除后刷新列表
```

### 第四阶段：前端用户编辑表单

```txt
1. users 模块开启 editable
2. 补充用户 formItems
3. 调用 PUT /api/admin/users/:id
4. 验证用户修改后真实数据库同步
```

### 第五阶段：联调与审核

```txt
1. 管理员登录后逐项测试增删改
2. 检查真实数据库 deletedAt/status 是否更新
3. 检查小程序服务列表是否不再显示已删除服务
4. 检查派单候选是否不再显示已删除师傅
5. 检查 audit_logs 是否记录操作
```

## 8. 验收清单

后端：

```txt
npm run build 通过
npm run test:contract 通过
DELETE 接口必须经过 AdminAuthGuard
删除用户/服务/师傅为软删除
删除服务分类有关联时返回 409
删除师傅有进行中订单时返回 409
所有写操作写 AuditLog
```

前端：

```txt
pnpm exec vue-tsc --noEmit 通过
pnpm run build-only 通过
用户管理操作栏出现编辑、删除
服务分类操作栏出现编辑、删除
服务项目操作栏出现编辑、删除
师傅管理操作栏出现新增、编辑、删除
删除操作有二次确认
删除成功后列表消失
删除失败时展示后端错误原因
```

业务：

```txt
已删除用户不能继续作为正常用户管理
已删除服务不出现在小程序服务列表
已删除师傅不出现在派单候选列表
历史订单仍可查看，不因删除用户/服务/师傅而报错
```

## 9. 风险与注意事项

```txt
不要物理删除 users、staff、services
不要级联删除 orders、payments、reviews、tickets
不要为了删除服务而修改订单 serviceSnapshot
不要为了删除师傅而清空历史订单 staffId
不要让前端直接提交 deletedAt
不要让普通状态切换按钮代替删除按钮
```

本次改造完成后，admin 的用户、服务、师傅三个核心主数据模块才算具备完整的后台管理能力。

