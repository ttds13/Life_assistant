# Day 1 小程序地基搭建行动计划

## 1. 文档目标

本文档是 Day 1 小程序端的完整行动计划，基于 `temp_unibest` 框架裁剪改造。

Day 1 小程序端目标：

```txt
框架裁剪完成，项目能启动
请求封装匹配后端统一响应格式
Tabbar 配置为生活助手三 Tab
首页能展示真实服务分类和服务列表
加载、空状态、错误状态可用
H5 和微信小程序双端可构建
```

本计划对应 `docs/plan/day1.md` 第 6 小时的工作内容。

---

## 2. 总体思路

```txt
temp_unibest 复制为 miniapp/
-> 删除示例业务代码
-> 保留框架基础能力
-> 改造请求层匹配后端统一响应
-> 改造 Tabbar 为首页/订单/我的
-> 新建 Day 1 页面和组件
-> 新建 API 模块对接后端服务接口
-> 验证 H5 和微信小程序双端启动
-> 验证前后端数据链路
```

---

## 3. 保留的内容（框架地基）

### 3.1 根目录配置文件（全部保留）

| 文件 | 作用 | Day 1 操作 |
|------|------|------------|
| `vite.config.ts` | 构建配置核心 | 不改动 |
| `pages.config.ts` | 页面路由配置 | 修改 globalStyle.navigationBarTitleText |
| `manifest.config.ts` | 小程序/App 配置 | 替换 appid 和名称 |
| `uno.config.ts` | UnoCSS 原子化 CSS | 加入 safelist 图标 |
| `tsconfig.json` | TypeScript 配置 | 不改动 |
| `index.html` | H5 入口 | 不改动 |
| `package.json` | 依赖管理 | 修改 name/description，移除无用依赖 |
| `pnpm-lock.yaml` | 锁定依赖版本 | pnpm install 后自动更新 |
| `.npmrc` | pnpm 配置 | 不改动 |
| `.editorconfig` | 编辑器统一配置 | 不改动 |
| `.gitignore` | Git 忽略规则 | 补充生活助手相关规则 |
| `eslint.config.mjs` | ESLint 配置 | 不改动 |

### 3.2 env/ 目录（保留结构，替换内容）

Day 1 环境变量配置：

```env
# env/.env（通用）
VITE_APP_TITLE=生活助手
VITE_UNI_APPID=__UNI__LIFE_ASSISTANT
VITE_WX_APPID=你的微信AppID
VITE_APP_PORT=5173
VITE_APP_PROXY_ENABLE=true
VITE_APP_PROXY_PREFIX=/api
VITE_DELETE_CONSOLE=false
VITE_APP_PUBLIC_BASE=/
VITE_FALLBACK_LOCALE=zh-Hans
VITE_AUTH_MODE=single
```

```env
# env/.env.development
VITE_SERVER_BASEURL=http://localhost:3000/api
```

```env
# env/.env.production
VITE_SERVER_BASEURL=https://你的域名/api
```

```env
# env/.env.test
VITE_SERVER_BASEURL=https://test.你的域名/api
```

对应 `docs/plan/day1.md` 要求：配置 API baseUrl。

### 3.3 scripts/ 目录（全部保留）

| 文件 | 作用 |
|------|------|
| `scripts/upload-weixin.js` | 微信小程序 CI 上传 |
| `scripts/open-dev-tools.js` | 自动打开微信开发者工具 |
| `scripts/create-base-files.js` | 初始化基础文件 |
| `scripts/bump-version.js` | 版本号管理 |
| `scripts/postupgrade.js` | uni-app 升级辅助 |
| `scripts/vite-plugin-eruda.js` | H5 调试面板 |

### 3.4 vite-plugins/ 目录（全部保留）

| 文件 | 作用 |
|------|------|
| `vite-plugins/copy-native-resources.ts` | App 原生资源复制 |
| `vite-plugins/sync-manifest-plugins.ts` | manifest 同步 |

### 3.5 src/ 核心基础设施

| 目录/文件 | 操作 | 说明 |
|-----------|------|------|
| `src/main.ts` | 保留 | 应用入口 |
| `src/App.vue` | 保留 | 根组件 |
| `src/App.ku.vue` | 保留 | uni-ku/root 配套 |
| `src/env.d.ts` | 保留 | 环境变量类型声明 |
| `src/typings.d.ts` | 保留 | 全局类型 |
| `src/typings.ts` | 保留 | 全局类型 |
| `src/uni.scss` | 改造 | 加入生活助手设计变量 |
| `src/http/` | 改造 | 匹配后端统一响应格式 |
| `src/router/` | 保留 | 路由拦截器 |
| `src/store/` | 改造 | 精简为单 token 模式 |
| `src/tabbar/` | 改造 | 三 Tab：首页/订单/我的 |
| `src/hooks/` | 保留 | useRequest/useScroll/useUpload |
| `src/utils/` | 保留 | 工具函数 |
| `src/layouts/` | 保留 | 页面布局 |
| `src/style/` | 改造 | 加入设计规范变量 |
| `src/types/` | 保留 | 自动生成的类型声明 |
| `src/uni_modules/` | 保留 | uni 模块占位 |
| `src/static/` | 保留结构 | 后续替换图片资源 |

