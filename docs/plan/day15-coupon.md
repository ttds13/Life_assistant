# Day 15 Coupon UI Plan

更新日期：2026-06-05  
代号：day15-coupon

## 1. 目标

修复小程序“我的优惠券”页面中的优惠券 card UI。当前优惠券卡片存在字体偏大、金额区视觉过重、右侧竖向操作按钮压迫感强、信息区层级不够清晰的问题。

本次只做优惠券页面 UI 修补，不修改优惠券数据结构、不接真实优惠券接口、不改变优惠券筛选和使用跳转逻辑。

目标效果：

```txt
优惠券卡片更轻、更精致
金额、标题、说明、有效期层级清楚
右侧操作区不再显得拥挤
已使用、已过期状态有明确但克制的弱化效果
长标题、长说明、长有效期不会撑破卡片布局
```

## 2. 当前页面

当前文件：

```txt
miniapp/src/pages/coupon/index.vue
```

当前页面结构：

```txt
顶部 tab：全部 / 未使用 / 已使用 / 已过期
优惠券列表：左侧金额区 + 中间信息区 + 右侧操作区
空状态：暂无优惠券提示
```

当前主要样式问题：

```txt
.tab-text font-size = 40rpx，顶部 tab 字体过大
.coupon-card height = 198rpx，卡片高度略高但内部仍显拥挤
.amount-panel width = 196rpx，左侧金额区过宽
.amount-value font-size = 70rpx，金额数字过大
.amount-scope font-size = 34rpx，适用范围文字过抢眼
.coupon-title font-size = 38rpx，标题过大
.coupon-desc font-size = 28rpx，说明信息和标题层级差距不够
.coupon-validity font-size = 30rpx，有效期文字偏大
.coupon-action width = 64rpx font-size = 30rpx，竖向按钮偏重
```

优惠券页属于用户反复查看和选择的功能页，不应该做成过重的营销券样式。UI 应该更偏向清晰、可扫描、状态明确。

## 3. 设计原则

### 3.1 字体层级收敛

建议字号：

```txt
tab 文本：28-30rpx
金额符号：24-26rpx
金额数字：48-54rpx
适用范围：22-24rpx
优惠券标题：30-32rpx
优惠券说明：23-24rpx
有效期：22-23rpx
右侧操作文字：24-25rpx
空状态标题：30-32rpx
空状态说明：24-26rpx
```

### 3.2 卡片结构优化

保留“左侧金额 + 中间内容 + 右侧操作”的优惠券识别结构，但整体减轻：

```txt
卡片高度：176-184rpx
卡片圆角：16-20rpx
列表间距：18-22rpx
页面 padding：24-28rpx
左侧金额区宽度：156-168rpx
右侧操作区宽度：52-56rpx
```

金额区保持品牌红色，但降低视觉压迫：

```txt
金额数字从 70rpx 降到 50rpx 左右
金额单位和适用范围明显缩小
适用范围最多一行显示
```

### 3.3 内容区可读性

中间内容区需要稳定承载三类信息：

```txt
优惠券标题
使用门槛或说明
有效期或状态说明
```

处理规则：

```txt
标题单行截断
说明单行截断
有效期单行截断
内容区使用 min-width: 0，避免 flex 子元素撑破布局
内容区上下 padding 收紧，信息垂直居中
```

### 3.4 状态样式明确

未使用：

```txt
主色使用红色
按钮可点击
卡片阴影轻微
```

已使用 / 已过期：

```txt
整体降低饱和度
金额区改为灰色或弱红灰
操作区改为灰色
文字颜色变弱
不只依赖 opacity，避免整张卡文字发虚
```

当前可以先用 class 扩展完成：

```txt
.coupon-card
.coupon-card-disabled
.amount-panel
.coupon-action
```

后续如果需要更细分，可以再增加：

```txt
.coupon-card-used
.coupon-card-expired
```

## 4. 实施计划

### Step 1：调整页面和 tab

修改：

```txt
.coupon-page
.tab-row
.tab-item
.tab-text
.tab-line
```

建议：

```txt
page background: #f6f7f9
tab-row height: 96-104rpx
tab-text font-size: 28-30rpx
tab-line width: 40-44rpx
tab-line height: 5-6rpx
```

