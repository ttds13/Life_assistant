# Day 31 - 师傅端工作台收口与个人中心补齐计划

## 1. 目标

Day31 用于把师傅端第一版从“能跑主流程”推进到“入口、权限、页面和后端边界都一致”的可交付状态。

本次只做两件事：

1. 删除后端抢单相关接口，确保第一版只支持后台人工派单。
2. 补齐师傅个人中心中的占位入口，避免继续出现“当前不可用”的半成品入口。

第一版继续保持简单：

- 不做抢单池。
- 不做师傅主动开单。
- 不做自动派单策略。
- 不做复杂技能、距离、排班匹配。
- 不做完整佣金提现系统，只补齐清晰可用的展示和规则页面。

## 2. 当前问题

### 2.1 后端仍保留抢单能力

虽然小程序前端不再展示抢单入口，但后端仍开放：

```text
GET  /staff/available-orders
GET  /staff/available-orders/:id
POST /staff/orders/:id/claim
```

相关位置：

```text
server/src/orders/orders.controller.ts
server/src/orders/orders.service.ts
server/src/orders/orders.repository.ts
server/src/orders/order-state-machine.ts
server/src/orders/constants/order-action.ts
miniapp/src/api/staff.ts
miniapp/src/api/types/staff.ts
```

风险：

- 师傅 token 可以绕过前端直接调用抢单接口。
- 订单可能从 `pending_dispatch` 被师傅直接 claim 到 `accepted`。
- 与“后台人工分配订单给师傅”的第一版业务规则冲突。

### 2.2 师傅个人中心大量入口是占位

当前师傅端个人中心存在这些入口，但点击后只提示“当前不可用”：

- 我的服务
- 证件管理
- 证件结算
- 资料认证
- 服务规则
- 联系客服

设置页中也存在占位入口：

- 服务区域
- 接单设置
- 通知设置
- 关于我们

第一版不一定要把所有功能做成复杂系统，但至少要做到：

- 页面可进入。
- 信息可展示。
- 与现有后端或静态配置有明确来源。
- 不出现空 toast 占位。
- 对暂不支持的复杂能力给出清晰的一版规则页面，而不是不可用。

## 3. 实施顺序

严格按以下顺序执行：

1. 先删除抢单后端能力，避免继续扩大错误业务面。
2. 再清理小程序 API 和类型中的抢单/主动开单残留。
3. 再补师傅个人中心页面。
4. 最后跑后端、小程序构建和搜索校验。

## 4. 第一阶段：删除后端抢单接口

### 4.1 删除控制器路由

文件：

```text
server/src/orders/orders.controller.ts
```

删除以下接口：

1. `GET staff/available-orders`
2. `GET staff/available-orders/:id`
3. `POST staff/orders/:id/claim`

保留以下师傅端接口：

```text
GET  /staff/orders
GET  /staff/orders/:id
GET  /staff/profile
PUT  /staff/profile
POST /staff/orders/:id/accept
POST /staff/orders/:id/reject
POST /staff/orders/:id/on-the-way
POST /staff/orders/:id/start-service
POST /staff/orders/:id/complete
```

验收：

- `orders.controller.ts` 中不再出现 `available-orders`。
- `orders.controller.ts` 中不再出现 `staffClaim`。
- 访问抢单接口应返回 404，而不是 200/403/409。

### 4.2 删除 OrdersService 抢单方法

文件：

```text
server/src/orders/orders.service.ts
```

删除：

1. `listAvailableStaffOrders(...)`
2. `getAvailableStaffOrderDetail(...)`
3. `staffClaim(...)`
4. 仅供抢单使用的 `assertStaffCanTakeOrder(...)`

检查：

- 如果 `assertStaffCanTakeOrder` 删除后无引用，直接删。
- 如果其他方法仍引用，必须确认是否属于抢单语义；第一版不允许师傅主动认领订单。
- 保留 `assertStaffAvailable(...)`，因为个人资料、后续在线状态和师傅身份仍可能使用。

验收：

- `rg "staffClaim|listAvailableStaffOrders|getAvailableStaffOrderDetail|assertStaffCanTakeOrder" server/src/orders` 无结果。

### 4.3 删除 Repository 抢单查询

文件：

```text
server/src/orders/orders.repository.ts
```

删除：

1. `findAvailableStaffOrders(...)`
2. 只为抢单池服务的查询条件。

检查：

- `countStaffBusyOrders(...)` 如果只被 `assertStaffCanTakeOrder` 使用，可一并删除。
- 如果未来自动派单仍需要“忙碌订单”统计，可保留，但不得被抢单流程使用。

