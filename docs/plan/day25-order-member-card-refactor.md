# Day 25 - 订单与会员卡系统重构计划

## 1. 背景

当前系统已经具备服务预约、会员卡购买、会员卡发放和会员卡核销能力，但业务边界仍需要进一步清晰化：

- 购买会员卡和预约服务在用户体验上可以连续，但在后端订单模型中必须分开。
- 会员卡购买是权益交易，支付成功后发放权益。
- 服务预约是履约交易，预约成功后等待派单、上门服务和核销。
- 师傅端只应处理服务履约，不应处理会员卡购买订单。
- Admin 端需要同时能管理服务预约订单、会员卡购买订单、用户会员卡、会员卡模板和会员卡流水。

本计划目标是建立一套清晰、可扩展、可审计的订单与会员卡系统。

## 2. 总体原则

1. 后端订单分开建模，前端体验可以串联。
2. 会员卡购买订单不参与派单和服务履约。
3. 服务预约订单不负责发卡，只负责冻结和核销会员卡额度。
4. 支付成功处理器统一入口，按订单类型分支处理。
5. 会员卡发放、冻结、释放、核销、退款回滚都必须有流水。
6. Admin 管理视图按业务类型拆开，避免把买卡订单和服务预约订单混在同一操作语义中。

## 3. 订单类型设计

### 3.1 订单类型

建议使用 `orderType` 明确订单类型：

```ts
type OrderType =
  | 'service_booking'
  | 'member_card_purchase'
  | 'consultation'
```

### 3.2 会员卡购买订单

业务含义：用户购买一张会员卡模板对应的权益。

状态流：

```text
pending_payment -> completed
pending_payment -> cancelled
completed -> refund_pending -> refunded
completed -> after_sales
```

特点：

- 需要支付。
- 支付成功后自动发卡。
- 不进入待派单。
- 不出现在师傅端任务列表。
- 可以进入退款/售后流程。

### 3.3 服务预约订单

业务含义：用户预约一次具体上门服务。

状态流：

```text
pending_payment -> pending_dispatch -> dispatched -> accepted
accepted -> on_the_way -> in_service -> pending_confirm -> completed
pending_payment -> cancelled
pending_dispatch -> cancelled
```

特点：

- 现金支付订单：先付款，再待派单。
- 会员卡预约订单：不支付，创建后直接待派单，并冻结本次预计扣减额度。
- 服务完成时正式核销会员卡。
- 用户取消或 Admin 取消时释放冻结额度。

### 3.4 咨询类订单

业务含义：用户提交需求，后续由后台人工跟进。

状态流：

```text
pending_dispatch -> dispatched -> accepted -> completed
pending_dispatch -> cancelled
```

特点：

- 不支付。
- 不使用会员卡自动核销。
- 可以由 Admin 派单或人工跟进。

## 4. 数据模型重构

### 4.1 Order

建议字段：

```ts
Order {
  id
  orderNo
  userId
  staffId
  orderType
  status

  serviceId
  serviceSnapshot
  addressSnapshot
  appointmentStartTime
  appointmentEndTime

  originalAmount
  discountAmount
  payableAmount
  paidAmount

  purchaseCardId
  grantedUserMemberCardId

  memberCardId
  memberCardConsumeUnits

  linkedPurchaseOrderId
  linkedBookingOrderId

  paidAt
  completedAt
  cancelledAt
  cancelReason
}
```

字段语义：

- `purchaseCardId`：会员卡购买订单购买的会员卡模板 ID。
- `grantedUserMemberCardId`：支付成功后发放出来的用户会员卡 ID。
- `memberCardId`：服务预约时使用的用户会员卡 ID。
- `memberCardConsumeUnits`：服务预约预计冻结/扣减额度。
- `linkedPurchaseOrderId`：连续体验中，服务预约单可关联刚购买的会员卡购买订单。
- `linkedBookingOrderId`：购买订单可关联后续预约单。

当前系统可先复用已有字段，但后续应逐步迁移到上面的语义字段，避免一个字段承担多种含义。

### 4.2 MemberCard

会员卡模板。

