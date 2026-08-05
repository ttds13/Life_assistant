# Day55 消费积分与拉新奖励闭环设计计划

日期：2026-07-25  
目标模块：积分账户、订单完成、邀请拉新、Admin 运营配置、小程序分享与新用户绑定  
目标：落地两种固定积分方式，并采用可注册、可版本化的规则框架，使后续新增积分策略不需要重写订单和账本主流程。

## 1. 背景与现状

甲方新增两类积分规则：

1. 用户按实际消费获得积分：实际消费 `100` 元，累积价值 `5` 元的积分；该倍率由 Admin 配置。
2. 用户 A 拉新用户 B：B 的实际消费订单完成并获得消费积分后，再向 A 发放拉新奖励积分；奖励策略也由 Admin 配置。

同时需完善两种拉新入口：

```text
邀请链接拉新
分享码拉新
```

当前项目已有基础，但不能直接复用为最终方案：

| 当前实现 | 问题 | Day55 调整 |
| --- | --- | --- |
| `UsersService` 固定 `POINTS_PER_YUAN = 10`，支付成功即发分 | 消费积分倍率和兑换倍率不能运营配置；服务尚未完成就已发分 | 改为规则引擎按订单完成事件结算 |
| `point_ledgers` 只有用户、订单、类型、积分和金额 | 无规则版本、拉新关系、奖励来源与幂等事件 | 保留账本，新增奖励事件和规则版本关联 |
| 退款仅扣回下单用户的消费积分 | 未覆盖邀请人获得的拉新奖励 | 退款成功时按奖励事件分别冲正 B 与 A |
| 用户表没有邀请关系 | 无法判断 A-B 绑定的来源、时间和有效性 | 新增邀请码、邀请链接、绑定关系和风控状态 |
| 订单状态机已有 `completed` | 服务订单的消费积分仍在支付时发放 | 最终以 `completed` 为消费与拉新结算触发点 |

本期不把“分享次数”当成奖励依据。A 分享链接或分享码只是归因入口；只有 B 形成有效拉新关系且完成符合条件的订单，A 才能获得奖励。

## 2. 业务口径

### 2.1 金额、积分数量与积分价值的定义

积分机制沿用现有“积分数量”口径，积分价值只作为兑换和对账展示，不反向改变已经发放的积分数量。后台分别配置“消费积分倍率”和“积分兑换倍率”：

```text
实际消费金额（baseAmount）
  = 订单实付 paidAmount
  = 原价 - 优惠券/优惠等折扣
  != 原价 originalAmount
  != 会员卡核销金额

发放积分数（points）
  = floor(实际消费金额 × 消费积分倍率)

积分奖励价值（rewardValue）
  = 发放积分数 ÷ 积分兑换倍率
```

首期消费规则的业务表达固定为：

```text
消费积分倍率 = 10 分 / 元
积分兑换倍率 = 200 分 / 元
实际消费 100.00 元 -> 发放 1000 分 -> 按当前兑换倍率价值 5.00 元
```

因此，`100` 元得到价值 `5` 元不是直接按金额发放 `500` 分，而是“消费 `1` 元积 `10` 分，`200` 分兑换 `1` 元”。Day55 首个发布版本默认保存：`earnPointsPerYuan=10`、`redemptionPointsPerYuan=200`。两项倍率都由 Admin 修改并形成规则版本；倍率调整只影响新订单的积分结算或后续兑换估值，不重算历史积分流水。

### 2.2 两条首期规则

固定使用两个稳定规则编码，首期不允许运营人员新增未知类型的规则：

| 规则编码 | 名称 | 受益人 | 触发时点 | 默认状态 |
| --- | --- | --- | --- | --- |
| `consumer_spend` | 消费积分 | 下单用户 B | 合格订单进入 `completed` | 启用 |
| `referral_first_consumption` | 拉新消费奖励 | 邀请人 A | B 的消费积分成功写账后 | 配置完成后启用 |

`consumer_spend` 的初始策略：

```text
消费积分倍率：10 分 / 元
积分兑换倍率：200 分 / 元
金额口径：订单 paidAmount
取整：积分数向下取整；积分价值按兑换倍率计算并按金额精度展示
默认合格订单：已完成的现金服务预约订单
```

`referral_first_consumption` 的初始策略不擅自写死奖励数额。Admin 必须在启用前配置其计算方式和金额，例如“每位 B 首单完成固定发 500 分”或“按 B 本次消费积分的 50% 发放”。首期支持以下结构化选项：

