# Day 4 师傅端 UI 行动计划

## 1. 目标

本文件是 `docs/ui/day4-ui.md` 的师傅端细化执行版。后续实现师傅端时优先按本文件行动。

目标是在保留当前小程序布局风格和配色风格的基础上，补齐师傅端履约 UI：

```txt
新增师傅工作台
新增师傅任务列表
新增师傅任务详情
新增上传服务照片页
新增师傅端任务卡片和履约相关组件
预留接单、拒单、打卡、开始服务、上传照片、完成服务动作
用占位符承接后续需要补充的接口、定位、电话、照片和业务规则
```

本计划只做师傅端，不做用户端、不做服务商端、不做后台端。

## 2. 不在本次范围内

```txt
用户端预约下单
用户端地址管理
用户端订单列表和订单详情
服务商端工作台
服务商端师傅管理
服务商端分佣和结算
后台人工派单
真实定位打卡
真实地图导航联调
真实隐私号码
真实照片上传到对象存储
收入提现
银行卡绑定
学习中心
实名认证完整审核流
```

这些能力后续单独规划。当前只做师傅端 UI、交互状态和接口占位。

## 3. 当前项目现状

当前 `miniapp` 没有师傅端页面和师傅端组件：

```txt
src/pages/staff/                       不存在
src/components/staff-task-card/         不存在
src/components/upload-image-grid/       不存在
src/api/staff.ts                        不存在
src/api/types/staff.ts                  不存在
```

当前已有可复用基础：

```txt
src/components/empty-state/
src/components/loading-state/
src/components/price-text/
src/style/index.scss
src/uni.scss
src/store/token.ts
src/store/user.ts
```

需要补齐：

```txt
师傅端入口策略
师傅工作台页面
师傅任务列表页面
师傅任务详情页面
上传服务照片页面
师傅任务卡片
履约操作底部栏
任务状态标签
照片上传网格
师傅端 API 和类型预留
```

## 4. 保留的视觉风格

师傅端仍使用当前项目视觉系统，不能另起一套风格。

```txt
页面背景：#F5F7FA
卡片背景：#FFFFFF
主色：#1677FF
主色浅背景：#EAF3FF
成功：#16A34A
警告：#F59E0B
错误：#EF4444
正文：#1F2937
次要文字：#6B7280
弱文字：#9CA3AF
边框：#E5E7EB
```

布局规范：

```txt
页面左右边距：32rpx
卡片圆角：16rpx
卡片内边距：28rpx 或 32rpx
模块间距：24rpx
主按钮高度：88rpx
底部操作栏固定底部并适配 pb-safe
任务卡片强调时间、地址和下一步动作
```

师傅端比用户端更偏操作效率，不做复杂营销模块，不做大图装饰。

## 5. 师傅端入口策略

第一版师傅端仍放在同一个 `miniapp` 内，不单独建应用。

建议入口：

```txt
我的 -> 师傅工作台
```

入口显示规则：

```txt
未登录：不显示师傅入口，或点击后跳转登录
普通用户：不显示师傅入口
师傅角色：显示“师傅工作台”
服务商角色：后续服务商计划处理，本计划不展开
```

如果当前角色接口未完成，可先用占位判断：

```txt
userStore.userInfo.role === 'staff'
```

占位角色值：

```txt
user       普通用户
staff      师傅
provider   服务商，后续预留
```

## 6. 师傅端主流程

本次师傅端主流程：

```txt
我的
-> 师傅工作台
-> 待接单任务
-> 任务详情
-> 接单
-> 上门打卡
-> 开始服务
-> 上传服务照片
-> 完成服务
-> 历史任务
```

异常流程：

```txt
待接单任务 -> 拒单
进行中任务 -> 查看详情
服务中任务 -> 补充上传照片
完成服务前 -> 照片不足提示
接口失败 -> Toast 提示并保持当前状态
```

## 7. 占位符规则

### 7.1 文案占位符

```txt
{{STAFF_WORK_RULE_PLACEHOLDER}}        师傅工作规则待补充
{{CHECKIN_RULE_PLACEHOLDER}}           打卡规则待补充
{{PHOTO_REQUIREMENT_PLACEHOLDER}}      服务照片要求待补充
{{REJECT_REASON_RULE_PLACEHOLDER}}     拒单原因规则待补充
{{COMPLETE_RULE_PLACEHOLDER}}          完成服务规则待补充
{{INCOME_RULE_PLACEHOLDER}}            收入结算规则待补充
{{PRIVACY_PHONE_RULE_PLACEHOLDER}}     隐私号码规则待补充
```

