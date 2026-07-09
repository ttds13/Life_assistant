# Day42 会员卡服务订单关联治理与补全计划

更新时间：2026-07-09  
来源：Admin 端服务管理、订单管理、营销管理会员卡模块关系审计  
目标版本：`1.0.3` 后续迭代  
目标：把服务管理、订单管理、营销会员卡模板、用户会员卡资产之间的关系固定为可执行、可验证、可维护的闭环，消除 JSON 弱关联、字段语义混乱、扣减规则漂移带来的长期风险。

## 0. 执行记录

执行时间：2026-07-09  
执行批次：`DAY42_TEST_20260709111517`  
执行结论：通过。

已完成内容：

1. 新增 `member_card_service_rules` 强关联表。
2. 新增 `orders.member_card_rule_snapshot` 订单会员卡规则快照。
3. 会员卡适用性和扣减额度优先使用强关联规则，旧 JSON 作为兼容回退。
4. 会员卡订单创建时写入规则快照，完成订单时优先按快照扣减。
5. Admin 会员卡模板支持结构化服务规则录入、规则列表、规则审计。
6. Admin 订单详情补充 `userMemberCardId`、模板 ID、规则来源、规则快照和规则变化提示。
7. 新增 Day42 迁移检查、闭环 smoke、测试数据清理脚本。

本地验证结果：

```text
npx prisma validate                         passed
npx prisma generate                         passed
npx prisma migrate deploy                   passed
npm run build                               passed
npm run type-check                          passed
npx tsx scripts/day42-member-card-closed-loop-smoke.ts --run-id DAY42_TEST_20260709111517
                                             passed
npx tsx scripts/day42-clean-test-data.ts --run-id DAY42_TEST_20260709111517 --confirm
                                             after all counts = 0
npx tsx scripts/day42-clean-test-data.ts --run-id DAY42_TEST_20260709111517
                                             dry-run all counts = 0
```

Smoke 覆盖：

1. Admin 创建会员卡模板并写入结构化服务规则。
2. 用户购买会员卡并通过 mock 支付完成发放。
3. 用户使用用户会员卡预约服务，订单冻结 120 单位并写入规则快照。
4. Admin 将模板服务规则从 120 改为 60。
5. 原订单派单、师傅接单、上门、开始、完成、用户确认后仍按快照扣减 120。
6. 新订单按变更后的规则冻结 60。
7. 新订单取消后释放 60。
8. Admin 订单详情能看到 `userMemberCardId` 和会员卡规则快照。
9. 测试批次数据已完整清理。

## 1. 背景结论

当前项目只有一套会员卡业务链路，不是两套完全独立系统，但规则分散在三个位置：

| 模块 | 当前字段 | 当前作用 | 主要风险 |
| --- | --- | --- | --- |
| 服务管理 | `Service.cardType`、`Service.consumeUnit` | 定义服务是否支持会员卡，以及默认扣减额度 | 与会员卡模板中的特殊扣减规则可能产生认知冲突 |
| 营销管理会员卡模板 | `MemberCard.cardType`、`applicableServices`、`serviceRules` | 定义卡类型、适用服务、模板级扣减规则 | `applicableServices` 和 `serviceRules` 是 JSON，缺少服务外键 |
| 用户会员卡 | `UserMemberCard.cardId`、`remainingUnits`、`frozenUnits` | 用户实际持有的会员卡资产和余额 | 本身关系正确，但依赖模板 JSON 规则判断适用范围 |
| 订单管理 | `Order.memberCardId`、`memberCardConsumeUnits`、`serviceSnapshot` | 记录订单使用的用户会员卡和冻结额度 | `memberCardId` 实际是用户会员卡 ID，命名容易误解 |

Day42 要解决的核心不是简单删字段，而是把规则归属、强关联、快照和审计都补齐。

## 2. Day42 总目标

1. 明确服务管理与会员卡模板的职责边界。
2. 把会员卡模板适用服务和服务扣减规则从 JSON 弱关联升级为数据库强关联。
3. 统一订单中会员卡字段语义，避免 `memberCardId` 被误认为模板 ID。
4. 在订单创建时写入会员卡规则快照，保证预约到完成期间规则变更不会影响历史订单。
5. 补齐 Admin 端配置、展示、审计、异常提示和测试闭环。
6. 使用模拟订单跑通会员卡购买、发放、预约冻结、完成扣减、取消释放、退款撤销、财务统计可见性。
7. 测试结束后清理全部 Day42 测试数据，保持数据库干净。

## 3. 本次不做

