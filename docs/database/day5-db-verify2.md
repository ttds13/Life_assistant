# Day 5 数据库实现分类与完成度说明

生成时间：2026-05-23

## 1. 这份报告说明什么

本报告是在 `day5-db-verify.md` 的基础上，进一步整理当前数据库已经实现了什么。

重点回答：

```txt
1. 当前真实数据库里有哪些服务分类和服务数据
2. 当前数据库已经完成了哪些功能闭环
3. 当前 Prisma schema 已经实现了哪些业务表和字段
4. 哪些只是建好了表结构，但还没有接入实际业务接口
5. 当前仍然存在的 P1 / P2 风险如何理解
```

本报告不展示 `rear/.env` 中的数据库密码。

## 2. 当前数据库总体状态

当前后端使用：

```txt
数据库：MySQL
ORM：Prisma
后端目录：rear
Prisma schema：rear/prisma/schema.prisma
当前默认数据模式：DB_MODE=prisma
JSON fallback：仍保留，DB_MODE=json 时可回退
```

验证结论：

```txt
Prisma schema 校验通过
Prisma migrate status 显示数据库结构已是最新
MySQL 连接成功
后端 API 能从 MySQL 读取服务分类、服务列表、用户数据
```

当前 schema 中定义了：

```txt
33 个业务模型
33 张业务表
1 张 Prisma 迁移表：_prisma_migrations
```

## 3. 当前真实数据库中的数据

### 3.1 当前服务分类

真实 API 当前返回 5 个服务分类：

| id | 分类名称 | icon | sortOrder | status |
|---:|---|---|---:|---:|
| 2 | 日常保洁 | i-carbon-clean | 1 | 1 |
| 1 | 深度保洁 | i-carbon-tools | 2 | 1 |
| 4 | 家电清洗 | i-carbon-clean | 3 | 1 |
| 5 | 水电维修 | i-carbon-tools | 4 | 1 |
| 3 | 搬家服务 | i-carbon-delivery | 5 | 1 |

这解释了之前的 P2：

```txt
首页 UI 计划要求参考图中的 15 个分类
但真实数据库现在只有 5 个分类
所以只要首页优先使用接口数据，页面就只会显示 5 个分类入口
```

### 3.2 当前服务项目

真实数据库当前有 10 个服务项目：

| id | 分类 | 服务名称 | 基础价 | 单位 | sortOrder |
|---:|---:|---|---:|---|---:|
| 8 | 2 | 日常保洁 2 小时 | 120 | 次 | 1 |
| 4 | 2 | 日常保洁 3 小时 | 170 | 次 | 2 |
| 9 | 1 | 深度保洁 4 小时 | 260 | 次 | 3 |
| 6 | 1 | 全屋深度保洁 | 380 | 次 | 4 |
| 3 | 4 | 空调清洗 | 99 | 台 | 5 |
| 2 | 4 | 油烟机清洗 | 159 | 台 | 6 |
| 1 | 4 | 洗衣机清洗 | 129 | 台 | 7 |
| 5 | 5 | 水龙头维修 | 80 | 次 | 8 |
| 10 | 5 | 电路维修 | 100 | 次 | 9 |
| 7 | 3 | 居民搬家 | 300 | 次 | 10 |

### 3.3 当前用户数据

当前真实数据库中有 1 个测试用户：

```txt
手机号：13800138000
昵称：测试用户
用途：mock-login 测试
```

### 3.4 当前各表数据量

| 表名 | 当前数据量 | 说明 |
|---|---:|---|
| users | 1 | 已有测试用户 |
| service_categories | 5 | 已有首页分类数据 |
| services | 10 | 已有服务项目数据 |
| 其它 30 张业务表 | 0 | 表结构已存在，但暂未写入业务数据 |

## 4. 当前已经完成的数据库功能

### 4.1 MySQL / Prisma 基础接入

已完成：

```txt
MySQL 数据库 life_assistant 已可连接
Prisma schema 已定义完整业务模型
迁移已应用到 MySQL
后端通过 Prisma Client 访问数据库
rear/src/common/prisma.js 提供 Prisma 单例和连接检查
rear/src/common/serialize.js 提供 BigInt / Date 序列化处理
```

注意：

```txt
Decimal 序列化仍有问题，见第 9 节
```

### 4.2 服务分类读取

已完成接口链路：

```txt
GET /api/service-categories
```

链路：