### 3.6 工程化配置（保留）

```txt
.husky/          # Git hooks
.commitlintrc.cjs # 提交信息规范
.vscode/         # 编辑器配置和代码片段
```

---

## 4. 删除的内容（示例业务代码）

### 4.1 示例页面

```txt
删除 src/pages/index/index.vue     # unibest 介绍页
删除 src/pages/about/about.vue     # 框架关于页
删除 src/pages/me/me.vue           # 示例个人页
删除 src/pages/about/              # 整个目录
删除 src/pages/index/              # 整个目录（新建 home 替代）
删除 src/pages/me/                 # 整个目录
```

### 4.2 示例 API 和 Service

```txt
删除 src/api/foo.ts                # 示例接口
删除 src/api/foo-alova.ts          # alova 示例
删除 src/api/login.ts              # 示例登录（Day 2 重写）
删除 src/api/types/                # 示例类型目录
删除 src/service/                  # openapi 生成的示例，整个目录
```

### 4.3 alova 相关（Day 1 只用 http.ts 封装）

```txt
删除 src/http/alova.ts             # alova 请求实例
删除 src/http/vue-query.ts         # vue-query 封装
```

### 4.4 无关配置

```txt
删除 .changeset/                   # 开源版本发布，私有项目不需要
删除 .cursor/                      # Cursor IDE 规则
删除 .trae/                        # Trae IDE 规则
删除 openapi-ts-request.config.ts  # openapi 代码生成
删除 LICENSE                       # 替换为自己的
```

### 4.5 package.json 移除的依赖

```txt
移除 @alova/adapter-uniapp
移除 @alova/shared
移除 alova
移除 @changesets/cli
移除 vue-i18n（Day 1 不需要国际化）
移除 openapi-ts-request（devDependencies）
```

保留的关键依赖：

```txt
# 运行时核心
vue
pinia
pinia-plugin-persistedstate
vue-router
dayjs
z-paging

# uni-app
@dcloudio/uni-app
@dcloudio/uni-h5
@dcloudio/uni-mp-weixin
@dcloudio/uni-components

# 开发工具
vite
typescript
sass
unocss
eslint
unplugin-auto-import
@uni-helper/* 系列
husky
commitlint
```

---

## 5. 改造的内容（匹配项目规范）

### 5.1 请求层改造 — 匹配后端统一响应

对应 `docs/standards/development.md` 第 5.5 节和 `docs/plan/day1.md` 第 13 节。

#### 5.1.1 src/http/types.ts

替换为：

```typescript
export type CustomRequestOptions = UniApp.RequestOptions & {
  query?: Record<string, any>
  hideErrorToast?: boolean
} & IUniUploadFileOptions

export type CustomRequestOptions_ = Omit<CustomRequestOptions, 'url'>

// 统一响应格式（匹配 NestJS 后端 ResponseTransformInterceptor）
export interface IResponse<T = any> {
  code: number
  message: string
  data: T
  requestId: string
  timestamp: string
}

// 分页响应格式
export interface IPageData<T = any> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

// 分页请求参数
export interface PageParams {
  page?: number
  pageSize?: number
  keyword?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  [key: string]: any
}
```

#### 5.1.2 src/http/http.ts 改造要点

```txt
成功判断：code === 0
错误提示：使用 responseData.message
401 处理：清除 token，跳转登录页
403 处理：提示无权限
网络错误：提示"网络错误，换个网络试试"
去掉双 token 刷新逻辑（Day 1 不需要）
保留 httpGet/httpPost/httpPut/httpDelete
```

#### 5.1.3 src/http/interceptor.ts 改造要点

```txt
保留 baseUrl 拼接逻辑
保留 H5 代理逻辑
保留 token 注入逻辑
新增 X-Request-Source: miniapp 请求头
新增 X-Client-Version: 1.0.0 请求头
超时时间保持 60s
```

对应 `docs/standards/development.md` 第 5.7 节：

```txt
所有请求带 Authorization: Bearer <token>
所有请求带 X-Request-Source: miniapp
所有请求带 X-Client-Version: 1.0.0
```

### 5.2 Tabbar 改造

对应 `docs/plan/day1.md` 第 14.1 节：首页 / 订单 / 我的。

#### src/tabbar/config.ts

```typescript
export const selectedTabbarStrategy = TABBAR_STRATEGY_MAP.CUSTOM_TABBAR

export const customTabbarList: CustomTabBarItem[] = [
  {
    text: '首页',
    pagePath: 'pages/home/index',
    iconType: 'unocss',
    icon: 'i-carbon-home',
  },
  {
    text: '订单',
    pagePath: 'pages/order/list',
    iconType: 'unocss',
    icon: 'i-carbon-document',
  },
  {
    text: '我的',
    pagePath: 'pages/profile/index',
    iconType: 'unocss',
    icon: 'i-carbon-user',
  },
]
```

