# Day53 Admin 会员卡商品管理与版本发布改造计划

更新时间：2026-07-15  
前置依赖：Day49 会员卡模板版本、分钟核销和用户权益卡快照；Day50 用户订单/用户权益卡透视；Day52 首页会员卡商品详情与购买链路。  
目标：把 Admin 中的“会员卡模板与版本”从“会员权益”迁移到“服务与商品”，重构为与“服务项目”同级的“会员卡商品”管理功能。Miniapp 首页、商品详情和购买确认页只读取这里已发布且上架的会员卡商品及其当前发布版本。

> Day53 不是简单移动侧边栏。当前 `MemberCard` 已经同时承担可售商品、权益草稿和版本来源，但 Admin 仍使用通用表单和 JSON 文本编辑规则，保存任意字段都会自动生成版本，版本接口又没有实际管理页面。Day53 要明确“会员卡商品是商品聚合根、商品草稿可编辑、发布版本不可变、用户权益卡是购买后资产”四个边界。

## 1. 统一业务命名

| 名称 | 业务含义 | Admin 位置 |
| --- | --- | --- |
| 服务项目 | 用户可直接购买并形成服务预约的商品 | 服务与商品 / 服务项目 |
| 会员卡商品 | 用户可购买的会员卡商品定义，包含营销内容、售价和当前草稿 | 服务与商品 / 会员卡商品 |
| 会员卡商品版本 | 每次正式发布形成的不可变售卖与权益快照 | 会员卡商品详情 / 版本记录 |
| 会员卡商品订单 | 用户购买会员卡商品产生的交易订单 | 用户中心 / 用户订单 |
| 用户权益卡 | 支付成功后发给用户的分钟权益资产 | 用户中心 / 用户权益卡 |
| 权益核销记录 | 用户权益卡冻结、核销、释放和人工调整流水 | 会员权益 / 权益核销记录 |

代码兼容期允许 Prisma 模型继续叫 `MemberCard`，但新增 Admin 页面、DTO、接口返回模型和页面文案统一使用 `MemberCardProduct` / “会员卡商品”。不再在用户可见页面中使用“模板”指代可售商品。

ID 语义保持不变：

```text
memberCardProductId / cardId = member_cards.id
publishedVersionId           = 当前正式发布的 member_card_plan_versions.id
planVersion                  = 已发布版本号
userMemberCardId             = user_member_cards.id
```

## 2. 当前问题

### 2.1 会员卡商品放错了业务分组

当前侧边栏为：

```text
服务与商品
├─ 服务分类
└─ 服务项目

会员权益
├─ 优惠券
├─ 用户券明细
├─ 视频号链接管理
├─ 会员卡模板与版本
└─ 权益核销记录
```

会员卡商品具有名称、售价、上下架状态、封面、详情、购买入口和购买订单，本质上与服务项目同属可售商品，不应继续混在权益资产与核销审计中。

### 2.2 当前 Admin 不是可用的商品编辑器

现有 `memberCards` 复用 `life/resource/index.vue`，适用服务和核销规则需要直接填写：

```text
applicableServices 逗号字符串
serviceRules JSON 对象
serviceRuleList JSON 数组
```

这会产生服务 ID 填错、JSON 格式错误、分钟规则互相矛盾、下架服务仍被引用等问题，也无法像“服务项目”一样管理封面、描述和展示顺序。

### 2.3 保存与发布没有边界

当前 `updateMemberCard()` 每保存一次都会：

```text
currentVersion + 1
-> 立即写 MemberCardPlanVersion
```

修改名称、价格或一个未完成的规则也会形成新版本。Admin 没有“保存草稿”和“发布新版本”的明确动作，Miniapp 也可能直接读到尚未配置完成的内容。

### 2.4 版本能力存在但不可见

服务端已经提供：

```text
GET /admin/member-cards/:id/versions
GET /admin/member-cards/:id/service-rules
PUT /admin/member-cards/:id/service-rules
```

Admin API 也已封装，但当前页面没有版本历史、规则对比或复制旧版本为草稿的入口。版本只能被创建，不能被运营人员理解和核对。

### 2.5 Miniapp 展示内容并非完全来自会员卡商品

