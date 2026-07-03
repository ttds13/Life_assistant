# 服务稳定业务键与 Admin 数据治理方案

## 重新评估结论

服务主数据不能放在小程序端维护，也不能靠前端常量去“修正”数据库。正确边界是：

- `Service.id` 继续作为数据库内部主键和外键。
- 对外新增稳定业务键 `Service.code`，由后端保证唯一、非空、长期稳定。
- 服务新增、修改、上下架、删除只走后端 `admin` API 写库。
- 小程序只读取 `/services`、`/services/:identifier` 返回的数据，并在详情、价格预览、创建订单时优先使用 `serviceCode`。

## 当前风险分层

1. 必炸链路

旧 `serviceId` 打开服务详情、价格预览、创建订单时，如果服务已删除、下架或 ID 漂移，后端会直接 404。

2. 半稳链路

订单列表和订单详情依赖 `serviceSnapshot` 可以显示历史订单，但再次进入服务详情或重新下单时，如果继续使用不稳定 `serviceId`，仍然会失败。

3. 前端硬编码链路

师傅录单页原先用数组顺序推导 `serviceId = index + 1`，一旦数据库服务顺序变化，不只是“服务不存在”，还可能下到错误服务。分类组件原先把 `category.id` 当作 `service.id` 跳详情，也属于错误业务边界。

## 后端落地

数据库：

- `server/prisma/schema.prisma` 为 `Service` 增加 `code String @unique @db.VarChar(64)`。
- 新迁移 `20260623120000_add_stable_service_code` 对存量服务回填 `svc_<id>`，再设为非空并创建唯一索引。
- 种子数据写入确定性 `code`，避免重复 seed 后服务键漂移。

Admin 写库入口：

- `server/src/admin-business/admin-business.service.ts`
  - `listServices` 返回并支持搜索 `code`。
  - `createService` 未传 `code` 时由后端生成，传入时校验并规范化。
  - `updateService` 支持通过 admin 修改 `code`，并做唯一校验。
  - 审计记录包含服务 `code`，便于追踪主数据变更。
- `admin/src/api/life/index.ts`
  - 服务项目列表展示“服务编码”。
  - 服务表单支持编辑“服务编码”。

业务 API 兼容：

- `/services/:identifier` 同时支持数字 `id` 和稳定 `code`。
- 价格预览、创建订单同时支持 `serviceCode` 和旧 `serviceId`。
- 两者同时传入时，后端校验是否指向同一服务，避免下错单。
- 订单快照写入服务 `code`，展示层返回 `serviceCode`。

## 小程序边界

小程序不写服务主数据，只做消费：

- 服务详情页优先接收 `code`，兼容旧 `id`。
- 下单页优先提交 `serviceCode`，没有 `code` 时才回退 `serviceId`。
- 首页服务卡片只使用后端 `/services` 返回的服务数据，不再把本地默认服务当成可下单服务。
- 分类入口跳搜索页，不再把 `category.id` 当 `service.id`。
- 师傅录单页从后端 `/services` 获取服务列表，提交所选服务的 `serviceCode`，不再使用数组下标推导 ID。

## 镜像与开发工作流

生产镜像仍然应保持不可变：镜像只承载代码和运行时，服务主数据通过 admin 后端 API 写入数据库。

推荐流程：

- 本地开发：直接在 `server` 目录运行 Nest dev server，连接开发数据库，避免每次改代码都重新打镜像。
- 数据变更：通过 Prisma migration 管结构，通过 admin API 管服务主数据。
- 发布：镜像启动前执行 `prisma migrate deploy`，应用只读取已迁移 schema。
- 运营修改：登录 admin 后台修改服务项目、服务编码、价格、上下架状态，由后端 `admin` 接口落库。

这条链路能同时解决两个问题：前端不再依赖易漂移自增 ID，后端镜像也不需要为了改服务主数据频繁重建。
