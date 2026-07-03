# Day 12 地址域破坏式重构方案

更新日期：2026-05-30

## 1. 文档目标

本方案替代 `docs/plan/day12-address.md`。

新的决策是：

```txt
不再保留旧 user_addresses 表
不做旧用户地址迁移
直接删除 user_addresses
新增统一 addresses 表作为唯一地址数据源
同步修改后端所有引用 user_addresses / UserAddress 的 API 和业务逻辑
```

当前没有真实地址数据，因此可以接受破坏式重构。

目标是让地址能力从一开始就形成清晰、统一、可长期维护的结构：

```txt
用户地址
师傅地址
admin 地址管理
地图定位
订单地址快照
派单距离预留
```

全部使用同一套地址域模型。

## 2. 核心结论

Day 12 不再围绕 `user_addresses` 打补丁。

最终目标：

```txt
server/prisma/schema.prisma 删除 UserAddress model
users 表删除 addresses UserAddress[] relation
数据库迁移 drop user_addresses
新增 Address model -> addresses 表
AddressesModule 改为统一 owner 模型
用户端 /api/user/addresses 保持路径不变，但底层读写 addresses
师傅端新增 /api/staff/addresses
admin 新增 /api/admin/addresses
订单创建改为读取 addresses
前端用户地址页移除 mockDay4，接真实 API
```

## 3. 删除范围

### 3.1 数据库层删除

删除：

```txt
user_addresses 表
```

Prisma 删除：

```prisma
model UserAddress { ... }
```

`User` model 删除：

```prisma
addresses UserAddress[]
```

### 3.2 代码引用删除或替换

必须扫描并处理所有引用：

```txt
UserAddress
userAddress
user_addresses
addresses:
findUserAddresses
findUserAddress
createUserAddress
updateUserAddress
deleteUserAddress
```

重点文件：

```txt
server/src/addresses/*
server/src/orders/orders.service.ts
server/src/orders/orders.repository.ts
server/src/orders/order-presenter.ts
server/src/admin-business/admin-business.service.ts
server/src/admin-business/admin-business.controller.ts
server/scripts/contract-test.ts
server/scripts/db-verify.ts
server/scripts/seed-db.ts
miniapp/src/api/address.ts
miniapp/src/api/types/address.ts
miniapp/src/pages/address/list.vue
miniapp/src/pages/address/edit.vue
miniapp/src/pages/order/create.vue
admin/src/api/life/index.ts
admin/src/views/life/resource/index.vue
```

## 4. 新统一地址表

新增 Prisma model：

```prisma
model Address {
  id               BigInt    @id @default(autoincrement())
  uuid             String    @unique @default(uuid()) @db.VarChar(36)

  ownerType        String    @map("owner_type") @db.VarChar(16)
  ownerId          BigInt    @map("owner_id")
  addressType      String    @default("service") @map("address_type") @db.VarChar(32)

  contactName      String    @map("contact_name") @db.VarChar(64)
  contactPhone     String    @map("contact_phone") @db.VarChar(20)

  country          String?   @db.VarChar(32)
  province         String?   @db.VarChar(32)
  city             String?   @db.VarChar(32)
  district         String?   @db.VarChar(32)
  street           String?   @db.VarChar(64)

  addressTitle     String?   @map("address_title") @db.VarChar(128)
  detailAddress    String    @map("detail_address") @db.VarChar(256)
  houseNumber      String?   @map("house_number") @db.VarChar(64)
  formattedAddress String    @map("formatted_address") @db.VarChar(512)

  latitude         Decimal?  @db.Decimal(10, 7)
  longitude        Decimal?  @db.Decimal(10, 7)
  coordinateType   String?   @map("coordinate_type") @db.VarChar(16)
  poiId            String?   @map("poi_id") @db.VarChar(128)
  mapProvider      String?   @map("map_provider") @db.VarChar(16)

  isDefault        Boolean   @default(false) @map("is_default")
  source           String    @default("manual") @db.VarChar(16)
  status           Int       @default(1) @db.SmallInt
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")
  deletedAt        DateTime? @map("deleted_at")

  @@index([ownerType, ownerId])
  @@index([ownerType, ownerId, addressType])
  @@index([city, district])
  @@index([latitude, longitude])
  @@map("addresses")
}
```