```text
固定积分数
按 B 本次消费积分的比例或倍数
按 B 实际消费金额计算后再乘奖励系数
```

并配置：首单/每单、最低实付金额、单个 B 奖励上限、单个 A 每日/月度上限、允许的订单类型和支付方式。按金额计算的拉新奖励先按该版本的消费积分倍率换算为积分，再应用奖励系数；最终仍以整数积分入账。默认建议为“B 首个合格服务订单完成后，A 获得一次奖励”，具体固定积分数、比例或倍数由运营发布规则时明确设置。

### 2.3 合格订单和结算顺序

首期合格订单必须同时满足：

1. 订单状态为 `completed`，服务订单以用户确认完成或自动确认完成的最终状态为准。
2. `paidAmount > 0`，以实际支付金额为计算基数。
3. 订单类型、支付方式和最低金额符合当时已发布的规则版本。
4. 订单未退款；发生退款后按第 8 节进行冲正。
5. B 在订单完成前已有生效的 A-B 邀请绑定关系。

一个服务订单完成时，在同一业务事务内按下列顺序处理：

```text
订单进入 completed
-> 创建/锁定消费积分奖励事件
-> 按事件快照给 B 写消费积分账本
-> 创建/锁定拉新奖励事件
-> 按事件快照给 A 写拉新奖励账本
-> 写订单状态日志、积分事件日志与管理员可审计记录
```

拉新奖励只有在 B 的消费积分成功生成后才可生成。任一步失败必须回滚整个结算事务，不允许出现“仅 A 得分、B 未得分”的状态。

会员卡购买订单是否属于“实际消费”由规则中的 `eligibleOrderTypes` 决定，首期默认不纳入，避免把购卡与服务履约混为同一激励。会员卡核销服务的 `paidAmount=0`，也不应产生本规则积分。

## 3. 拉新绑定策略

### 3.1 关系模型

邀请关系一经生效不可由用户端改绑。B 只能有一个有效邀请人，A 可以邀请多个 B；不支持多级分销，也不支持 A-B-C 的链式奖励。

```text
A 生成邀请码/邀请链接
       |
       +-- B 通过链接进入，登录后绑定
       |
       +-- B 在新用户引导中输入分享码，校验后绑定

referral_binding
  inviterUserId = A
  inviteeUserId = B（唯一）
  source = link | share_code
  status = active | held | invalid | revoked
```

绑定校验必须由服务端完成：

1. A、B 必须存在且均为可用用户，且 A 不等于 B。
2. B 只能绑定一次；已绑定、已完成首个合格订单、已产生拉新奖励的用户均不能改绑。
3. B 必须在配置的“新用户绑定窗口”内，且此前没有合格订单或成功支付记录。首期建议窗口为注册后 `7` 天，作为规则配置项发布。
4. 邀请码/令牌必须有效、未过期、未被管理员停用；邀请码只接受规范化后的大写字母和数字。
5. 禁止自邀、循环关系和已知同身份重复关系；若风控命中则创建 `held` 关系，不自动发奖。
6. 绑定成功后记录来源、链接实例、邀请码、绑定时间、客户端最小必要上下文和规则快照；不依赖前端传入的邀请人 ID。

管理员如需纠正错误关系，只能在 B 首个合格订单前执行“作废并重新绑定”受控操作，必须填写原因并写审计；已产生奖励后只能通过冲正账本处理，不能修改历史绑定记录。

### 3.2 邀请链接

A 在小程序“邀请得积分”页生成或获取自己的邀请链接。链接使用随机、不连续、不可猜测的 `inviteToken`，不暴露递增用户 ID：

```text
pages/referral/landing?token=<opaque-token>
```

处理流程：

```text
A 分享链接
-> B 打开小程序落地页
-> 前端只暂存 token，不立即声明绑定成功
-> B 微信登录/注册完成
-> 调用服务端 bind 接口
-> 服务端校验新用户资格、令牌和唯一绑定约束
-> 成功后创建 referral_binding，失败返回明确但不泄露 A 的隐私信息
```

应同时支持微信 `scene` 参数进入，落地页解析后仍只将原始 token 交给后端验证。链接可配置有效期，A 的稳定分享入口可以自动轮换为新的有效令牌；停用 A 账号或人工封禁某条邀请链接后，旧令牌立即失效。

