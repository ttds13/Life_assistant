# Day48 全库订单地址强关联与可修改地址改造计划

更新时间：2026-07-14  
目标模块：数据库地址模型、订单创建与修改、用户地址簿、师傅订单详情、Admin 订单详情、地图选址  
核心目标：把地址从订单 JSON 附属字段升级为独立的订单履约实体，使每个上门服务订单都有唯一、可查询、可修改、可审计的订单地址；师傅和 Admin 始终查看对应订单的当前履约地址。  
隐私前置：微信公众平台的位置隐私设置已更新，不再阻塞实施；发布前仍需完成体验版权限复核。

执行状态（2026-07-14）：代码、自动化审计、临时数据库迁移预演、生产数据库迁移、后端/Admin 部署和三端构建已完成；微信 Android/iOS 真机验收尚未执行。

## 1. 最终设计结论

Day48 不采用“只给 `Order` 增加 `addressId` 外键”的局部方案。现有 `Order.addressSnapshot` 只作为一次性迁移数据源，迁移完成后直接从 Prisma 模型和数据库删除。

目标模型拆成三层：

```text
Address
用户地址簿中的常用地址，可修改、可删除、可设默认

OrderAddress
某个订单当前实际履约使用的地址，与 Order 一对一强关联

OrderAddressRevision
订单地址每次创建和修改后的不可变历史版本
```

完整链路：

```text
用户自动定位 / 地图选址 / 手动填写
-> 保存或选择 Address
-> 创建上门订单
-> 同一事务创建 Order + OrderAddress + OrderAddressRevision(v1)
-> 师傅订单详情读取该订单的 OrderAddress
-> Admin 订单详情读取同一个 OrderAddress
-> 用户或 Admin 明确修改本订单地址
-> 校验订单状态与版本
-> 更新 OrderAddress + 新增 Revision + 更新 Order.version + 写审计/通知
-> 师傅重新打开订单后看到新地址
```

业务边界：

1. `service_booking`、`consultation` 等上门订单必须且只能有一个 `OrderAddress`。
2. `member_card_purchase` 等非上门订单不创建 `OrderAddress`。
3. 师傅自己的常驻地址和工作地址不参与本次订单地址模型，也不能替代用户指定的订单地址。
4. 用户修改地址簿中的 `Address`，不会自动修改已经创建的订单。
5. 修改当前订单地址必须走专用订单地址接口，形成新版本和审计记录。
6. 师傅只能查看和导航，不能直接修改用户的订单地址。

## 2. 当前系统问题

### 2.1 当前已有能力

1. `Address` 已保存联系人、结构化地址、格式化地址、经纬度、坐标类型、POI 和地图 provider。
2. 用户创建订单时会验证 `addressId` 属于当前用户。
3. `Order.addressSnapshot` 会复制下单时的地址信息。
4. 订单详情后端已经能够从 JSON 快照返回结构化 `address`。
5. 师傅端已经显示 `addressText`，有坐标时可以调用 `uni.openLocation`。
6. Admin 订单详情目前显示一行 `addressText`。
7. 微信小程序已声明 `getLocation`、`chooseLocation` 和 `scope.userLocation`。

### 2.2 当前数据库缺口

| 问题 | 当前表现 | 后果 |
| --- | --- | --- |
| 订单地址只在 JSON 中 | `Order` 没有独立订单地址关系 | 无法可靠关联查询、索引和约束 |
| 地址簿和履约地址语义混合 | JSON 既像快照又承担订单地址 | 修改边界不清晰 |
| 订单地址不能版本化修改 | Admin 通用订单更新 DTO 不支持地址 | 地址改动只能绕过系统或改 JSON |
| 没有地址变更历史 | 无法确认谁在何时把地址 A 改为 B | 客诉与履约争议难追溯 |
| 三端契约不一致 | 用户详情有 `address`，Admin 类型未声明，师傅再映射为扁平字段 | 容易出现显示差异 |
| 地址簿更新缺少并发版本 | 后写请求可以覆盖先写请求 | 多端编辑可能丢失更新 |
| 地图字段不完整 | 地图选点后未统一逆解析 | 省市区、街道和 POI 可能缺失 |
| 存量数据质量未知 | 旧快照可能缺字段或引用已删除地址 | 直接加非空外键会迁移失败 |