1. 不推翻现有会员卡主流程，优先做兼容性改造。
2. 不删除历史 `MemberCard.applicableServices` 和 `serviceRules` 字段，先保留作为迁移兼容字段。
3. 不改手机注册、验证码、支付真实扣款逻辑。
4. 不改变优惠券和会员卡互斥规则，当前订单逻辑仍保持会员卡订单不能叠加优惠券。
5. 不把订单历史金额重新计算，历史订单只补展示和审计，不做破坏性回写。

## 4. 问题固定

| 编号 | 问题 | 当前表现 | Day42 处理目标 | 优先级 |
| --- | --- | --- | --- | --- |
| D42-CARD-01 | 会员卡模板适用服务弱关联 | `applicableServices` 可填服务 ID、code、名称 | 新增强关联表，模板通过 `serviceId` 绑定服务 | P0 |
| D42-CARD-02 | 服务扣减规则分散 | `Service.consumeUnit` 和 `MemberCard.serviceRules` 都能影响扣减 | 固定优先级并在 Admin 显示最终生效规则 | P0 |
| D42-CARD-03 | 订单会员卡字段语义混乱 | `Order.memberCardId` 实际存 `UserMemberCard.id` | API 和 Admin 展示统一为 `userMemberCardId` | P0 |
| D42-CARD-04 | 订单缺少会员卡规则快照 | 完成订单时仍可能读取当前服务和模板规则 | 下单冻结时写入 `memberCardRuleSnapshot` | P0 |
| D42-CARD-05 | 服务改名或改 code 可能破坏会员卡适用性 | JSON 里存了名称或 code | 适用关系只以 `serviceId` 为准 | P1 |
| D42-CARD-06 | Admin 操作入口分散 | 服务管理、订单管理、营销管理都出现会员卡字段 | 形成统一展示逻辑和跨模块跳转 | P1 |
| D42-CARD-07 | 缺少一致性审计 | 无法快速发现模板规则和服务规则冲突 | 新增会员卡规则审计接口和页面提示 | P1 |
| D42-CARD-08 | 测试数据难回收 | 模拟订单涉及用户、卡、订单、流水、支付、退款 | 新增 Day42 标记和清理脚本 | P1 |

## 5. 目标数据模型

### 5.1 新增会员卡服务规则表

新增 `MemberCardServiceRule`，用来替代 `MemberCard.applicableServices` 和 `MemberCard.serviceRules` 的核心职责。

```prisma
model MemberCardServiceRule {
  id           BigInt   @id @default(autoincrement())
  memberCardId BigInt   @map("member_card_id")
  serviceId    BigInt   @map("service_id")
  consumeUnits Int      @map("consume_units")
  status       Int      @default(1) @db.SmallInt
  remark       String?  @db.VarChar(256)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  memberCard MemberCard @relation(fields: [memberCardId], references: [id])
  service    Service    @relation(fields: [serviceId], references: [id])

  @@unique([memberCardId, serviceId])
  @@index([serviceId])
  @@index([memberCardId, status])
  @@map("member_card_service_rules")
}
```

字段规则：

1. `memberCardId` 关联会员卡模板。
2. `serviceId` 关联服务主数据。
3. `consumeUnits` 表示这张卡用于该服务时扣多少额度。
4. `status=1` 表示启用，`status=0` 表示停用。
5. 若某张卡没有任何启用规则，默认不限制服务，但仍必须满足卡类型与服务 `cardType` 一致。
6. 若某张卡配置了启用规则，则只允许使用这些服务。

### 5.2 扩展订单会员卡规则快照

建议在 `Order` 增加：

```prisma
memberCardRuleSnapshot Json? @map("member_card_rule_snapshot")
```

快照内容示例：

```json
{
  "userMemberCardId": 1001,
  "memberCardTemplateId": 2001,
  "memberCardName": "120分钟保洁卡",
  "cardType": "time",
  "serviceId": 3001,
  "serviceCode": "home_clean_2h",
  "serviceName": "日常保洁2小时",
  "ruleSource": "member_card_service_rule",
  "consumeUnits": 120,
  "serviceDefaultConsumeUnit": 120,
  "ruleId": 4001,
  "frozenUnits": 120,
  "createdAt": "2026-07-09T00:00:00.000Z"
}
```

快照规则：

1. 预约冻结时必须写入。
2. 完成扣减时优先使用快照中的 `consumeUnits` 和 `frozenUnits`。
3. 若支持半扣，最终扣减可以小于冻结额度，但不能大于冻结额度。
4. 模板或服务后续修改不影响历史订单。
5. Admin 订单详情必须展示快照、当前规则和差异提示。