同步修改 `nativeTabbarList` 保持一致（兼容原生 tabbar 模式）。

### 5.3 Store 改造

#### src/store/token.ts 精简

Day 1 只保留单 token 模式：

```txt
保留 tokenInfo（单 token：{ token, expiresIn }）
保留 setTokenInfo
保留 login 方法签名（Day 2 实现）
保留 logout
保留 hasLogin 判断
保留 validToken getter
移除双 token 相关逻辑
移除 refreshToken 方法
移除 isRefreshTokenExpired
移除 wxLogin（Day 2 实现）
```

#### src/store/user.ts 精简

```txt
保留 userInfo ref
保留 setUserInfo
保留 clearUserInfo
保留 fetchUserInfo 方法签名（Day 2 实现）
修改 IUserInfoRes 为生活助手用户模型：
  userId
  phone
  nickname
  avatar
  role（user / staff）
```

### 5.4 pages.config.ts 改造

```typescript
import { defineUniPages } from '@uni-helper/vite-plugin-uni-pages'
import { tabBar } from './src/tabbar/config'

export default defineUniPages({
  globalStyle: {
    navigationStyle: 'default',
    navigationBarTitleText: '生活助手',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
    backgroundColor: '#F5F7FA',
  },
  easycom: {
    autoscan: true,
    custom: {
      '^fg-(.*)': '@/components/fg-$1/fg-$1.vue',
      '^(?!z-paging-refresh|z-paging-load-more)z-paging(.*)':
        'z-paging/components/z-paging$1/z-paging$1.vue',
    },
  },
  tabBar: tabBar as any,
})
```

### 5.5 样式改造

对应 `docs/ui/mvp.md` 第 7 节基础视觉规范。

#### src/uni.scss 追加

```scss
// 生活助手设计规范色彩
$la-primary: #1677FF;
$la-primary-light: #EAF3FF;
$la-success: #16A34A;
$la-warning: #F59E0B;
$la-error: #EF4444;
$la-text-primary: #1F2937;
$la-text-secondary: #6B7280;
$la-text-weak: #9CA3AF;
$la-border: #E5E7EB;
$la-page-bg: #F5F7FA;
$la-card-bg: #FFFFFF;
```

#### src/style/index.scss 追加

```scss
// 生活助手全局基础样式
page {
  background-color: #F5F7FA;
  font-size: 28rpx;
  color: #1F2937;
}

// 间距规范
$la-page-padding: 32rpx;
$la-card-padding: 32rpx;
$la-card-radius: 16rpx;
$la-module-gap: 24rpx;
$la-list-gap: 16rpx;
$la-button-height: 88rpx;

// 字体层级
$la-font-title: 40rpx;
$la-font-subtitle: 34rpx;
$la-font-body: 30rpx;
$la-font-caption: 26rpx;
$la-font-small: 24rpx;
$la-font-price: 44rpx;
```

### 5.6 uno.config.ts 追加 safelist

```typescript
// 在 safelist 中加入 tabbar 图标
safelist: [
  'i-carbon-home',
  'i-carbon-document',
  'i-carbon-user',
]
```

---

## 6. 新增的内容（Day 1 业务骨架）

### 6.1 新增页面

对应 `docs/plan/day1.md` 第 14.2 节。

#### 6.1.1 src/pages/home/index.vue — 生活助手首页

页面结构（对应 `docs/plan/day1.md` 第 14.3 节）：

```txt
顶部：城市定位 / 问候语（Day 1 写死文案）
搜索框（Day 1 占位，不实现搜索）
服务分类宫格（请求 GET /api/service-categories）
优惠活动占位（Day 1 静态占位）
热门服务卡片列表（请求 GET /api/services）
底部 Tab
```

页面状态：

```txt
加载中 -> loading-state 组件
数据为空 -> empty-state 组件
请求失败 -> empty-state 组件（错误模式）
正常展示 -> 分类宫格 + 服务卡片
```

页面配置：

```typescript
definePage({
  type: 'home',
  style: {
    navigationStyle: 'custom',
    navigationBarTitleText: '生活助手',
  },
})
```

#### 6.1.2 src/pages/service/detail.vue — 服务详情

Day 1 只做占位页面：

```txt
接收 serviceId 参数
展示服务名称和价格
底部"立即预约"按钮（Day 1 不跳转）
```

页面配置：

```typescript
definePage({
  style: {
    navigationBarTitleText: '服务详情',
  },
})
```

#### 6.1.3 src/pages/order/list.vue — 订单列表

Day 1 只做占位页面：

```txt
展示空状态组件
文案："暂无订单，去首页看看吧"
```

页面配置：

```typescript
definePage({
  style: {
    navigationBarTitleText: '我的订单',
  },
})
```

