# Day 4 用户端首页 UI 直接执行行动计划

## 1. 执行目标

本计划基于 `docs/ui/day4-ui-home.md`，用于直接改造当前首页：

```txt
miniapp/src/pages/home/index.vue
```

目标是把当前“欢迎语 + 分类宫格 + 活动占位 + 热门服务”的首页，改造成参考 `home1.png`、`home2.png`、`home3.png` 的家政服务首页样式。

最终页面应具备：

```txt
始终可见的地址 + 搜索 + 购物车顶部模块
日常保洁 banner
服务保障横条
15 项服务分类宫格
家政通卡片
附近师傅 / 直选服务 / 换季热推运营卡片
优惠次卡卡片
保留当前热门服务列表
接口失败时首页主体仍能展示
```

## 2. 本次改动文件

优先只改两个文件：

```txt
miniapp/src/pages/home/index.vue
miniapp/uno.config.ts
```

不建议本轮改动：

```txt
miniapp/src/components/service-category-grid/service-category-grid.vue
miniapp/src/components/service-card/service-card.vue
```

原因：

```txt
service-category-grid 当前是 4 列布局，并且点击分类会跳转 /pages/service/detail?id=分类id
首页参考图需要 5 列宫格，且当前项目没有分类列表页
因此首页先在 home/index.vue 内写专属宫格，避免影响其它页面
service-card 继续只用于底部热门服务列表
```

## 3. 执行顺序总览

按以下顺序执行：

```txt
Step 1：补充首页静态配置和类型
Step 2：调整数据加载策略，接口失败不再隐藏整个首页
Step 3：新增首页交互方法
Step 4：重写 template 页面结构
Step 5：补充图标 safelist
Step 6：执行 type-check
Step 7：执行 build:mp
Step 8：导入微信开发者工具查看 dist/build/mp-weixin
```

## 4. Step 1：补充首页静态配置和类型

在 `miniapp/src/pages/home/index.vue` 的 `<script setup>` 中增加本地类型。

建议类型：

```ts
interface HomeCategoryItem {
  id: number
  name: string
  icon: string
  color: string
  bg: string
}

interface HomePromoTile {
  title: string
  desc: string
  color: string
  bg: string
}

interface HomePassCard {
  name: string
  count: string
  price: string
  desc: string
}

interface HomeStaffAvatar {
  name: string
  color: string
}
```

新增静态配置：

```ts
const defaultAddress = ref('吉林大学(南岭校区)')
const cartCount = ref(0)

const bannerConfig = {
  title: '日常保洁服务',
  price: '50',
  unit: '元 / 小时',
  desc: '3小时起约',
  actionText: '立即抢购',
}

const guaranteeItems = [
  { label: '不满意重做', icon: 'i-carbon-checkmark-outline' },
  { label: '过期退', icon: 'i-carbon-time' },
  { label: '随时退', icon: 'i-carbon-checkmark-outline' },
  { label: '全场保障', icon: 'i-carbon-security' },
]
```

服务分类 fallback 配置：

```ts
const fallbackCategories: HomeCategoryItem[] = [
  { id: -1, name: '爱宠服务', icon: 'i-carbon-pet-image-b', color: '#FF7A59', bg: '#FFF1EC' },
  { id: -2, name: '窗帘清洗', icon: 'i-carbon-clean', color: '#1677FF', bg: '#EAF3FF' },
  { id: -3, name: '收纳整理', icon: 'i-carbon-store', color: '#8B5CF6', bg: '#F1ECFF' },
  { id: -4, name: '家居养护', icon: 'i-carbon-home', color: '#EF3D45', bg: '#FFECEF' },
  { id: -5, name: '开荒保洁', icon: 'i-carbon-clean', color: '#20C997', bg: '#E9FBF5' },
  { id: -6, name: '深度保洁', icon: 'i-carbon-tools', color: '#F5A623', bg: '#FFF6E8' },
  { id: -7, name: '日常保洁', icon: 'i-carbon-clean', color: '#1677FF', bg: '#EAF3FF' },
  { id: -8, name: '衣物洗护', icon: 'i-carbon-store', color: '#4D8DFF', bg: '#EDF4FF' },
  { id: -9, name: '保姆月嫂', icon: 'i-carbon-user-avatar', color: '#EC4899', bg: '#FDECF6' },
  { id: -10, name: '上门美业', icon: 'i-carbon-star', color: '#8B5CF6', bg: '#F1ECFF' },
  { id: -11, name: '上门安装', icon: 'i-carbon-tools', color: '#F5A623', bg: '#FFF6E8' },
  { id: -12, name: '搬家拉货', icon: 'i-carbon-delivery', color: '#FF7A59', bg: '#FFF1EC' },
  { id: -13, name: '上门维修', icon: 'i-carbon-tools', color: '#1677FF', bg: '#EAF3FF' },
  { id: -14, name: '家电清洗', icon: 'i-carbon-clean', color: '#20C997', bg: '#E9FBF5' },
  { id: -15, name: '家庭保洁', icon: 'i-carbon-home', color: '#EF3D45', bg: '#FFECEF' },
]
```

