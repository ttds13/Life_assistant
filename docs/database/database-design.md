    # 生活助手数据库设计

## 设计原则

- 所有表使用 `id` 自增主键 + `uuid` 业务标识（对外暴露 uuid，内部关联用 id）
- 所有表包含 `created_at`、`updated_at`
- 支持软删除的表包含 `deleted_at`
- 金额字段使用 `DECIMAL(10,2)`，单位为元
- 状态字段使用 `SMALLINT`，配合常量枚举
- 预留 `city_code`、`store_id` 支持多城市多门店扩展
- 关键业务保存快照（价格快照、地址快照、服务快照）

---




## 1. 用户与认证

### users（用户表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | 主键 |
| uuid | VARCHAR(36) UNIQUE | 对外标识 |
| openid | VARCHAR(64) UNIQUE | 微信 openid |
| unionid | VARCHAR(64) | 微信 unionid |
| phone | VARCHAR(20) | 手机号 |
| nickname | VARCHAR(64) | 昵称 |
| avatar_url | VARCHAR(512) | 头像 |
| gender | SMALLINT DEFAULT 0 | 0未知 1男 2女 |
| status | SMALLINT DEFAULT 1 | 1正常 0禁用 |
| city_code | VARCHAR(20) | 城市编码（预留） |
| store_id | BIGINT | 门店ID（预留） |
| created_at | DATETIME | |
| updated_at | DATETIME | |
| deleted_at | DATETIME NULL | 软删除 |

索引：`openid`, `phone`, `city_code`

### staff（服务人员表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | 主键 |
| uuid | VARCHAR(36) UNIQUE | 对外标识 |
| name | VARCHAR(64) | 姓名 |
| phone | VARCHAR(20) | 手机号 |
| password_hash | VARCHAR(128) | 密码哈希 |
| avatar_url | VARCHAR(512) | 头像 |
| id_card | VARCHAR(20) | 身份证号 |
| skills | JSON | 技能标签 |
| status | SMALLINT DEFAULT 1 | 1在职 0离职 2禁用 |
| work_status | SMALLINT DEFAULT 0 | 0离线 1在线 2忙碌 |
| city_code | VARCHAR(20) | 城市编码 |
| store_id | BIGINT | 门店ID（预留） |
| rating | DECIMAL(3,2) DEFAULT 5.00 | 综合评分 |
| total_orders | INT DEFAULT 0 | 总接单数 |
| created_at | DATETIME | |
| updated_at | DATETIME | |
| deleted_at | DATETIME NULL | |

索引：`phone`, `status`, `work_status`, `city_code`

### admin_users（后台管理员表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| uuid | VARCHAR(36) UNIQUE | |
| username | VARCHAR(64) UNIQUE | 登录账号 |
| password_hash | VARCHAR(128) | |
| name | VARCHAR(64) | 姓名 |
| phone | VARCHAR(20) | |
| role | VARCHAR(32) | admin/operator/customer/finance |
| status | SMALLINT DEFAULT 1 | 1正常 0禁用 |
| last_login_at | DATETIME | |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### roles（角色表，预留 RBAC）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| name | VARCHAR(64) UNIQUE | 角色标识 |
| display_name | VARCHAR(64) | 显示名称 |
| permissions | JSON | 权限列表 |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### login_logs（登录日志）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| user_type | VARCHAR(16) | user/staff/admin |
| user_id | BIGINT | |
| login_method | VARCHAR(32) | wechat/phone/password |
| ip | VARCHAR(64) | |
| user_agent | VARCHAR(512) | |
| created_at | DATETIME | |

---

## 2. 服务管理

### service_categories（服务分类表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| name | VARCHAR(64) | 分类名称 |
| icon | VARCHAR(256) | 图标 |
| description | VARCHAR(512) | 描述 |
| sort_order | INT DEFAULT 0 | 排序 |
| status | SMALLINT DEFAULT 1 | 1启用 0禁用 |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### services（服务项目表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| uuid | VARCHAR(36) UNIQUE | |
| category_id | BIGINT FK | 分类ID |
| name | VARCHAR(128) | 服务名称 |
| description | TEXT | 服务描述 |
| detail | TEXT | 详细介绍（富文本） |
| cover_image | VARCHAR(512) | 封面图 |
| base_price | DECIMAL(10,2) | 基础价格 |
| price_unit | VARCHAR(16) | 计价单位（次/台/平米） |
| min_price | DECIMAL(10,2) | 最低价格 |
| duration_minutes | INT | 预计服务时长（分钟） |
| service_area | VARCHAR(256) | 服务范围说明 |
| notice | TEXT | 服务须知 |
| status | SMALLINT DEFAULT 1 | 1上架 0下架 |
| sort_order | INT DEFAULT 0 | |
| city_code | VARCHAR(20) | 城市编码（预留） |
| total_orders | INT DEFAULT 0 | 累计订单数 |
| rating | DECIMAL(3,2) DEFAULT 5.00 | 服务评分 |
| created_at | DATETIME | |
| updated_at | DATETIME | |
| deleted_at | DATETIME NULL | |