目标：顶部 tab 更像功能筛选，不再像大标题。

### Step 2：优化列表和卡片容器

修改：

```txt
.coupon-list
.coupon-card
```

建议：

```txt
coupon-list padding: 22rpx 24rpx 56rpx
coupon-list gap: 20rpx
coupon-card height: 180rpx
coupon-card border-radius: 18rpx
coupon-card box-shadow: 0 8rpx 20rpx rgba(25, 31, 40, 0.06)
```

目标：卡片更轻，列表密度更适合移动端反复查看。

### Step 3：压缩左侧金额区

修改：

```txt
.amount-panel
.amount-row
.amount-symbol
.amount-value
.amount-scope
```

建议：

```txt
amount-panel width: 164rpx
amount-symbol font-size: 25rpx
amount-symbol margin-right: 6rpx
amount-value font-size: 52rpx
amount-value line-height: 58rpx
amount-scope margin-top: 8rpx
amount-scope font-size: 23rpx
amount-scope line-height: 30rpx
```

目标：金额仍然是主视觉，但不压住其他信息。

### Step 4：优化中间信息区

修改：

```txt
.coupon-content
.coupon-title
.coupon-desc
.coupon-validity
```

建议：

```txt
coupon-content padding: 24rpx 22rpx
coupon-title font-size: 31rpx
coupon-title line-height: 40rpx
coupon-desc margin-top: 10rpx
coupon-desc font-size: 23rpx
coupon-desc line-height: 31rpx
coupon-validity margin-top: 10rpx
coupon-validity font-size: 22rpx
coupon-validity line-height: 30rpx
```

必须补充：

```txt
coupon-title white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
coupon-desc white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
coupon-validity white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
```

目标：长文案不破坏布局，用户能快速扫到核心信息。

### Step 5：优化右侧操作区

修改：

```txt
.coupon-action
```

建议：

```txt
width: 54rpx
font-size: 24rpx
line-height: 30rpx
font-weight: 600
letter-spacing: 1rpx
```

保留竖向按钮设计，但降低宽度和字号，避免右侧像一整块过重的色条。

### Step 6：优化不可用状态

修改：

```txt
.coupon-card-disabled
.coupon-card-disabled .amount-panel
.coupon-card-disabled .coupon-action
.coupon-card-disabled .coupon-title
.coupon-card-disabled .coupon-desc
.coupon-card-disabled .coupon-validity
```

建议：

```txt
coupon-card-disabled opacity 不低于 0.86
disabled amount-panel background: #c8ccd3
disabled coupon-action background: #c8ccd3
disabled title color: #747984
disabled desc color: #a3a7af
disabled validity color: #8e939c
```

目标：不可用状态明确，但文字仍然清楚。

### Step 7：修复空状态视觉

修改：

```txt
.empty-coupon
.empty-title
.empty-desc
```

建议：

```txt
empty-coupon min-height: 480rpx
empty-title font-size: 30rpx
empty-desc font-size: 24rpx
```

目标：空状态轻量，不抢页面视觉。

## 5. 验收标准

功能验收：

```txt
进入 /pages/coupon/index 后页面正常显示
顶部 tab 可以切换全部、未使用、已使用、已过期
未使用优惠券点击后仍然跳转 /pages/order/create?couponId=xxx
已使用、已过期优惠券点击后仍然提示不可使用
空状态仍然可正常显示
```

UI 验收：

```txt
优惠券标题、说明、有效期不互相重叠
金额区不再显得过大
右侧竖向操作按钮不遮挡内容
已使用、已过期状态清楚但不模糊
长标题、长说明、长有效期可以稳定截断
列表多张优惠券时视觉密度更舒服
```

工程验收：

```txt
miniapp type-check 通过
miniapp build:h5 通过
miniapp build:mp 通过
mp-weixin dev 产物可以重新生成
```

## 6. 非本期范围

本期不做：

```txt
接入真实优惠券接口
新增优惠券领取入口
新增优惠券核销逻辑
修改下单页 couponId 的真实抵扣计算
修改优惠券后端模型
新增优惠券管理后台
```

后续优惠券接入真实系统后，再补充“可用门槛、适用服务、不可叠加、即将过期、已核销”的更细状态展示。
