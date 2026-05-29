# Day 9 师傅端 UI 行动计划

## 1. 目标

本计划用于指导 `miniapp` 前端新增师傅端 UI。参考图来自：

```txt
docs/ui/staff/home.png
docs/ui/staff/writeorder.png
docs/ui/staff/staffme.png
```

本次只制定行动计划，不直接实现代码。

核心目标：

```txt
在现有用户端前端风格、样式和配色基础上加入师傅端
师傅端采用卡片式拼接布局，页面背景、卡片圆角、字体层级与用户端保持一致
师傅端第一版包含：首页/任务大厅、订单管理、录入订单、个人中心
师傅端进入后使用独立的三栏底部导航，不破坏用户端现有首页/订单/我的 Tab
录入订单和个人中心按参考图补齐主要视觉结构，复杂业务先用占位交互承接
```

## 2. 设计原则

### 2.1 保持用户端风格

师傅端不重新设计一套视觉系统，继续沿用现有用户端的家政小程序风格：

```txt
页面背景：#F5F7FA
卡片背景：#FFFFFF
用户端红色主视觉：#FF373D / #EF3D45
正文：#1F2937
次要文字：#6B7280
弱文字：#9CA3AF
边框：#E5E7EB
辅助蓝色：#1677FF，用于少量状态标签和功能强调
成功色：#16A34A
警告色：#F59E0B
错误色：#EF4444
```

布局风格：

```txt
浅灰页面底色
白色圆角卡片
模块之间用卡片拼接，不使用重营销大图堆叠
按钮、标签、图标尺寸与用户端保持接近
底部操作区和底部 Tab 适配 safe-area
```

### 2.2 师傅端信息优先级

师傅端是工作台，不是营销首页。信息优先级按以下顺序处理：

```txt
待处理任务
当前订单状态
服务时间和服务地址
下一步操作
收入和统计
个人资料与管理入口
```

页面要让师傅第一眼知道：

```txt
今天有没有单
哪些单需要马上处理
下一步该点什么
客户地址和电话在哪里
是否需要录入订单
```

## 3. 参考图拆解

### 3.1 home.png：任务大厅

参考图结构：

```txt
顶部微信小程序导航
页面标题：任务大厅
页面内大标题：任务大厅
右侧文字入口：录入订单
顶部任务切换：
  抢单任务
  待分配任务
当前选中项使用红色文字和红色下划线
中间为空状态：
  灰色插画
  文案：空空如也
底部师傅端 Tab：
  首页
  订单管理
  个人中心
```

落地要求：

```txt
保留“任务大厅 + 录入订单”的工作台入口
任务筛选使用顶部 segmented tabs
空状态复用现有 empty-state 风格，图标可先用 Carbon 图标或本地占位
后续有数据时替换为任务卡片列表
```

### 3.2 writeorder.png：录入订单

参考图结构：

```txt
页面标题：录入订单
卡片 1：
  添加服务地址
卡片 2：
  自定义预约服务开关
  预约服务选择行
卡片 3：
  上门时间
  订单分配方式
卡片 4：
  家居照片
  上传 1-3 张环境照片
```

落地要求：

```txt
采用表单卡片拼接样式
每个业务组一个白色卡片
行项目左侧为粗体标题，右侧为灰色占位值和箭头
开关使用系统 switch 或现有组件样式
照片上传区复用 upload-image-grid，第一版可只支持本地预览和占位提交
底部预留固定提交按钮
```

### 3.3 staffme.png：个人中心

参考图结构：

```txt
红色顶部身份区域
头像、师傅名称、认证状态、地区
二维码入口
工作统计卡片：
  本日/本周/本月/总数切换
  新增师傅
  新增订单
  录入订单
  完成订单
佣金/奖金卡片
应用管理卡片
底部师傅端 Tab
```

落地要求：