索引：`category_id`, `status`, `city_code`

### service_price_rules（价格规则表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| service_id | BIGINT FK | |
| rule_type | VARCHAR(32) | fixed/area/quantity/problem_type |
| rule_name | VARCHAR(64) | 规则名称 |
| rule_config | JSON | 规则配置 |
| status | SMALLINT DEFAULT 1 | |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### service_images（服务图片表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| service_id | BIGINT FK | |
| url | VARCHAR(512) | |
| sort_order | INT DEFAULT 0 | |
| created_at | DATETIME | |

---

## 3. 用户地址

### user_addresses（用户地址表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| user_id | BIGINT FK | |
| contact_name | VARCHAR(64) | 联系人 |
| contact_phone | VARCHAR(20) | 联系电话 |
| province | VARCHAR(32) | 省 |
| city | VARCHAR(32) | 市 |
| district | VARCHAR(32) | 区 |
| address | VARCHAR(256) | 详细地址 |
| latitude | DECIMAL(10,7) | 纬度 |
| longitude | DECIMAL(10,7) | 经度 |
| is_default | BOOLEAN DEFAULT FALSE | 是否默认 |
| created_at | DATETIME | |
| updated_at | DATETIME | |
| deleted_at | DATETIME NULL | |

索引：`user_id`

---

## 4. 订单

### orders（订单主表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| order_no | VARCHAR(32) UNIQUE | 订单号 |
| user_id | BIGINT FK | |
| staff_id | BIGINT FK NULL | 服务人员 |
| service_id | BIGINT FK | |
| status | VARCHAR(32) | 订单状态 |
| service_snapshot | JSON | 服务快照（名称、价格等） |
| address_snapshot | JSON | 地址快照 |
| appointment_start_time | DATETIME | 预约开始时间 |
| appointment_end_time | DATETIME | 预约结束时间 |
| original_amount | DECIMAL(10,2) | 原始金额 |
| discount_amount | DECIMAL(10,2) DEFAULT 0 | 优惠金额 |
| payable_amount | DECIMAL(10,2) | 应付金额 |
| paid_amount | DECIMAL(10,2) DEFAULT 0 | 实付金额 |
| coupon_id | BIGINT NULL | 使用的优惠券 |
| member_card_id | BIGINT NULL | 使用的会员卡 |
| remark | VARCHAR(512) | 用户备注 |
| admin_remark | VARCHAR(512) | 管理员备注 |
| source | VARCHAR(16) DEFAULT 'miniapp' | 来源 |
| city_code | VARCHAR(20) | |
| store_id | BIGINT | 预留 |
| paid_at | DATETIME NULL | 支付时间 |
| completed_at | DATETIME NULL | 完成时间 |
| cancelled_at | DATETIME NULL | 取消时间 |
| cancel_reason | VARCHAR(256) | 取消原因 |
| created_at | DATETIME | |
| updated_at | DATETIME | |

索引：`order_no`, `user_id`, `staff_id`, `status`, `created_at`

订单状态枚举：
```
pending_payment    待支付
pending_dispatch   待派单
assigned           已派单
accepted           已接单
in_service         服务中
pending_confirm    待确认
completed          已完成
cancelled          已取消
refund_pending     退款中
refunded           已退款
after_sale         售后中
after_sale_done    售后完成
```

### order_status_logs（订单状态日志）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| order_id | BIGINT FK | |
| from_status | VARCHAR(32) | |
| to_status | VARCHAR(32) | |
| operator_type | VARCHAR(16) | system/user/staff/admin |
| operator_id | BIGINT | |
| remark | VARCHAR(256) | |
| created_at | DATETIME | |

### order_assignments（派单记录表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| order_id | BIGINT FK | |
| staff_id | BIGINT FK | |
| assign_type | VARCHAR(16) | manual/auto |
| assign_status | VARCHAR(16) | pending/accepted/rejected |
| assigned_by | BIGINT | 派单人（管理员ID） |
| reject_reason | VARCHAR(256) | |
| assigned_at | DATETIME | |
| accepted_at | DATETIME NULL | |
| rejected_at | DATETIME NULL | |

---

## 5. 支付

