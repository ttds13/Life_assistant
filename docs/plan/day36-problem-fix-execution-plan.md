# Day36 问题整改实施计划：按步骤落地 Day35 反馈项

更新时间：2026-07-08  
来源：`docs/plan/day35-problem-audit-and-rectification.md`  
目标：把 Day35 已固定的问题转成可直接执行的开发步骤、验证步骤和交付标准。

## 1. 执行目标

Day36 不是重新定义需求，而是进入整改执行。

本次按以下顺序落地：

1. 派单通知和外来订单派单闭环：`D35-02`、`D35-04`
2. 提现点击反馈和确认收款提示：`D35-06`
3. Admin 新增客户和客户地址：`D35-03`
4. 消费积分可见性和积分流水：`D35-01`
5. 地址定位失败兜底和提示：`D35-07`

观察项 `D35-05 扫码直接注册不需要验证码` 当前保持现状，不纳入 Day36 开发。

## 2. 执行总原则

1. 先后端基础，再 Admin，再小程序。
2. 先保证主链路可用，再补体验提示。
3. 每个批次必须可独立验证，不能只完成页面不通接口。
4. 所有后台关键操作必须写审计日志。
5. 所有用户点击动作必须有 loading、成功反馈或失败原因。
6. 涉及迁移的改动必须先跑 Prisma 校验，再接业务代码。

## 3. 执行前准备

### 3.1 工作区确认

执行前先记录当前改动状态：

```bash
git status --short
```

只确认，不回滚用户已有改动。

### 3.2 基线搜索

```bash
rg -n "assignOrder|autoAssignOrder|OrderAssignment|Notification" server/src server/prisma/schema.prisma
rg -n "withdraw|requestMerchantTransfer|提现" miniapp/src server/src admin/src
rg -n "points|积分|user/points" miniapp/src server/src
rg -n "chooseLocation|getLocation|reverseGeocode|定位当前地址" miniapp/src server/src
```

### 3.3 数据库安全

如果连接的是生产或准生产数据库，先备份再执行迁移。

本地开发数据库可以直接新增 migration，但必须保留迁移文件。

## 4. 批次 1：后端基础迁移

### 4.1 目标

补齐 Day36 需要的最小数据库能力：

1. 派单通知能和派单记录关联。
2. 后台新增客户能标记来源和备注。
3. 积分能从实时聚合升级为可追溯流水。

### 4.2 修改文件

```text
server/prisma/schema.prisma
server/prisma/migrations/20260708xxxxxx_day36_problem_fix/migration.sql
```

### 4.3 具体步骤

1. 扩展 `User`：

```text
source       String? @default("miniapp") @db.VarChar(16)
adminRemark  String? @map("admin_remark") @db.VarChar(512)
```

用途：

- `source=miniapp`：小程序用户
- `source=admin`：后台录入客户
- `source=phone/offline`：电话或线下客户

2. 扩展 `OrderAssignment`：

```text
notificationId     BigInt? @map("notification_id")
notificationStatus String? @map("notification_status") @db.VarChar(16)
```

状态建议：

```text
created
sent
failed
skipped
```

3. 新增 `PointLedger`：

```text
model PointLedger {
  id           BigInt   @id @default(autoincrement())
  userId       BigInt   @map("user_id")
  orderId      BigInt?  @map("order_id")
  type         String   @db.VarChar(24)
  points       Int
  amount       Decimal? @db.Decimal(10, 2)
  balanceAfter Int      @map("balance_after")
  remark       String?  @db.VarChar(256)
  createdAt    DateTime @default(now()) @map("created_at")

  user  User   @relation(fields: [userId], references: [id])
  order Order? @relation(fields: [orderId], references: [id])

  @@index([userId, createdAt])
  @@index([orderId])
  @@map("point_ledgers")
}
```

同步给 `User` 和 `Order` 增加 relation：

```text
pointLedgers PointLedger[]
```

4. 生成迁移。

```bash
cd server
npx prisma migrate dev --name day36_problem_fix
npx prisma generate
```

### 4.4 验收

```bash
cd server
npx prisma validate
npm run build
```

完成标准：

1. Prisma 校验通过。
2. 后端构建通过。
3. migration 中只包含 Day36 相关字段和表。

## 5. 批次 2：派单通知闭环

### 5.1 目标

后台派单成功后，师傅端必须能看到新任务提醒；微信订阅消息失败时，站内通知仍然可用。

### 5.2 修改文件

```text
server/src/notifications/notifications.module.ts
server/src/notifications/notifications.service.ts
server/src/notifications/notifications.controller.ts
server/src/orders/orders.module.ts
server/src/orders/orders.service.ts
server/src/app.module.ts
miniapp/src/api/staff.ts
miniapp/src/api/types/staff.ts
miniapp/src/pages/staff/home.vue
miniapp/src/pages/staff/orders.vue
miniapp/src/pages/staff/notifications.vue
admin/src/views/life/orders/detail.vue
```

