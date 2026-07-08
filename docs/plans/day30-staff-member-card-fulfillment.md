# Day 30 - 师傅端会员卡履约闭环计划

## 1. 目标

本计划用于完善师傅端在当前真实服务商品体系下的第一版可用闭环。

第一版不做复杂派单、抢单池、距离匹配、技能匹配和自动调度。核心目标是：

1. 用户使用会员卡预约服务。
2. 下单时冻结会员卡权益。
3. 后台人工分配订单给师傅。
4. 师傅端完成接单、出发、开始、上传凭证、完成服务。
5. 完成服务后按实际服务情况扣减会员卡权益。
6. 取消订单时释放冻结权益。
7. 后台能够查看履约记录、照片和会员卡流水。

## 2. 当前真实商品基线

根据当前数据库启用服务商品，第一版按 `Service.cardType` 和 `Service.consumeUnit` 驱动，不在前端写死服务规则。

### 2.1 时间类服务

`cardType = time`

主要服务：

| 服务 | code | consumeUnit | 说明 |
| --- | --- | ---: | --- |
| 日常保洁 2 小时体验 | `svc_jijie_campaign_1` | 120 | 特惠体验，第一版建议现金下单 |
| 日常保洁 2 小时 | `svc_jijie_daily_cleaning_3` | 120 | 第一版会员卡主要适用服务 |
| 日常保洁 3 小时 | `svc_jijie_daily_cleaning_4` | 180 | 暂不开放会员卡 |
| 日常保洁 4 小时 | `svc_jijie_daily_cleaning_5` | 240 | 暂不开放会员卡 |

第一版只允许 `日常保洁 2 小时` 使用当前日常保洁季卡/年卡。

### 2.2 按次类服务

`cardType = times`

主要服务：

- 家电清洗：油烟机、洗衣机、空调挂机、热水器、冰箱清洗。
- 家居保洁：厨卫重点保洁。
- 软装清洗：沙发、床垫除螨。
- 精细保洁：全屋精细保洁、厨房重油污、卫生间水垢。
- 水电维修：水龙头角阀、开关插座、灯具安装维修。

这些服务大多 `consumeUnit = 1`。当前没有启用可购买的按次会员卡，第一版按现金订单处理，不接入日常保洁时间卡。

### 2.3 按面积或非标准服务

`cardType = none`

主要服务：

- 窗帘上门拆洗。
- 地毯清洗。
- 新居开荒保洁。
- 居家玻璃清洁。
- 高层玻璃清洁。
- 会员卡购买虚拟商品。

这些服务第一版不允许选择会员卡。

### 2.4 咨询类服务

`cardType = consultation`

主要服务：

- 办公室日常保洁咨询。
- 企业开荒保洁咨询。

咨询类订单不走普通师傅履约扣卡流程。

### 2.5 当前启用会员卡

| 会员卡 | cardType | totalUnits | unitName | unitMinutes | minConsumeUnits | allowHalfDeduct |
| --- | --- | ---: | --- | ---: | ---: | --- |
| 日常保洁季卡 | `time` | 720 | 分钟 | 120 | 60 | true |
| 日常保洁年卡 | `time` | 1440 | 分钟 | 120 | 60 | true |

第一版规则：

- 日常保洁 2 小时下单冻结 120 分钟。
- 师傅完成时如果实际服务 120 分钟，最终扣 120 分钟。
- 师傅完成时如果实际服务 60 分钟，最终扣 60 分钟，并释放剩余 60 分钟。
- 3 小时/4 小时暂不开放会员卡，后续只需扩展会员卡 `applicableServices`。

## 3. 总体实现边界

### 3.1 第一版要做

1. 商品和会员卡规则按后端字段驱动。
2. 师傅端只展示分配给自己的订单。
3. 后台人工分配订单给师傅。
4. 师傅端完成基础履约动作。
5. 时间卡支持 2 小时服务按 120 或 60 分钟最终扣减。
6. 会员卡取消释放、完成扣减、后台可追踪。
7. 服务照片真实上传并在后台可查看。