### 3.3 分享码

每位有效用户 A 有一个稳定的分享码，例如 `LIFE-7K3M9Q`，并可由后台停用和重新生成。B 的输入入口只在以下场景出现：

```text
首次登录后的新用户引导
个人中心的“填写邀请人”入口（仍在绑定窗口且未消费时）
```

输入分享码后调用同一条绑定服务，不能由小程序在本地换算、保存或直接写用户关系。链接与分享码若同时存在，以 B 明确提交的分享码为准；一旦绑定成功，另一个来源不可覆盖。

### 3.4 首期反作弊边界

首期使用可审计、可实现的风控边界，不采集未经授权的设备指纹：

```text
单一 invitee 唯一绑定
绑定窗口与首单前限制
同 openid/手机号/用户 ID 不可自邀
邀请码与令牌高熵、可停用、可过期
邀请人每日/月度奖励上限
最低实付金额、首单次数上限、订单类型限制
异常关系先 held，运营审核后才可发奖
所有发放和冲正使用唯一事件键，重复回调不重复发分
```

同设备、同地址、同支付工具等更强的风控需要额外的合规设计与数据来源，不在 Day55 擅自采集；数据库和事件模型预留 `riskReason`、`riskLevel`、`reviewedBy`、`reviewedAt` 字段。

## 4. 可扩展规则架构

### 4.1 设计原则

首期只提供两个规则，但不能把 `if (消费)`、`if (拉新)` 分散写入支付、订单、退款和 Admin 页面。统一采用：

```text
触发事件 -> 规则注册表 -> 已发布规则版本 -> 奖励事件 -> 不可变积分账本
```

新增规则时，开发人员只需要：

1. 新增稳定 `ruleCode` 与触发事件处理器。
2. 定义该规则的结构化 Admin 表单、服务端 DTO 校验和计算适配器。
3. 发布新规则版本并补充测试。

运营人员不能编辑原始 JSON 或自行创建服务端未知规则类型。这样既能扩展，又不会把金额计算逻辑放入可随意修改的配置文本。

### 4.2 规则与版本表

建议新增以下模型：

| 表 | 核心字段 | 作用 |
| --- | --- | --- |
| `point_reward_rules` | `id`、`code unique`、`name`、`trigger`、`status`、`current_version_id` | 规则根实体；首期固定两行 |
| `point_reward_rule_versions` | `rule_id`、`version`、`calculation_type`、`qualification_config`、`calculation_config`、`earn_points_per_yuan`、`redemption_points_per_yuan`、`effective_at`、`published_by`、`snapshot` | 不可变已发布规则快照；分别保存消费积分倍率和兑换倍率 |
| `point_reward_events` | `event_key unique`、`order_id`、`rule_version_id`、`beneficiary_user_id`、`source_user_id`、`referral_binding_id`、`base_amount`、`reward_value`、`points`、`status` | 一次业务奖励的唯一事实与幂等边界 |
| `referral_invite_codes` | `user_id unique`、`code unique`、`status`、`rotated_at` | A 的稳定分享码 |
| `referral_invites` | `token unique`、`inviter_user_id`、`code_id`、`channel`、`expires_at`、`status` | 链接实例、来源归因和失效控制 |
| `referral_bindings` | `invitee_user_id unique`、`inviter_user_id`、`invite_id`、`code_id`、`source`、`status`、`risk_*`、`bound_at` | 唯一且可审计的 A-B 关系 |

`point_reward_rule_versions` 的 `snapshot` 只做完整审计，关键计算字段仍单列，便于筛选和验证。规则更新采用“编辑草稿 -> 校验 -> 发布新版本”，不得直接覆盖当前发布版本。

### 4.3 积分账本调整

保留 `point_ledgers` 作为用户资产账本，但增加：

```text
reward_event_id          对应 point_reward_events
rule_version_id          实际命中的规则版本
event_key                唯一幂等键
source_user_id           拉新奖励中的 B
referral_binding_id      A-B 绑定关系
reward_value             本次积分价值
metadata                 只读计算与冲正上下文
```

其中 `reward_value` 按事件命中的 `redemption_points_per_yuan` 计算；`points` 才是用户账户真正增加或扣减的整数积分。规则版本必须同时快照 `earn_points_per_yuan` 和 `redemption_points_per_yuan`，避免 Admin 后续调整兑换倍率后历史奖励价值被重新解释。