### 2.3 当前实现不能只加外键的原因

只加 `Order.addressId -> Address.id` 会产生两个问题：

1. 用户修改 `Address` 后，如果订单详情联表读取当前地址，历史订单位置会被改变。
2. 如果订单仍只读 JSON 快照，新增外键又无法承担订单地址修改、历史版本和三端一致展示。

因此需要独立的 `OrderAddress`，把“地址簿地址”和“订单履约地址”彻底分开。

## 3. 目标数据库模型

### 3.1 Address：用户地址簿

保留现有 `addresses` 表，新增并发版本字段：

```prisma
model Address {
  // 现有字段保留
  version        Int               @default(1)
  revisions      AddressRevision[]
  sourcedOrders  OrderAddress[]    @relation("OrderAddressSource")
}
```

`Address` 的职责只包括：

1. 用户维护常用地址。
2. 创建新订单时作为地址来源。
3. 支持默认地址、软删除和结构化搜索。
4. 不承担历史订单的实时展示。

### 3.2 AddressRevision：地址簿修改历史

新增 `address_revisions`：

```prisma
model AddressRevision {
  id           BigInt   @id @default(autoincrement())
  addressId    BigInt   @map("address_id")
  version      Int
  snapshot     Json
  changeType   String   @map("change_type") @db.VarChar(32)
  operatorType String   @map("operator_type") @db.VarChar(16)
  operatorId   BigInt?  @map("operator_id")
  reason       String?  @db.VarChar(256)
  createdAt    DateTime @default(now()) @map("created_at")

  address Address @relation(fields: [addressId], references: [id], onDelete: Cascade)

  @@unique([addressId, version])
  @@index([operatorType, operatorId])
  @@map("address_revisions")
}
```

规则：

1. 地址创建时写入版本 1。
2. 每次编辑先校验 `expectedVersion`，成功后版本加 1。
3. 每个版本保存编辑后的完整地址快照。
4. 删除使用软删除，同时写入 `changeType=delete` 的版本记录。

### 3.3 OrderAddress：订单当前履约地址

新增 `order_addresses`，与订单一对一：

```prisma
model OrderAddress {
  id                   BigInt    @id @default(autoincrement())
  orderId              BigInt    @unique @map("order_id")
  sourceAddressId      BigInt?   @map("source_address_id")
  sourceAddressVersion Int?      @map("source_address_version")

  contactName          String    @map("contact_name") @db.VarChar(64)
  contactPhone         String    @map("contact_phone") @db.VarChar(20)
  country              String?   @db.VarChar(32)
  province             String?   @db.VarChar(32)
  city                 String?   @db.VarChar(32)
  district             String?   @db.VarChar(32)
  street               String?   @db.VarChar(64)
  addressTitle         String?   @map("address_title") @db.VarChar(128)
  detailAddress        String    @map("detail_address") @db.VarChar(256)
  houseNumber          String?   @map("house_number") @db.VarChar(64)
  formattedAddress     String    @map("formatted_address") @db.VarChar(512)

  latitude             Decimal?  @db.Decimal(10, 7)
  longitude            Decimal?  @db.Decimal(10, 7)
  coordinateType       String?   @map("coordinate_type") @db.VarChar(16)
  poiId                 String?   @map("poi_id") @db.VarChar(128)
  mapProvider           String?   @map("map_provider") @db.VarChar(16)
  source                String    @default("manual") @db.VarChar(16)

  version               Int       @default(1)
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")

  order         Order                  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  sourceAddress Address?               @relation("OrderAddressSource", fields: [sourceAddressId], references: [id], onDelete: SetNull)
  revisions     OrderAddressRevision[]

  @@index([sourceAddressId])
  @@index([city, district])
  @@index([latitude, longitude])
  @@map("order_addresses")
}
```

