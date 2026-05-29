# 订单模块总结与审核

更新时间：2026-05-28

## 1. 范围

本文总结并审核 Day 8 后端订单模块的实现情况。

当前订单后端已经具备 MVP 核心能力：

- 用户端：价格预览、创建订单、订单列表、订单详情、未支付取消、确认完成
- 管理端：订单列表、订单详情、人工派单
- 师傅端：任务列表、任务详情、接单、拒单、出发、开始服务、完成服务
- 统一订单状态推进服务
- 每次成功状态变化写入订单状态日志
- 悲观锁和乐观锁并发控制

相关模块：

- `server/src/orders`：订单状态机和订单业务编排
- `server/src/payments`：mock 支付单创建和 `pay_success` 状态推进
- `server/src/addresses`：用户地址 CRUD，订单创建时生成地址快照

## 2. 主要文件

订单模块：

- `server/src/orders/orders.module.ts`：Nest 模块注册
- `server/src/orders/orders.controller.ts`：用户、管理端、师傅端动作接口
- `server/src/orders/orders.service.ts`：订单业务编排和归属校验
- `server/src/orders/orders.repository.ts`：Prisma 查询边界
- `server/src/orders/order-transition.service.ts`：统一状态推进、日志和锁控制
- `server/src/orders/order-state-machine.ts`：订单状态流转表
- `server/src/orders/order-presenter.ts`：订单响应数据组装
- `server/src/orders/constants/order-status.ts`：订单状态常量
- `server/src/orders/constants/order-action.ts`：订单动作常量
- `server/src/orders/dto/*.ts`：接口请求 DTO 校验

配套模块：

- `server/src/payments/*`
- `server/src/addresses/*`

## 3. 接口范围

用户端接口：

- `GET /api/orders/price-preview`
- `GET /api/orders`
- `GET /api/orders/:id`
- `POST /api/orders`
- `POST /api/orders/:id/cancel`
- `POST /api/orders/:id/confirm`
- `POST /api/orders/:id/pay`

管理端接口：

- `GET /api/admin/orders`
- `GET /api/admin/orders/:id`
- `POST /api/admin/orders/:id/assign`

师傅端接口：

- `GET /api/staff/orders`
- `GET /api/staff/orders/:id`
- `POST /api/staff/orders/:id/accept`
- `POST /api/staff/orders/:id/reject`
- `POST /api/staff/orders/:id/on-the-way`
- `POST /api/staff/orders/:id/start-service`
- `POST /api/staff/orders/:id/complete`

支付接口：

- `POST /api/payments/mock-success`

## 4. 状态机

统一订单状态：

```txt
pending_payment
pending_dispatch
dispatched
accepted
on_the_way
in_service
pending_confirm
completed
cancelled
refund_pending
refunded
after_sales
```

已实现流转：

```txt
create_order        null -> pending_payment
pay_success         pending_payment -> pending_dispatch
admin_assign        pending_dispatch -> dispatched
staff_accept        dispatched -> accepted
staff_reject        dispatched -> pending_dispatch
staff_on_the_way    accepted -> on_the_way
staff_start         on_the_way -> in_service
staff_complete      in_service -> pending_confirm
user_confirm        pending_confirm -> completed
user_cancel_unpaid  pending_payment -> cancelled
timeout_unpaid      pending_payment -> cancelled
auto_confirm        pending_confirm -> completed
```

审核结论：

- 状态命名符合 Day 8 计划。
- 使用 `dispatched`，没有混用 `assigned`。
- 预留 `after_sales`，没有混用 `after_sale`。
- 没有提供危险的通用接口 `PATCH /orders/:id/status`。

## 5. 状态推进服务审核

除创建订单以外，所有订单状态变化都通过 `OrderTransitionService.transition()` 处理。

状态推进服务负责：

- 按 action 查询状态流转规则
- 校验当前状态
- 校验可选的 `version`
- 执行业务归属和权限 `check`
- 在同一事务内执行副作用写入
- 更新 `orders.status`
- 将 `orders.version + 1`
- 写入 `order_status_logs`
- 对可重试的悲观锁错误做有限重试

创建订单使用 `createInitialStatusLog()`，因为订单行在创建前还不存在。

审核结论：

- 业务 service 没有绕过状态推进服务直接修改订单状态，创建订单的初始状态除外。
- 成功状态变化和状态日志写入处于同一事务。
- 锁逻辑集中在统一服务中，没有散落在多个接口里。

## 6. 锁策略

使用悲观锁的动作：

```txt
pay_success
admin_assign
staff_accept
staff_reject
user_cancel_unpaid
timeout_unpaid
```

实现方式：

```sql
SELECT id FROM orders WHERE id = ? FOR UPDATE
```

使用乐观锁的动作：

```txt
staff_on_the_way
staff_start
staff_complete
user_confirm
auto_confirm
```

实现方式：

```txt
WHERE id = ? AND status = ? AND version = ?
```