### 5.3 后端步骤

1. 新增 `NotificationsModule`。
2. 新增 `NotificationsService.createOrderAssignedNotification()`。
3. 新增师傅端接口：

```text
GET  /staff/notifications
GET  /staff/notifications/unread-count
POST /staff/notifications/:id/read
POST /staff/notifications/read-by-order/:orderId
```

4. 在 `OrdersService.assignOrder()` 的事务中创建通知。
5. 在 `OrdersService.autoAssignOrderBySystem()` 中也创建通知。
6. 更新 `OrderAssignment.notificationId` 和 `notificationStatus`。
7. 微信订阅消息暂按可选能力处理：

```text
如果模板配置存在 -> 尝试发送 -> 成功 sent / 失败 failed
如果模板配置不存在 -> skipped，但站内通知必须 created
```

### 5.4 小程序步骤

1. `staff.ts` 增加通知 API。
2. 师傅首页加载未读数。
3. 师傅订单列表进入时拉取未读数。
4. `notifications.vue` 改为真实通知列表，不再只展示本地偏好。
5. 点击通知跳转订单详情，并标记已读。

### 5.5 Admin 步骤

1. 订单详情派单记录中展示通知状态。
2. 派单成功 toast 改为：

```text
派单成功，已生成师傅通知
```

如果微信订阅失败：

```text
派单成功，站内通知已生成，微信订阅消息发送失败
```

### 5.6 验收

手工链路：

1. 创建 `pending_dispatch` 订单。
2. Admin 派单给 active 师傅。
3. 师傅首页出现未读提醒。
4. 师傅消息页出现“新的派单任务”。
5. 点击通知进入订单详情。
6. 通知变为已读。

查询验证：

```bash
rg -n "order_assigned|notifications|unread-count|read-by-order" server/src miniapp/src admin/src
```

## 6. 批次 3：外来订单派单诊断和后台代客建单

### 6.1 目标

外来订单不能再出现“后台派师傅不正常但不知道原因”。后台必须能：

1. 诊断订单是否可派单。
2. 明确显示阻断原因。
3. 新建一个可直接派单的外来订单。

### 6.2 修改文件

```text
server/src/orders/dto/admin-create-order.dto.ts
server/src/orders/orders.controller.ts
server/src/orders/orders.service.ts
server/src/orders/order-presenter.ts
server/src/orders/orders.repository.ts
admin/src/api/life/index.ts
admin/src/api/life/types.ts
admin/src/views/life/orders/index.vue
admin/src/views/life/orders/detail.vue
```

### 6.3 后端步骤

1. 新增派单检查接口：

```text
GET /api/admin/orders/:id/dispatch-check
```

返回结构：

```text
canAssign: boolean
blockingReasons: string[]
warnings: string[]
requiredFields: string[]
```

2. 检查规则：

```text
orderType 必须是 service_booking / consultation
status 必须是 pending_dispatch
必须有 userId
必须有 serviceSnapshot
必须有 addressSnapshot
必须有 appointmentStartTime / appointmentEndTime
必须有可用 staff 选项
```

3. `assignOrder()` 调用同一套检查规则。检查失败直接 409，并返回原因。

4. 新增后台代客建单接口：

```text
POST /api/admin/orders
```

输入最小字段：

```text
userId 或 customer
serviceId
addressId 或 address
appointmentStartTime
appointmentEndTime
source: admin / phone / offline / promotion
remark
adminRemark
```

5. 建单规则：

- 使用真实服务生成 `serviceSnapshot`。
- 使用真实地址或入参地址生成 `addressSnapshot`。
- `status=pending_dispatch`。
- `orderType=service_booking`。
- `source` 保留外来来源。
- 写入 `OrderStatusLog` 和 Admin 审计日志。

### 6.4 Admin 步骤

1. 订单列表增加“新增外来订单”按钮。
2. 表单支持选择客户、服务、地址、预约时间、来源和备注。
3. 派单按钮点击前调用 `dispatch-check`。
4. 不可派单时弹出阻断原因列表。
5. 可派单时打开选择师傅弹窗。

### 6.5 验收

1. 缺地址订单点击派单，显示“缺少服务地址，不能派单”。
2. `pending_payment` 订单点击派单，显示“订单还未进入待派单”。
3. Admin 新建外来订单后状态为 `pending_dispatch`。
4. 新建外来订单可以派单给师傅。
5. 师傅端能看到并接单。

## 7. 批次 4：提现点击反馈修复

### 7.1 目标

解决“提现那个点了没反应”。所有提现动作必须有反馈。

### 7.2 修改文件

