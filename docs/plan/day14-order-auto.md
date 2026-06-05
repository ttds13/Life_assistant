# Day 14 订单支付后自动派单计划

更新日期：2026-06-05  
代号：day14-order-auto

## 1. 背景

当前订单派单链路已经具备三类能力：

```txt
后台人工派单：POST /api/admin/orders/:id/assign
后台手动触发自动派单：POST /api/admin/orders/:id/auto-assign
师傅主动接单：POST /api/staff/orders/:id/claim
```

但现状仍然要求管理员在后台订单列表或订单详情里点击“自动派单”，订单才会从 `pending_dispatch` 推进到 `dispatched`。

这不符合真实业务流程。真实流程应该是：

```txt
用户支付成功
-> 系统确认支付
-> 订单进入 pending_dispatch
-> 系统立即尝试自动派单
-> 找到可用师傅则进入 dispatched
-> 师傅端看到派单并接单 / 拒单
```

后台按钮只保留为运维补救和人工干预入口，不再作为主流程必经步骤。

## 2. 目标

本阶段目标是把“支付成功后自动派单”变成系统默认动作。

支付成功后的期望状态：

```txt
有符合条件的师傅：
pending_payment -> pending_dispatch -> dispatched

没有符合条件的师傅：
pending_payment -> pending_dispatch
订单留在待派单池，后台可人工派单，师傅也可从可接单池主动领取
```

必须保持：

```txt
后台人工派单仍然可用
后台自动派单按钮仍然可用于补救重试
师傅端手动接单池仍然可用
师傅拒单后订单仍回到 pending_dispatch
```

## 3. 当前代码断点

当前支付成功逻辑在：

```txt
server/src/payments/payments.service.ts
PaymentsService.mockSuccess()
```

该方法已经调用：

```txt
OrderTransitionService.transition(action = pay_success)
```

把订单从：

```txt
pending_payment -> pending_dispatch
```

但在支付事务完成后，没有继续触发自动派单。

当前自动派单能力在：

```txt
server/src/orders/orders.service.ts
OrdersService.autoAssignOrder()
```

它目前面向后台接口，入参要求 `adminId`，并写入 `AdminAuditLog`。这说明现有自动派单逻辑可用，但不适合直接作为支付回调里的内部系统动作复用。

## 4. 设计原则

### 4.1 支付确认和派单解耦

支付成功必须优先保证落库成功。自动派单失败不能回滚支付成功。

正确边界：

```txt
支付事务提交成功
-> 再触发自动派单
-> 自动派单失败只记录结果，不影响支付状态
```

不能把支付成功和自动派单强行放在同一个事务里，否则会出现：

```txt
支付已真实成功，但因为没有师傅导致整笔支付回调失败
```

这是错误的业务语义。

### 4.2 自动派单必须可幂等

支付回调可能重复到达，用户端也可能重复点击 mock 支付成功。

重复触发自动派单时必须满足：

```txt
订单已经 dispatched / accepted / 后续状态：直接跳过，不重复派单
订单仍是 pending_dispatch 且 staff_id is null：允许再次尝试
订单已取消 / 已退款：不派单
```

### 4.3 后台按钮变成补救入口

后台“自动派单”按钮继续保留，但含义变成：

```txt
对仍停留在 pending_dispatch 的订单，管理员手动重试自动派单
```

后台“人工派单”继续用于：

```txt
自动派单找不到师傅
师傅拒单后需要运营指定师傅
特殊订单需要人工判断
```

## 5. 自动派单触发点

### 5.1 Mock 支付

当前开发环境入口：

```txt
POST /api/payments/mock-success
```

修改计划：

```txt
1. mockSuccess 完成 pay_success 状态机流转
2. 重新读取订单详情
3. 如果订单为 pending_dispatch 且 staff_id is null
4. 调用内部自动派单服务
5. 返回最终订单状态给前端
```

返回给前端的订单可能是：

```txt
dispatched：自动派单成功
pending_dispatch：自动派单失败或没有可用师傅
```

