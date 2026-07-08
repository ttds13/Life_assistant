# Day40 师傅通知与资料变更 Admin 全覆盖管理计划

更新时间：2026-07-09  
目标版本：`1.0.3` 后续迭代  
来源：Day39 后继续审计 admin 对用户端、师傅端能力的覆盖缺口  
目标：把“师傅端通知闭环”和“师傅资料变更复核闭环”固定为可执行、可验证、可回收测试数据的改进任务，让 admin 能完整查看、处理、追踪和复盘师傅端关键动作。

## 1. Day40 总目标

Day40 不新增泛化的大功能，而是补齐 admin 对师傅端已有能力的管理覆盖。

本次要完成 2 条主闭环：

1. 师傅通知管理闭环：师傅端已经有 `/staff/notifications`、未读数、标记已读；admin 必须能按师傅、订单、通知状态查看师傅通知，能看到派单通知是否创建、是否已读、是否重发，并能从订单侧补发派单通知。
2. 师傅资料变更复核闭环：师傅端可以修改头像、姓名、工作状态，认证资料通过后也提示需要联系客服或后台复核；admin 必须能管理“资料变更申请”，能看变更前后、审核通过或驳回、填写驳回原因，并保留历史版本和复核记录。

最终 admin 需要覆盖：

| 覆盖对象 | 师傅端已有动作 | Day40 admin 必须补齐 |
| --- | --- | --- |
| 派单通知 | 查看通知、未读数、标记已读 | 查看全量师傅通知、按师傅/订单筛选、查看阅读状态、重发派单通知 |
| 派单任务 | admin 派单后师傅收到通知 | 订单详情展示通知 ID、发送状态、阅读状态、重发入口 |
| 基础资料 | 师傅修改头像、姓名 | 变更申请、待复核列表、通过后落库、驳回原因回显 |
| 认证资料 | 初次认证已有审核 | 已通过后再次修改走变更申请，不直接覆盖正式资料 |
| 工作状态 | 师傅改在线/忙碌/离线 | 保持可直接修改，但 admin 能查看状态变更历史和异常频次 |

## 2. 本次不做

1. 不改扫码注册、手机号注册、验证码策略。当前手机号注册问题维持现状，不纳入 Day40。
2. 不强制接入微信订阅消息。Day40 先以站内通知为闭环，微信模板/订阅消息作为后续增强。
3. 不改订单主流程的派单规则，只补 admin 对派单通知的管理、重发和审计。
4. 不把师傅工作状态改成必须审核。在线、忙碌、离线属于实时履约状态，本次只做 admin 可见和历史追踪。
5. 不删除现有初次认证审核入口。Day40 是在现有“认证审核”之外补“资料变更复核”。

## 3. 问题固定

| 编号 | 问题 | 当前表现 | Day40 处理目标 | 优先级 |
| --- | --- | --- | --- | --- |
| D40-NOTIFY-01 | admin 无法查看师傅通知列表 | 只有 admin 自己的通知列表，师傅通知只能师傅端查看 | 新增 admin 师傅通知列表，支持分页、筛选、详情 | P0 |
| D40-NOTIFY-02 | admin 无法按师傅/订单定位通知 | 派单后只能从订单和师傅端间接判断 | 支持 staffId、师傅姓名/手机号、orderId/orderNo、sendStatus、isRead 筛选 | P0 |
| D40-NOTIFY-03 | admin 无法重发派单通知 | 通知漏建或师傅未读时没有后台补救入口 | 新增通知重发和订单派单通知补发入口 | P0 |
| D40-NOTIFY-04 | 通知送达/阅读状态不够清晰 | 只有 `isRead`、`sendStatus`，缺少读时间、重试次数、失败原因 | 扩展通知审计字段，展示 created/sent/read/retry/failure | P1 |
| D40-NOTIFY-05 | 订单详情缺少通知轨迹 | `OrderAssignment` 有 notificationId，但 admin 侧不可直观看到 | 订单详情展示派单通知、重发记录、师傅阅读状态 | P1 |
| D40-PROFILE-01 | 师傅资料修改直接落库 | `/staff/profile` 可直接更新姓名、头像 | 改为创建变更申请，审核通过后再应用 | P0 |
| D40-PROFILE-02 | 认证通过后资料更新无复核 | 初次认证审核后，后续认证资料缺少变更申请 | 新增资料变更申请表，支持基础资料和认证资料变更 | P0 |
| D40-PROFILE-03 | admin 缺少变更前后对比 | 只能看当前 Staff 行 | 申请详情展示 beforeSnapshot、afterSnapshot、差异字段 | P0 |
| D40-PROFILE-04 | 驳回原因无师傅端闭环 | 驳回后师傅端无法看到明确原因和修改建议 | 师傅端可查询最近申请状态、驳回原因和可再次提交 | P1 |
| D40-PROFILE-05 | 历史版本不可追溯 | admin 直接编辑 staff 后只有部分 audit log | 新增资料历史记录/复核记录列表 | P1 |
| D40-PROFILE-06 | 工作状态缺少后台审计视图 | 师傅可改工作状态，但 admin 只看当前值 | 记录工作状态变更日志，admin 可按师傅查看历史 | P2 |

