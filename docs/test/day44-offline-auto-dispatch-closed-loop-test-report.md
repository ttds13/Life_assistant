# Day44 线下注册 + 新增订单 + 自动派单 + 收款 + 记录闭环测试报告

测试时间：2026-07-09  
测试环境：本地后端服务层 + 本地 MySQL `127.0.0.1:3307/life_assistant`  
测试脚本：`server/scripts/day44-offline-auto-dispatch-closed-loop-smoke.ts`  
测试 runId：`DAY44_TEST_20260709_OFFLINE_AUTO`  
测试结论：通过  
测试数据状态：已清理

## 1. 测试目标

验证线下渠道的一条完整业务闭环：

```text
后台线下注册用户
-> 后台新增线下订单
-> 未收款状态禁止自动派单
-> 后台确认线下收款
-> 订单进入待派单
-> 系统自动派单
-> 师傅接单、出发、开始、完成
-> 用户确认完成
-> 支付、派单、通知、履约、积分、收入、状态日志、审计日志形成记录
-> 测试数据清理
```

## 2. 执行命令

```bash
cd server
tsx scripts/day44-offline-auto-dispatch-closed-loop-smoke.ts --run-id=DAY44_TEST_20260709_OFFLINE_AUTO
```

实际执行命令使用本地 `node_modules/.bin/tsx.cmd`，脚本执行成功，退出码为 0。

## 3. 链路结果

| 检查项 | 结果 |
| --- | --- |
| 线下用户创建 | 通过，用户来源为 `offline` |
| 新增线下未收款订单 | 通过，初始状态为 `pending_payment` |
| 未收款自动派单保护 | 通过，自动派单被拒绝，错误为 `order is not pending dispatch` |
| 后台确认线下收款 | 通过，订单进入 `pending_dispatch` |
| 自动派单 | 通过，订单进入 `dispatched` |
| 派单记录 | 通过，`assignType=auto`，后续师傅接单后 `assignStatus=accepted` |
| 师傅通知 | 通过，生成 `order_assigned` 师傅通知 |
| Admin 待派单通知 | 通过，生成 `admin_pending_dispatch` 通知 |
| 师傅履约 | 通过，形成出发、开始、完成 3 条履约记录 |
| 完工照片 | 通过，形成 1 条完成照片记录 |
| 用户确认完成 | 通过，订单最终状态为 `completed` |
| 账务检查 | 通过，`accounting.passed=true` |
| 财务统计 | 通过，线下支付计入统计 |
| 测试数据清理 | 通过，清理后关联数据计数全部为 0 |

## 4. 本次测试订单快照

| 字段 | 值 |
| --- | --- |
| 测试用户 ID | `17` |
| 测试订单 ID | `29` |
| 测试订单号 | `LA202607091245249692` |
| 订单来源 | `offline` |
| 初始状态 | `pending_payment` |
| 收款后状态 | `pending_dispatch` |
| 自动派单后状态 | `dispatched` |
| 自动派单师傅 ID | `1` |
| 最终状态 | `completed` |
| 收款金额 | `128` |
| 支付渠道 | `offline` |
| 支付状态 | `success` |
| 积分流水 | `earn 1280` |
| 师傅收入 | `128` |

说明：以上 ID 和订单号为测试过程中生成的临时数据，测试结束后已经删除。

## 5. 账务检查明细

后台订单账务检查全部通过：

| 检查 key | 结果 | 信息 |
| --- | --- | --- |
| `payment` | 通过 | 支付流水正常 |
| `paid_amount` | 通过 | 历史支付金额正常 |
| `net_paid_amount` | 通过 | 退款后净收入口径正常 |
| `points` | 通过 | 积分发放流水正常 |
| `refund_points` | 通过 | 退款积分扣回正常 |
| `coupon` | 通过 | 优惠券锁定、核销、释放记录正常 |
| `refund` | 通过 | 退款流水正常 |
| `income` | 通过 | 师傅收入正常 |
| `offline_payment` | 通过 | 外来订单支付口径正常 |

## 6. 记录形成情况

清理前，本次闭环形成的业务记录如下：

| 记录类型 | 数量 | 说明 |
| --- | ---: | --- |
| 用户 | 1 | 线下注册客户 |
| 服务项目 | 1 | 测试服务 |
| 服务分类 | 1 | 测试分类 |
| 测试备用师傅 | 1 | 若无其他可派师傅时用于自动派单 |
| 订单 | 1 | 线下服务预约订单 |
| 支付记录 | 1 | 线下收款 `offline/success` |
| 支付通知日志 | 1 | 后台确认线下收款日志 |
| 地址 | 2 | 注册地址和下单地址 |
| 派单记录 | 1 | 自动派单记录 |
| 通知 | 2 | Admin 待派单通知、师傅派单通知 |
| 履约打卡 | 3 | 出发、开始、完成 |
| 完成照片 | 1 | 师傅完工照片 |
| 师傅收入 | 1 | 完成后生成服务收入 |
| 订单状态日志 | 8 | 从创建到完成的全流程状态流转 |
| 积分流水 | 1 | 线下支付后发放积分 |
| 审计日志 | 4 | 注册、创建订单、确认收款、自动派单 |

## 7. 状态流转

本次订单状态日志按顺序为：

```text
admin_create_order: null -> pending_payment
admin_confirm_offline_payment: pending_payment -> pending_dispatch
auto_assign: pending_dispatch -> dispatched
staff_accept: dispatched -> accepted
staff_on_the_way: accepted -> on_the_way
staff_start: on_the_way -> in_service
staff_complete: in_service -> pending_confirm
user_confirm: pending_confirm -> completed
```

## 8. 关键结论

1. 线下注册用户可以进入统一用户主数据，来源为 `offline`。
2. 线下未收款订单初始进入 `pending_payment`，系统不会允许未收款订单直接自动派单。
3. 后台确认线下收款后，订单进入 `pending_dispatch`，同时生成线下支付记录、支付通知日志、积分流水和 Admin 待派单通知。
4. 自动派单成功后，订单进入 `dispatched`，生成 `assignType=auto` 的派单记录和师傅端 `order_assigned` 通知。
5. 师傅端履约动作会生成完整状态日志、履约打卡和完成照片。
6. 用户确认完成后，订单最终进入 `completed`，生成师傅收入记录。
7. 后台订单账务检查通过，财务统计能统计到本次线下收款。
8. 测试完成后，脚本已经删除本次 `runId` 下全部测试数据，保持本地数据库干净。

## 9. 清理结果

清理前后计数：

| 数据类型 | 清理前 | 清理后 |
| --- | ---: | ---: |
| 用户 | 1 | 0 |
| 服务项目 | 1 | 0 |
| 服务分类 | 1 | 0 |
| 测试备用师傅 | 1 | 0 |
| 订单 | 1 | 0 |
| 支付记录 | 1 | 0 |
| 支付通知日志 | 1 | 0 |
| 地址 | 2 | 0 |
| 派单记录 | 1 | 0 |
| 通知 | 2 | 0 |
| 履约打卡 | 3 | 0 |
| 完成照片 | 1 | 0 |
| 师傅收入 | 1 | 0 |
| 订单状态日志 | 8 | 0 |
| 积分流水 | 1 | 0 |
| 审计日志 | 4 | 0 |

最终判定：线下注册用户、后台新增订单、确认线下收款、自动派单、师傅履约、用户确认、财务和记录沉淀闭环通过。

