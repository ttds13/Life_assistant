# Day 14 订单派单逻辑优化与实现计划

更新日期：2026-06-05

## 1. 目标

Day 14 Order Add 不再只做入口预留，本阶段要把订单从用户端到师傅端的交互链路跑通，并完整实现三类派单/接单能力：

```txt
入口 A：自动派单
系统从符合条件的可用师傅中选取一个师傅，把订单从 pending_dispatch 推进到 dispatched。
当前自动派单算法先采用最简单、可复现的排序：按 staff.id ASC 取第一个符合条件的师傅。

入口 B：手动接单
订单进入可接单池，符合条件的师傅主动领取订单，把订单从 pending_dispatch 直接推进到 accepted。

入口 C：师傅接单/拒单
已派给师傅的订单进入 dispatched 后，师傅可以接单进入 accepted，也可以拒单回到 pending_dispatch。
```

当前没有真实账户数据，本阶段先使用：

```txt
1 个测试用户
1 个测试师傅
1 条真实订单
```

目标是跑通从用户创建订单、支付、进入待派单池、派给师傅、师傅接单/拒单的最小闭环。

## 2. 当前状态模型

保留现有订单主状态链：

```txt
pending_payment
-> pending_dispatch
-> dispatched
-> accepted
-> on_the_way
-> in_service
-> pending_confirm
-> completed
```

Day 14 在 `pending_dispatch` 和 `dispatched` 上补齐动作：

```txt
admin_assign: pending_dispatch -> dispatched
auto_assign:  pending_dispatch -> dispatched
staff_accept: dispatched -> accepted
staff_reject: dispatched -> pending_dispatch
staff_claim:  pending_dispatch -> accepted
```

关键约定：

```txt
自动派单：系统先绑定 staff_id，师傅再确认接单。
后台派单：管理员先绑定 staff_id，师傅再确认接单。
手动接单：师傅主动领取，领取成功时直接绑定 staff_id 并进入 accepted。
拒单：师傅拒绝已派给自己的订单，订单释放 staff_id 并回到 pending_dispatch。
```

## 3. “符合条件”的明确规则

“符合条件”分成订单条件、师傅条件和排除条件。当前实现先按这些硬条件过滤，再按 `staff.id ASC` 排序选择师傅。

### 3.1 订单符合条件

订单可以进入自动派单或可接单池，必须满足：

```txt
orders.status = pending_dispatch
orders.staff_id is null
订单未取消、未退款、未删除
订单已经完成支付流转，不能仍处于 pending_payment
订单具备可展示给师傅的基础信息：服务项目、服务地址、预约时间或创建时间
```

说明：

```txt
pending_dispatch 是唯一派单池状态。
只要订单已经绑定 staff_id，就不能再出现在可接单池，也不能再次自动派单。
```

### 3.2 师傅符合条件

师傅可以被自动派单或看到可接订单，必须满足：

```txt
staff.deleted_at is null
staff.status = 1
staff.work_status = 1
师傅账号能被当前登录态识别，开发阶段可使用 dev-staff-session
```

当前实现还需要排除明显不可接单的师傅：

```txt
师傅不是该订单的创建用户身份限制不作为当前硬条件，允许一用户一师傅跑通测试
师傅不能已经绑定当前订单之外的未完成订单
未完成订单状态包括 dispatched、accepted、on_the_way、in_service、pending_confirm
师傅拒绝过同一订单后，默认不再被自动派给同一订单，避免拒单后反复派回
```

### 3.3 手动接单池符合条件

师傅端 `GET /staff/available-orders` 只返回当前师傅可以领取的订单：

```txt
订单满足 3.1 的订单条件
当前师傅满足 3.2 的师傅条件
订单没有 active assignment
订单没有派给其他师傅
订单没有被其他师傅抢先领取
```

开发阶段暂不把城市、技能、距离、排班作为硬条件，否则一用户一师傅的最小数据会被过早拦住。后续真实师傅资料齐全后，这些条件再升级为硬过滤或排序因子。

## 4. 当前自动派单算法

Day 14 当前算法只做确定性最简选择：

```sql
select *
from staff
where deleted_at is null
  and status = 1
  and work_status = 1
order by id asc
limit 1;
```

结合订单时，还要套用 3.1、3.2 的业务排除条件。最终规则是：

