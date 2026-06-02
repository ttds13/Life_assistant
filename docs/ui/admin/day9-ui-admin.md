# Day 9 后台管理系统 UI 拆分与拼接计划

## 1. 目标

本计划用于指导 `admin` 开源后台项目拆分、裁剪，并拼接成生活助手后端管理系统 UI。

参考图：

```txt
docs/ui/admin/admin.png
```

参考图的核心结构：

```txt
深色左侧菜单
顶部工具栏
多标签页
卡片式数据看板
快捷入口宫格
图表面板
```

当前已引入的开源项目：

```txt
admin/
来源：https://github.com/youlaitech/vue3-element-admin
技术栈：Vue 3 + Vite + TypeScript + Element Plus + Pinia + Vue Router
```

本阶段目标：

```txt
保留后台模板的登录、布局、菜单、权限、请求、状态管理和基础组件能力
删除或暂缓模板中与生活助手无关的演示、代码生成、多租户和文档类模块
按生活助手业务重建后台菜单、看板和页面骨架
先使用 mock 数据完成 UI 拼接，后续再逐步接入 server 真实接口
```

## 2. 当前项目业务依据

后端 `server` 目前已经具备或预留的业务模型：

```txt
User / 用户
Staff / 师傅
AdminUser / 管理员
Role / 角色
ServiceCategory / 服务分类
Service / 服务
Order / 订单
Payment / 支付
Refund / 退款
Review / 评价
Ticket / 售后工单
Coupon / 优惠券
MemberCard / 会员卡
Notification / 通知
File / 文件
StaffIncomeRecord / 师傅收入
WithdrawRequest / 提现申请
AuditLog / 审计日志
```

后端已存在的接口方向：

```txt
auth
users
addresses
services
orders
payments
admin/orders
staff/orders
```

小程序端当前已有：

```txt
用户端：首页、服务、下单、订单、地址、支付、我的
师傅端：首页、订单管理、录入订单、订单详情、上传照片、个人中心
```

因此后台 UI 第一版应优先围绕：

```txt
看板
用户管理
服务管理
订单管理
师傅管理
支付/退款
评价/售后
系统权限
```

## 3. 开源项目模块盘点