当前 `@@unique([orderId, type])` 不足以承载未来同订单的多规则奖励。迁移后以 `event_key` 唯一约束作为幂等边界，并保留可查询的 `order_id`、`type` 索引。建议账本类型：

```text
consumer_spend_earn
referral_first_consumption_earn
consumer_spend_refund_reverse
referral_first_consumption_refund_reverse
manual_adjust
```

账本只追加，不更新、不删除。退款、风控驳回或后台人工纠错必须生成负数冲正流水，并关联原 `reward_event_id`；绝不直接修改 A 或 B 的历史积分余额。

所有积分写入，包括既有管理员手工调整，也要经过统一 `PointsService`。为保证同一用户并发得分时 `balanceAfter` 正确，结算事务应先锁定该用户的账户行，再汇总并插入账本；不能继续在多个支付/订单入口各自 `aggregate + create`。

## 5. 订单、退款与幂等处理

### 5.1 订单完成事件

服务端将积分结算接入订单状态机的最终完成分支：

```text
USER_CONFIRM / AUTO_CONFIRM / AFTER_SALES_CLOSE（恢复完成且符合规则时）
-> OrderTransitionService
-> PointsService.handleOrderCompleted(tx, orderId)
```

`handleOrderCompleted` 读取订单完成时间对应的已发布规则版本，创建唯一奖励事件后发账。规则在订单完成后被 Admin 修改，不影响这笔订单；事件持有的 `ruleVersionId` 和计算快照是最终对账依据。

支付成功、后台确认线下收款只记录支付和推进订单状态，不能再直接调用 `ensureEarnedPointsForPaidOrder`。会员卡购买订单若未来纳入积分规则，也必须通过其正式 `completed` 事件进入同一引擎。

### 5.2 幂等键

奖励事件键建议按业务事实生成，而不是按请求 ID 生成：

```text
order:{orderId}:rule:{ruleCode}:beneficiary:{userId}:grant
order:{orderId}:rule:{ruleCode}:beneficiary:{userId}:refund:{refundId}:reverse
```

数据库唯一约束先于业务判断。支付通知重试、订单确认重复点击、任务重放或多实例并发时，已有事件直接返回既有结果，绝不再次写账。

### 5.3 退款与售后

退款成功后，由退款成功事务读取该订单的已发奖励事件：

1. 计算退款比例和应冲正奖励价值/积分，按原规则快照和原始取整逻辑计算。
2. 为 B 写 `consumer_spend_refund_reverse`。
3. 若该订单已给 A 发拉新奖励，则为 A 写 `referral_first_consumption_refund_reverse`。
4. 更新对应奖励事件为 `partially_reversed` 或 `reversed`，并记录退款单号。

首期只允许一笔订单一个成功全额退款；如果现有退款域支持多次部分退款，则奖励事件需累计已冲正金额和积分，并使用每笔退款的唯一冲正键，确保总冲正不超过原发放积分。A 已使用部分积分时，账户允许出现负余额或按既有积分冻结策略处理，该产品规则需在上线前与运营确认，不能静默少扣。

## 6. Admin 运营设计

### 6.1 菜单与权限

在 Admin “用户运营”下新增：

```text
积分规则
邀请拉新
```

权限建议：

```text
points:rule:list
points:rule:update
points:rule:publish
points:ledger:list
referral:list
referral:review
referral:code:manage
```

修改规则、停用规则、作废绑定、审核风险关系和人工积分调整均必须写管理员审计日志，记录操作人、前后值、规则版本、目标用户、原因、请求 ID 和时间。

### 6.2 积分规则页

规则页固定展示两个卡片/标签页，不使用自由新增表单：

| 规则 | 可配置项 |
| --- | --- |
| 消费积分 | 是否启用、消费积分倍率（默认 10 分/元）、积分兑换倍率（默认 200 分/元）、合格订单类型、支付方式、最低实付金额、取整方式、生效时间 |
| 拉新消费奖励 | 是否启用、首单/每单、计算方式、固定积分/比例/倍数、是否沿用消费积分倍率、B 最低实付金额、合格订单类型、单 B 上限、A 日/月上限、绑定窗口、风控审核开关、生效时间 |

表单必须提供只读试算：