字段语义：

| 字段 | 含义 |
| --- | --- |
| `orderId` | 强关联的订单，一单一地址 |
| `sourceAddressId` | 创建或修改时选中的地址簿地址，可为空 |
| `sourceAddressVersion` | 当时使用的地址簿版本 |
| 地址文本与坐标字段 | 当前订单实际履约位置 |
| `version` | 订单地址并发控制和变更版本 |
| `source` | `gps/map/manual/admin/migration` |

订单履约展示只读取 `OrderAddress`，不再实时读取 `Address`，也不读取师傅地址。

### 3.4 OrderAddressRevision：订单地址变更历史

新增 `order_address_revisions`：

```prisma
model OrderAddressRevision {
  id             BigInt   @id @default(autoincrement())
  orderAddressId BigInt   @map("order_address_id")
  version        Int
  snapshot       Json
  changeType     String   @map("change_type") @db.VarChar(32)
  operatorType   String   @map("operator_type") @db.VarChar(16)
  operatorId     BigInt?  @map("operator_id")
  reason         String?  @db.VarChar(256)
  requestId      String?  @map("request_id") @db.VarChar(64)
  createdAt      DateTime @default(now()) @map("created_at")

  orderAddress OrderAddress @relation(fields: [orderAddressId], references: [id], onDelete: Cascade)

  @@unique([orderAddressId, version])
  @@index([operatorType, operatorId])
  @@map("order_address_revisions")
}
```

每条记录保存该版本修改后的完整订单地址。版本 1 表示订单创建地址，后续版本表示用户或 Admin 修改。

### 3.5 Order 模型调整

`Order` 增加一对一关系：

```prisma
model Order {
  // 现有字段保留
  orderAddress OrderAddress?
}
```

`Order.addressSnapshot` 处理方式：

1. 迁移脚本在维护窗口中读取该字段并创建 `OrderAddress` 与初始 revision。
2. 全量校验通过后，当次迁移直接删除 `orders.address_snapshot`。
3. 新代码只读写 `OrderAddress`，不双写、不回退、不继续解析订单 JSON 地址。

## 4. 数据库约束与不变量

### 4.1 必须满足

1. 每个上门服务订单必须存在且只能存在一个 `OrderAddress`。
2. 非上门订单可以没有 `OrderAddress`。
3. `OrderAddress.orderId` 唯一并外键关联 `Order.id`。
4. `sourceAddressId` 存在时必须指向有效地址记录；物理删除后自动置空，不影响订单履约地址。
5. 纬度和经度必须同时为空或同时有效。
6. 坐标存在时 `coordinateType` 必须存在，微信来源统一为 `gcj02`。
7. `formattedAddress`、联系人和电话对上门订单不能为空。
8. 同一地址实体的版本号只能递增，历史版本不可覆盖和删除。

### 4.2 数据库可执行约束

迁移 SQL 增加：

1. `order_addresses.order_id` 唯一索引和外键。
2. `order_addresses.source_address_id` 外键，`ON DELETE SET NULL`。
3. 两个 revision 表的 `(实体ID, version)` 唯一索引。
4. 经纬度成对的 `CHECK` 约束。
5. 经纬度范围 `CHECK` 约束。

“上门订单必须有 OrderAddress”属于跨表条件，不使用隐藏触发器实现。由创建订单事务强制保证，并通过发布前一致性脚本持续检查。

## 5. 地址修改规则

### 5.1 修改地址簿 Address

地址簿编辑接口增加 `expectedVersion`：

```text
PUT /api/user/addresses/:id
PUT /api/staff/addresses/:id
PUT /api/admin/addresses/:id
```

事务流程：

```text
查询 Address 并校验 owner / status / expectedVersion
-> 生成规范化地址和坐标
-> 更新 Address，version + 1
-> 写入 AddressRevision
-> 提交事务
```

规则：

