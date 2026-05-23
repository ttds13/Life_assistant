# Day 1 总结：miniapp 地基搭建与工程规范核查

更新日期：2026-05-14

## 1. 当前结论

`miniapp` 的 Day 1 小程序地基已经基本到位：从 `temp_unibest` 裁剪出生活助手小程序骨架，完成了统一请求层、服务 API、首页真实数据链路、Tabbar、基础状态组件、单 token Store 和双端构建验证。

本次复核后又补了 3 类问题：

1. 修复 TypeScript 类型检查失败问题。
   - `src/tabbar/types.ts` 不再依赖已删除的 `src/api/types/login.ts`。
   - `src/tabbar/store.ts` 改为按 Pinia setup store 的自动解包方式读取 `userInfo`。
   - `src/store/user.ts` 明确导出 `UserRole`。

2. 修正环境变量仍是 unibest 模板的问题。
   - `env/.env` 已改为生活助手配置。
   - 本地接口默认为 `http://localhost:3000/api`。
   - 生产域名与微信 AppID 保留占位符，避免把模板 AppID 和模板后端地址继续带入项目。

3. 补强 Git 忽略规则。
   - `miniapp/.gitignore` 已补充 `build/`、`.output/`、`coverage/`、`uploads/`、`cert/`、证书私钥、日志文件等规则。

验证结果：

```txt
pnpm type-check  通过
pnpm build:h5    通过
pnpm build:mp    通过
```

微信小程序构建已成功，自动打开微信开发者工具失败是本机 CLI 路径问题，不影响构建产物。产物路径为：

```txt
miniapp/dist/build/mp-weixin
```

## 2. 项目实际架构

当前根目录结构：

```txt
Life_assistant/
  docs/          项目计划、架构规范、Day1 总结
  miniapp/       uni-app 小程序，当前主要实现目录
  temp_unibest/  原始模板参考目录
```

注意：根目录目前不是 Git 仓库，`miniapp/` 自己是 Git 仓库。因此 `docs/` 当前不属于 `miniapp` 这个 Git 仓库管理范围。如果后续按 monorepo 管理，需要决定：

```txt
方案 A：根目录作为唯一 Git 仓库，miniapp 不再单独带 .git
方案 B：miniapp 独立仓库，docs 另建仓库或迁入 miniapp/docs
方案 C：根目录仓库 + miniapp 子模块
```

Day 1 更推荐方案 A，便于 `server`、`admin-web`、`miniapp`、`docs` 一起管理。

## 3. miniapp 内部分层

### 3.1 应用入口层

相关文件：

```txt
miniapp/src/main.ts
miniapp/src/App.vue
miniapp/src/App.ku.vue
```

职责：

```txt
createSSRApp 创建应用
注册 Pinia store
注册路由拦截器
注册请求拦截器
加载全局样式和 UnoCSS
挂载自定义 Tabbar
```

`src/main.ts` 是实际入口，已经把 `requestInterceptor` 装入应用，说明所有 `uni.request` 和 `uploadFile` 都会经过统一请求拦截器。

### 3.2 配置层

相关文件：

```txt
miniapp/env/.env
miniapp/env/.env.development
miniapp/env/.env.production
miniapp/env/.env.test
miniapp/manifest.config.ts
miniapp/pages.config.ts
miniapp/uno.config.ts
miniapp/vite.config.ts
miniapp/src/tabbar/config.ts
```

职责：

```txt
应用名称、AppID、后端地址、H5 代理、认证模式
页面全局标题和全局样式
小程序 manifest 配置
Tabbar 页面与图标配置
UnoCSS 图标 safelist
Vite 开发代理和构建配置
```

当前已完成：

```txt
应用标题改为生活助手
Tabbar 改为首页 / 订单 / 我的
navigationBarTitleText 改为生活助手
页面背景色改为 #F5F7FA
UnoCSS safelist 加入 i-carbon-home / i-carbon-document / i-carbon-user
```

### 3.3 请求层

相关文件：

```txt
miniapp/src/http/types.ts
miniapp/src/http/interceptor.ts
miniapp/src/http/http.ts
miniapp/src/http/tools/queryString.ts
```

