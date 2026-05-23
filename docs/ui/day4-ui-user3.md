# Day 4 用户端 UI 第三轮行动计划：我的页面视觉修正

## 1. 目标

本计划用于在 `day4-ui-user2.md` 已完成的基础上，对用户端“我的”页面做第三轮视觉修正。当前只写行动计划，不直接实现代码。

本轮目标：

```txt
删除顶部红色背景，回到更轻、更干净的浅色个人中心视觉
优化钱包余额 / 我的卡包 / 优惠券之间的分隔，不再使用当前较丑的白色虚线
修正“我的订单”卡片内待付款、待接单、待验收、待评价图标显示异常的问题
保持当前用户满意的整体信息结构、卡片层级和功能入口不变
```

## 2. 本次范围

优先改动：

```txt
miniapp/src/pages/profile/index.vue
```

重新构建后检查：

```txt
miniapp/dist/build/mp-weixin
```

不在本次范围：

```txt
不新增真实钱包、卡包、优惠券页面
不新增真实售后、评价、客服页面
不调整“我的应用”的功能入口顺序
不调整订单列表业务状态映射
不处理师傅端 UI
```

## 3. 当前问题

### 3.1 红色背景过强

当前 `profile/index.vue` 中顶部使用：

```txt
navigationBarBackgroundColor: #FF373D
navigationBarTextStyle: white
profile-hero: linear-gradient(135deg, #ff373d 0%, #ff5257 100%)
顶部文字：白色
头像占位：红色系
```

问题：

```txt
红色背景面积偏大，和当前小程序整体蓝白服务风格不够统一
个人中心首屏视觉压力偏强
后续卡片虽然好看，但顶部区域抢占注意力
```

### 3.2 资产分隔线观感不好

当前钱包余额 / 我的卡包 / 优惠券之间使用：

```txt
border-l border-white/55 border-dashed
```

问题：

```txt
虚线在小程序端显示颗粒感明显
白色虚线依赖红色背景，删除红色背景后不再适配
分隔线视觉存在感过强，影响资产数字的整洁度
```

### 3.3 订单图标显示异常

当前“我的订单”状态图标使用 Carbon 图标类：

```txt
待付款：i-carbon-wallet
待接单：i-carbon-time
待验收：i-carbon-document-tasks
待评价：i-carbon-chat
售后：i-carbon-shopping-bag
```

问题：

```txt
小程序端可能未正确渲染为图标，表现为带标点或异常字符
订单状态入口应使用稳定、正常、不带标点的图标样式
```

## 4. 设计方向

本轮不改变页面结构，只改变视觉表达。

保留：

```txt
顶部个人信息块
钱包余额 / 我的卡包 / 优惠券三列
我的订单卡片
我的应用卡片
底部退出登录按钮
登录态 / 未登录态逻辑
```

调整为：

```txt
页面背景：#F5F7FA
顶部个人信息块：白色卡片或浅蓝渐变卡片
文字：深色为主
资产区域：浅色内嵌块或独立三列
分隔方式：浅灰实线 / 空白间距 / 背景块区分，不再使用虚线
订单图标：使用稳定的 emoji-free 文本符号、CSS 图形、uni-icons 或项目内可控图标
```

## 5. 顶部个人信息块调整方案

### 5.1 推荐方案：白色主卡 + 浅蓝资产条

将当前红色 hero 改为白色卡片，整体与项目原有蓝白风格统一。

布局：

```txt
页面容器
  bg-[#F5F7FA]

顶部个人信息卡
  mx-4
  mt-safe / pt-safe 后留 24rpx
  bg-white
  rounded-[28rpx]
  px-4
  pt-5
  pb-4

用户信息行
  头像
  昵称 / 用户编号
  手机号

资产信息条
  mt-5
  bg-[#F7FAFF] 或 #F8FAFC
  rounded-[20rpx]
  三列资产
```

颜色建议：

```txt
头像底色：#EAF3FF
头像图标色：#1677FF
昵称：#1F2937
手机号：#6B7280
资产数字：#1677FF 或 #1F2937
资产标题：#6B7280
资产条背景：#F7FAFF
```

导航栏：

```txt
navigationBarBackgroundColor: #F5F7FA 或 #FFFFFF
navigationBarTextStyle: black
```

### 5.2 备选方案：浅蓝渐变顶部

如果希望保留一点主视觉层级，可以使用很浅的蓝色渐变，不使用红色。

```txt
profile-hero background:
  linear-gradient(180deg, #EAF3FF 0%, #F5F7FA 100%)

文字仍然使用深色，不使用白字。
```

本轮推荐使用 5.1，因为更稳定、更干净，也更接近当前项目卡片化风格。

## 6. 资产分隔优化

替换当前虚线分隔：

```txt
不要再使用：
  border-l border-white/55 border-dashed
```

推荐方式：

```txt
资产条整体：bg-[#F7FAFF] rounded-[20rpx]
每个资产项：flex-1 center flex-col
分隔线：1rpx 实线，颜色 #E5E7EB，透明度 70%
高度：56rpx
位置：每列左侧居中
```

实现样式示例：

```txt
index > 0:
  absolute left-0 top-1/2 -translate-y-1/2
  w-[1rpx]
  h-[56rpx]
  bg-[#E5E7EB]
```

如果小程序端对 `translate` 表现不稳定，则改为：

```txt
absolute left-0 top-[24rpx] w-[1rpx] h-[56rpx] bg-[#E5E7EB]
```

不要使用虚线、白色线、强对比线。