验收：

- `rg "findAvailableStaffOrders|available staff orders|staff has unfinished order" server/src/orders` 无抢单语义残留。

### 4.4 删除状态机抢单动作

文件：

```text
server/src/orders/order-state-machine.ts
server/src/orders/constants/order-action.ts
```

删除：

1. `ORDER_ACTION.STAFF_CLAIM`
2. `STAFF_CLAIM` 对应的状态流：

```text
pending_dispatch -> accepted
```

保留：

```text
pending_dispatch -> dispatched -> accepted
```

也就是只能由后台先派单，师傅再接单。

注意：

- 历史 `order_status_logs.action = staff_claim` 记录不需要迁移，只是不再产生新记录。
- 如果后台日志页面按 `ORDER_ACTION_VALUES` 枚举展示，需要确认删除后不会影响历史日志显示；历史日志可以按原始字符串展示。

验收：

- `rg "STAFF_CLAIM|staff_claim" server/src/orders` 无结果。
- `npm run build` 通过。

### 4.5 删除小程序抢单 API 残留

文件：

```text
miniapp/src/api/staff.ts
miniapp/src/api/types/staff.ts
```

删除：

1. `claimStaffTask(...)`
2. 与抢单组相关的兼容字段。
3. 如果仍存在 `CreateStaffOrderPayload` 和 `createStaffOrder(...)`，评估是否一并删除。

第一版规则：

- `StaffTaskGroup` 只保留 `dispatch`。
- 师傅任务来源只来自 `GET /staff/orders`。
- 不调用 `/staff/available-orders`。
- 不暴露 `claim` 给页面或工具函数。

验收：

```text
rg "claimStaffTask|available-orders|grab|抢单|可抢|createStaffOrder|not connected" miniapp/src
```

预期：

- 不出现抢单相关结果。
- 不出现主动开单占位 API。

## 5. 第二阶段：补齐师傅个人中心入口

### 5.1 入口梳理和路由规划

当前入口分两组。

个人中心应用入口：

```text
我的服务
证件管理
证件结算
```

个人中心其他入口：

```text
资料认证
服务规则
联系客服
设置
```

设置页入口：

```text
服务区域
接单设置
服务规则
通知设置
联系客服
关于我们
```

建议新增页面：

```text
miniapp/src/pages/staff/services.vue
miniapp/src/pages/staff/certificates.vue
miniapp/src/pages/staff/settlement.vue
miniapp/src/pages/staff/verification.vue
miniapp/src/pages/staff/service-rules.vue
miniapp/src/pages/staff/contact-service.vue
miniapp/src/pages/staff/service-area.vue
miniapp/src/pages/staff/work-settings.vue
miniapp/src/pages/staff/notifications.vue
miniapp/src/pages/staff/about.vue
```

如果不想一次新增太多页面，可以合并：

- `资料认证` 和 `证件管理` 可先共用 `certificates.vue`，用 query 区分 tab。
- `我的服务` 和 `服务区域` 可先共用 `services.vue` 或 `service-area.vue`。
- `联系客服` 可复用用户端联系客服配置，但页面路径放在 staff 下。

验收：

- 点击每个入口都进入页面。
- 不再调用 `onTodo` 弹“当前不可用”。
- `rg "当前不可用|onTodo" miniapp/src/pages/staff` 不再命中这些入口。

### 5.2 我的服务页面

页面：

```text
miniapp/src/pages/staff/services.vue
```

目标：

展示师傅当前可服务范围和第一版业务说明。

第一版展示内容：

1. 师傅基础信息：
   - 姓名
   - 手机号
   - 认证状态
   - 服务城市
2. 可处理订单类型：
   - 后台分配订单
   - 日常保洁会员卡订单
   - 普通现金预约订单
3. 不支持能力：
   - 不支持抢单
   - 不支持主动开单
   - 不支持自行改价
4. 当前服务商品说明：
   - 日常保洁 2 小时会员卡履约
   - 60/120 分钟实际服务选择
   - 其他服务按订单说明执行

数据来源：

- 优先使用 `GET /staff/profile`。
- 服务规则可以先用前端静态文案。
- 如果后续要动态配置，再接 `support/config` 或新增 staff rules API。

验收：

- 我的服务页面不是空白。
- 文案明确“只处理平台分配订单”。
- 不出现抢单/主动开单入口。

### 5.3 证件管理页面

页面：

```text
miniapp/src/pages/staff/certificates.vue
```