### 4.1 ownerType

```txt
user
staff
```

### 4.2 addressType

```txt
service    用户服务地址
home       师傅常驻地址
work       师傅工作地址
billing    后续发票/结算地址预留
```

### 4.3 source

```txt
manual      手动录入
map_pick    地图选点
location    当前定位
admin       管理员录入
```

### 4.4 coordinateType

第一版统一保存：

```txt
gcj02
```

原因：

```txt
微信小程序、腾讯地图、高德地图在国内业务场景通常使用 GCJ-02 坐标。
```

## 5. Prisma 迁移计划

迁移文件建议：

```txt
20260530_replace_user_addresses_with_addresses
```

迁移内容：

```sql
DROP TABLE IF EXISTS user_addresses;
CREATE TABLE addresses (...);
```

Prisma 操作：

```txt
1. 修改 server/prisma/schema.prisma
2. npx prisma migrate dev --name replace_user_addresses_with_addresses
3. npx prisma generate
4. npm run build
```

注意：

```txt
本次明确允许删除旧 user_addresses 数据。
不要写迁移脚本。
不要做旧数据复制。
```

## 6. 后端模块重构

### 6.1 AddressesModule 新职责

`server/src/addresses` 不再是“用户地址模块”，而是统一地址域模块。

建议结构：

```txt
server/src/addresses/
  addresses.module.ts
  user-addresses.controller.ts
  staff-addresses.controller.ts
  admin-addresses.controller.ts
  addresses.service.ts
  addresses.repository.ts
  address-presenter.ts
  dto/
    save-address.dto.ts
    query-addresses.dto.ts
    admin-save-address.dto.ts
  constants/
    address-owner-type.ts
    address-type.ts
    address-source.ts
```

### 6.2 Service 参数模型

统一 service 方法：

```ts
listAddresses(params: {
  ownerType: 'user' | 'staff'
  ownerId: number
  addressType?: string
})

getAddress(params: {
  ownerType: 'user' | 'staff'
  ownerId: number
  addressId: number
})

createAddress(params: {
  ownerType: 'user' | 'staff'
  ownerId: number
  dto: SaveAddressDto
  source?: 'manual' | 'map_pick' | 'location' | 'admin'
})

updateAddress(params: {
  ownerType: 'user' | 'staff'
  ownerId: number
  addressId: number
  dto: SaveAddressDto
})

deleteAddress(params: {
  ownerType: 'user' | 'staff'
  ownerId: number
  addressId: number
})
```

admin service 可以直接使用：

```ts
listAdminAddresses(query)
createAdminAddress(dto, context)
updateAdminAddress(id, dto, context)
deleteAdminAddress(id, context)
```

但底层仍走同一套 repository。

### 6.3 默认地址规则

默认地址唯一范围：

```txt
ownerType + ownerId + addressType
```

规则：

```txt
创建第一条地址时自动设为默认
创建/更新 isDefault=true 时取消同 owner/addressType 下其他默认地址
删除默认地址后，如果还有同类型地址，则将最新一条设为默认
软删除，不物理删除
```

### 6.4 formattedAddress 生成规则

后端统一生成：

```txt
province + city + district + street + addressTitle + detailAddress + houseNumber
```

要求：

```txt
去空
去重复
不让前端直接提交最终 formattedAddress 覆盖后端结果
```

前端可以提交 formattedAddress 作为参考，但后端以字段重新拼接为准。

## 7. 后端 API 设计

### 7.1 用户端 API

保留路径，减少小程序改动：

```txt
GET    /api/user/addresses
GET    /api/user/addresses/:id
POST   /api/user/addresses
PUT    /api/user/addresses/:id
DELETE /api/user/addresses/:id
```

底层：

```txt
ownerType=user
ownerId=request.user.userId
addressType=service
```

### 7.2 师傅端 API

新增：

