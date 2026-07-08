# Day39 Admin 财务与经营闭环复核文档

更新时间：2026-07-08  
测试批次：`DAY39_TEST_20260708230038`  
验证方式：通过 Admin 后端服务/API 层直接创建和查询测试数据，验证后台可管理、可统计、可追踪的闭环能力。  
测试脚本：

```bash
cd server
npx tsx scripts/day39-admin-closed-loop-smoke.ts --run-id DAY39_TEST_20260708230038
npx tsx scripts/day39-clean-test-data.ts --run-id DAY39_TEST_20260708230038 --dry-run
npx tsx scripts/day39-clean-test-data.ts --run-id DAY39_TEST_20260708230038 --confirm
npx tsx scripts/day39-clean-test-data.ts --run-id DAY39_TEST_20260708230038 --dry-run
```

说明：本次没有做浏览器 UI 自动点击，验证重点是 admin 接口和后台服务层是否能形成业务闭环。前端页面点击体验仍建议后续补 Playwright/E2E。

## 1. 本次复核范围

本次只检查以下 5 个后台闭环：

| 编号 | 闭环项 | 本次结论 | 风险 |
| --- | --- | --- | --- |
| D39-01 | Admin 完整财务统计 | 部分闭环 | P0 |
| D39-02 | 外来订单载入、来源筛选和统计冗余 | 基本闭环，但统计冗余不足 | P1 |
| D39-03 | 优惠券后台管理 | 部分闭环 | P1 |
| D39-04 | 积分后台管理 | 未闭环 | P0 |
| D39-05 | 退款后台管理与退款后账务检查 | 部分闭环，发现账务检查缺陷 | P0 |

## 2. 测试数据链路

本次创建了 3 条模拟订单链路：

| 链路 | 订单号 | 目标 | 结果 |
| --- | --- | --- | --- |
| 优惠券支付并完成 | `LA202607082300401984` | 用券下单、mock 支付、派单、师傅完成、用户确认、生成收入 | 账务检查通过 |
| 外来线下订单 | `LA202607082300418218` | Admin 创建外来订单、确认线下收款、写 offline payment、按 source 查询 | 账务检查通过 |
| 优惠券支付后退款 | `LA202607082300417759` | 用券下单、mock 支付、用户申请退款、Admin 审核退款 | 退款成功，但退款后账务检查失败 |

核心测试结果：

```text
优惠券完成订单：
- previewDiscount=15
- accountingPassed=true
- incomeRecords=1

外来线下订单：
- source=offline
- accountingPassed=true
- admin source filter 可查到

退款订单：
- previewDiscount=20
- refundStatusAfterAdminReview=refunded
- accountingPassedAfterRefund=false
- 失败项：payment、paid_amount、coupon
```

数据库侧辅助证据：

```text
paymentByChannel: mock=205, offline=120
ordersBySource: miniapp=2, offline=1
grossAmount=360
discountAmount=35
paidAmount=325
refundedAmount=100
pointLedgerCount=4
pointNet=2250
incomeRecordCount=1
adminNotificationCount=3
staffNotificationCount=1
```

## 3. D39-01 Admin 完整财务统计

当前结论：部分闭环。

已具备能力：

1. Admin 仪表盘有基础经营指标：`users`、`orders`、`amount`、`dispatch`、`audit`。
2. Admin 有支付记录列表，可按支付单号、订单号、手机号等查询。
3. 单订单详情已有账务检查能力，可检查支付、积分、优惠券、收入、线下收款。
4. 退款审核和提现管理有独立入口。

本次验证证据：

```text
dashboardMetricKeys=["users","orders","amount","dispatch","audit"]
completePaymentVisibleInAdmin=true
externalPaymentVisibleInAdmin=true
refundPaymentVisibleInAdmin=true
```

未闭环问题：