Day52 为了补齐展示，会员卡封面和描述会从第一个适用服务回退取得。该方式只能作为兼容兜底，不能长期替代会员卡商品自己的封面、短描述、详情和购买须知。

## 3. 目标侧边栏

Day53 调整为：

```text
服务与商品
├─ 服务分类
├─ 服务项目
└─ 会员卡商品

会员权益
├─ 优惠券
├─ 用户券明细
├─ 视频号链接管理
└─ 权益核销记录
```

路由调整：

| 旧路由 | 新路由 | 处理方式 |
| --- | --- | --- |
| `/marketing/member-cards` | `/services/member-card-products` | 旧路由保留一个版本并重定向 |
| `module=memberCards` | 独立会员卡商品页面 | 停止使用通用资源表单编辑复杂规则 |
| `/marketing/member-card-records` | 保持不变 | 这是权益账本和审计，不是商品管理 |

“用户中心 / 用户权益卡”保持不变。商品配置、用户持有资产和权益流水不得重新合并到一个页面。

## 4. 目标领域模型

### 4.1 会员卡商品作为聚合根

继续复用 `member_cards` 作为会员卡商品聚合根，避免再建一张 `member_card_products` 表造成双写和同步问题。它保存：

```text
商品身份与营销内容
当前草稿权益配置
当前发布版本指针
上架状态
展示顺序
```

`member_card_service_rules` 保存当前草稿的结构化服务核销规则；`member_card_plan_versions` 保存每次发布后不可变的完整快照。

### 4.2 草稿、发布版本和用户资产严格分离

```text
Admin 编辑会员卡商品草稿
-> 保存 member_cards + member_card_service_rules
-> 不影响 Miniapp 当前在售内容

Admin 点击发布
-> 校验草稿
-> 创建不可变 MemberCardPlanVersion
-> 更新 publishedVersionId/currentVersion
-> Miniapp 开始读取新版本

用户购买
-> 订单绑定精确 publishedVersionId/version
-> 支付后用户权益卡保存该版本快照
-> 后续新版本不改变历史订单和已发权益
```

### 4.3 上下架与版本发布分离

商品状态按以下规则解释：

| 状态 | 条件 | Miniapp 是否可见 |
| --- | --- | --- |
| 草稿 | `publishedVersionId = null` | 否 |
| 在售 | 有发布版本且 `status = 1` | 是 |
| 已下架 | 有发布版本且 `status = 0` | 否 |
| 待发布修改 | `draftRevision > publishedRevision` | 仍展示上一个发布版本 |

下架只阻止创建新的会员卡商品订单；已经创建且仍在支付有效期内的订单继续按订单快照完成支付。重新上架默认恢复当前发布版本，不自动发布未完成草稿。

## 5. Admin 会员卡商品页面

新增独立页面：

```text
admin/src/views/life/member-card-products/index.vue
```

页面结构与“服务项目”保持相同的操作认知：顶部筛选、商品表格、新增/编辑、上下架、封面展示和删除/归档约束；复杂权益规则使用专用编辑器，不再塞进通用 JSON 文本框。

### 5.1 列表筛选

支持：

```text
关键词：商品编码 / 商品名称
状态：草稿 / 在售 / 已下架
草稿状态：全部 / 有待发布修改 / 已与发布版本一致
适用服务
更新时间范围
```

### 5.2 列表字段

| 字段 | 说明 |
| --- | --- |
| 封面 | 会员卡商品自己的封面，不再依赖服务封面 |
| 商品编码 | 稳定唯一编码，推广链接和审计可使用 |
| 商品名称 | Miniapp 首页和详情页名称 |
| 售价 | 当前草稿售价；有未发布变更时显示提示 |
| 总权益 | 统一显示整数分钟 |
| 激活期限 | 购买后多少天内必须激活 |
| 有效期 | 激活后有效天数 |
| 适用服务 | 服务数量和摘要 |
| 当前版本 | `vN`，草稿未发布显示“未发布” |
| 草稿状态 | 已同步 / 有待发布修改 |
| 已售订单 | 会员卡商品订单数量 |
| 用户权益卡 | 已发放卡数量 |
| 状态 | 草稿 / 在售 / 已下架 |
| 更新时间 | 草稿最后更新时间 |

行操作：

```text
编辑商品
预览
发布新版本
版本记录
上架 / 下架
查看购买订单
```