## 4. 闭环定义

### 4.1 师傅通知闭环

一条派单通知满足以下条件才算闭环：

1. admin 或系统给订单派单。
2. 后端创建 `receiverType=staff` 的通知，并关联订单和派单记录。
3. admin 可以在“师傅通知”页面查到该通知。
4. admin 可以从订单详情看到通知创建状态、发送状态、阅读状态。
5. 师傅端可以收到通知、未读数增加、点击后标记已读。
6. admin 刷新后能看到 `isRead=true` 和 `readAt`。
7. 如果通知缺失或失败，admin 能点击重发，并产生重发记录或更新重试次数。
8. 测试数据可按 `DAY40_TEST_` 批次号完整删除。

### 4.2 师傅资料变更复核闭环

一条资料变更满足以下条件才算闭环：

1. 师傅提交头像、姓名、城市、技能、身份证、认证图片等变更。
2. 已认证师傅的正式 `staff` 资料不被立即覆盖。
3. 后端生成 `pending` 状态的资料变更申请，保存变更前快照和变更后快照。
4. admin 在“资料变更复核”页面看到待审核记录。
5. admin 可以查看差异、附件、历史申请、当前正式资料。
6. admin 审核通过后，变更内容应用到 `staff` 正式资料，并写入审核日志。
7. admin 驳回后，正式资料保持不变，驳回原因可被师傅端看到。
8. 同一师傅不能无限提交多个相同待审核申请；需要有 pending 并发限制。
9. 测试申请、测试通知、测试订单可按 `DAY40_TEST_` 批次号完整删除。

## 5. 数据模型计划

### 5.1 扩展 notifications

当前 `Notification` 只有基础字段：`receiverType`、`receiverId`、`type`、`title`、`content`、`bizType`、`bizId`、`isRead`、`channel`、`sendStatus`、`createdAt`。

Day40 建议增加审计字段：

```prisma
model Notification {
  readAt        DateTime? @map("read_at")
  sentAt        DateTime? @map("sent_at")
  retryCount    Int       @default(0) @map("retry_count")
  lastRetriedAt DateTime? @map("last_retried_at")
  failureReason String?   @map("failure_reason") @db.VarChar(512)
  createdByType String?   @map("created_by_type") @db.VarChar(16)
  createdById   BigInt?   @map("created_by_id")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  @@index([receiverType, receiverId, createdAt])
  @@index([bizType, bizId])
  @@index([sendStatus])
}
```

字段规则：

1. 站内通知创建成功后 `sendStatus=created` 或 `sent`，Day40 统一为 `sent` 更清晰。
2. 师傅端标记已读时同时写 `isRead=true`、`readAt=now()`。
3. admin 重发时 `retryCount+1`、`lastRetriedAt=now()`。
4. 重发失败时写 `sendStatus=failed`、`failureReason`。
5. `bizType=order`、`bizId=order.id` 固定用于派单通知关联订单。

### 5.2 新增 staff_profile_change_requests

新增独立表，不复用 `staff` 行上的 `applicationNote/applicationImages`，原因是资料变更需要待审核队列、历史版本、驳回原因和变更前后对比。

```prisma
model StaffProfileChangeRequest {
  id             BigInt   @id @default(autoincrement())
  requestNo      String   @unique @map("request_no") @db.VarChar(32)
  staffId        BigInt   @map("staff_id")
  userId         BigInt?  @map("user_id")
  changeType     String   @map("change_type") @db.VarChar(32)
  status         String   @default("pending") @db.VarChar(16)
  beforeSnapshot Json     @map("before_snapshot")
  afterSnapshot  Json     @map("after_snapshot")
  changedFields  Json?    @map("changed_fields")
  submitNote     String?  @map("submit_note") @db.Text
  rejectReason   String?  @map("reject_reason") @db.Text
  submittedBy    BigInt?  @map("submitted_by")
  reviewedBy     BigInt?  @map("reviewed_by")
  reviewedAt     DateTime? @map("reviewed_at")
  appliedAt      DateTime? @map("applied_at")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  staff Staff @relation(fields: [staffId], references: [id])

  @@index([staffId, status])
  @@index([status, createdAt])
  @@map("staff_profile_change_requests")
}
```

