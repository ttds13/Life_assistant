# 当前项目 MVP 进度总结

更新日期：2026-05-29

## 1. 当前结论

项目已经过了“工程地基阶段”，但还没有到“只加真实登录和支付就能商用 MVP 上线”的程度。

当前更准确的判断是：

```txt
后端订单内核：75%-85%
用户端小程序：60%-70%
后台 admin：45%-60%
师傅端：40%-55%
真实商用 MVP 整体：约 65%-70%
```

如果目标是本地演示闭环，当前已经比较接近。
如果目标是“真实用户可下单付款、后台可派单、师傅可履约、平台可运营”的可试运营 MVP，还需要补齐生产级支付、三端真实化、文件上传和部署提审相关能力。

一句话总结：

```txt
MVP 后端订单主干已完成，三端业务正在接真实数据。
当前距离可真实试运营还差最后约 30%-35%。
```

## 2. 当前阶段定义

当前项目阶段可以定义为：

```txt
MVP 订单内核完成
真实微信登录链路已闭环
mock 支付仍待替换为真实微信支付
用户端、师傅端、admin 端仍需继续真实化和生产化
```

这意味着项目已经不再是只有首页、服务列表、登录占位的“地基项目”。核心订单状态机已经成型，是后续 MVP 继续推进的主要资产。

## 3. 已完成和较扎实的部分

### 3.1 数据库和后端基础

已完成：

```txt
MySQL / Prisma 数据模型覆盖 MVP 主体
服务分类和服务 SKU 已落库
NestJS 后端主线已替代 rear 原型后端
统一响应格式
统一异常处理
JWT 鉴权基础
requestId
请求日志
Prisma 序列化
seed 脚本
contract test
db verify
```

数据库表结构已经覆盖：

```txt
用户
地址
服务分类
服务项目
订单
订单状态日志
派单
支付
退款
履约打卡
服务照片
评价
售后工单
优惠券
会员卡
通知
文件
审计日志
师傅收入和提现
```

### 3.2 订单后端内核

订单后端已经是当前项目最成熟的模块。

已具备：

```txt
用户创建订单
价格预览
订单列表
订单详情
未支付取消
mock 支付创建
mock 支付成功推进状态
后台人工派单
师傅接单
师傅拒单
师傅出发
师傅开始服务
师傅完成服务
用户确认完成
订单状态机
订单状态日志
悲观锁
乐观锁
关键冲突测试
```

当前已实现主链路：

```txt
create_order        null -> pending_payment
pay_success         pending_payment -> pending_dispatch
admin_assign        pending_dispatch -> dispatched
staff_accept        dispatched -> accepted
staff_on_the_way    accepted -> on_the_way
staff_start         on_the_way -> in_service
staff_complete      in_service -> pending_confirm
user_confirm        pending_confirm -> completed
```

并且支持常见异常分支：

```txt
user_cancel_unpaid
timeout_unpaid
staff_reject
auto_confirm
```

### 3.3 登录链路

截至 2026-05-29，真实微信登录链路已经推进到闭环状态。

已完成：

```txt
miniapp 已配置真实微信 AppID
server 已配置 WECHAT_APPID / WECHAT_SECRET
server 已重启并重新读取微信配置
server 监听 0.0.0.0:3100
小程序请求地址已改为局域网地址 http://192.168.126.18:3100/api
mp-weixin 已重新构建
开发模拟登录入口保留，便于本地联调
```

当前登录能力判断：

```txt
开发模拟登录：可用于本地真机业务联调
微信手机号快捷登录：配置链路已具备，仍需依赖微信平台账号能力、手机号授权能力和真机环境
```

注意：

```txt
AppSecret 只应保存在 server/.env
miniapp 只配置 AppID
真实上线不能使用局域网 IP，必须切换 HTTPS 合法域名
```

### 3.4 小程序端

小程序已经具备主要页面骨架和一部分真实接口接入。

已存在页面：

```txt
首页
服务详情
登录
我的
地址列表
地址编辑
预约下单
订单列表
订单详情
支付结果
师傅端首页
师傅订单管理
师傅订单详情
师傅录入订单
师傅上传照片
师傅个人中心
```

已具备：

```txt
统一 HTTP 请求封装
Authorization token 注入
X-Request-Source / X-Client-Version 请求头
401 处理
用户 store
token store
服务 API
登录 API
地址 API
订单 API
师傅端 UI 页面
```

### 3.5 Admin 后台

admin 后台已经不是空白阶段。

已具备：

```txt
后台项目骨架
登录页
布局
菜单
dashboard 页面
life 业务菜单
订单列表页面
订单详情页面
后台订单 API 封装
部分真实接口接入方向
```

后端已具备：

```txt
Admin Auth
Admin Orders
Admin Staff Options
Admin Order Assign
Admin Order Remark
Admin AuditService 基础方向
```

## 4. 当前不是只差登录和支付

真实微信登录已经推进到闭环，但 MVP 仍不能简单理解为“再接支付就上线”。