### payments（支付记录表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| payment_no | VARCHAR(64) UNIQUE | 支付单号 |
| order_id | BIGINT FK | |
| user_id | BIGINT FK | |
| channel | VARCHAR(16) | wechat/alipay/balance |
| amount | DECIMAL(10,2) | 支付金额 |
| status | VARCHAR(16) | pending/success/failed/closed |
| transaction_no | VARCHAR(64) | 第三方交易号 |
| prepay_id | VARCHAR(128) | 预支付ID |
| paid_at | DATETIME NULL | |
| callback_raw | TEXT | 回调原文 |
| created_at | DATETIME | |
| updated_at | DATETIME | |

索引：`payment_no`, `order_id`, `transaction_no`

### payment_notify_logs（支付回调日志）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| payment_no | VARCHAR(64) | |
| channel | VARCHAR(16) | |
| raw_body | TEXT | 原始请求体 |
| process_result | VARCHAR(16) | success/duplicate/failed |
| created_at | DATETIME | |

### refunds（退款记录表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| refund_no | VARCHAR(64) UNIQUE | 退款单号 |
| order_id | BIGINT FK | |
| payment_id | BIGINT FK | |
| amount | DECIMAL(10,2) | 退款金额 |
| reason | VARCHAR(256) | 退款原因 |
| status | VARCHAR(16) | pending/success/failed |
| channel_refund_no | VARCHAR(64) | 第三方退款号 |
| operated_by | BIGINT | 操作人 |
| refunded_at | DATETIME NULL | |
| created_at | DATETIME | |
| updated_at | DATETIME | |

---

## 6. 服务履约

### service_checkins（上门打卡表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| order_id | BIGINT FK | |
| staff_id | BIGINT FK | |
| checkin_type | VARCHAR(16) | arrive/start/complete |
| latitude | DECIMAL(10,7) | |
| longitude | DECIMAL(10,7) | |
| address_text | VARCHAR(256) | |
| photo_url | VARCHAR(512) | |
| created_at | DATETIME | |

### service_photos（服务过程照片）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| order_id | BIGINT FK | |
| staff_id | BIGINT FK | |
| photo_type | VARCHAR(16) | before/during/after |
| url | VARCHAR(512) | |
| remark | VARCHAR(256) | |
| created_at | DATETIME | |

---

## 7. 评价与售后

### reviews（评价表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| order_id | BIGINT FK UNIQUE | 一个订单一条评价 |
| user_id | BIGINT FK | |
| staff_id | BIGINT FK | |
| service_id | BIGINT FK | |
| rating | SMALLINT | 1-5星 |
| content | TEXT | 评价内容 |
| is_anonymous | BOOLEAN DEFAULT FALSE | |
| status | SMALLINT DEFAULT 1 | 1正常 0隐藏 |
| created_at | DATETIME | |

### review_images（评价图片）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| review_id | BIGINT FK | |
| url | VARCHAR(512) | |
| sort_order | INT DEFAULT 0 | |
| created_at | DATETIME | |

### tickets（售后工单表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| ticket_no | VARCHAR(32) UNIQUE | 工单号 |
| order_id | BIGINT FK | |
| user_id | BIGINT FK | |
| staff_id | BIGINT FK NULL | |
| type | VARCHAR(32) | complaint/refund/redo/other |
| title | VARCHAR(128) | |
| description | TEXT | |
| status | VARCHAR(32) | open/staff_replied/admin_processing/resolved/closed |
| priority | SMALLINT DEFAULT 0 | 0普通 1紧急 |
| handled_by | BIGINT NULL | 处理人 |
| resolved_at | DATETIME NULL | |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### ticket_messages（工单消息）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| ticket_id | BIGINT FK | |
| sender_type | VARCHAR(16) | user/staff/admin |
| sender_id | BIGINT | |
| content | TEXT | |
| images | JSON | 图片URL数组 |
| created_at | DATETIME | |

---

## 8. 优惠券

### coupons（优惠券模板表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| name | VARCHAR(64) | 券名称 |
| type | VARCHAR(16) | fixed/threshold |
| amount | DECIMAL(10,2) | 优惠金额 |
| min_amount | DECIMAL(10,2) DEFAULT 0 | 满减门槛（0为无门槛） |
| applicable_services | JSON NULL | 适用服务ID列表（NULL为全部） |
| total_count | INT | 发放总量 |
| issued_count | INT DEFAULT 0 | 已发放数量 |
| start_time | DATETIME | 有效期开始 |
| end_time | DATETIME | 有效期结束 |
| status | SMALLINT DEFAULT 1 | 1有效 0停用 |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### user_coupons（用户优惠券）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| coupon_id | BIGINT FK | |
| user_id | BIGINT FK | |
| status | VARCHAR(16) | unused/used/expired |
| used_order_id | BIGINT NULL | 使用的订单 |
| received_at | DATETIME | 领取时间 |
| used_at | DATETIME NULL | 使用时间 |
| expire_at | DATETIME | 过期时间 |

