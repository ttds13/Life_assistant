# Day 32 - 师傅提现闭环与 Admin 管理计划

## 1. 目标

Day32 目标是把 Day31 中“证件结算仅展示收入”的状态，推进到“师傅可申请提现、后台可审核和打款、微信转账结果可回调闭环、财务可对账”的可交付状态。

第一版采用微信支付官方新版“商家转账”的用户确认收款模式：

```text
师傅申请提现
-> 后台审核
-> 后端创建微信商家转账单
-> 小程序调起用户确认收款
-> 微信回调/查单确认结果
-> 更新提现单、收入流水、审计日志
```

本次不做复杂自动结算策略，不做自动批量免审，不做银行卡提现，不走退款接口，不使用旧企业付款到零钱接口。

## 2. 微信官方规则依据

| 规则点 | Day32 采用方式 | 官方文档 |
| --- | --- | --- |
| 提现到微信零钱应使用新版商家转账 | 使用 `POST /v3/fund-app/mch-transfer/transfer-bills` | https://pay.wechatpay.cn/doc/v3/merchant/4012716434 |
| 商户需要开通商家转账能力 | 上线前配置商户平台产品能力、转账场景、来源 IP | https://pay.wechatpay.cn/doc/v3/merchant/4013740645 |
| 用户确认收款模式 | 后台打款后小程序用 `wx.requestMerchantTransfer` 调起确认 | https://pay.wechatpay.cn/doc/v3/merchant/4012716430 |
| 小程序成功回调不代表到账 | 后端只以微信回调/查单结果更新为 `paid` | https://pay.wechatpay.cn/doc/v3/merchant/4012716430 |
| 单笔大额实名校验 | 第一版默认单笔上限 1999.99 元；后续支持 >= 2000 元时必须加密传 `user_name` | https://pay.wechatpay.cn/doc/v3/merchant/4012711988 |
| 转账结果回调必须幂等 | 新增微信转账回调，重复通知只处理一次 | https://pay.wechatpay.cn/doc/v3/merchant/4012712115 |
| 查单只覆盖近期数据 | 30 天内用查单兜底，超过 30 天走资金账单/人工对账 | https://pay.wechatpay.cn/doc/v3/merchant/4012716437 |

## 3. 当前项目基础

当前已有基础表和后台入口：

```text
server/prisma/schema.prisma
- StaffIncomeRecord
- WithdrawRequest

server/src/admin-business/admin-business.service.ts
- listAuditItems 中已展示 pending withdraw
- reviewWithdraw 当前只改 approved/rejected

admin/src/views/life/audit/index.vue
- 已有提现审核入口
```

需要升级的问题：

1. `WithdrawRequest` 只有金额、状态、bankInfo、handledBy，无法承载微信商家转账单、回调、失败原因、重试、用户确认收款。
2. 后台审核通过后没有真正打款动作。
3. 师傅端没有提现申请、提现记录、确认收款入口。
4. 收入流水没有和提现冻结、提现成功做强关联。
5. 没有转账回调、查单、撤销、对账和幂等保护。

## 4. 业务规则

| 项目 | 规则 |
| --- | --- |
| 提现对象 | 仅允许已认证、状态正常、未冻结的师傅申请提现 |
| 提现金额来源 | 只允许来自已结算收入，不允许提现进行中订单、售后争议订单、退款中订单 |
| 可提现余额 | `已结算收入 - 已提现成功金额 - 提现冻结中金额 - 冲正金额` |
| 最低提现金额 | 第一版设为 10 元，可后台配置 |
| 单笔上限 | 第一版设为 1999.99 元，避免未完成实名加密前触发 2000 元实名强校验 |
| 每日上限 | 第一版设为 5000 元，可后台配置，并受微信商户平台额度限制 |
| 提现周期 | 默认 T+1 可提现，即订单完成后隔天进入可提现余额 |
| 活跃提现单限制 | 同一师傅同一时间只能存在一笔 `pending_review / approved / processing / wait_user_confirm` 提现 |
| 用户确认时限 | 微信用户确认收款有效期按官方能力处理，第一版本地按 24 小时展示和超时扫描 |
| 成功后撤销 | `paid` 后不可撤销，只能后台人工冲正或财务线下处理 |
| 失败处理 | `failed` 后释放冻结余额，后台可重试或转人工处理 |
| 拒绝处理 | `rejected` 后释放冻结余额，记录拒绝原因并通知师傅端展示 |

