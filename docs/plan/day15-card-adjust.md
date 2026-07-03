# Day 15 Card Adjust Plan

更新日期：2026-06-05  
代号：day15-card-adjust

## 1. 目标

修复小程序“我的卡包”页面的服务卡 UI。当前进入卡包页后，卡片中文字偏大、按钮偏大、信息区域和操作按钮之间空间紧张，整体视觉显得粗重。

本次只做 UI 调整，不改业务数据、不接真实接口、不改变预约跳转逻辑。

目标效果：

```txt
卡片整体更轻、更精致
字体更小，信息层级更清楚
剩余次数不再压迫页面
按钮尺寸更克制
卡片内容和右侧操作区不互相挤压
```

## 2. 当前问题

当前文件：

```txt
miniapp/src/pages/card/index.vue
```

当前主要样式问题：

```txt
.service-card height = 210rpx，信息密度偏高
.card-name font-size = 40rpx，标题过大
.card-expire font-size = 28rpx，日期信息偏抢眼
.remain-value font-size = 64rpx，剩余次数过大
.reserve-button width = 170rpx height = 70rpx font-size = 34rpx，按钮偏大
.card-info padding-right = 280rpx，内容区被按钮挤压明显
```

当前设计更像营销大卡，但卡包页是用户反复查看和选择服务卡的功能页，应更偏向清晰、稳定、可扫描。

## 3. 调整原则

### 3.1 字体层级收敛

建议字号：

```txt
卡名：32-34rpx
到期时间：22-24rpx
剩余 label：22-24rpx
剩余数字：44-48rpx
剩余单位：22-24rpx
按钮文字：24-26rpx
```

### 3.2 卡片结构优化

保留红色服务卡视觉，但减少厚重感：

```txt
卡片圆角从 28rpx 调整到 22-24rpx
卡片高度从 210rpx 调整到 188-196rpx
列表间距从 32rpx 调整到 22-24rpx
页面左右 padding 维持 28-32rpx
```

### 3.3 内容与操作区分离

卡片内部建议分成左右两区：

```txt
左侧：卡名、到期时间、剩余次数
右侧：立即预约按钮
```

右侧按钮不要过大：

```txt
width: 132-148rpx
height: 54-60rpx
font-size: 24-26rpx
```

左侧内容预留右侧空间，但不要被过度压缩。

### 3.4 装饰弱化

当前卡片有点阵和两条斜纹。保留装饰，但降低存在感：

```txt
card-pattern opacity 降低到 0.10-0.14
slash opacity 降低到 0.04-0.06
斜纹宽度缩小
```

装饰不能影响文字可读性。

## 4. 实现计划

### Step 1：调整页面间距

修改：

```txt
.card-page
.card-list
```

建议：

```txt
page padding: 28rpx 28rpx 56rpx
list gap: 22rpx
```

### Step 2：优化卡片尺寸

修改：

```txt
.service-card
```

建议：

```txt
height: 188rpx
border-radius: 24rpx
box-shadow: 0 10rpx 24rpx rgba(255, 56, 61, 0.14)
```

### Step 3：压缩字体尺寸

修改：

```txt
.card-name
.card-expire
.remain-label
.remain-value
.remain-unit
.reserve-button
```

建议：

```txt
.card-name: 34rpx / 44rpx
.card-expire: 23rpx / 32rpx
.remain-label: 23rpx / 32rpx
.remain-value: 46rpx / 52rpx
.remain-unit: 23rpx / 32rpx
.reserve-button: 25rpx
```

### Step 4：优化信息区排布

修改：

```txt
.card-info
.remain-row
```

建议：

```txt
padding: 26rpx 188rpx 22rpx 28rpx
card-info justify-content: center
card-expire margin-top: 12rpx
remain-row margin-top: 10rpx
```

如果卡名过长：

```txt
单行截断
```

避免卡名撑开布局。

### Step 5：优化按钮

修改：

```txt
.reserve-button
```

建议：

```txt
right: 26rpx
width: 140rpx
height: 56rpx
border-radius: 999rpx
font-size: 25rpx
font-weight: 600
```

按钮维持白底红字，与卡片主色形成清晰对比。

## 5. 验收标准

功能验收：

```txt
进入 /pages/card/index 后页面正常展示服务卡
点击“立即预约”仍然跳转 /pages/order/create?cardId=xxx
空状态仍然可用
```

UI 验收：

```txt
卡名、到期时间、剩余次数不互相重叠
右侧按钮不遮挡文字
字体明显比当前版本更小
每张卡片视觉更轻，不显得拥挤
长卡名能稳定截断
多张卡列表间距稳定
```

工程验收：

```txt
miniapp type-check 通过
miniapp H5 build 通过
mp-weixin dev 产物能重新生成
```

## 6. 非本期范围

本期不做：

```txt
接入真实卡包接口
增加卡包筛选
增加已过期/已用完状态
改优惠券页面
改订单创建页对 cardId 的真实消费逻辑
```

后续如果卡包数据接入真实系统，再补充“可用、已用完、已过期”的视觉状态。
