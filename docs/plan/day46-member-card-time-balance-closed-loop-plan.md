# Day46 会员卡时长余额闭环核查与补全计划

更新时间：2026-07-09  
目标版本：`1.0.3` 后续迭代  
目标模块：会员卡购买、服务预约、师傅履约、后台用户会员卡管理、小程序卡包  
核心目标：用户购买一张时长类会员卡后，系统能够完成预约冻结、师傅确认实际核销时间、订单完成扣减、Admin 手动调整单张会员卡时间，并让用户端、师傅端、Admin 端都能看到一致的剩余可用时间。

## 1. 闭环目标

Day46 要固定的会员卡时长闭环如下：

```text
用户购买会员卡 -> 支付/线下收款发卡 -> 用户用会员卡预约服务 -> 系统冻结预计时长
-> 师傅服务完成时确认实际服务时长 -> 系统核销实际时长并释放未用冻结时长
-> Admin 可对某张用户会员卡手动增减/改为指定剩余时长 -> 三端查看同一张卡最新剩余时间
```

闭环完成后必须满足：

1. 用户端卡包显示该会员卡的总剩余时间、冻结时间、可用时间。
2. 师傅端订单详情和完成服务动作中能看到本单预计扣减、实际核销、释放时间，并在完成服务时确认具体时长。
3. Admin 用户会员卡列表和详情页能查看每张卡的剩余时间、冻结时间、可用时间、核销流水、后台调整记录。
4. Admin 可以修改某一张用户会员卡的时间，修改动作必须有原因、操作人和流水记录。
5. 订单核销、后台调整后，三端再次查询的数据必须一致。

## 2. 当前已有能力

### 2.1 后端已有能力

当前后端已经具备会员卡基础链路：

1. `MemberCardsService.createPurchaseOrder` 支持用户购买会员卡订单。
2. `MemberCardsService.createAdminPurchaseOrder` 支持后台录入会员卡购买订单。
3. `MemberCardsService.grantForPaidPurchaseOrder` 支持支付或线下收款后发卡。
4. `MemberCardsService.freezeForOrder` 支持会员卡预约订单冻结预计扣减额度。
5. `MemberCardsService.consumeForCompletedOrder` 支持服务完成后扣减实际额度，并释放未使用冻结额度。
6. `CompleteServiceDto.actualMinutes` 已存在，师傅完成服务时可以传入实际服务分钟数。
7. `UserMemberCard` 已有 `remainingUnits`、`frozenUnits`、`remainingTimes` 字段，可承载总剩余、冻结、兼容次数。
8. `MemberCardRecord` 已有 `beforeUnits`、`afterUnits`、`operatorType`、`operatorId`、`remark`，可以记录余额变动前后值。

### 2.2 Admin 已有能力

当前 Admin 已有：

1. 会员卡模板管理。
2. 用户会员卡列表和详情查询。
3. 用户会员卡状态修改。
4. 会员卡流水列表。
5. 订单详情中的会员卡流水展示。

### 2.3 小程序已有能力

当前用户端和师傅端已有：

1. 用户端“我的卡包”展示会员卡可用余额。
2. 用户端下单页可以选择可用会员卡。
3. 师傅端订单详情展示冻结、已扣、释放。
4. 师傅端完成时间类会员卡订单时，会要求选择实际服务分钟数并提交 `actualMinutes`。

## 3. 当前未闭环问题

### 3.1 Admin 缺少单张用户会员卡时间调整入口

当前 Admin 可以改用户会员卡状态，但没有明确的“调整剩余时间”动作。数据异常、客户补偿、线下沟通改时长、手动修正核销结果时，只能依赖数据库或绕路处理，不适合交付使用。

必须补全：

1. 用户会员卡详情页增加“调整时间”按钮。
2. 支持按“增加/扣减分钟数”和“直接改为指定剩余分钟数”两种方式调整。
3. 每次调整必须填写原因。
4. 后端必须生成会员卡流水和审计日志。

### 3.2 会员卡流水类型缺少后台调整

当前会员卡流水类型主要是：

```text
grant / freeze / consume / release / refund_revoke
```

缺少用于余额修正的：

```text
admin_adjust
```