家政通配置：

```ts
const housekeepingItems: HomeCategoryItem[] = [
  { id: -101, name: '爱宠服务', icon: 'i-carbon-pet-image-b', color: '#FF7A59', bg: '#FFF1EC' },
  { id: -102, name: '厨房深度', icon: 'i-carbon-clean', color: '#1F2937', bg: '#F3F4F6' },
  { id: -103, name: '收纳整洁', icon: 'i-carbon-store', color: '#1F2937', bg: '#F3F4F6' },
  { id: -104, name: '搬家拉货', icon: 'i-carbon-delivery', color: '#FF7A59', bg: '#FFF1EC' },
  { id: -105, name: '家庭保洁', icon: 'i-carbon-home', color: '#1677FF', bg: '#EAF3FF' },
]
```

运营卡片配置：

```ts
const nearbyStaff = [
  { name: '洁', color: '#EF3D45' },
  { name: '净', color: '#E5E7EB' },
  { name: '修', color: '#C8171D' },
  { name: '护', color: '#C8171D' },
]

const directServicePromotions: HomePromoTile[] = [
  { title: '60min', desc: '新人特惠', color: '#FFFFFF', bg: '#8FD17F' },
  { title: '家务我来', desc: '全屋净洗', color: '#FFFFFF', bg: '#FF7A59' },
]

const seasonalPromotions: HomePromoTile[] = [
  { title: '新居开荒', desc: '玻璃清洁', color: '#FFFFFF', bg: '#F5A623' },
  { title: '洗护到家', desc: '取送洗护', color: '#FFFFFF', bg: '#6BAAFB' },
]
```

优惠次卡配置：

```ts
const cardPassItems: HomePassCard[] = [
  { name: '家庭保洁', count: '10次', price: '¥1080', desc: '低至108元/次' },
  { name: '家庭保洁Plus', count: '20次', price: '¥2160', desc: '低至108元/次' },
]
```

## 5. Step 2：调整数据加载策略

当前首页存在的问题：

```txt
loading-state 包住了整个页面主体
只要接口失败就展示 error empty-state
这会导致首页运营模块全部消失
```

修改目标：

```txt
顶部模块、banner、服务宫格、运营卡片、优惠次卡始终展示
接口只影响热门服务列表和接口分类数据
分类接口为空时使用 fallbackCategories
服务接口失败时只在热门服务区域提示加载失败
```

新增 computed：

```ts
const displayCategories = computed<HomeCategoryItem[]>(() => {
  if (!categories.value.length)
    return fallbackCategories

  return categories.value.slice(0, 15).map((item, index) => {
    const fallback = fallbackCategories[index] || fallbackCategories[0]
    return {
      id: item.id,
      name: item.name || fallback.name,
      icon: item.icon || fallback.icon,
      color: fallback.color,
      bg: fallback.bg,
    }
  })
})

const hasHotServices = computed(() => services.value.length > 0)
```

调整 `isEmpty`：

```txt
不再使用 isEmpty 控制整个页面
可以删除 isEmpty，或只用于热门服务区域
```

保留 `loadData()`：

```txt
继续调用 getServiceCategories()
继续调用 getServices({ page: 1, pageSize: 10 })
catch 中继续设置 isError = true
但 template 不再因为 isError 隐藏整页内容
```

## 6. Step 3：新增首页交互方法

在 `home/index.vue` 中新增：