审核结论：

- 支付、派单、接单/拒单、取消等高风险动作使用悲观锁。
- 履约推进和确认完成使用乐观锁。
- 冲突会返回明确的 `409 ORDER_STATUS_INVALID`。

## 7. 数据库依赖

Day 8 P0 必需字段：

- `orders.version`
- `order_status_logs.action`
- `order_status_logs.request_id`
- `order_status_logs.detail`

Day 8 P0 必需索引：

- `orders(user_id, status)`
- `orders(staff_id, status)`
- `orders(status, appointment_start_time)`
- `order_status_logs(order_id, created_at)`
- `order_status_logs(request_id)`
- `order_status_logs(action)`

审核结论：

- 数据库结构已经支持乐观锁和状态追溯。
- `server/scripts/db-verify.ts` 已通过 `INFORMATION_SCHEMA` 直接校验 P0 字段和索引。

## 8. 业务一致性

创建订单：

- 校验服务存在且已上架
- 校验地址属于当前用户
- 金额以后端服务价格计算
- 保存 `serviceSnapshot`
- 保存 `addressSnapshot`
- 创建初始状态日志

支付成功：

- 校验支付单、用户、订单和金额一致
- 支付单状态更新和订单状态推进在同一事务内完成
- 更新订单 `paidAt` 和 `paidAmount`
- 写入支付通知日志
- 对重复成功和已取消订单后的支付回调做审计记录

派单：

- 校验师傅存在且可用
- 创建 `order_assignments`
- 更新 `orders.staffId`
- 写入 `admin_assign` 状态日志

师傅履约：

- 师傅只能操作分配给自己的订单
- 接单/拒单会更新当前派单记录
- 出发、开始服务、完成服务会写入打卡记录
- 完成服务可以写入服务照片
- 师傅完成后进入 `pending_confirm`，不会直接进入 `completed`

用户确认：

- 用户只能确认自己的订单
- 只允许 `pending_confirm -> completed`
- 对已完成订单的重复确认尽量返回当前完成结果

## 9. 鉴权审核

当前鉴权状态：

- 用户端接口使用 `JwtAuthGuard`。
- 管理端和师傅端接口支持真实 JWT 角色：`admin` / `staff`。
- 非生产环境允许通过请求头模拟身份：
  - `X-Admin-Id`
  - `X-Staff-Id`
- 生产环境会拒绝模拟管理端/师傅端身份。

审核结论：

- 该方案适合 Day 8 后端接口联调和契约测试。
- 这还不是完整的生产级管理端/师傅端登录体系。
- 上生产前需要补真实 admin/staff 登录、角色权限和专用 Guard。

## 10. 测试与验证

以下命令已通过：

```bash
npm run prisma:generate
npm run build
npm run db:verify
npm run test:contract
```

`contract-test` 覆盖：

- 登录和基础服务接口
- 创建地址
- 价格预览
- 创建订单 -> `pending_payment`
- mock 支付成功 -> `pending_dispatch`
- 后台派单 -> `dispatched`
- 师傅接单 -> `accepted`
- 师傅出发 -> `on_the_way`
- 师傅开始服务 -> `in_service`
- 师傅完成服务 -> `pending_confirm`
- 用户确认完成 -> `completed`
- 状态日志 action 顺序
- 用户取消 vs 支付成功冲突
- 双管理端重复派单冲突
- 师傅接单 vs 拒单冲突

已知验证缺口：

- `npm run lint` 当前不能运行，因为 `server` 环境没有可用的 `eslint` 命令或依赖。

## 11. 剩余风险

Day 8 阶段可接受的未完成项：

- 未接真实微信支付回调
- 未实现真实退款状态机
- 未新增 `idempotency_keys` 表
- 未新增 `outbox_events` 表
- 未实现生产级管理端/师傅端鉴权模块
- 未实现 admin-web 和师傅端 UI
- 未实现自动派单算法

需要继续关注的实现风险：

- `order_assignments` 没有数据库层面的“当前有效派单唯一约束”，目前依赖锁定 `orders` 行来保证一致性。
- mock 支付已审计“取消后支付成功”异常，但退款处理仍是后续人工/未来流程。
- 服务照片要求暂未强制，`staff_complete` 允许空照片。
- 管理端/师傅端开发环境模拟 header 必须继续在生产环境禁用。

## 12. 审核结论

订单模块已经满足 Day 8 后端 MVP 目标：

- 主链路可以从创建订单推进到完成订单
- 每次成功状态变化都会写状态日志
- 高风险状态变化使用悲观锁
- 履约动作使用乐观锁
- 并发冲突返回明确 `409`
- 数据库 P0 字段和索引已验证
- 契约测试覆盖主流程和关键冲突场景

该模块可以作为订单后端 MVP 核心继续向前推进。下一阶段应优先补齐真实 admin/staff 鉴权、幂等键、outbox、真实支付/退款和更严格的履约凭证规则。