1. 地址簿更新不级联修改任何 `OrderAddress`。
2. 基础位置字段改变后，旧坐标必须清除或通过地图重新确认。
3. 只修改门牌号可以保留原坐标。
4. 版本冲突返回明确错误，页面重新加载后由用户再次提交。

### 5.2 修改当前订单地址

新增专用接口，禁止继续塞入通用订单更新 DTO：

```text
PUT /api/user/orders/:id/address
PUT /api/admin/orders/:id/address
GET /api/admin/orders/:id/address-revisions
```

请求支持两种来源：

```json
{
  "sourceAddressId": 123,
  "expectedOrderVersion": 4,
  "expectedOrderAddressVersion": 1,
  "expectedSourceAddressVersion": 3,
  "reason": "用户更改上门地址"
}
```

或一次性订单地址：

```json
{
  "address": {
    "contactName": "张三",
    "contactPhone": "13800000000",
    "addressTitle": "阳光小区",
    "detailAddress": "黑龙江省双鸭山市……",
    "houseNumber": "3单元1201",
    "latitude": 46.0000000,
    "longitude": 131.0000000,
    "coordinateType": "gcj02",
    "mapProvider": "tencent",
    "source": "map"
  },
  "expectedOrderVersion": 4,
  "expectedOrderAddressVersion": 1,
  "reason": "客服确认新地址"
}
```

后端事务：

```text
锁定 Order 与 OrderAddress
-> 校验订单权限、状态、订单版本、地址版本
-> 解析来源地址或校验一次性地址
-> 更新 OrderAddress，version + 1
-> 写入 OrderAddressRevision
-> Order.version + 1
-> 写 OrderStatusLog 与 AdminAudit（Admin 操作）
-> 已分配师傅时创建地址变更通知
-> 提交事务
```

### 5.3 可修改状态

| 操作方 | 允许状态 | 规则 |
| --- | --- | --- |
| 用户 | `pending_payment`、`pending_dispatch` | 尚未进入师傅履约，可直接修改 |
| Admin | `pending_payment`、`pending_dispatch` | 原因必填，正常修改 |
| Admin | `dispatched`、`accepted`、`on_the_way` | 原因必填，修改后必须通知已分配师傅 |
| 任意角色 | `in_service` 及之后 | 默认禁止，确需修正走售后/审计流程 |

师傅发现地址错误时只能联系用户或 Admin，不能自己修改订单地址。

### 5.4 修改地址是否保存到地址簿

修改订单地址默认只影响当前订单。

Admin 页面可以提供独立复选项“同时保存为客户常用地址”，但必须明确调用地址簿创建/更新流程；不能用修改订单地址的副作用偷偷改变用户地址簿。

## 6. 统一订单地址接口契约

三端统一使用 `OrderAddressView`：

```ts
interface OrderAddressView {
  id: number
  orderId: number
  sourceAddressId?: number | null
  sourceAddressVersion?: number | null
  version: number
  contactName: string
  contactPhone: string
  provinceName?: string
  cityName?: string
  districtName?: string
  streetName?: string
  addressTitle?: string
  detailAddress: string
  houseNumber?: string
  formattedAddress: string
  latitude?: number | null
  longitude?: number | null
  coordinateType?: string
  poiId?: string
  mapProvider?: string
  source: string
  mapAvailable: boolean
  updatedAt: string
}
```

订单返回规则：

1. 订单列表返回 `addressText` 和 `orderAddressVersion`，用于快速扫描。
2. 用户、师傅和 Admin 订单详情统一返回 `orderAddress`。
3. 无地址的非上门订单返回 `orderAddress: null`。
4. 上门订单缺少 `OrderAddress` 时返回明确的数据异常标志，不得回退到旧 JSON、用户默认地址或师傅地址。

## 7. 三端页面改造

### 7.1 用户端选址与修改订单地址

涉及文件：