### 7.2 数据占位符

```txt
STAFF_AVATAR_PLACEHOLDER               师傅头像占位
TASK_DISTANCE_PLACEHOLDER              距离数据待定位能力补充
TASK_NAVIGATION_PLACEHOLDER            导航能力待地图能力补充
CHECKIN_LOCATION_PLACEHOLDER           打卡经纬度待补充
SERVICE_PHOTO_PLACEHOLDER              服务照片占位
```

### 7.3 接口占位符

```txt
GET  /staff/dashboard                  师傅工作台概览
GET  /staff/orders                     师傅任务列表
GET  /staff/orders/:id                 师傅任务详情
POST /staff/orders/:id/accept          接单
POST /staff/orders/:id/reject          拒单
POST /staff/orders/:id/checkin         上门打卡
POST /staff/orders/:id/start-service   开始服务
POST /staff/orders/:id/photos          上传服务照片
POST /staff/orders/:id/complete        完成服务
GET  /staff/income-records             收入明细，后续预留
```

如果接口未完成，页面先用 mock 数据，但类型、函数名和路径按正式设计预留。

## 8. 需要新增的师傅端页面

### 8.1 师傅工作台

新增文件：

```txt
miniapp/src/pages/staff/dashboard.vue
```

页面目标：让师傅快速判断今天要处理的任务。

页面布局：

```txt
页面根容器
  min-h-screen bg-[#F5F7FA] pb-[120rpx]

顶部身份卡片
  师傅头像 / 占位
  师傅姓名
  今日状态
  消息入口占位

数据概览卡片
  今日任务
  待接单
  进行中
  今日预计收入

快捷入口卡片
  待接单
  进行中
  历史任务
  收入明细占位

今日任务
  最近待处理任务卡片
  无任务空状态
```

状态：

```txt
loading
error
dashboardData
todayTasks
```

占位数据：

```txt
todayTaskCount: 3
pendingCount: 1
processingCount: 2
todayEstimatedIncome: 260
```

交互：

```txt
点击待接单 -> /pages/staff/orders?status=pending_accept
点击进行中 -> /pages/staff/orders?status=processing
点击历史任务 -> /pages/staff/orders?status=completed
点击任务卡片 -> /pages/staff/order-detail?id={id}
收入明细 -> Toast“收入明细待完善”
消息入口 -> Toast“消息功能待完善”
```

### 8.2 师傅任务列表

新增文件：

```txt
miniapp/src/pages/staff/orders.vue
```

页面目标：按任务状态快速处理订单。

页面布局：

```txt
页面根容器
  min-h-screen bg-[#F5F7FA]

顶部状态筛选
  待接单
  进行中
  已完成

任务卡片列表
  任务状态
  服务名称
  预约时间
  服务地址
  距离占位
  用户备注摘要
  主操作按钮
  次操作按钮

空状态 / 加载状态 / 错误状态
```

筛选状态：

```txt
pending_accept      待接单
processing          进行中
completed           已完成
```

卡片按钮规则：

```txt
pending_accept:
  次按钮：拒单
  主按钮：接单

accepted:
  主按钮：上门打卡

on_the_way:
  主按钮：开始服务

in_service:
  次按钮：上传照片
  主按钮：完成服务

completed:
  主按钮：查看详情
```

点击卡片：

```txt
跳转 /pages/staff/order-detail?id={task.id}
```

### 8.3 师傅任务详情

新增文件：

```txt
miniapp/src/pages/staff/order-detail.vue
```

页面目标：让师傅完成单个任务的履约动作。

页面布局：

```txt
页面根容器
  min-h-screen bg-[#F5F7FA] pb-[160rpx]

顶部状态区
  当前任务状态
  下一步动作提示
  预约倒计时占位

服务信息卡片
  服务名称
  服务规格
  服务要求

预约信息卡片
  预约时间
  用户姓名
  用户电话
  服务地址
  导航按钮占位
  电话按钮

用户备注卡片
  用户备注
  无备注时显示“用户暂无备注”

平台提示卡片
  {{STAFF_WORK_RULE_PLACEHOLDER}}

履约记录卡片
  接单时间
  打卡时间
  开始服务时间
  完成时间

服务照片卡片
  已上传照片
  上传入口
  无照片占位

底部操作栏
  按任务状态展示操作
```