#### 6.1.4 src/pages/profile/index.vue — 我的

Day 1 只做占位页面：

```txt
头像占位
昵称："未登录"
手机号占位
功能入口列表（静态）：
  我的地址
  我的优惠券
  联系客服
  关于我们
```

页面配置：

```typescript
definePage({
  style: {
    navigationBarTitleText: '我的',
  },
})
```

### 6.2 新增组件

对应 `docs/plan/day1.md` 第 14.4 节和 `docs/ui/mvp.md` 第 10.2 节。

组件命名遵循 unibest easycom 规范：目录名和文件名一致。

#### 6.2.1 src/components/service-category-grid/service-category-grid.vue

```txt
Props:
  categories: ServiceCategory[]
  loading: boolean

功能：
  4 列宫格展示服务分类
  每项：图标 + 名称
  点击跳转服务详情或分类筛选（Day 1 跳服务详情占位）

视觉：
  卡片背景白色
  圆角 16rpx
  内边距 32rpx
  图标 80rpx x 80rpx
  名称 26rpx 居中
```

#### 6.2.2 src/components/service-card/service-card.vue

```txt
Props:
  service: Service

功能：
  展示服务封面图、名称、描述、价格
  点击跳转服务详情页

视觉：
  白色卡片
  圆角 16rpx
  封面图高度 200rpx
  名称 30rpx 加粗
  描述 26rpx 灰色 单行省略
  价格使用 price-text 组件
  底部间距 16rpx
```

#### 6.2.3 src/components/price-text/price-text.vue

```txt
Props:
  price: number
  unit: string（默认 "起"）
  size: 'sm' | 'md' | 'lg'（默认 'md'）

功能：
  展示 ¥ 符号 + 价格数字 + 单位
  价格保留两位小数（整数不显示小数）

视觉：
  ¥ 符号小字
  价格数字大字加粗 主色
  单位小字灰色
```

#### 6.2.4 src/components/empty-state/empty-state.vue

```txt
Props:
  type: 'empty' | 'error' | 'network'（默认 'empty'）
  title: string
  description: string
  showRetry: boolean（默认 false）

Emits:
  retry

功能：
  居中展示图标/插图 + 标题 + 描述
  error/network 模式显示重试按钮

视觉：
  图标 200rpx
  标题 30rpx
  描述 26rpx 灰色
  重试按钮主色
```

#### 6.2.5 src/components/loading-state/loading-state.vue

```txt
Props:
  loading: boolean
  text: string（默认 "加载中..."）

功能：
  loading 为 true 时展示加载动画和文案
  loading 为 false 时展示 slot 内容

视觉：
  居中 loading 图标
  文案 26rpx 灰色
```

### 6.3 新增 API 模块

对应 `docs/standards/development.md` 第 5.7 节前端请求规范。

#### 6.3.1 src/api/types/common.ts

```typescript
// 统一分页请求参数
export interface PageParams {
  page?: number
  pageSize?: number
  keyword?: string
  [key: string]: any
}

// 统一分页响应数据
export interface PageData<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}
```

#### 6.3.2 src/api/types/services.ts

对应 `docs/plan/day1.md` 第 11.3 和 11.4 节数据模型。

```typescript
// 服务分类
export interface ServiceCategory {
  id: number
  name: string
  icon: string
  sortOrder: number
  status: number
}

// 服务项目
export interface Service {
  id: number
  categoryId: number
  name: string
  description: string
  basePrice: number
  priceUnit: string
  coverImage: string
  status: number
  sortOrder: number
}

// 服务列表查询参数
export interface QueryServicesParams {
  keyword?: string
  categoryId?: number
  status?: number
  page?: number
  pageSize?: number
}
```

#### 6.3.3 src/api/services.ts

对应 `docs/plan/day1.md` 第 12 节后端接口。

```typescript
import type { PageData } from './types/common'
import type { QueryServicesParams, Service, ServiceCategory } from './types/services'
import { http } from '@/http/http'

// 获取服务分类列表
export function getServiceCategories() {
  return http.get<ServiceCategory[]>('/service-categories')
}

// 获取服务列表（分页）
export function getServices(params?: QueryServicesParams) {
  return http.get<PageData<Service>>('/services', params)
}

// 获取服务详情
export function getServiceDetail(id: number) {
  return http.get<Service>(`/services/${id}`)
}
```

### 6.4 新增 Store（可选）

#### src/store/services.ts（Day 1 可选，首页直接调 API 也行）

```txt
如果首页逻辑简单，Day 1 直接在页面 onLoad 中调用 API 即可。
不强制建 store，避免过度设计。
后续服务收藏、搜索历史等需要持久化时再建。
```

---

## 7. 请求层完整改造方案

### 7.1 http.ts 改造后的核心逻辑