```text
miniapp/src/pages/address/edit.vue
miniapp/src/pages/address/list.vue
miniapp/src/pages/order/create.vue
miniapp/src/pages/order/detail.vue
miniapp/src/api/address.ts
miniapp/src/api/orders.ts
miniapp/src/api/types/address.ts
miniapp/src/api/types/orders.ts
miniapp/src/utils/location.ts
```

改造内容：

1. 新增地址时自动定位一次，地图选址为主操作，手动填写为兜底。
2. 地图选点后执行逆地址解析，补齐省市区、街道、POI 和 provider。
3. 下单时必须明确选中地址，再由后端创建 `OrderAddress`。
4. 用户订单详情增加“本单服务地址”，读取 `orderAddress`。
5. 允许状态内提供“修改本单地址”，提交订单版本和地址版本。
6. 地址修改成功后刷新订单详情，不修改历史 revision。

### 7.2 师傅端当前订单地址

涉及文件：

```text
miniapp/src/pages/staff/order-detail.vue
miniapp/src/api/staff.ts
miniapp/src/api/types/staff.ts
miniapp/src/pages/staff/notifications.vue
```

订单详情新增醒目的“用户指定服务位置”：

```text
位置名称：阳光小区 A 座
完整地址：黑龙江省双鸭山市……3单元1201
地址版本：v2（已更新）
[打开地图导航] [复制地址] [联系客户]
```

规则：

1. 只读取当前订单的 `orderAddress`。
2. 有有效坐标时显示“打开地图导航”，名称使用 `addressTitle`。
3. 无坐标时显示“复制地址”，标注“手动地址，暂无地图坐标”。
4. 地址版本发生变化时显示“地址已更新”，要求师傅重新确认。
5. 订单已分配后修改地址，师傅收到平台通知并可直达订单详情。
6. 师傅常驻/工作地址不出现在该区块。

### 7.3 Admin 订单地址

涉及文件：

```text
admin/src/api/life/types.ts
admin/src/api/life/index.ts
admin/src/views/life/orders/index.vue
admin/src/views/life/orders/detail.vue
可新增 admin/src/utils/mapLocation.ts
```

Admin 订单详情增加：

1. “订单服务地址”区块，展示完整结构化地址和地图状态。
2. “在地图中查看”“复制地址”“修改本单地址”操作。
3. 修改弹窗支持选择客户已有地址或录入一次性地址。
4. 修改原因必填，展示订单版本和地址版本。
5. “地址变更记录”时间线，显示版本、操作人、原因、变更前后摘要。
6. 已分配订单修改成功后显示“已通知师傅”。
7. Admin 列表保留地址摘要，不在表格中展开完整地图信息。

## 8. 后端模块改造

建议新增独立模块：

```text
server/src/order-addresses/order-addresses.module.ts
server/src/order-addresses/order-addresses.service.ts
server/src/order-addresses/order-addresses.repository.ts
server/src/order-addresses/order-address.presenter.ts
server/src/order-addresses/dto/update-order-address.dto.ts
server/src/order-addresses/dto/query-order-address-revisions.dto.ts
```

同步修改：

```text
server/prisma/schema.prisma
server/src/addresses/addresses.repository.ts
server/src/addresses/addresses.service.ts
server/src/addresses/dto/save-address.dto.ts
server/src/orders/orders.repository.ts
server/src/orders/orders.service.ts
server/src/orders/order-presenter.ts
server/src/orders/orders.controller.ts
server/src/orders/dto/create-order.dto.ts
server/src/orders/dto/admin-create-order.dto.ts
server/src/orders/dto/admin-update-order.dto.ts
server/src/notifications/notifications.service.ts
```

后端职责划分：

1. `AddressesService` 只管理地址簿和 `AddressRevision`。
2. `OrderAddressesService` 负责订单地址创建、修改、版本和历史。
3. `OrdersService` 在创建订单事务中调用订单地址能力。
4. `order-presenter` 不再直接解析 JSON，统一调用订单地址 presenter。
5. Admin 通用订单更新 DTO 移除地址责任，地址修改只走专用接口。
6. 订单仓储查询统一 include `orderAddress`，避免页面各自回查地址簿。