```ts
MemberCard {
  id
  name
  cardType              // time | times
  unitName              // 分钟 | 次
  unitMinutes
  totalUnits
  totalTimes
  price
  validityDays
  applicableServices
  serviceRules
  allowHalfDeduct
  minConsumeUnits
  status
}
```

### 4.3 UserMemberCard

用户持有的会员卡权益。

```ts
UserMemberCard {
  id
  userId
  cardId
  source                // purchase | admin
  purchaseOrderId
  remainingUnits
  frozenUnits
  remainingTimes
  status                // active | used_up | expired | disabled
  expireAt
}
```

### 4.4 MemberCardRecord

会员卡流水。

```ts
MemberCardRecord {
  id
  userMemberCardId
  orderId
  recordType            // grant | freeze | release | consume | refund_revoke | adjust
  units
  beforeUnits
  afterUnits
  operatorType          // user | staff | admin | system
  operatorId
  remark
}
```

## 5. 支付系统重构

### 5.1 统一支付成功入口

支付成功后统一进入：

```ts
handlePaymentSuccess(paymentNo)
```

内部按订单类型分支：

```ts
if (order.orderType === 'member_card_purchase') {
  markPaymentSuccess()
  grantMemberCardOnce()
  markOrderCompleted()
}

if (order.orderType === 'service_booking') {
  markPaymentSuccess()
  markOrderPendingDispatch()
}
```

### 5.2 Mock 支付

本地开发：

```env
PAYMENT_PROVIDER=mock
```

要求：

- Mock 支付也必须走真实支付成功处理器。
- 不允许前端直接伪造支付成功。
- Mock 支付后应真实改变订单状态和会员卡状态。

### 5.3 幂等要求

必须保证：

- 同一支付单重复回调不重复发卡。
- 同一购买订单重复支付不重复发卡。
- 支付金额必须等于订单应付金额。
- 订单取消后收到支付成功需要进入异常支付处理。

## 6. 用户端重构计划

### 6.1 我的页面

入口：

```text
我的 -> 我的卡包
```

我的页面展示：

- 我的卡包数量
- 优惠券数量
- 订单状态统计

点击“我的卡包”进入会员卡页面。

### 6.2 会员卡页面

页面分区：

1. 我的会员卡
2. 可购买会员卡
3. 会员卡使用说明

我的会员卡卡片展示：

- 卡名称
- 剩余额度
- 冻结额度
- 有效期
- 去预约
- 查看明细

可购买会员卡卡片展示：

- 卡名称
- 卡类型
- 总额度
- 有效期
- 价格
- 适用服务
- 购买按钮

购买流程：

```text
点击购买
-> 创建 member_card_purchase 订单
-> 跳转支付页
-> 支付成功
-> 自动入卡包
-> 返回卡包或弹出“是否立即预约”
```

支付成功后的预约引导必须是可取消的：

- 用户可以点击“立即预约”，继续选择服务、地址和时间。
- 用户也可以点击“暂不预约”或关闭弹窗。
- 取消预约引导不取消会员卡购买订单。
- 取消预约引导不回滚已发放会员卡。
- 用户后续可以随时从“我的卡包”或“服务详情页”再次发起预约。

也就是说，买卡完成后，系统只能“引导预约”，不能强制用户立即预约。

### 6.3 服务详情页

主入口：

```text
立即预约
```

辅助提示：

- 如果用户有可用会员卡：提示“可使用会员卡抵扣”。
- 如果用户没有可用会员卡：提示“购买会员卡更划算”。

不要在服务详情页直接把买卡和预约合成一个后端订单。

### 6.4 连续体验

允许用户在前端体验上连续：

```text
服务详情
-> 购买推荐会员卡
-> 支付成功自动发卡
-> 弹出是否继续预约
-> 用户选择继续预约
-> 自动选择刚买的会员卡
-> 创建服务预约单
```

但后端必须是两个订单：

```text
member_card_purchase
service_booking
```

连续体验中的预约动作必须允许中断：

```text
服务详情
-> 购买推荐会员卡
-> 支付成功自动发卡
-> 弹出是否继续预约
-> 用户取消
-> 流程结束，会员卡留存在卡包
-> 用户后续任意时间再预约
```