底部操作规则：

```txt
pending_accept:
  次按钮：拒单
  主按钮：接单

accepted:
  主按钮：上门打卡

on_the_way:
  主按钮：开始服务

in_service:
  次按钮：上传照片
  主按钮：完成服务

completed:
  主按钮：返回列表
```

二次确认规则：

```txt
拒单：必须二次确认，可先用固定原因占位
完成服务：必须二次确认
照片不足：提示“请先上传服务照片”
```

导航和电话：

```txt
导航未接入时：Toast“导航功能待接入”
电话未接入隐私号时：使用 uni.makePhoneCall 或 Toast 占位
```

### 8.4 上传服务照片页

新增文件：

```txt
miniapp/src/pages/staff/upload-photos.vue
```

页面目标：上传服务过程凭证。

页面布局：

```txt
页面根容器
  min-h-screen bg-[#F5F7FA] pb-[140rpx]

上传说明卡片
  {{PHOTO_REQUIREMENT_PLACEHOLDER}}

照片网格卡片
  已选照片
  添加照片
  删除照片
  预览照片
  上传中状态

备注卡片
  服务照片备注

底部操作栏
  提交照片
```

照片类型预留：

```txt
before       服务前
process      服务中
after        服务后
other        其他
```

Day 4 行为：

```txt
先不强制区分照片类型
先支持最多 9 张
接口未完成时，本地预览并 Toast“照片上传接口待接入”
```

## 9. 需要改造的现有页面

### 9.1 我的页

文件：

```txt
miniapp/src/pages/profile/index.vue
```

新增师傅入口：

```txt
师傅工作台 -> /pages/staff/dashboard
```

显示条件：

```txt
tokenStore.hasLogin && userStore.userInfo.role === 'staff'
```

如果角色字段暂不可用：

```txt
使用 {{STAFF_ROLE_PLACEHOLDER}} 占位
可以先隐藏入口，等角色字段确定后打开
```

注意：

```txt
不要影响普通用户菜单
不要把服务商入口放进本次改造
```

## 10. 需要新增的公共组件

### 10.1 staff-task-card

文件：

```txt
miniapp/src/components/staff-task-card/staff-task-card.vue
```

Props：

```txt
task: StaffTask
```

Emits：

```txt
tap
primary
secondary
```

展示内容：

```txt
任务状态
服务名称
预约时间
服务地址
距离占位
用户备注摘要
主按钮
次按钮
```

设计要求：

```txt
预约时间要突出
地址最多两行
状态标签靠右或靠上
主按钮使用 #1677FF
拒单等次要动作使用白底灰边或警告色文字
```

### 10.2 staff-status-tag

文件：

```txt
miniapp/src/components/staff-status-tag/staff-status-tag.vue
```

如果后续已经实现 `order-status-tag`，可复用它；如果师傅端文案需要不同，可新增此组件。

Props：

```txt
status: StaffTaskStatus
size?: 'sm' | 'md'
```

状态映射：

```txt
pending_accept    待接单      warning
accepted          已接单      primary
on_the_way        上门中      primary
in_service        服务中      primary
pending_confirm   待用户确认  warning
completed         已完成      success
rejected          已拒单      info
cancelled         已取消      info
```

### 10.3 upload-image-grid

文件：

```txt
miniapp/src/components/upload-image-grid/upload-image-grid.vue
```

Props：

```txt
modelValue: UploadImageItem[]
maxCount?: number
readonly?: boolean
```

Emits：

```txt
update:modelValue
add
remove
preview
```

类型：

```typescript
export interface UploadImageItem {
  id?: number | string
  url: string
  status?: 'local' | 'uploading' | 'done' | 'error'
  type?: 'before' | 'process' | 'after' | 'other'
}
```

设计要求：

```txt
网格固定三列
单元格比例 1:1
添加按钮尺寸稳定
上传中显示 loading
失败显示重试提示
```

### 10.4 bottom-action-bar 复用