## 9. 存量数据迁移

不做双写兼容，采用受控维护窗口一次性切换。迁移期间暂停用户下单、Admin 创建订单和订单地址修改，读取页面进入维护状态。

### 阶段 A：迁移预演与备份

1. 在数据库副本执行完整 dry-run。
2. 统计上门订单数量、非上门订单数量和快照异常数量。
3. 导出 `orders.id/order_type/address_snapshot` 迁移备份。
4. 生成可恢复的数据库备份并验证恢复流程。
5. 未达到 100% 可迁移或明确异常清单前，不进入正式维护窗口。

### 阶段 B：进入维护窗口并扩展表结构

1. 暂停所有订单写入入口和定时任务。
2. `addresses` 增加 `version`。
3. 创建 `address_revisions`。
4. 创建 `order_addresses`。
5. 创建 `order_address_revisions`。

### 阶段 C：存量回填

新增脚本：

```text
server/scripts/day48-backfill-order-addresses.ts
```

回填规则：

1. 遍历上门服务订单。
2. 从 `addressSnapshot` 读取联系人、地址和坐标。
3. `addressSnapshot.addressId` 存在且能验证时写入 `sourceAddressId`。
4. 无法验证来源地址时 `sourceAddressId=null`，但仍从快照创建完整 `OrderAddress`。
5. 每条回填记录创建 `OrderAddressRevision(version=1, changeType=migration)`。
6. 所有现有地址写入 `AddressRevision(version=1, changeType=migration)`。
7. 缺联系人、详细地址或坐标异常的订单写入异常报告，不自动猜测用户默认地址。

### 阶段 D：全量校验

1. 每个上门订单必须恰好有一条 `OrderAddress`。
2. 非上门订单不得被错误创建履约地址。
3. 逐条比对联系人、完整地址、POI、经纬度和坐标类型。
4. 校验每条订单地址都有版本 1 revision。
5. 校验失败立即停止，不删除旧字段，并按备份恢复。

### 阶段 E：删除旧字段并部署新代码

1. 从 Prisma `Order` 模型删除 `addressSnapshot`。
2. 数据库执行 `ALTER TABLE orders DROP COLUMN address_snapshot`。
3. 部署只读写 `OrderAddress` 的后端代码。
4. 用户端、师傅端和 Admin 全部使用统一 `orderAddress` 契约。
5. 清除业务代码中的 JSON 地址解析、旧 presenter 和回退逻辑。

### 阶段 F：冒烟验证并恢复服务

1. 创建地图地址订单并检查 OrderAddress/revision。
2. 修改订单地址并检查版本、审计和师傅通知。
3. 分别打开用户、师傅和 Admin 订单详情核对地址。
4. 验证通过后恢复订单写入和定时任务。

## 10. 实施顺序

### 阶段一：数据库与领域层

1. 增加四类模型和约束。
2. 实现 Address 版本控制与 revision。
3. 实现 OrderAddress 创建、更新、历史查询。
4. 编写迁移和一致性脚本。

验收：迁移前审计可重复执行；正式回填由 Prisma migration ledger 保证只执行一次，执行后旧字段立即删除。

### 阶段二：订单创建与修改闭环

1. 用户下单事务创建 `OrderAddress`。
2. Admin 创建订单事务创建 `OrderAddress`。
3. 增加用户/Admin 修改订单地址接口。
4. 增加版本冲突、状态限制、审计和通知。

验收：地址创建和修改在事务内完整成功或完整回滚。

### 阶段三：师傅和 Admin 可见

1. 师傅订单详情显示当前订单地址和版本。
2. Admin 订单详情显示、地图查看、修改和历史记录。
3. 地址变更后通知已分配师傅。

验收：两端对同一订单看到同一 `OrderAddress.id/version` 和地址内容。

### 阶段四：地图选址与真机回归