目标：

让师傅查看和维护基础资质材料。

第一版字段：

1. 身份信息：
   - 姓名
   - 手机号
   - 认证状态
2. 资料图片：
   - 身份证/健康证/技能证书/其他材料
   - 最多 6 张
3. 备注说明：
   - 补充认证说明

后端适配方案：

优先复用已有申请师傅资料：

```text
server/src/support
miniapp/src/api/support.ts
miniapp/src/pages/profile/apply-staff.vue
```

如果当前后端只支持“申请师傅”提交，不支持师傅端更新资料，则 Day31 第一版做成：

1. 读取当前申请/审核资料。
2. 已审核通过时允许“提交补充资料”生成新的待审核申请或反馈记录。
3. 后台通过现有审核中心处理。

需要确认并实现的 API：

```text
GET  /staff/applications/me
POST /staff/applications
```

或新增：

```text
GET  /staff/certificates
POST /staff/certificates
```

验收：

- 可查看当前认证状态。
- 可上传补充材料。
- 提交后后台能看到资料。
- 不再只是 toast。

### 5.4 证件结算页面

页面：

```text
miniapp/src/pages/staff/settlement.vue
```

目标：

第一版先做“服务收入说明 + 已完成订单汇总”，不做提现。

展示内容：

1. 今日/本周/本月/总计：
   - 完成订单数
   - 服务金额
   - 预估收入
2. 结算规则：
   - 当前版本仅展示服务金额
   - 实际结算以后台财务为准
   - 暂不支持师傅端提现
3. 完成订单列表入口：
   - 跳转 `/pages/staff/orders?status=completed`

后端来源：

- 复用 `GET /staff/profile?period=...` 返回的 stats。
- 当前 `commissionAmount` 只是 `payableAmount` 聚合，页面文案必须写成“服务金额/预估收入”，不要写成可提现佣金。

后续可扩展：

```text
GET /staff/income-records
GET /staff/withdrawals
POST /staff/withdrawals
```

但 Day31 不做提现闭环。

验收：

- 页面能展示周期统计。
- 不展示“可提现”误导文案。
- 不出现提现按钮，除非后端提现已完成。

### 5.5 资料认证页面

页面：

```text
miniapp/src/pages/staff/verification.vue
```

目标：

展示师傅认证状态、审核说明和补充资料入口。

状态：

```text
pending  审核中
approved 已认证
rejected 已驳回
none     未提交
```

页面动作：

1. 已认证：
   - 展示认证通过状态
   - 展示证件管理入口
2. 审核中：
   - 展示提交时间
   - 提示等待平台审核
3. 已驳回：
   - 展示驳回原因
   - 可重新提交资料
4. 未提交：
   - 跳转申请师傅/提交认证资料

数据来源：

- 复用 `getStaffApplicationMe()`。
- 已是 staff 时仍可展示 staff profile。

验收：

- 不同状态都有明确 UI。
- 已认证师傅能进入证件管理。
- 驳回状态能重新提交。

### 5.6 服务规则页面

页面：

```text
miniapp/src/pages/staff/service-rules.vue
```

目标：

把第一版履约规则写清楚，作为师傅端可读规则页。

内容至少包含：

1. 接单规则：
   - 只处理后台分配订单。
   - 不支持抢单。
   - 不支持主动开单。
2. 履约流程：
   - 接单
   - 出发
   - 开始服务
   - 上传照片
   - 完成服务
3. 照片规则：
   - 至少 1 张
   - 最多 6 张
   - 必须上传成功后才能完成
4. 会员卡订单规则：
   - 日常保洁 2 小时默认冻结 120 分钟。
   - 实际服务 120 分钟扣 120。
   - 实际服务 60 分钟扣 60 并释放 60。
5. 异常处理：
   - 客户无法联系
   - 地址不明确
   - 服务无法继续
   - 联系客服或后台处理

数据来源：

- Day31 可先写静态文案。
- 后续可接后台 FAQ/规则配置。

验收：

- 页面可从个人中心和设置页进入。
- 规则文案与当前业务一致。

### 5.7 联系客服页面

页面：

```text
miniapp/src/pages/staff/contact-service.vue
```

目标：

师傅端也能联系平台客服。

优先复用用户端客服配置：

```text
miniapp/src/pages/profile/contact-service.vue
miniapp/src/api/support.ts
GET /support/config
```

展示内容：

1. 客服电话
2. 工作时间
3. 微信/二维码/客服说明
4. 常见处理场景：
   - 订单异常
   - 无法联系客户
   - 照片上传失败
   - 服务时长争议