必须补全：

1. 后端常量加入 `admin_adjust`。
2. Admin 会员卡流水筛选项加入“后台调整”。
3. 流水展示 `units`、`beforeUnits`、`afterUnits`、`remark`，让管理员能追溯改动原因。

### 3.3 三端余额展示口径不统一

当前系统内部有 `remainingUnits`、`frozenUnits`、`usableUnits`，但不同页面的展示口径不完全一致。

Day46 必须统一为：

| 字段 | 含义 | 展示名称 |
| --- | --- | --- |
| `remainingUnits` | 卡内总剩余时间，包含已冻结未核销部分 | 总剩余 |
| `frozenUnits` | 已被预约订单占用但尚未最终核销的时间 | 已冻结 |
| `usableUnits` | 当前还能继续预约使用的时间 | 可用余额 |
| `actualConsumeUnits` | 服务完成时实际核销的时间 | 实际核销 |
| `releasedUnits` | 预约冻结后未使用并释放的时间 | 已释放 |

时间卡统一用“分钟”展示；如果后续要显示“小时”，只能做展示层换算，数据库仍以分钟作为标准单位。

### 3.4 师傅端实际核销时间交互仍需固化

当前师傅端已有实际分钟数选择，但交互较粗：只给半程和预计时长两个选项。Day46 要把它固定为闭环规则，而不是临时选择。

必须补全：

1. 时间类会员卡订单完成服务时，必须确认实际服务时长。
2. 默认选项包含预计时长、半时长；如业务需要，可增加手动输入分钟数。
3. 后端校验实际核销不能超过冻结时长。
4. 核销成功后，师傅端订单详情刷新展示“实际核销”和“已释放”。

### 3.5 用户端订单详情缺少会员卡核销区块

用户端卡包能看到余额，但订单详情当前没有明显展示本单会员卡扣减过程。用户无法从某个订单直接确认“本单扣了多少时间，剩余多少”。

必须补全：

1. 用户订单详情增加“会员卡使用”区块。
2. 展示会员卡名称、预计冻结、实际核销、已释放。
3. 服务完成后展示本单核销后的卡内剩余时间。
4. 卡包页展示总剩余、已冻结、可用余额，避免只看可用余额造成误解。

## 4. 统一业务规则

### 4.1 购买与发卡

1. 用户小程序购买会员卡，支付完成后生成一张 `UserMemberCard`。
2. Admin 线下录入会员卡购买订单，确认收款后生成一张 `UserMemberCard`。
3. 发卡流水为 `grant`，`beforeUnits` 为 0，`afterUnits` 为发放总时长。
4. 时长卡的 `totalUnits`、`remainingUnits`、`frozenUnits` 都以分钟为单位。

### 4.2 预约冻结

1. 用户或 Admin 创建服务预约订单时，如果选择会员卡支付，后端调用 `freezeForOrder`。
2. 冻结额度取服务规则中的 `consumeUnits`。
3. 冻结后：

```text
remainingUnits 不变
frozenUnits 增加
usableUnits = remainingUnits - frozenUnits
```

4. 冻结流水为 `freeze`，记录冻结前后的可用余额。

### 4.3 师傅确认实际服务时长

1. 只有时间类会员卡订单需要师傅确认实际分钟数。
2. 师傅完成服务时必须上传服务照片，并选择或输入实际服务时长。
3. `actualMinutes` 必须大于 0，且不能超过本单冻结时长。
4. 如果实际服务时长小于冻结时长，剩余冻结部分自动释放。

### 4.4 完成核销

1. 订单完成服务后生成 `consume` 流水。
2. 如果实际核销小于冻结，额外生成 `release` 流水。
3. 核销后：

```text
remainingUnits = remainingUnits - actualConsumeUnits
frozenUnits = frozenUnits - reservedUnits
usableUnits = remainingUnits - frozenUnits
```

4. 如果 `remainingUnits <= 0`，用户会员卡状态改为 `used_up`。

### 4.5 Admin 调整单张会员卡时间

Admin 调整必须遵守：