1. 完成自动定位、地图选址和手动兜底。
2. 验证地址修改后的地图导航。
3. 完成 Android、iOS 体验版授权和导航测试。

验收：地图地址与手动地址都能完成下单、修改、查看和履约。

## 11. 测试计划

### 11.1 数据库与迁移

1. 上门订单只能创建一个 `OrderAddress`。
2. 删除订单级联清理订单地址及 revision。
3. 物理删除来源地址时 `sourceAddressId` 置空，订单地址保留。
4. 经纬度单边为空或超范围时数据库拒绝。
5. revision 相同版本重复写入时数据库拒绝。
6. 迁移前审计可重复执行；Day48 迁移由 Prisma migration ledger 防止重复执行，不直接重复运行已删除旧字段的一次性 SQL。
7. 所有上门存量订单都有 `OrderAddress` 或明确异常报告。

### 11.2 地址簿修改

1. 地址 A 从 v1 修改为 v2，产生两条 revision。
2. 使用旧 `expectedVersion` 修改时返回版本冲突。
3. 地址簿 A 修改后，引用其创建的历史订单地址保持不变。
4. 地址软删除后历史订单仍可查看和导航。

### 11.3 订单地址修改

1. 用户在 `pending_payment` 将本单地址 A 改为 B，订单地址变成 v2。
2. 用户在 `accepted` 尝试修改，后端拒绝。
3. Admin 在 `accepted` 将 A 改为 B，原因必填并通知师傅。
4. Admin 使用旧订单版本或旧地址版本提交，后端拒绝。
5. `in_service` 后普通接口禁止修改地址。
6. 修改失败时 OrderAddress、revision、Order.version 和通知均不产生半成品。
7. 修改本单地址不修改用户地址簿。

### 11.4 三端一致性

1. 用户订单详情、师傅订单详情、Admin 详情返回同一个 `OrderAddress.id/version`。
2. 师傅只看到当前订单地址，不读取自己的常驻地址。
3. Admin 修改地址后，师傅收到通知并看到新版本。
4. 用户地址簿改成 C 后，订单仍显示明确修改后的 B。
5. 无坐标手动地址只显示复制地址，不显示无效地图按钮。
6. 有 `gcj02` 坐标的地址在师傅端导航和 Admin 地图中定位一致。

### 11.5 构建与检查

```text
cd server && npm run build
cd server && npm run prisma:generate
cd miniapp && pnpm type-check
cd miniapp && pnpm build:mp
cd admin && pnpm type-check
cd admin && pnpm build
```

发布前执行：

```text
Day48 地址迁移 dry-run
Day48 上门订单地址覆盖率检查
Day48 新旧地址数据一致性检查
微信小程序体验版权限与地图导航测试
```

## 12. 验收标准

1. 上门服务订单与 `OrderAddress` 一对一强关联，不再依赖 JSON 承担主模型职责。
2. 用户地址簿、订单当前地址、订单地址历史三类数据职责清晰。
3. 创建订单时 Order、OrderAddress 和初始 revision 同一事务提交。
4. 用户与 Admin 可以在允许状态修改订单地址。
5. 每次订单地址修改都有版本、操作人、原因和不可变历史。
6. 版本冲突不会覆盖他人的地址修改。
7. 用户修改地址簿不会改变历史订单履约地址。
8. 师傅当前订单醒目显示用户指定地址、地址版本和导航入口。
9. Admin 可以查看、地图核对、修改本单地址并查看变更历史。
10. Admin 修改已分配订单地址后，师傅收到通知。
11. 师傅地址不参与用户订单地址展示或兜底。
12. 存量上门订单全部完成迁移或进入明确异常治理清单。
13. 旧 `orders.address_snapshot` 已从 Prisma 和数据库删除，业务代码不存在双写或回退路径。
14. 自动定位、地图选址和手动填写都能进入同一订单地址模型。

## 13. 风险与处理