该设计保证“买卡”和“预约”是两个独立用户意图：买卡表示购买权益，预约表示使用权益。

## 7. 服务预约下单页重构

下单页需要明确展示三种情况：

### 7.1 现金支付

```text
选择服务
选择地址
选择时间
不使用会员卡
提交订单
支付
待派单
```

### 7.2 会员卡预约

```text
选择服务
选择地址
选择时间
选择会员卡
提交预约
冻结额度
待派单
```

### 7.3 咨询服务

```text
选择咨询服务
填写需求
选择期望时间
提交咨询
待后台处理
```

## 8. 师傅端重构计划

师傅端只处理服务履约订单。

查询过滤：

```ts
orderType in ['service_booking', 'consultation']
```

不展示：

- `member_card_purchase`
- 会员卡购买支付单
- 发卡记录

师傅端订单卡片展示：

- 服务名称
- 地址
- 预约时间
- 联系人
- 是否会员卡预约
- 本次预计核销额度

完成服务时：

- 上传服务照片
- 填写实际服务时长
- 后端按实际时长核销会员卡
- 现金订单不触发会员卡核销

## 9. Admin 端重构计划

Admin 端应拆成四个核心管理视图。

### 9.1 服务预约订单

只展示：

```ts
orderType in ['service_booking', 'consultation']
```

字段：

- 订单号
- 用户
- 服务
- 预约时间
- 地址
- 支付方式
- 使用会员卡
- 冻结额度
- 核销额度
- 师傅
- 状态

操作：

- 派单
- 改期
- 取消
- 释放冻结额度
- 查看核销流水

### 9.2 会员卡购买订单

只展示：

```ts
orderType = 'member_card_purchase'
```

字段：

- 购买订单号
- 用户
- 会员卡模板
- 金额
- 支付状态
- 发卡状态
- 发卡时间
- 用户会员卡 ID
- 退款状态

操作：

- 查看详情
- 手动补发
- 查看发卡流水
- 发起退款审核
- 回滚未使用会员卡

### 9.3 用户会员卡

字段：

- 用户
- 卡名称
- 来源
- 购买订单
- 剩余额度
- 冻结额度
- 有效期
- 状态

操作：

- 后台发卡
- 延期
- 禁用
- 调整额度
- 查看流水

### 9.4 会员卡模板

字段：

- 名称
- 类型
- 总额度
- 售价
- 有效期
- 适用服务
- 上架状态
- 半次核销规则

操作：

- 新增
- 编辑
- 上架
- 下架
- 配置适用服务
- 配置服务扣减规则

## 10. 退款与售后规则

### 10.1 会员卡购买退款

未使用：

```text
用户会员卡 remainingUnits = totalUnits
frozenUnits = 0
```

允许自动退款：

- 退款支付单
- 禁用或删除用户会员卡
- 写入 `refund_revoke` 流水
- 购买订单变为 `refunded`

已使用：

```text
remainingUnits < totalUnits
```

进入人工售后：

- 不自动退款
- Admin 判断部分退款、补偿或拒绝

有冻结：

```text
frozenUnits > 0
```

不允许退款：

- 需要先取消关联预约
- 释放冻结后再处理

### 10.2 服务预约退款

现金服务订单：

- 未派单可取消并退款。
- 已派单后进入人工售后。

会员卡预约订单：

- 未开始服务：释放冻结额度。
- 已完成服务：一般不自动退回额度，走人工售后。

## 11. 迁移实施步骤

### 阶段 1：订单语义清晰化

- 梳理当前 `orderType` 使用情况。
- 将服务现金订单统一为 `service_booking`。
- 将会员卡购买订单统一为 `member_card_purchase`。
- 将咨询订单统一为 `consultation`。
- 补充购买订单和预约订单的关联字段。

### 阶段 2：支付成功处理器重构

- 抽出统一 `handlePaymentSuccess`。
- 按 `orderType` 分支处理。
- Mock 支付和微信支付共用同一处理器。
- 加强重复回调幂等。

### 阶段 3：会员卡发卡闭环