```text
miniapp/src/pages/staff/settlement.vue
miniapp/src/pages/staff/withdraw-create.vue
miniapp/src/pages/staff/withdraw-detail.vue
miniapp/src/utils/wechatTransfer.ts
miniapp/src/api/staff.ts
server/src/withdrawals/withdrawals.service.ts
server/src/withdrawals/withdrawals.controller.ts
admin/src/views/life/finance/withdraws.vue
```

### 7.3 小程序步骤

1. `settlement.vue` 增加 `withdrawBlockReason`。
2. “申请提现”按钮不要只靠 disabled。点击后根据原因提示：

```text
未绑定微信身份
可提现余额不足
已有处理中提现单
师傅状态不可提现
```

3. `withdraw-create.vue` 提交时显示 loading。
4. 提交失败展示后端 message。
5. 提交成功跳转 `withdraw-detail`。
6. `withdraw-detail.vue` 对 `wait_user_confirm` 展示确认收款按钮。
7. `wechatTransfer.ts` 检查 `wx.requestMerchantTransfer` 是否存在。
8. 不支持时提示：

```text
当前微信版本不支持确认收款，请升级微信或联系客服
```

### 7.4 后端步骤

1. `confirm-package` 对非 `wait_user_confirm` 状态返回明确 409。
2. 无 `packageInfo` 时返回明确错误。
3. 申请提现失败原因使用中文业务 message。
4. 保持 Day32 状态机不变。

### 7.5 Admin 步骤

1. 审核、打款、重试、查单、撤销按钮增加独立 loading。
2. 操作成功刷新列表和详情。
3. 操作失败展示后端 message。
4. 页面展示当前提现渠道：

```text
mock / wechat
```

### 7.6 验收

1. 无余额点击提现，有明确 toast。
2. 有处理中提现单点击提现，跳转或提示当前单。
3. 提现提交中按钮有 loading。
4. 确认收款不可用时有明确提示。
5. Admin 所有提现操作成功或失败都有反馈。

## 8. 批次 5：Admin 新增客户和地址

### 8.1 目标

会员/客服可以在后台直接新增客户信息，并录入默认服务地址，为外来订单建单和派单服务。

### 8.2 修改文件

```text
server/src/admin-business/admin-business.controller.ts
server/src/admin-business/admin-business.service.ts
server/src/admin-business/dto/admin-business.dto.ts
admin/src/api/life/index.ts
admin/src/api/life/types.ts
admin/src/views/life/resource/index.vue
```

### 8.3 后端步骤

1. 新增接口：

```text
POST /api/admin/users
```

2. 新增 DTO：

```text
nickname
phone
gender
cityCode
adminRemark
source
address?
```

3. 手机号处理：

- 没有手机号：拒绝创建。
- 手机号已存在且未删除：返回 409，并带 existingUserId。
- 手机号不存在：创建用户。

4. 地址处理：

- 如果传入 address，则创建 `ownerType=user`、`addressType=service` 地址。
- 如果 `isDefault=true`，取消该用户其他默认服务地址。

5. 审计日志：

```text
action=user:create
module=user
targetType=user
```

### 8.4 Admin 步骤

1. 用户列表增加“新增客户”按钮。
2. 弹窗表单包含客户信息和服务地址。
3. 创建成功后刷新用户列表。
4. 重复手机号时提示“客户已存在”，允许打开已有客户详情。

### 8.5 验收

1. 后台能创建客户。
2. 创建客户时可同步创建默认服务地址。
3. 用户列表能搜索到新客户。
4. 客户详情能看到地址。
5. 重复手机号不会创建重复客户。

## 9. 批次 6：积分可见性和积分流水

### 9.1 目标

用户能清楚看到消费积分，并能追溯积分来源。

### 9.2 修改文件

```text
server/src/users/users.service.ts
server/src/users/users.controller.ts
server/src/payments/payments.service.ts
server/src/orders/orders.service.ts
server/scripts/backfill-point-ledgers.ts
miniapp/src/api/points.ts
miniapp/src/api/types/points.ts
miniapp/src/pages/points/index.vue
miniapp/src/pages/profile/index.vue
miniapp/src/pages/order/detail.vue
miniapp/src/pages/payment/result.vue
miniapp/pages.config.ts
```

### 9.3 后端步骤

1. 新增积分计算常量：

```text
每实际支付 0.1 元积 1 分，0.01 元不计入积分
```

2. 新增积分流水写入方法：

```text
ensureEarnedPointsForOrder(orderId)
```

规则：

- 只处理 `paidAt != null` 的订单。
- `member_card_purchase` 不重复计入服务履约积分。
- 同一订单只能写一条 `earn` 流水。

3. 支付成功后调用积分写入。
4. 新增历史回填脚本：

```text
server/scripts/backfill-point-ledgers.ts
```

5. `/user/points` 改为从 `PointLedger` 汇总。
6. 新增分页明细接口：