### 3.2 第一版不做

1. 不做自动派单。
2. 不做抢单池。
3. 不做距离匹配。
4. 不做技能匹配。
5. 不做复杂服务区域规则。
6. 不做师傅主动开单。
7. 不做复杂佣金和奖金结算。

## 4. Day30：商品规则和会员卡规则落地

### 4.1 目标

先把当前真实服务商品和会员卡规则固化，保证后续师傅端不写死业务规则。

### 4.2 涉及文件

```text
server/prisma/schema.prisma
server/src/member-cards/member-cards.service.ts
server/src/orders/orders.service.ts
server/src/orders/dto/create-order.dto.ts
miniapp/src/api/member-cards.ts
miniapp/src/pages/order/confirm.vue
miniapp/src/pages/service/detail.vue
```

具体文件名以当前项目实际页面为准，若页面路径不同，按 `rg "memberCard|会员卡|createOrder"` 搜索定位。

### 4.3 执行步骤

1. 查询当前启用服务商品。
   - 查询条件：`services.status = 1` 且 `deletedAt = null`。
   - 输出字段：`code / name / category / cardType / consumeUnit / durationMinutes / priceUnit`。
   - 将服务分为 `time / times / none / consultation` 四类。

2. 查询当前启用会员卡。
   - 查询条件：`member_cards.status = 1`。
   - 输出字段：`name / cardType / totalUnits / unitMinutes / minConsumeUnits / allowHalfDeduct / applicableServices`。
   - 确认当前季卡、年卡只适用于 `svc_jijie_daily_cleaning_3` 或服务名 `日常保洁 2 小时`。

3. 固定第一版会员卡适用范围。
   - 保留日常保洁季卡/年卡适用于 `日常保洁 2 小时`。
   - 暂不把 3 小时、4 小时加入 `applicableServices`。
   - 暂不把特惠体验服务加入会员卡适用范围。

4. 检查 `MemberCardsService.isCardApplicable()`。
   - 必须校验用户卡状态为 active。
   - 必须校验未过期。
   - 必须校验 `userCard.card.cardType === serviceCardType`。
   - 必须校验 `applicableServices` 命中服务 id、code 或 name。
   - `cardType = none` 和 `consultation` 必须返回不可用。

5. 检查 `MemberCardsService.calculateConsumeUnits()`。
   - 时间卡优先使用服务 `consumeUnit`。
   - `日常保洁 2 小时` 应返回 120。
   - 按次卡优先使用服务 `consumeUnit`。
   - 无法计算时不得返回 0 后继续下单。

6. 检查 `OrdersService.createOrder()`。
   - 使用会员卡下单时，订单初始状态进入待派单。
   - 使用会员卡下单时，`payableAmount = 0`。
   - 事务内调用 `freezeForOrder()`。
   - 订单写入 `memberCardId`。
   - 订单写入 `memberCardConsumeUnits`。

7. 检查前端下单会员卡选择。
   - 会员卡列表必须来自后端可用卡接口。
   - 前端不要按服务名或 code 写死判断。
   - 没有可用卡时隐藏会员卡选择入口。
   - `cardType = none` 或 `consultation` 服务不要显示会员卡选择。

8. 补充必要的后端错误文案。
   - 会员卡不可用：提示会员卡不可用于当前服务。
   - 余额不足：提示会员卡余额不足。
   - 已过期：提示会员卡已过期。
   - 服务不支持会员卡：提示当前服务暂不支持会员卡。

### 4.4 验收清单

- [ ] 日常保洁 2 小时可以选择日常保洁季卡/年卡。
- [ ] 日常保洁 2 小时下单后冻结 120 分钟。
- [ ] 日常保洁 3 小时暂不能选择会员卡。
- [ ] 日常保洁 4 小时暂不能选择会员卡。
- [ ] 家电清洗不能选择日常保洁时间卡。
- [ ] 按面积服务不显示会员卡入口。
- [ ] 咨询服务不显示会员卡入口。