已产生购买订单或用户权益卡的商品禁止物理删除，只允许下架。未发布、未售出的草稿允许删除，并写管理员审计。

## 6. 商品编辑器

编辑页或右侧抽屉按五个区域组织，不使用嵌套卡片：

### 6.1 基础信息

```text
商品编码             必填、唯一、发布后不可修改
商品名称             必填
短描述               首页商品卡使用，限制长度
商品详情             会员卡详情页使用
商品封面             独立上传，复用现有 OSS 图片管理
购买须知             购买确认页使用
展示排序             数字越小越靠前
```

### 6.2 售卖信息

```text
售价                 必填，非负金额
总权益分钟           必填，正整数
购买后激活期限       7 / 15 / 30 / 60 / 90 天或自定义
激活后有效期         30 / 90 / 180 / 365 / 730 天或自定义
```

新商品统一按分钟建模。`cardType`、`unitName`、`unitMinutes`、`totalTimes` 只作为旧数据兼容字段，不继续在新页面中暴露可产生混合单位的自由输入。

### 6.3 适用服务与核销规则

使用结构化表格，每行对应一项服务：

| 字段 | 控件 | 规则 |
| --- | --- | --- |
| 服务项目 | 可搜索选择器 | 只能选择未删除服务，同一服务不可重复 |
| 服务时长 | 只读 | 来自服务项目 `durationMinutes` |
| 核销方式 | 单选/分段控件 | 固定分钟、半次服务、自定义分钟 |
| 固定核销分钟 | 数字输入 | 固定分钟模式必填 |
| 半次/整次分钟 | 自动计算并可确认 | 不存 `0.5`，最终保存整数分钟档位 |
| 最小核销分钟 | 数字输入 | 自定义模式必填 |
| 可选分钟档位 | 数字标签编辑 | 必须是最小单位的整数倍且不超过总权益 |
| 状态 | 开关 | 停用规则不会进入新版本 |
| 备注 | 文本 | 仅 Admin 可见 |

禁止 Admin 继续直接编辑 `applicableServices`、`serviceRules` 和 `serviceRuleList` 原始 JSON。服务端保留旧字段只用于兼容读取和迁移审计。

### 6.4 商品预览

编辑器提供三种只读预览标签：

```text
首页商品卡
会员卡商品详情
购买确认摘要
```

预览与 Miniapp 使用同一个 DTO 字段映射，避免 Admin 看到的名称、封面、分钟和有效期与用户端不一致。预览只展示草稿，不代表已发布。

### 6.5 保存与发布操作

底部操作固定为：

```text
保存草稿
取消
校验并发布
```

保存草稿不改变 Miniapp；发布前弹出变更摘要，明确显示价格、总分钟、激活期限、有效期和各服务核销规则相对当前发布版本的变化。

## 7. 版本发布机制

### 7.1 明确发布事务

新增显式发布命令：

```text
POST /api/admin/member-card-products/:id/publish
```

服务端在单一事务中：

1. 对会员卡商品加行锁，防止并发发布重复版本号。
2. 校验商品基础信息、价格、分钟、期限和服务规则。
3. 计算 `nextVersion = currentVersion + 1`。
4. 把商品内容、售价、期限和结构化核销规则写入不可变版本快照。
5. 更新 `publishedVersionId`、`currentVersion`、`publishedRevision` 和 `publishedAt`。
6. 根据操作选择“仅发布”或“发布并上架”。
7. 写管理员审计日志和版本变更摘要。

普通 `PUT` 保存不再自动增加版本号，也不再自动创建 `MemberCardPlanVersion`。

### 7.2 发布校验

以下任一情况必须拒绝发布：

```text
商品编码或名称为空
封面、短描述或售价缺失
总权益分钟、激活期限、有效期不是正整数
没有任何有效适用服务
引用已删除或已停用服务
核销分钟 <= 0 或超过总权益
自定义档位不是最小单位的整数倍
半次规则无法从服务时长得到整数分钟
同一服务存在重复规则
草稿与当前发布版本完全一致
```

### 7.3 版本记录

版本抽屉展示：

```text
版本号
是否当前版本
发布人
发布时间
商品名称和售价
总分钟、激活期限、有效期
服务规则摘要
关联购买订单数
关联用户权益卡数
完整快照
与上一版本差异
```

