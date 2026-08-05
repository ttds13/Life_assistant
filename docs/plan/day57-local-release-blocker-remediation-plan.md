# Day57 本地版本上线阻塞修复与发布准入计划

## 1. 背景与审计结论

2026-08-05 已完成一次本地代码与云端运行环境的只读对比审计，结论如下：

- 云端当前运行镜像停在 Day54，共包含 `26` 个 Prisma 迁移，数据库迁移状态正常。
- 本地包含 Day55 积分与拉新功能，共有 `27` 个 Prisma 迁移，但 Day55 尚未部署到云端。
- 云端生产支付配置完整，微信支付商户号、证书序列号、API v3 密钥、商户私钥与平台公钥均已配置；该项不再作为本地发布阻塞。
- 本地 Day55 的部分退款积分冲正存在确定性错误：当本次退款按比例计算为 `0` 分时，会回退为冲正全部剩余积分。
- 本地 Day56 已补充订单、预约和用户权益卡的 Admin 操作入口，但权限仍由静态角色包决定，通用订单接口可绕过预约专属权限。
- 用户权益卡缺少版本字段和请求级幂等，余额调整、延期、状态变化和撤销存在并发覆盖风险。
- 当前本地工作区存在大量未提交和未跟踪文件；Day48-Day56 迁移尚未形成可复现的发布提交。
- 云端服务器部署目录只保留到 Day42，比正在运行的 Day54 镜像更旧，禁止直接在该目录原地重新构建镜像。

Day57 的任务不是部署，而是把本地版本修复到“可以进入预发验证”的状态。

## 2. 目标

1. 修复消费者积分和邀请人积分在部分退款、分次退款、重复退款回调下的冲正一致性。
2. 保持积分经济模型不变：默认 `1` 元积 `10` 分，`200` 分兑换 `1` 元；后台只通过发布新规则版本调整倍率。
3. 将 Admin 权限从静态角色包升级为数据库驱动的细粒度 RBAC，并遵循最小权限原则。
4. 从服务端彻底隔离普通订单、服务预约和用户权益卡三类写操作，不能依赖前端隐藏按钮保证安全。
5. 为订单、预约、用户权益卡和管理员高风险写操作补齐乐观锁、行锁、请求幂等与审计。
6. 建立本地发布准入脚本、完整测试矩阵和不可变发布物规范。
7. 所有修复仅在本地完成，不修改云端代码、数据库、容器和生产配置。

## 3. 明确不做

- 不在 Day57 部署或迁移云服务器。
- 不重算历史积分，不给历史订单补发积分，不修改历史积分账本。
- 不改变默认积分价值和消费倍率的业务语义。
- 不实现多级分销、团队关系或 A-B-C 链式奖励。
- 不允许 Admin 直接修改已支付金额、支付时间、退款结果、历史核销流水或历史积分流水。
- 不使用 `0.0.0.0/0` 长期开放 SSH，也不把生产密钥写入代码、镜像或 Git。
- 不直接使用云端当前 `/www/wwwroot/life-assistant` 目录制作下一版镜像。

## 4. 总体修复顺序

```text
冻结发布范围并建立基线
-> 修复积分退款 P0
-> 新增幂等与版本数据模型
-> 落地数据库驱动 RBAC
-> 隔离订单/预约写路径
-> 加固用户权益卡资产操作
-> 补齐 Admin 页面权限与冲突处理
-> 完成全量回归和发布预检
-> 生成候选发布包
-> 再单独制定云端发布与回滚计划
```

任一阶段未通过对应测试门禁，不进入下一阶段。

## 5. 工作流 A：积分部分退款 P0 修复

### 5.1 当前错误

当前逻辑使用：

```ts
const proportional = floor(event.points * refundAmount / event.baseAmount)
const points = proportional || remaining
```

当 `proportional === 0` 时，`|| remaining` 会选择全部剩余积分。例如消费 `1` 元获得 `10` 分，退款 `0.01` 元时会错误冲正全部 `10` 分。固定 `200` 分的拉新奖励也会被同一逻辑全部冲正。

### 5.2 数据模型

新增积分冲正事实表，不能只依赖负数账本判断某个退款是否已经处理：

```text
PointRewardReversal
  id
  rewardEventId
  refundId
  refundAmount
  reversedPoints
  eventKey
  createdAt

unique(rewardEventId, refundId)
unique(eventKey)
```

扩展 `PointRewardEvent`：

```text
reversedBaseAmount Decimal(10, 2) default 0
```

设计原因：