## 7. 我的订单图标修正

### 7.1 问题处理原则

订单状态图标必须满足：

```txt
小程序端稳定显示
不出现标点、乱码、空白方块
图标尺寸统一
线性或面性风格统一
和“我的应用”的彩色圆形图标区分开，订单入口保持轻量
```

### 7.2 推荐实现方案：使用 CSS 绘制的简洁图标占位

优先避免依赖小程序端不稳定的动态 icon class。可以为订单状态定义稳定的 `symbol` 文本，并用圆角容器承接。

数据结构调整：

```ts
const orderEntries = computed<OrderEntry[]>(() => [
  { label: '待付款', action: 'pendingPayment', symbol: '¥', count: mockOrderStats.pendingPayment },
  { label: '待接单', action: 'pendingDispatch', symbol: '接', count: mockOrderStats.pendingDispatch },
  { label: '待验收', action: 'pendingConfirm', symbol: '验', count: mockOrderStats.pendingConfirm },
  { label: '待评价', action: 'pendingReview', symbol: '评', count: mockOrderStats.pendingReview },
  { label: '售后', action: 'afterSales', symbol: '售', count: mockOrderStats.afterSales },
])
```

视觉：

```txt
图标容器：
  w-[68rpx] h-[68rpx]
  rounded-[18rpx]
  bg-[#F3F7FF]
  center

符号文字：
  text-[30rpx]
  font-700
  color #1677FF
```

优点：

```txt
不会出现图标字体兼容问题
不会出现标点乱码
尺寸可控
开发成本低
```

### 7.3 备选方案：使用静态 SVG / PNG 图标

如果后续需要更精致，可以新增本地静态图标：

```txt
miniapp/src/static/profile/order-pay.svg
miniapp/src/static/profile/order-accept.svg
miniapp/src/static/profile/order-check.svg
miniapp/src/static/profile/order-review.svg
miniapp/src/static/profile/order-after-sale.svg
```

但本轮不推荐，因为会增加资源管理成本。当前先用稳定文本符号满足“正常、不带标点”的要求。

## 8. 具体实现步骤

### Step 1：修改导航栏与顶部背景

在 `profile/index.vue` 中将：

```txt
navigationBarBackgroundColor: #FF373D
navigationBarTextStyle: white
profile-hero 红色渐变
```

调整为：

```txt
navigationBarBackgroundColor: #F5F7FA
navigationBarTextStyle: black
profile-hero 不再使用红色背景
```

验收：

```txt
顶部不再出现大面积红色
页面进入后整体是浅灰背景 + 白色个人信息卡
导航栏文字为黑色
```

### Step 2：重构个人信息块颜色

将顶部用户信息文字从白色改为深色：

```txt
用户名：#1F2937
手机号：#6B7280
手机号图标：#9CA3AF 或 #1677FF
头像默认底色：#EAF3FF
头像默认图标：#1677FF
```

验收：

```txt
未登录时仍显示默认头像、未登录、点击登录后查看个人信息
登录时仍显示头像、昵称、脱敏手机号
文字在白色/浅色背景上清晰
```

### Step 3：替换资产分隔线

将资产三列放入浅色内嵌块，并把虚线改成浅灰实线。

验收：

```txt
钱包余额 / 我的卡包 / 优惠券之间不再有白色虚线
分隔线轻、细、整洁
未登录时显示 -- / -- / --
点击三项仍然遵循登录规则和 toast 占位
```

### Step 4：调整“我的订单”图标

把 `OrderEntry` 的 `icon` 字段改成更稳定的 `symbol` 字段，模板中不再动态绑定 Carbon icon class。

建议字段：

```txt
待付款：¥
待接单：接
待验收：验
待评价：评
售后：售
```

验收：

```txt
待付款、待接单、待验收、待评价不再显示带标点或异常字符
5 个订单入口图标尺寸统一
数量角标仍然正常显示
点击跳转逻辑不变
```

### Step 5：重新构建并导入微信开发者工具

执行：

```bash
cd miniapp
pnpm type-check
pnpm build:mp
```

导入目录：

```txt
D:\Code Program\Life_assistant\miniapp\dist\build\mp-weixin
```

注意：

```txt
当前已经使用测试 AppID touristappid
不要打开 dist/dev/mp-weixin，那里可能仍然是旧产物
如果开发者工具显示旧样式，先清缓存再重新编译
```

## 9. 验收标准

本轮完成后需要满足：

```txt
我的页面顶部不再有红色背景
页面整体保留当前满意的信息结构和卡片布局
个人信息块视觉更接近浅色卡片风格
钱包余额 / 我的卡包 / 优惠券之间没有丑的虚线
资产三列分隔轻量、整洁、不抢视觉
我的订单中的待付款、待接单、待验收、待评价图标显示正常
订单图标不出现标点、乱码、空白方块
未登录和已登录状态都正常
微信开发者工具导入 dist/build/mp-weixin 后能看到最新效果
```

## 10. 风险与注意事项

```txt
如果继续使用 icon class，微信小程序端仍可能出现图标渲染异常，因此本轮建议订单状态图标改为稳定文本符号
删除红色背景后，要同步调整文字颜色，否则白字会不可见
删除顶部 hero 红色背景后，要重新检查“我的订单”卡片的负 margin 是否仍然合理
如果顶部卡片不再需要叠压效果，可以将 mt-[-72rpx] 改成 mt-3
不要只改 dist/build 产物，最终应改 src/pages/profile/index.vue 并重新构建
```