## 5. Day31：师傅端任务流简化

### 5.1 目标

师傅端第一版只处理“分配给我的订单”，不做复杂派单和抢单。

### 5.2 涉及文件

```text
miniapp/src/pages/staff/home.vue
miniapp/src/pages/staff/orders.vue
miniapp/src/pages/staff/order-detail.vue
miniapp/src/pages/staff/upload-photos.vue
miniapp/src/api/staff.ts
miniapp/src/api/types/staff.ts
server/src/orders/orders.controller.ts
server/src/orders/orders.service.ts
```

### 5.3 执行步骤

1. 调整师傅首页入口。
   - 保留“我的任务”。
   - 隐藏或弱化“可抢订单”。
   - 去掉会让用户误解为自动派单/抢单的文案。
   - 入口默认跳转到分配给自己的订单列表。

2. 调整订单列表数据源。
   - 使用 `GET /api/staff/orders`。
   - 第一版不主动调用 `GET /api/staff/available-orders`。
   - 若保留可接订单接口，仅作为后续功能，不在页面主流程展示。

3. 设计订单状态分组。
   - 待接单：后台已分配但师傅未确认。
   - 待上门：师傅已接单。
   - 服务中：师傅已开始服务。
   - 已完成：服务完成。

4. 订单列表展示字段。
   - 服务名称。
   - 预约时间。
   - 地址简要。
   - 当前状态。
   - 是否会员卡订单。
   - 预计扣减额度。
   - 联系人简要信息。

5. 订单详情展示基础信息。
   - 订单号。
   - 服务名称。
   - 服务类型。
   - 预约开始时间。
   - 预约结束时间。
   - 用户地址。
   - 联系人。
   - 联系电话。
   - 用户备注。
   - 当前状态。

6. 订单详情展示会员卡信息。
   - 会员卡名称。
   - 冻结额度。
   - 预计扣减额度。
   - 单位：分钟或次。
   - 时间类服务显示预计服务时长。
   - 非会员卡订单显示现金订单或不展示扣卡模块。

7. 调整订单动作按钮。
   - 待接单：显示接单、拒绝。
   - 待上门：显示出发。
   - 已出发：显示开始服务。
   - 服务中：显示上传照片、完成服务。
   - 已完成：只读，不显示操作按钮。

8. 完成服务前增加实际服务时长。
   - 第一版只对时间卡订单展示。
   - 日常保洁 2 小时订单提供两个选项：60 分钟、120 分钟。
   - 默认选中 120 分钟。
   - 提交完成服务时传 `actualMinutes`。

9. 按服务类型区分提示。
   - 时间类会员卡订单：显示“本次预计扣 120 分钟”。
   - 时间类现金订单：显示“本次现金支付，不扣会员卡”。
   - 按次类订单：显示“本次服务 1 次”。
   - 按面积订单：显示“按面积计费，不使用会员卡”。
   - 咨询订单：显示“咨询订单，不扣会员卡”。

10. 导航能力第一版保持简单。
    - 若有经纬度，可调用小程序打开位置。
    - 若没有经纬度，提供复制地址。
    - 不做路线规划。

### 5.4 验收清单

- [ ] 师傅首页不再主推抢单池。
- [ ] 师傅能看到后台分配给自己的订单。
- [ ] 师傅能接单、拒绝、出发、开始服务、完成服务。
- [ ] 日常保洁 2 小时会员卡订单完成时可选择 60/120 分钟。
- [ ] 非会员卡订单不展示错误扣卡信息。

## 6. Day32：后端师傅订单接口补齐

### 6.1 目标

让师傅端需要的数据都由后端真实返回，减少前端解析快照和猜字段。

### 6.2 涉及文件