索引：`user_id`, `status`

---

## 9. 会员次数卡

### member_cards（次数卡模板表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| name | VARCHAR(64) | 卡名称 |
| applicable_services | JSON | 适用服务ID列表 |
| total_times | INT | 总次数 |
| price | DECIMAL(10,2) | 售价 |
| validity_days | INT | 有效天数 |
| status | SMALLINT DEFAULT 1 | |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### user_member_cards（用户持有的次数卡）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| card_id | BIGINT FK | |
| user_id | BIGINT FK | |
| remaining_times | INT | 剩余次数 |
| status | VARCHAR(16) | active/exhausted/expired |
| source | VARCHAR(16) | purchase/admin_issue |
| expire_at | DATETIME | |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### member_card_records（次数卡消费记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| user_member_card_id | BIGINT FK | |
| order_id | BIGINT FK | |
| times_used | INT DEFAULT 1 | 本次消耗次数 |
| created_at | DATETIME | |

---

## 10. 消息通知

### notifications（通知记录表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| receiver_type | VARCHAR(16) | user/staff/admin |
| receiver_id | BIGINT | |
| type | VARCHAR(32) | order_status/system/promotion |
| title | VARCHAR(128) | |
| content | TEXT | |
| biz_type | VARCHAR(32) NULL | 关联业务类型 |
| biz_id | BIGINT NULL | 关联业务ID |
| is_read | BOOLEAN DEFAULT FALSE | |
| channel | VARCHAR(16) | in_app/wechat_subscribe/sms |
| send_status | VARCHAR(16) | pending/sent/failed |
| created_at | DATETIME | |

索引：`receiver_type + receiver_id`, `is_read`

---

## 11. 文件管理

### files（文件记录表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| uuid | VARCHAR(36) UNIQUE | |
| uploader_type | VARCHAR(16) | user/staff/admin |
| uploader_id | BIGINT | |
| biz_type | VARCHAR(32) | service/review/ticket/checkin |
| biz_id | BIGINT NULL | |
| filename | VARCHAR(256) | 原始文件名 |
| url | VARCHAR(512) | 访问URL |
| storage_key | VARCHAR(512) | 存储路径 |
| mime_type | VARCHAR(64) | |
| size | BIGINT | 文件大小（字节） |
| created_at | DATETIME | |

---

## 12. 财务与结算

### staff_income_records（员工收入明细）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| staff_id | BIGINT FK | |
| order_id | BIGINT FK | |
| amount | DECIMAL(10,2) | 收入金额 |
| type | VARCHAR(16) | service/bonus/deduction |
| status | VARCHAR(16) | pending/settled/withdrawn |
| settled_at | DATETIME NULL | |
| created_at | DATETIME | |

### withdraw_requests（提现申请表，预留）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| staff_id | BIGINT FK | |
| amount | DECIMAL(10,2) | |
| status | VARCHAR(16) | pending/approved/paid/rejected |
| bank_info | JSON | 银行卡信息 |
| handled_by | BIGINT NULL | |
| handled_at | DATETIME NULL | |
| created_at | DATETIME | |
| updated_at | DATETIME | |

---

## 13. 操作日志

### audit_logs（审计日志表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| operator_type | VARCHAR(16) | admin/system |
| operator_id | BIGINT | |
| action | VARCHAR(64) | 操作类型 |
| module | VARCHAR(32) | 所属模块 |
| target_type | VARCHAR(32) | 操作对象类型 |
| target_id | BIGINT NULL | 操作对象ID |
| detail | JSON | 操作详情 |
| ip | VARCHAR(64) | |
| request_id | VARCHAR(64) | |
| created_at | DATETIME | |

索引：`operator_type + operator_id`, `module`, `created_at`

---

## 14. 收藏（预留）

### service_favorites（服务收藏表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO | |
| user_id | BIGINT FK | |
| service_id | BIGINT FK | |
| created_at | DATETIME | |

唯一索引：`user_id + service_id`


## 扩展预留说明

| 未来需求 | 预留方式 |
|----------|----------|
| 多城市 | users/staff/services/orders 均有 city_code |
| 多门店 | users/staff/orders 均有 store_id |
| 多支付渠道 | payments.channel 字段 |
| 自动派单 | order_assignments.assign_type |
| 企业客户 | users 表可扩展 user_type 字段 |
| 积分等级 | 新增 user_points / user_levels 表 |
| 活动引擎 | 新增 promotions / promotion_rules 表 |
| 多规格服务 | 新增 service_specs 表 |
| 套餐服务 | 新增 service_packages 表 |