动作：

- 拨打客服电话。
- 复制微信号。
- 跳转服务规则。

验收：

- 点击联系客服进入页面。
- 可正常拨打或复制。
- 不再 toast。

### 5.8 服务区域页面

页面：

```text
miniapp/src/pages/staff/service-area.vue
```

目标：

第一版不做复杂服务半径，只展示师傅地址和服务城市。

内容：

1. 当前服务城市：
   - 来自 `staff.cityCode` 或 profile `regionText`
2. 常驻地址：
   - 跳转师傅地址列表
3. 工作地址：
   - 跳转师傅地址列表
4. 说明：
   - 第一版由后台人工派单，不按师傅端自选区域自动派单。

可复用：

```text
miniapp/src/pages/staff/address-list.vue
miniapp/src/pages/staff/address-edit.vue
GET /staff/addresses
```

验收：

- 服务区域页面不是占位。
- 可跳转维护师傅地址。
- 明确不做自动派单区域匹配。

### 5.9 接单设置页面

页面：

```text
miniapp/src/pages/staff/work-settings.vue
```

目标：

第一版只做在线/离线状态开关，避免复杂排班。

需要后端新增或复用接口：

```text
GET /staff/work-status
PUT /staff/work-status
```

字段：

```text
workStatus: 0 | 1 | 2
```

含义：

```text
0 离线
1 在线
2 忙碌
```

页面内容：

1. 当前状态。
2. 在线/离线切换。
3. 忙碌状态说明：
   - 可由系统根据进行中订单展示。
   - 第一版不允许复杂排班。
4. 规则提示：
   - 离线时后台仍可查看师傅，但派单前应确认。
   - 在线状态用于后台筛选和后续派单参考。

后端实现步骤：

1. 在 `OrdersController` 或单独 `StaffController` 增加接口。
2. 根据当前登录用户解析 staffId。
3. 更新 `Staff.workStatus`。
4. 返回最新 staff profile 或状态对象。

验收：

- 师傅可切换在线/离线。
- 后台 staff 列表/派单选项能看到变化。
- 不影响已分配订单继续履约。

### 5.10 通知设置页面

页面：

```text
miniapp/src/pages/staff/notifications.vue
```

目标：

第一版先做本地偏好设置，不接消息推送。

设置项：

1. 新订单提醒
2. 服务开始提醒
3. 完成服务提醒
4. 售后/平台通知提醒

实现：

- 使用本地 storage 保存。
- 页面明确“系统通知能力后续接入微信订阅消息”。
- 不影响当前业务。

后续可扩展：

```text
POST /staff/notification-settings
GET  /staff/notification-settings
```

验收：

- 设置可保存并回显。
- 不再占位。

### 5.11 关于我们页面

页面：

```text
miniapp/src/pages/staff/about.vue
```

目标：

展示平台、版本和师傅端说明。

内容：

1. 平台名称。
2. 当前版本。
3. 师傅端第一版能力。
4. 客服入口。
5. 服务规则入口。

验收：

- 页面可进入。
- 无接口依赖。

## 6. 第三阶段：页面接线

### 6.1 修改师傅个人中心入口

文件：

```text
miniapp/src/pages/staff/profile.vue
```

改造：

1. 删除通用 `onTodo` 对这些入口的处理。
2. 增加明确路由映射：

```text
我的服务     -> /pages/staff/services
证件管理     -> /pages/staff/certificates
证件结算     -> /pages/staff/settlement
资料认证     -> /pages/staff/verification
服务规则     -> /pages/staff/service-rules
联系客服     -> /pages/staff/contact-service
设置         -> /pages/staff/settings
```

验收：

- 每个入口点击可进入。
- `profile.vue` 中不再对上述入口 toast `当前不可用`。

### 6.2 修改师傅设置页入口

文件：

```text
miniapp/src/pages/staff/settings.vue
```

路由映射：

```text
服务区域     -> /pages/staff/service-area
接单设置     -> /pages/staff/work-settings
服务规则     -> /pages/staff/service-rules
通知设置     -> /pages/staff/notifications
联系客服     -> /pages/staff/contact-service
关于我们     -> /pages/staff/about
```

保留：

- 修改头像。
- 修改姓名。
- 退出登录。

验收：

- `settings.vue` 中不再出现 `当前不可用`。

### 6.3 路由和自动页面生成检查

项目使用 `definePage` 自动生成页面路由。

新增页面时必须：