```txt
GET    /api/staff/addresses
GET    /api/staff/addresses/:id
POST   /api/staff/addresses
PUT    /api/staff/addresses/:id
DELETE /api/staff/addresses/:id
```

底层：

```txt
ownerType=staff
ownerId=request.user.staffId 或开发环境 X-Staff-Id
addressType=home/work
```

### 7.3 Admin API

新增：

```txt
GET    /api/admin/addresses
GET    /api/admin/addresses/:id
POST   /api/admin/addresses
PUT    /api/admin/addresses/:id
DELETE /api/admin/addresses/:id
```

查询：

```txt
ownerType
ownerId
addressType
keyword
city
district
page
pageSize
```

body：

```txt
ownerType
ownerId
addressType
contactName
contactPhone
provinceName
cityName
districtName
streetName
addressTitle
detailAddress
houseNumber
latitude
longitude
coordinateType
poiId
mapProvider
isDefault
```

admin 写操作必须写：

```txt
audit_logs
```

动作：

```txt
address:create
address:update
address:delete
```

### 7.4 Admin 快捷别名

可选新增：

```txt
GET /api/admin/users/:id/addresses
GET /api/admin/staff/:id/addresses
```

但不要写第二套业务逻辑。

它们只是：

```txt
/api/admin/addresses?ownerType=user&ownerId=:id
/api/admin/addresses?ownerType=staff&ownerId=:id
```

## 8. DTO 设计

### 8.1 SaveAddressDto

```ts
{
  contactName: string
  contactPhone: string
  country?: string
  provinceName?: string
  cityName?: string
  districtName?: string
  streetName?: string
  addressTitle?: string
  detailAddress: string
  houseNumber?: string
  latitude?: number | null
  longitude?: number | null
  coordinateType?: 'gcj02' | 'wgs84' | 'bd09'
  poiId?: string
  mapProvider?: 'tencent' | 'amap'
  addressType?: 'service' | 'home' | 'work' | 'billing'
  isDefault?: boolean
}
```

校验：

```txt
contactName 1-64
contactPhone 中国大陆手机号
detailAddress 1-256
houseNumber <=64
latitude -90 到 90
longitude -180 到 180
mapProvider 只允许 tencent/amap
coordinateType 只允许 gcj02/wgs84/bd09
```

### 8.2 AdminSaveAddressDto

继承 SaveAddressDto，并额外要求：

```txt
ownerType required
ownerId required
```

### 8.3 AddressView

统一返回：

```ts
{
  id: number
  ownerType?: 'user' | 'staff'
  ownerId?: number
  ownerName?: string
  ownerPhone?: string
  addressType: string
  contactName: string
  contactPhone: string
  country?: string
  provinceName?: string
  cityName?: string
  districtName?: string
  streetName?: string
  addressTitle?: string
  detailAddress: string
  houseNumber?: string
  formattedAddress: string
  latitude: number | null
  longitude: number | null
  coordinateType?: string
  poiId?: string
  mapProvider?: string
  isDefault: boolean
  source: string
  updatedAt: string
}
```

## 9. 地图模块计划

新增：

```txt
server/src/maps/
  maps.module.ts
  maps.controller.ts
  maps.service.ts
  providers/
    map-provider.interface.ts
    tencent-map.provider.ts
    amap.provider.ts
  dto/
    geocode.dto.ts
    reverse-geocode.dto.ts
    place-suggestions.dto.ts
```

环境变量：

```env
MAP_PROVIDER=tencent
TENCENT_MAP_KEY=
AMAP_KEY=
MAP_API_TIMEOUT_MS=5000
```

接口：

```txt
GET /api/maps/geocode
GET /api/maps/reverse-geocode
GET /api/maps/place-suggestions
```

注意：

```txt
地图 key 只放 server/.env
不要写进 miniapp
不要提交真实 key
地图 API 失败返回统一业务错误
```

## 10. 订单模块同步修改

当前订单创建必须检查是否引用了 `userAddress`。

需要改为：

```txt
从 addresses 表读取 addressId
where:
  id = addressId
  ownerType = user
  ownerId = 当前用户 id
  addressType = service
  deletedAt = null
```