## 5. 提现状态机

| 状态 | 含义 | 入口动作 | 允许动作 |
| --- | --- | --- | --- |
| `pending_review` | 师傅已提交，等待后台审核 | 师傅申请提现 | 后台通过、后台拒绝、师傅取消 |
| `approved` | 后台审核通过，尚未创建微信单 | 后台审核通过 | 创建微信转账单 |
| `processing` | 正在请求微信或等待微信初始结果 | 执行转账 | 等待结果、标记失败 |
| `wait_user_confirm` | 微信已生成确认收款参数，等待师傅确认 | 微信返回 `package_info` | 小程序调起确认、撤销、超时 |
| `paid` | 微信确认转账成功 | 微信回调或查单成功 | 只允许查看和对账 |
| `failed` | 微信转账失败或异常关闭 | 微信回调/查单失败 | 后台重试、转人工 |
| `rejected` | 后台审核拒绝 | 后台拒绝 | 只允许查看 |
| `cancelled` | 师傅取消或后台撤销未确认转账 | 取消/撤销 | 只允许查看 |
| `expired` | 超过确认时限未收款 | 定时任务或查单 | 后台重试或关闭 |
| `manual_handling` | 异常进入人工处理 | 后台标记 | 人工处理完成后关闭 |

推荐状态流：

```text
pending_review
-> approved
-> processing
-> wait_user_confirm
-> paid

pending_review -> rejected
pending_review -> cancelled
processing -> failed
wait_user_confirm -> failed / expired / cancelled
failed -> processing
```

## 6. 实施计划表

| 批次 | 目标 | 主要文件 | 验收 |
| --- | --- | --- | --- |
| 1 | 补齐提现业务规则和配置 | `docs/plans/day32...`、后续配置表/常量 | 规则、状态、额度、风控口径明确 |
| 2 | 升级 Prisma 数据模型 | `server/prisma/schema.prisma`、migration | 能记录微信单号、回调、失败原因、重试和审计 |
| 3 | 新增 WithdrawalsService | `server/src/withdrawals/*` | 师傅申请、后台审核、执行转账、回调、查单全部从 service 收口 |
| 4 | 扩展 WechatPayClient | `server/src/payments/wechat-pay.client.ts` | 支持商家转账、查单、撤销、回调解析 |
| 5 | 接入师傅端 API 和页面 | `miniapp/src/api/staff.ts`、`miniapp/src/pages/staff/settlement.vue` | 师傅可看余额、申请提现、查看记录、确认收款 |
| 6 | 接入 Admin 管理 | `admin/src/api/life/*`、`admin/src/views/life/*` | 后台可审核、打款、重试、撤销、查单、查看日志 |
| 7 | 测试和对账 | 后端构建、前端构建、接口联调 | 主链路、失败链路、幂等、权限全部通过 |

## 7. 第一步：补提现配置和规则常量

### 7.1 配置项

建议先增加后端配置常量，后续再迁到后台可配置表：

```text
WITHDRAW_MIN_AMOUNT=10
WITHDRAW_MAX_SINGLE_AMOUNT=1999.99
WITHDRAW_DAILY_LIMIT=5000
WITHDRAW_SETTLEMENT_DAYS=1
WITHDRAW_PROVIDER=mock/wechat
WECHAT_TRANSFER_SCENE_ID=...
WECHAT_TRANSFER_NOTIFY_URL=...
```

### 7.2 业务校验

执行提现申请前必须校验：