历史版本禁止直接编辑或删除。需要恢复旧配置时使用“基于此版本创建草稿”，再次发布后形成新的版本号，不能把 `publishedVersionId` 直接回退到历史版本。

## 8. 数据库改造

### 8.1 `member_cards` 商品根字段

保留现有表并增加：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `code` | `varchar(64) unique` | 商品稳定编码 |
| `description` | `varchar(255)` | 首页短描述 |
| `detail` | `text` | 商品详情 |
| `cover_image` | `varchar(512)` | 商品封面永久 OSS 地址 |
| `purchase_notice` | `text` | 购买确认页须知 |
| `sort_order` | `int default 0` | Miniapp 展示顺序 |
| `published_version_id` | `bigint null` | 当前正式发布版本 |
| `draft_revision` | `int default 1` | 草稿内容修订号 |
| `published_revision` | `int default 0` | 当前发布对应修订号 |
| `published_at` | `datetime null` | 最近发布时间 |
| `deleted_at` | `datetime null` | 未售草稿软删除 |

现有 `current_version` 改为“最后发布版本号”，新建草稿初始为 `0`。现有 `status` 继续作为即时上下架开关，避免再引入一套互相冲突的商品状态字段。

### 8.2 `member_card_plan_versions` 不可变售卖快照

版本表补充可直接审计的关键字段：

| 字段 | 用途 |
| --- | --- |
| `product_code` | 发布时商品编码 |
| `product_name` | 发布时商品名称 |
| `description` | 发布时短描述 |
| `cover_image` | 发布时封面 |
| `price` | 发布时售价 |
| `purchase_notice` | 发布时购买须知 |
| `published_by` | 发布管理员 ID |
| `source_version_id` | 从历史版本复制草稿时的来源 |

`snapshot` 同时保存完整版本内容；结构化 `redemptionRules` 保持不可变。关键字段单列是为了列表、对账和订单历史查询不依赖临时解析 JSON。

### 8.3 继续保留的表

```text
member_card_service_rules   当前草稿规则
member_card_plan_versions   已发布不可变规则
member_card_purchase_orders 订单绑定的精确版本
user_member_cards           用户持有的已售版本快照
member_card_records         权益账本
```

不新增第二套会员卡商品表，不把用户权益卡字段复制回商品表。

## 9. 接口与读模型

### 9.1 Admin 商品管理接口

新接口统一使用商品语义：

```text
GET    /api/admin/member-card-products
POST   /api/admin/member-card-products
GET    /api/admin/member-card-products/:id
PUT    /api/admin/member-card-products/:id
DELETE /api/admin/member-card-products/:id
PUT    /api/admin/member-card-products/:id/status
POST   /api/admin/member-card-products/:id/publish
GET    /api/admin/member-card-products/:id/versions
GET    /api/admin/member-card-products/:id/versions/:versionId
POST   /api/admin/member-card-products/:id/versions/:versionId/copy-to-draft
```

`GET /api/admin/services` 继续作为适用服务选择器数据源，不在会员卡页面维护第二份服务名称、时长或封面。

旧 `/api/admin/member-cards` 接口保留一个发布周期并转调新服务，完成 Admin 页面和权限迁移后删除写接口兼容。

### 9.2 Miniapp 商品接口

继续保持：

```text
GET /api/member-cards/shop
GET /api/member-cards/shop/:id
```

但返回规则改为：

1. 只查询 `status=1`、未删除且存在 `publishedVersionId` 的商品。
2. 名称、短描述、详情、封面、售价、总分钟、期限和核销规则全部来自当前发布版本。
3. 商品 ID 仍返回 `member_cards.id`，同时返回 `publishedVersionId` 和 `currentVersion`。
4. 按 `sortOrder, price, id` 稳定排序。
5. 服务封面和服务描述只作为旧数据缺少商品内容时的临时兜底。

建议 DTO：

```text
MemberCardProductPublicDto
├─ id / code / name
├─ description / detail / coverImageDisplayUrl / purchaseNotice
├─ price / totalMinutes
├─ activationDeadlineDays / validityDays
├─ currentVersion / publishedVersionId
└─ serviceRuleList[]
   ├─ serviceId / serviceCode / serviceName
   ├─ serviceDurationMinutes
   ├─ consumeMode / consumeMinutes / minConsumeMinutes
   └─ allowedMinutes
```