```typescript
// 响应成功判断
success: async (res) => {
  const responseData = res.data as IResponse<T>

  // HTTP 状态码非 2xx
  if (res.statusCode < 200 || res.statusCode >= 300) {
    // 401 跳登录
    if (res.statusCode === 401) {
      const tokenStore = useTokenStore()
      tokenStore.logout()
      toLoginPage()
      return reject(responseData)
    }
    // 其他 HTTP 错误
    !options.hideErrorToast && uni.showToast({
      icon: 'none',
      title: responseData?.message || '请求错误',
    })
    return reject(responseData)
  }

  // 业务码判断：code === 0 为成功
  if (responseData.code === 0) {
    return resolve(responseData.data)
  }

  // 业务码 401：token 过期
  if (responseData.code === 20001 || responseData.code === 20002) {
    const tokenStore = useTokenStore()
    tokenStore.logout()
    toLoginPage()
    return reject(responseData)
  }

  // 其他业务错误
  !options.hideErrorToast && uni.showToast({
    icon: 'none',
    title: responseData.message || '请求错误',
  })
  return reject(responseData)
}
```

### 7.2 interceptor.ts 改造后的请求头

```typescript
// 添加统一请求头
options.header = {
  ...options.header,
  'X-Request-Source': 'miniapp',
  'X-Client-Version': '1.0.0',
}

// 添加 token
const tokenStore = useTokenStore()
const token = tokenStore.validToken
if (token) {
  options.header.Authorization = `Bearer ${token}`
}
```

---

## 8. 首页实现方案

对应 `docs/plan/day1.md` 第 14.3 节和 `docs/ui/mvp.md` 第 8.2.1 节。

### 8.1 首页数据流

```txt
onLoad
-> 同时请求 getServiceCategories() 和 getServices()
-> 请求中：显示 loading-state
-> 请求成功：渲染分类宫格 + 服务卡片
-> 请求失败：显示 empty-state（error 模式，带重试按钮）
-> 数据为空：显示 empty-state（empty 模式）
```

### 8.2 首页布局结构

```txt
<view class="page-home">
  <!-- 顶部问候 -->
  <view class="home-header">
    <text>你好，欢迎使用生活助手</text>
  </view>

  <!-- 搜索框占位 -->
  <view class="search-bar">
    <text>搜索服务...</text>
  </view>

  <!-- 服务分类宫格 -->
  <service-category-grid :categories="categories" :loading="loading" />

  <!-- 优惠活动占位 -->
  <view class="activity-placeholder">
    <text>新用户专享优惠</text>
  </view>

  <!-- 热门服务 -->
  <view class="section-title">热门服务</view>
  <view class="service-list">
    <service-card v-for="item in services" :key="item.id" :service="item" />
  </view>

  <!-- 状态处理 -->
  <loading-state :loading="loading" />
  <empty-state v-if="!loading && isEmpty" type="empty" title="暂无服务" />
  <empty-state v-if="!loading && isError" type="error" title="加载失败" show-retry @retry="loadData" />
</view>
```

### 8.3 首页视觉规范

```txt
页面背景：#F5F7FA
顶部问候区：白色背景，padding 32rpx
搜索框：圆角 40rpx，灰色背景 #F0F2F5，高度 72rpx
分类宫格：白色卡片，4 列，圆角 16rpx
活动占位：圆角 16rpx，高度 160rpx，浅蓝背景
服务卡片：白色卡片，圆角 16rpx，间距 16rpx
unibest" -Destination "miniapp" -Recurse
```

### Step 2：删除示例代码（5 分钟）

```powershell
# 删除示例页面
Remove-Item -Recurse -Force "miniapp/src/pages/about"
Remove-Item -Recurse -Force "miniapp/src/pages/index"
Remove-Item -Recurse -Force "miniapp/src/pages/me"

# 删除示例 API 和 Service
Remove-Item -Force "miniapp/src/api/foo.ts"
Remove-Item -Force "miniapp/src/api/foo-alova.ts"
Remove-Item -Force "miniapp/src/api/login.ts"
Remove-Item -Recurse -Force "miniapp/src/api/types"
Remove-Item -Recurse -Force "miniapp/src/service"

# 删除 alova 相关
Remove-Item -Force "miniapp/src/http/alova.ts"
Remove-Item -Force "miniapp/src/http/vue-query.ts"

# 删除无关配置
Remove-Item -Recurse -Force "miniapp/.changeset"
Remove-Item -Recurse -Force "miniapp/.cursor"
Remove-Item -Recurse -Force "miniapp/.trae"
Remove-Item -Force "miniapp/openapi-ts-request.config.ts"
Remove-Item -Force "miniapp/LICENSE"
```

### Step 3：创建新目录结构（5 分钟）