1. 当前登录用户能解析到有效 `staffId`。
2. `Staff.status = 1`，未删除，已认证。
3. 用户必须存在微信 `openid`。
4. 金额 >= 最低提现金额。
5. 金额 <= 单笔提现上限。
6. 当日累计提现金额 + 本次金额 <= 每日上限。
7. 可提现余额 >= 本次金额。
8. 不存在活跃提现单。
9. 师傅没有被后台冻结提现。

验收：

```text
非法金额返回 400
余额不足返回 409
未认证师傅返回 403
无 openid 返回 400
重复申请返回 409
```

## 8. 第二步：升级数据模型

### 8.1 扩展 WithdrawRequest

当前 `WithdrawRequest` 需要补字段：

```text
withdrawNo          唯一提现单号，如 WD20260704...
channel             mock / wechat
outBillNo           商户转账单号，可复用 withdrawNo
transferBillNo      微信转账单号
packageInfo         小程序确认收款参数
openid              收款用户 openid
userNameEncrypted   大额实名校验使用，第一版可预留
amountFen           分为单位，避免浮点误差
feeAmount           手续费，第一版默认 0
availableSnapshot   提现申请时可提现余额快照
failureReason       失败原因
rejectReason        拒绝原因
reviewedBy          审核人
reviewedAt          审核时间
processedAt         发起微信时间
paidAt              成功时间
expiredAt           超时时间
notifyRaw           微信回调原文/解密后摘要
retryCount          重试次数
version             乐观锁
requestId           幂等请求 ID
```

### 8.2 增加提现日志表

新增 `WithdrawStatusLog`：

```text
id
withdrawRequestId
fromStatus
toStatus
action
operatorType        staff/admin/system/wechat
operatorId
remark
detail
requestId
createdAt
```

### 8.3 收入流水关联提现

升级 `StaffIncomeRecord`：

```text
withdrawRequestId   可空，提现冻结或提现成功后关联
withdrawStatus      none/frozen/withdrawn/released
settlementStatus    pending/settled/blocked/reversed
availableAt         可提现时间
```

验收：

```text
npx prisma validate
npx prisma migrate dev
npm run build
```

## 9. 第三步：新增 WithdrawalsService

不要继续把提现逻辑堆在 `AdminBusinessService.reviewWithdraw` 中。建议新增：

```text
server/src/withdrawals/withdrawals.module.ts
server/src/withdrawals/withdrawals.controller.ts
server/src/withdrawals/withdrawals.service.ts
server/src/withdrawals/dto/create-withdraw-request.dto.ts
server/src/withdrawals/dto/review-withdraw.dto.ts
server/src/withdrawals/dto/retry-withdraw.dto.ts
```

核心方法：

```text
getStaffWithdrawSummary(staffId)
listStaffWithdrawRequests(staffId, query)
createWithdrawRequest(staffId, dto, requestId)
cancelWithdrawRequest(staffId, withdrawId)

listAdminWithdrawRequests(query)
getAdminWithdrawDetail(id)
approveWithdraw(id, adminContext)
rejectWithdraw(id, dto, adminContext)
executeWithdraw(id, adminContext)
retryWithdraw(id, adminContext)
cancelWechatTransfer(id, adminContext)
queryWechatTransfer(id, adminContext)

handleWechatTransferNotify(rawBody, headers, requestId)
markTransferSuccess(...)
markTransferFailed(...)
releaseFrozenAmount(...)
```

### 9.1 师傅端接口

```text
GET  /staff/withdrawals/summary
GET  /staff/withdrawals
POST /staff/withdrawals
POST /staff/withdrawals/:id/cancel
POST /staff/withdrawals/:id/confirm-package
```

`confirm-package` 返回给小程序：

```json
{
  "withdrawId": 1,
  "withdrawNo": "WD202607040001",
  "status": "wait_user_confirm",
  "packageInfo": "xxx"
}
```

### 9.2 后台接口