### 5.3 字段命名兼容策略

数据库可暂时保留 `orders.member_card_id`，但代码和接口语义必须改清楚：

| 当前字段 | 实际含义 | Day42 展示/接口名称 |
| --- | --- | --- |
| `Order.memberCardId` | 用户持有的会员卡 ID | `userMemberCardId` |
| `Order.purchaseCardId` | 购买的会员卡模板 ID | `purchaseMemberCardTemplateId` |
| `Order.grantedUserMemberCardId` | 支付后发放的用户会员卡 ID | `grantedUserMemberCardId` |
| `UserMemberCard.cardId` | 模板 ID | `memberCardTemplateId` |

实现上可以先在 presenter 层增加别名，不立即做数据库字段重命名，避免大范围破坏迁移。

## 6. 规则优先级固定

Day42 后的扣减规则必须固定为：

1. 若订单已有 `memberCardRuleSnapshot.consumeUnits`，以订单快照为准。
2. 若没有订单快照，查询 `MemberCardServiceRule.consumeUnits`。
3. 若没有模板服务规则，使用 `Service.consumeUnit`。
4. 若服务没有默认扣减：
   - 时间卡使用 `Service.durationMinutes`。
   - 次卡使用 `MemberCard.minConsumeUnits`。
5. 所有扣减值必须大于 0，否则禁止使用该会员卡下单。

Admin 必须显示：

```text
最终扣减 = 会员卡模板服务规则 / 服务默认扣减 / 系统兜底规则
```

这样运营在配置服务和会员卡模板时可以直接看到实际生效值。

## 7. 后端改造计划

### 7.1 Prisma 与迁移

1. 新增 `MemberCardServiceRule` model。
2. `MemberCard` 增加 `serviceRulesV2` relation。
3. `Service` 增加 `memberCardRules` relation。
4. `Order` 增加 `memberCardRuleSnapshot`。
5. 生成迁移文件。
6. 编写兼容迁移脚本：
   - 读取现有 `MemberCard.applicableServices`。
   - 按服务 ID、code、名称匹配 `Service`。
   - 读取 `MemberCard.serviceRules`。
   - 生成 `member_card_service_rules`。
   - 无法匹配的服务写入迁移报告，不直接丢弃。

### 7.2 会员卡服务层

修改 `server/src/member-cards/member-cards.service.ts`：

1. `isCardApplicable` 优先读取 `MemberCardServiceRule`。
2. 如果新表没有配置，再兼容读取旧 JSON。
3. `calculateConsumeUnits` 优先读取强关联规则。
4. `freezeForOrder` 返回完整规则快照。
5. `consumeForCompletedOrder` 优先使用订单快照。
6. 增加规则审计方法：
   - 模板卡类型与服务卡类型不一致。
   - 服务已删除或下架但规则仍启用。
   - 扣减额度大于卡总额度。
   - 旧 JSON 与新规则表不一致。
   - 已有订单冻结额度与当前规则不一致。

### 7.3 订单服务层

修改 `server/src/orders/orders.service.ts`：

1. 创建会员卡订单时，写入 `memberCardRuleSnapshot`。
2. `memberCardId` 对外展示增加 `userMemberCardId`。
3. 订单详情返回：
   - 用户会员卡 ID。
   - 会员卡模板 ID。
   - 会员卡名称。
   - 冻结额度。
   - 实际扣减额度。
   - 规则来源。
   - 当前规则是否已变化。
4. 取消订单时仍按 `memberCardConsumeUnits` 释放冻结额度。
5. 完成订单时按快照扣减，保证订单闭环稳定。

### 7.4 Admin 业务接口

在 `server/src/admin-business/admin-business.service.ts` 补齐：

1. 会员卡模板详情返回 `serviceRuleList`。
2. 新增或编辑会员卡模板时支持服务规则数组。
3. 保留旧 `applicableServices/serviceRules` 入参兼容，但写入时同步到新表。
4. 新增会员卡规则审计接口：

```text
GET /api/admin/member-cards/:id/service-rules
PUT /api/admin/member-cards/:id/service-rules
GET /api/admin/member-cards/rule-audit
POST /api/admin/member-cards/rule-audit/fix-preview
```

5. 订单详情增加会员卡规则快照和差异提示。

## 8. Admin 前端改造计划

### 8.1 服务管理

服务管理继续保留：

1. `计卡类型`
2. `单次扣减额度`

新增展示：

1. 被哪些会员卡模板引用。
2. 当前服务默认扣减。
3. 若某会员卡模板有覆盖规则，显示模板覆盖扣减。
4. 服务下架或删除前提示影响的会员卡模板数量。

