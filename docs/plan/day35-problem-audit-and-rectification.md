# Day35 问题纠察与整改计划：把线上反馈固定为可执行问题

更新时间：2026-07-08  
主题：围绕积分、派单通知、客户资料、外来订单、扫码注册、提现、地址定位 7 个反馈点，完成问题确认、边界收口、整改路径和验收标准定义。

## 1. 目标

Day35 不直接扩大业务范围，而是先把当前反馈从“体验不好 / 点了没反应 / 不明显”固定成可排查、可开发、可验收的问题清单。

本计划要达成：

1. 每个反馈点都有明确的问题编号、现象、影响、根因假设、落地文件和验收方式。
2. 后续开发可以按问题编号拆分任务，不再用口头描述追踪。
3. 对涉及交易、账号、安全、派单履约的问题，优先保证主链路可用和提示明确。
4. 对暂不能完整上线的能力，必须给出降级提示、操作反馈和后台可见的状态，不允许继续表现为“没反应”。

## 2. 本次纠察范围

本次固定 7 个问题：

| 编号 | 用户原始反馈 | 固定后的问题名称 | 优先级 |
| --- | --- | --- | --- |
| D35-01 | 消费积分系统不明显 | 积分入口、规则、明细和订单关联展示不够明显 | P1 |
| D35-02 | 派单给师傅没有消息提示 | 后台派单后师傅端缺少新任务提醒闭环 | P0 |
| D35-03 | 会员不能直接添加客户信息 | Admin 缺少新增客户及客户地址的一体化入口 | P1 |
| D35-04 | 小程序外来订单无法在后台派师傅正常 | 外部渠道订单进入后台后派单条件和状态不一致 | P0 |
| D35-05 | 扫码直接注册不需要验证码 | 当前手机号授权/注册链路保持现状，仅做边界确认 | 观察项 |
| D35-06 | 提现那个点了没反应 | 提现入口点击无反馈、状态不可解释或确认收款不可达 | P0 |
| D35-07 | 地址定位不好用 | 地址定位、地图选点、逆解析和手动兜底体验不稳定 | P1 |

## 3. 本次不做

1. 不引入复杂自动派单策略。
2. 不做积分商城、积分兑换、复杂会员等级。
3. 不做短信验证码平台接入；当前手机号授权/注册链路保持现状，不纳入 Day35 开发整改。
4. 不做完整站内信 IM，只先建立派单通知最小闭环。
5. 不改变 Day32 提现的资金状态机，只修复入口反馈、确认收款和异常提示。
6. 不重做地址体系，只补定位可用性、错误提示和手动兜底。

## 4. D35-01 消费积分系统不明显

### 4.1 当前现象

当前后端已有 `/user/points`，小程序在优惠券页里展示积分面板，但用户很难从“消费后获得积分”的角度理解它：

```text
server/src/users/users.controller.ts
server/src/users/users.service.ts
miniapp/src/api/points.ts
miniapp/src/pages/coupon/index.vue
```

已发现的体验问题：

1. 积分入口和“优惠券”混在一起，用户不容易知道消费有积分。
2. 订单支付完成、订单详情、个人中心缺少积分获得提示。
3. 积分规则描述依赖兜底文案，后端 `rule.description` 当前为空。
4. 只返回最近积分记录，没有独立“积分明细”页面或列表标题。
5. 积分目前按订单实时聚合，没有独立积分流水表，后续若做兑换、撤销、退款扣回会不够稳。

### 4.2 固定问题

消费积分系统不是“没有”，而是“入口弱、规则弱、消费后反馈弱、明细弱”。Day35 先把它定义为可见性和解释性问题。

### 4.3 整改方向

一次性实现积分可见性和积分流水基础能力，不再拆分阶段。当前仍不做积分兑换，只把消费积分做成清晰可见、可追溯、可验收的闭环：

1. 个人中心增加“我的积分”入口，显示当前可用积分。
2. 优惠券页标题调整为“优惠券与积分”或拆出 `/pages/points/index`。
3. 订单详情展示“本单预计/已获得积分”。
4. 支付成功页展示“本单获得 X 积分”。
5. 后端 `/user/points` 返回稳定规则文案。
6. 最近明细列表展示订单号、消费金额、积分、获得时间。

同步补积分流水基础模型：

```text
PointLedger
- id
- userId
- orderId
- type: earn / adjust / refund_deduct / expire
- points
- amount
- balanceAfter
- remark
- createdAt
```