```text
GET  /admin/withdraw-requests
GET  /admin/withdraw-requests/:id
POST /admin/withdraw-requests/:id/review
POST /admin/withdraw-requests/:id/execute
POST /admin/withdraw-requests/:id/retry
POST /admin/withdraw-requests/:id/cancel-transfer
POST /admin/withdraw-requests/:id/query-transfer
POST /admin/withdraw-requests/:id/manual-handle
```

权限：

```text
finance:withdraw:list
finance:withdraw:detail
finance:withdraw:audit
finance:withdraw:execute
finance:withdraw:retry
finance:withdraw:reconcile
```

验收：

```text
普通 staff token 不能访问 admin withdraw API
普通 admin 角色没有权限不能审核/打款
所有后台操作写 admin audit log
```

## 10. 第四步：微信商家转账适配

### 10.1 扩展配置

在 `server/src/payments/wechat-pay.config.ts` 中补：

```text
transferNotifyUrl
transferSceneId
```

`onModuleInit` 条件也要包含：

```text
WITHDRAW_PROVIDER=wechat
```

### 10.2 扩展类型

在 `server/src/payments/wechat-pay.types.ts` 增加：

```text
WechatTransferRequest
WechatTransferResponse
WechatTransferQueryResponse
WechatTransferNotify
WechatTransferNotifyResult
```

### 10.3 扩展客户端

在 `WechatPayClient` 增加：

```text
createMerchantTransfer(...)
queryMerchantTransferByOutBillNo(...)
cancelMerchantTransfer(...)
parseTransferNotify(...)
```

发起转账 API：

```text
POST /v3/fund-app/mch-transfer/transfer-bills
```

关键请求字段：

```text
appid
out_bill_no
transfer_scene_id
openid
transfer_amount
transfer_remark
notify_url
transfer_scene_report_infos
user_name    单笔 >= 2000 元才允许第一版后续开启
```

### 10.4 回调接口

新增：

```text
POST /payments/wechat/transfer-notify
```

回调处理要求：

1. 验签。
2. 解密 resource。
3. 用 `out_bill_no` 找提现单。
4. 已经 `paid` 的直接返回成功。
5. 金额、商户号、appid 必须校验。
6. 事务内更新提现单、收入流水、状态日志、通知日志。
7. 不认识的单号记录日志但不更新业务。

验收：

```text
重复回调不会重复扣减收入
回调成功后提现单为 paid
回调失败后可重试或人工处理
```

## 11. 第五步：收入结算和余额计算

### 11.1 完成订单生成收入记录

在师傅完成服务或订单最终确认后，生成或更新 `StaffIncomeRecord`：

```text
type = service_income
status = pending_settlement
amount = 订单服务金额或后续佣金规则金额
availableAt = completedAt + WITHDRAW_SETTLEMENT_DAYS
```

如果当前 Day30 已经使用订单金额作为收入展示，则第一版先沿用 `payableAmount` 汇总，但必须在文案中写“服务金额/预计收入”，不要写成最终佣金。

### 11.2 定时结算

新增系统任务或服务方法：

```text
settleAvailableIncome()
```

规则：

1. 订单已完成。
2. 没有 open/pending 售后。
3. 没有退款中。
4. 到达 `availableAt`。
5. 更新收入记录为 `settled`。

### 11.3 申请提现冻结收入

创建提现单时，在事务内：

1. 锁定师傅收入记录。
2. 选取 `settled` 且未提现记录。
3. 累加到提现金额。
4. 标记为 `frozen` 并关联 `withdrawRequestId`。
5. 创建提现单为 `pending_review`。

拒绝、失败、取消、超时时释放冻结；成功后标记为 `withdrawn`。

验收：

```text
并发申请不会重复冻结同一收入
拒绝后余额恢复
成功后余额减少
售后中收入不会进入可提现
```

## 12. 第六步：师傅端页面

### 12.1 改造结算页

文件：

```text
miniapp/src/pages/staff/settlement.vue
```