### 8.2 营销管理会员卡模板

会员卡模板编辑页改造：

1. `适用服务` 从 textarea 改为服务选择器。
2. 每个适用服务可填写 `consumeUnits`。
3. 显示服务的默认 `cardType/consumeUnit/durationMinutes`。
4. 卡类型与服务类型不一致时禁止保存。
5. 支持批量导入旧 JSON，但导入后展示为结构化服务规则。
6. 模板详情页显示：
   - 服务名称。
   - 服务编码。
   - 服务状态。
   - 服务默认扣减。
   - 模板覆盖扣减。
   - 生效扣减。

### 8.3 用户会员卡

用户会员卡详情页补齐：

1. 所属模板。
2. 可用服务列表。
3. 每个服务预计扣减额度。
4. 已冻结额度来源订单。
5. 会员卡流水跳转订单。

### 8.4 订单管理

订单详情页补齐：

1. `userMemberCardId`。
2. 会员卡模板 ID 和名称。
3. 下单时规则快照。
4. 当前服务规则。
5. 是否存在规则变化。
6. 冻结、释放、消费、撤销流水。
7. 财务统计中会员卡订单应标记为权益消耗订单，金额为 0，但要统计权益扣减。

## 9. 测试闭环计划

### 9.1 测试批次

所有 Day42 测试数据统一使用：

```text
DAY42_TEST_YYYYMMDDHHmmss
```

需要写入 remark、name、orderNo 关联字段或快照字段中，便于清理。

### 9.2 测试链路

| 链路 | 步骤 | 验收标准 |
| --- | --- | --- |
| 模板规则迁移 | 旧 JSON 会员卡模板迁移到新规则表 | 可生成规则表，无法匹配项有报告 |
| 会员卡购买发放 | 用户购买会员卡并支付成功 | 生成 `UserMemberCard`，订单有发放 ID |
| 会员卡预约冻结 | 用户用卡预约服务 | 订单写入 `userMemberCardId`、冻结额度、规则快照 |
| 订单取消释放 | 创建后取消会员卡订单 | `frozenUnits` 归还，产生 release 流水 |
| 师傅完成扣减 | 派单后完成服务 | 按订单快照扣减，产生 consume 流水 |
| 半扣场景 | 时间卡实际服务时长低于一半 | 实际扣减小于冻结额度，差额释放 |
| 规则变更后完成 | 下单后修改服务扣减或模板规则 | 历史订单按快照扣减，不受新规则影响 |
| 服务下架审计 | 服务下架但仍被会员卡规则引用 | 审计接口提示异常 |
| Admin 展示 | 查看模板、用户卡、订单详情 | 三端都能看到统一的规则来源和流水 |
| 财务统计 | 查询会员卡订单 | 现金实收为 0，权益消耗可统计 |

### 9.3 建议测试脚本

新增：

```text
server/scripts/day42-member-card-rule-migration-check.ts
server/scripts/day42-member-card-closed-loop-smoke.ts
server/scripts/day42-clean-test-data.ts
```

脚本能力：

1. 创建测试服务。
2. 创建测试会员卡模板。
3. 创建强关联服务规则。
4. 创建测试用户和测试地址。
5. 模拟购买会员卡。
6. 模拟支付成功并发放用户会员卡。
7. 模拟会员卡预约。
8. 模拟 Admin 派单。
9. 模拟师傅完成。
10. 模拟用户确认完成。
11. 校验订单、用户卡、会员卡流水、支付、财务统计。
12. 清理测试数据。

## 10. 数据清理计划

清理脚本必须覆盖：

1. Day42 测试订单。
2. Day42 测试支付记录。
3. Day42 测试退款记录。
4. Day42 测试用户。
5. Day42 测试地址。
6. Day42 测试服务和分类。
7. Day42 测试会员卡模板。
8. Day42 测试会员卡服务规则。
9. Day42 测试用户会员卡。
10. Day42 测试会员卡流水。
11. Day42 测试通知。
12. Day42 测试审计日志。
13. Day42 测试师傅收入和订单状态日志。

清理命令建议：

```bash
cd server
npx tsx scripts/day42-clean-test-data.ts --run-id DAY42_TEST_xxx --dry-run
npx tsx scripts/day42-clean-test-data.ts --run-id DAY42_TEST_xxx --confirm
npx tsx scripts/day42-clean-test-data.ts --run-id DAY42_TEST_xxx --dry-run
```

最终 dry-run 必须返回 0 条残留。

## 11. 执行顺序

### 第一步：模型和迁移