- `reversedBaseAmount` 保存已经参与计算的累计退款金额，即使本次应冲正 `0` 分也必须累计。
- `PointRewardReversal` 记录每个“奖励事件 + 退款”的处理事实，保证 `0` 分冲正也具备请求幂等。
- 积分账本只在实际冲正积分大于 `0` 时写负数流水，冲正事实表始终写入。

### 5.3 累计冲正算法

每个退款成功事件对消费者奖励和邀请人奖励分别执行：

1. 在事务内锁定 `PointRewardEvent`。
2. 按 `(rewardEventId, refundId)` 查询冲正事实；已存在则直接返回第一次结果。
3. 计算 `nextReversedBaseAmount = min(baseAmount, reversedBaseAmount + refundAmount)`。
4. 若累计退款已达到订单计分基数，`targetReversedPoints = event.points`。
5. 否则 `targetReversedPoints = floor(event.points * nextReversedBaseAmount / baseAmount)`。
6. 本次冲正积分为 `delta = max(0, targetReversedPoints - event.reversedPoints)`。
7. 创建 `PointRewardReversal`，即使 `delta = 0` 也必须创建。
8. `delta > 0` 时写唯一负数积分账本。
9. 原子更新累计退款金额、累计冲正积分和奖励事件状态。

金额运算全程使用 `Prisma.Decimal`，只在最终积分取整时执行明确的向下取整。禁止使用 JavaScript 浮点数累计金额。

### 5.4 必测边界

| 用例 | 预期 |
| --- | --- |
| 1 元订单得 10 分，退款 0.01 元 | 记录退款事实，冲正 0 分，不得全扣 |
| 随后再退款 0.09 元 | 累计退款 0.10 元，累计应冲正 1 分，本次冲正 1 分 |
| 最后退款 0.90 元 | 累计全额退款，补齐剩余 9 分 |
| 100 元订单分三次退款 33.33、33.33、33.34 | 三次累计恰好冲正全部积分，不多扣、不少扣 |
| 相同退款回调重复执行 | 冲正事实、负数账本和余额均只变化一次 |
| 邀请人固定奖励 200 分发生 1% 退款 | 只按累计比例冲正，不得一次扣完 200 分 |
| 退款金额累计超过计分基数 | 最多冲正原奖励积分，不产生额外负积分 |

## 6. 工作流 B：数据库驱动的细粒度 RBAC

### 6.1 权限来源

复用现有 `Role` 模型，但不再让 `admin-permissions.ts` 的静态数组成为唯一授权来源。

建议模型演进：

```text
Role
  id
  name
  displayName
  permissions Json
  status
  isSystem
  version

AdminUser
  roleId
  role                  # 兼容字段，迁移期同步写入
```

迁移步骤：

1. 创建或补齐 `super_admin`、`operator`、`finance` 系统角色记录。
2. 将现有管理员按 `AdminUser.role` 回填 `roleId`。
3. `AdminAuthGuard` 优先读取数据库角色及权限；迁移期允许旧字段回退一个版本。
4. 未知角色、已停用角色、权限 JSON 非法时必须拒绝访问，禁止回退为 `super_admin`。
5. 角色或权限修改后下一次请求立即生效，无需重新签发 JWT。

权限码仍由代码注册，数据库角色只能选择已注册权限码，防止拼写错误产生幽灵权限。

### 6.2 默认角色最小权限

| 能力 | super_admin | operator | finance | customer_service |
| --- | --- | --- | --- | --- |
| 用户业务查询 | 允许 | 允许 | 财务相关只读 | 脱敏只读 |
| 创建普通订单/预约 | 允许 | 允许 | 禁止 | 禁止 |
| 改期、改地址、派单 | 允许 | 允许 | 禁止 | 可选只提交申请 |
| 修改订单金额 | 允许但受状态约束 | 默认禁止 | 复核权限 | 禁止 |
| 取消未支付预约 | 允许 | 允许 | 禁止 | 禁止 |
| 取消已支付并发起退款 | 允许 | 仅有独立权限时允许 | 审核退款 | 禁止 |
| 免费发卡 | 允许 | 独立授权 | 禁止 | 禁止 |
| 权益余额调整 | 允许 | 默认禁止 | 独立复核权限 | 禁止 |
| 付费权益卡撤销 | 仅走退款流程 | 禁止 | 退款审核 | 禁止 |
| 积分规则发布 | 允许 | 默认禁止 | 可配置复核/发布 | 禁止 |
| 草稿物理删除 | 允许且受事实校验 | 默认禁止 | 禁止 | 禁止 |

### 6.3 Admin 角色管理

新增：