1. 没有完整财务统计页，当前只有“今日实收”一类轻量指标。
2. 没有按日期范围汇总订单原价、优惠金额、实收、退款、净收入。
3. 没有按支付渠道统计：wechat、mock、offline、refund。
4. 没有按订单来源统计：miniapp、admin、phone、offline。
5. 没有把优惠券抵扣、积分发放/扣回、师傅收入、提现状态汇总到同一个财务报表。
6. 订单退款后，`orders.paidAmount` 仍保留历史支付金额，现有仪表盘如果直接按订单已付统计，会和净收入口径不一致。

必须固定成可执行问题：

```text
D39-FIN-01 新增 Admin 财务汇总接口
GET /api/admin/finance/summary?startDate=&endDate=&source=&channel=

D39-FIN-02 新增 Admin 财务统计页
/finance/statistics

D39-FIN-03 财务统计口径固定为：
grossAmount = orders.originalAmount
discountAmount = orders.discountAmount
paidAmount = success/partial_refunded/refunded payments.amount
refundAmount = refunded refunds.amount
netRevenue = paidAmount - refundAmount
couponDiscount = orders.discountAmount where couponId is not null
incomeAmount = staff_income_records.amount by status
withdrawAmount = withdraw_requests.amount by status

D39-FIN-04 报表必须支持按日期、订单来源、支付渠道、退款状态筛选。
```

## 4. D39-02 外来订单载入和统计冗余

当前结论：基本闭环，但统计冗余不足。

已具备能力：

1. Admin 可以创建外来订单。
2. 外来订单可以写入 `source=offline`。
3. Admin 可以确认线下收款，并写入 `channel=offline` 的 payment。
4. Admin 订单列表后端支持按 `source` 筛选。
5. 单订单账务检查可以识别外来订单是否有 offline payment。

本次验证证据：

```text
externalOrderVisibleBySourceFilter=true
externalOfflineOrder.source=offline
externalOfflineOrder.accountingPassed=true
paymentByChannel.offline=120
ordersBySource.offline=1
```

未闭环问题：

1. 外来订单已经能载入，但没有全局来源统计面板。
2. 外来订单来源仍是自由字符串，缺少统一枚举和来源字典。
3. “统计冗余”目前主要依赖订单表实时查询，没有形成稳定的订单财务统计读模型。
4. 外来订单和普通小程序订单在财务报表中的差异口径没有固定展示。

必须固定成可执行问题：

```text
D39-EXT-01 固定订单来源枚举：miniapp/admin/phone/offline/channels。
D39-EXT-02 Admin 订单筛选区增加来源筛选控件，和后端 source 查询保持一致。
D39-EXT-03 财务统计接口增加 source 分组。
D39-EXT-04 可选新增 order_finance_snapshots 或 finance_daily_snapshots，保存订单来源、支付渠道、优惠金额、退款金额、净收入等统计冗余字段。
```

## 5. D39-03 优惠券后台管理

当前结论：部分闭环。

已具备能力：

1. Admin 可以创建、编辑、上下架优惠券。
2. 用户可以领券。
3. 下单可锁券，支付成功可核销，退款成功可释放优惠券。
4. Admin 优惠券列表能看到 `issuedCount` 和 `receivedCount`。

本次验证证据：

```text
couponsVisibleInAdmin=true
couponRows:
- complete coupon issuedCount=1 receivedCount=1
- refund coupon issuedCount=1 receivedCount=1

退款后用户券：
- refund coupon status=available
- usedOrderId=null
```

未闭环问题：

1. Admin 只能看券配置和领取总数，看不到用户券明细。
2. Admin 看不到某张券的 available、locked、used、expired、released 分布。
3. Admin 不能按用户、手机号、订单号查询用户券使用流水。
4. Admin 暂无给指定用户发券入口。
5. 退款后优惠券释放是后端已发生，但 admin 没有专门的可视化记录说明。

必须固定成可执行问题：