| 模块/路径 | 当前内容 | 处理建议 | 原因 |
|---|---|---|---|
| `src/layouts` | 侧边栏、顶部栏、标签页、布局模式 | 保留并改造 | 和参考图结构一致，是后台主框架 |
| `src/views/login` | 登录页、验证码、租户提示 | 保留并简化 | 需要后台登录；移除多租户文案 |
| `src/router` | 静态路由、动态路由、路由守卫 | 保留并改造 | 需要权限菜单、登录拦截和页面跳转 |
| `src/stores/user` | 用户信息、token、权限 | 保留并对接 | 后续接入管理员登录和 RBAC |
| `src/stores/permission` | 动态菜单和路由 | 保留并改造 | 生活助手后台需要按角色控制菜单 |
| `src/stores/tags-view` | 多标签页 | 保留 | 参考图包含标签页 |
| `src/stores/tenant` | 多租户上下文 | 删除或暂缓 | 生活助手当前不是 SaaS 多租户后台 |
| `src/views/dashboard` | 默认首页看板 | 保留并重做 | 改为用户量、订单量、订单金额、平台收益等业务卡片 |
| `src/views/profile` | 个人中心、通知 | 保留简化 | 后台管理员个人资料和通知可复用 |
| `src/views/system/user` | 系统用户管理 | 改造 | 可改成后台管理员或平台用户管理 |
| `src/views/system/role` | 角色管理 | 保留 | 后台权限管理需要 |
| `src/views/system/menu` | 菜单/权限管理 | 保留 | 后续维护 RBAC 菜单和按钮权限 |
| `src/views/system/dict` | 字典管理 | 保留 | 订单状态、支付状态、服务状态等适合字典化 |
| `src/views/system/log` | 操作日志 | 保留并后接 `AuditLog` | 后台管理必须留审计能力 |
| `src/views/system/notice` | 通知公告 | 改造 | 可作为平台公告、系统通知管理 |
| `src/views/system/config` | 参数配置 | 暂缓 | 可后续做服务配置、支付配置、派单配置 |
| `src/views/system/dept` | 部门管理 | 暂缓或删除 | 当前业务没有组织部门模型 |
| `src/views/system/tenant` | 租户管理 | 删除或暂缓 | 当前不做多租户，不应出现在第一版菜单 |
| `src/api/system/tenant*` | 租户接口 | 删除或暂缓 | 与第一版业务无关 |
| `src/components/Upload` | 上传组件 | 保留 | 服务图片、师傅证件、工单图片会用到 |
| `src/components/ECharts` | 图表组件 | 保留 | 看板趋势图需要 |
| `src/components/DictSelect/DictTag` | 字典选择和标签 | 保留 | 订单、支付、师傅状态展示需要 |
| `src/components/CURD` | 通用表格表单封装 | 谨慎保留 | 可提高列表页效率，但不要强行套所有业务 |
| `src/components/WangEditor` | 富文本编辑 | 暂缓 | 第一版不做内容管理详情页时可不使用 |
| `src/components/TableSelect` | 表格选择器 | 保留备用 | 订单派单选择师傅时可能用到 |
| `src/views/codegen` | 代码生成器 | 删除或暂缓 | 不是业务后台功能，第一版不需要 |
| `src/api/codegen` | 代码生成接口 | 删除或暂缓 | 同上 |
| `src/views/demo` | 组件演示、功能演示、路由演示 | 删除 | 会干扰真实后台菜单和体积 |
| `mock/menu.mock.ts` | 当前模板完整菜单 | 重写 | 需要替换成生活助手业务菜单 |
| `mock/user/role/menu/dept/dict/log/notice` | 系统管理 mock | 保留并改造 | 第一阶段继续用 mock 完成 UI |
| `mock/tenant*.mock.ts` | 租户 mock | 删除或暂缓 | 第一版不使用 |

## 4. 第一版后台目标菜单

建议菜单结构：

```txt
主控台
  数据看板

用户管理
  用户列表
  地址管理

服务管理
  服务分类
  服务项目
  价格规则

订单管理
  订单列表
  待派单
  服务履约记录

师傅管理
  师傅列表
  认证审核
  工作状态

财务管理
  支付记录
  退款管理
  师傅收入
  提现审核

评价与售后
  用户评价
  售后工单

营销管理
  优惠券
  会员卡
  Banner/广告位

系统管理
  管理员
  角色管理
  菜单/权限管理
  字典管理
  操作日志
  系统配置
```

第一阶段优先显示：

```txt
主控台
用户管理
服务管理
订单管理
师傅管理
财务管理
系统管理
```

第二阶段再补：

```txt
评价与售后
营销管理
通知公告
文件管理
```

## 5. 页面规划

### 5.1 主控台

路径建议：

```txt
admin/src/views/dashboard/index.vue
```

展示内容：

```txt
用户量
订单量
订单金额
平台订单收益
平台手续费收益
快捷入口：用户、服务、师傅、订单、财务、配置
订单金额趋势图
订单状态分布
待处理事项：待派单、待退款、待审核师傅、待处理工单
```

样式要求：

```txt
保持参考图的卡片式拼接
左侧深色菜单
内容区浅灰背景
数据卡片白底、低圆角、轻边框
图标色可以延续参考图的蓝、绿、橙、紫、粉等多色点缀
```

### 5.2 用户管理

建议路径：

```txt
admin/src/views/life/users/index.vue
admin/src/views/life/users/address.vue
admin/src/api/life/users.ts
```

功能：

```txt
用户列表
手机号/昵称/状态筛选
查看用户详情
查看用户地址
查看用户订单
启用/禁用用户
```