```powershell
# 创建页面目录
New-Item -ItemType Directory -Force -Path "miniapp/src/pages/home"
New-Item -ItemType Directory -Force -Path "miniapp/src/pages/service"
New-Item -ItemType Directory -Force -Path "miniapp/src/pages/order"
New-Item -ItemType Directory -Force -Path "miniapp/src/pages/profile"

# 创建组件目录
New-Item -ItemType Directory -Force -Path "miniapp/src/components/service-category-grid"
New-Item -ItemType Directory -Force -Path "miniapp/src/components/service-card"
New-Item -ItemType Directory -Force -Path "miniapp/src/components/price-text"
New-Item -ItemType Directory -Force -Path "miniapp/src/components/empty-state"
New-Item -ItemType Directory -Force -Path "miniapp/src/components/loading-state"

# 创建 API 目录
New-Item -ItemType Directory -Force -Path "miniapp/src/api/types"
```

### Step 4：替换配置文件（10 分钟）

```txt
1. 修改 env/.env 系列文件（见第 3.2 节）
2. 修改 pages.config.ts（见第 5.4 节）
3. 修改 manifest.config.ts 中 VITE_APP_TITLE 和 appid
4. 修改 package.json：
   - name: "life-assistant-miniapp"
   - description: "生活助手小程序"
   - 移除 alova、changeset、vue-i18n、openapi-ts-request 依赖
5. 修改 src/tabbar/config.ts（见第 5.2 节）
6. 修改 uno.config.ts 加入 safelist（见第 5.6 节）
```

### Step 5：改造请求层（15 分钟）

```txt
1. 重写 src/http/types.ts（见第 5.1.1 节）
2. 改造 src/http/http.ts（见第 7.1 节）
3. 改造 src/http/interceptor.ts（见第 7.2 节）
```

### Step 6：改造 Store（10 分钟）

```txt
1. 精简 src/store/token.ts（见第 5.3 节）
2. 精简 src/store/user.ts（见第 5.3 节）
3. 确保 src/store/index.ts 正确导出
```

### Step 7：改造样式（5 分钟）

```txt
1. 修改 src/uni.scss 追加设计变量（见第 5.5 节）
2. 修改 src/style/index.scss 追加全局样式（见第 5.5 节）
```

### Step 8：新建 API 模块（10 分钟）

```txt
1. 创建 src/api/types/common.ts（见第 6.3.1 节）
2. 创建 src/api/types/services.ts（见第 6.3.2 节）
3. 创建 src/api/services.ts（见第 6.3.3 节）
```

### Step 9：新建组件（20 分钟）

```txt
1. 创建 service-category-grid 组件（见第 6.2.1 节）
2. 创建 service-card 组件（见第 6.2.2 节）
3. 创建 price-text 组件（见第 6.2.3 节）
4. 创建 empty-state 组件（见第 6.2.4 节）
5. 创建 loading-state 组件（见第 6.2.5 节）
```

### Step 10：新建页面（15 分钟）

```txt
1. 创建 src/pages/home/index.vue（见第 8 节）
2. 创建 src/pages/service/detail.vue（见第 6.1.2 节）
3. 创建 src/pages/order/list.vue（见第 6.1.3 节）
4. 创建 src/pages/profile/index.vue（见第 6.1.4 节）
```

### Step 11：安装依赖并验证（10 分钟）

```powershell
cd miniapp
pnpm install
pnpm dev:h5        # 验证 H5 启动
pnpm dev:mp        # 验证微信小程序构建
```

---

## 10. Day 1 验证链路

对应 `docs/plan/day1.md` 第 17.7 节验收标准。

### 10.1 前提条件

```txt
server 已启动（端口 3000）
数据库已 seed（服务分类 + 服务项目）
GET /api/service-categories 可返回数据
GET /api/services 可返回数据
```

### 10.2 H5 验证

```txt
pnpm dev:h5 启动成功
浏览器打开 http://localhost:5173
首页展示服务分类宫格（4 个分类）
首页展示服务卡片列表（5 个服务）
点击服务卡片跳转服务详情页
点击底部 Tab 切换页面
```

### 10.3 微信小程序验证

```txt
pnpm dev:mp 构建成功
微信开发者工具打开 dist/dev/mp-weixin
首页展示服务分类宫格
首页展示服务卡片列表
Tabbar 正常切换
```

### 10.4 异常状态验证

```txt
停掉后端 server
-> 首页显示错误状态（empty-state error 模式）
-> 点击重试按钮重新请求

后端返回空数据（清空 seed）
-> 首页显示空状态（empty-state empty 模式）

后端返回业务错误（模拟 code !== 0）
-> uni.showToast 显示错误 message
```

### 10.5 请求规范验证

```txt
打开浏览器 Network 面板或后端日志
确认请求头包含：
  X-Request-Source: miniapp
  X-Client-Version: 1.0.0
确认请求地址正确拼接 baseUrl
确认响应按 code === 0 判断成功
```

---

## 11. 与后端接口对接约定

对应 `docs/standards/development.md` 第 5.5 和 5.6 节。

### 11.1 Day 1 对接的接口

| 方法 | 路径 | 说明 | 响应 data 类型 |
|------|------|------|----------------|
| GET | /api/service-categories | 服务分类列表 | ServiceCategory[] |
| GET | /api/services | 服务列表（分页） | PageData<Service> |
| GET | /api/services/:id | 服务详情 | Service |