### 4.4 验收标准

1. 用户从个人中心 1 次点击可进入积分页。
2. 完成一笔已支付订单后，订单详情能看到本单获得积分。
3. 积分页能看到可用积分、累计积分、计分消费、积分规则和最近 20 条明细。
4. 无订单用户看到空状态和规则说明，不展示假积分。
5. 执行 `rg "积分|points" miniapp/src server/src` 能定位到入口、接口和展示位置。

## 5. D35-02 派单给师傅没有消息提示

### 5.1 当前现象

当前后台派单会写订单状态和派单记录：

```text
server/src/orders/orders.service.ts
- assignOrder()
- orderAssignment.create()

admin/src/views/life/orders/index.vue
admin/src/views/life/orders/detail.vue
```

师傅端已有通知设置页面，但 Day31 明确只是本地偏好，未接系统通知：

```text
miniapp/src/pages/staff/notifications.vue
docs/plans/day31-staff-workbench-completion.md
```

已固定问题：

1. 后台派单成功后，师傅没有微信订阅消息、站内通知、红点或本地任务刷新提示。
2. 师傅只有主动打开师傅端订单列表才知道被派单。
3. 后台派单成功提示只面向管理员，不代表师傅已收到。
4. `OrderAssignment.assignStatus=pending` 缺少通知状态字段，无法审计“是否已通知”。

### 5.2 固定问题

这是派单履约 P0 问题。后台派单不是完整闭环，必须补“派单成功 -> 通知师傅 -> 师傅看到新任务 -> 师傅接单/拒单”的最小提醒闭环。

### 5.3 整改方向

一次性实现站内通知、红点提醒和微信订阅消息兜底，不再拆分阶段。微信订阅消息发送失败不阻断派单，但必须有站内通知兜底和失败记录：

```text
Notification
- id
- receiverType: staff / user / admin
- receiverId
- bizType: order_assigned
- bizId: orderId
- title
- content
- readAt
- createdAt
```

后台派单时：

1. `assignOrder()` 事务内创建 `Notification`。
2. `OrderAssignment` 增加通知状态或通知日志。
3. 师傅端首页、任务列表、消息页拉取未读通知。
4. 师傅端 tab 或入口显示未读红点。

同时接入微信订阅消息：

1. 师傅端提供订阅授权入口。
2. 后台派单后调用订阅消息。
3. 发送失败不阻断派单，但记录失败原因。
4. Admin 订单派单记录展示“站内通知已创建 / 微信通知成功或失败”。

### 5.4 主要落地文件

```text
server/prisma/schema.prisma
server/src/notifications/*
server/src/orders/orders.service.ts
miniapp/src/api/staff.ts
miniapp/src/pages/staff/home.vue
miniapp/src/pages/staff/orders.vue
miniapp/src/pages/staff/notifications.vue
admin/src/views/life/orders/detail.vue
```

### 5.5 验收标准

1. 后台派单给师傅后，师傅端首页出现新任务提醒。
2. 师傅端消息页出现“你有新的派单任务”。
3. 未读通知数量在师傅端可见，进入消息或订单详情后可标记已读。
4. 派单记录能看到通知创建结果。
5. 微信订阅消息未配置时，系统仍有站内通知兜底。

## 6. D35-03 会员不能直接添加客户信息

### 6.1 当前现象

当前 Admin 用户模块可以列表、详情、编辑、禁用、删除用户，但缺少明确的“新增客户”入口：

```text
server/src/admin-business/admin-business.controller.ts
- GET /admin/users
- GET /admin/users/:id
- PUT /admin/users/:id
- DELETE /admin/users/:id

admin/src/api/life/index.ts
admin/src/views/life/resource/index.vue
```

地址模块支持按 `ownerType=user` 和 `ownerId` 管理地址，但前端入口偏资源管理，不适合会员/客服现场新增客户：

```text
server/src/addresses/*
admin/src/api/life/index.ts
```

### 6.2 固定问题

这里的“会员不能直接添加客户信息”固定为：Admin 缺少面向运营/会员/客服的“新增客户 + 联系方式 + 服务地址 + 备注”的一体化入口，导致线下客户、电话客户、老客户资料无法快速录入，也影响外来订单派单。

### 6.3 整改方向

新增 Admin 客户创建能力：

```text
POST /api/admin/users
```

最小字段：

```text
nickname
phone
gender
cityCode
remark
status
address:
  contactName
  contactPhone
  provinceName
  cityName
  districtName
  streetName
  addressTitle
  detailAddress
  houseNumber
  latitude
  longitude
  isDefault
```