- 权限码只读列表接口。
- 角色列表、创建、编辑、停用接口。
- 管理员分配角色接口。
- 角色修改与管理员换角色审计日志。
- Admin 角色管理页面，权限使用分组复选框展示。

禁止：

- 删除正在被管理员使用的角色。
- 停用当前唯一可用的超级管理员角色。
- 普通管理员给自己增加权限或分配更高角色。
- 非超级管理员编辑系统角色。

## 7. 工作流 C：订单与预约权限边界

### 7.1 通用接口收口

`PUT /admin/orders/:id` 只允许修改安全的通用非履约字段，例如后台备注。它不得修改：

```text
status
paidAmount / paidAt
completedAt / cancelledAt
appointmentStartTime / appointmentEndTime
staffId
退款、积分、权益核销相关字段
```

遇到 `service_booking` 时，预约时间、地址、派单和取消必须走预约专属接口。通用取消和删除服务也必须按 `orderType` 拒绝预约订单，不能只依赖控制器权限装饰器。

### 7.2 专属动作

```text
POST   /admin/user-service-bookings/:id/reschedule
PUT    /admin/user-service-bookings/:id/address
POST   /admin/user-service-bookings/:id/assign
POST   /admin/user-service-bookings/:id/cancel
DELETE /admin/user-service-bookings/:id/draft
```

每个动作同时校验：

- 独立权限码。
- 订单类型。
- 当前状态和 `expectedVersion`。
- 营业时间、预约锁、人员冲突和地址快照。
- 支付、退款、积分、优惠券和权益冻结事实。
- 必填原因和幂等键。

### 7.3 删除保护

物理删除仅允许：

- `pending_payment`。
- 从未支付且没有支付成功流水。
- 没有退款、积分、优惠券核销、权益卡发放、权益冻结、派单或履约事实。
- 请求人具有 `delete-draft` 权限。
- `expectedVersion` 一致且原因完整。

其余记录只能取消、退款、撤销或写冲正流水。

## 8. 工作流 D：用户权益卡资产一致性

### 8.1 并发控制

为 `UserMemberCard` 增加：

```text
version Int default 0
```

所有调整、延期、暂停、恢复和撤销请求必须携带 `expectedVersion`。服务端在事务内：

1. `SELECT ... FOR UPDATE` 锁定权益卡。
2. 校验数据库版本与 `expectedVersion`。
3. 校验余额、冻结值、来源订单和核销事实。
4. 更新业务字段并递增 `version`。
5. 同事务写权益流水和 Admin 审计。

版本不一致返回 `409`，前端刷新详情后要求管理员重新确认，禁止静默覆盖。

### 8.2 状态接口收口

通用状态更新接口只允许：

```text
suspended
available
```

禁止通过通用状态接口写 `completed` 或 `disabled`。完成、撤销和退款必须由专用领域动作产生。

### 8.3 撤销规则

- 后台免费发放、待激活、无冻结、无核销的权益卡可由有权限管理员撤销。
- 付费购买的权益卡不能直接撤销，必须先走来源订单退款流程。
- 存在冻结预约时禁止撤销，必须先处理关联预约。
- 已部分核销的权益卡禁止物理删除，只能通过受控冲正或售后流程处理。
- 撤销后必须保留发放记录、撤销记录和审计日志。

## 9. 工作流 E：请求级幂等

新增管理员操作幂等表：

```text
AdminOperationRequest
  id
  adminId
  operation
  idempotencyKey
  requestHash
  status
  targetType
  targetId
  result Json
  createdAt
  completedAt

unique(adminId, operation, idempotencyKey)
```

首期覆盖：

- 后台创建订单/预约。
- 订单或预约取消。
- 免费发卡。
- 权益余额调整。
- 权益卡撤销。
- 积分人工调整和规则发布。

处理规则：

1. 同一管理员、操作和幂等键重复请求返回第一次结果。
2. 同一幂等键但请求体哈希不同返回 `409`。
3. 幂等记录与本地业务写入尽量处于同一事务。
4. 涉及微信退款等外部调用时，不长时间持有数据库事务；继续复用退款单号和渠道请求号的唯一约束。
5. 前端每次明确操作生成 UUID，不使用时间戳或订单 ID 直接充当幂等键。

## 10. Admin 前端修复