状态枚举：

```text
pending    待复核
approved   已通过
rejected   已驳回
cancelled  师傅撤回或系统取消
applied    已应用到正式资料，可与 approved 合并，也可作为通过后的最终状态
```

建议 Day40 简化为：

```text
pending -> approved
pending -> rejected
pending -> cancelled
```

审核通过后同一事务内写入正式 `staff` 表，`appliedAt` 记录应用时间。

### 5.3 新增 staff_profile_change_logs 可选

如果希望历史版本查询更快，可新增日志表：

```prisma
model StaffProfileChangeLog {
  id          BigInt   @id @default(autoincrement())
  staffId     BigInt   @map("staff_id")
  requestId   BigInt?  @map("request_id")
  action      String   @db.VarChar(32)
  beforeData  Json?    @map("before_data")
  afterData   Json?    @map("after_data")
  operatorType String  @map("operator_type") @db.VarChar(16)
  operatorId  BigInt?  @map("operator_id")
  remark      String?  @db.VarChar(512)
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([staffId, createdAt])
  @@map("staff_profile_change_logs")
}
```

Day40 可以先不建独立日志表，优先使用 `StaffProfileChangeRequest` + 现有 `audit_logs`；如果 admin 历史页面性能不够，再补日志表。

## 6. 后端接口计划

### 6.1 师傅通知 admin 接口

新增控制器建议：

```text
server/src/notifications/admin-staff-notifications.controller.ts
```

新增服务方法建议放在：

```text
server/src/notifications/notifications.service.ts
```

接口清单：

```http
GET  /api/admin/staff-notifications
GET  /api/admin/staff/:id/notifications
GET  /api/admin/staff-notifications/:id
POST /api/admin/staff-notifications/:id/resend
POST /api/admin/orders/:id/resend-staff-notification
```

`GET /api/admin/staff-notifications` 查询参数：

```text
page
pageSize
keyword        师傅姓名/手机号/通知标题/订单号
staffId
orderId
orderNo
type           order_assigned 等
bizType        order
sendStatus     created/sent/failed
isRead         true/false
startDate
endDate
```

返回字段：

```json
{
  "id": 1,
  "staffId": 12,
  "staffName": "测试师傅",
  "staffPhone": "13800000000",
  "orderId": 99,
  "orderNo": "LA202607090001",
  "type": "order_assigned",
  "title": "新的服务订单",
  "content": "请及时处理",
  "sendStatus": "sent",
  "isRead": false,
  "readAt": null,
  "sentAt": "2026-07-09T10:00:00.000Z",
  "retryCount": 0,
  "failureReason": "",
  "createdAt": "2026-07-09T10:00:00.000Z"
}
```

重发规则：

1. 只允许重发 `receiverType=staff` 的通知。
2. 如果原通知有关联订单，重发内容必须与当前订单、当前师傅一致。
3. 重发不是简单复制旧记录，需要写明 `retryCount` 或生成一条 `type=order_assigned_retry` 的通知记录。
4. 建议 Day40 采用“保留原通知并累加 retryCount，同时新增一条重发通知”的方式，便于师傅端再次看到新通知，也便于 admin 看到重发历史。
5. 重发后同步更新 `OrderAssignment.notificationId` 为最新通知 ID，`notificationStatus` 为最新状态。

### 6.2 订单派单接口补强

在现有派单能力上补两个 admin 可见点：

```http
GET  /api/admin/orders/:id
POST /api/admin/orders/:id/resend-staff-notification
```

订单详情返回新增：

```json
{
  "assignmentNotification": {
    "notificationId": 123,
    "sendStatus": "sent",
    "isRead": true,
    "readAt": "2026-07-09T10:05:00.000Z",
    "retryCount": 1,
    "lastRetriedAt": "2026-07-09T10:03:00.000Z"
  },
  "assignmentNotifications": []
}
```

校验规则：

1. 订单没有 `staffId` 时不允许重发，返回明确错误：`order has no assigned staff`。
2. 当前师傅不存在或已禁用时不允许重发。
3. 订单已取消且没有履约意义时默认不允许重发，除非 admin 明确传 `force=true`，Day40 暂不做 force。
4. 重发动作写 `audit_logs`：`order:staff-notification:resend`。

### 6.3 师傅资料变更接口

新增模块建议：

```text
server/src/staff-profile-change/
```