```text
server/src/orders/orders.controller.ts
server/src/orders/orders.service.ts
server/src/orders/orders.repository.ts
server/src/orders/dto/complete-service.dto.ts
server/src/orders/order-state-machine.ts
server/src/member-cards/member-cards.service.ts
miniapp/src/api/types/staff.ts
```

### 6.3 执行步骤

1. 梳理现有师傅接口。
   - `GET /api/staff/orders`
   - `GET /api/staff/orders/:id`
   - `POST /api/staff/orders/:id/accept`
   - `POST /api/staff/orders/:id/reject`
   - `POST /api/staff/orders/:id/on-the-way`
   - `POST /api/staff/orders/:id/start-service`
   - `POST /api/staff/orders/:id/complete`

2. 补订单列表 presenter 字段。
   - `orderId`
   - `orderNo`
   - `status`
   - `serviceName`
   - `serviceCardType`
   - `appointmentStartTime`
   - `appointmentEndTime`
   - `addressText`
   - `contactName`
   - `contactPhone`
   - `memberCardName`
   - `memberCardConsumeUnits`
   - `memberCardUnitName`
   - `payableAmount`

3. 补订单详情 presenter 字段。
   - `acceptedAt`
   - `onTheWayAt`
   - `startedAt`
   - `completedAt`
   - `servicePhotos`
   - `memberCard`
   - `frozenUnits`
   - `plannedConsumeUnits`
   - `actualConsumeUnits`
   - `releasedUnits`
   - `memberCardRecords`

4. 推导履约时间线。
   - `acceptedAt` 来自订单分配或状态日志。
   - `onTheWayAt` 来自出发打卡记录。
   - `startedAt` 来自开始服务打卡记录。
   - `completedAt` 来自订单完成时间或完成打卡记录。
   - 如果历史数据缺失，字段返回 `null`，前端显示为未记录。

5. 完成服务 DTO 确认字段。
   - `version`：防止并发状态更新。
   - `actualMinutes`：时间卡实际服务时长。
   - `photoUrls`：服务照片 URL。
   - `remark`：师傅完成备注。

6. 完成服务事务内处理。
   - 校验订单存在。
   - 校验订单属于当前师傅。
   - 校验订单处于服务中状态。
   - 校验 version。
   - 更新订单状态为完成。
   - 写服务完成打卡记录。
   - 保存服务照片。
   - 调用 `consumeForCompletedOrder()`。
   - 写订单状态日志。

7. 校验会员卡半扣。
   - 订单冻结 120。
   - `actualMinutes = 120` 时扣 120。
   - `actualMinutes = 60` 时扣 60，释放 60。
   - `actualMinutes` 不传时按预约/服务配置扣完整额度。
   - 实际扣减不得大于冻结额度。

8. 校验取消释放。
   - 会员卡订单取消时调用 `releaseFrozenForOrder()`。
   - 已释放过的订单重复取消不重复释放。
   - 现金订单取消不写会员卡流水。
   - 会员卡购买订单不走服务预约取消逻辑。

9. 保证接口幂等和错误处理。
   - 已完成订单再次完成返回状态不允许。
   - 已取消订单不能继续履约。
   - 非当前师傅订单禁止操作。
   - 会员卡余额异常时事务回滚。

### 6.4 验收清单

- [ ] 师傅订单列表字段完整，不需要前端手动解析复杂快照。
- [ ] 师傅订单详情能展示完整履约时间线。
- [ ] 完成服务能保存照片和实际服务时长。
- [ ] 会员卡订单完成后余额正确。
- [ ] 重复完成不会重复扣卡。
- [ ] 取消订单能释放冻结额度。

## 7. Day33：服务照片和后台适配

### 7.1 目标

师傅履约有凭证，后台能查看订单履约过程和会员卡扣减原因。

### 7.2 涉及文件