职责：

```txt
定义统一响应类型 IResponse
定义分页响应类型 IPageData
拼接 baseUrl 和 queryString
注入统一请求头
注入 Authorization token
统一判断 HTTP 状态码
统一判断业务 code
统一处理 401 / 认证失效 / 网络错误
向上层只返回 response.data
```

统一响应格式已经匹配 Day 1 后端约定：

```ts
interface IResponse<T = any> {
  code: number
  message: string
  data: T
  requestId: string
  timestamp: string
}
```

成功判断规则：

```txt
code === 0
```

请求头规范：

```txt
X-Request-Source: miniapp
X-Client-Version: 1.0.0
Authorization: Bearer <token>
```

### 3.4 API 层

相关文件：

```txt
miniapp/src/api/services.ts
miniapp/src/api/types/common.ts
miniapp/src/api/types/services.ts
```

职责：

```txt
封装服务分类和服务项目接口
定义服务分类、服务项目、分页数据、查询参数类型
页面不直接调用 http，不直接拼接口地址
```

Day 1 已对接的接口：

```txt
GET /service-categories
GET /services
GET /services/:id
```

在请求拦截器拼接后，非 H5 小程序端实际请求地址为：

```txt
VITE_SERVER_BASEURL + /service-categories
VITE_SERVER_BASEURL + /services
VITE_SERVER_BASEURL + /services/:id
```

H5 开启代理时，请求路径为：

```txt
/api/service-categories
/api/services
/api/services/:id
```

### 3.5 Store 层

相关文件：

```txt
miniapp/src/store/index.ts
miniapp/src/store/token.ts
miniapp/src/store/user.ts
```

职责：

```txt
token 持久化
token 过期时间计算
hasLogin / validToken 判断
logout 时清理 token 和用户信息
用户信息持久化
预留 Day 2 fetchUserInfo
```

当前符合 Day 1 单 token 模式，没有继续保留 refresh token 复杂逻辑。

### 3.6 页面层

相关文件：

```txt
miniapp/src/pages/home/index.vue
miniapp/src/pages/service/detail.vue
miniapp/src/pages/order/list.vue
miniapp/src/pages/profile/index.vue
```

职责：

```txt
首页负责触发 Day 1 真实数据链路
服务详情页负责服务详情占位展示
订单页负责空状态占位
我的页负责个人中心占位
```

首页数据链路：

```txt
onLoad
-> loadData()
-> getServiceCategories()
-> getServices({ page: 1, pageSize: 10 })
-> http.get()
-> requestInterceptor
-> 后端统一响应
-> 渲染服务分类宫格和热门服务卡片
```

首页状态已覆盖：

```txt
loading 加载中
empty 空数据
error 请求失败
normal 正常展示
retry 重试
```

### 3.7 组件层

相关文件：

```txt
miniapp/src/components/service-category-grid/service-category-grid.vue
miniapp/src/components/service-card/service-card.vue
miniapp/src/components/price-text/price-text.vue
miniapp/src/components/empty-state/empty-state.vue
miniapp/src/components/loading-state/loading-state.vue
```

职责：

```txt
service-category-grid 展示服务分类
service-card 展示服务项目卡片
price-text 统一价格展示
empty-state 统一空状态、错误状态、网络状态
loading-state 统一加载状态
```

这些组件属于展示组件，业务请求仍放在页面和 API 层。

## 4. Day 1 工作完成度核查

