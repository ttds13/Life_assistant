# 生活助手数据库设计

## 当前状态

- **数据库**: MySQL 8.4 (本地 localhost:3306，数据库名 life_assistant)
- **ORM**: Prisma 7.8
- **可视化**: Prisma Studio (npx prisma studio)
- **迁移文件**: rear/prisma/migrations/

## 已完成

1. MySQL 数据库 life_assistant 已创建（utf8mb4 编码）
2. Prisma Schema 已写入 rear/prisma/schema.prisma，包含 30 张表
3. 数据库迁移已执行，所有表已建到 MySQL 中
4. Prisma Studio 可视化管理（npx prisma studio）

## 表结构概览

| 模块 | 表数量 | 表名 |
|------|--------|------|
| 用户认证 | 5 | users, staff, admin_users, roles, login_logs |
| 服务管理 | 4 | service_categories, services, service_price_rules, service_images |
| 用户地址 | 1 | user_addresses |
| 订单 | 3 | orders, order_status_logs, order_assignments |
| 支付 | 3 | payments, payment_notify_logs, refunds |
| 服务履约 | 2 | service_checkins, service_photos |
| 评价售后 | 4 | reviews, review_images, tickets, ticket_messages |
| 优惠券 | 2 | coupons, user_coupons |
| 会员卡 | 3 | member_cards, user_member_cards, member_card_records |
| 通知 | 1 | notifications |
| 文件 | 1 | files |
| 财务 | 2 | staff_income_records, withdraw_requests |
| 日志 | 1 | audit_logs |
| 收藏 | 1 | service_favorites |

## 迁移到阿里云

后续上云时只需：
1. 在阿里云 RDS 创建 MySQL 实例
2. 修改 rear/.env 中的 DATABASE_URL 指向云端地址
3. 执行 npx prisma migrate deploy

表结构完全一致，零改动迁移。

## 设计原则

- 所有表使用 id 自增主键 + uuid 业务标识
- 所有表包含 created_at、updated_at
- 支持软删除的表包含 deleted_at
- 金额字段使用 DECIMAL(10,2)，单位为元
- 状态字段使用 SMALLINT，配合常量枚举
- 预留 city_code、store_id 支持多城市多门店扩展
- 关键业务保存快照（价格快照、地址快照、服务快照）

## 订单状态枚举

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

## 常用命令

```bash
npx prisma validate        # 验证 schema
npx prisma migrate dev     # 开发环境迁移
npx prisma migrate deploy  # 生产环境迁移
npx prisma studio          # 启动可视化管理
npx prisma generate        # 生成 Prisma Client
```

## 扩展预留

| 未来需求 | 预留方式 |
|----------|----------|
| 多城市 | users/staff/services/orders 均有 city_code |
| 多门店 | users/staff/orders 均有 store_id |
| 多支付渠道 | payments.channel 字段 |
| 自动派单 | order_assignments.assign_type |
| 企业客户 | users 表可扩展 user_type 字段 |
| 积分等级 | 新增 user_points / user_levels 表 |