如果为了减少模块改动，也可以先放在 `orders` 或 `support` 服务中，但建议独立模块，避免继续把师傅资料逻辑散落在订单服务里。

师傅侧接口：

```http
POST /api/staff/profile/change-requests
GET  /api/staff/profile/change-requests/latest
GET  /api/staff/profile/change-requests
GET  /api/staff/profile/change-requests/:id
POST /api/staff/profile/change-requests/:id/cancel
```

admin 侧接口：

```http
GET  /api/admin/staff-profile-change-requests
GET  /api/admin/staff-profile-change-requests/:id
POST /api/admin/staff-profile-change-requests/:id/review
GET  /api/admin/staff/:id/profile-history
```

`POST /api/admin/staff-profile-change-requests/:id/review` 请求体：

```json
{
  "decision": "approve",
  "rejectReason": "",
  "remark": "资料已核验"
}
```

或：

```json
{
  "decision": "reject",
  "rejectReason": "头像不清晰，请重新上传正面头像",
  "remark": "驳回"
}
```

审核通过事务：

1. 锁定申请记录，确认 `status=pending`。
2. 查询当前 `staff` 正式资料。
3. 对比申请的 `beforeSnapshot` 和当前正式资料，如果关键字段已被 admin 手动改过，需要返回冲突，提示重新提交或强制应用。Day40 默认不做强制应用。
4. 将 `afterSnapshot` 中允许审核的字段写入 `staff`。
5. 更新申请 `status=approved`、`reviewedBy`、`reviewedAt`、`appliedAt`。
6. 写 `audit_logs`：`staff-profile-change:approve`。
7. 给师傅创建站内通知：资料变更审核通过。

审核驳回事务：

1. 锁定申请记录，确认 `status=pending`。
2. 要求 `rejectReason` 非空。
3. 更新申请 `status=rejected`、`rejectReason`、`reviewedBy`、`reviewedAt`。
4. 写 `audit_logs`：`staff-profile-change:reject`。
5. 给师傅创建站内通知：资料变更被驳回，并包含驳回原因摘要。

## 7. 字段变更规则

### 7.1 需要审核的字段

以下字段变更必须进入资料变更申请：

```text
name
avatarUrl
cityCode
skills
idCard
applicationImages
applicationNote
```

原因：

1. `name/avatarUrl` 会影响用户端展示和平台可信度。
2. `skills/cityCode` 会影响派单匹配。
3. `idCard/applicationImages` 属于认证资料，必须可追溯。

### 7.2 可直接修改但要记录的字段

以下字段可保持原有直接修改：

```text
workStatus
```

规则：

1. 师傅端仍可实时切换在线/忙碌/离线。
2. 每次切换写审计日志或 `staff_profile_change_logs`。
3. admin “工作状态”页面保留当前状态管理。
4. admin 师傅详情新增状态历史入口，展示最近 30 条状态变更。

### 7.3 admin 直接编辑资料的规则

admin 现有师傅列表可以直接编辑师傅资料。Day40 后需要固定规则：

1. admin 直接编辑仍允许，但必须写 `audit_logs`，并在资料历史中展示为 `operatorType=admin`。
2. admin 编辑时不需要走变更申请，但需要记录 before/after。
3. 如果该师傅有待审核资料变更，admin 直接编辑关键字段时需要提示“存在待审核变更”，防止审核时覆盖冲突。

## 8. Admin 前端页面计划

### 8.1 路由新增

在 `admin/src/router/life-admin-routes.ts` 的 `/staff` 下新增：

```ts
{
  path: "notifications",
  component: "life/staff/notifications",
  name: "LifeStaffNotifications",
  meta: { title: "师傅通知", icon: "message", keepAlive: true, params: {} },
  children: [],
},
{
  path: "profile-changes",
  component: "life/staff/profile-changes",
  name: "LifeStaffProfileChanges",
  meta: { title: "资料变更复核", icon: "todo", keepAlive: true, params: {} },
  children: [],
}
```

建议新增页面：

```text
admin/src/views/life/staff/notifications.vue
admin/src/views/life/staff/profile-changes.vue
```

如果当前 admin 更偏资源化配置，也可先接入 `life/resource/index`，但本次两个页面都有详情、差异、重发、审核弹窗，建议使用独立 Vue 页面。

### 8.2 师傅通知页面

页面能力：

1. 顶部筛选：
   - 师傅姓名/手机号
   - 订单号
   - 通知类型
   - 发送状态
   - 已读/未读
   - 创建时间范围