```txt
services.controller.js
  -> services.service.js
  -> services.repository.js
  -> prisma.serviceCategory.findMany()
  -> MySQL service_categories
```

当前可用能力：

```txt
按 status 查询分类
按 sortOrder / id 排序
返回 id、name、icon、description、sortOrder、status、createdAt、updatedAt
```

### 4.3 服务列表读取

已完成接口链路：

```txt
GET /api/services?page=1&pageSize=10
```

链路：

```txt
services.controller.js
  -> services.service.js
  -> services.repository.js
  -> prisma.service.findMany()
  -> MySQL services
```

当前可用能力：

```txt
按 status 查询服务
按 categoryId 筛选服务
按 keyword 搜索服务名称
按 sortOrder / id 排序
支持 page / pageSize 分页响应
```

当前限制：

```txt
Decimal 字段 basePrice / rating 返回格式仍不符合前端 number 类型
repository 内部已经有 skip/take 逻辑，但 service 层又对 allItems 做 slice，后续应统一分页位置
```

### 4.4 服务详情读取

已完成接口链路：

```txt
GET /api/services/:id
```

当前可用能力：

```txt
按服务 id 查询详情
include category
include images
不存在或 status != 1 时返回服务不存在
```

### 4.5 用户 / 登录基础链路

已完成接口链路：

```txt
POST /api/auth/mock-login
POST /api/auth/wechat-login
GET /api/auth/me
PUT /api/auth/profile
```

数据库接入点：

```txt
users.repository.js
  -> prisma.user.findFirst()
  -> prisma.user.create()
  -> prisma.user.update()
```

当前可用能力：

```txt
按手机号查找用户
按 id 查找用户
创建用户
更新昵称、头像、openid、unionid
mock-login 能返回 token 和用户信息
```

当前设计取舍：

```txt
schema 没有单独 user_oauth 表
微信 openid / unionid 直接存储在 users 表
repository 用兼容方法模拟 oauth 相关读写
```

### 4.6 DB_MODE 回退能力

已完成：

```txt
DB_MODE=prisma：默认走 MySQL
DB_MODE=json：可回退到 rear/src/data/local-db.js
```

已验证：

```txt
JSON fallback 能读取 4 个分类、5 个服务
```

## 5. 当前已经实现的业务表分类

下面按业务域整理当前 schema 中已经建好的表。

### 5.1 用户与认证

表：

```txt
users
login_logs
```

`users` 核心字段：

```txt
id
uuid
openid
unionid
phone
nickname
avatar_url
gender
status
city_code
store_id
created_at
updated_at
deleted_at
```

用途：

```txt
用户基础资料
微信 openid / unionid 绑定
手机号登录
软删除
城市 / 门店归属预留
```

`login_logs` 核心字段：

```txt
user_type
user_id
login_method
ip
user_agent
created_at
```

当前状态：

```txt
users 已接入 mock-login / me / profile
login_logs 表存在，但当前登录流程未写入日志
```

### 5.2 师傅端 / 服务人员

表：

```txt
staff
```

核心字段：

```txt
id
uuid
name
phone
password_hash
avatar_url
id_card
skills
status
work_status
city_code
store_id
rating
total_orders
created_at
updated_at
deleted_at
```

用途：

```txt
师傅账号
技能 JSON
工作状态
评分和累计订单数
城市 / 门店归属
```

当前状态：

```txt
表结构已完成
暂无数据
暂无师傅端接口接入
```

### 5.3 后台管理与权限

表：

```txt
admin_users
roles
audit_logs
```

用途：

```txt
admin_users：后台管理员
roles：角色与权限 JSON
audit_logs：后台或系统操作审计
```

当前状态：

```txt
表结构已完成
暂无数据
暂无后台管理接口接入
```

### 5.4 服务管理

表：

```txt
service_categories
services
service_price_rules
service_images
service_favorites
```

`service_categories` 核心字段：

```txt
id
name
icon
description
sort_order
status
created_at
updated_at
```

`services` 核心字段：

```txt
id
uuid
category_id
name
description
detail
cover_image
base_price
price_unit
min_price
duration_minutes
service_area
notice
status
sort_order
city_code
total_orders
rating
created_at
updated_at
deleted_at
```

`service_price_rules` 核心字段：

```txt
service_id
rule_type
rule_name
rule_config
status
```

`service_images` 核心字段：

```txt
service_id
url
sort_order
created_at
```

`service_favorites` 核心字段：

```txt
user_id
service_id
created_at
```

当前状态：