```text
D39-CPN-01 新增 Admin 用户券明细接口
GET /api/admin/user-coupons?couponId=&userId=&status=&keyword=

D39-CPN-02 优惠券列表增加状态分布字段：
availableCount/lockedCount/usedCount/expiredCount/releasedCount

D39-CPN-03 新增 Admin 发券动作：
POST /api/admin/coupons/:id/grant

D39-CPN-04 订单详情账务检查显示券状态变化：
locked -> used -> available/expired/released
```

## 6. D39-04 积分后台管理

当前结论：未闭环。

已具备能力：

1. 支付成功后会写入积分流水。
2. 退款成功后会写入扣回积分流水。
3. 用户端有积分汇总和积分明细。
4. 单订单账务检查可以看到本订单积分流水。

本次验证证据：

```text
pointLedgerCount=4
pointNet=2250
complete/refund/offline 三条订单均产生或冲正积分记录
```

未闭环问题：

1. Admin 没有积分管理菜单。
2. Admin 没有积分流水列表接口。
3. Admin 不能按用户、手机号、订单号查询积分。
4. Admin 不能人工调整积分。
5. Admin 不能看到积分发放失败、补偿、重建等审计信息。
6. 财务统计没有纳入积分发放和扣回口径。

必须固定成可执行问题：

```text
D39-PTS-01 新增 Admin 积分流水接口
GET /api/admin/points/ledgers?keyword=&type=&startDate=&endDate=

D39-PTS-02 新增用户积分汇总接口
GET /api/admin/users/:id/points

D39-PTS-03 新增人工调整积分能力
POST /api/admin/users/:id/points/adjust
必须写 audit_logs。

D39-PTS-04 财务统计增加 pointsEarned、pointsDeducted、pointsNet。

D39-PTS-05 新增积分补偿脚本，用于扫描已支付但缺少 earn 流水的历史订单。
```

## 7. D39-05 退款后台管理与账务检查

当前结论：部分闭环，发现 P0 缺陷。

已具备能力：

1. 用户可申请退款。
2. Admin 退款审核列表可看到待审核退款。
3. Admin 审核通过后 mock 渠道退款可以直接完成。
4. 退款成功后会释放优惠券。
5. 退款成功后会扣回积分。
6. Admin 退款列表可查询到已退款记录。

本次验证证据：

```text
refundAuditVisibleBeforeReview=true
refundStatusAfterAdminReview=refunded
refundedRecordVisibleInAdminRefundList=true
refund coupon status=available
refund order point ledger 包含 earn 和 refund_deduct
```

发现的 P0 问题：

退款成功后，订单账务检查失败：

```text
accountingPassedAfterRefund=false
失败项：
- payment: 订单已支付但缺少成功支付流水
- paid_amount: 支付金额与订单已付金额不一致
- coupon: 订单使用优惠券但缺少用户券关联
```

原因判断：

1. 退款完成后 payment 状态变为 `refunded`，现有账务检查只把 `success` 当作成功支付流水。
2. 退款后用户券被释放，`usedOrderId` 被清空，现有账务检查仍要求订单存在用户券关联。
3. 退款后的支付金额检查没有区分“历史支付金额”和“当前净收入”。
4. 已退款订单缺少专门的 refund 校验项，例如退款金额、payment.refundedAmount、order.status、coupon release、points deduct、income reversed。

必须固定成可执行问题：

```text
D39-RFD-01 修复订单账务检查对已退款订单的判断。

payment 检查：
已退款订单应接受 payment.status in [success, partial_refunded, refunded]。

paid_amount 检查：
历史支付金额应和 payment.amount 对齐；
净收入应通过 payment.amount - payment.refundedAmount 或 finance summary 计算。

coupon 检查：
已退款订单如果用户券已释放，status=available/expired/released 且 usedOrderId=null 应判定为正常。

refund 检查：
新增 refund check，校验 refunds.status=refunded、payment.refundedAmount、refund.amount 是否一致。

points 检查：
已退款订单必须同时存在 earn 和 refund_deduct，或明确说明无需扣回。

income 检查：
已完成后退款的订单必须校验 staff_income_records 是否 reversed；
如果已提现，应生成 manual review 记录。
```