1. 每个页面写 `definePage`。
2. 设置 `navigationBarTitleText`。
3. 保持页面路径在 `miniapp/src/pages/staff/` 下。
4. 运行 `npm run build:mp` 确认路由生成成功。

## 7. 第四阶段：后端补接口

### 7.1 工作状态接口

新增或放在现有订单控制器中：

```text
GET /staff/work-status
PUT /staff/work-status
```

实现步骤：

1. 通过 `StaffIdentityService.resolveStaffId()` 获取 staffId。
2. 查询 `Staff.workStatus`。
3. PUT 时校验值只允许 `0 | 1 | 2`。
4. 更新 staff。
5. 返回：

```json
{
  "staffId": 1,
  "workStatus": 1,
  "workStatusText": "在线"
}
```

验收：

- 未登录返回 401。
- 非师傅返回 403。
- 非法状态返回 400。
- 修改后后台师傅列表能看到新状态。

### 7.2 资料认证/证件资料接口

如果现有 support 模块已经支持申请师傅资料，则优先复用。

需要确认：

```text
GET /staff/applications/me
POST /staff/applications
```

若接口已存在：

- `certificates.vue` 和 `verification.vue` 直接接入。

若接口不完整：

Day31 至少补：

1. 查询当前用户最近一条申请。
2. 已是 staff 时返回 approved 状态和 staff 基础资料。
3. 支持补充资料提交。
4. 后台审核列表能看到材料。

验收：

- 已认证师傅进入资料认证页显示已认证。
- 未认证用户进入显示可提交资料。
- 驳回后可重新提交。

## 8. 第五阶段：测试清单

### 8.1 抢单接口删除测试

执行：

```text
rg "available-orders|staffClaim|STAFF_CLAIM|staff_claim|claimStaffTask" server/src miniapp/src
```

预期：

- 无业务代码残留。
- 如历史文档中出现可以忽略，但源码不能出现。

接口测试：

1. `GET /api/staff/available-orders`
   - 预期 404
2. `GET /api/staff/available-orders/1`
   - 预期 404
3. `POST /api/staff/orders/1/claim`
   - 预期 404

### 8.2 师傅主流程回归

测试路径：

1. 后台派单。
2. 师傅端看到待接单。
3. 师傅接单。
4. 师傅出发。
5. 师傅开始服务。
6. 上传 1-6 张照片。
7. 完成服务。
8. 会员卡订单选择 60/120 分钟。
9. 后台查看履约记录和会员卡流水。

预期：

- 删除抢单接口后不影响后台派单流程。
- 不影响师傅接单流程。

### 8.3 个人中心入口测试

逐一点击：

```text
我的服务
证件管理
证件结算
资料认证
服务规则
联系客服
设置
```

设置页逐一点击：

```text
服务区域
接单设置
服务规则
通知设置
联系客服
关于我们
```

预期：

- 全部有页面。
- 无“当前不可用”。
- 页面无空白、无报错。

### 8.4 构建验证

后端：

```text
cd server
npm run build
```

小程序：

```text
cd miniapp
npm run type-check
npm run build:mp
```

后台如果修改了 staff 展示：

```text
cd admin
npm run type-check
npm run build
```

## 9. 验收标准

Day31 完成后必须满足：

1. 后端没有任何师傅抢单接口。
2. 订单状态不能被师傅从 `pending_dispatch` 直接变为 `accepted`。
3. 小程序没有 `claimStaffTask`、`available-orders`、`createStaffOrder not connected` 残留。
4. 师傅个人中心入口全部可进入页面。
5. 师傅设置页入口全部可进入页面。
6. 师傅端仍能完成后台派单后的履约主流程。
7. 构建全部通过。

## 10. 建议落地批次

### 批次 1：安全边界

1. 删除后端抢单接口。
2. 删除状态机抢单动作。
3. 删除小程序抢单 API。
4. 跑后端和小程序构建。

### 批次 2：基础页面

1. 新增服务规则。
2. 新增联系客服。
3. 新增关于我们。
4. 接入个人中心和设置页路由。

### 批次 3：师傅资料

1. 新增资料认证页。
2. 新增证件管理页。
3. 接入申请师傅/认证资料接口。

### 批次 4：工作与结算

1. 新增服务区域页。
2. 新增接单设置页和工作状态接口。
3. 新增证件结算页。
4. 新增通知设置页。

### 批次 5：回归验收

1. 搜索抢单残留。
2. 跑构建。
3. 跑后台派单到师傅完成的完整链路。
4. 检查所有个人中心入口。