1. 修改 Prisma schema。
2. 生成迁移。
3. 本地执行迁移。
4. 编写旧 JSON 到新规则表的迁移脚本。
5. 输出迁移报告。

完成标准：

```text
member_card_service_rules 表存在
历史会员卡模板可迁移
无法匹配服务的旧 JSON 项可被报告
```

### 第二步：后端规则切换

1. 修改会员卡适用性判断。
2. 修改扣减额度计算。
3. 修改冻结订单逻辑。
4. 修改完成订单扣减逻辑。
5. 增加订单规则快照。
6. 保留旧 JSON 兼容读取。

完成标准：

```text
新规则表优先生效
旧 JSON 仍可兼容
订单快照可固定历史规则
```

### 第三步：Admin 接口补齐

1. 会员卡模板详情返回服务规则。
2. 会员卡模板保存时写入服务规则。
3. 订单详情返回规则快照和差异。
4. 新增规则审计接口。

完成标准：

```text
Admin 可以结构化查看和编辑会员卡适用服务
Admin 可以发现规则冲突
订单详情可以解释扣减来源
```

### 第四步：Admin 页面补齐

1. 服务管理增加被会员卡引用提示。
2. 会员卡模板表单改服务选择器。
3. 用户会员卡详情增加可用服务和预计扣减。
4. 订单详情增加规则快照、当前规则和流水。

完成标准：

```text
运营不需要手写 JSON
运营可以看到最终生效扣减
订单详情能解释每一次冻结和扣减
```

### 第五步：测试闭环

1. 执行 Day42 规则迁移检查。
2. 执行 Day42 会员卡完整闭环 smoke。
3. 修改规则后重复完成订单，确认订单按快照扣减。
4. 执行清理脚本。
5. 再跑 dry-run 确认 0 残留。

完成标准：

```text
会员卡购买、发放、预约、冻结、取消释放、完成扣减、半扣、规则变更后完成、Admin 展示全部通过
Day42 测试数据清理后无残留
```

## 12. 验收清单

| 验收项 | 标准 |
| --- | --- |
| 服务规则强关联 | 会员卡模板适用服务不再依赖手写 JSON |
| 扣减规则清晰 | Admin 能显示最终扣减来源 |
| 订单字段清晰 | 前端和接口使用 `userMemberCardId` 表达用户卡资产 |
| 历史订单稳定 | 订单完成时按下单快照扣减 |
| 异常可审计 | 服务下架、类型不一致、旧 JSON 无法匹配都有提示 |
| 流水完整 | freeze、release、consume、refund revoke 均可追踪 |
| 财务可解释 | 会员卡订单现金实收为 0，权益消耗可统计 |
| 测试可回收 | Day42 测试数据可一键清理且最终无残留 |

## 13. 最终闭环定义

Day42 完成后，会员卡相关闭环必须满足：

1. 服务管理定义服务是否支持会员卡和默认扣减。
2. 营销会员卡模板通过强关联选择适用服务和覆盖扣减。
3. 用户购买或 Admin 发放后生成用户会员卡资产。
4. 用户预约时选择自己的用户会员卡。
5. 后端用强关联规则判断适用性和扣减额度。
6. 订单创建时冻结额度并写入规则快照。
7. 订单取消时释放冻结额度。
8. 订单完成时按快照扣减用户会员卡。
9. Admin 订单详情可以看到模板、用户卡、规则、快照、流水。
10. 财务统计可以区分现金订单和会员卡权益消耗订单。
11. 模板或服务后续修改不会污染历史订单。
12. 测试数据可以完整清理。

## 14. 风险和回滚

| 风险 | 处理 |
| --- | --- |
| 历史 JSON 无法完全迁移 | 生成迁移报告，保留旧 JSON 兼容读取 |
| 前端表单改动影响运营录入 | 先支持服务选择器，同时保留旧 textarea 导入能力 |
| 订单字段重命名影响接口 | 先在 presenter 层加别名，不立即改数据库列名 |
| 规则切换后历史订单扣减异常 | 优先使用订单快照，没有快照的历史订单走旧逻辑 |
| 清理脚本误删正式数据 | 所有测试数据必须带 `DAY42_TEST_` 标记，清理前 dry-run |

## 15. 建议提交顺序

1. `feat(member-card): add service rule relation and order rule snapshot`
2. `feat(member-card): use normalized service rules for applicability and consume units`
3. `feat(admin): manage member card service rules with structured form`
4. `feat(order): expose user member card rule snapshot in admin detail`
5. `test(day42): add member card closed-loop smoke and cleanup scripts`
6. `docs(day42): record member card service order governance plan`