```text
miniapp/src/pages/staff/upload-photos.vue
miniapp/src/pages/staff/order-detail.vue
miniapp/src/api/upload.ts
miniapp/src/api/staff.ts
server/src/upload/upload.controller.ts
server/src/orders/orders.service.ts
admin/src/resources/orders
admin/src/resources/memberCards
admin/src/resources/userMemberCards
```

后台资源路径按当前项目实际结构调整。

### 7.3 执行步骤

1. 调整师傅端照片上传。
   - 不再只写本地缓存。
   - 调用真实上传接口获取 URL 或 OSS key。
   - 上传成功后把 URL 写入订单完成参数。
   - 上传失败时提示用户重试。

2. 完成服务前校验照片。
   - 第一版要求至少 1 张。
   - 最多 6 张。
   - 图片上传中不能点击完成。
   - 上传失败不能静默完成。

3. 完成服务提交照片。
   - 提交 `photoUrls`。
   - 后端保存到 `ServicePhoto`。
   - 订单详情返回签名后的可访问地址。

4. 后台订单详情增加履约信息。
   - 师傅姓名。
   - 师傅手机号。
   - 接单时间。
   - 出发时间。
   - 开始服务时间。
   - 完成时间。
   - 实际服务时长。
   - 服务照片。

5. 后台订单详情增加会员卡信息。
   - 使用的会员卡名称。
   - 冻结额度。
   - 实际扣减额度。
   - 释放额度。
   - 当前订单相关会员卡流水。

6. 后台会员卡流水可读化。
   - `freeze` 显示为冻结。
   - `consume` 显示为消费。
   - `release` 显示为释放。
   - 显示对应订单号。
   - 显示操作人类型和操作时间。
   - 显示扣减前后余额。

7. 后台分配继续保持简单。
   - 后台人工选择师傅。
   - 不新增自动派单配置。
   - 不新增技能匹配规则。
   - 不新增抢单池配置。

### 7.4 验收清单

- [ ] 师傅上传照片后，完成订单时照片能保存。
- [ ] 后台订单详情能查看服务照片。
- [ ] 后台能看到实际服务 60/120 分钟。
- [ ] 后台能解释为什么扣了 60 或 120 分钟。
- [ ] 会员卡流水和订单状态一致。

## 8. Day34：真实商品全链路测试

### 8.1 目标

按当前真实商品和真实会员卡跑完整链路，确认第一版业务闭环稳定。

### 8.2 准备数据

1. 准备一个普通用户。
2. 准备一个已审核师傅。
3. 用户购买或后台发放一张日常保洁季卡。
4. 确认用户卡状态为 active。
5. 确认用户卡未过期。
6. 确认用户卡 `remainingUnits > 0`。
7. 确认用户存在服务地址。

### 8.3 测试用例 1：2 小时完整扣减

1. 用户选择 `日常保洁 2 小时`。
2. 用户选择日常保洁季卡。
3. 用户提交预约。
4. 检查订单状态进入待派单。
5. 检查用户卡冻结 120 分钟。
6. 后台分配师傅。
7. 师傅接单。
8. 师傅出发。
9. 师傅开始服务。
10. 师傅上传至少 1 张照片。
11. 师傅选择实际服务 120 分钟。
12. 师傅完成服务。
13. 检查订单状态为完成。
14. 检查用户卡扣减 120 分钟。
15. 检查冻结额度归零。
16. 检查会员卡流水包含 freeze 和 consume。

### 8.4 测试用例 2：2 小时拆成 1 小时使用

1. 用户再次选择 `日常保洁 2 小时`。
2. 用户选择日常保洁季卡。
3. 用户提交预约。
4. 检查冻结 120 分钟。
5. 后台分配师傅。
6. 师傅完成履约流程。
7. 完成时选择实际服务 60 分钟。
8. 检查订单状态为完成。
9. 检查用户卡最终只扣 60 分钟。
10. 检查剩余 60 分钟被冻结额度已释放。
11. 检查会员卡流水包含 freeze、consume、release。