2. 表格字段：
   - 通知 ID
   - 师傅姓名/手机号
   - 订单号
   - 通知标题
   - 发送状态
   - 是否已读
   - 阅读时间
   - 重试次数
   - 失败原因
   - 创建时间
3. 行操作：
   - 查看详情
   - 查看订单
   - 查看师傅
   - 重发派单通知
4. 顶部统计：
   - 今日派单通知数
   - 未读数
   - 失败数
   - 重发数

重发弹窗：

1. 展示原通知内容、订单号、当前师傅。
2. 提示重发会给师傅端生成一条新站内通知。
3. 点击确认后调用 `POST /api/admin/staff-notifications/:id/resend`。
4. 成功后刷新列表，显示新的重发记录或重试次数。

### 8.3 订单详情补充

在 `admin/src/views/life/orders/detail.vue` 增加“派单通知”区块：

```text
派单通知
- 当前师傅
- 通知 ID
- 发送状态
- 是否已读
- 阅读时间
- 重发次数
- 最近重发时间
- 操作：查看通知 / 重发通知
```

订单没有师傅时展示：

```text
该订单尚未派单，暂无师傅通知。
```

通知缺失但订单已有师傅时展示：

```text
当前订单已有师傅，但没有找到派单通知，可点击补发。
```

### 8.4 资料变更复核页面

页面能力：

1. 顶部筛选：
   - 师傅姓名/手机号
   - 状态：待复核/已通过/已驳回/已取消
   - 变更类型：基础资料/认证资料/混合变更
   - 提交时间范围
2. 表格字段：
   - 申请编号
   - 师傅姓名/手机号
   - 变更类型
   - 变更字段
   - 状态
   - 提交时间
   - 审核人
   - 审核时间
3. 行操作：
   - 查看详情
   - 通过
   - 驳回
   - 查看历史
4. 详情抽屉：
   - 当前正式资料
   - 变更前资料
   - 申请变更后资料
   - 差异字段高亮
   - 认证图片预览
   - 历史申请列表
   - 审核日志
5. 驳回弹窗：
   - 驳回原因必填
   - 可选常用原因：图片不清晰、姓名不一致、证件信息不完整、服务城市不支持、技能材料不足

### 8.5 师傅列表补充

在现有“师傅列表”行操作增加：

```text
通知
资料历史
待复核申请
```

最低可行做法：

1. 点击“通知”跳转 `/staff/notifications?staffId=xxx`。
2. 点击“资料历史”跳转 `/staff/profile-changes?staffId=xxx`。
3. 如果有 pending 申请，在师傅列表展示“待复核”标签。

## 9. 小程序/师傅端调整计划

### 9.1 师傅资料提交

当前 `/staff/profile` 直接更新资料。Day40 改为：

1. 对 `workStatus` 保持 `/staff/work-status` 原逻辑。
2. 对 `staffName/avatarUrl` 等资料字段，前端调用新的 `POST /staff/profile/change-requests`。
3. 提交成功后提示：
   ```text
   资料已提交，等待后台复核。
   ```
4. 如已有待复核申请，提示：
   ```text
   你已有待复核资料，请等待审核或撤回后再提交。
   ```

### 9.2 师傅端申请状态展示

新增或复用个人资料页展示：

```text
最近资料申请状态：
- 待复核
- 已通过
- 已驳回：展示驳回原因
```

接口：

```http
GET /api/staff/profile/change-requests/latest
```

### 9.3 师傅通知已读

现有师傅端标记已读逻辑需要补：

1. 标记已读时写 `readAt`。
2. 如果是订单派单通知，打开对应订单详情时可以调用按订单标记已读，确保 admin 看到阅读状态。
3. 未读数统计继续以 `receiverType=staff`、`receiverId=staffId`、`isRead=false` 为准。

## 10. 权限计划

建议权限：

```text
STAFF_NOTIFICATION_VIEW
STAFF_NOTIFICATION_RESEND
STAFF_PROFILE_CHANGE_VIEW
STAFF_PROFILE_CHANGE_REVIEW
```

如果当前权限系统暂时不方便新增细粒度权限，Day40 第一版可复用：

```text
ADMIN_PERMISSION.STAFF_AUDIT
```

但代码中要留出权限名称常量，避免后续拆权限时大改。

操作权限规则：

| 操作 | 最低权限 |
| --- | --- |
| 查看师傅通知 | STAFF_NOTIFICATION_VIEW |
| 重发派单通知 | STAFF_NOTIFICATION_RESEND |
| 查看资料变更申请 | STAFF_PROFILE_CHANGE_VIEW |
| 审核通过/驳回 | STAFF_PROFILE_CHANGE_REVIEW |
| 查看资料历史 | STAFF_PROFILE_CHANGE_VIEW |