```text
GET /user/points/records
```

### 9.4 小程序步骤

1. 新增积分页：

```text
miniapp/src/pages/points/index.vue
```

2. 个人中心增加“我的积分”入口。
3. 积分页展示：

- 可用积分
- 累计积分
- 计分消费
- 积分规则
- 最近明细

4. 订单详情展示本单积分。
5. 支付结果页展示本单获得积分。

### 9.5 验收

1. 新支付订单产生积分流水。
2. 重复回调不会重复加积分。
3. 积分页显示明细。
4. 无订单用户显示 0 积分和规则。
5. 订单详情能看到本单积分。

## 10. 批次 7：地址定位兜底

### 10.1 目标

定位失败不再表现为没反应，用户可以继续手动填写并保存地址。

### 10.2 修改文件

```text
miniapp/src/utils/location.ts
miniapp/src/pages/address/edit.vue
miniapp/src/pages/staff/address-edit.vue
miniapp/src/api/maps.ts
server/src/maps/maps.service.ts
server/src/maps/providers/tencent-map.provider.ts
server/src/maps/providers/amap.provider.ts
server/.env.example
```

### 10.3 小程序步骤

1. `location.ts` 返回结构化结果：

```text
ok
data
reason
message
```

2. 区分失败类型：

```text
user_cancel
permission_denied
map_service_failed
network_failed
unknown
```

3. 地址编辑页点击定位时显示 loading。
4. 权限拒绝时展示“打开设置”。
5. 地图服务失败时允许继续手动填写。
6. 定位成功后填充省市区、POI、详细地址和经纬度。
7. 门牌号保留明显提示。

### 10.4 后端步骤

1. `MapsService` 检查地图 key 是否配置。
2. key 缺失返回明确错误。
3. `reverseGeocode` 返回 provider、formattedAddress、latitude、longitude。
4. `.env.example` 补充地图配置说明。

### 10.5 验收

1. 用户拒绝定位权限时有明确提示。
2. 地图选点取消时有明确提示。
3. 地图服务失败时仍可手动保存。
4. 定位成功后地址能用于下单。
5. 师傅地址编辑也具备相同兜底。

## 11. 总体验收顺序

按顺序执行：

1. 后端构建和 Prisma 校验。
2. Admin 构建。
3. 小程序类型检查和微信小程序构建。
4. 手工跑通派单主链路。
5. 手工跑通外来订单建单和派单。
6. 手工跑通提现点击反馈。
7. 手工跑通新增客户和地址。
8. 手工跑通积分展示。
9. 手工跑通地址定位失败兜底。

## 12. 验证命令

### 12.1 后端

```bash
cd server
npx prisma validate
npx prisma generate
npm run build
```

### 12.2 Admin

```bash
cd admin
pnpm type-check
pnpm build
```

### 12.3 小程序

```bash
cd miniapp
pnpm type-check
pnpm build:mp
```

### 12.4 搜索确认

```bash
rg -n "order_assigned|unread-count|read-by-order|notificationStatus" server/src miniapp/src admin/src
rg -n "dispatch-check|admin/orders|pending_dispatch" server/src admin/src
rg -n "PointLedger|point_ledgers|points/records|backfill-point" server/src miniapp/src server/prisma
rg -n "withdrawBlockReason|requestMerchantTransfer|确认收款" miniapp/src admin/src server/src
rg -n "permission_denied|openSetting|map_service_failed|reverseGeocode" miniapp/src server/src
```

## 13. 阻断处理

### 13.1 微信订阅消息配置未完成

不阻断 Day36。

处理方式：

1. 站内通知必须可用。
2. 微信订阅状态记录为 `skipped`。
3. Admin 派单记录显示“微信订阅未配置”。

### 13.2 微信商家转账不可用

不修改提现状态机。

处理方式：

1. mock 模式继续可验收。
2. wechat 模式返回明确错误。
3. 师傅端展示联系客服提示。

### 13.3 地图 key 不可用

不阻断地址保存。

处理方式：

1. 定位失败提示明确原因。
2. 用户可手动填写地址并保存。

### 13.4 历史积分回填有异常数据

处理方式：

1. 回填脚本跳过异常订单。
2. 输出异常订单号。
3. 不影响新订单积分写入。

## 14. Day36 完成定义

满足以下条件才算 Day36 完成：

1. 派单后师傅端能看到通知和订单。
2. 外来订单可诊断、可新建、可派单。
3. 提现所有关键按钮都有反馈。
4. Admin 能新增客户并同步新增地址。
5. 积分有入口、有规则、有明细、有订单关联。
6. 地址定位失败有提示，仍可手动保存。
7. `D35-05` 保持现状，没有引入短信验证码或注册链路改动。
8. 后端、Admin、小程序构建校验通过。

