# Day48 订单地址系统测试报告

测试日期：2026-07-14  
测试范围：地址簿版本化、订单地址强关联、存量迁移、用户/Admin 改址、师傅可见与通知、地图地址契约、三端构建  
结论：代码、自动化验证、生产数据库迁移、后端/Admin 部署均已完成；微信真机验收待执行。

## 1. 数据库迁移验证

使用独立 MySQL 8.4 临时容器，未修改当前开发库或正式库。

1. 旧库夹具包含 3 个上门订单、1 个会员卡购买订单、地图坐标地址、手动无坐标地址和 1 个跨用户来源地址引用。
2. 迁移前审计准确报告跨用户引用订单 `13`，不输出联系人、电话、详细地址或坐标。
3. 最终迁移成功创建四类关系/历史模型并删除 `orders.address_snapshot`。
4. 迁移后 44 项审计全部通过：一单一地址、非上门订单无地址、来源归属、坐标、版本链、当前快照匹配、旧字段删除均无异常。
5. 错误来源地址未保留外键，但订单自身的履约地址字段完整保留。
6. 从空库执行仓库全部 23 个 Prisma migrations 成功。

数据库约束验证结果：

| 场景 | 结果 |
| --- | --- |
| 地址簿单边坐标 | 被 `addresses_coordinate_pair_check` 拒绝 |
| 订单地址单边坐标 | 被 `order_addresses_coordinate_pair_check` 拒绝 |
| 同一订单写第二个 OrderAddress | 被唯一索引拒绝 |
| 同一订单地址写重复 revision 版本 | 被唯一索引拒绝 |
| 物理删除来源 Address | `sourceAddressId` 置空，订单地址和 revision 保留 |
| 删除 Order | OrderAddress 和 OrderAddressRevision 级联删除 |

当前开发库只读迁移前审计结果：2 个上门订单，0 个失败检查。

## 2. Runtime Smoke

`day48-order-address-smoke.ts` 在完整迁移后的临时库通过，覆盖：

1. Admin 创建订单时生成 OrderAddress v1 和初始 revision。
2. 用户在允许状态将地址改为 v2。
3. Admin 在已接单状态将地址改为 v3。
4. revision 版本为 `3, 2, 1`，Admin 历史查询正确。
5. 已分配师傅收到 `order_address_updated` 通知。
6. 师傅详情读取与 Admin 相同的 OrderAddress id/version/地址内容。
7. 后续修改来源地址簿不会改变订单履约地址。
8. 已接单后用户改址返回 409。

现有 `day43-dual-channel-smoke.ts` 也在完整迁移后的临时库通过，会员卡购买订单不会创建占位地址。

## 3. 静态检查与构建

| 检查 | 结果 |
| --- | --- |
| `pnpm exec prisma validate` | 通过 |
| `pnpm exec prisma generate` | 通过，标准本地引擎模式 |
| `server: pnpm exec tsc --noEmit` | 通过 |
| `server: pnpm run build` | 通过 |
| `miniapp: pnpm run type-check` | 通过 |
| `miniapp: pnpm run build:mp` | 通过 |
| `admin: pnpm run type-check` | 通过 |
| `admin: pnpm run build` | 通过 |
| `git diff --check` | 通过，仅有仓库 LF/CRLF 提示 |

## 4. 生产发布记录

发布时间：2026-07-14 19:22-19:27（Asia/Shanghai）  
服务器：`47.113.201.201`，容器：`life_assistant_server`

1. 在停止后端写入后创建了全库 SQL 备份与 `orders.id/order_type/address_snapshot` 备份，目录为 `/www/wwwroot/life-assistant/backups/day48-20260714-192234/`，并生成 SHA-256 校验文件。
2. 生产迁移前审计通过：4 个上门订单，0 个失败检查。
3. `20260714170000_order_address_system` 已成功应用，`prisma migrate status` 返回数据库已是最新状态。
4. 生产迁移后 44 项审计全部通过：4 个上门订单均有 OrderAddress 与连续 revision，旧 `address_snapshot` 已删除。
5. 新后端镜像已启动，容器镜像 ID 为 `sha256:2f6c14316fd867eab8d8ea529e08c44a51209ad5b12c21422587f5e5cd11bc27`。
6. Admin 静态目录已原子替换，旧版本已备份为 `admin-dist.before-day48-20260714`。
7. 公网 `https://www.xunhaoyou.com/api/health` 与 `https://www.xunhaoyou.com/admin/` 均返回 HTTP 200；`/api/maps/reverse-geocode` 缺少必填坐标时返回预期的 HTTP 400。

生产验证未创建测试订单或改写真实业务数据。

## 5. 剩余项

1. 使用微信开发者工具、Android 和 iOS 体验版验证自动定位、地图选址、授权拒绝后的手动兜底和地图导航。
2. 在首个真实改址订单中观察师傅通知、Admin 历史记录和导航坐标。

本次迁移已永久删除生产库的 `orders.address_snapshot`；回滚需要使用服务器备份目录中的 SQL 备份，并恢复旧镜像与 Admin 目录。
