# Day 5 DB / 首页联调验证报告

生成时间：2026-05-23

## 1. 验证范围

本次接手验证覆盖两部分：

```txt
1. Claude 按 docs/ui/day4-ui-home-action.md 执行后的首页 UI 改造完成度
2. 当前 day5 数据库接入改动的后端可用性、Prisma 状态、API 冒烟结果
```

重点检查文件：

```txt
miniapp/src/pages/home/index.vue
miniapp/uno.config.ts
rear/src/common/prisma.js
rear/src/common/serialize.js
rear/src/config/env.js
rear/src/services/services.repository.js
rear/src/users/users.repository.js
rear/scripts/seed-db.js
rear/package.json
```

## 2. 总体结论

当前状态可以概括为：

```txt
首页 UI 结构改造：已基本完成
小程序类型检查：通过
小程序 mp-weixin 构建：通过
数据库连接：通过
Prisma schema 校验：通过
Prisma migrate status：通过，数据库 schema 已是最新
后端 API 冒烟：主要接口可访问
真实视觉验收：未完成，需要微信开发者工具人工查看
```

但仍有 4 个需要修复或确认的问题：

```txt
P1：GET /api/services 返回的 Decimal 字段仍是对象结构，不是 number，会影响前端价格展示
P1：npm run prisma:generate 失败，原因是 Windows 下 Prisma query_engine 文件被占用
P2：真实 API 只返回 5 个分类，首页不会展示参考图要求的 15 个分类
P2：miniapp/env/.env 当前已被 Git 跟踪，上传 GitHub 前需要处理
```

## 3. 首页 UI 行动计划完成度

对照 `docs/ui/day4-ui-home-action.md`：

| 步骤 | 状态 | 依据 |
|---|---|---|
| Step 1 静态配置和类型 | 已完成 | `home/index.vue:14` 定义 `HomeCategoryItem`，`home/index.vue:42` 起定义地址、banner、保障、分类、家政通、运营卡、次卡配置 |
| Step 2 数据加载策略 | 已完成 | `home/index.vue:115` 定义 `displayCategories`，接口为空时使用 fallback；热门服务单独处理 |
| Step 3 交互方法 | 已完成 | `home/index.vue:168` 起包含地址、搜索、购物车、分类、banner、运营卡、次卡点击逻辑 |
| Step 4 重写 template | 已完成 | `home/index.vue:209` 起为 sticky 顶部；后续包含 banner、保障、分类、家政通、运营卡、次卡、热门服务 |
| Step 5 图标 safelist | 已完成 | `uno.config.ts:96` 至 `uno.config.ts:107` 已加入首页新增 Carbon 图标 |
| Step 6 type-check | 通过 | `pnpm type-check` 成功 |
| Step 7 build:mp | 通过 | `pnpm build:mp` 成功，产物在 `miniapp/dist/build/mp-weixin` |
| Step 8 微信开发者工具验收 | 未验证 | 本次只做代码和构建验证，未打开微信开发者工具截图验收 |

## 4. 首页验证发现

### 4.1 已达成项

```txt
顶部已改为红色 sticky 地址搜索模块
默认地址为：吉林大学(南岭校区)
搜索、购物车入口已补齐
banner 已补齐日常保洁服务、50 元 / 小时、3小时起约、立即抢购
保障说明、5 列分类宫格、家政通、附近师傅、直选服务、换季热推、优惠次卡均已实现
热门服务列表保留在页面底部
接口失败时不会再导致整个首页主体空白
```

### 4.2 未完全符合参考图的点

```txt
购物车角标当前在 cartCount = 0 时不展示；参考图和行动计划要求显示 0
真实接口返回分类时，displayCategories 只展示接口分类，不会补齐 fallback 到 15 项
当前数据库服务分类只有 5 项，因此联调时首页分类区只会展示 5 个入口
运营图块目前仍是色块占位，不是真实图片素材
sticky 在微信小程序端的实际表现仍需真机或开发者工具确认
```

## 5. 小程序验证命令

已执行：

```bash
cd miniapp
pnpm type-check
pnpm build:mp
```