数据来源：

```txt
后续对接 User、UserAddress
第一版先 mock
```

### 5.3 服务管理

建议路径：

```txt
admin/src/views/life/services/category.vue
admin/src/views/life/services/index.vue
admin/src/views/life/services/price-rule.vue
admin/src/api/life/services.ts
```

功能：

```txt
服务分类列表
服务项目列表
服务新增/编辑
服务上下架
服务封面和详情图上传
价格、单位、时长、服务区域维护
```

数据来源：

```txt
ServiceCategory
Service
ServiceImage
ServicePriceRule
```

### 5.4 订单管理

建议路径：

```txt
admin/src/views/life/orders/index.vue
admin/src/views/life/orders/detail.vue
admin/src/views/life/orders/dispatch.vue
admin/src/views/life/orders/fulfillment.vue
admin/src/api/life/orders.ts
```

功能：

```txt
订单列表
状态筛选
订单详情
订单时间线
订单金额明细
手动派单
查看师傅履约打卡
查看服务照片
管理员备注
```

数据来源：

```txt
已存在 GET /admin/orders
已存在 GET /admin/orders/:id
已存在 POST /admin/orders/:id/assign
后续补充履约记录和照片管理接口
```

### 5.5 师傅管理

建议路径：

```txt
admin/src/views/life/staff/index.vue
admin/src/views/life/staff/audit.vue
admin/src/views/life/staff/detail.vue
admin/src/views/life/staff/income.vue
admin/src/api/life/staff.ts
```

功能：

```txt
师傅列表
认证信息
技能标签
服务城市
接单状态
评分和完成订单数
启用/禁用
查看师傅订单
查看收入记录
```

数据来源：

```txt
Staff
Order
StaffIncomeRecord
WithdrawRequest
Review
```

### 5.6 财务管理

建议路径：

```txt
admin/src/views/life/finance/payments.vue
admin/src/views/life/finance/refunds.vue
admin/src/views/life/finance/settlements.vue
admin/src/views/life/finance/withdraws.vue
admin/src/api/life/finance.ts
```

功能：

```txt
支付记录
退款记录
师傅收入记录
提现审核
平台收入统计
```

数据来源：

```txt
Payment
Refund
PaymentNotifyLog
StaffIncomeRecord
WithdrawRequest
```

### 5.7 评价与售后

建议路径：

```txt
admin/src/views/life/after-sales/reviews.vue
admin/src/views/life/after-sales/tickets.vue
admin/src/api/life/after-sales.ts
```

功能：

```txt
评价列表
评价审核/隐藏
售后工单列表
工单详情
处理记录
```

第一版可以只放菜单占位，第二阶段再实现。

### 5.8 营销管理

建议路径：

```txt
admin/src/views/life/marketing/coupons.vue
admin/src/views/life/marketing/member-cards.vue
admin/src/views/life/marketing/banners.vue
admin/src/api/life/marketing.ts
```

功能：

```txt
优惠券
会员卡
首页 Banner/广告位
```

第一版可以暂缓，不进入首批开发。

## 6. 需要删除或暂缓的模块

第一批从菜单中移除：

```txt
系统工具 / 代码生成
接口文档
平台文档
多级菜单
组件封装
功能演示
路由参数演示
租户管理
租户套餐
部门管理
```

第一批不建议直接物理删除所有文件。建议先：

```txt
重写 mock/menu.mock.ts，让菜单只显示生活助手业务
隐藏未使用路由入口
确认构建通过后，再按依赖关系删除 views/demo、views/codegen、tenant 相关文件
```

后续可物理删除的路径：

```txt
admin/src/views/demo
admin/src/views/codegen
admin/src/views/system/tenant
admin/src/api/codegen
admin/src/api/system/tenant
admin/src/api/system/tenant-plan
admin/mock/tenant.mock.ts
admin/mock/tenant-plan.mock.ts
admin/src/stores/tenant.ts
admin/src/utils/tenant.ts
```

