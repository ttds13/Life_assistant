# Day46 会员卡时长余额闭环测试报告

测试时间：2026-07-09  
测试脚本：`server/scripts/day46-member-card-time-balance-smoke.ts`  
测试标识：`DAY46_MEMBER_CARD_TIME_BALANCE_TEST_20260709_001`

## 测试目标

验证时长类会员卡从购买、发卡、预约冻结、师傅按实际时长核销、用户确认完成、Admin 手动调整余额，到用户端、师傅端、Admin 三端余额一致展示的完整闭环。

## 执行链路

1. 创建测试服务分类、时长服务、120 分钟会员卡模板、用户、地址、师傅。
2. Admin 线下已收款方式创建会员卡购买订单，并自动发放用户会员卡。
3. 校验发卡后余额：`remainingUnits=120`，`frozenUnits=0`，`usableUnits=120`。
4. Admin 使用该会员卡创建服务预约订单，系统冻结 120 分钟。
5. 校验冻结后余额：`remainingUnits=120`，`frozenUnits=120`，`usableUnits=0`。
6. Admin 派单给师傅，师傅接单、出发、开始服务。
7. 师傅完成服务时提交 `actualMinutes=60` 和符合 OSS 规则的完工照片 URL。
8. 校验核销结果：实际核销 60 分钟，释放 60 分钟。
9. 用户确认完成订单。
10. Admin 对该用户会员卡手动增加 30 分钟，并记录调整原因。
11. 校验调整后余额：`remainingUnits=90`，`frozenUnits=0`，`usableUnits=90`。
12. 分别校验用户卡包、师傅订单详情、Admin 流水列表中的余额和 `admin_adjust` 流水。
13. 测试结束后删除本次模拟订单、会员卡、流水、用户、师傅、服务等测试数据。

## 断言结果

| 断言 | 结果 |
| --- | --- |
| 线下购买会员卡后成功发卡 120 分钟 | 通过 |
| 会员卡预约订单成功冻结 120 分钟 | 通过 |
| 师傅完成服务后按 60 分钟核销并释放 60 分钟 | 通过 |
| 用户确认完成后订单状态闭环 | 通过 |
| Admin 手动增加 30 分钟后余额变为 90 分钟 | 通过 |
| 用户端、师傅端、Admin 查询余额一致 | 通过 |
| 会员卡流水包含 `grant/freeze/consume/release/admin_adjust` | 通过 |
| 测试数据自动清理 | 通过 |

## 清理结果

测试脚本结束后复查残留数据：

| 数据类型 | 清理后数量 |
| --- | ---: |
| users | 0 |
| staff | 0 |
| services | 0 |
| categories | 0 |
| memberCards | 0 |
| userMemberCards | 0 |
| orders | 0 |
| payments | 0 |
| memberCardRecords | 0 |
| pointLedgers | 0 |
| auditLogs | 0 |

## 验证命令

```powershell
cd server
npm run build
.\node_modules\.bin\tsx.cmd scripts\day46-member-card-time-balance-smoke.ts --run-id=DAY46_MEMBER_CARD_TIME_BALANCE_TEST_20260709_001

cd ..\admin
pnpm type-check

cd ..\miniapp
pnpm type-check
```

## 结论

Day46 会员卡时长余额闭环已跑通。当前实现支持用户购买会员卡、预约冻结、师傅按具体分钟核销、Admin 调整单张用户会员卡时间，并能在用户端、师傅端、Admin 端看到一致的剩余时间。