新增展示：

```text
可提现余额
提现中金额
累计提现成功
待结算金额
最低提现金额
预计到账方式：微信零钱
```

动作：

```text
申请提现
查看提现记录
查看提现规则
```

### 12.2 新增提现申请页

新增：

```text
miniapp/src/pages/staff/withdraw-create.vue
```

字段：

```text
提现金额
当前可提现余额
手续费说明
到账方式：微信零钱
规则确认 checkbox
```

提交后：

```text
pending_review -> 展示“等待后台审核”
```

### 12.3 新增提现记录页

新增：

```text
miniapp/src/pages/staff/withdraw-list.vue
miniapp/src/pages/staff/withdraw-detail.vue
```

展示：

```text
提现单号
金额
状态
申请时间
审核时间
打款时间
失败/拒绝原因
```

`wait_user_confirm` 状态下展示“确认收款”按钮，调用 `wx.requestMerchantTransfer`。

### 12.4 小程序确认收款工具

新增：

```text
miniapp/src/utils/wechatTransfer.ts
```

封装：

```text
requestMerchantTransfer({ package_info })
```

注意：

1. 前端成功只刷新状态，不直接认为已到账。
2. 前端失败如果是用户取消，不改后端为 failed。
3. 只有后端回调/查单成功后才显示 `paid`。

验收：

```text
师傅可以申请提现
后台通过后，师傅可以在记录中调起确认收款
取消确认不会重复创建提现单
```

## 13. 第七步：Admin 管理页面

### 13.1 审核中心升级

当前 `admin/src/views/life/audit/index.vue` 已能展示提现审核。需要补：

1. 提现详情弹窗展示完整信息。
2. 审核通过后不只改状态，需要调用 `WithdrawalsService.approveWithdraw`。
3. 审核通过后可选择“立即打款”或进入“待打款”。
4. 拒绝必须填写原因。

### 13.2 新增提现管理页

建议新增：

```text
admin/src/views/life/finance/withdraws.vue
```

列表字段：

```text
提现单号
师傅姓名
手机号
提现金额
可提现快照
状态
渠道
微信转账单号
失败原因
申请时间
审核人
审核时间
打款时间
```

操作：

```text
查看详情
审核通过
审核拒绝
执行打款
重试打款
撤销未确认转账
主动查单
标记人工处理
导出
```

### 13.3 财务配置页

后续可新增：

```text
admin/src/views/life/finance/withdraw-config.vue
```

配置项：

```text
最低提现金额
单笔上限
每日上限
结算周期 T+N
是否自动审核
是否开启微信打款
商家转账场景 ID
```

Day32 第一版可先硬编码配置，后台配置页放到 Day33。

验收：

```text
没有 finance:withdraw:audit 权限不能审核
没有 finance:withdraw:execute 权限不能打款
所有操作写 admin audit log
列表可按状态、师傅、时间筛选
```

## 14. 第八步：Mock 与微信双通道

本地开发先保留 mock：

```text
WITHDRAW_PROVIDER=mock
```

Mock 行为：

1. 审核通过后可立即进入 `paid`，用于跑通余额、状态和 UI。
2. 也支持手动模拟 `failed`，用于测试重试。
3. Mock 不生成真实 `packageInfo`，小程序确认收款按钮隐藏。

微信行为：

```text
WITHDRAW_PROVIDER=wechat
```

1. 审核通过后创建微信商家转账。
2. 返回 `packageInfo` 后进入 `wait_user_confirm`。
3. 小程序调起确认收款。
4. 回调或查单成功后进入 `paid`。

验收：

```text
mock 能跑通完整业务闭环
wechat 配置缺失时启动或执行时有明确错误
```

## 15. 第九步：测试清单