```text
输入实际消费 100 元 -> B 获得 1000 分，按 200 分/元估值为 5 元
输入 B 首单实付 200 元 -> A 按当前策略获得整数积分及对应兑换价值
```

发布前展示变更摘要、影响范围和生效时间。规则更新只能生成新版本；历史事件、账本和已完成订单继续展示命中的旧版本。`生效时间` 不允许早于当前时间，已发布版本只能停用，不可编辑或删除。

### 6.3 邀请拉新页

页面包含三个视图：

```text
邀请关系：A、B、来源、绑定时间、状态、风险原因、首个合格订单
奖励记录：订单号、A/B、规则版本、实际金额、积分价值、积分数、发放/冲正状态
邀请码管理：用户、分享码、状态、生成/轮换时间、停用原因
```

筛选项至少包括用户 ID/手机号、邀请码、邀请来源、绑定状态、风险状态、订单号、规则版本和时间范围。用户信息按既有后台权限脱敏展示，列表不暴露完整 openid、令牌或未授权的个人信息。

## 7. 小程序体验与接口

### 7.1 用户体验

小程序增加“邀请得积分”入口，建议放在个人中心和积分页。A 可看到自己的分享码、复制分享码、分享链接/小程序卡片、累计有效邀请数和已获得奖励；B 只能看到自己已绑定邀请，不展示 A 的敏感信息。

新用户流程：

```text
链接进入：落地页暂存 token -> 登录 -> 服务端绑定 -> 提示绑定结果
分享码进入：首次登录引导/个人中心输入 -> 服务端绑定 -> 提示绑定结果
订单完成：B 获得消费积分 -> A 获得拉新积分 -> 双方积分流水可见
```

当链接无效、邀请码不存在、B 已绑定或超出新用户窗口时，前端只展示服务端返回的通用提示；不显示“某某用户的邀请码”或其他可枚举信息。小程序不展示未完成订单的预估拉新收益，以后台已结算事件为准。

### 7.2 建议接口

用户端：

```text
GET  /api/referrals/me/invitation
GET  /api/referrals/me/summary
GET  /api/referrals/me/rewards?page=&pageSize=
POST /api/referrals/bind
GET  /api/points/summary
GET  /api/points/records?page=&pageSize=
```

`POST /api/referrals/bind` 只接受其一：

```json
{ "source": "link", "inviteToken": "opaque-token" }
```

```json
{ "source": "share_code", "shareCode": "LIFE-7K3M9Q" }
```

Admin 端：

```text
GET  /api/admin/point-reward-rules
GET  /api/admin/point-reward-rules/:code
PUT  /api/admin/point-reward-rules/:code/draft
POST /api/admin/point-reward-rules/:code/publish
PUT  /api/admin/point-reward-rules/:code/status
GET  /api/admin/referral-bindings
PUT  /api/admin/referral-bindings/:id/review
GET  /api/admin/point-reward-events
GET  /api/admin/point-ledgers
```

所有用户端接口从当前登录用户推导 A/B 身份；不得接受 `inviterUserId`、`beneficiaryUserId` 或可修改积分数的请求字段。

## 8. 数据迁移与兼容

### 8.1 迁移前审计

先导出并校验：

```text
现有 point_ledgers 数量、按 type 和 order 的分布
存在旧 earn 流水但订单不符合历史可积分状态的数据
已付款未完成、已完成、退款中和已退款订单数量
现有手工积分调整及负积分余额
用户、订单、支付和退款 ID 的完整性
```

### 8.2 迁移原则

1. 历史 `earn`、`refund_deduct`、手工调整账本不可重算、不可删改，标记为 `legacy` 来源即可。
2. Day55 生效前已发过旧积分的订单，完成后不可再次获得新消费积分；以已有账本或迁移生成的奖励事件防重。
3. Day55 后新完成的合格订单才按新规则版本结算，不向历史订单补发拉新奖励。
4. 首期创建两个规则根记录和首个发布版本；消费规则发布为 `earnPointsPerYuan=10`、`redemptionPointsPerYuan=200`，拉新规则在运营完成具体积分策略配置前保持停用。
5. 迁移 `point_ledgers` 新字段时必须为历史行生成稳定 `eventKey` 或允许历史行为空并单独建立新事件键唯一约束；不能因历史数据重复而跳过约束验证。
6. 服务切换顺序为“数据库迁移 -> 规则和事件服务 -> 订单完成/退款接入 -> Admin -> 小程序”，支付成功入口最后移除旧发分调用，避免双写窗口。