当前还缺以下 P0，才接近真实可试运营 MVP。

## 5. MVP P0 剩余清单

### 5.1 微信支付

仍需完成：

```txt
微信支付商户配置
创建微信预支付单
前端调起微信支付
支付回调验签
支付回调幂等
支付成功后推进订单 pending_payment -> pending_dispatch
支付异常和重复回调处理
取消后支付成功的处理策略
生产环境禁用 mock 支付
```

当前状态：

```txt
mock 支付可支撑开发闭环
真实微信支付尚未接入
```

### 5.2 Admin / Staff 生产级鉴权

仍需完成：

```txt
admin 专用 Guard 收口
staff 专用登录和 Guard
去除生产环境 X-Admin-Id / X-Staff-Id 依赖
普通 user token 禁止访问 admin/staff 接口
staff token 禁止访问 admin 接口
admin token 禁止误走 user 身份
```

当前状态：

```txt
订单模块支持 admin/staff 身份方向
但生产级 admin/staff 登录体系仍需继续完善
```

### 5.3 师傅端真实接口接入

仍需完成：

```txt
师傅登录
师傅首页接真实任务统计
师傅订单列表接真实 /api/staff/orders
师傅订单详情接真实 /api/staff/orders/:id
接单/拒单/出发/开始/完成接真实动作接口
上传照片接真实文件模块
师傅个人中心接真实数据
```

当前状态：

```txt
后端 staff order 接口已具备
师傅端 UI 已存在
但页面仍需继续真实化和联调
```

### 5.4 文件上传和履约凭证

仍需完成：

```txt
统一文件上传接口
本地开发存储或对象存储接入
服务照片上传
评价图片上传
售后凭证上传
文件表落库
文件 URL 返回
上传大小和类型校验
```

当前状态：

```txt
schema 有 files/service_photos 等表
真实文件上传模块仍未完整落地
```

### 5.5 Admin 剩余核心模块真实化

仍需完成：

```txt
dashboard 真实统计
用户管理真实列表、编辑、禁用、删除
地址管理真实只读或管理
服务分类真实增删改、上下架
服务项目真实增删改、上下架
师傅管理真实增删改、禁用、派单候选过滤
支付记录真实列表
退款审核基础能力
提现审核基础能力
审计日志列表
```

当前状态：

```txt
admin 订单方向较靠前
其他运营核心模块仍有不少 mock 或计划态
```

### 5.6 用户端评价和售后最小入口

仍需完成：

```txt
完成订单后评价入口
提交评价
售后投诉入口
提交售后工单
订单详情展示评价/售后状态
admin 端能查看评价和售后
```

当前状态：

```txt
schema 已预留 reviews/tickets
用户端最小评价售后闭环仍需实现
```

### 5.7 部署、合法域名和提审准备

仍需完成：

```txt
后端部署到公网服务器
HTTPS 域名
小程序 request 合法域名
生产环境变量治理
禁用 mock-login / mock-pay / dev-seed
数据库迁移 deploy 流程
日志和错误追踪
微信开发者工具真机测试
小程序提审前检查
```

当前状态：

```txt
本地局域网真机联调已具备
生产部署和提审链路尚未完成
```

## 6. 推荐推进顺序

当前最建议按以下顺序推进：

```txt
1. 稳定真实微信登录真机链路
2. 接入微信支付和回调幂等
3. 师傅端接真实 staff/order 接口
4. 文件上传和服务照片落库
5. admin 服务/用户/师傅/财务基础模块真实化
6. 用户端评价和售后最小闭环
7. 生产部署、小程序合法域名、真机验收、提审准备
```

如果目标是先完成可演示版本，可以先走：

```txt
开发模拟登录
mock 支付
admin 派单
师傅端真实履约
用户确认完成
```

如果目标是可试运营版本，则必须优先替换：

```txt
真实微信登录
真实微信支付
生产级 admin/staff 鉴权
文件上传
HTTPS 部署
```

## 7. 当前风险判断

### 7.1 主要风险

```txt
真实支付比 mock 支付复杂，涉及验签、幂等、异常回调和资金一致性
admin/staff 生产级身份体系还没有完全收口
师傅端 UI 和后端已有接口之间仍需大量联调
文件上传缺失会阻塞真实履约凭证
admin 运营主数据不完整会影响试运营效率
```

### 7.2 可控点

```txt
订单状态机已经集中，后续支付/派单/履约不需要推翻重写
数据库表结构已经较完整，后续多数是 service/controller/presenter 补齐
contract test 已经覆盖核心订单链路，可以继续扩展
小程序、admin、server 都已具备工程骨架
```

## 8. 一句话总结

项目当前不是“还差很多”，但也不是“只差登录支付”。

真实微信登录链路已经闭环，订单后端已经接近 MVP 内核；剩下的主要工作是：

```txt
真实微信支付
师傅端真实履约
文件上传
admin 核心运营模块真实化
生产级身份和部署提审
```