如果用户端已实现：

```txt
miniapp/src/components/bottom-action-bar/bottom-action-bar.vue
```

师傅端直接复用。

如果尚未实现，师傅端需要同步创建，支持：

```txt
单主按钮
次按钮 + 主按钮
loading
disabled
```

## 11. API 和类型计划

新增类型文件：

```txt
miniapp/src/api/types/staff.ts
```

新增 API 文件：

```txt
miniapp/src/api/staff.ts
```

### 11.1 类型定义

```typescript
export type StaffTaskStatus =
  | 'pending_accept'
  | 'accepted'
  | 'on_the_way'
  | 'in_service'
  | 'pending_confirm'
  | 'completed'
  | 'rejected'
  | 'cancelled'

export interface StaffTask {
  id: number
  orderNo: string
  status: StaffTaskStatus
  serviceName: string
  serviceSpec?: string
  appointmentTime: string
  customerName: string
  customerPhone?: string
  addressText: string
  distanceText?: string
  remark?: string
  incomeAmount?: number
  createdAt: string
}

export interface StaffTaskDetail extends StaffTask {
  serviceRequirement?: string
  platformNotice?: string
  acceptedAt?: string
  checkinAt?: string
  startedAt?: string
  completedAt?: string
  photos: StaffServicePhoto[]
}

export interface StaffServicePhoto {
  id: number | string
  url: string
  type?: 'before' | 'process' | 'after' | 'other'
  remark?: string
  createdAt?: string
}

export interface StaffDashboard {
  staffName: string
  avatar?: string
  todayTaskCount: number
  pendingCount: number
  processingCount: number
  completedCount: number
  todayEstimatedIncome?: number
  todayTasks: StaffTask[]
}
```

### 11.2 API 函数

```typescript
getStaffDashboard()
getStaffOrders(params)
getStaffOrderDetail(id)
acceptStaffOrder(id)
rejectStaffOrder(id, payload)
checkinStaffOrder(id, payload)
startStaffOrderService(id)
uploadStaffOrderPhotos(id, payload)
completeStaffOrder(id, payload)
```

### 11.3 Mock 数据规则

接口未完成时，页面可以先用 mock 数据，但要求：

```txt
mock 字段必须符合正式类型
mock 数据集中放在页面顶部或独立 mock 函数
组件不自行创建业务 mock
所有 mock 均标记 TODO
```

至少覆盖以下状态：

```txt
pending_accept
accepted
on_the_way
in_service
completed
rejected
```

## 12. 页面路由和配置

新增页面使用 `definePage`，由 uni-pages 自动生成配置。

建议页面标题：

```txt
pages/staff/dashboard        师傅工作台
pages/staff/orders           我的任务
pages/staff/order-detail     任务详情
pages/staff/upload-photos    上传照片
```

Tabbar 不新增师傅端 Tab。

```txt
师傅端通过我的页入口进入
进入师傅端后使用普通页面导航返回
```

## 13. 实施顺序

### Step 1：类型和状态规范

新增：

```txt
src/api/types/staff.ts
src/api/staff.ts
```

先定义：

```txt
StaffTaskStatus
StaffTask
StaffTaskDetail
StaffDashboard
StaffServicePhoto
```

目的：避免组件和页面各自定义任务字段。

### Step 2：公共组件

按顺序实现：

```txt
staff-status-tag
staff-task-card
upload-image-grid
bottom-action-bar（如用户端尚未实现）
```

### Step 3：师傅工作台

实现：

```txt
pages/staff/dashboard.vue
```

先用 mock dashboard 数据跑通入口和页面结构。

### Step 4：任务列表

实现：

```txt
pages/staff/orders.vue
```

支持按状态筛选和进入任务详情。

### Step 5：任务详情

实现：

```txt
pages/staff/order-detail.vue
```

接入底部状态动作：

```txt
接单
拒单
上门打卡
开始服务
上传照片
完成服务
```

### Step 6：上传服务照片

实现：

```txt
pages/staff/upload-photos.vue
```

先支持本地选择和预览，接口未完成时 Toast 占位。

### Step 7：我的页入口

改造：

```txt
pages/profile/index.vue
```

只在师傅角色下显示“师傅工作台”入口。

### Step 8：整体走查

检查链路：