处理规则：

1. 手机号唯一匹配，已存在用户时提示“客户已存在”，允许跳转编辑。
2. 新增客户可不绑定 openid，但必须标记 `source=admin` 或类似来源。
3. 新增客户后可直接新增默认服务地址。
4. 操作写入 Admin 审计日志。
5. 后续后台代客下单必须能选择这个客户和地址。

### 6.4 主要落地文件

```text
server/src/admin-business/admin-business.controller.ts
server/src/admin-business/admin-business.service.ts
server/src/admin-business/dto/admin-business.dto.ts
server/prisma/schema.prisma
admin/src/api/life/index.ts
admin/src/api/life/types.ts
admin/src/views/life/resource/index.vue
```

### 6.5 验收标准

1. Admin 用户列表有“新增客户”按钮。
2. 填写手机号、姓名和地址后可以创建客户。
3. 创建后用户列表能搜索到该客户。
4. 客户详情能看到默认地址。
5. 重复手机号不会创建重复客户。
6. 无 openid 的后台客户不能走小程序登录态，但可用于后台建单和派单。

## 7. D35-04 小程序外来订单无法在后台派师傅正常

### 7.1 当前现象

订单创建目前主要来自小程序登录用户：

```text
POST /orders
server/src/orders/orders.controller.ts
server/src/orders/orders.service.ts
```

订单来源字段已有 `source`，推广链路已有 `promotionKey`，但后台缺少明确的“外来订单/代客订单”创建与派单闭环。

已发现的风险：

1. 外来订单如果没有标准 `userId/addressId/serviceId/orderType/status`，后台派单会失败或状态不允许。
2. `assignOrder()` 只负责从可派单状态进入 `dispatched`，不负责修复订单基础数据。
3. 师傅可见订单类型只允许 `service_booking` 和 `consultation`，外来订单如果类型不规范，师傅端不可见。
4. 外来订单如果仍处于 `pending_payment` 或缺少地址快照，后台派单不应该强行成功。

### 7.2 固定问题

这是外来订单标准化问题，不是单纯派单按钮问题。所有能派师傅的订单必须满足统一派单前置条件。

### 7.3 派单前置条件

后台派师傅前必须满足：

1. `orderType in service_booking / consultation`
2. `status = pending_dispatch`
3. 有有效 `userId`
4. 有完整 `addressSnapshot`
5. 有有效 `serviceSnapshot`
6. 有预约开始和结束时间
7. 有 `cityCode` 或可从地址/服务推导
8. 目标师傅 `status=active` 且未删除

不满足时，后台必须展示明确原因，例如：

```text
缺少客户信息，不能派单
缺少服务地址，不能派单
订单还未进入待派单，不能派单
外来订单类型不支持师傅履约
```

### 7.4 整改方向

一次性完成派单诊断、后台代客建单和外来订单来源标准化，不再拆分阶段。先补派单诊断：

```text
GET /api/admin/orders/:id/dispatch-check
```

返回：

```text
canAssign
blockingReasons[]
warnings[]
requiredFields[]
```

同时补后台代客建单：

```text
POST /api/admin/orders
```

允许 Admin 选择已有客户或创建新客户，选择服务、地址、预约时间、来源，然后生成 `pending_dispatch` 订单。

同时统一外来订单来源：

```text
source:
- miniapp
- admin
- phone
- offline
- video_channel
- promotion
```

### 7.5 主要落地文件

```text
server/src/orders/orders.controller.ts
server/src/orders/orders.service.ts
server/src/orders/dto/admin-create-order.dto.ts
server/src/orders/dto/assign-order.dto.ts
server/src/orders/order-presenter.ts
admin/src/views/life/orders/index.vue
admin/src/views/life/orders/detail.vue
admin/src/api/life/index.ts
```

### 7.6 验收标准

1. 外来订单在后台能看到来源、客户、地址、服务和状态。
2. 缺字段订单点击派单时显示具体阻断原因，而不是失败或无反应。
3. 符合条件的外来订单可以正常派给师傅。
4. 派单后师傅端订单列表能看到该任务。
5. 师傅能接单、拒单、出发、开始服务、完成服务。

## 8. D35-05 扫码直接注册不需要验证码

### 8.1 当前现象

当前微信小程序登录使用 `loginCode + phoneCode`：

```text
server/src/auth/auth.service.ts
- wechatLogin(loginCode, phoneCode)
miniapp/src/pages/login/index.vue
```

