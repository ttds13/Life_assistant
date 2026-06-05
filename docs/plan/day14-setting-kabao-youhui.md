# Day 14 卡包与优惠券页面实现计划

更新日期：2026-06-04

## 1. 目标

在已有钱包页 `/pages/wallet/index` 的基础上，补齐个人中心里的“我的卡包”和“优惠券”两个业务入口。

完成后应形成：

```txt
profile 钱包余额 -> /pages/wallet/index
profile 我的卡包 -> /pages/card/index
profile 优惠券 -> /pages/coupon/index
```

本次重点是页面可进入、UI 还原参考图、交互闭环清晰。数据先使用页面内 mock 数据，后续再替换为真实接口。

## 2. 参考图与页面定位

参考资源：

```txt
photo/kabao.png
photo/youhuiquan.png
miniapp/src/pages/wallet/index.vue
miniapp/src/pages/profile/index.vue
miniapp/src/pages.json
```

页面定位：

```txt
卡包页：展示用户已购买/已领取的服务卡，主操作是“立即预约”
优惠券页：展示可使用、已使用、已过期优惠券，主操作是“立即使用”
```

## 3. 当前状态

当前 profile 中已经有三个统计入口：

```txt
钱包余额
我的卡包
优惠券
```

钱包入口已跳转到 `/pages/wallet/index`。卡包和优惠券目前仍是待完善提示，需要改为实际页面跳转。

当前 pages.json 里已有钱包页：

```txt
pages/wallet/index
```

但还没有：

```txt
pages/card/index
pages/coupon/index
```

## 4. 设计原则

1. 页面不放 tabbar，使用普通 `navigateTo` 页面。
2. UI 风格跟参考图走，不套 profile 的卡片样式。
3. 卡包和优惠券页面可以复用钱包页的页面组织方式：`script setup`、本页 mock 数据、`scoped scss`、构建后验证。
4. 不新增共享 navigation 工具，避免再次引入小程序运行时 require 路径问题。
5. 先保证静态页面和入口可用，再接真实接口。

## 5. 卡包页面计划

新增文件：

```txt
miniapp/src/pages/card/index.vue
```

页面标题：

```txt
我的卡包
```

UI 结构参照 `photo/kabao.png`：

```txt
页面背景：#f5f5f5
列表容器：上下留白，左右 32rpx 左右
服务卡片：大红色圆角卡片，纵向排列
卡片左侧：卡名称、到期时间、剩余次数
卡片右侧：白色圆角按钮“立即预约”
```

建议 mock 数据：

```ts
[
  { id: 1, name: '家庭保洁Plus', expireAt: '2026-03-30 18:21:15', remainingTimes: 20 },
  { id: 2, name: '测试卡', expireAt: '2026-11-06 18:31:44', remainingTimes: 3 },
  { id: 3, name: '测试卡', expireAt: '2026-10-18 20:30:00', remainingTimes: 3 },
  { id: 4, name: '家庭保洁Plus', expireAt: '2025-11-17 19:34:28', remainingTimes: 20 },
]
```

关键样式：

```txt
card height 约 210-230rpx
border-radius 24-28rpx
红色主背景 #ff3b40
可增加半透明斜向色块和点阵纹理，但不要使用图片依赖
右侧按钮白底红字，高度约 70rpx
字体大小按参考图：标题 40rpx 左右，剩余次数数字 64rpx 左右
```

交互：

```txt
点击“立即预约” -> navigateTo('/pages/order/create')
如果后续需要带服务卡 id，可追加 query：/pages/order/create?cardId=xxx
跳转失败时 showToast('预约页跳转失败')
```

空状态：

```txt
无卡时展示“暂无服务卡”，说明“购买服务卡后会展示在这里”
```

## 6. 优惠券页面计划

新增文件：

```txt
miniapp/src/pages/coupon/index.vue
```

页面标题：

```txt
我的优惠券
```

UI 结构参照 `photo/youhuiquan.png`：

```txt
页面背景：#f5f5f5
顶部 tab：全部、未使用、已使用、已过期
active tab：红色文字 + 底部红色短横线
券列表：左侧红色金额区，中间白色信息区，右侧红色竖向按钮
```

建议 tab 类型：

```ts
type CouponTab = 'all' | 'unused' | 'used' | 'expired'
```

建议 mock 数据：

```ts
[
  { id: 1, status: 'unused', amount: 50, title: '新人礼金券', threshold: 800, desc: '满800减50(每次仅能用一张)', validity: '领取当天30天内可用' },
  { id: 2, status: 'unused', amount: 30, title: '新人礼金券', threshold: 500, desc: '满500减30(每次仅能用一张)', validity: '领取当天30天内可用' },
  { id: 3, status: 'used', amount: 20, title: '新人礼金券', threshold: 200, desc: '满200减20(每次仅能用一张)', validity: '已使用' },
  { id: 4, status: 'expired', amount: 20, title: '新人礼金券', threshold: 200, desc: '满200减20(每次仅能用一张)', validity: '已过期' },
]
```