```txt
1. 找到 pending_dispatch 且 staff_id is null 的订单
2. 找到 active 且 work_status=1 的师傅
3. 排除已经有未完成订单的师傅
4. 排除已经拒绝过该订单的师傅
5. 按 staff.id ASC 排序
6. 取第一个师傅
7. 写入 orders.staff_id，并把订单推进到 dispatched
```

如果找不到符合条件的师傅：

```txt
订单保持 pending_dispatch
返回 no_available_staff 或 409/422 业务错误
后台仍可人工派单
师傅仍可在条件满足后从可接单池领取
```

后续算法升级方向：

```txt
距离排序：服务地址和师傅当前位置距离最近
时间排序：预约时间与师傅排班最匹配
城市匹配：order.city_code = staff.city_code
技能匹配：service.category_id in staff.skills
负载排序：今日已接单少的优先
评分排序：rating 高的优先
```

这些属于后续排序算法升级，不影响当前 Day 14 先按 `staff.id ASC` 跑通。

## 5. API 实现范围

### 5.1 自动派单

当前实现接口：

```txt
POST /admin/orders/:id/auto-assign
```

当前默认策略：

```txt
strategy = staff_id_asc
```

请求 Body 可选：

```json
{
  "remark": "dev auto assign"
}
```

成功后：

```txt
orders.status = dispatched
orders.staff_id = selectedStaffId
order_assignments.assign_type = auto
order_assignments.assign_status = pending
order_status_logs.action = auto_assign
```

### 5.2 手动接单池

当前实现接口：

```txt
GET /staff/available-orders
```

返回范围：

```txt
只返回 pending_dispatch 且 staff_id is null 的订单
只允许 active、work_status=1 的当前师傅访问
不返回已经被其他师傅派走或领取的订单
```

### 5.3 师傅主动领取

当前实现接口：

```txt
POST /staff/orders/:id/claim
```

请求 Body：

```json
{
  "version": 1
}
```

成功后：

```txt
orders.status = accepted
orders.staff_id = currentStaffId
order_assignments.assign_type = claim
order_assignments.assign_status = accepted
order_assignments.accepted_at = now
order_status_logs.action = staff_claim
```

### 5.4 师傅接单

保留并确保可用：

```txt
POST /staff/orders/:id/accept
```

适用场景：

```txt
自动派单或后台派单后，订单已经是 dispatched，并且 staff_id = currentStaffId。
```

成功后：

```txt
orders.status = accepted
order_assignments.assign_status = accepted
order_assignments.accepted_at = now
order_status_logs.action = staff_accept
```

### 5.5 师傅拒单

保留并完整接入：

```txt
POST /staff/orders/:id/reject
```

适用场景：

```txt
订单状态必须是 dispatched
订单 staff_id 必须等于 currentStaffId
```

成功后：

```txt
orders.status = pending_dispatch
orders.staff_id = null
order_assignments.assign_status = rejected
order_assignments.rejected_at = now
order_status_logs.action = staff_reject
```

拒单后的订单重新进入：

```txt
自动派单候选池
手动接单池
后台人工派单池
```

但默认不再自动派给刚拒绝过该订单的同一个师傅。

## 6. 数据写入规则

现有表继续使用，不新增表：

```txt
orders.staff_id
orders.status
orders.version
order_assignments.assign_type
order_assignments.assign_status
order_assignments.assigned_by
order_assignments.assigned_at
order_assignments.accepted_at
order_assignments.rejected_at
order_status_logs.action
```

`assign_type` 约定：

```txt
manual：后台人工派单
auto：系统自动派单
claim：师傅主动领取
```

`assign_status` 约定：

```txt
pending：已派给师傅，等待师傅确认
accepted：师傅已接受
rejected：师傅已拒绝
cancelled：派单记录失效
```

每个状态动作必须写 `order_status_logs`，并保留：

```txt
from_status
to_status
action
operator_type
operator_id
remark
```

## 7. 并发控制

自动派单、后台派单、手动领取都必须使用状态和版本前置校验：

```txt
where id = orderId
and status = pending_dispatch
and staff_id is null
and version = currentVersion
```

成功后：

```txt
version + 1
```

并发结果：