```ts
function showTodo(title: string) {
  uni.showToast({
    icon: 'none',
    title,
  })
}

function onAddressTap() {
  uni.navigateTo({ url: '/pages/address/list?mode=select' })
}

function onSearchTap() {
  showTodo('搜索功能建设中')
}

function onCartTap() {
  showTodo('购物车功能建设中')
}

function onCategoryTap(item: HomeCategoryItem) {
  showTodo(`${item.name}服务建设中`)
}

function onBannerTap() {
  if (services.value[0]?.id) {
    uni.navigateTo({ url: `/pages/service/detail?id=${services.value[0].id}` })
    return
  }

  showTodo('活动服务建设中')
}

function onOperationTap(title: string) {
  showTodo(`${title}建设中`)
}

function onPassCardTap(item: HomePassCard) {
  showTodo(`${item.name}建设中`)
}
```

说明：

```txt
地址页已存在，可以直接跳转 /pages/address/list?mode=select
搜索页、购物车页、附近师傅页、次卡页当前不存在，先 toast 占位
分类页当前不存在，不要跳转 /pages/service/detail?id=分类id
```

## 7. Step 4：重写首页 template

将当前 template 替换为以下结构。

顶层结构：

```txt
view.min-h-screen bg-[#F5F7FA] pb-[120rpx]
  sticky header
  scroll content
    banner
    guarantee strip
    service category card
    housekeeping card
    operation cards
    pass card
    hot service area
```

### 7.1 顶部地址搜索模块

结构：

```txt
<view class="sticky top-0 z-20 bg-[#FF373D] pt-safe px-[28rpx] pb-[24rpx]">
  地址行
  搜索 + 购物车行
</view>
```

地址行：

```txt
左侧 i-carbon-location
中间 defaultAddress
右侧 i-carbon-chevron-down
```

搜索行：

```txt
白色圆角搜索框
  i-carbon-search
  关键词搜索服务
右侧购物车按钮
  i-carbon-shopping-cart
  cartCount 角标
```

验收：

```txt
滚动到页面中下部时，地址和搜索模块仍停留在顶部
顶部红色接近参考图
搜索框高度约 76rpx，圆角为 full
```

### 7.2 Banner

放在顶部模块下方：

```txt
mx-[24rpx] mt-[20rpx]
白色/浅蓝服务 banner
左侧文案：日常保洁服务、50 元 / 小时、3小时起约、立即抢购
右侧用清洁服务插画式占位
```

建议使用 `style` 写渐变，减少 Uno 任意值兼容风险：

```txt
style="background: linear-gradient(135deg, #EAF9FF 0%, #FFFFFF 48%, #D9F3EA 100%);"
```

验收：

```txt
banner 不使用纯空白块
有价格和按钮
整体圆角 24rpx
```

### 7.3 保障说明横条

内容：

```txt
不满意重做
过期退
随时退
全场保障
```

样式：

```txt
mx-[24rpx]
mt-[18rpx]
四列 flex
文字红色 #EF3D45
图标 26-30rpx
```

### 7.4 服务分类宫格

不要使用当前 `service-category-grid` 组件，直接在首页写 5 列。

结构：

```txt
白色卡片
grid grid-cols-5
v-for displayCategories
每项：
  圆形浅色 icon 容器
  Carbon icon
  分类名称
```

关键验收：

```txt
15 项时为 5 列 3 行
文字不溢出
图标大小统一
接口有分类时显示接口分类
接口无分类时显示 fallbackCategories
```

### 7.5 家政通卡片

结构：

```txt
白色卡片
顶部：
  左：家政通
  右：平台安全保障
底部：
  5 列入口
```

内容：

```txt
爱宠服务
厨房深度
收纳整洁
搬家拉货
家庭保洁
```

### 7.6 运营卡片区

使用两列布局：

```txt
view.flex gap-[20rpx] mx-[24rpx] mt-[22rpx]
  左列 flex-1：附近师傅大卡
  右列 flex-1：直选服务卡 + 换季热推卡
```

附近师傅：

```txt
标题：附近师傅
副标题：全程保障,放心直约上门
中间：红色主视觉占位块
底部：4 个圆形头像/状态点
```

直选服务：

```txt
标题：直选服务
标签：品质保障
2 个活动图块
```

换季热推：