购买确认仍必须在创建订单前重新读取当前发布版本。服务端创建订单时以 `publishedVersionId` 为最终权威，不接受前端提交价格、分钟或版本号。

### 9.3 历史数据展示

用户权益卡和历史订单的名称、分钟、期限和规则优先读取自身 `planSnapshot`，不能继续读取当前 `member_cards.name` 或当前发布版本，否则商品改名会污染历史资产和订单展示。

## 10. 权限与审计

新增或细分权限：

```text
member-card-product:list
member-card-product:create
member-card-product:update
member-card-product:publish
member-card-product:status-update
member-card-product:version-list
member-card-product:delete
```

兼容期把现有 `member-card:list/create/update` 映射到对应新权限，并为超级管理员和现有会员卡运营角色补齐权限，避免菜单迁移后页面不可见。

审计动作至少包含：

```text
member-card-product:create
member-card-product:draft-update
member-card-product:publish
member-card-product:on-sale
member-card-product:off-shelf
member-card-product:copy-version
member-card-product:delete-draft
```

发布审计必须记录前后版本号和关键字段差异；不得只记录商品名称。

## 11. 数据迁移与兼容

### 11.1 迁移前审计

统计并导出：

```text
所有 member_cards 及当前状态
每张商品的 currentVersion 和版本记录数量
缺失当前版本的在售商品
结构化服务规则为空但 legacy JSON 不为空的商品
引用删除/下架服务的规则
版本号重复或快照不完整的数据
商品订单、用户权益卡和版本关联数量
```

### 11.2 字段回填

1. `code` 使用稳定规则生成，如 `MC-000001`，回填后建立唯一索引。
2. `description/detail/purchaseNotice` 初始为空，标记为待运营补充，不从脏 JSON 自动生成营销文案。
3. `coverImage` 可临时回填第一项有效服务封面，但在 Admin 显示“使用兼容封面”提示。
4. `publishedVersionId` 指向 `currentVersion` 对应版本；在售商品缺失版本时先根据当前结构化规则补建一次兼容版本。
5. 已有版本补充关键列；无法补齐的历史版本保留原 `snapshot`，读取时走兼容适配器。
6. 现有在售商品保持上架，避免迁移后首页突然清空；但内容不完整的商品进入 Admin 风险筛选。

### 11.3 迁移后审计

必须满足：

```text
在售商品全部存在 publishedVersionId
publishedVersionId 与 currentVersion 一致
发布版本规则全部引用有效服务
会员卡商品订单全部能解析对应版本
用户权益卡全部能解析自身 planSnapshot
Miniapp 商品数等于 Admin 在售且已发布商品数
```

## 12. 预计修改文件

### 12.1 Admin

| 文件 | 修改内容 |
| --- | --- |
| `admin/src/router/life-admin-routes.ts` | 把会员卡商品移到“服务与商品”，添加旧路由重定向 |
| `admin/src/views/life/member-card-products/index.vue` | 新增商品列表、筛选和操作 |
| `admin/src/views/life/member-card-products/editor.vue` | 新增分区商品编辑器 |
| `admin/src/views/life/member-card-products/rule-editor.vue` | 结构化服务与分钟核销规则 |
| `admin/src/views/life/member-card-products/version-drawer.vue` | 版本记录、快照和差异 |
| `admin/src/api/life/index.ts` | 新增会员卡商品草稿、发布、版本接口 |
| `admin/src/api/life/types.ts` | 新增商品、规则、版本和发布 DTO |

### 12.2 Server

| 文件 | 修改内容 |
| --- | --- |
| `server/prisma/schema.prisma` | 增加商品内容、发布指针、草稿修订和版本审计字段 |
| `server/prisma/migrations/<day53_member_card_products>/` | 数据库迁移和索引 |
| `server/src/admin-business/admin-business.controller.ts` | 新商品管理和发布接口 |
| `server/src/admin-business/admin-business.service.ts` | 拆分保存草稿、发布、上下架和版本读取 |
| `server/src/member-cards/member-cards.service.ts` | Miniapp 只读当前发布版本 |
| `server/src/admin-auth/admin-permissions.ts` | 商品管理权限与兼容映射 |
| `server/src/storage/*` | 复用 OSS 永久地址和签名展示 URL |