推广扫码入口会解析活动链接并跳转：

```text
miniapp/src/pages/promo/landing.vue
server/src/promotion-links/*
```

用户反馈中的“扫码直接注册不需要验证码”本次不作为待整改问题处理。当前小程序使用微信手机号授权注册/登录，这个现状可以保留；Day35 不新增短信验证码，也不调整扫码进入后的注册/登录链路。

### 8.2 固定结论

当前手机号注册/微信手机号授权链路先保持现状，不作为 Day35 开发整改项。

固定口径：

1. 小程序内注册/登录继续使用微信手机号授权能力，不额外增加短信验证码。
2. 当前不新增短信验证码平台接入。
3. 当前不修改扫码进入活动页后的登录跳转逻辑。
4. Admin 后台新增客户不属于用户自助注册，不要求验证码，但后续若开发新增客户功能，必须写入来源和审计日志。
5. 本问题只保留为边界确认项，后续除非出现审核或安全问题，否则不进入 Day35 执行批次。

### 8.3 本次不改动

```text
miniapp/src/pages/login/index.vue
miniapp/src/pages/promo/landing.vue
miniapp/src/router/interceptor.ts
server/src/auth/auth.service.ts
server/src/auth/auth.controller.ts
```

### 8.4 观察文件

```text
miniapp/src/pages/promo/landing.vue
miniapp/src/pages/login/index.vue
miniapp/src/router/interceptor.ts
miniapp/src/api/auth.ts
server/src/auth/auth.service.ts
server/src/auth/auth.controller.ts
```

### 8.5 确认标准

1. 当前扫码/手机号注册链路不做代码改动。
2. 当前小程序微信手机号授权登录保持可用。
3. 当前不新增短信验证码。
4. 后续如新增 H5 手机号注册，再单独立项验证码能力。

## 9. D35-06 提现那个点了没反应

### 9.1 当前现象

Day32 已规划并落地提现闭环相关页面和接口：

```text
server/src/withdrawals/*
miniapp/src/pages/staff/settlement.vue
miniapp/src/pages/staff/withdraw-create.vue
miniapp/src/pages/staff/withdraw-detail.vue
miniapp/src/utils/wechatTransfer.ts
admin/src/views/life/finance/withdraws.vue
```

用户反馈“点了没反应”需要拆成几个具体点击点：

1. 师傅结算页点击“申请提现”没反应。
2. 提交提现申请后没有跳转或没有 toast。
3. 提现详情页点击“确认收款”没反应。
4. Admin 点击审核、打款、重试、查单没反应。
5. 当前无可提现余额或有处理中提现单，但按钮只是 disabled，没有解释。

### 9.2 固定问题

提现不是单一按钮问题，而是“按钮状态、错误反馈、微信确认收款能力和后台处理状态”必须可解释。

### 9.3 整改方向

师傅端：

1. `申请提现` 不允许只有 disabled，必须显示不可点击原因。
2. 无 openid、余额不足、已有处理中提现单、未认证师傅分别给出明确提示。
3. 提交提现时显示 loading，成功后跳转提现详情。
4. 失败时展示后端错误 message，不吞异常。
5. `wait_user_confirm` 状态必须展示“确认收款”按钮。
6. `wx.requestMerchantTransfer` 不可用时提示“当前微信版本不支持确认收款，请升级微信或联系客服”。

Admin 端：

1. 审核、打款、重试、查单按钮必须有 loading。
2. 操作成功后刷新列表和详情。
3. 操作失败展示后端原因。
4. `WITHDRAW_PROVIDER=mock` 或未配置微信转账时，页面明确展示当前模式。

### 9.4 主要落地文件

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

### 9.5 验收标准

1. 不满足提现条件时，用户点击入口能看到明确原因。
2. 满足条件时，可以进入提现申请页。
3. 提交提现成功后进入提现详情。
4. 后台审核通过后，师傅端状态变为待确认收款或已到账。
5. 点击确认收款能调起微信确认；调不起时有明确提示。
6. Admin 所有提现操作按钮都有成功/失败反馈。

## 10. D35-07 地址定位不好用

### 10.1 当前现象

地址页当前同时支持地图选点和当前位置定位：

```text
miniapp/src/utils/location.ts
miniapp/src/pages/address/edit.vue
miniapp/src/pages/staff/address-edit.vue
server/src/maps/maps.service.ts
server/src/maps/providers/tencent-map.provider.ts
server/src/maps/providers/amap.provider.ts
```