### 5.2 真实支付回调

后续接入微信支付回调时，必须复用同一套内部入口：

```txt
真实支付回调
-> 校验签名和金额
-> pay_success
-> triggerAutoAssignAfterPayment(orderId)
```

不能只在 mock 支付里写一套临时代码，否则上线真实支付后会再次断链。

## 6. 服务拆分计划

### 6.1 新增内部派单方法

在 `OrdersService` 中抽出一个不依赖管理员身份的内部方法：

```txt
autoAssignOrderBySystem(orderId, options)
```

建议签名：

```ts
async autoAssignOrderBySystem(orderId: number, options?: {
  requestId?: string
  source?: 'payment_success' | 'admin_retry' | 'job_retry'
  remark?: string
}): Promise<AutoAssignResult>
```

返回结构：

```ts
type AutoAssignResult = {
  assigned: boolean
  reason?: 'order_not_pending_dispatch' | 'already_assigned' | 'no_available_staff'
  staffId?: number
  orderStatus: string
}
```

### 6.2 后台接口复用内部方法

现有后台接口：

```txt
POST /api/admin/orders/:id/auto-assign
```

改为：

```txt
1. 先调用 autoAssignOrderBySystem()
2. 如果成功，再写后台审计日志，记录 adminId 和触发来源
3. 返回订单详情
```

这样可以避免支付自动派单和后台自动派单维护两份逻辑。

### 6.3 支付服务调用内部方法

`PaymentsService` 注入 `OrdersService`，在 `pay_success` 提交后调用：

```txt
await ordersService.autoAssignOrderBySystem(orderId, {
  requestId,
  source: 'payment_success',
  remark: 'auto assign after payment success',
})
```

注意：该调用必须放在 `transitions.transition(pay_success)` 完成之后。

## 7. 状态流转

自动派单成功：

```txt
orders.status: pending_dispatch -> dispatched
orders.staff_id: null -> selectedStaffId
orders.version: +1
order_assignments.assign_type = auto
order_assignments.assign_status = pending
order_status_logs.action = auto_assign
order_status_logs.operator_type = system
order_status_logs.operator_id = 0
```

自动派单失败：

```txt
orders.status 保持 pending_dispatch
orders.staff_id 保持 null
不写 order_assignments
建议写一条可观测日志，记录 no_available_staff
后台待派单列表仍可看到该订单
师傅可接单池仍可看到该订单
```

## 8. 候选师傅规则

当前算法继续沿用 Day14 Order Add 的最小可用策略：

```txt
staff.deleted_at is null
staff.status = 1
staff.work_status = 1
师傅没有未完成订单
师傅没有拒绝过当前订单
按 staff.id ASC 排序
取第一个
```

暂不加入距离、时间、评分、技能、城市等排序因素。

后续升级方向：

```txt
1. 同城优先
2. 距离最近优先
3. 预约时间可用优先
4. 技能匹配优先
5. 今日负载低优先
6. 评分高优先
```

## 9. 失败兜底

### 9.1 没有可用师傅

处理方式：

```txt
订单保持 pending_dispatch
用户端显示“等待派单”
后台待派单列表显示该订单
后台可人工派单
师傅端符合条件后可从可接单池领取
```

### 9.2 自动派单并发冲突

可能场景：

```txt
支付成功后系统自动派单
管理员同时点击后台自动派单
师傅同时从可接单池领取
```

处理方式：

```txt
只允许一个动作成功
其他动作返回 409 或转换为 skipped
最终以 orders.status + orders.staff_id 为准
```

### 9.3 重复支付回调

处理方式：

```txt
如果支付已经 success，继续返回成功
如果订单已经不是 pending_dispatch，自动派单跳过
不重复创建 order_assignments
不重复改变 staff_id
```

## 10. 前端影响

### 10.1 用户端支付结果页

支付成功后返回订单详情时，需要接受两种状态：

```txt
dispatched：系统已自动派单，提示等待师傅接单
pending_dispatch：支付成功，正在等待平台派单
```