### 8.3 回滚原则

规则停用只影响未发生的新订单完成事件，不回收已发积分。代码回滚时保留迁移后的账本、事件和规则版本；若需纠正错误配置，发布修正版本或用冲正事件处理，不能恢复数据库快照覆盖真实用户资产。

## 9. 预计修改范围

| 位置 | 主要修改 |
| --- | --- |
| `server/prisma/schema.prisma` | 新增规则、规则版本、奖励事件、邀请码、邀请链接、邀请绑定；扩展积分账本字段与索引 |
| `server/prisma/migrations/<day55_points_referral>/` | 建表、旧账本兼容回填、唯一约束与审计索引 |
| `server/src/points/` | 新建规则注册表、计算器、账户锁、账本、奖励事件与退款冲正服务 |
| `server/src/referrals/` | 新建邀请码、令牌、绑定、风控审核、用户与 Admin 接口 |
| `server/src/orders/` | 在最终 `completed` 事务触发 PointsService，移除支付成功直发消费积分 |
| `server/src/refunds/` | 退款成功时通过 PointsService 冲正消费者和邀请人奖励 |
| `server/src/users/` | 用户积分汇总与流水 DTO 改为展示规则、奖励事件和来源 |
| `server/src/app.module.ts` | 注册 PointsModule 和 ReferralsModule |
| `server/src/admin-auth/admin-permissions.ts` | 增加积分规则与邀请关系权限 |
| `admin/src/api/life/*` | 增加规则、版本、奖励事件、邀请关系 DTO 与请求 |
| `admin/src/router/life-admin-routes.ts` | 增加“积分规则”“邀请拉新”路由 |
| `admin/src/views/life/points/*` | 新建规则发布、奖励记录和积分账本页面 |
| `admin/src/views/life/referrals/*` | 新建邀请关系、审核和邀请码管理页面 |
| `miniapp/src/pages/profile/*`、`miniapp/src/pages/points/*` | 增加积分/邀请入口与流水展示 |
| `miniapp/src/pages/referral/*` | 新增邀请落地、绑定、邀请中心与分享逻辑 |
| `miniapp/src/api/*` | 新增积分与邀请 API、类型和邀请 token 暂存逻辑 |

## 10. 实施步骤

1. 与运营确认消费积分倍率（默认 10 分/元）、积分兑换倍率（默认 200 分/元）、拉新奖励默认积分策略、拉新绑定窗口、是否纳入会员卡购买和部分退款余额策略；将结果写入首个规则版本。
2. 编写迁移前积分与订单审计脚本，冻结历史账本口径。
3. 新增 Prisma 模型、迁移、规则版本与奖励事件的唯一约束，回填历史兼容信息。
4. 建立 `PointsModule`：规则注册、金额计算、账户并发锁、奖励事件、账本和冲正服务。
5. 建立 `ReferralsModule`：邀请码、邀请令牌、链接/分享码绑定、资格校验、风控状态与审核。
6. 将服务订单最终完成、自动确认、售后恢复完成和退款成功接入统一积分服务；删除支付成功/线下收款确认处的直接发分。
7. 实现 Admin 规则草稿/发布、邀请关系和奖励事件页面，接入权限及审计日志。
8. 实现小程序邀请中心、链接落地、`scene` 解析、分享码输入与积分流水来源展示。
9. 执行数据库、服务端、Admin、小程序和并发/重复回调全链路测试，再进行灰度发布。

## 11. 测试矩阵与验收标准

### 11.1 积分规则

| 用例 | 预期 |
| --- | --- |
| B 完成实付 100 元合格订单 | B 获得 1000 分；按 200 分兑换 1 元估值为 5 元，账本与规则版本完整 |
| Admin 将消费积分倍率改为 12 分/元后发布 | 新完成订单按 12 分/元计算，历史 10 分/元订单不变化 |
| Admin 将兑换倍率改为 250 分/元后发布 | 新的价值估值按 250 分/元计算，历史账本积分数量不变化 |
| 订单支付成功但未完成 | 不发消费积分、不发拉新积分 |
| 用户重复确认完成/消息重试 | 每条规则只生成一条奖励事件和一条正向账本 |
| 会员卡核销订单 | 默认不发；规则明确启用后才发 |
| 订单全额退款 | B 与 A 的相应积分均生成冲正账本 |
| 规则停用 | 停用后的新完成订单不发分，旧账本不受影响 |