### 12.3 Miniapp

| 文件 | 修改内容 |
| --- | --- |
| `miniapp/src/api/types/memberCards.ts` | 对齐公开会员卡商品 DTO |
| `miniapp/src/pages/home/index.vue` | 使用商品自身封面、短描述和排序 |
| `miniapp/src/pages/member-card/detail.vue` | 使用商品详情和购买须知 |
| `miniapp/src/pages/member-card/purchase.vue` | 展示当前发布版本并在提交前重新校验 |

## 13. 实施步骤

1. 固定“会员卡商品 / 商品版本 / 用户权益卡”命名和侧边栏归属。
2. 编写迁移前审计脚本，确认当前商品、版本、规则、订单和用户卡关联完整。
3. 扩展数据库商品字段和版本关键列，回填 `code`、发布版本指针及兼容封面。
4. 把服务端 `updateMemberCard` 拆成保存草稿、显式发布和上下架三个事务边界。
5. 新增会员卡商品 Admin API、版本详情、复制旧版本为草稿和权限审计。
6. 新建 Admin 专用会员卡商品页面，完成列表、商品编辑器、规则编辑器、预览和版本抽屉。
7. 移动侧边栏并保留旧路由重定向，移除通用资源表单中的 JSON 会员卡编辑入口。
8. 修改 Miniapp 商品读模型，只返回 Admin 当前发布且上架的版本。
9. 修改历史订单和用户权益卡展示，优先读取购买/发卡时快照。
10. 执行迁移前后审计、Server/Admin/Miniapp 构建和全链路回归，再部署后端、Admin 和小程序。

## 14. 测试矩阵

### 14.1 草稿与发布

| 用例 | 预期 |
| --- | --- |
| 新建商品并保存 | Admin 显示草稿，Miniapp 不可见 |
| 修改在售商品并保存草稿 | Miniapp 继续展示旧版本 |
| 发布新版本 | 版本号只增加一次，Miniapp 切换到新版本 |
| 两个管理员并发发布 | 只有一个事务成功生成该版本号 |
| 草稿没有变化时发布 | 服务端拒绝，避免空版本 |
| 下架商品 | Miniapp 列表和详情不可购买，历史订单不变 |
| 重新上架 | 恢复当前发布版本，不带出未发布草稿 |

### 14.2 商品内容

| 用例 | 预期 |
| --- | --- |
| 上传独立商品封面 | Admin 预览和 Miniapp 使用同一签名图片 |
| 修改短描述/详情/须知 | 发布后分别进入首页、详情和购买确认页 |
| 名称或描述很长 | Admin 和 Miniapp 均不溢出布局 |
| 调整排序 | Miniapp 按稳定顺序展示 |
| 未登录查看首页 | 可看到在售会员卡商品，点击后按 Day52 进入登录 |

### 14.3 核销规则

| 用例 | 预期 |
| --- | --- |
| 固定分钟 | 发布版本保存固定整数分钟 |
| 半次服务 | 根据服务时长生成整数分钟档位，不保存 `0.5` |
| 自定义分钟 | 档位均为最小分钟单位的整数倍 |
| 服务重复 | Admin 和服务端均阻止保存/发布 |
| 服务下架或删除 | 发布被阻止并明确指出问题服务 |
| 修改服务项目名称/封面 | 草稿选择器更新；已发布版本和历史订单快照不被重写 |

### 14.4 订单与用户权益

| 用例 | 预期 |
| --- | --- |
| 用户购买 v1 后发布 v2 | v1 订单和用户权益卡仍按 v1 规则 |
| 创建订单后商品下架 | 不允许新建订单，已创建订单按支付有效期处理 |
| 修改商品当前名称 | 历史订单和用户权益卡仍显示售出版本名称 |
| 退款或卡到期 | 继续沿用 Day49 状态机、账本和完成原因 |
| 查看版本关联数量 | 购买订单数和用户权益卡数可对账 |

## 15. 验收标准