## 8. Admin 当前闭环矩阵

| 能力 | 是否可操作 | 是否可查询 | 是否可统计 | 是否形成闭环 |
| --- | --- | --- | --- | --- |
| 支付记录 | 是 | 是 | 弱 | 部分闭环 |
| 单订单账务检查 | 是 | 是 | 否 | 部分闭环 |
| 外来订单创建 | 是 | 是 | 弱 | 基本闭环 |
| 线下收款 | 是 | 是 | 弱 | 基本闭环 |
| 优惠券配置 | 是 | 是 | 弱 | 部分闭环 |
| 用户券明细 | 否 | 否 | 否 | 未闭环 |
| 积分流水 | 否 | 否 | 否 | 未闭环 |
| 退款审核 | 是 | 是 | 弱 | 部分闭环 |
| 退款后账务检查 | 是 | 是 | 否 | 未通过 |
| 师傅收入 | 后端有 | 订单详情有 | 弱 | 部分闭环 |
| 提现管理 | 是 | 是 | 弱 | 部分闭环 |

## 9. 测试数据清理证明

清理前 dry-run：

```text
orders=3
users=3
coupons=2
services=1
serviceCategories=1
staff=1
payments=3
```

执行确认清理后：

```text
orders=0
users=0
coupons=0
services=0
serviceCategories=0
staff=0
payments=0
withdraws=0
tickets=0
reviews=0
```

增强版最终 dry-run 复核：

```text
orders=0
users=0
coupons=0
services=0
serviceCategories=0
staff=0
payments=0
addresses=0
refunds=0
paymentNotifyLogs=0
pointLedgers=0
userCoupons=0
notifications=0
orderAssignments=0
orderStatusLogs=0
servicePhotos=0
serviceCheckins=0
incomeRecords=0
files=0
auditLogs=0
```

结论：`DAY39_TEST_20260708230038` 测试数据已清理干净。

## 10. 下一步执行顺序

建议按以下顺序进入修复：

1. P0：先修复退款后订单账务检查逻辑，避免已退款订单被错误判为账务异常。
2. P0：新增 Admin 积分流水管理，至少先做只读列表和用户积分汇总。
3. P0：新增 Admin 财务统计接口，固定净收入、退款、优惠、来源、渠道口径。
4. P1：新增优惠券用户券明细页和发券能力。
5. P1：补外来订单来源筛选控件、来源枚举和来源统计。
6. P1：补 admin UI 自动化测试，覆盖财务统计、订单详情账务检查、退款审核、优惠券明细、积分流水。

## 11. Day39 固定问题清单

| 编号 | 问题 | 优先级 | 验收标准 |
| --- | --- | --- | --- |
| D39-FIN-01 | Admin 缺完整财务统计接口 | P0 | 可按日期、来源、渠道输出总收入、退款、净收入、优惠、积分、收入、提现 |
| D39-FIN-02 | Admin 缺财务统计页面 | P0 | `/finance/statistics` 可查看并筛选财务汇总 |
| D39-RFD-01 | 已退款订单账务检查失败 | P0 | 已退款订单 payment/paid_amount/coupon/refund/points/income 检查全部按退款口径通过 |
| D39-PTS-01 | Admin 缺积分流水列表 | P0 | 可按用户、手机号、订单号、类型查询积分流水 |
| D39-PTS-02 | Admin 缺积分调整能力 | P1 | 调整积分必须写积分流水和审计日志 |
| D39-CPN-01 | Admin 缺用户券明细 | P1 | 可查每张用户券状态、用户、订单、领取/使用/释放时间 |
| D39-CPN-02 | Admin 缺手动发券 | P1 | 可给指定用户发券并写审计日志 |
| D39-EXT-01 | 外来订单缺全局来源统计 | P1 | 财务统计和订单统计均可按 source 分组 |
| D39-EXT-02 | 订单来源缺统一枚举 | P2 | 前后端统一 source 选项和展示名称 |