```txt
多个师傅同时 claim 同一订单，只允许一个成功，其余返回 409
自动派单和手动 claim 同时发生，只允许一个成功，其余返回 409
自动派单和后台人工派单同时发生，只允许一个成功，其余返回 409
```

拒单也要校验：

```txt
where id = orderId
and status = dispatched
and staff_id = currentStaffId
and version = currentVersion
```

## 8. 一用户一师傅最小跑通方案

### 8.1 准备测试用户

使用开发登录：

```txt
POST /auth/mock-login
phone = 13800001111
```

该用户用于：

```txt
创建地址
创建订单
模拟支付
查看订单状态
最终确认完成
```

### 8.2 准备测试师傅

使用现有开发师傅身份：

```txt
POST /auth/dev-staff-session
```

后端按当前 userId upsert 一个 active staff：

```txt
uuid = dev-staff-user-<userId>
status = 1
work_status = 1
```

当前阶段允许同一个登录用户同时作为测试用户和测试师傅，重点验证订单流和 staff_id 绑定。后续有真实账户后，再拆成两个独立用户。

### 8.3 跑通路径 A：自动派单 + 接单

```txt
1. 用户创建订单 -> pending_payment
2. 用户模拟支付成功 -> pending_dispatch
3. 调用 POST /admin/orders/:id/auto-assign
4. 系统按 staff.id ASC 选择第一个符合条件的师傅
5. 订单进入 dispatched
6. 师傅端 /staff/orders?status=dispatched 能看到订单
7. 师傅点击接单 -> accepted
```

验收：

```txt
orders.staff_id = 测试 staffId
order_assignments.assign_type = auto
order_assignments.assign_status = pending
order_status_logs 包含 auto_assign
师傅接单后 order_assignments.assign_status = accepted
order_status_logs 包含 staff_accept
```

### 8.4 跑通路径 B：自动派单 + 拒单

```txt
1. 用户创建订单 -> pending_payment
2. 用户模拟支付成功 -> pending_dispatch
3. 调用 POST /admin/orders/:id/auto-assign
4. 订单进入 dispatched
5. 师傅点击拒单 -> pending_dispatch
```

验收：

```txt
orders.staff_id = null
orders.status = pending_dispatch
order_assignments.assign_status = rejected
order_assignments.rejected_at 不为空
order_status_logs 包含 auto_assign、staff_reject
```

### 8.5 跑通路径 C：手动接单

```txt
1. 用户创建订单 -> pending_payment
2. 用户模拟支付成功 -> pending_dispatch
3. 师傅端请求 GET /staff/available-orders
4. 师傅看到该订单
5. 师傅点击领取 -> POST /staff/orders/:id/claim
6. 订单直接进入 accepted
```

验收：

```txt
orders.staff_id = 测试 staffId
orders.status = accepted
order_assignments.assign_type = claim
order_assignments.assign_status = accepted
order_status_logs 包含 staff_claim
```

## 9. 前端页面实现范围

### 9.1 师傅端任务大厅

师傅端至少保留两个 tab：

```txt
待处理：读取 /staff/orders，展示 dispatched、accepted、on_the_way、in_service
可接订单：读取 /staff/available-orders，展示 pending_dispatch
```

按钮映射：

```txt
dispatched：接单 / 拒单
pending_dispatch in available-orders：立即接单
accepted：上门打卡
```

### 9.2 后台订单页

待派单订单操作：

```txt
人工派单：POST /admin/orders/:id/assign
自动派单：POST /admin/orders/:id/auto-assign
```

自动派单失败时：

```txt
提示没有可用师傅
订单保持 pending_dispatch
管理员仍可人工派单
师傅仍可从可接订单池领取
```

## 10. 后端实施顺序

按低风险顺序实现：

```txt
1. 新增 ORDER_ACTION.AUTO_ASSIGN / STAFF_CLAIM，确认 STAFF_REJECT 可用
2. 在 order-state-machine.ts 增加 auto_assign、staff_claim、staff_reject 规则
3. 新增或补齐 DispatchService，封装 selectStaffForOrder / autoAssign / claimOrder / rejectOrder
4. selectStaffForOrder 当前按 staff.id ASC 取第一个符合条件的师傅
5. autoAssign 复用 OrderTransitionService 或事务前置校验，写 orders.staff_id / order_assignments / order_status_logs
6. claimOrder 使用事务和版本校验，写 orders.staff_id / order_assignments / order_status_logs
7. rejectOrder 使用事务和版本校验，释放 orders.staff_id，并写 rejected assignment / status log
8. OrdersController 增加 /admin/orders/:id/auto-assign
9. OrdersController 增加 /staff/available-orders 和 /staff/orders/:id/claim
10. 确认 /staff/orders/:id/accept 与 /staff/orders/:id/reject 使用当前 staff 身份校验
11. 前端师傅端接入“可接订单”“接单”“拒单”
12. 后台订单页接入“自动派单”
13. 合同测试覆盖自动派单、手动接单、拒单和并发
```