```txt
沿用用户端红色头部，但降低复杂装饰
身份区域使用红底白字，统计和资产区域使用白色卡片覆盖式拼接
工作统计用卡片内分段控件，不做复杂图表
佣金/奖金用双列资产卡片
应用管理用四列宫格入口
二维码、消息、认证资料、佣金明细等先做占位跳转或 toast
```

## 4. 师傅端页面地图

第一版师傅端作为 `miniapp` 内的子端，不新增独立应用。

入口：

```txt
用户端 我的 -> 师傅端入口 -> 师傅端首页
```

师傅端内部导航：

```txt
师傅端首页
  -> 抢单任务
  -> 待分配任务
  -> 任务详情
  -> 录入订单

订单管理
  -> 待接单
  -> 进行中
  -> 已完成
  -> 订单详情
  -> 上传服务照片

个人中心
  -> 工作统计
  -> 佣金/奖金
  -> 应用管理
  -> 资料认证占位
  -> 消息占位
```

建议页面文件：

```txt
miniapp/src/pages/staff/home.vue
miniapp/src/pages/staff/orders.vue
miniapp/src/pages/staff/order-detail.vue
miniapp/src/pages/staff/write-order.vue
miniapp/src/pages/staff/profile.vue
miniapp/src/pages/staff/upload-photos.vue
```

建议组件文件：

```txt
miniapp/src/components/staff-tabbar/staff-tabbar.vue
miniapp/src/components/staff-task-card/staff-task-card.vue
miniapp/src/components/staff-status-tag/staff-status-tag.vue
miniapp/src/components/upload-image-grid/upload-image-grid.vue
miniapp/src/components/bottom-action-bar/bottom-action-bar.vue
```

## 5. 导航策略

### 5.1 不改用户端 Tab

现有用户端 Tab 保持：

```txt
首页
订单
我的
```

师傅端不加入全局 tabBar，避免普通用户端结构混乱。

### 5.2 师傅端内部 Tab

师傅端页面底部单独实现 `staff-tabbar`：

```txt
首页 -> /pages/staff/home
订单管理 -> /pages/staff/orders
个人中心 -> /pages/staff/profile
```

样式要求：

```txt
白色底部栏
顶部细分割线
选中态使用用户端红色 #FF373D
未选中态使用 #8A8F99
图标优先使用 Carbon/UnoCSS 图标
高度和现有 custom tabbar 接近
适配 safe-area
```

## 6. 页面规划

### 6.1 师傅端首页：任务大厅

文件：

```txt
miniapp/src/pages/staff/home.vue
```

页面结构：

```txt
页面容器
  顶部标题区
    大标题：任务大厅
    右侧入口：录入订单

  任务类型切换卡片
    抢单任务
    待分配任务

  任务列表区域
    有数据：staff-task-card 列表
    无数据：空状态
    加载中：loading-state
    错误：错误卡片 + 重试按钮

  staff-tabbar
```

卡片式拼接策略：

```txt
顶部标题区和筛选区之间不要重边框堆叠
任务卡片使用白底圆角，列表间距 16-20rpx
空状态放在一个大白色卡片内，避免页面中间空白过大
```

主要交互：

```txt
点击“录入订单” -> /pages/staff/write-order
切换“抢单任务/待分配任务” -> 刷新列表筛选
点击任务卡片 -> /pages/staff/order-detail?id={id}
点击接单/拒单等按钮 -> 先本地 mock 状态变更或 toast 占位
```

### 6.2 订单管理

文件：

```txt
miniapp/src/pages/staff/orders.vue
```

页面结构：

```txt
顶部标题：订单管理
状态筛选：
  待接单
  进行中
  已完成
订单/任务卡片列表
staff-tabbar
```

任务卡片展示：

```txt
状态标签
服务名称
预约时间
服务地址
客户备注
距离/导航占位
主按钮
次按钮
```

按钮规则：

```txt
待接单：拒单 / 接单
已接单：上门打卡
上门中：开始服务
服务中：上传照片 / 完成服务
待确认：查看详情
已完成：查看详情
```