## 12. Day39 闭环修复执行结果

更新时间：2026-07-08  
修复验证批次：`DAY39_TEST_20260708233645`

本次已按 Day39 未闭环清单完成代码修复，并用模拟订单重新跑通 admin 闭环。修复范围如下：

| 编号 | 修复项 | 当前结论 | 验证方式 |
| --- | --- | --- | --- |
| D39-FIN-01 | 新增 Admin 财务汇总接口 `/api/admin/finance/summary` | 已闭环 | 烟测读取 paid/refund/net/source/channel/coupon/points |
| D39-FIN-02 | 新增 Admin 财务统计页 `/finance/statistics` | 已闭环 | admin 类型检查通过，页面可筛选日期、来源、渠道 |
| D39-RFD-01 | 修复已退款订单账务检查 | 已闭环 | 退款订单 `accountingPassedAfterRefund=true` |
| D39-PTS-01 | 新增 Admin 积分流水列表 `/api/admin/points/ledgers` | 已闭环 | 可按用户查询 earn/refund_deduct/admin_adjust |
| D39-PTS-02 | 新增 Admin 人工调整积分 | 已闭环 | 调整写入 `point_ledgers` 和 `audit_logs` |
| D39-CPN-01 | 新增用户券明细 `/api/admin/user-coupons` | 已闭环 | 可查领取、核销、退款释放状态 |
| D39-CPN-02 | 新增 Admin 发券 `/api/admin/coupons/:id/grant` | 已闭环 | 后台发券后用户券明细可见 |
| D39-EXT-01 | 外来订单来源统计 | 已闭环 | 财务汇总含 `ordersBySource` 和 `paymentsByChannel` |
| D39-EXT-02 | 订单来源前端筛选 | 已闭环 | 订单列表新增来源筛选控件 |

本次烟测核心结果：

```text
couponCompletedOrder.accountingPassed=true
externalOfflineOrder.accountingPassed=true
refundedOrder.accountingPassedAfterRefund=true
closedLoopJudgement.completeFinanceStatistics=closed
closedLoopJudgement.couponManagement=closed
closedLoopJudgement.pointsManagement=closed
closedLoopJudgement.refundManagement=closed

financeSummary:
- orderCount=3
- paidAmount=325
- refundAmount=100
- netRevenue=225
- couponDiscount=35
- pointsEarned=3338
- pointsDeducted=1000
- pointsNet=2338

offlineFinanceSummary:
- orderCount=1
- paidAmount=120
- netRevenue=120
- hasOfflineSource=true
- hasOfflineChannel=true
```

本次验证命令：

```bash
cd server
npx tsx scripts/day39-admin-closed-loop-smoke.ts --run-id DAY39_TEST_20260708233645
npx tsx scripts/day39-clean-test-data.ts --run-id DAY39_TEST_20260708233645 --dry-run
npx tsx scripts/day39-clean-test-data.ts --run-id DAY39_TEST_20260708233645 --confirm
npx tsx scripts/day39-clean-test-data.ts --run-id DAY39_TEST_20260708233645 --dry-run
```

测试数据清理结果：

```text
final dry-run:
orders=0
users=0
coupons=0
services=0
serviceCategories=0
staff=0
payments=0
refunds=0
pointLedgers=0
userCoupons=0
notifications=0
orderAssignments=0
orderStatusLogs=0
servicePhotos=0
serviceCheckins=0
incomeRecords=0
auditLogs=0
```

本次编译校验：

```bash
cd server && npx tsc --noEmit --pretty false
cd admin && npm run type-check
```

结论：Day39 文档中被标记为未闭环或部分闭环的 admin 财务统计、优惠券、积分、退款后账务检查、外来订单来源统计入口，当前已经通过模拟订单验证形成闭环。手机号注册验证码问题不在本次修复范围内，保持现状。