- 购买订单支付成功自动发卡。
- 发卡写入 `MemberCardRecord`。
- 购买订单记录发放出的 `UserMemberCard`。
- 重复支付不重复发卡。

### 阶段 4：用户端体验重构

- 我的页卡包入口真实跳转。
- 卡包页展示我的卡和可购买卡。
- 服务详情页增加会员卡推荐。
- 买卡后支持继续预约。

### 阶段 5：服务预约页重构

- 明确现金支付、会员卡预约、咨询服务三种模式。
- 有会员卡时选择会员卡。
- 没有会员卡时提示购买。
- 创建预约单只处理预约，不处理买卡。

### 阶段 6：师傅端过滤

- 师傅端只查服务预约和咨询订单。
- 屏蔽会员卡购买订单。
- 完成服务时传实际服务时长。

### 阶段 7：Admin 拆视图

- 服务预约订单
- 会员卡购买订单
- 用户会员卡
- 会员卡模板
- 会员卡流水

### 阶段 8：退款与售后

- 未使用会员卡自动回滚。
- 已使用会员卡人工售后。
- 有冻结会员卡禁止退款。

## 12. 测试计划

### 12.1 会员卡购买

- 可购买会员卡列表正常。
- 创建购买订单正常。
- Mock 支付成功后自动发卡。
- 重复支付不重复发卡。
- 卡包展示新卡。
- 支付成功后的预约引导可以取消。
- 取消预约引导后，会员卡仍保留在卡包中。
- 用户后续从卡包再次点击“去预约”可继续使用该会员卡。

### 12.2 会员卡预约

- 下单页能查到适用会员卡。
- 提交预约后冻结额度。
- 用户取消释放额度。
- Admin 取消释放额度。
- 师傅完成服务后正式核销。
- 半次核销规则正确。

### 12.3 现金预约

- 创建订单进入待支付。
- 支付成功进入待派单。
- 不自动派单。
- Admin 派单后师傅端可见。

### 12.4 咨询订单

- 不支付。
- 不核销会员卡。
- 进入待处理/待派单。

### 12.5 Admin

- 服务预约订单不显示会员卡购买订单。
- 会员卡购买订单可查看发卡状态。
- 用户会员卡可查看余额和流水。
- 模板配置可影响用户端购买和预约扣减。

## 13. 验收标准

1. 用户可以从“我的 -> 我的卡包”购买会员卡。
2. 会员卡支付成功后自动入卡包。
3. 用户可以用会员卡预约适用服务。
4. 预约时冻结额度，取消时释放额度，完成时核销额度。
5. 现金服务订单支付成功后进入待派单，不自动派单。
6. 师傅端只看到服务履约订单。
7. Admin 能分别管理服务预约订单和会员卡购买订单。
8. 重复支付或重复回调不会重复发卡。
9. 本地 Mock 支付和线上支付共用同一业务处理器。
10. 退款和售后规则有明确入口和风控限制。

## 14. 推荐最终流程

### 标准买卡流程

```text
我的
-> 我的卡包
-> 购买会员卡
-> 支付
-> 自动入卡包
-> 去预约
```

### 标准预约流程

```text
首页
-> 服务详情
-> 立即预约
-> 选择地址和时间
-> 选择会员卡或现金支付
-> 提交预约
-> 待派单
-> 上门服务
-> 完成核销
```

### 连续体验流程

```text
服务详情
-> 推荐购买会员卡
-> 支付成功
-> 弹出是否立即预约
-> 用户确认
-> 自动选择刚买的会员卡
-> 提交服务预约
```

如果用户取消预约引导：

```text
服务详情
-> 推荐购买会员卡
-> 支付成功
-> 弹出是否立即预约
-> 用户取消
-> 会员卡保留在卡包
-> 用户后续随时预约
```

底层订单仍然是：

```text
member_card_purchase
service_booking
```

## 15. 当前结论

最终设计应采用：

```text
后端订单分开
前端体验串联
Admin 管理分视图
师傅端只处理履约
会员卡通过流水保证可审计
```

不要把购买会员卡和预约服务合并成一个订单。合并会导致退款、核销、改期、派单、发卡和售后逻辑互相污染，后续维护成本会快速升高。
