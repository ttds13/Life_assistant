# Day 12 三端地址与地图定位行动计划

更新日期：2026-05-30

## 1. 目标

Day 12 的目标是把地址能力从“用户端部分真实、其他端零散管理”升级为三端一致的真实数据闭环：

```txt
用户可以在小程序端编辑自己的服务地址
师傅可以在小程序师傅端编辑自己的服务/常驻地址
管理员可以在 admin 端编辑用户和师傅的基础信息与地址信息
三端均通过 API 与 server / MySQL 真实数据交互
后端提供地图定位、地址解析、逆地址解析能力
订单创建继续保存 addressSnapshot，避免历史订单被地址修改影响
```

地图服务第一版建议优先接入：

```txt
腾讯地图 API
```

原因：

```txt
微信小程序生态里腾讯地图联调和 key 配置更直接
后续可扩展高德地图 provider
后端用统一 MapProvider 抽象隔离供应商差异
```

## 2. 当前现状

### 2.1 用户地址后端

当前已存在：

```txt
server/src/addresses/*
GET    /api/user/addresses
POST   /api/user/addresses
PUT    /api/user/addresses/:id
DELETE /api/user/addresses/:id
```

当前后端 `user_addresses` 已有：

```txt
contact_name
contact_phone
province
city
district
address
latitude
longitude
is_default
deleted_at
```

当前问题：

```txt
用户地址编辑页 miniapp/src/pages/address/edit.vue 仍在使用 mockDay4
后端没有 GET /api/user/addresses/:id
删除默认地址后没有自动补新的默认地址
detailAddress / houseNumber 目前组合进 address，不能可靠拆分
没有地图选点、地址解析、逆地址解析
```

### 2.2 师傅地址

当前 `staff` 表有：

```txt
cityCode
```

但没有：

```txt
师傅常驻地址
师傅服务地址
师傅经纬度
师傅地址编辑接口
师傅地址管理页面真实 API
```

当前结论：

```txt
不要把师傅详细地址塞进 staff.cityCode。
建议新增 staff_addresses 表，和 user_addresses 形成对称结构。
```

### 2.3 Admin 地址管理

当前 admin 后端已有：

```txt
GET /api/admin/addresses
GET /api/admin/users
PUT /api/admin/users/:id
GET /api/admin/staff
PUT /api/admin/staff/:id
```

当前问题：

```txt
admin 地址目前偏只读
缺少用户地址详情、编辑、新增、删除接口
缺少师傅地址详情、编辑、新增、删除接口
admin 前端资源页需要补地址编辑表单和 API 映射
```

## 3. 设计原则

### 3.1 地址归属分清楚

用户地址和师傅地址职责不同：

```txt
用户地址：服务上门地址，订单创建时生成 addressSnapshot
师傅地址：师傅常驻地/服务范围参考，用于派单距离、师傅资料和后续定位
```

不要用一张表混合不同 owner 类型，Day 12 先保持清晰：

```txt
user_addresses
staff_addresses
```

如果后续要做统一地址模型，再评估迁移为：

```txt
addresses(owner_type, owner_id, ...)
```

### 3.2 前端不直接相信地理信息

前端可以提交：

```txt
address text
latitude
longitude
map provider poi id
```

但后端必须：

```txt
校验字段格式
必要时调用地图 API geocode/reverse-geocode
统一保存标准化地址
订单创建时保存地址快照
```

### 3.3 地图能力必须后端封装

禁止在页面里到处硬编码腾讯/高德 API。

推荐结构：

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
    search-place.dto.ts