### 11.2 响应示例

服务分类列表：

```json
{
  "code": 0,
  "message": "ok",
  "data": [
    { "id": 1, "name": "日常保洁", "icon": "clean", "sortOrder": 1, "status": 1 },
    { "id": 2, "name": "深度保洁", "icon": "deep-clean", "sortOrder": 2, "status": 1 },
    { "id": 3, "name": "家电清洗", "icon": "appliance", "sortOrder": 3, "status": 1 },
    { "id": 4, "name": "水电维修", "icon": "repair", "sortOrder": 4, "status": 1 }
  ],
  "requestId": "req_abc123",
  "timestamp": "2026-05-13T10:00:00.000Z"
}
```

服务列表：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "items": [
      {
        "id": 1,
        "categoryId": 1,
        "name": "日常保洁 2 小时",
        "description": "专业保洁人员上门，2小时标准清洁",
        "basePrice": 120.00,
        "priceUnit": "次",
        "coverImage": "",
        "status": 1,
        "sortOrder": 1
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 5
  },
  "requestId": "req_def456",
  "timestamp": "2026-05-13T10:00:00.000Z"
}
```

错误响应：

```json
{
  "code": 40001,
  "message": "服务不存在",
  "data": null,
  "requestId": "req_ghi789",
  "timestamp": "2026-05-13T10:00:00.000Z"
}
```

### 11.3 前端不直接相信的数据

对应 `docs/standards/development.md` 第 5.7 节：

```txt
订单金额 -> 以后端计算为准
优惠金额 -> 以后端计算为准
支付成功结果 -> 以后端回调为准
订单状态 -> 以后端返回为准
师傅收入 -> 以后端计算为准
```

Day 1 暂无这些场景，但请求封装已预留此原则。

---

## 12. 后续页面预留（Day 2+ 方向）

对应 `docs/plan/roadmap.md` 第 5.1 节和 `docs/plan/mvp.md` 阶段 2-4。

### 12.1 Day 2 新增（认证模块）

```txt
src/pages/login/index.vue          # 登录页
src/pages/login/phone.vue          # 手机号登录
src/api/auth.ts                    # 认证 API
src/api/types/auth.ts              # 认证类型
```

### 12.2 Day 3 新增（服务管理）

```txt
src/pages/service/detail.vue       # 完善服务详情
src/pages/category/index.vue       # 服务分类页
src/pages/search/index.vue         # 搜索页
```

### 12.3 Day 4 新增（预约下单）

```txt
src/pages/order/create.vue         # 预约下单
src/pages/address/list.vue         # 地址管理
src/pages/address/edit.vue         # 地址编辑
src/pages/payment/result.vue       # 支付结果
src/components/address-card/       # 地址卡片组件
src/components/order-card/         # 订单卡片组件
src/components/order-status-tag/   # 订单状态标签
src/components/bottom-action-bar/  # 底部操作栏
```

### 12.4 师傅端页面（Day 5+）

```txt
src/pages/staff/login.vue          # 员工登录
src/pages/staff/dashboard.vue      # 工作台
src/pages/staff/orders.vue         # 任务列表
src/pages/staff/order-detail.vue   # 任务详情
src/pages/staff/income.vue         # 收入明细
src/pages/staff/reviews.vue        # 评价查看
src/components/staff-task-card/    # 师傅任务卡片
src/components/upload-image-grid/  # 图片上传网格
```

---

## 13. 最终目录结构（Day 1 完成后）

```txt
miniapp/
├── env/
│   ├── .env
│   ├── .env.development
│   ├── .env.production
│   └── .env.test
├── scripts/
│   ├── upload-weixin.js
│   ├── open-dev-tools.js
│   ├── create-base-files.js
│   ├── bump-version.js
│   ├── postupgrade.js
│   └── vite-plugin-eruda.js
├── vite-plugins/
│   ├── copy-native-resources.ts
│   ├── sync-manifest-plugins.ts
│   └── README.md
├── src/
│   ├── api/
│   │   ├── services.ts
│   │   └── types/
│   │       ├── common.ts
│   │       └── services.ts
│   ├── components/
│   │   ├── service-category-grid/
│   │   │   └── service-category-grid.vue
│   │   ├── service-card/
│   │   │   └── service-card.vue
│   │   ├── price-text/
│   │   │   └── price-text.vue
│   │   ├── empty-state/
│   │   │   └── empty-state.vue
│   │   └── loading-state/
│   │       └── loading-state.vue
│   ├── hooks/
│   │   ├── useRequest.ts
│   │   ├── useScroll.ts
│   │   └── useUpload.ts
│   ├── http/
│   │   ├── http.ts
│   │   ├── interceptor.ts
│   │   ├── types.ts
│   │   ├── tools/
│   │   └── README.md
│   ├── layouts/
│   │   └── default.vue
│   ├── pages/
│   │   ├── home/
│   │   │   └── index.vue
│   │   ├── service/
│   │   │   └── detail.vue
│   │   ├── order/
│   │   │   └── list.vue
│   │   └── profile/
│   │       └── index.vue
│   ├── router/
│   │   ├── interceptor.ts
│   │   └── README.md
│   ├── static/
│   │   ├── tabbar/
│   │   ├── images/
│   │   └── logo.svg
│   ├── store/
│   │   ├── index.ts
│   │   ├── token.ts
│   │   └── user.ts
│   ├── style/
│   │   ├── index.scss
│   │   └── iconfont.css
│   ├── tabbar/
│   │   ├── config.ts
│   │   ├── index.vue
│   │   ├── store.ts
│   │   ├── TabbarItem.vue
│   │   ├── types.ts
│   │   └── README.md
│   ├── types/
│   │   ├── auto-import.d.ts
│   │   └── components.d.ts
│   ├── utils/
│   │   ├── index.ts
│   │   ├── debounce.ts
│   │   ├── systemInfo.ts
│   │   ├── toLoginPage.ts
│   │   ├── updateManager.wx.ts
│   │   └── uploadFile.ts
│   ├── uni_modules/
│   │   └── .gitkeep
│   ├── App.vue
│   ├── App.ku.vue
│   ├── main.ts
│   ├── env.d.ts
│   ├── typings.d.ts
│   ├── typings.ts
│   └── uni.scss
├── .editorconfig
├── .gitignore
├── .husky/
├── .npmrc
├── .vscode/
├── .commitlintrc.cjs
├── eslint.config.mjs
├── index.html
├── manifest.config.ts
├── package.json
├── pages.config.ts
├── pnpm-lock.yaml
├── tsconfig.json
├── uno.config.ts
├── vite.config.ts
└── README.md
```

---

## 14. Day 1 小程序验收清单

对应 `docs/plan/day1.md` 第 17.7 节和第 19 节。

```txt
[ ] miniapp 目录已创建
[ ] 示例代码已清除
[ ] env 配置已替换为生活助手配置
[ ] package.json name/description 已修改
[ ] 无用依赖已移除
[ ] pnpm install 成功
[ ] pnpm dev:h5 启动成功
[ ] pnpm dev:mp 构建成功
[ ] Tabbar 显示为 首页/订单/我的
[ ] 请求层 code === 0 判断成功
[ ] 请求头包含 X-Request-Source 和 X-Client-Version
[ ] 首页请求 GET /api/service-categories 成功
[ ] 首页请求 GET /api/services 成功
[ ] 首页展示服务分类宫格
[ ] 首页展示服务卡片列表
[ ] 点击服务卡片可跳转详情页
[ ] 后端停掉时首页显示错误状态
[ ] 数据为空时首页显示空状态
[ ] 点击重试按钮可重新请求
[ ] 微信小程序端 Tabbar 正常切换
[ ] 无密钥、日志、node_modules 提交到 Git
```

---

## 15. 时间预估

对应 `docs/plan/day1.md` 第 17.7 节（第 6 小时）。

| 步骤 | 预估时间 | 说明 |
|------|----------|------|
| 复制框架 + 删除示例 | 10 分钟 | 纯文件操作 |
| 替换配置 | 10 分钟 | env/tabbar/pages.config |
| 改造请求层 | 15 分钟 | types + http + interceptor |
| 改造 Store | 10 分钟 | 精简 token/user |
| 改造样式 | 5 分钟 | scss 变量 |
| 新建 API 模块 | 10 分钟 | types + services.ts |
| 新建 5 个组件 | 20 分钟 | 基础组件 |
| 新建 4 个页面 | 15 分钟 | 首页 + 3 个占位 |
| 安装依赖 + 调试 | 15 分钟 | 解决编译错误 |
| 联调验证 | 10 分钟 | 对接后端真实数据 |
| **合计** | **约 120 分钟** | 2 小时内完成 |

---

## 16. 注意事项

### 16.1 Day 1 不做的事

```txt
不做微信登录
不做手机号授权
不做服务搜索功能
不做预约下单
不做支付
不做师傅端页面
不做复杂动效
不做图片上传
不做国际化
不做暗黑模式
```

### 16.2 代码规范要求

```txt
所有文件使用 TypeScript
组件使用 <script lang="ts" setup>
样式使用 UnoCSS 原子类为主，复杂样式用 scss
API 调用统一走 src/api/ 目录
类型定义统一走 src/api/types/ 目录
页面状态必须处理：加载中、空数据、错误
组件 Props 必须定义类型
```

### 16.3 与 Day1 其他模块的依赖关系

```txt
前提：server 已完成第 5 小时工作（服务接口可用）
前提：数据库已 seed（服务分类 + 服务项目）
前提：后端统一响应格式已实现（code/message/data/requestId/timestamp）
```

小程序端是 Day 1 第 6 小时的工作，依赖前 5 小时后端地基完成。