| 检查项 | 状态 | 说明 |
|---|---|---|
| miniapp 目录创建 | 已完成 | `miniapp/` 已存在并可构建 |
| 示例页面删除 | 已完成 | `about`、`index`、`me` 示例页已删除 |
| 示例 API 删除 | 已完成 | `foo`、`login`、`service`、`alova` 示例代码已删除 |
| package name / description | 已完成 | 已改为 `life-assistant-miniapp` / `生活助手小程序` |
| 无用依赖裁剪 | 基本完成 | 未发现 alova、vue-query、openapi-ts-request 依赖引用 |
| env 配置 | 已修正 | 已改为生活助手配置，生产域名和微信 AppID 仍需替换真实值 |
| Tabbar | 已完成 | 首页 / 订单 / 我的 |
| 请求统一封装 | 已完成 | `src/http/http.ts` 和 `src/http/interceptor.ts` 已落地 |
| 统一响应适配 | 已完成 | 按 `code/message/data/requestId/timestamp` 处理 |
| 服务 API 模块 | 已完成 | `src/api/services.ts` |
| 首页真实接口链路 | 已完成 | 首页调用服务分类和服务列表接口 |
| 加载/空/错状态 | 已完成 | 首页使用 `loading-state` 和 `empty-state` |
| H5 构建 | 已通过 | `pnpm build:h5` 成功 |
| 微信小程序构建 | 已通过 | `pnpm build:mp` 成功 |
| 微信开发者工具自动打开 | 未完成 | 本机 CLI 路径不存在，需要手动导入构建产物 |
| README 替换 | 未完成 | `miniapp/README.md` 仍是 unibest 模板文档 |
| 根目录 Git 管理 | 未完成 | 根目录不是 Git 仓库，`docs/` 未纳入 `miniapp` 仓库 |

## 5. 五项工程规范落点

### 5.1 Git 项目卫生

已经做到：

```txt
miniapp 是独立 Git 仓库
node_modules 和 dist 已被忽略
日志文件已被忽略
证书、私钥、上传目录、覆盖率目录已补充忽略
模板示例代码删除已经进入 Git 变更区
```

还需要补齐：

```txt
决定根目录是否作为 monorepo Git 仓库
替换 miniapp/README.md 中的 unibest 模板内容
替换 package.json 中 author / homepage / repository / bugs 等模板元数据
不要把真实微信 AppID、生产域名、支付密钥写入已跟踪 env 文件
```

### 5.2 职责边界

小程序端已经形成清晰边界：

```txt
页面层：负责页面状态、生命周期、组合组件
组件层：只负责展示和局部交互
API 层：负责接口语义封装
请求层：负责 baseUrl、headers、token、统一响应和统一错误
Store 层：负责登录态、token、用户信息
配置层：负责环境、页面、manifest、tabbar、构建配置
```

当前符合“页面不直接拼接底层 request”的方向。首页通过 `getServiceCategories` 和 `getServices` 读取数据，而不是在页面里直接写 `uni.request`。

后端的 Controller / Service / Repository 边界，本次仓库中没有 `server/`，无法在代码层复核，只能按计划文档确认目标。

### 5.3 统一响应

小程序端落点：

```txt
miniapp/src/http/types.ts
miniapp/src/http/http.ts
```

处理方式：

```txt
后端返回完整 IResponse
前端只在请求层检查 code
code === 0 时向页面返回 data
code !== 0 时统一 toast message 并 reject
页面拿到的是业务 data，而不是完整 response 包装
```

这能保证后续所有页面不重复写：

```txt
if (res.code === 0) ...
else showToast(...)
```

### 5.4 统一异常

小程序端落点：

```txt
miniapp/src/http/http.ts
```

已经覆盖：

```txt
HTTP 非 2xx
HTTP 401
业务认证错误 code 20001 / 20002
普通业务错误
网络错误 fail
错误 toast 可通过 hideErrorToast 关闭
```

后端应落地但当前未在仓库中看到的部分：

```txt
BusinessException
ErrorCode enum
GlobalExceptionFilter
ValidationPipe
```

因此当前只能确认“小程序端统一异常消费”已完成，不能确认“后端统一异常生产”已经完成。

### 5.5 前后端请求规范

小程序端落点：

```txt
miniapp/src/http/interceptor.ts
miniapp/src/http/http.ts
miniapp/src/api/services.ts
```

已经做到：

```txt
统一 baseUrl
H5 代理支持
统一 query 参数拼接
统一 60s timeout
统一 X-Request-Source
统一 X-Client-Version
统一 Authorization token 注入
统一分页参数 page / pageSize
统一响应解包
```