```

前端统一请求后端：

```txt
GET /api/maps/geocode
GET /api/maps/reverse-geocode
GET /api/maps/place-suggestions
```

## 4. 数据库计划

### 4.1 user_addresses 增强建议

当前表可以支撑第一版，但建议新增字段以解决拆分和地图来源问题：

```prisma
houseNumber String? @map("house_number") @db.VarChar(64)
addressTitle String? @map("address_title") @db.VarChar(128)
poiId String? @map("poi_id") @db.VarChar(128)
mapProvider String? @map("map_provider") @db.VarChar(16)
```

字段说明：

```txt
addressTitle：小区/POI 名称，例如“万科城市花园”
address：街道、小区、楼栋等详细地址
houseNumber：门牌号
poiId：地图供应商返回的 POI id
mapProvider：tencent / amap
```

如果 Day 12 不想改动现有 user_addresses，也可以先不迁移，继续使用 address 字段承载 detailAddress + houseNumber。

但从后续派单、地址展示和编辑体验看，推荐本次顺手补齐。

### 4.2 新增 staff_addresses

建议新增：

```prisma
model StaffAddress {
  id           BigInt    @id @default(autoincrement())
  staffId      BigInt    @map("staff_id")
  contactName  String    @map("contact_name") @db.VarChar(64)
  contactPhone String    @map("contact_phone") @db.VarChar(20)
  province     String    @db.VarChar(32)
  city         String    @db.VarChar(32)
  district     String    @db.VarChar(32)
  addressTitle String?   @map("address_title") @db.VarChar(128)
  address      String    @db.VarChar(256)
  houseNumber  String?   @map("house_number") @db.VarChar(64)
  latitude     Decimal?  @db.Decimal(10, 7)
  longitude    Decimal?  @db.Decimal(10, 7)
  poiId        String?   @map("poi_id") @db.VarChar(128)
  mapProvider  String?   @map("map_provider") @db.VarChar(16)
  isDefault    Boolean   @default(false) @map("is_default")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")
  deletedAt    DateTime? @map("deleted_at")

  staff Staff @relation(fields: [staffId], references: [id])

  @@index([staffId])
  @@index([city])
  @@index([district])
  @@map("staff_addresses")
}
```

同时给 `Staff` 增加：

```prisma
addresses StaffAddress[]
```

### 4.3 迁移命名

建议迁移文件：

```txt
20260530_add_staff_addresses_and_address_map_fields
```

## 5. 后端 API 计划

### 5.1 用户端地址接口

保留现有接口：

```txt
GET    /api/user/addresses
POST   /api/user/addresses
PUT    /api/user/addresses/:id
DELETE /api/user/addresses/:id
```

新增：

```txt
GET /api/user/addresses/:id
```

用途：

```txt
地址编辑页按 id 直接加载真实地址
避免从列表里找地址导致刷新丢失
```

DTO 扩展：

```ts
{
  contactName: string
  contactPhone: string
  provinceName?: string
  cityName?: string
  districtName?: string
  addressTitle?: string
  detailAddress: string
  houseNumber?: string
  latitude?: number | null
  longitude?: number | null
  poiId?: string
  mapProvider?: 'tencent' | 'amap'
  isDefault?: boolean
}
```

默认地址规则必须补齐：

```txt
创建第一条地址时自动设为默认
创建/更新 isDefault=true 时取消其他默认地址
删除默认地址后，如果还有地址，自动把最新地址设为默认
用户只能操作自己的地址
软删除，不物理删除
```

### 5.2 师傅端地址接口

新增模块：

```txt
server/src/staff-addresses/
  staff-addresses.module.ts
  staff-addresses.controller.ts
  staff-addresses.service.ts
  staff-addresses.repository.ts
  dto/save-staff-address.dto.ts
