# 订单派单接单链路排查与修复 Summary

更新日期：2026-06-05

## 1. 本次结论

用户端订单创建、支付推进、后台派单、师傅端接单这一条链路的后端状态机是完整的，真实状态仍然以这条链路为准：

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

本次主要断点不在订单状态机，也不在 `pending_dispatch -> dispatched` 的后端派单逻辑，而在师傅端开发身份和后台派单 `staffId` 容易不一致：

```txt
师傅端如果没有先创建/缓存当前登录用户对应的开发师傅身份，
请求 /staff/orders 时可能没有稳定携带 X-Staff-Id；

后台派单时虽然使用真实 /admin/staff/options，
但下拉项没有显式显示 staffId，联调时容易派给另一个 active staff；

H5/浏览器联调时，后端 CORS 允许头未包含 X-Staff-Id / X-Admin-Id，
带身份头的请求可能在预检阶段失败。
```

因此，用户创建并支付后的订单能够进入后台待派单，但后台如果派给的不是当前师傅端登录用户对应的 `staffId`，师傅端查询条件 `orders.staff_id = 当前 staffId` 就查不到该订单，也就无法接单。

## 2. 已完成修复

### 2.1 师傅端自动绑定当前开发师傅身份

新增：

```txt
miniapp/src/utils/devStaffSession.ts
```

作用：

```txt
进入师傅端真实接口前，先调用 /auth/dev-staff-session；
后端按当前登录 userId upsert 一个 active staff；
前端保存 DEV_STAFF_ID / DEV_STAFF_SESSION；
后续 /staff/orders、/staff/profile、接单、拒单、履约动作统一携带 X-Staff-Id。
```

修改：

```txt
miniapp/src/api/staff.ts
```

所有师傅端订单/资料接口调用前都会先执行 `ensureDevStaffSession()`，避免直接进入师傅端页面时没有身份头。

### 2.2 师傅端展示当前 staffId，便于后台核对派单对象

修改：

```txt
miniapp/src/pages/staff/profile.vue
```

师傅端个人中心现在显示：

```txt
师傅ID <staffId>
```

联调时后台派单下拉选择的 `#staffId` 必须和这里显示的 `师傅ID` 一致。

### 2.3 后台派单下拉显示 staffId

修改：

```txt
admin/src/views/life/orders/index.vue
admin/src/views/life/orders/detail.vue
admin/src/api/life/types.ts
```

派单下拉项改为显示：

```txt
#<staffId> <师傅姓名> / <手机号> / <工作状态>
```

避免只看姓名或手机号时派错到其他师傅记录。

### 2.4 后端 CORS 放行调试身份头

修改：

```txt
server/src/main.ts
```

`allowedHeaders` 新增：

```txt
X-Admin-Id
X-Staff-Id
```

用于 H5/浏览器本地联调时通过预检请求。

### 2.5 后台可派单师傅状态文案统一

修改：

```txt
server/src/orders/order-presenter.ts
```

`workStatus` 文案统一为：

```txt
0 -> 离线
1 -> 在线
2 -> 忙碌
```

与后台资源管理页面的语义保持一致。

### 2.6 顺手修复小程序类型检查暴露的本地 UI 类型问题

修改：

```txt
miniapp/src/pages/settings/index.vue
miniapp/src/pages/staff/settings.vue
```

将 `maxlength="20"` 改为 `:maxlength="20"`，解决 uni input 类型中 `maxlength` 需要 number 的问题。

## 3. 验证结果

已通过后端完整合同测试：

```txt
cd server
pnpm test:contract
```

结果：

```txt
contract-test-ok
```

该测试覆盖了真实主链路：

```txt
用户创建订单
-> mock 支付成功，订单进入 pending_dispatch
-> admin 派单，订单进入 dispatched，并写入 staffId / order_assignments
-> 师傅 profile 能解析为同一个 staffId
-> 师傅接单 accepted
-> 师傅上门 on_the_way
-> 师傅开始服务 in_service
-> 师傅完成服务 pending_confirm
-> 用户确认 completed
-> order_status_logs 包含完整 action 序列
```

已通过类型/构建校验：

```txt
cd miniapp && pnpm type-check
cd admin && pnpm type-check
cd server && pnpm build
```

## 4. 后续联调修复计划

### Phase 1：确认师傅身份

1. 小程序登录同一个测试用户。
2. 进入“我的 -> 师傅端”或直接进入师傅端页面。
3. 打开师傅端“个人中心”，记录页面显示的 `师傅ID`。
4. 后台打开待派单订单，派单下拉选择同一个 `#师傅ID`。

### Phase 2：跑通订单交互闭环

1. 用户端创建订单，状态应为 `pending_payment`。
2. 开发环境点击“模拟支付成功”，状态应进入 `pending_dispatch`。
3. 后台订单列表筛选“待派单”，找到该订单。
4. 后台派给 Phase 1 中确认的 `#师傅ID`，状态应变为 `dispatched`。
5. 师傅端订单页“待接单”应出现该订单。
6. 师傅点击接单，订单状态应变为 `accepted`。
7. 后续按“上门打卡 -> 开始服务 -> 完成服务 -> 用户确认”继续验证。

### Phase 3：验收标准

必须同时满足：

```txt
orders.status = dispatched 时 orders.staff_id 等于师傅端当前 staffId
order_assignments 中存在 assign_status = pending 的记录
师傅接单后 orders.status = accepted
order_assignments.assign_status = accepted
order_status_logs 写入 admin_assign / staff_accept
用户端订单详情能看到师傅信息
后台订单详情能看到派单和接单时间线
```

### Phase 4：后续增强

1. 增加真实师傅登录，不再长期依赖开发环境 `X-Staff-Id`。
2. 增加派单后的消息通知或轮询刷新，减少师傅端手动刷新。
3. 后台派单前增加城市、技能、时间可用性校验。
4. 增加前端 E2E 联调脚本，覆盖用户端、后台、师傅端三端可视化流程。