1. 只能调整具体某张 `UserMemberCard`，不能直接改会员卡模板来影响已购买卡。
2. 调整模式支持两种：`delta` 增减指定分钟数，`target` 直接设置总剩余分钟数。
3. 新的 `remainingUnits` 不能小于 `frozenUnits`，否则会导致已有预约无法核销。
4. 如果调整后 `remainingUnits > 0` 且未过期，可以把 `used_up` 卡恢复为 `active`；停用和退款卡不自动恢复。
5. 调整后必须同步更新 `remainingTimes`，保持旧字段兼容。
6. 调整必须生成 `admin_adjust` 流水，记录 `beforeUnits`、`afterUnits`、`units`、`operatorType=admin`、`operatorId`、`remark`。
7. 调整必须写入 Admin 审计日志，方便追责。

## 5. 后端改造计划

### 5.1 增加会员卡后台调整常量

文件：

```text
server/src/member-cards/constants/member-card.ts
```

新增：

```text
MEMBER_CARD_RECORD_TYPE.ADMIN_ADJUST = 'admin_adjust'
```

验收标准：会员卡流水中能保存并筛选 `admin_adjust`。

### 5.2 增加 Admin 调整用户会员卡接口

文件：

```text
server/src/admin-business/admin-business.controller.ts
server/src/admin-business/admin-business.service.ts
```

建议接口：

```text
POST /api/admin/user-member-cards/:id/adjust-time
```

请求体：

```json
{
  mode: delta,
  deltaUnits: 30,
  targetRemainingUnits: null,
  reason: 客户补偿30分钟
}
```

字段规则：

| 字段 | 说明 |
| --- | --- |
| `mode` | `delta` 或 `target` |
| `deltaUnits` | 增减分钟数，`delta` 模式必填，不能为 0 |
| `targetRemainingUnits` | 调整后的总剩余分钟数，`target` 模式必填 |
| `reason` | 必填，最多 200 字 |

后端处理：

1. 查询当前用户会员卡并锁定当前值。
2. 计算调整后的 `remainingUnits`。
3. 校验 `remainingUnits >= frozenUnits`。
4. 更新 `remainingUnits`、`remainingTimes`、必要时更新 `status`。
5. 创建 `MemberCardRecord`，`recordType=admin_adjust`。
6. 写入审计日志 `user-member-card:time:adjust`。
7. 返回调整后的用户会员卡详情。

### 5.3 补全订单详情中的会员卡余额快照

文件：

```text
server/src/orders/order-presenter.ts
server/src/orders/orders.repository.ts
```

目标：订单详情返回的 `memberCard` 对象至少包含：

```text
id / name / cardType / unitName / remainingUnits / frozenUnits / usableUnits / status
```

验收标准：用户端和师傅端打开订单详情时，不需要额外查卡包，也能看到本单关联会员卡的最新余额。

### 5.4 强化实际时长核销校验

文件：

```text
server/src/orders/dto/complete-service.dto.ts
server/src/member-cards/member-cards.service.ts
server/src/orders/orders.service.ts
```

规则：

1. 时间类会员卡订单完成服务时，`actualMinutes` 必须存在。
2. `actualMinutes` 必须为正整数。
3. `actualMinutes <= memberCardConsumeUnits`。
4. 非时间类订单忽略 `actualMinutes`。
5. 校验失败返回明确错误，不生成服务完成记录。

## 6. Admin 前端改造计划

### 6.1 用户会员卡列表展示优化

文件：

```text
admin/src/api/life/index.ts
admin/src/views/life/resource/index.vue
```

修改内容：

1. 用户会员卡列表字段改成更业务化的列名：`remainingUnits` 为总剩余，`frozenUnits` 为已冻结，`usableUnits` 为可用余额。
2. 时间卡显示单位为“分钟”。
3. 增加行操作“调整时间”。
4. 调整成功后刷新用户会员卡列表和会员卡流水列表。

### 6.2 调整时间弹窗

弹窗字段：

1. 当前卡名、用户、手机号。
2. 当前总剩余、已冻结、可用余额。
3. 调整方式：增加/扣减、改为指定剩余。
4. 调整分钟数或目标剩余分钟数。
5. 调整原因。
6. 调整后预览：总剩余、已冻结、可用余额。

前端校验：