已固定问题：

1. `chooseLocation` 失败时只返回 null，页面如果没有明确提示，就像没反应。
2. `getLocation` 权限被拒绝时没有引导用户开启权限。
3. 逆地址解析失败时缺少手动填写兜底。
4. 地图 provider、key、服务域名配置异常时，前端不易感知。
5. 定位返回的 `detailAddress` 可能过粗，用户还需要填写门牌号，但提示不够明显。

### 10.2 固定问题

地址定位问题固定为“权限、地图选点、逆解析、手动兜底、错误提示”五个环节的可用性问题。

### 10.3 整改方向

小程序端：

1. 定位按钮点击后显示 loading。
2. 失败时区分：用户取消、权限拒绝、地图服务失败、网络失败。
3. 权限拒绝时提供“打开设置”入口。
4. 地图选点失败后允许继续手动填写。
5. 定位成功后自动填充省市区、小区/POI、详细地址，但门牌号仍提示必填或建议填写。

后端：

1. `/maps/reverse-geocode` 返回 provider、原始经纬度、解析后的经纬度、formattedAddress。
2. 地图 key 未配置时返回明确错误，不返回空数据。
3. 增加地图接口 smoke test，确认生产环境域名和 key 可用。

### 10.4 主要落地文件

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

### 10.5 验收标准

1. 点击“定位当前地址”有 loading 和结果反馈。
2. 用户拒绝定位权限时，页面提示去设置开启权限。
3. 地图服务失败时，用户仍可手动保存地址。
4. 保存地址后订单创建能正确读取地址快照。
5. 后台地址列表能看到定位来源、经纬度和完整地址。

## 11. 执行批次

| 批次 | 范围 | 问题编号 | 目标 |
| --- | --- | --- | --- |
| 批次 1 | 派单和外来订单 | D35-02、D35-04 | 保证后台派单后师傅知道，并且外来订单可诊断、可派单 |
| 批次 2 | 提现 | D35-06 | 修复所有提现点击无反馈和确认收款不可解释问题 |
| 批次 3 | 客户信息 | D35-03 | 补 Admin 新增客户、地址和后续后台建单前置能力 |
| 批次 4 | 积分和地址体验 | D35-01、D35-07 | 强化积分可见性，提升定位失败兜底 |
| 观察项 | 扫码注册 | D35-05 | 当前保持现状，不纳入 Day35 开发整改 |

## 12. 回归测试清单

### 12.1 派单主链路

1. 准备一个 active 师傅。
2. 准备一个 `pending_dispatch` 订单。
3. Admin 派单。
4. 师傅端首页出现新任务提醒。
5. 师傅端订单列表出现该订单。
6. 师傅接单成功。

### 12.2 外来订单链路

1. Admin 创建或导入一个外来订单。
2. 缺客户时派单显示阻断原因。
3. 补客户和地址后派单成功。
4. 师傅端可见并能履约。

### 12.3 提现链路

1. 无余额师傅点击提现，看到余额不足提示。
2. 有余额师傅提交提现申请。
3. Admin 审核通过。
4. mock 模式下提现状态能走到已到账。
5. wechat 模式下能拿到确认收款参数或明确报错。

### 12.4 积分和地址

1. 用户完成支付后订单详情展示积分。
2. 个人中心能进入积分页。
3. 地址定位失败时可手动填写并保存。
4. 定位成功后可保存并用于下单。

## 13. 验收命令

```bash
rg -n "points|积分|user/points" miniapp/src server/src
rg -n "Notification|notification|通知|消息|order_assigned" miniapp/src server/src admin/src
rg -n "admin/orders|dispatch-check|assignOrder|pending_dispatch" server/src admin/src
rg -n "wechatLogin|phoneCode|promo/landing|用户协议|隐私政策" miniapp/src server/src
rg -n "withdraw|提现|requestMerchantTransfer" miniapp/src server/src admin/src
rg -n "chooseLocation|getLocation|reverseGeocode|定位当前地址" miniapp/src server/src
```

## 14. 完成定义

Day35 完成不是指 7 个问题全部开发完，而是指：

1. 每个问题都有明确编号和验收标准。
2. P0 问题能拆成开发任务并进入修复。
3. 页面上不再出现“点了没反应”的关键动作。
4. 不能完成的能力必须有明确提示和兜底路径。
5. 后台关键操作必须可审计，用户端关键状态必须可解释。