### 6.3 录入订单

文件：

```txt
miniapp/src/pages/staff/write-order.vue
```

页面结构：

```txt
页面标题：录入订单

地址卡片
  添加服务地址

预约服务卡片
  自定义预约服务 switch
  预约服务选择行

上门与分配卡片
  上门时间
  订单分配方式

照片卡片
  家居照片
  上传 1-3 张环境照片
  图片上传格子

备注卡片
  客户需求/补充说明

底部操作栏
  保存草稿（可选）
  提交订单
```

第一版字段：

```txt
serviceAddress
customServiceEnabled
serviceId
appointmentTime
dispatchMode
photos
remark
```

占位交互：

```txt
添加服务地址：跳转地址选择或 toast
选择预约服务：弹出 picker 或 toast
选择上门时间：使用 picker 占位
选择分配方式：平台分配/指定师傅/暂不分配
提交订单：前端校验后 toast“录入订单接口待接入”
```

校验规则：

```txt
必须选择服务地址
必须选择预约服务
必须选择上门时间
环境照片 1-3 张，第一版可先非强制，提交时提示待确认规则
```

### 6.4 任务详情

文件：

```txt
miniapp/src/pages/staff/order-detail.vue
```

页面结构：

```txt
顶部状态卡片
  当前状态
  下一步提示

服务信息卡片
  服务名称
  服务规格
  服务要求

预约信息卡片
  上门时间
  客户姓名
  客户电话
  服务地址
  联系客户
  导航

备注卡片
  客户备注
  平台提示

履约记录卡片
  接单时间
  打卡时间
  开始服务时间
  完成时间

服务照片卡片
  已上传照片
  上传入口

底部操作栏
```

底部操作规则：

```txt
pending_accept：拒单 / 接单
accepted：上门打卡
on_the_way：开始服务
in_service：上传照片 / 完成服务
pending_confirm：返回列表
completed：返回列表
```

高风险动作：

```txt
拒单需要二次确认
完成服务需要二次确认
完成服务前如果要求照片且照片不足，需要提示先上传照片
```

### 6.5 个人中心

文件：

```txt
miniapp/src/pages/staff/profile.vue
```

页面结构：

```txt
红色身份头部
  头像
  师傅名称
  认证状态
  服务地区
  二维码入口
  消息入口

工作统计卡片
  分段控件：本日/本周/本月/总数
  新增师傅
  新增订单
  录入订单
  完成订单

资产卡片
  我的佣金
  我的奖金

应用管理卡片
  我的钱包
  我的服务
  证件管理
  证件结算

其他入口卡片
  资料认证
  服务规则
  客服
  设置

staff-tabbar
```

设计要求：

```txt
红色头部和用户端首页红色保持一致
工作统计卡片压在红色头部下方，形成卡片拼接感
统计数字不做复杂图表
资产卡片使用浅灰内嵌卡片，图标使用红/蓝/金等辅助色
应用管理使用四列宫格，图标红色圆底，和参考图接近
```

## 7. 数据和类型规划

新增类型文件：

```txt
miniapp/src/api/types/staff.ts
```

建议类型：

```ts
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
  appointmentTime: string
  customerName: string
  customerPhone?: string
  addressText: string
  distanceText?: string
  remark?: string
  incomeAmount?: number
}

export interface StaffDashboard {
  pendingTaskCount: number
  dispatchTaskCount: number
  processingTaskCount: number
  completedTaskCount: number
  tasks: StaffTask[]
}

export interface StaffProfileStats {
  todayNewStaff: number
  todayNewOrders: number
  todayWriteOrders: number
  todayCompletedOrders: number
  commissionAmount: number
  bonusAmount: number
}
```

新增 API 文件：

```txt
miniapp/src/api/staff.ts
```

预留接口：