订单地址快照改为新结构：

```json
{
  "addressId": 1,
  "ownerType": "user",
  "addressType": "service",
  "contactName": "张女士",
  "contactPhone": "13800000000",
  "provinceName": "上海市",
  "cityName": "上海市",
  "districtName": "浦东新区",
  "streetName": "世纪大道",
  "addressTitle": "万科城市花园",
  "detailAddress": "世纪大道100号8栋",
  "houseNumber": "1201",
  "formattedAddress": "上海市浦东新区世纪大道100号8栋1201",
  "latitude": 31.2304,
  "longitude": 121.4737,
  "coordinateType": "gcj02",
  "poiId": "xxx",
  "mapProvider": "tencent"
}
```

订单详情 presenter 不需要兼容旧地址数据，因为当前明确无真实旧地址数据。

但为了避免开发阶段旧测试订单报错，可以做宽容展示：

```txt
如果 snapshot 没有 formattedAddress，则回退到 addressText/detailAddress 拼接。
```

## 11. AdminBusiness 同步修改

当前 `AdminBusinessService.listAddresses()` 使用：

```txt
prisma.userAddress
```

必须改为：

```txt
prisma.address
```

同时返回 owner 信息：

```txt
ownerType=user -> 查 users
ownerType=staff -> 查 staff
```

第一版可以在 service 中分两批查 owner map：

```txt
userIds -> users
staffIds -> staff
```

返回字段：

```txt
id
ownerType
ownerId
ownerName
ownerPhone
addressType
contactName
contactPhone
city
district
formattedAddress
isDefault
updatedAt
```

## 12. 小程序同步修改

### 12.1 用户地址

文件：

```txt
miniapp/src/api/address.ts
miniapp/src/api/types/address.ts
miniapp/src/pages/address/list.vue
miniapp/src/pages/address/edit.vue
miniapp/src/pages/order/create.vue
```

要求：

```txt
删除地址主流程对 mockDay4 的依赖
list.vue 调 getUserAddresses
edit.vue 调 getUserAddress(id)
新增/编辑保存真实 API
删除调真实 API
下单页读取真实默认地址
```

### 12.2 师傅地址

新增：

```txt
miniapp/src/api/staff-address.ts
miniapp/src/api/types/staff-address.ts
miniapp/src/pages/staff/address-list.vue
miniapp/src/pages/staff/address-edit.vue
```

师傅个人中心入口：

```txt
常驻地址
```

### 12.3 地址编辑 UI 统一

建议新增组件：

```txt
miniapp/src/components/address-edit-form/address-edit-form.vue
miniapp/src/components/address-location-picker/address-location-picker.vue
```

三端字段统一：

```txt
联系人
手机号
地址位置
详细地址
门牌号
设为默认
```

## 13. Admin 前端同步修改

建议新增：

```txt
admin/src/api/life/addresses.ts
```

或继续在：

```txt
admin/src/api/life/index.ts
```

中补：

```ts
getAddressPage(params)
createAddress(data)
updateAddress(id, data)
deleteAddress(id)
```

页面：

```txt
admin/src/views/life/resource/index.vue
```

需要支持地址模块：

```txt
ownerType 筛选
ownerName 展示
ownerPhone 展示
addressType 展示
formattedAddress 展示
编辑弹窗
删除确认
```

用户管理和师傅管理操作栏可后续增加：

```txt
地址管理
```

## 14. 引用扫描命令

实施前后都必须跑：

```bash
rg -n "UserAddress|userAddress|user_addresses|findUserAddress|findUserAddresses|createUserAddress|updateUserAddress|deleteUserAddress" server miniapp admin docs
```

实施完成后，允许存在：

```txt
docs/plan/day12-address-alt.md 中的历史说明
迁移文件里 drop user_addresses 的 SQL
```

不允许存在：

```txt
业务代码继续使用 prisma.userAddress
订单创建继续读取 userAddress
admin 地址列表继续读取 userAddress
前端地址页面继续使用 mockDay4 作为主数据源
```

## 15. 执行顺序

### Phase 1：Schema 破坏式替换