- 路由访问、菜单、按钮统一使用后端返回的权限码，不再仅判断 `SUPER_ADMIN/OPERATOR/FINANCE`。
- 操作按钮同时满足“有权限”和 `allowedActions` 业务状态才显示。
- 所有写弹窗携带 `expectedVersion`、`reason` 和 `idempotencyKey`。
- `409` 统一提示数据已变化，并刷新订单、预约或权益卡详情。
- 付费权益卡不展示直接完成/停用按钮，只展示来源订单和退款入口。
- 普通订单编辑器不显示预约时间、派单、支付结果等专属字段。
- 角色管理页面禁止当前管理员给自己提权。

## 11. 本地生产配置预检

新增只读 `release:preflight` 脚本，检查但不输出密钥值：

- `NODE_ENV=production`。
- `JWT_SECRET` 和 `REFRESH_TOKEN_PEPPER` 非空且达到最低长度。
- `PAYMENT_PROVIDER=wechat` 时检查微信支付全部配置和证书文件。
- `MAP_PROVIDER=tencent` 时必须存在 `TENCENT_MAP_KEY`。
- 提现功能启用时，生产环境禁止回退到 `mock`。
- `SEED_ON_START=false`、`MOCK_LOGIN_ENABLED=false`。
- CORS 不允许 `*`。
- OSS 凭据、Bucket 和签名 URL 配置完整。
- 数据库迁移目录连续且全部纳入版本控制。

建议增加显式功能开关：

```text
WITHDRAW_ENABLED
MAP_ENABLED
```

未正式开放的功能应明确关闭并返回业务不可用，不得在生产环境静默回退到 mock。

## 12. 迁移计划

新增一个 Day57 迁移，至少包含：

- `point_reward_reversals`。
- `point_reward_events.reversed_base_amount`。
- `user_member_cards.version`。
- `admin_operation_requests`。
- `roles.status/is_system/version`。
- `admin_users.role_id` 及角色回填。

迁移要求：

1. 在空数据库执行全部迁移成功。
2. 从当前本地 27 个迁移状态升级成功。
3. 从云端 Day54 的 26 个迁移结构副本升级成功。
4. 不重写历史订单、支付、积分、权益余额和账本金额。
5. 迁移失败可安全重试，不允许依赖手工修改表结构。
6. 为本地已有 Day55 测试数据执行只读审计，异常数据由审计脚本报告，不在迁移中猜测修复。

## 13. 测试矩阵

### 13.1 自动化测试

- 积分累计退款和重复回调单元/集成测试。
- 拉新固定积分、按 B 积分比例、按实付金额倍率三种策略退款测试。
- RBAC 全权限矩阵：未登录 `401`、无权限 `403`、有权限且状态允许 `200`。
- 未知角色、停用角色、非法权限数据必须拒绝，不能提升为超级管理员。
- 通用订单接口操作预约订单必须被拒绝。
- 两名管理员使用同一权益卡版本并发调整：一人成功，另一人 `409`。
- 相同幂等键并发创建订单/发卡/调余额：只产生一笔业务事实。
- 付费权益卡通过通用状态接口完成或停用：必须拒绝。
- 已支付、已发积分、已冻结权益订单草稿删除：必须拒绝。
- 审计日志包含管理员、权限、原因、前后值、请求 ID、幂等键和目标记录。

### 13.2 回归测试

必须通过：

```text
Prisma validate
Prisma migrate status
Server build
Server lint/test
Admin type-check/build
Miniapp type-check/WeChat build
Day48 地址与订单快照
Day49 订单/权益卡购买与预约双订单
Day53 权益卡商品版本
Day54 预约时间锁
Day55 积分/拉新/退款
Day56 Admin 用户业务 CRUD
Day57 RBAC/幂等/并发/退款累计
Docker production-like smoke
```

所有烟测脚本必须在 `finally` 清理测试数据，并在失败时恢复临时修改的规则配置。

### 13.3 人工验收

1. 使用超级管理员、运营、财务、客服四种角色逐页验证菜单和按钮。
2. 使用浏览器开发者工具直接调用被隐藏的接口，后端仍返回 `403`。
3. 两个浏览器同时编辑同一订单、预约和权益卡，验证 `409` 冲突处理。
4. 重复点击、刷新重试和模拟网络超时，不产生重复订单、发卡或余额调整。
5. 对消费者和邀请人执行小额、分次、全额退款，核对余额、冲正事实和账本。

## 14. 预计修改范围