```txt
getStaffDashboard()
getStaffTasks(params)
getStaffTaskDetail(id)
acceptStaffTask(id)
rejectStaffTask(id, payload)
checkinStaffTask(id, payload)
startStaffTask(id)
completeStaffTask(id, payload)
createStaffOrder(payload)
uploadStaffOrderPhotos(id, payload)
getStaffProfileStats(params)
```

后端接口未完成时：

```txt
页面先使用集中 mock 数据
mock 字段必须和正式类型一致
组件不直接写 mock，只接收 props
所有待接接口位置标注 TODO
```

## 8. 组件规划

### 8.1 staff-tabbar

职责：

```txt
师傅端内部三栏导航
不影响用户端全局 Tab
```

Props：

```txt
active: 'home' | 'orders' | 'profile'
```

### 8.2 staff-task-card

职责：

```txt
统一展示师傅端任务/订单卡片
```

展示内容：

```txt
状态标签
服务名称
预约时间
服务地址
距离
备注
主按钮
次按钮
```

Emits：

```txt
tap
primary
secondary
```

### 8.3 staff-status-tag

职责：

```txt
统一师傅端状态颜色和文案
```

状态映射：

```txt
pending_accept    待接单       warning
accepted          已接单       primary
on_the_way        上门中       primary
in_service        服务中       primary
pending_confirm   待确认       warning
completed         已完成       success
rejected          已拒单       info
cancelled         已取消       info
```

### 8.4 upload-image-grid

职责：

```txt
录入订单和服务照片上传共用
```

要求：

```txt
三列网格
固定 1:1 比例
支持添加、删除、预览
支持最多 9 张
录入订单场景限制 1-3 张
```

### 8.5 bottom-action-bar

职责：

```txt
统一底部固定操作栏
适配 safe-area
支持单按钮、双按钮、loading、disabled
```

如果现有用户端已实现同名组件，师傅端直接复用。

## 9. 页面样式规范

### 9.1 卡片

```txt
页面左右边距：24rpx 或 32rpx
普通卡片圆角：24rpx
大卡片圆角：28rpx
卡片内边距：24-32rpx
模块间距：20-24rpx
列表卡片间距：16-20rpx
```

### 9.2 字体

```txt
页面大标题：42-48rpx / 700
卡片标题：32-38rpx / 700
正文：28-30rpx / 400
说明文字：24-26rpx / 400
统计数字：44-56rpx / 700
```

### 9.3 按钮

```txt
主按钮：红色 #FF373D 或蓝色 #1677FF，按页面场景统一
师傅端任务动作优先使用红色主按钮，保持参考图和用户端红色一致
次按钮：白底灰边或浅灰底
危险动作：白底红字，二次确认
按钮高度：80-88rpx
按钮圆角：999rpx 或 16-20rpx，按现有页面风格选择
```

### 9.4 图标

```txt
优先使用 UnoCSS/Carbon 图标
不手写复杂 SVG
底部 Tab、宫格入口、空状态、上传入口均使用统一图标体系
```

## 10. 实施顺序

### Step 1：补齐类型和 mock 数据

新增：

```txt
miniapp/src/api/types/staff.ts
miniapp/src/api/staff.ts
```

完成内容：

```txt
定义 StaffTaskStatus
定义 StaffTask
定义 StaffDashboard
定义 StaffProfileStats
集中准备 mockStaffTasks、mockStaffProfileStats
```

验收：

```txt
页面和组件不各自发明字段名
状态枚举能覆盖参考图和履约流程
```

### Step 2：实现师傅端公共组件

新增：

```txt
staff-tabbar
staff-status-tag
staff-task-card
upload-image-grid
bottom-action-bar（如尚未存在）
```

验收：

```txt
卡片样式与用户端一致
状态颜色集中维护
师傅端底部导航可在三个页面之间切换
上传网格尺寸稳定，不因图片数量改变布局
```

### Step 3：实现任务大厅首页

新增：