```txt
我的 -> 师傅工作台
师傅工作台 -> 待接单任务列表
任务列表 -> 任务详情
任务详情 -> 接单
任务详情 -> 打卡
任务详情 -> 开始服务
任务详情 -> 上传照片
任务详情 -> 完成服务
```

## 14. 交互细节

### 14.1 接单

```txt
点击接单
按钮进入 loading
成功后任务状态变为 accepted
跳转或停留在任务详情
失败 Toast 提示
```

### 14.2 拒单

```txt
点击拒单
弹出二次确认
可先使用固定原因：师傅暂无法服务
成功后状态变为 rejected
返回任务列表
```

后续可补充拒单原因选择：

```txt
时间冲突
距离过远
服务范围不支持
其他原因
```

### 14.3 上门打卡

```txt
点击上门打卡
接口未完成时 Toast“打卡接口待接入”
后续需要经纬度、地址文本、打卡照片可选
成功后状态变为 on_the_way 或保持 accepted，取决于后端状态机
```

占位字段：

```txt
latitude: CHECKIN_LOCATION_PLACEHOLDER
longitude: CHECKIN_LOCATION_PLACEHOLDER
addressText: CHECKIN_LOCATION_PLACEHOLDER
```

### 14.4 开始服务

```txt
点击开始服务
成功后状态变为 in_service
任务详情刷新
```

### 14.5 上传照片

```txt
点击上传照片
跳转 /pages/staff/upload-photos?id={task.id}
上传后返回任务详情
任务详情展示照片缩略图
```

### 14.6 完成服务

```txt
点击完成服务
如果要求照片且照片为空，提示先上传照片
弹出二次确认
成功后状态变为 pending_confirm 或 completed，取决于后端规则
```

## 15. 后续需要提供的信息

```txt
师傅角色字段和权限规则
师傅工作台统计字段
任务状态机最终枚举
接单后订单状态如何变化
拒单原因是否必填
打卡是否必须定位
打卡是否必须拍照
导航使用腾讯地图还是微信内置地图
电话联系是否使用隐私号
完成服务前至少需要几张照片
照片是否需要区分服务前 / 服务中 / 服务后
照片上传接口和对象存储规则
收入金额是否在师傅端展示
师傅端是否允许查看用户完整手机号
```

## 16. 验收标准

### 16.1 主流程验收

```txt
师傅角色可以从我的页进入师傅工作台
普通用户不显示师傅入口
师傅工作台展示今日任务、待接单、进行中等数据
师傅可以进入任务列表
任务列表可以按状态筛选
任务卡片展示预约时间、地址、状态和操作按钮
师傅可以进入任务详情
任务详情展示服务信息、预约信息、用户备注、履约记录
待接单任务可接单
待接单任务可拒单
已接单任务可上门打卡
上门中任务可开始服务
服务中任务可上传照片
服务中任务可完成服务
完成服务前照片不足时有提示
```

### 16.2 UI 验收

```txt
整体仍使用 #1677FF 主色和 #F5F7FA 页面背景
卡片、按钮、间距与用户端保持一致
任务时间和地址足够突出
底部操作栏不遮挡安全区
长地址不撑破卡片
长服务名不撑破卡片
拒单等次要动作不会误触
关键动作有 loading 状态
危险动作有二次确认
空状态、加载状态、错误状态完整
没有服务商端管理功能实现
```

### 16.3 代码结构验收

```txt
新增页面路径清晰
新增组件目录符合 components/name/name.vue
组件只负责展示和事件，不直接请求接口
页面负责 API 或 mock 数据
师傅任务状态映射集中管理
不新增师傅端 Tabbar
不破坏用户端首页 / 订单 / 我的三 Tab
```

## 17. 最终交付物

本计划完成后，师傅端应具备：

```txt
4 个师傅端页面：
  师傅工作台
  任务列表
  任务详情
  上传服务照片

3 个师傅端核心组件：
  staff-task-card
  staff-status-tag
  upload-image-grid

1 组师傅端 API 和类型预留：
  staff.ts
  types/staff.ts

1 条师傅端履约链路：
  工作台 -> 任务列表 -> 任务详情 -> 接单 -> 打卡 -> 开始服务 -> 上传照片 -> 完成服务
```

服务商端行动计划后续单独生成，不放入本文件。