如果自动派单成功，用户端订单详情文案应从：

```txt
等待派单
```

变为：

```txt
已派单，等待师傅接单
```

### 10.2 师傅端

自动派单成功后，师傅端应在：

```txt
GET /api/staff/orders?status=dispatched
```

看到该订单，并可以执行：

```txt
POST /api/staff/orders/:id/accept
POST /api/staff/orders/:id/reject
```

### 10.3 后台管理端

后台列表保留：

```txt
人工派单
自动派单
```

但文案建议调整：

```txt
自动派单 -> 重试自动派单
```

仅在 `pending_dispatch` 状态显示。

## 11. 实施步骤

### Phase 1：后端抽象

```txt
1. 在 OrdersService 中抽出 autoAssignOrderBySystem
2. 将候选师傅选择、状态机流转、assignment 写入集中到该方法
3. 返回结构化 AutoAssignResult，而不是所有失败都直接抛错
4. 保留严重异常继续抛错，例如订单不存在、数据库错误
```

### Phase 2：支付后触发

```txt
1. PaymentsModule 确认可以注入 OrdersService
2. PaymentsService.mockSuccess 在 pay_success 成功后调用 autoAssignOrderBySystem
3. 调用失败时捕获 no_available_staff，不影响支付成功返回
4. 返回最新订单详情
```

### Phase 3：后台接口复用

```txt
1. OrdersService.autoAssignOrder 改为调用 autoAssignOrderBySystem
2. 后台触发时继续写 admin audit
3. 如果内部方法返回 no_available_staff，后台仍返回明确业务错误，提示管理员人工派单
```

### Phase 4：前端状态确认

```txt
1. 用户端支付结果页确认能展示 dispatched
2. 用户端订单详情确认 dispatched 文案正确
3. 师傅端订单列表确认 dispatched 订单出现
4. 后台待派单列表中不再出现已自动派单成功的订单
```

### Phase 5：测试

```txt
1. 修改 contract-test，新增 pay_success 后自动派单断言
2. 覆盖 no_available_staff 兜底场景
3. 覆盖重复 mock-success 不重复派单
4. 覆盖支付后自动派单成功，师傅接单成功
5. 覆盖支付后自动派单成功，师傅拒单后订单回到 pending_dispatch
```

## 12. 验收路径

### 12.1 自动派单成功

```txt
1. 准备 1 个 active + online 师傅
2. 用户创建订单 -> pending_payment
3. 用户支付成功 -> mock-success
4. 系统自动派单
5. 订单最终状态 = dispatched
6. orders.staff_id = 该师傅 ID
7. order_assignments.assign_type = auto
8. 师傅端看到订单
9. 师傅接单 -> accepted
```

### 12.2 无师傅兜底

```txt
1. 禁用或离线所有师傅
2. 用户创建订单并支付成功
3. 支付成功不失败
4. 订单状态 = pending_dispatch
5. orders.staff_id = null
6. 后台待派单列表能看到订单
7. 后台人工派单仍可完成
```

### 12.3 重复支付回调

```txt
1. 用户支付成功触发自动派单
2. 再次调用 mock-success
3. 订单不重复创建 auto assignment
4. staff_id 不变化
5. 接口仍返回支付成功和当前订单详情
```

## 13. 不做范围

本阶段不做：

```txt
复杂距离派单
真实地图距离计算
排班系统
超时自动转派
消息推送
自动派单开关后台配置页
多师傅同时推送抢单
```

当前先把支付成功后的主流程跑顺。

## 14. 完成标准

day14-order-auto 完成后必须满足：

```txt
用户支付成功后无需管理员点击按钮，系统会自动尝试派单
有可用师傅时订单自动进入 dispatched
无可用师傅时订单保留 pending_dispatch，不影响支付成功
后台人工派单和后台重试自动派单仍然可用
师傅端能接收到自动派单订单
师傅能接单和拒单
重复支付回调不会重复派单
合同测试覆盖支付后自动派单主流程
```