筛选逻辑：

```txt
全部：展示所有优惠券
未使用：status === 'unused'
已使用：status === 'used'
已过期：status === 'expired'
```

关键样式：

```txt
顶部 tab 高度约 112-128rpx
券卡高度约 190-210rpx
左侧金额区宽度约 200rpx，红底白字
中间信息区白底，标题加粗，说明灰色
右侧按钮宽度约 58-72rpx，红底白字，文字竖排
已使用/已过期券可降低透明度或改灰，但第一版可先保持结构一致
```

交互：

```txt
点击 tab -> 切换列表
点击未使用券“立即使用” -> navigateTo('/pages/order/create')
点击已使用/已过期券 -> showToast('该优惠券不可使用')
跳转失败时 showToast('下单页跳转失败')
```

空状态：

```txt
当前分类无券时展示“暂无优惠券”，说明“领取优惠券后会展示在这里”
```

## 7. 路由与 profile 入口计划

修改文件：

```txt
miniapp/src/pages.json
miniapp/src/pages/profile/index.vue
```

pages.json 新增：

```json
{
  "path": "pages/card/index",
  "type": "page",
  "style": {
    "navigationBarTitleText": "我的卡包",
    "navigationBarBackgroundColor": "#ffffff",
    "navigationBarTextStyle": "black"
  }
}
```

```json
{
  "path": "pages/coupon/index",
  "type": "page",
  "style": {
    "navigationBarTitleText": "我的优惠券",
    "navigationBarBackgroundColor": "#ffffff",
    "navigationBarTextStyle": "black"
  }
}
```

profile 入口调整：

```txt
wallet -> goWalletPage()
card -> goCardPage()
coupon -> goCouponPage()
```

建议新增：

```ts
function goCardPage() {
  requireLogin(() => {
    uni.navigateTo({ url: '/pages/card/index' })
  })
}

function goCouponPage() {
  requireLogin(() => {
    uni.navigateTo({ url: '/pages/coupon/index' })
  })
}
```

注意：

```txt
卡包和优惠券不是 tabbar 页面，使用 navigateTo
不要使用 switchTab
不要新增 utils/navigation.ts
```

## 8. 执行顺序

```txt
1. 新建 miniapp/src/pages/card/index.vue，实现卡包静态数据和 UI
2. 新建 miniapp/src/pages/coupon/index.vue，实现优惠券 tab、筛选和 UI
3. 在 pages.json 注册 pages/card/index 和 pages/coupon/index
4. 修改 profile/index.vue，把“我的卡包”和“优惠券”从待完善 toast 改为页面跳转
5. 检查未登录保护：未登录点击仍进入登录页
6. 运行 pnpm build:mp
7. 微信开发者工具清缓存并编译，分别从 profile 点击三个统计入口验证
```

## 9. 验收清单

卡包页：

```txt
[ ] profile 点击“我的卡包”可以进入 /pages/card/index
[ ] 页面标题显示“我的卡包”
[ ] 页面样式接近 photo/kabao.png
[ ] 服务卡纵向列表正常滚动
[ ] “立即预约”按钮可跳转下单页
[ ] 无数据时有空状态
```

优惠券页：

```txt
[ ] profile 点击“优惠券”可以进入 /pages/coupon/index
[ ] 页面标题显示“我的优惠券”
[ ] 页面样式接近 photo/youhuiquan.png
[ ] tab 可切换全部、未使用、已使用、已过期
[ ] 未使用券“立即使用”可跳转下单页
[ ] 已使用/已过期券不会进入下单页
[ ] 无数据分类有空状态
```

构建验证：

```txt
cd miniapp
pnpm build:mp
```

生成目录检查：

```txt
dist/build/mp-weixin/pages/card/index.*
dist/build/mp-weixin/pages/coupon/index.*
```

## 10. 风险与注意事项

```txt
不要把卡包/优惠券误配成 tabbar 页面
不要从 profile 继续弹“待完善”
不要在页面中引入不存在的接口或图片资源
不要使用会导致小程序 require 失败的新增 navigation helper
不要让大数字、按钮文字在窄屏下溢出
不要因为终端中文乱码误判源码内容，以 build 结果和开发者工具显示为准
```

## 11. 完成标准

```txt
卡包页和优惠券页均有独立页面文件
pages.json 注册完整
profile 三个统计入口都进入对应页面
卡包 UI 接近 kabao.png
优惠券 UI 接近 youhuiquan.png
pnpm build:mp 通过
微信开发者工具从 profile 实测跳转正常
```