1. 调整原因必填。
2. 增减分钟数不能为 0。
3. 目标剩余不能小于已冻结。
4. 调整后可用余额不能为负。

### 6.3 会员卡流水补充后台调整

文件：

```text
admin/src/api/life/index.ts
admin/src/views/life/resource/index.vue
```

修改内容：

1. `memberCardRecordTypeOptions` 增加“后台调整”。
2. `formatValue` 的 tag 映射支持 `admin_adjust`。
3. 流水列表能通过类型筛选查看所有后台调整记录。

## 7. 用户端小程序改造计划

### 7.1 卡包余额展示

文件：

```text
miniapp/src/pages/card/index.vue
miniapp/src/api/types/memberCards.ts
```

修改内容：

1. 卡片主展示仍显示“可用余额”。
2. 增加次级信息：总剩余、已冻结。
3. 时间卡统一显示“分钟”，次卡显示“次”。
4. 如果已冻结大于 0，明确显示“有预约占用”。

### 7.2 订单详情展示会员卡使用结果

文件：

```text
miniapp/src/pages/order/detail.vue
miniapp/src/api/types/orders.ts
```

新增“会员卡使用”区块：

1. 会员卡名称。
2. 预计冻结时间。
3. 实际核销时间。
4. 已释放时间。
5. 当前总剩余、已冻结、可用余额。

展示时机：

1. 订单创建后展示预计冻结。
2. 师傅完成服务后展示实际核销和释放。
3. 用户确认完成后继续保留该区块，用于售后核对。

## 8. 师傅端小程序改造计划

### 8.1 完成服务时确认实际时长

文件：

```text
miniapp/src/pages/staff/orders.vue
miniapp/src/pages/staff/order-detail.vue
miniapp/src/api/staff.ts
```

修改内容：

1. 时间类会员卡订单完成服务时，弹窗标题改为“确认实际服务时长”。
2. 选项至少包含：半时长、预计时长。
3. 如当前业务需要精确到分钟，增加“手动输入”。
4. 提交后刷新订单详情，展示实际核销和释放时间。

### 8.2 师傅端订单详情余额展示

文件：

```text
miniapp/src/pages/staff/order-detail.vue
miniapp/src/api/types/staff.ts
```

修改内容：

1. 在“会员卡/计费”区块中增加“卡内剩余”。
2. 展示总剩余、已冻结、可用余额。
3. 服务完成后展示本单实际核销时间。

## 9. 测试计划

### 9.1 自动化闭环脚本

建议新增脚本：

```text
server/scripts/day46-member-card-time-balance-smoke.ts
```

脚本使用独立测试标识：

```text
DAY46_MEMBER_CARD_TIME_BALANCE_TEST
```

测试流程：

1. 创建测试用户。
2. 创建或复用时间类会员卡模板，例如 120 分钟卡。
3. 创建会员卡购买订单并模拟支付或线下收款。
4. 校验用户会员卡生成，`remainingUnits=120`、`frozenUnits=0`、`usableUnits=120`。
5. 创建会员卡预约订单，冻结 120 分钟。
6. 校验冻结后 `remainingUnits=120`、`frozenUnits=120`、`usableUnits=0`。
7. 派单给测试师傅。
8. 师傅完成服务，传入 `actualMinutes=60`。
9. 校验核销后 `remainingUnits=60`、`frozenUnits=0`、`usableUnits=60`。
10. 校验流水包含 `grant`、`freeze`、`consume`、`release`。
11. Admin 调整该卡增加 30 分钟。
12. 校验调整后 `remainingUnits=90`、`frozenUnits=0`、`usableUnits=90`。
13. 校验流水新增 `admin_adjust`，审计日志存在。
14. 分别调用用户端、师傅端、Admin 相关查询接口，确认余额一致。
15. 删除测试订单、流水、用户会员卡、测试用户、测试师傅和测试模板，保持数据干净。

### 9.2 人工验收用例