### 8.5 测试用例 3：会员卡订单取消

1. 用户选择 `日常保洁 2 小时`。
2. 用户选择日常保洁季卡。
3. 用户提交预约。
4. 检查冻结 120 分钟。
5. 用户或后台取消订单。
6. 检查订单状态为取消。
7. 检查冻结额度释放。
8. 检查不生成现金退款单。
9. 检查会员卡流水包含 freeze 和 release。

### 8.6 测试用例 4：不适用商品

1. 用户选择 `日常保洁 3 小时`。
   - 预期：不展示当前日常保洁卡。
2. 用户选择 `日常保洁 4 小时`。
   - 预期：不展示当前日常保洁卡。
3. 用户选择家电清洗服务。
   - 预期：不展示日常保洁时间卡。
4. 用户选择按面积服务。
   - 预期：不展示会员卡选择。
5. 用户选择咨询服务。
   - 预期：不展示会员卡选择，不进入普通扣卡履约。

### 8.7 测试用例 5：异常和幂等

1. 余额不足下单。
   - 预期：下单失败，提示余额不足。
2. 过期会员卡下单。
   - 预期：下单失败，提示会员卡不可用。
3. 已取消订单继续接单。
   - 预期：操作失败。
4. 已完成订单再次完成。
   - 预期：操作失败，不重复扣卡。
5. 非当前师傅操作订单。
   - 预期：权限失败。
6. 重复取消会员卡订单。
   - 预期：不重复释放。
7. 上传照片失败后完成订单。
   - 预期：阻止完成。

### 8.8 数据一致性检查

每轮测试后检查：

1. `orders.status` 是否正确。
2. `orders.memberCardConsumeUnits` 是否正确。
3. `user_member_cards.remainingUnits` 是否正确。
4. `user_member_cards.frozenUnits` 是否正确。
5. `member_card_records` 是否完整。
6. `service_checkins` 是否完整。
7. `service_photos` 是否完整。
8. `order_status_logs` 是否完整。

## 9. 推荐实现顺序

严格按以下顺序执行，避免前端先行后接口缺字段：

1. Day30：先确认并固化商品和会员卡规则。
2. Day32：先补后端师傅订单字段和完成服务能力。
3. Day31：再调整师傅端页面和交互。
4. Day33：补照片上传和后台查看。
5. Day34：按真实数据完整测试。

虽然文档按 Day30 到 Day34 编排，但实际开发时建议先做后端字段，再接前端页面。

## 10. 最终完成标准

完成后系统应满足：

1. 日常保洁季卡/年卡可以预约日常保洁 2 小时。
2. 会员卡订单下单时冻结 120 分钟。
3. 后台可以人工分配订单给师傅。
4. 师傅可以接单、出发、开始服务、上传照片、完成服务。
5. 实际服务 120 分钟时扣 120 分钟。
6. 实际服务 60 分钟时扣 60 分钟并释放 60 分钟。
7. 取消会员卡订单时释放冻结额度。
8. 后台能查看服务照片、履约时间线和会员卡流水。
9. 按面积、咨询、非适用服务不会误用会员卡。
10. 重复完成、重复取消不会导致重复扣减或重复释放。

## 11. 风险和注意事项

1. 当前日常保洁季卡/年卡只适用于 2 小时服务，不要在前端擅自开放 3 小时/4 小时。
2. 2 小时拆成两次使用依赖完成服务时传 `actualMinutes = 60`，不是单纯页面展示。
3. 会员卡扣减必须在事务内完成，避免订单完成但扣卡失败。
4. 服务照片上传失败不能让订单静默完成。
5. 后台显示的会员卡流水要能解释每次冻结、消费和释放，否则后续客服很难排查。
6. 如果后续新增 5 次卡/10 次卡，应优先通过后台会员卡模板配置实现，不要改前端写死规则。