```txt
service_categories 已有 5 条数据，并接入 API
services 已有 10 条数据，并接入 API
service_price_rules 表存在，暂无数据和接口
service_images 表存在，暂无数据；服务详情已 include images
service_favorites 表存在，暂无收藏接口
```

### 5.5 用户地址

表：

```txt
user_addresses
```

核心字段：

```txt
user_id
contact_name
contact_phone
province
city
district
address
latitude
longitude
is_default
created_at
updated_at
deleted_at
```

用途：

```txt
服务地址管理
下单地址选择
定位经纬度预留
默认地址
```

当前状态：

```txt
表结构已完成
暂无数据
小程序地址页目前仍使用 mock 数据，尚未接 MySQL
```

### 5.6 订单

表：

```txt
orders
order_status_logs
order_assignments
```

`orders` 核心字段：

```txt
order_no
user_id
staff_id
service_id
status
service_snapshot
address_snapshot
appointment_start_time
appointment_end_time
original_amount
discount_amount
payable_amount
paid_amount
coupon_id
member_card_id
remark
admin_remark
source
city_code
store_id
paid_at
completed_at
cancelled_at
cancel_reason
created_at
updated_at
```

`order_status_logs` 核心字段：

```txt
order_id
from_status
to_status
operator_type
operator_id
remark
created_at
```

`order_assignments` 核心字段：

```txt
order_id
staff_id
assign_type
assign_status
assigned_by
reject_reason
assigned_at
accepted_at
rejected_at
```

用途：

```txt
订单主流程
订单状态流转记录
派单 / 接单 / 拒单记录
服务快照和地址快照，避免后续服务或地址变更影响历史订单
```

当前状态：

```txt
表结构已完成
暂无数据
当前订单列表 / 下单 / 详情还未切换到 MySQL
```

### 5.7 支付与退款

表：

```txt
payments
payment_notify_logs
refunds
```

用途：

```txt
payments：订单支付记录
payment_notify_logs：支付回调原始记录与处理结果
refunds：退款单
```

关键字段：

```txt
payment_no
order_id
user_id
channel
amount
status
transaction_no
prepay_id
paid_at
callback_raw
refund_no
reason
channel_refund_no
operated_by
refunded_at
```

当前状态：

```txt
表结构已完成
暂无数据
暂无真实支付接入
```

### 5.8 服务履约

表：

```txt
service_checkins
service_photos
```

用途：

```txt
师傅到场 / 离场打卡
履约过程照片
地理位置与现场地址记录
```

关键字段：

```txt
order_id
staff_id
checkin_type
latitude
longitude
address_text
photo_url
photo_type
url
remark
created_at
```

当前状态：

```txt
表结构已完成
暂无数据
暂无师傅履约接口
```

### 5.9 评价与售后

表：

```txt
reviews
review_images
tickets
ticket_messages
```

用途：

```txt
reviews：订单评价
review_images：评价图片
tickets：售后工单
ticket_messages：售后沟通记录
```

关键字段：

```txt
order_id
user_id
staff_id
service_id
rating
content
is_anonymous
ticket_no
type
title
description
status
priority
handled_by
resolved_at
sender_type
sender_id
images
```

当前状态：

```txt
表结构已完成
暂无数据
暂无评价 / 售后接口
```

### 5.10 优惠券

表：

```txt
coupons
user_coupons
```

用途：

```txt
优惠券模板
用户领券记录
优惠券使用状态
```

关键字段：

```txt
name
type
amount
min_amount
applicable_services
total_count
issued_count
start_time
end_time
status
coupon_id
user_id
used_order_id
received_at
used_at
expire_at
```

当前状态：

```txt
表结构已完成
暂无数据
个人中心优惠券入口暂未接真实接口
```

### 5.11 次卡 / 会员卡

表：

```txt
member_cards
user_member_cards
member_card_records
```

用途：

```txt
次卡商品
用户购买后的次卡
次卡核销记录
```

关键字段：

```txt
name
applicable_services
total_times
price
validity_days
remaining_times
status
source
expire_at
times_used
order_id
```

当前状态：

```txt
表结构已完成
暂无数据
首页优惠次卡模块仍是前端静态占位
暂无次卡购买和核销接口
```

### 5.12 通知

表：

```txt
notifications
```

用途：

```txt
用户 / 师傅 / 管理员通知
业务消息记录
已读状态
发送状态
```

关键字段：

```txt
receiver_type
receiver_id
type
title
content
biz_type
biz_id
is_read
channel
send_status
created_at
```