## 11. 合同测试计划

### 11.1 自动派单 + 接单

```txt
create order -> pending_payment
mock pay success -> pending_dispatch
auto assign -> dispatched
staff accept -> accepted
```

断言：

```txt
assign_type = auto
assign_status = accepted
status_logs action = pay_success, auto_assign, staff_accept
orders.staff_id = selectedStaffId
```

### 11.2 自动派单 + 拒单

```txt
create order -> pending_payment
mock pay success -> pending_dispatch
auto assign -> dispatched
staff reject -> pending_dispatch
```

断言：

```txt
orders.staff_id = null
latest assignment assign_status = rejected
status_logs action = auto_assign, staff_reject
订单重新出现在 pending_dispatch 池
```

### 11.3 手动接单

```txt
create order -> pending_payment
mock pay success -> pending_dispatch
staff available-orders 包含该订单
staff claim -> accepted
```

断言：

```txt
assign_type = claim
assign_status = accepted
status_logs action = staff_claim
orders.staff_id = staffId
```

### 11.4 并发

```txt
两个 claim 同时请求同一订单，只允许一个成功
auto_assign 和 claim 同时请求同一订单，只允许一个成功
admin_assign 和 auto_assign 同时请求同一订单，只允许一个成功
reject 只能由订单当前 staff_id 对应师傅执行
```

## 12. 暂不做

Day 14 当前暂不做复杂算法和外部能力：

```txt
真实地图距离计算
复杂排班
订单超时自动转派
消息推送
服务人员多技能精确匹配
多门店/多城市严格隔离
佣金结算
```

这些不阻塞当前完整实现自动派单、手动接单和拒单。当前先用 `staff.id ASC` 保证链路确定、可测、能跑通。

## 13. 验收标准

### 13.1 架构验收

```txt
自动派单、后台派单、手动接单是三个独立动作
师傅接单和师傅拒单都只能操作派给自己的 dispatched 订单
所有动作都写 order_status_logs
所有派单/领取动作都写 order_assignments
所有动作都使用状态和版本前置校验
后台人工派单仍然可用
```

### 13.2 最小流程验收

必须至少跑通：

```txt
自动派单 + 接单：
pending_payment -> pending_dispatch -> dispatched -> accepted

自动派单 + 拒单：
pending_payment -> pending_dispatch -> dispatched -> pending_dispatch

手动接单：
pending_payment -> pending_dispatch -> accepted
```

### 13.3 数据验收

数据库应能解释每一步：

```sql
select id, order_no, status, staff_id, version
from orders
where id = <orderId>;

select assign_type, assign_status, staff_id, assigned_at, accepted_at, rejected_at
from order_assignments
where order_id = <orderId>;

select action, from_status, to_status, operator_type, operator_id
from order_status_logs
where order_id = <orderId>
order by id asc;
```

预期：

```txt
自动派单 + 接单：pay_success -> auto_assign -> staff_accept
自动派单 + 拒单：pay_success -> auto_assign -> staff_reject
手动接单：pay_success -> staff_claim
```

## 14. 完成标准

Day 14 Order Add 完成标准：

```txt
订单支付后进入统一 pending_dispatch 池
系统可以按 staff.id ASC 自动派给一个符合条件的测试师傅
师傅可以从可接订单池主动领取订单
师傅可以接受派给自己的订单
师傅可以拒绝派给自己的订单，订单回到 pending_dispatch
自动派单、手动接单、接单、拒单都能绑定或释放 orders.staff_id
自动派单、手动接单、接单、拒单都能写入 order_assignments
自动派单、手动接单、接单、拒单都能写入 order_status_logs
一用户一师傅可以跑通最小真实流程
```