## 11. 实施批次

### 批次 0：基线检查

目标：确认当前代码状态和数据库模型，不直接改业务逻辑。

执行步骤：

1. 查看当前 git 状态：
   ```bash
   git status --short
   ```
2. 确认 Prisma schema 有 `Notification`、`Staff`、`OrderAssignment`。
3. 确认师傅通知已有接口：
   ```text
   GET /staff/notifications
   GET /staff/notifications/unread-count
   POST /staff/notifications/:id/read
   ```
4. 确认 admin 当前只有：
   ```text
   GET /admin/notifications
   ```
5. 确认师傅资料当前直接更新点：
   ```text
   PUT /staff/profile
   PUT /staff/work-status
   ```
6. 记录 Day40 开始前的缺口到文档或提交说明。

完成标准：

1. 明确哪些文件需要改。
2. 明确是否存在未提交改动。
3. 不回滚任何用户已有改动。

### 批次 1：数据库迁移

目标：让通知和资料变更具备审计承载能力。

执行步骤：

1. 修改 `server/prisma/schema.prisma`：
   - 扩展 `Notification` 审计字段。
   - 新增 `StaffProfileChangeRequest`。
   - 根据需要补 `Staff` 反向 relation。
2. 生成迁移：
   ```bash
   cd server
   npx prisma migrate dev --name day40_staff_admin_coverage
   ```
3. 更新 Prisma Client：
   ```bash
   npx prisma generate
   ```
4. 校验 schema：
   ```bash
   npx prisma validate
   ```

完成标准：

1. 新字段和新表可正常生成。
2. 旧通知数据不丢失。
3. 旧 `isRead` 数据保持兼容，`readAt` 允许为空。

### 批次 2：通知后端闭环

目标：admin 能查、能看、能重发师傅通知。

执行步骤：

1. 在 `NotificationsService` 增加 admin 查询方法：
   ```text
   listAdminStaffNotifications(query)
   getAdminStaffNotificationDetail(id)
   resendStaffNotification(id, adminId)
   resendOrderStaffNotification(orderId, adminId)
   ```
2. 增加 admin controller：
   ```text
   server/src/notifications/admin-staff-notifications.controller.ts
   ```
3. 修改师傅端标记已读：
   - 标记通知已读时写 `readAt`。
   - 按订单标记已读时同步写 `readAt`。
4. 修改派单通知创建逻辑：
   - 派单创建通知后写 `sentAt`。
   - `OrderAssignment.notificationStatus` 与通知 `sendStatus` 对齐。
5. 增加订单重发派单通知接口。
6. 所有重发动作写 `audit_logs`。

完成标准：

1. admin 可按 staff/order/status/read 筛选通知。
2. admin 可对派单通知重发。
3. 订单详情接口能返回派单通知状态。
4. 师傅端已读后 admin 能看到 `readAt`。

### 批次 3：资料变更后端闭环

目标：师傅资料变更从“直接覆盖”改为“提交申请、admin 复核、通过后应用”。

执行步骤：

1. 新增 DTO：
   ```text
   SubmitStaffProfileChangeDto
   ReviewStaffProfileChangeDto
   QueryStaffProfileChangeDto
   ```
2. 新增 service：
   ```text
   StaffProfileChangeService
   ```
3. 提交申请逻辑：
   - 查询当前 staff。
   - 生成 `beforeSnapshot`。
   - 从请求体生成 `afterSnapshot`。
   - 计算 `changedFields`。
   - 如果没有实际变化，返回错误。
   - 如果已有 pending 申请，返回冲突。
   - 创建申请。
4. 修改 `/staff/profile`：
   - 保留兼容入口，但内部改为创建变更申请。
   - 返回申请状态，而不是直接返回已更新 staff。
5. 新增师傅侧申请查询接口。
6. 新增 admin 查询和审核接口。
7. 审核通过：
   - 同事务更新申请和 staff。
   - 绑定新头像/认证图片文件到 staff 业务。
   - 写 audit log。
   - 给师傅发审核通过通知。
8. 审核驳回：
   - 写 rejectReason。
   - 写 audit log。
   - 给师傅发审核驳回通知。

完成标准：

1. 已认证师傅提交姓名/头像变更后，正式资料不立即改变。
2. admin 审核通过后正式资料改变。
3. admin 驳回后正式资料不变。
4. 师傅端能看到最新申请状态和驳回原因。

### 批次 4：Admin 前端页面