```txt
标题：换季热推
标签：取送洗护
2 个活动图块
```

注意：

```txt
右侧两张小卡高度之和要接近左侧大卡
移动端不能出现文字挤出卡片
图片素材未提供时，用彩色色块和短文案占位
```

### 7.7 优惠次卡模块

结构：

```txt
白色卡片
顶部：
  左：优惠次卡
  右：更多 + i-carbon-arrow-right
底部：
  两张红色卡券
```

卡券内容：

```txt
家庭保洁
10次
¥1080
低至108元/次

家庭保洁Plus
20次
¥2160
低至108元/次
```

视觉：

```txt
卡券背景 #FF373D
文字白色
价格字号最大
两张卡券横向并排
```

### 7.8 热门服务区域

将当前热门服务列表移动到最后。

结构：

```txt
标题：热门服务

if loading:
  loading-state
else if isError:
  小型错误卡片 + 重试按钮
else if !hasHotServices:
  小型空状态：热门服务即将上线
else:
  service-card 列表
```

不要再让 `empty-state` 占满整个首页。

## 8. Step 5：补充 UnoCSS 图标 safelist

在 `miniapp/uno.config.ts` 的 `safelist` 中确认已有和新增以下图标。

已有可保留：

```txt
i-carbon-home
i-carbon-document
i-carbon-user
i-carbon-user-avatar
i-carbon-chevron-right
i-carbon-location
i-carbon-store
i-carbon-settings
```

本次需要新增：

```txt
i-carbon-search
i-carbon-shopping-cart
i-carbon-chevron-down
i-carbon-checkmark-outline
i-carbon-security
i-carbon-clean
i-carbon-pet-image-b
i-carbon-tools
i-carbon-delivery
i-carbon-star
i-carbon-ticket
i-carbon-arrow-right
```

原因：

```txt
首页分类和运营卡片会通过数据中的 icon 字段动态绑定 class
动态 class 不进入 safelist 时，小程序构建后可能不生成对应图标 CSS
```

## 9. Step 6：执行类型检查

执行：

```bash
cd miniapp
pnpm type-check
```

重点检查：

```txt
HomeCategoryItem / HomePassCard 等类型是否正确
displayCategories computed 返回类型是否正确
ServiceCategory.icon 为空时是否有 fallback
template 中 v-for key 是否稳定
```

## 10. Step 7：执行小程序构建

执行：

```bash
cd miniapp
pnpm build:mp
```

构建产物：

```txt
D:\Code Program\Life_assistant\miniapp\dist\build\mp-weixin
```

注意：

```txt
不要查看 dist/dev/mp-weixin
dist/dev/mp-weixin 可能仍是旧 UI
```

## 11. Step 8：微信开发者工具验收

使用测试 AppID：

```txt
touristappid
```

导入目录：

```txt
D:\Code Program\Life_assistant\miniapp\dist\build\mp-weixin
```

验收页面：

```txt
首页首屏
向下滚动到家政通 / 附近师傅区域
继续滚动到优惠次卡区域
底部热门服务区域
```

## 12. 最终验收清单

必须满足：

```txt
首页顶部红色地址搜索模块始终可见
地址显示：吉林大学(南岭校区)
搜索占位显示：关键词搜索服务
购物车入口显示，角标为 0
banner 显示日常保洁服务、50 元 / 小时、3小时起约、立即抢购
保障说明显示 4 项：不满意重做、过期退、随时退、全场保障
服务分类为 5 列，最多 15 项
家政通卡片显示 5 个入口
附近师傅、直选服务、换季热推卡片显示完整
优惠次卡显示两张红色卡券
热门服务列表仍能展示接口数据
接口失败时首页主体不空白
所有功能占位点击都有 toast 或有效跳转
页面文字没有明显溢出、重叠、乱码新增问题
pnpm type-check 通过
pnpm build:mp 通过
```

## 13. 暂不实现内容

本轮不新增真实页面：

```txt
搜索页
购物车页
分类服务列表页
附近师傅列表页
次卡详情页
运营活动详情页
```

本轮不接入真实接口：

```txt
真实定位
购物车数量
附近师傅
直选服务运营图
换季热推运营图
次卡列表
```

这些入口先用 toast 占位，等首页视觉确认后再逐个接入。