结果：

```txt
pnpm type-check：通过
pnpm build:mp：通过
VITE_WX_APPID：touristappid
构建产物：miniapp/dist/build/mp-weixin
```

## 6. 后端数据库接入完成度

对照 `docs/plan/day5-db.md`：

| 项目 | 状态 | 说明 |
|---|---|---|
| Prisma Client 单例 | 已完成 | `rear/src/common/prisma.js` 已提供 `getPrisma`、`disconnectPrisma`、`checkDbConnection` |
| DB_MODE 配置 | 已完成 | `rear/src/config/env.js:64` 默认 `prisma` |
| services repository 切换 Prisma | 已完成但有序列化问题 | `rear/src/services/services.repository.js:55` 起已实现 Prisma 查询 |
| users repository 切换 Prisma | 已完成 | `rear/src/users/users.repository.js:77` 起已格式化用户返回 |
| BigInt 处理 | 已完成 | `rear/src/common/serialize.js` 能处理 BigInt |
| Decimal 处理 | 未完全完成 | Prisma Decimal 当前没有被正确转成 number |
| seed-db 脚本 | 已创建，未执行 | 脚本含清表逻辑，本次只做语法检查，未直接执行 |
| package 脚本 | 已完成 | `rear/package.json:10` 起已有 `seed:db`、`prisma:generate`、`prisma:studio` |

## 7. 后端验证命令和结果

### 7.1 非破坏性语法检查

已执行：

```bash
node --check scripts/seed-db.js
node --check src/common/prisma.js
node --check src/services/services.repository.js
node --check src/users/users.repository.js
node --check src/config/env.js
```

结果：

```txt
全部通过
```

### 7.2 Prisma 校验

已执行：

```bash
npx prisma validate
npx prisma migrate status
```

结果：

```txt
Prisma schema validate：通过
MySQL 数据库：life_assistant
连接地址：localhost:3306
迁移数量：1
迁移状态：Database schema is up to date
```

### 7.3 Prisma generate

已执行：

```bash
npm run prisma:generate
```

结果：

```txt
失败
错误：EPERM: operation not permitted, rename query_engine-windows.dll.node.tmp -> query_engine-windows.dll.node
```

判断：

```txt
当前 node_modules/.prisma/client/index.js 存在
当前 query_engine-windows.dll.node 存在
数据库运行和 API 查询可以工作
但 Prisma Client 重新生成流程不稳定，通常是已有 Node/Prisma 进程占用了 query_engine 文件
```

建议：

```txt
关闭正在运行的 rear 服务和可能占用 Prisma 的 Node 进程后，重新执行 npm run prisma:generate
不要在服务运行中强行覆盖 Prisma engine 文件
```

### 7.4 数据库连接检查

已执行：

```bash
node -e "const {checkDbConnection}=require('./src/common/prisma'); checkDbConnection().then(ok=>{console.log('db=' + ok); process.exit(ok?0:1)})"
```

结果：

```txt
db=true
```

### 7.5 JSON fallback 检查

已执行：

```bash
DB_MODE=json repository 读取检查
```

结果：

```txt
json-categories=4
json-services=5
```

说明：

```txt
DB_MODE=json fallback 仍可读本地 JSON 数据
```

### 7.6 Prisma repository 检查

已执行：

```bash
services.repository.findCategories({ status: 1 })
services.repository.findServices({ status: 1, page: 1, pageSize: 3 })
users.repository.findUserByPhone('13800138000')
```

结果：

```txt
prisma-categories=5
prisma-services=3
user-found=true
```

问题：

```txt
basePrice-type=object
basePrice-constructor=i
basePrice-json={"s":1,"e":2,"d":[120]}
rating-type=object
rating-constructor=i
```

结论：

```txt
Prisma Decimal 没有被 serialize 转为 number
前端 Service 类型中 basePrice 是 number，price-text 组件也按 number 处理
该问题需要在正式联调前修复
```

## 8. API 冒烟测试

复用当前已运行的后端进程：

```txt
端口：3000
进程：node src/main.js
```

已验证：