删除前必须检查：

```txt
router guard 是否还 import tenant store/util
login 页面是否还展示多租户文案
menu 页面是否还使用租户范围字段
package.json 里 codegen/demo 专用依赖是否还能移除
```

## 7. 文件级拆分与拼接计划

### Step 1：固定后台基础壳

保留：

```txt
admin/src/layouts
admin/src/router
admin/src/stores/app.ts
admin/src/stores/user.ts
admin/src/stores/permission.ts
admin/src/stores/tags-view.ts
admin/src/utils/request.ts
admin/src/plugins
admin/src/styles
```

调整：

```txt
admin/.env.development
admin/src/settings.ts
admin/src/views/login/index.vue
```

目标：

```txt
项目名称统一为“生活助手后台管理”
登录页去掉多租户描述
保留 mock 登录能力，方便 UI 阶段开发
```

### Step 2：重写菜单树

重点文件：

```txt
admin/mock/menu.mock.ts
```

目标：

```txt
将模板菜单替换为生活助手菜单
只保留主控台、用户管理、服务管理、订单管理、师傅管理、财务管理、系统管理
确保菜单图标、路由 path、component 字段和后续页面路径一致
```

### Step 3：重做主控台

重点文件：

```txt
admin/src/views/dashboard/index.vue
admin/src/api/life/dashboard.ts
admin/mock/dashboard.mock.ts
```

目标：

```txt
按 admin.png 做卡片式看板
使用 ECharts 展示订单金额趋势
快捷入口跳转到业务菜单
```

### Step 4：新增生活助手业务目录

建议新增：

```txt
admin/src/views/life/users
admin/src/views/life/services
admin/src/views/life/orders
admin/src/views/life/staff
admin/src/views/life/finance
admin/src/views/life/after-sales
admin/src/views/life/marketing
admin/src/api/life
admin/mock/life
```

目录原则：

```txt
生活助手业务页面统一放在 views/life 下
不要混进 views/system，避免业务和系统权限混乱
业务 API 统一放在 api/life 下
mock 数据按业务模块拆分，避免继续堆在 menu.mock.ts
```

### Step 5：先实现高频业务页面

第一批页面：

```txt
主控台
用户列表
服务分类
服务项目
订单列表
订单详情
订单派单
师傅列表
支付记录
退款记录
管理员/角色/菜单/字典/日志
```

第二批页面：

```txt
师傅认证审核
师傅收入
提现审核
评价列表
售后工单
优惠券
会员卡
Banner/广告位
系统配置
```

### Step 6：逐步对接真实接口

优先接口：

```txt
GET /admin/orders
GET /admin/orders/:id
POST /admin/orders/:id/assign
GET /services
GET /service-categories
GET /auth/me
```

需要后端补充的后台接口：

```txt
POST /admin/auth/login
GET /admin/dashboard/summary
GET /admin/users
GET /admin/users/:id
GET /admin/services
POST /admin/services
PUT /admin/services/:id
GET /admin/staff
GET /admin/staff/:id
PUT /admin/staff/:id/status
GET /admin/payments
GET /admin/refunds
GET /admin/reviews
GET /admin/tickets
GET /admin/audit-logs
```

## 8. 视觉与交互规范

整体风格：

```txt
使用 admin.png 的后台工作台风格
深色侧边栏
浅灰内容背景
白色卡片拼接
顶部工具栏保持简洁
标签页保留
表格页强调查询、筛选、批量操作和状态标签
```

配色建议：

```txt
侧边栏背景：#001529 或当前模板深色变量
主色：Element Plus 蓝色或生活助手红色少量点缀
内容背景：#F5F7FA
卡片背景：#FFFFFF
边框：#E5E7EB
成功：#16A34A
警告：#F59E0B
错误：#EF4444
```

卡片要求：

