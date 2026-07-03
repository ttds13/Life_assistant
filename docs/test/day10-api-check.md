# Day 10 API Check

更新时间：2026-05-29

## 1. 验证结果

```txt
npm run build          通过
npm run test:contract  通过
```

## 2. 公共接口

| Method | Path | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/health` | 无 | 服务健康检查 |
| GET | `/api/service-categories` | 无 | 服务分类列表 |
| GET | `/api/services` | 无 | 服务列表，支持分页/分类/状态/关键词 |
| GET | `/api/services/:id` | 无 | 服务详情 |

## 3. 用户 Auth

| Method | Path | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/auth/mock-login` | 无，生产禁用 | 本地模拟登录 |
| POST | `/api/auth/wechat-login` | 无 | 微信登录 |
| GET | `/api/auth/me` | user token | 当前用户信息 |
| PUT | `/api/auth/profile` | user token | 更新用户资料 |

## 4. 用户地址

| Method | Path | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/user/addresses` | user token | 地址列表 |
| POST | `/api/user/addresses` | user token | 新增地址 |
| PUT | `/api/user/addresses/:id` | user token | 编辑地址 |
| DELETE | `/api/user/addresses/:id` | user token | 删除地址 |

## 5. 用户订单

| Method | Path | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/orders/price-preview` | user token | 价格预览 |
| GET | `/api/orders` | user token | 用户订单列表 |
| POST | `/api/orders` | user token | 创建订单，写 `create_order` 状态日志 |
| GET | `/api/orders/:id` | user token | 用户订单详情 |
| POST | `/api/orders/:id/cancel` | user token | 未支付取消，状态机 `user_cancel_unpaid` |
| POST | `/api/orders/:id/confirm` | user token | 用户确认完成，状态机 `user_confirm` |
| POST | `/api/orders/:id/pay` | user token | 创建 mock 支付单 |

## 6. 支付

| Method | Path | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/payments/mock-success` | user token，生产禁用 | mock 支付成功，状态机 `pay_success` |

## 7. Admin Auth

| Method | Path | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/admin/auth/login` | 无 | 管理员登录 |
| GET | `/api/admin/auth/me` | admin token | 当前管理员信息 |
| DELETE | `/api/admin/auth/logout` | admin token | 管理员退出 |

## 8. Admin 订单

| Method | Path | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/admin/orders` | admin token | 全部订单列表，支持 `page/pageNum/pageSize/status/keyword/keywords/dateStart/dateEnd/startDate/endDate` |
| GET | `/api/admin/orders/:id` | admin token | 后台订单详情 |
| POST | `/api/admin/orders/:id/assign` | admin token | 后台派单，状态机 `admin_assign`，写 `OrderAssignment`、`OrderStatusLog`、`AuditLog` |
| PUT | `/api/admin/orders/:id/remark` | admin token | 修改后台备注，只写 `adminRemark` 和 `AuditLog`，不改订单状态 |
| GET | `/api/admin/staff/options` | admin token | 可派单师傅选项 |

## 9. 师傅订单

| Method | Path | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/staff/orders` | staff 身份 | 师傅任务列表 |
| GET | `/api/staff/orders/:id` | staff 身份 | 师傅任务详情 |
| POST | `/api/staff/orders/:id/accept` | staff 身份 | 接单，状态机 `staff_accept` |
| POST | `/api/staff/orders/:id/reject` | staff 身份 | 拒单，状态机 `staff_reject` |
| POST | `/api/staff/orders/:id/on-the-way` | staff 身份 | 出发，状态机 `staff_on_the_way` |
| POST | `/api/staff/orders/:id/start-service` | staff 身份 | 开始服务，状态机 `staff_start` |
| POST | `/api/staff/orders/:id/complete` | staff 身份 | 完成服务，状态机 `staff_complete` |

## 10. Dev

| Method | Path | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/dev/seed` | 无，生产禁用 | 开发环境种子数据 |

## 11. 当前未实现

```txt
POST /api/admin/orders/:id/cancel
POST /api/admin/orders/:id/refund
POST /api/admin/orders/:id/reopen
PATCH /api/admin/orders/:id/status
```

这些接口涉及新增订单状态动作，当前不能绕过已实现状态机直接添加。