```txt
GET  /api/service-categories
GET  /api/services?page=1&pageSize=3
POST /api/auth/mock-login
```

结果：

```txt
GET /api/service-categories：成功，返回 5 条分类
GET /api/services?page=1&pageSize=3：成功，返回 3 条服务，总数 10
POST /api/auth/mock-login：成功，返回 accessToken 和用户信息
```

主要问题：

```txt
GET /api/services 返回的 basePrice / rating 是 Decimal 对象结构，不是 number
```

## 9. Git 与敏感配置风险

当前 Git 状态：

```txt
根目录已经是 Git 仓库
当前分支：ui-home
远程仓库：https://github.com/ttds13/Life_assistant.git
```

已确认：

```txt
rear/.env 被 rear/.gitignore 忽略
```

风险：

```txt
根目录没有 .gitignore
miniapp/env/.env 当前已被 Git 跟踪
miniapp/env/.env.development / .env.production / .env.test 也在 Git 文件列表中
```

建议：

```txt
上传 GitHub 前先建立根目录 .gitignore
评估 miniapp/env/*.env 是否应该保留在仓库
如果不应上传，需要 git rm --cached miniapp/env/.env miniapp/env/.env.development miniapp/env/.env.production miniapp/env/.env.test
保留 env.example 作为模板
不要把 rear/.env 或数据库密码提交到 GitHub
```

## 10. 未执行项说明

本次没有执行：

```bash
npm run seed:db
```

原因：

```txt
rear/scripts/seed-db.js 内部会 deleteMany 清空服务图片、价格规则、服务、分类等表
这是破坏性操作，验证阶段不应直接执行
```

本次没有完成：

```txt
微信开发者工具中的真实视觉验收
真机滚动 sticky 效果验证
```

## 11. 建议修复顺序

### 1. 修复 Decimal 序列化

优先级：P1

建议修改：

```txt
rear/src/common/serialize.js
```

当前 Decimal 判断依赖 `constructor.name === 'Decimal'`，实际返回的 constructor name 是 `i`，因此未命中。

建议改为：

```js
if (obj && typeof obj === 'object' && typeof obj.toNumber === 'function') {
  return obj.toNumber()
}
```

修复后重新验证：

```bash
GET /api/services?page=1&pageSize=3
```

验收：

```txt
basePrice: 120
rating: 5
```

### 2. 处理 Prisma generate 文件占用

优先级：P1

建议：

```txt
停止当前 rear 服务
确认没有占用 rear/node_modules/.prisma/client/query_engine-windows.dll.node 的 Node 进程
重新执行 npm run prisma:generate
```

### 3. 决定首页分类数量策略

优先级：P2

当前真实数据库只有 5 个分类。若需要首页严格贴近参考图 15 项，有两个方案：

```txt
方案 A：数据库 seed 补齐 15 个分类
方案 B：前端 displayCategories 使用接口分类 + fallback 分类补齐到 15 项
```

推荐：

```txt
短期用方案 B 保证 UI 还原度
中期用方案 A 保证数据真实
```

### 4. 修正购物车 0 角标显示

优先级：P2

当前：

```txt
cartCount > 0 时才展示角标
```

如果要严格对齐参考图，应改为：

```txt
始终显示角标，0 时展示 0
```

### 5. 上传 GitHub 前整理忽略规则

优先级：P1

建议新增根目录 `.gitignore`，至少包含：

```txt
node_modules/
dist/
build/
*.log
.env
.env.*
!.env.example
rear/data/*.json
rear/src/generated/
miniapp/src/pages.json
miniapp/src/manifest.json
miniapp/src/types/
```

同时处理已跟踪的 env 文件。

## 12. 当前可交付状态

可以继续推进的部分：

```txt
小程序首页 UI 已经可以导入 dist/build/mp-weixin 查看
后端 MySQL 已可连接
服务分类、服务列表、mock-login API 已可访问
```

不建议直接上线或提交前必须处理：

```txt
Decimal 序列化问题
Prisma generate 文件占用问题
Git 环境文件跟踪问题
首页 15 分类展示策略
微信开发者工具视觉验收
```