目标：让 admin 不是只能靠接口，而是能在后台页面完成管理。

执行步骤：

1. 在 `admin/src/api/life/types.ts` 增加类型：
   ```text
   AdminStaffNotificationItem
   AdminStaffNotificationDetail
   StaffProfileChangeRequestItem
   StaffProfileChangeRequestDetail
   ```
2. 在 `admin/src/api/life/index.ts` 增加方法：
   ```text
   getStaffNotifications
   getStaffNotificationDetail
   resendStaffNotification
   resendOrderStaffNotification
   getStaffProfileChangeRequests
   getStaffProfileChangeRequestDetail
   reviewStaffProfileChangeRequest
   getStaffProfileHistory
   ```
3. 新增 `life/staff/notifications.vue`。
4. 新增 `life/staff/profile-changes.vue`。
5. 修改 `/staff` 路由，新增两个菜单。
6. 修改订单详情页面，增加派单通知区块。
7. 修改师傅列表行操作，增加通知和资料历史入口。

完成标准：

1. admin 菜单能进入“师傅通知”。
2. admin 菜单能进入“资料变更复核”。
3. 通知页面能筛选、查看、重发。
4. 资料变更页面能查看差异、通过、驳回。
5. 订单详情能看到派单通知状态并补发。

### 批次 5：测试脚本和测试数据清理

目标：用模拟订单和模拟师傅真实跑通闭环，并保证测试数据可删除。

新增脚本：

```text
server/scripts/day40-staff-admin-coverage-smoke.ts
server/scripts/day40-clean-test-data.ts
```

统一批次号：

```text
DAY40_TEST_{yyyyMMddHHmmss}
```

执行命令：

```bash
cd server
npx tsx scripts/day40-staff-admin-coverage-smoke.ts --run-id DAY40_TEST_20260709HHmmss
npx tsx scripts/day40-clean-test-data.ts --run-id DAY40_TEST_20260709HHmmss --dry-run
npx tsx scripts/day40-clean-test-data.ts --run-id DAY40_TEST_20260709HHmmss --confirm
npx tsx scripts/day40-clean-test-data.ts --run-id DAY40_TEST_20260709HHmmss --dry-run
```

测试数据标记位置：

```text
users.nickname / adminRemark
staff.name / applicationNote
orders.remark / adminRemark
notifications.title / content
staff_profile_change_requests.submitNote
audit_logs.requestId / detail
```

清理顺序：

1. 查询 runId 对应测试用户、测试师傅、测试订单、测试申请、测试通知 ID。
2. 删除资料变更申请。
3. 删除通知。
4. 删除订单派单记录和订单状态日志。
5. 删除测试订单相关支付、退款、积分、收入记录。
6. 删除测试订单。
7. 删除测试师傅。
8. 删除测试用户。
9. 删除测试审计日志。
10. 再次 dry-run，确认计数为 0。

完成标准：

1. smoke 脚本能完整创建、验证、输出结果。
2. cleanup 脚本无 `--confirm` 只统计不删除。
3. cleanup 后同一 runId 查询结果全部为 0。

### 批次 6：接口和页面验收

目标：确认闭环不是“接口存在”，而是真能从 admin 管理到师傅端动作。

验收用例：

| 编号 | 用例 | 操作 | 预期 |
| --- | --- | --- | --- |
| D40-T01 | 派单创建通知 | 创建订单并派给测试师傅 | 生成 staff 通知，admin 通知列表可见 |
| D40-T02 | 师傅读取通知 | 师傅端标记通知已读 | admin 看到 `isRead=true`、`readAt` 非空 |
| D40-T03 | admin 重发通知 | 在师傅通知页点击重发 | 师傅端新增通知或 retryCount 增加，audit log 有记录 |
| D40-T04 | 订单详情补发 | 订单已有师傅但通知缺失时点击补发 | 生成新派单通知并绑定订单 |
| D40-T05 | 提交资料变更 | 师傅提交新头像和姓名 | staff 正式资料不变，生成 pending 申请 |
| D40-T06 | admin 审核通过 | admin 通过资料变更 | staff 正式资料更新，申请变 approved |
| D40-T07 | admin 驳回 | 师傅再次提交资料变更，admin 驳回 | staff 正式资料不变，师傅端可见驳回原因 |
| D40-T08 | pending 并发限制 | 同一师傅已有待审核时再次提交 | 返回冲突，不创建第二条 pending |
| D40-T09 | admin 直接编辑冲突提醒 | 存在 pending 时 admin 编辑师傅关键字段 | 页面提示存在待审核变更，后端审核时做 beforeSnapshot 冲突校验 |
| D40-T10 | 数据清理 | 执行 day40 cleanup | runId 相关数据全部为 0 |