| 位置 | 修改内容 |
| --- | --- |
| `server/prisma/schema.prisma` | 冲正事实、累计退款金额、权益卡版本、Admin 幂等、角色关系 |
| `server/prisma/migrations/<day57_...>/` | Day57 迁移与角色回填 |
| `server/src/points/*` | 累计退款算法、冲正幂等、审计与测试辅助 |
| `server/src/refunds/*` | 退款成功后统一调用新冲正服务 |
| `server/src/admin-auth/*` | 数据库角色、权限解析、失败关闭策略 |
| `server/src/orders/*` | 通用接口收口、预约类型隔离、版本与幂等 |
| `server/src/admin-business/*` | 权益卡状态、调整、撤销和角色管理接口 |
| `server/src/member-cards/*` | 权益卡行锁、版本、来源订单与退款约束 |
| `admin/src/api/life/*` | 新 DTO、版本、幂等键、角色管理 API |
| `admin/src/router/*` | 权限码级路由与菜单过滤 |
| `admin/src/views/life/*` | 角色管理及三类业务操作收口 |
| `server/scripts/*` | Day57 审计、烟测和发布预检 |
| `docs/test/*` | 测试报告和上线准入结论 |

## 15. 分阶段实施与工期

| 阶段 | 内容 | 预计工程量 | 完成门禁 |
| --- | --- | --- | --- |
| 0 | 冻结范围、整理工作区、建立基线 | 0.5 天 | 变更清单和迁移清单可复现 |
| 1 | 积分累计退款与冲正事实 | 1 天 | P0 测试矩阵全部通过 |
| 2 | Day57 数据模型、幂等基础设施 | 1 天 | 三种数据库起点迁移通过 |
| 3 | 数据库 RBAC 与 Admin 角色管理 | 1.5 天 | 权限矩阵和失败关闭通过 |
| 4 | 订单/预约边界与权益卡并发保护 | 1.5-2 天 | 越权、并发、资产测试通过 |
| 5 | Admin 页面、冲突和幂等交互 | 1 天 | 四角色人工验收通过 |
| 6 | 全量回归、Docker 预检、发布包 | 1-1.5 天 | 所有准入门禁通过 |

总计约 `7-8.5` 个工程日，具体取决于现有烟测修复量。不得为了压缩时间跳过迁移兼容、并发或权限绕过测试。

## 16. Git 与候选发布物

实施完成后按逻辑拆分提交：

```text
fix(points): make refund reversals cumulative and idempotent
feat(auth): load admin role permissions from database
fix(orders): isolate booking mutations from generic order APIs
fix(member-cards): add optimistic locking and controlled revocation
feat(admin): manage roles and handle idempotent write conflicts
test(release): add day57 audits, concurrency tests and preflight
```

候选发布物要求：

- 工作区无未提交、未跟踪的业务代码和迁移。
- 镜像使用 Git SHA 标签，禁止只使用 `latest` 作为唯一标识。
- 生成包含 Git SHA、镜像摘要、迁移列表、构建时间和测试报告的 manifest。
- 在本地 production-like Docker 环境从空库启动成功。
- 在生产结构副本上执行 `prisma migrate deploy` 成功。
- 发布包不包含 `.env`、证书私钥、数据库备份、上传文件或日志。

## 17. 回滚原则

- Day57 代码回滚时保留新增表和字段，不删除积分冲正事实、幂等记录和审计记录。
- 禁止通过数据库快照覆盖已经产生的新订单、退款、积分或权益卡资产。
- 新积分规则可停用，但已发积分只通过冲正账本处理。
- 新角色权限出现问题时可停用角色并回退到经过验证的系统角色配置，不直接删除角色关系。
- 候选发布验证失败时继续保持云端 Day54 镜像运行，不触碰生产数据库。

## 18. 上线准入标准

只有同时满足以下条件，Day57 才能标记为“可制定云端发布计划”：

1. 部分退款不会全额误扣消费者或邀请人积分，分次退款最终结果精确且幂等。
2. 未知 Admin 角色不会被提升为超级管理员，所有权限由数据库角色明确提供。
3. 普通订单权限无法操作预约专属字段和动作。
4. 运营角色默认不具备草稿硬删除、付费卡撤销、余额调整和积分规则发布权限。
5. 用户权益卡并发写入可检测冲突，余额、冻结值、流水和版本保持一致。
6. 创建、取消、发卡、撤销、余额调整和积分调整具备请求级持久化幂等。
7. 付费权益卡不能绕过退款路径直接完成、停用、撤销或删除。
8. Day48-Day57 所有迁移均已纳入 Git，空库、本地库和生产结构副本升级均通过。
9. Server、Admin、Miniapp、Prisma、全量烟测和 production-like Docker 验证全部通过。
10. 形成不可变候选镜像、发布 manifest、测试报告和独立回滚说明。

满足以上标准后，再单独制定云端备份、预检、迁移、灰度、监控与回滚执行计划；本计划本身不授权任何云端变更。