```txt
miniapp/src/pages/staff/home.vue
```

验收：

```txt
页面结构接近 home.png
包含“任务大厅”和“录入订单”入口
包含“抢单任务/待分配任务”切换
有任务时展示任务卡片
无任务时展示空状态“空空如也”
底部展示师傅端 Tab，首页选中
```

### Step 4：实现录入订单页

新增：

```txt
miniapp/src/pages/staff/write-order.vue
```

验收：

```txt
页面结构接近 writeorder.png
地址、预约服务、上门时间、分配方式、家居照片均以卡片展示
支持开关、自定义服务选择占位、照片上传占位
底部有提交按钮
提交前有基础校验
```

### Step 5：实现订单管理页

新增：

```txt
miniapp/src/pages/staff/orders.vue
```

验收：

```txt
包含待接单、进行中、已完成筛选
任务卡片展示时间、地址、状态和下一步按钮
支持跳转任务详情
底部展示师傅端 Tab，订单管理选中
```

### Step 6：实现任务详情页

新增：

```txt
miniapp/src/pages/staff/order-detail.vue
```

验收：

```txt
展示状态、服务信息、预约信息、客户电话、地址、备注、履约记录和照片
底部按钮随状态变化
拒单和完成服务有二次确认
上传照片入口可跳转
```

### Step 7：实现个人中心页

新增：

```txt
miniapp/src/pages/staff/profile.vue
```

验收：

```txt
页面结构接近 staffme.png
红色身份头部与用户端首页主色一致
工作统计卡片支持本日/本周/本月/总数切换
佣金/奖金双卡展示
应用管理宫格展示
底部展示师傅端 Tab，个人中心选中
```

### Step 8：接入用户端入口

修改：

```txt
miniapp/src/pages/profile/index.vue
```

新增入口：

```txt
师傅端
```

建议显示规则：

```txt
已登录且角色为 staff 时显示
如果角色字段暂未确定，先用 TODO 占位，避免普通用户误入
```

验收：

```txt
普通用户端首页/订单/我的不受影响
师傅角色可以从“我的”进入师傅端首页
```

### Step 9：构建和小程序导入验证

执行：

```bash
cd miniapp
pnpm type-check
pnpm build:mp
```

微信开发者工具导入：

```txt
D:\Code Program\Life_assistant\miniapp\dist\build\mp-weixin
```

验收：

```txt
构建通过
新增页面可打开
师傅端三个底部 Tab 可切换
主要卡片不溢出
长地址、长服务名不撑破卡片
底部 Tab 和底部操作栏不遮挡安全区
```

## 11. 需要后续确认的信息

```txt
师傅角色字段名称和取值
师傅端是否允许普通用户申请进入
抢单任务和待分配任务的业务区别
录入订单是否等同于代客下单
录入订单是否必须上传 1-3 张环境照片
订单分配方式枚举
师傅端是否展示完整客户手机号
导航使用微信内置地图还是腾讯地图
完成服务前是否强制上传照片
佣金和奖金是否来自独立结算接口
二维码入口展示师傅码还是门店码
```

## 12. 本阶段不做

```txt
不做完整服务商后台
不做真实佣金提现
不做银行卡绑定
不做复杂师傅管理
不做学习中心
不做真实地图抢单
不做真实照片对象存储接入
不做复杂二维码核销
不改变用户端现有 Tab 结构
```

## 13. 最终交付物

Day 9 师傅端 UI 完成后应具备：

```txt
1 个师傅端内部底部导航组件
3 个师傅端主页面：首页、订单管理、个人中心
3 个师傅端业务页面：录入订单、任务详情、上传照片
1 套师傅端任务卡片和状态标签
1 套照片上传网格
1 个用户端“我的”页面师傅端入口
1 条可走通的师傅端链路：
  我的 -> 师傅端首页 -> 录入订单
  我的 -> 师傅端首页 -> 任务列表 -> 任务详情 -> 履约操作
```