```txt
1. schema.prisma 删除 UserAddress
2. schema.prisma 删除 User.addresses relation
3. schema.prisma 新增 Address
4. prisma migrate dev --name replace_user_addresses_with_addresses
5. prisma generate
```

### Phase 2：后端统一地址域

```txt
1. 重写 AddressesRepository
2. 重写 AddressesService
3. 拆分 user/staff/admin controllers
4. 默认地址规则按 ownerType+ownerId+addressType 实现
5. formattedAddress 后端生成
```

### Phase 3：订单模块切换

```txt
1. create-order DTO 保持 addressId
2. OrdersService 根据 addressId 读取 addresses
3. addressSnapshot 改新结构
4. contract-test 创建地址和下单路径同步修改
```

### Phase 4：admin 后端同步

```txt
1. AdminBusinessService.listAddresses 改 addresses
2. 新增 admin address CRUD
3. 所有写操作写 AuditLog
```

### Phase 5：地图模块

```txt
1. 新增 MapsModule
2. 腾讯地图 provider
3. 高德 provider 预留
4. geocode/reverse-geocode/place-suggestions
```

### Phase 6：小程序用户端

```txt
1. api/types/address.ts 更新 AddressView
2. api/address.ts 增加 getUserAddress
3. address/list.vue 接真实 API
4. address/edit.vue 重写为真实 API + 新 UI
5. order/create.vue 读取新地址模型
```

### Phase 7：小程序师傅端

```txt
1. 新增 staff-address API
2. 新增 staff address list/edit 页面
3. staff profile 增加入口
```

### Phase 8：admin 前端

```txt
1. 地址资源页接 /api/admin/addresses
2. 地址编辑弹窗字段对齐新模型
3. 用户/师傅详情入口后续接入
```

### Phase 9：验证

```txt
npm run build
npm run test:contract
npm run db:verify
miniapp pnpm type-check
miniapp pnpm build:mp
admin pnpm exec vue-tsc --noEmit
admin pnpm run build-only
```

## 16. 验收清单

### 16.1 删除旧地址

```txt
[ ] Prisma schema 中没有 UserAddress model
[ ] Prisma schema 中没有 User.addresses UserAddress[] relation
[ ] 数据库没有 user_addresses 表
[ ] 业务代码没有 prisma.userAddress
```

### 16.2 新地址模型

```txt
[ ] addresses 表存在
[ ] ownerType=user 可写入
[ ] ownerType=staff 可写入
[ ] addressType=service/home/work 可写入
[ ] formattedAddress 后端生成
[ ] 默认地址唯一
```

### 16.3 用户端

```txt
[ ] 用户可新增地址
[ ] 用户可编辑地址
[ ] 用户可删除地址
[ ] 用户可设置默认地址
[ ] 下单使用新地址模型
```

### 16.4 师傅端

```txt
[ ] 师傅可新增地址
[ ] 师傅可编辑地址
[ ] 师傅可删除地址
[ ] 师傅默认地址唯一
```

### 16.5 Admin

```txt
[ ] admin 地址列表来自 addresses
[ ] admin 可筛选 ownerType
[ ] admin 可新增/编辑/删除用户地址
[ ] admin 可新增/编辑/删除师傅地址
[ ] admin 地址写操作写 audit_logs
```

### 16.6 地图

```txt
[ ] 地图 key 只在 server/.env
[ ] /api/maps/geocode 可用
[ ] /api/maps/reverse-geocode 可用
[ ] /api/maps/place-suggestions 可用
```

## 17. 风险和注意事项

```txt
这是破坏式重构，必须接受旧地址数据被删除
订单测试数据如果引用旧 user_addresses，需要重建
contract-test 必须同步更新
admin 地址列表必须同步切换，否则会编译或运行失败
地图 key 不要提交
前端 mockDay4 地址逻辑必须退出主链路
```

## 18. 本阶段不做

```txt
不迁移旧 user_addresses 数据
不保留 user_addresses 兼容读写
不做自动派单
不做路线规划
不做实时轨迹
不做围栏打卡
不做距离计价
```