当前 Day 1 服务接口约定：

```txt
GET /api/service-categories
GET /api/services
GET /api/services/:id
```

注意：小程序 API 模块内部写的是 `/service-categories`、`/services`，是否带 `/api` 取决于 `VITE_SERVER_BASEURL` 或 H5 代理前缀。

## 6. 日志系统做在哪里

Day 1 的“日志系统”主要是后端能力，不是在小程序端落库。

计划中的后端落点：

```txt
server/src/common/middleware/request-id.middleware.ts
server/src/common/interceptors/request-logger.interceptor.ts
server/src/common/logger/app-logger.service.ts
server/src/common/logger/logger.module.ts
server/src/common/filters/global-exception.filter.ts
server/src/audit/audit-log.service.ts
server/src/orders/order-status-log.service.ts
server/src/payments/payment-notify-log.service.ts
```

后端日志目标：

```txt
每个请求生成或透传 requestId
请求日志记录 method / url / statusCode / durationMs / source / ip / userAgent / userId
异常日志带 requestId
统一响应带 requestId
统一异常响应带 requestId
订单状态变更写 order_status_logs
支付回调原文写 payment_notify_logs
后台关键操作写 audit_logs
```

小程序端当前参与日志链路的方式：

```txt
请求头 X-Request-Source: miniapp
请求头 X-Client-Version: 1.0.0
请求头 Authorization: Bearer <token>
响应类型 IResponse 中保留 requestId
统一请求层收到错误时可以拿到 responseData.requestId
```

也就是说：

```txt
小程序负责标识请求来源和消费 requestId
后端负责生成 requestId、记录请求日志、记录异常日志、返回 requestId
数据库负责保存关键业务日志
```

当前 `miniapp/src/App.vue`、`src/App.ku.vue`、`src/utils/` 等位置仍保留一些模板 `console.log`。这些是开发调试输出，不是正式日志系统。Day 1 调试阶段可以保留，生产前建议统一清理或通过环境变量控制。

## 7. 本次复核发现并已处理的问题

### 7.1 已处理

```txt
TypeScript 类型检查失败
env 仍使用 unibest 标题、AppID、Laf 后端地址
Git 忽略规则缺少证书、上传目录、覆盖率等项目卫生规则
```

### 7.2 仍需后续处理

```txt
根目录 Git 仓库形态未确定
docs 目前不随 miniapp 仓库提交
miniapp/README.md 仍是 unibest 模板
package.json 仍保留 unibest 作者、仓库、homepage、bugs 元数据
微信开发者工具 CLI 路径未配置，不能自动打开
生产域名和微信 AppID 仍是占位符
后端 server 目录未在当前工作区出现，无法验证统一异常和日志系统真实落地
admin-web 目录未在当前工作区出现，无法验证后台端 Day 1 请求规范
```

## 8. Day 2 前建议优先补齐

1. 决定仓库形态。
   - 如果采用 monorepo，把根目录初始化为 Git 仓库，并处理 `miniapp/.git`。
   - 如果采用独立仓库，把 `docs` 的归属明确下来。

2. 替换模板元数据。
   - `miniapp/README.md`
   - `miniapp/package.json` 的 `author`、`homepage`、`repository`、`bugs`

3. 联调真实后端。
   - 启动 `server`
   - seed 服务分类和服务项目
   - 验证首页能展示真实数据
   - 在后端日志中确认能看到 `requestId` 和 `source=miniapp`

4. 完成后端统一异常和日志系统复核。
   - 成功响应必须带 `code/message/data/requestId/timestamp`
   - 异常响应必须带统一错误码和 `requestId`
   - 请求日志必须能按 `requestId` 串起来

5. 清理开发输出。
   - 保留必要调试开关
   - 生产前不要依赖散落的 `console.log`

## 9. 一句话总结

Day 1 小程序端的核心地基已经搭好：页面、组件、请求层、服务 API、状态管理和双端构建都能跑通。当前最大风险不在小程序代码本身，而在项目级治理：根目录 Git 形态、模板 README/元数据、真实后端日志与统一异常是否已经同步落地。