| 用例 | 操作 | 预期结果 |
| --- | --- | --- |
| 购买会员卡 | 用户购买 120 分钟卡并支付 | 卡包出现 120 分钟可用余额 |
| 预约冻结 | 用户用该卡预约 120 分钟服务 | 卡包显示总剩余 120，已冻结 120，可用 0 |
| 师傅核销 | 师傅完成服务选择 60 分钟 | 订单显示实际核销 60，释放 60 |
| 用户查看 | 用户打开卡包和订单详情 | 卡包显示可用 60，订单显示扣 60 释放 60 |
| Admin 查看 | Admin 打开用户会员卡和流水 | 余额与用户端一致，流水完整 |
| Admin 调整 | Admin 给该卡增加 30 分钟并填写原因 | 三端刷新后均显示可用 90，流水有后台调整 |
| 保护校验 | Admin 尝试把总剩余改为小于冻结时长 | 后端拒绝，页面提示不能低于已冻结 |

### 9.3 回归范围

Day46 改动后必须回归：

1. 会员卡购买订单支付发卡。
2. Admin 线下会员卡购买订单确认收款发卡。
3. 会员卡预约订单取消释放冻结。
4. 师傅完成现金订单不受 `actualMinutes` 影响。
5. 次卡订单按次数正常核销。
6. 退款回收会员卡发放逻辑不受 `admin_adjust` 影响。

## 10. 实施步骤

### 阶段一：后端闭环补全

1. 增加 `admin_adjust` 会员卡流水常量。
2. 增加 Admin 调整用户会员卡时间接口。
3. 补齐调整接口的校验、流水、审计日志。
4. 调整订单详情返回的会员卡余额字段。
5. 强化时间类会员卡完成服务的 `actualMinutes` 校验。

验收标准：接口测试能完整跑通购买、冻结、核销、调整、查询。

### 阶段二：Admin 页面补全

1. 用户会员卡列表优化余额列名和单位展示。
2. 用户会员卡行操作增加“调整时间”。
3. 新增调整时间弹窗。
4. 会员卡流水支持 `admin_adjust` 筛选和展示。
5. 订单详情会员卡流水展示确认兼容后台调整。

验收标准：管理员不用数据库即可调整单张卡时间，并能追溯调整原因。

### 阶段三：用户端与师傅端补全

1. 用户卡包展示总剩余、已冻结、可用余额。
2. 用户订单详情增加会员卡使用区块。
3. 师傅端完成服务时确认实际时长的弹窗文案和校验补强。
4. 师傅端订单详情展示当前卡内余额。

验收标准：用户、师傅、Admin 对同一张会员卡看到的余额一致。

### 阶段四：闭环测试与清理

1. 编写 Day46 smoke 测试脚本。
2. 使用模拟订单跑通完整链路。
3. 记录测试输出到 `docs/test`。
4. 测试完成后删除模拟订单和测试数据。
5. 运行后端类型检查、Admin 构建、小程序类型检查。

验收标准：测试脚本结束后没有残留 `DAY46_MEMBER_CARD_TIME_BALANCE_TEST` 数据。

## 11. 风险与处理

| 风险 | 处理方式 |
| --- | --- |
| Admin 把余额改到小于冻结值 | 后端强制拒绝，前端提前提示 |
| 时长卡和次卡单位混淆 | 后端仍用 `units`，展示层根据 `cardType/unitName` 显示 |
| 师傅未传实际时长 | 时间类会员卡订单后端拒绝完成服务 |
| 后台调整影响退款回收判断 | 退款逻辑需要把 `admin_adjust` 视为使用后的变动，不允许已调整卡无损退款 |
| 旧数据 `remainingTimes` 不准确 | 每次调整和核销时同步计算 `remainingTimes` |

## 12. 最终验收清单

1. 用户购买时长会员卡后，卡包显示正确余额。
2. 用户用会员卡预约后，卡包显示冻结和可用余额变化。
3. 师傅完成服务时必须确认实际时长。
4. 服务完成后，会员卡实际核销和释放记录正确。
5. 用户订单详情能看到本单会员卡扣减过程。
6. 师傅订单详情能看到本单会员卡扣减过程和剩余时间。
7. Admin 用户会员卡能查看余额并调整时间。
8. Admin 会员卡流水能看到发放、冻结、核销、释放、后台调整。
9. Admin 调整后，用户端、师傅端、Admin 端余额一致。
10. 自动化测试完成后，模拟订单和测试数据全部清理。