| 编号 | 场景 | 预期 |
| --- | --- | --- |
| 1 | 未认证师傅申请提现 | 403 |
| 2 | 无 openid 师傅申请提现 | 400 |
| 3 | 低于最低金额提现 | 400 |
| 4 | 超过可提现余额 | 409 |
| 5 | 同一师傅重复提交活跃提现 | 409 |
| 6 | 后台拒绝提现 | 状态 `rejected`，冻结收入释放 |
| 7 | 后台审核通过但未打款 | 状态 `approved` |
| 8 | mock 打款成功 | 状态 `paid`，收入记录 `withdrawn` |
| 9 | mock 打款失败 | 状态 `failed`，可重试 |
| 10 | 微信返回 packageInfo | 状态 `wait_user_confirm` |
| 11 | 用户取消确认收款 | 状态保持 `wait_user_confirm` |
| 12 | 微信成功回调重复通知 | 只更新一次，余额不重复扣减 |
| 13 | 微信失败回调 | 状态 `failed`，记录失败原因 |
| 14 | 后台主动查单成功 | 状态补偿为 `paid` |
| 15 | 超时未确认 | 状态 `expired` 或后台撤销，冻结释放 |
| 16 | 普通 admin 无权限审核 | 403 |
| 17 | 普通 admin 无权限打款 | 403 |
| 18 | 提现成功后订单售后退款 | 进入人工财务冲正，不自动扣回微信零钱 |

## 16. 构建和回归

后端：

```text
cd server
npx prisma validate
npm run build
```

小程序：

```text
cd miniapp
npm run type-check
npm run build:mp
```

后台：

```text
cd admin
npm run type-check
npm run build
```

源码残留检查：

```text
rg "enterprise pay|企业付款|bankInfo" server/src miniapp/src admin/src
rg "finance:withdraw" server/src admin/src
rg "requestMerchantTransfer|withdraw" miniapp/src
```

## 17. 验收标准

Day32 完成后必须满足：

1. 师傅端可以看到可提现余额、提现中金额、累计提现金额和提现记录。
2. 师傅可以提交提现申请，重复申请和余额不足被拦截。
3. 后台可以审核提现、拒绝提现、执行打款、重试、查单、撤销未确认转账。
4. 微信商家转账回调幂等，重复回调不会重复更新余额。
5. `paid` 后收入流水和提现单状态一致。
6. `failed/rejected/cancelled/expired` 后冻结金额会释放。
7. 所有后台敏感操作都有权限控制和审计日志。
8. mock 通道和微信通道都有清晰配置，不会误打真实款。
9. 构建全部通过。

## 18. 推荐实施顺序

### 批次 1：安全边界和模型

1. 明确提现状态机和额度规则。
2. 升级 `WithdrawRequest`。
3. 新增 `WithdrawStatusLog`。
4. 升级 `StaffIncomeRecord`。
5. 跑 Prisma 校验和后端构建。

### 批次 2：后端业务闭环

1. 新增 `WithdrawalsModule`。
2. 实现余额计算。
3. 实现提现申请和冻结收入。
4. 实现后台审核通过/拒绝。
5. 实现 mock 打款成功/失败。
6. 接入 AdminBusinessService 的提现审核入口。

### 批次 3：微信商家转账

1. 扩展 `WechatPayConfig`。
2. 扩展 `WechatPayClient`。
3. 实现发起转账。
4. 实现转账回调。
5. 实现查单和撤销。
6. 做重复回调和异常查单测试。

### 批次 4：师傅端

1. 改造 `settlement.vue`。
2. 新增提现申请页。
3. 新增提现记录和详情页。
4. 封装 `wx.requestMerchantTransfer`。
5. 联调确认收款和状态刷新。

### 批次 5：Admin 管理

1. 升级审核中心提现详情。
2. 新增提现管理列表。
3. 增加打款、重试、查单、撤销操作。
4. 补权限点和审计日志。
5. 增加导出/筛选能力。

### 批次 6：测试验收

1. 跑 mock 全链路。
2. 跑微信沙箱/测试商户链路。
3. 跑权限测试。
4. 跑并发申请测试。
5. 跑构建。
6. 输出最终验收记录。