### 11.2 邀请与风控

| 用例 | 预期 |
| --- | --- |
| B 通过 A 链接首次登录 | B 绑定 A，来源为 `link` |
| B 在窗口内输入有效分享码 | B 绑定 A，来源为 `share_code` |
| B 已绑定后再输入其他分享码 | 服务端拒绝且关系不变 |
| A 尝试绑定自己 | 服务端拒绝 |
| B 已有合格订单后输入分享码 | 服务端拒绝 |
| B 首个合格订单完成 | B 先有消费积分，随后 A 按已发布策略获得一次拉新奖励 |
| B 第二个订单完成且规则为首单 | A 不再因该 B 获得奖励 |
| 命中日/月上限或风险审核 | 奖励事件为 `held/skipped`，不产生可用积分 |

### 11.3 交付验收

1. Admin 可查看并发布两种固定积分规则，消费规则默认明确展示 `1 元积 10 分、200 分兑换 1 元、100 元积 1000 分并价值 5 元`，没有任何硬编码倍率散落在支付或页面代码中。
2. B 的实际消费积分仅在合格订单完成后结算；A 的奖励严格晚于 B 的消费积分账本成功生成。
3. 邀请链接和分享码均可完成 A-B 绑定，且同一 B 不能改绑或多绑。
4. 规则变更、订单重试、支付回调重放、订单重复确认和退款不会造成重复发分或漏冲正。
5. Admin 可按 A、B、订单、规则版本和状态追溯每一笔奖励及其冲正原因。
6. 历史积分账本不被重算；Day55 上线不对历史订单补发或重复发放积分。
7. Server build、Prisma validate/migration、Admin type-check/build、Miniapp type-check/微信构建、积分与拉新烟测、并发幂等测试全部通过。

## 12. 明确不做

1. 不做多级分销、团队层级、邀请排名或按分享次数奖励。
2. 不允许用户手工选择、替换或撤销邀请人。
3. 不做未完成订单的拉新预发奖励。
4. 不将支付成功等同于服务完成，也不把订单原价当作实际消费金额。
5. 不允许 Admin 编辑历史规则版本、历史奖励事件或积分账本金额。
6. 不在首期采集设备指纹、通讯录或未经授权的敏感反作弊数据。
7. 不把消费积分倍率和积分兑换倍率混成一个配置项，也不因兑换倍率调整而重算历史积分数量。

## 13. 实施记录（2026-07-25）

### 13.1 已完成

1. 新增积分规则、规则版本、奖励事件、邀请码、邀请链接与邀请绑定数据模型；`point_ledgers` 已扩展规则版本、来源用户、邀请绑定、事件键和奖励价值字段。
2. 首个消费规则已写入本地数据库：消费 `1` 元积 `10` 分、`200` 分兑换 `1` 元；拉新奖励规则默认停用，需由 Admin 配置固定积分、B 积分比例/倍数或实付金额倍率后发布。
3. 支付成功与线下确认收款入口不再直接发积分。服务订单在用户确认、系统自动确认或售后恢复至完成时，统一通过 `PointsService` 写 B 的消费积分，再写 A 的拉新积分。
4. 退款成功会按奖励事件冲正 B 的消费积分与 A 的拉新积分，账本只追加负数流水，不修改历史记录。
5. 新增 Admin 积分规则页、积分奖励记录、邀请拉新审核页；规则发布、启停与关系审核均写管理员审计日志。
6. 小程序新增邀请中心、链接落地、登录后邀请令牌绑定、分享码绑定、分享路径与奖励记录；积分页同步显示当前积分规则和新账本类型。

### 13.2 本地验证

```text
Prisma migration deploy                  passed
Prisma migration status                  up to date
Server build                             passed
Admin type-check / production build      passed
Miniapp type-check / WeChat build        passed
Day55 points/referral smoke              passed
Local health endpoint                    passed
Authenticated Admin point-rule API       passed
```

Day55 烟测已验证：邀请链接绑定、分享码绑定、B 完成实付 `100` 元订单获得 `1000` 分、A 获得配置的 `200` 分、重复结算幂等，以及退款对 B 和 A 的积分冲正。

### 13.3 部署范围

本次只执行了本地数据库迁移和本地服务验证，未连接、迁移或部署任何云服务器与云数据库。