```

接口：

```txt
GET    /api/staff/addresses
GET    /api/staff/addresses/:id
POST   /api/staff/addresses
PUT    /api/staff/addresses/:id
DELETE /api/staff/addresses/:id
```

鉴权：

```txt
必须是 staff 身份
staffId 来自 token
开发环境可继续兼容 X-Staff-Id
生产环境禁止 X-Staff-Id
```

规则：

```txt
师傅只能操作自己的地址
默认地址唯一
删除默认地址后自动补默认
软删除
写 AuditLog 可选，建议关键操作写 staff 地址变更日志
```

### 5.3 Admin 用户地址接口

新增或扩展：

```txt
GET    /api/admin/users/:userId/addresses
GET    /api/admin/users/:userId/addresses/:addressId
POST   /api/admin/users/:userId/addresses
PUT    /api/admin/users/:userId/addresses/:addressId
DELETE /api/admin/users/:userId/addresses/:addressId
```

也可以保留资源化路径：

```txt
GET    /api/admin/addresses/:id
PUT    /api/admin/addresses/:id
DELETE /api/admin/addresses/:id
```

推荐：

```txt
第一版同时支持 /admin/users/:userId/addresses 作为语义入口
admin 通用资源页继续使用 /admin/addresses 列表
```

审计：

```txt
user-address:create
user-address:update
user-address:delete
```

### 5.4 Admin 师傅地址接口

新增：

```txt
GET    /api/admin/staff/:staffId/addresses
GET    /api/admin/staff/:staffId/addresses/:addressId
POST   /api/admin/staff/:staffId/addresses
PUT    /api/admin/staff/:staffId/addresses/:addressId
DELETE /api/admin/staff/:staffId/addresses/:addressId
```

审计：

```txt
staff-address:create
staff-address:update
staff-address:delete
```

### 5.5 地图接口

新增：

```txt
GET /api/maps/geocode
GET /api/maps/reverse-geocode
GET /api/maps/place-suggestions
```

#### 5.5.1 地址解析

```txt
GET /api/maps/geocode?address=上海市浦东新区世纪大道100号&city=上海市
```

返回：

```json
{
  "provider": "tencent",
  "address": "上海市浦东新区世纪大道100号",
  "latitude": 31.2304,
  "longitude": 121.4737,
  "province": "上海市",
  "city": "上海市",
  "district": "浦东新区",
  "formattedAddress": "上海市浦东新区世纪大道100号"
}
```

#### 5.5.2 逆地址解析

```txt
GET /api/maps/reverse-geocode?latitude=31.2304&longitude=121.4737
```

返回：

```json
{
  "provider": "tencent",
  "latitude": 31.2304,
  "longitude": 121.4737,
  "province": "上海市",
  "city": "上海市",
  "district": "浦东新区",
  "address": "世纪大道100号",
  "formattedAddress": "上海市浦东新区世纪大道100号",
  "pois": []
}
```

#### 5.5.3 地址联想

```txt
GET /api/maps/place-suggestions?keyword=世纪大道&city=上海市
```

返回：

```json
{
  "items": [
    {
      "title": "世纪大道",
      "address": "上海市浦东新区世纪大道",
      "province": "上海市",
      "city": "上海市",
      "district": "浦东新区",
      "latitude": 31.2304,
      "longitude": 121.4737,
      "poiId": "xxx",
      "provider": "tencent"
    }
  ]
}
```

### 5.6 地图环境变量

server `.env.example` 增加：

```env
MAP_PROVIDER=tencent
TENCENT_MAP_KEY=
AMAP_KEY=
MAP_API_TIMEOUT_MS=5000
```

要求：

```txt
地图 key 只放 server/.env
不要写入 miniapp
不要提交真实 key
地图接口失败时返回统一 BusinessException
```

## 6. 小程序端计划

### 6.1 用户地址页真实化

改造文件：

```txt
miniapp/src/pages/address/list.vue
miniapp/src/pages/address/edit.vue
miniapp/src/api/address.ts
miniapp/src/api/types/address.ts
```

任务：

```txt
list.vue 使用 getUserAddresses()
edit.vue 使用 getUserAddress(id)
edit.vue 保存使用 createUserAddress / updateUserAddress
edit.vue 删除使用 deleteUserAddress
移除 mockDay4 作为主数据源
保留 selectedAddress 本地缓存仅用于下单页回显
```

交互增强：

```txt
城市/区域输入升级为地图选点入口
点击“定位当前地址”调用 uni.getLocation
拿到经纬度后调用 /api/maps/reverse-geocode
用户可手动修正门牌号
保存时提交 latitude / longitude / poiId / mapProvider
```

### 6.2 师傅地址页

新增或改造：

```txt
miniapp/src/api/staff-address.ts
miniapp/src/api/types/staff-address.ts
miniapp/src/pages/staff/address-list.vue
miniapp/src/pages/staff/address-edit.vue
miniapp/src/pages/staff/profile.vue
```

入口：

```txt
师傅个人中心 -> 常驻地址 / 服务地址
```

功能：

```txt
查看地址列表
新增地址
编辑地址
删除地址
设为默认
定位当前地址
地图选点
```

### 6.3 小程序地图能力

第一版可以先使用：

```txt
uni.chooseLocation
uni.getLocation
```

注意：

```txt
需要在 manifest / 小程序后台配置定位权限说明
真机需要用户授权 location
如果 chooseLocation 返回 name/address/latitude/longitude，保存前仍走后端 DTO 校验
```

建议前端封装：

```txt
miniapp/src/api/maps.ts
miniapp/src/utils/location.ts
```

## 7. Admin 前端计划

### 7.1 用户管理

当前 admin 用户模块已支持编辑用户基础字段，但需补地址入口。

任务：

```txt
用户列表操作栏增加“地址”
用户详情中展示地址列表
支持新增/编辑/删除用户地址
地址编辑表单支持地图选点返回经纬度
```

API：

```txt
admin/src/api/admin/addresses.ts
或继续在 admin/src/api/life/index.ts 增加兼容方法
```

### 7.2 师傅管理

任务：

```txt
师傅列表操作栏增加“地址”
师傅详情中展示地址列表
支持新增/编辑/删除师傅地址
派单候选后续可以读取师傅默认地址用于距离展示
```

### 7.3 地图选点

admin 第一版不强制内嵌地图组件，可以先做：

```txt
地址关键词输入
调用 /api/maps/place-suggestions
选择 POI 后回填经纬度
```

后续再引入：

```txt
腾讯地图 JS API
高德地图 JS API
```

## 8. 订单和派单联动

### 8.1 订单创建

用户创建订单时继续：

```txt
读取 user_addresses
保存 addressSnapshot
```

addressSnapshot 建议扩展：

```json
{
  "id": 1,
  "contactName": "张女士",
  "contactPhone": "13800000000",
  "provinceName": "上海市",
  "cityName": "上海市",
  "districtName": "浦东新区",
  "addressTitle": "世纪大道",
  "detailAddress": "世纪大道100号",
  "houseNumber": "8栋1201",
  "latitude": 31.2304,
  "longitude": 121.4737,
  "poiId": "xxx",
  "mapProvider": "tencent"
}
```

### 8.2 后台派单

Day 12 不强制做自动派单，但要预留：

```txt
admin staff options 返回 staff 默认地址经纬度
admin 订单详情展示用户地址经纬度
后续可计算师傅到服务地址距离
```

### 8.3 师傅履约

师傅打卡已有 `service_checkins.latitude/longitude/addressText`。

Day 12 可顺带增强：

```txt
师傅点击上门/开始服务时可获取当前位置
后端保存 checkin 经纬度和 reverse-geocode 地址文本
```

## 9. 执行顺序

### Phase 1：补后端用户地址完整性

```txt
1. GET /api/user/addresses/:id
2. 地址默认值规则修正
3. SaveAddressDto 扩展 addressTitle / poiId / mapProvider / provinceName
4. user_addresses 可选迁移 house_number/address_title/poi_id/map_provider
5. contract-test 覆盖用户地址 CRUD 和默认地址规则
```

### Phase 2：用户端地址页切真实 API

```txt
1. address/list.vue 切 getUserAddresses
2. address/edit.vue 移除 mockDay4
3. 新增定位/地图选点入口
4. 保存真实地址到后端
5. 下单页读取真实默认地址
```

### Phase 3：地图模块

```txt
1. 新增 MapsModule
2. 实现 TencentMapProvider
3. 预留 AmapProvider
4. 实现 geocode/reverse-geocode/place-suggestions
5. 增加 env.example
6. 小程序调用 reverse-geocode 和 suggestions
```

### Phase 4：师傅地址后端

```txt
1. 新增 staff_addresses schema 和 migration
2. 新增 StaffAddressesModule
3. 实现 /api/staff/addresses CRUD
4. 支持开发 header 和真实 staff token
5. 增加 contract-test
```

### Phase 5：师傅端地址页面

```txt
1. 新增 staff-address API
2. 新增 staff/address-list.vue
3. 新增 staff/address-edit.vue
4. profile.vue 增加入口
5. 支持定位和地图选点
```

### Phase 6：admin 地址管理

```txt
1. 后端新增 admin 用户地址 CRUD
2. 后端新增 admin 师傅地址 CRUD
3. 所有写操作写 AuditLog
4. admin 前端用户模块增加地址管理弹窗/页面
5. admin 前端师傅模块增加地址管理弹窗/页面
```

### Phase 7：联动和验收

```txt
1. 用户保存地址
2. 用户下单生成 addressSnapshot
3. 师傅保存默认地址
4. admin 可编辑用户地址
5. admin 可编辑师傅地址
6. 地图搜索/定位可用
7. server build / contract-test 通过
8. miniapp build:mp 通过
9. admin build-only 通过
```

## 10. 验收清单

### 10.1 后端

```txt
[ ] GET /api/user/addresses/:id 可用
[ ] 用户地址 CRUD 全部真实落库
[ ] 用户默认地址唯一
[ ] 删除默认地址后自动补默认
[ ] staff_addresses migration 完成
[ ] /api/staff/addresses CRUD 可用
[ ] staff 默认地址唯一
[ ] admin 用户地址 CRUD 可用
[ ] admin 师傅地址 CRUD 可用
[ ] 地址写操作写 AuditLog
[ ] MapsModule 可用
[ ] 腾讯地图 geocode 可用
[ ] 腾讯地图 reverse-geocode 可用
[ ] 腾讯地图 place-suggestions 可用
```

### 10.2 小程序用户端

```txt
[ ] 地址列表不再使用 mockDay4
[ ] 地址编辑不再使用 mockDay4
[ ] 新增地址保存到 MySQL
[ ] 编辑地址更新 MySQL
[ ] 删除地址软删除
[ ] 定位当前地址可回填
[ ] 地图选点可回填经纬度
[ ] 下单页读取真实默认地址
```

### 10.3 小程序师傅端

```txt
[ ] 师傅个人中心有地址入口
[ ] 师傅可新增地址
[ ] 师傅可编辑地址
[ ] 师傅可删除地址
[ ] 师傅可设置默认地址
[ ] 师傅地址保存经纬度
```

### 10.4 Admin

```txt
[ ] admin 用户列表可进入地址管理
[ ] admin 可编辑用户基础信息
[ ] admin 可新增/编辑/删除用户地址
[ ] admin 师傅列表可进入地址管理
[ ] admin 可编辑师傅基础信息
[ ] admin 可新增/编辑/删除师傅地址
[ ] 地址写操作产生 audit_logs
```

## 11. 风险和注意事项

```txt
地图 key 不要写进 miniapp，统一放 server/.env
前端经纬度不可信，后端要校验数值范围
用户地址修改不能影响历史订单，订单必须使用 addressSnapshot
师傅地址不是订单履约打卡地址，二者不要混淆
小程序定位需要用户授权和隐私权限声明
腾讯地图/高德地图 API 有配额和计费，要做好失败降级
admin 不应绕过权限直接编辑任意业务状态
```

## 12. 本阶段不做

Day 12 暂不做：

```txt
自动派单算法
路线规划和导航
实时轨迹
围栏打卡校验
多城市服务范围复杂规则
距离计价
地址簿导入
高精地图组件深度定制
```

这些能力等地址和定位基础稳定后再进入后续阶段。