```txt
低圆角，不做大面积营销式视觉
数据卡片保持统一高度
快捷入口使用图标 + 文案
图表容器使用白色卡片
移动端不是后台第一优先级，但窄屏不能明显错位
```

列表页要求：

```txt
顶部查询区
中间操作区
主体表格
底部分页
状态使用 tag
金额右对齐
时间格式统一
危险操作二次确认
```

## 9. 实施顺序

### Phase 0：保持可运行

```txt
确认 admin 可启动
确认 mock 登录可用
确认 build-only 通过
确认页面标题为生活助手后台管理
```

验收：

```txt
http://localhost:3000 可打开
admin / 123456 可登录
主布局、侧边栏、顶部栏、标签页正常
```

### Phase 1：菜单裁剪

```txt
重写 mock/menu.mock.ts
隐藏 demo、codegen、tenant、docs 菜单
保留 dashboard 和 system 基础菜单
```

验收：

```txt
登录后只看到生活助手业务菜单
无模板演示入口
刷新页面不 404
```

### Phase 2：主控台重做

```txt
按 admin.png 做数据卡片
添加快捷入口
添加订单趋势图
添加待处理事项
```

验收：

```txt
视觉结构接近参考图
卡片、入口、图表能在桌面宽度正常排列
mock 数据可展示
```

### Phase 3：核心业务列表

```txt
用户列表
服务分类和服务项目
订单列表和订单详情
师傅列表
支付和退款列表
```

验收：

```txt
每个页面有查询区、表格、分页、状态标签
订单详情有时间线、金额明细、服务信息、用户地址、师傅信息
派单流程有选择师傅的交互占位
```

### Phase 4：系统权限保留改造

```txt
管理员
角色管理
菜单/权限管理
字典管理
操作日志
```

验收：

```txt
系统管理菜单可正常进入
权限点命名从模板 sys:* 逐步改为 life:* / admin:*
字典覆盖订单、支付、师傅、服务状态
```

### Phase 5：删除无关源码和依赖

```txt
确认业务页面稳定后再物理删除 demo/codegen/tenant 文件
检查 import
检查路由
检查 package 依赖
执行构建
```

验收：

```txt
pnpm run build-only 通过
菜单无死链
控制台无缺失组件报错
```

## 10. 权限命名建议

建议权限码：

```txt
dashboard:view

user:list
user:detail
user:disable

service:category:list
service:category:create
service:category:update
service:list
service:create
service:update
service:disable

order:list
order:detail
order:assign
order:remark

staff:list
staff:detail
staff:audit
staff:disable

finance:payment:list
finance:refund:list
finance:withdraw:audit

review:list
review:audit
ticket:list
ticket:handle

system:admin:list
system:role:list
system:menu:list
system:dict:list
system:log:list
```

## 11. 风险与注意事项

```txt
模板当前菜单由 mock/menu.mock.ts 动态返回，不能只改 router/index.ts
tenant 相关代码分散在 router guard、store、login、menu 页面，不能一次性粗暴删除
codegen 和 demo 依赖了部分第三方包，删除页面后再判断依赖是否移除
系统管理 user 页面和生活助手用户管理不是同一个概念，命名要区分“管理员”和“平台用户”
订单派单需要后端 Staff 列表接口，否则只能先做 mock 选择师傅
后端当前 admin auth 还不完整，UI 阶段需要继续使用 mock 登录
```

## 12. 本阶段不做

```txt
不做多租户 SaaS 后台
不做代码生成器
不做组件演示平台
不做外链文档入口
不做完整营销中心
不做复杂财务结算规则
不做完整客服 IM
不做生产级管理员登录鉴权改造
```

## 13. 最终交付物

Day 9 后台 UI 完成后，应具备：

```txt
1 套生活助手后台主框架
1 个数据主控台
1 套生活助手业务菜单
用户、服务、订单、师傅、财务、系统管理的核心页面
订单详情和派单交互
mock 数据闭环
后续可平滑接入 server 的 API 文件结构
构建通过
```