1. Admin 侧边栏“服务与商品”下存在“会员卡商品”，与“服务项目”同级；“会员权益”不再出现“会员卡模板与版本”。
2. 会员卡商品具有独立封面、编码、短描述、详情、购买须知、价格、排序和上下架管理。
3. Admin 不需要填写会员卡规则 JSON；适用服务和核销分钟通过结构化控件完成。
4. 保存草稿不会改变 Miniapp，只有显式发布才生成新版本并影响新购买。
5. 已发布版本不可编辑、不可删除；恢复旧配置只能复制为草稿并发布为新版本。
6. Miniapp 首页、会员卡详情和购买确认页全部读取 Admin 当前发布且上架的会员卡商品版本。
7. 创建会员卡商品订单时，服务端绑定精确发布版本并保存价格与权益快照。
8. 商品后续改名、改价或改规则不会改变历史订单和已发用户权益卡。
9. 用户权益卡、权益核销记录和会员卡商品保持独立页面与独立职责。
10. 迁移前后审计、Server 构建、Admin 类型检查/构建、Miniapp 类型检查/微信构建及完整购卡回归全部通过。

## 16. 明确不做

1. 不新建第二套会员卡商品主表，不让“商品”和“模板”双写。
2. 不把用户权益卡移入“服务与商品”；它仍是用户购买后资产。
3. 不把权益核销记录移入商品列表；它仍是跨用户账本和审计工具。
4. 不允许 Miniapp 读取草稿、legacy JSON 或未发布版本。
5. 不允许普通编辑操作直接创建版本；版本只能由显式发布生成。
6. 不允许修改历史版本、历史订单快照或用户权益卡已售快照。
7. 不改变 Day49 的激活、到期、冻结、核销、释放、退款和完成原因状态机。
8. 不为会员卡商品购买生成师傅任务；只有使用用户权益卡预约服务后才形成服务任务。

## 17. 实施记录（2026-07-15）

### 17.1 已完成

1. Admin 侧边栏已统一为“服务与商品 / 会员卡商品”；旧 `/marketing/member-cards` 隐藏并重定向到新页面。
2. 旧通用 `memberCards` 资源配置已改为只读兼容查询，不再提供模板表单、JSON 规则编辑、新增或删除入口。
3. 已完成会员卡商品专用管理页：商品草稿、结构化分钟规则、预览、显式发布、上下架、版本记录和复制版本为草稿。
4. 服务端已完成商品草稿、发布版本和用户权益卡三层隔离；保存草稿不再自动生成版本，相同业务内容不能重复发布空版本。
5. Miniapp 商品列表、详情和购买订单只读取上架商品的 `publishedVersionId`，下单价格与权益快照来自精确发布版本。
6. Admin 用户权益卡列表、详情和核销流水优先使用售出时 `planSnapshot` 的名称、单位和规则，不跟随商品草稿变化。
7. Day53 迁移已补充 legacy `applicableServices` 到结构化规则的兼容回填，并把当前规则固化到当前发布版本；已排除删除服务和无法解析项。
8. MySQL 8.4 兼容处理已完成：统一 `JSON_TABLE` 字符串排序规则，并把同名外键的删除、重建拆成两条 DDL。

### 17.2 本地验证结果

本地数据库：`127.0.0.1:3307/life_assistant`，MySQL `8.4.10`。迁移前备份位于本地 MySQL 容器 `/tmp/life_assistant_day53_pre_20260715.sql`，Day53 迁移已成功执行。

```text
Server build                         passed
Admin type-check / production build passed
Miniapp type-check / WeChat build   passed
Prisma format / validate            passed
Day53 product audit                 passed, 0 issues
Day49 order/member-card audit       passed, 0 failed checks
Day50 user-commerce audit           passed, 0 failed checks
Admin authenticated API smoke       passed
Miniapp published list/detail smoke passed
```

本地数据结果：4 个会员卡商品均已绑定发布版本；2 个在售商品均拥有 1 条有效发布规则；现有 2 条会员卡购买订单和 2 张用户权益卡快照审计通过。

### 17.3 尚未执行

1. 本次未上传云服务器，也未执行云数据库迁移。
2. 云部署前仍需在目标库生成备份，执行 `pnpm prisma:migrate:deploy` 和 Day53/Day49/Day50 三组审计。
3. 云 Admin 发布后需用真实运营账号完成商品编辑、发布、上下架和版本复制验收；小程序需完成微信开发者工具及真机购卡检查。