| 风险 | 处理方式 |
| --- | --- |
| 一次性迁移期间订单写入产生遗漏 | 使用受控维护窗口暂停订单写入，回填校验后再恢复服务 |
| 地址簿修改污染历史订单 | OrderAddress 保存独立字段，不实时联表展示 Address |
| 并发修改互相覆盖 | Order.version + OrderAddress.version 双版本校验 |
| 已接单后地址变化导致师傅走错 | Admin 原因必填，事务后发送地址变更通知并展示版本标记 |
| 存量快照字段不完整 | 生成异常治理清单，不猜测默认地址 |
| revision 无限增长 | 地址变化频率低，保留完整历史；后续按合规策略归档，不删除审计数据 |
| 精确地址泄露 | 师傅仅按现有任务权限查看，Admin 按订单权限查看，日志不记录完整地址和坐标 |
| 地图坐标与文字不一致 | 修改基础位置时清除旧坐标或要求重新地图确认 |

## 14. 本次不做

1. 不改造师傅常驻/工作地址业务。
2. 不做师傅实时定位、轨迹采集和路线跟踪。
3. 不让师傅直接修改订单地址。
4. 不保留 `orders.address_snapshot` 兼容层、双写或回退代码。
5. 不改造派单半径、距离计价和服务范围算法。
6. 不切换地图 provider，继续稳定腾讯地图链路。

## 15. 最终交付物

1. `Address.version` 与 `AddressRevision`。
2. `OrderAddress` 与 `OrderAddressRevision`。
3. 数据库迁移、回填、dry-run、一致性检查脚本及 `orders.address_snapshot` 删除迁移。
4. 用户与 Admin 修改订单地址接口。
5. 用户端订单地址选择和修改入口。
6. 师傅端当前订单地址、版本提示和地图导航。
7. Admin 订单地址查看、地图核对、修改和历史记录。
8. 已分配订单地址变更通知。
9. 三端统一 `OrderAddressView` 类型与 presenter。
10. `docs/test/day48-order-address-system-test-report.md` 测试报告。

## 16. 执行状态

### 16.1 已完成

1. Prisma 已增加 `Address.version`、`AddressRevision`、`OrderAddress`、`OrderAddressRevision`，并删除 `Order.addressSnapshot`。
2. Day48 一次性迁移已实现存量回填、来源地址归属校验、旧字段删除、外键、唯一索引和地址/坐标 `CHECK` 约束。
3. 地址簿创建、修改、删除、默认地址切换均写入连续 revision；修改接口强制版本校验并使用行锁。
4. 用户下单和 Admin 创建订单均在同一事务创建 `OrderAddress` 与 v1 revision。
5. 用户与 Admin 修改本单地址、状态限制、双版本冲突、Admin 审计、师傅通知已完成。
6. 用户、师傅和 Admin 统一读取当前订单 `orderAddress`；师傅不读取自己的地址作为兜底。
7. 自动定位、地图选址、逆地理编码、文字修改清除旧坐标、无坐标手动兜底已完成。
8. 用户订单详情可在允许状态修改本单地址；师傅端可查看/导航；Admin 可查看地图、修改和查看历史。
9. 已新增迁移前/后只读审计、旧库测试夹具和 Day48 runtime smoke。
10. 临时 MySQL 8.4 的旧数据回填、完整 23 个 migration 部署、约束/级联、Day43 与 Day48 smoke、44 项迁移后审计全部通过。
11. 标准 Prisma Client 生成、后端构建、小程序类型检查/生产构建、Admin 类型检查/生产构建全部通过。
12. 生产环境已在停写窗口完成全库 SQL 与旧地址快照备份、Day48 迁移、迁移后 44 项审计、后端镜像与 Admin 静态产物部署；`/api/health` 和 `/admin/` 均返回 200。

### 16.2 发布后待执行

1. 在微信开发者工具、Android 和 iOS 体验版完成定位授权、地图选点、改址和导航验收。
2. 观察生产容器日志、订单地址审计和师傅通知投递，确认首个真实地址变更闭环。

详细验证记录见 `docs/test/day48-order-address-system-test-report.md`。