## 12. 云端部署和验证步骤

如果 Day40 进入实现阶段并需要部署到云端，按以下顺序执行：

1. 本地构建和测试：
   ```bash
   cd server
   npx prisma validate
   npm run build
   cd ../admin
   npm run build
   ```
2. 连接云端：
   ```bash
   ssh aliyun-backend
   cd /www/wwwroot/life-assistant
   ```
3. 部署前备份数据库：
   ```bash
   docker ps
   docker exec <mysql-container> mysqldump -u root -p life_assistant > /tmp/life_assistant_day40_before.sql
   ```
4. 拉取或同步代码。
5. 执行 Prisma 迁移：
   ```bash
   cd server
   npx prisma migrate deploy
   npx prisma generate
   ```
6. 重建并重启 Docker 服务：
   ```bash
   docker compose build
   docker compose up -d
   ```
7. 查看服务状态：
   ```bash
   docker compose ps
   docker compose logs --tail=100 server
   ```
8. 执行 Day40 smoke：
   ```bash
   cd server
   npx tsx scripts/day40-staff-admin-coverage-smoke.ts --run-id DAY40_TEST_20260709HHmmss
   ```
9. 执行清理：
   ```bash
   npx tsx scripts/day40-clean-test-data.ts --run-id DAY40_TEST_20260709HHmmss --dry-run
   npx tsx scripts/day40-clean-test-data.ts --run-id DAY40_TEST_20260709HHmmss --confirm
   npx tsx scripts/day40-clean-test-data.ts --run-id DAY40_TEST_20260709HHmmss --dry-run
   ```

## 13. 风险和处理

| 风险 | 表现 | 处理 |
| --- | --- | --- |
| 旧通知没有 `readAt` | 历史已读通知只显示已读，不显示阅读时间 | 历史数据允许为空，不做批量补时间 |
| 重发通知重复打扰师傅 | admin 多次点击重发 | 增加二次确认，记录 retryCount，必要时限制 1 分钟内重复重发 |
| 资料变更审核覆盖 admin 手动编辑 | 申请提交后正式资料被 admin 改过 | 审核时校验 beforeSnapshot，冲突则阻止通过 |
| 图片文件未绑定 | 头像/认证图片提交后文件孤立 | 审核通过时 bindFilesToBiz，驳回时保留文件但不绑定正式资料 |
| pending 申请堆积 | 师傅重复提交多条 | 同一 staff 同一 changeType 只允许一条 pending |
| 权限过粗 | 普通运营可重发或审核资料 | 第一版可复用 STAFF_AUDIT，后续拆 STAFF_NOTIFICATION_RESEND 等权限 |
| 测试数据污染 | 模拟订单和申请留在库里 | 所有测试数据写 runId，cleanup 必须 dry-run 和 confirm |

## 14. 最终验收标准

Day40 完成时必须满足：

1. admin 有“师傅通知”菜单。
2. admin 能按师傅、订单、通知状态、已读状态筛选师傅通知。
3. admin 能查看师傅通知详情和订单关联信息。
4. admin 能重发派单通知，重发动作可审计。
5. 订单详情能显示派单通知状态和补发入口。
6. 师傅端标记已读后，admin 能看到阅读状态和阅读时间。
7. admin 有“资料变更复核”菜单。
8. 师傅提交姓名、头像、认证资料变更后不会直接覆盖正式资料。
9. admin 能看到变更前后对比、附件、历史申请。
10. admin 审核通过后正式资料更新。
11. admin 驳回后正式资料不变，师傅端能看到驳回原因。
12. admin 直接编辑师傅资料有审计记录，并能在资料历史中追踪。
13. Day40 smoke 脚本能跑通通知和资料变更两个闭环。
14. Day40 cleanup 脚本能删除所有模拟订单和测试数据。
15. 本地和云端 Docker 部署后，后台页面和接口均能正常访问。

## 15. 推荐实现顺序

实际编码时按以下顺序推进：

1. 先做数据库迁移。
2. 再做通知 admin 接口。
3. 再做资料变更申请和审核接口。
4. 再改师傅端资料提交逻辑。
5. 再做 admin 两个新页面。
6. 再补订单详情派单通知区块。
7. 再写 Day40 smoke 和 cleanup 脚本。
8. 最后本地测试、云端部署、云端 smoke、清理测试数据。

不建议先做页面，因为当前缺口的核心是后端没有可审计的数据模型和 admin 管理接口；页面应在接口字段稳定后实现。