当前状态：

```txt
表结构已完成
暂无数据
暂无通知接口
```

### 5.13 文件

表：

```txt
files
```

用途：

```txt
统一文件上传记录
头像 / 服务图 / 评价图 / 履约图等文件元数据
```

关键字段：

```txt
uuid
uploader_type
uploader_id
biz_type
biz_id
filename
url
storage_key
mime_type
size
created_at
```

当前状态：

```txt
表结构已完成
暂无数据
暂无文件上传接口
```

### 5.14 财务

表：

```txt
staff_income_records
withdraw_requests
```

用途：

```txt
师傅收入记录
师傅提现申请
```

关键字段：

```txt
staff_id
order_id
amount
type
status
settled_at
bank_info
handled_by
handled_at
created_at
updated_at
```

当前状态：

```txt
表结构已完成
暂无数据
暂无财务接口
```

## 6. 当前实际接入 API 的表

目前真正被后端业务接口使用的表只有：

```txt
service_categories
services
users
```

部分已被查询但暂无数据的表：

```txt
service_images
```

因为服务详情接口 include 了 images。

其余表属于：

```txt
数据库结构已完成
业务接口尚未接入
前端页面尚未真实联调
```

## 7. 当前完成的功能与未完成功能边界

### 已经完成

```txt
数据库结构迁移到 MySQL
服务分类表结构与数据
服务项目表结构与数据
测试用户数据
服务分类 API 从 MySQL 读取
服务列表 API 从 MySQL 读取
服务详情 API 从 MySQL 读取
mock-login 从 MySQL 查找 / 创建用户
用户资料更新写入 MySQL users 表
Prisma / JSON 双模式切换
```

### 尚未完成

```txt
用户地址真实 CRUD
订单创建 / 列表 / 详情真实 CRUD
支付 / 退款
师傅端账号和派单
履约打卡和照片
评价和售后
优惠券
次卡
通知
文件上传
财务结算
后台角色权限
审计日志写入
```

## 8. 对当前 4 个风险点的解释

### P1：Decimal 字段仍是对象

影响范围：

```txt
services.base_price
services.min_price
services.rating
staff.rating
orders 金额字段
payments.amount
refunds.amount
coupons.amount
member_cards.price
staff_income_records.amount
withdraw_requests.amount
```

当前问题：

```txt
BigInt 已能序列化为 number
Date 已能序列化为 ISO 字符串
但 Prisma Decimal 当前没有被 serialize 正确转为 number
GET /api/services 中 basePrice / rating 仍返回对象结构
```

结论：

```txt
这是接口联调 P1，必须修复，否则前端 price-text 会拿到非 number
```

### P1：prisma generate 文件占用

当前状态：

```txt
当前已有 Prisma Client 文件，运行接口不受影响
但 npm run prisma:generate 重新生成失败
```

原因判断：

```txt
Windows 下 query_engine-windows.dll.node 被正在运行的 Node / Prisma 进程占用
```

结论：

```txt
这是开发环境 P1，需要在提交或继续改 schema 前处理
```

### P2：真实分类只有 5 个

当前状态：

```txt
数据库真实分类：5 个
首页参考图目标分类：15 个
```

结论：

```txt
数据库本身没有错，只是 seed 数据不满足 UI 还原需求
需要决定是补数据库 seed，还是前端用 fallback 补齐
```

### P2：miniapp/env/.env 被 Git 跟踪

当前状态：

```txt
rear/.env 已被忽略
miniapp/env/.env 已被 Git 跟踪
```

结论：

```txt
上传 GitHub 前必须先处理环境文件策略
```

## 9. 下一步建议

优先级顺序：

```txt
1. 修复 Decimal 序列化，让所有 Decimal 输出为 number
2. 停止占用 Prisma engine 的 Node 进程，重新执行 npm run prisma:generate
3. 决定首页 15 分类策略：补 seed 或前端 fallback 补齐
4. 整理 Git 忽略规则和 miniapp/env 文件跟踪状态
5. 下一轮再做地址 / 订单的 MySQL CRUD
```

## 10. 一句话总结

当前数据库不是只做了几张简单表，而是已经完成了覆盖家政服务业务的完整表结构设计和迁移；但真正接入并跑通的业务功能目前集中在“服务分类、服务项目、用户登录/资料”这三块。订单、支付、地址、师傅、优惠券、次卡、售后等表已经存在，但还没有进入真实业务读写阶段。
