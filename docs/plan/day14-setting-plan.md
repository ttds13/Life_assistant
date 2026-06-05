# Day 14 设置页收敛计划

更新日期：2026-06-04

## 1. 目标

Day 14 的目标是把用户端和师傅端的“个人信息编辑”和“退出登录”能力统一收敛到设置页中，个人中心页面只保留身份信息展示和进入设置页的入口。

完成后应形成：

```txt
用户端个人中心 -> 展示用户摘要 -> 点击设置进入 /pages/settings/index
用户端设置页 -> 编辑头像/昵称，手机号只读展示 -> 退出登录

师傅端个人中心 -> 展示师傅摘要和业务数据 -> 点击设置进入 /pages/staff/settings
师傅端设置页 -> 编辑头像/姓名/认证资料，手机号只读展示 -> 退出登录
```

核心原则是：设置页承担账号级操作，个人中心承担概览和业务入口，避免两个页面同时维护同一套个人信息编辑和退出逻辑。

## 2. 当前现状

### 2.1 用户端

当前相关文件：

```txt
miniapp/src/pages/profile/index.vue
miniapp/src/pages/settings/index.vue
miniapp/src/store/user.ts
miniapp/src/store/token.ts
miniapp/src/api/auth.ts
```

现状：

```txt
用户个人中心已经展示头像、昵称、手机号
用户个人中心里仍然存在头像选择、昵称编辑弹窗和 updateProfile 调用
用户设置页已经包含个人信息卡片、头像编辑、昵称编辑、手机号展示和退出登录
用户设置页退出登录会清 token、清 userStore、清 dev staff session，并 reLaunch 到首页
```

问题：

```txt
同一套头像/昵称编辑逻辑同时出现在 profile 和 settings
个人中心既是业务入口页又承担账号设置，职责混杂
后续如果改头像/昵称保存逻辑，容易漏改其中一个页面
```

### 2.2 师傅端

当前相关文件：

```txt
miniapp/src/pages/staff/profile.vue
miniapp/src/pages/staff/settings.vue
miniapp/src/api/staff.ts
miniapp/src/api/types/staff.ts
miniapp/src/store/token.ts
miniapp/src/utils/devStaffStorage.ts
```

现状：

```txt
师傅个人中心展示头像、姓名、手机号、认证状态、工作统计、佣金和应用入口
师傅个人中心里仍然存在头像选择、姓名编辑弹窗和本地保存逻辑
师傅设置页已经展示头像、姓名、手机号、认证状态、服务设置、其他设置和退出登录
师傅设置页退出登录会清 token、清 dev staff session，并 reLaunch 到首页
```

问题：

```txt
师傅个人中心承担了资料编辑职责，但编辑接口目前还没有真实接入
师傅设置页已经是更合适的账号资料入口，但部分行仍是 onTodo
师傅端退出登录只应该在设置页出现，避免个人中心业务流中误触
```

## 3. 不做什么

Day 14 暂不做：

```txt
真实微信手机号绑定/换绑
师傅实名认证完整流程
师傅资料审核后台流转
账号注销
多账号切换
隐私协议和通知设置的完整实现
钱包、佣金、卡券、售后等业务能力
```

除手机号外，这些能力可保留入口或待完善提示，但不影响本次“个人信息和退出登录收敛到设置页”的目标。手机号在本阶段只展示，不提供修改入口。

## 4. 设计原则

### 4.1 设置页是账号操作唯一入口

账号级操作统一放在设置页：

```txt
头像
昵称/姓名
手机号只读展示，不能修改
认证资料入口
通知设置
隐私设置
关于我们
退出登录
```

个人中心不再直接编辑账号资料，也不放退出登录按钮。

### 4.2 个人中心只做展示和跳转

个人中心保留：

```txt
头像展示
昵称/姓名展示
手机号展示
用户订单入口
师傅工作统计
师傅应用入口
设置入口
```

点击头像、昵称、姓名等个人信息区域时，推荐跳转到设置页，而不是弹出编辑弹窗。

### 4.3 手机号不可修改

手机号是账号身份字段，Day 14 明确不提供修改能力：

```txt
用户端设置页只展示手机号或未绑定状态
师傅端设置页只展示手机号或未设置状态
个人中心只展示手机号摘要
不提供“更换手机号”入口
不调用任何手机号更新接口
不在本地伪造手机号修改结果
```

除手机号外，其他个人资料按现有接口或后续接口支持修改：

```txt
用户端：头像、昵称可修改
师傅端：头像、姓名、认证资料等非手机号信息可修改
```

### 4.4 退出登录必须彻底清理身份状态

用户端退出登录需要清理：

```txt
tokenStore
userStore
dev staff session
可能存在的 mock login 标记
```

师傅端退出登录需要清理：

```txt
tokenStore
userStore
dev staff session
师傅端本地调试身份
```

退出后统一跳转：

```txt
uni.reLaunch({ url: '/pages/home/index' })
```

如果后续用户端和师傅端登录态拆分，再调整为对应登录页。

## 5. 用户端实施计划

### 5.1 用户个人中心去编辑化

修改文件：

```txt
miniapp/src/pages/profile/index.vue
```

动作：

```txt
移除 updateProfile import
移除 editingNickname / nicknameInput / saving 等编辑状态
移除 onEditNickname / onSaveNickname / onCancelNickname / onChooseAvatar
移除昵称编辑弹窗模板
头像点击改为进入设置页
昵称区域点击改为进入设置页
手机号区域保持展示，不直接编辑
设置应用入口继续跳转 /pages/settings/index
```

建议新增：

```ts
function goSettings() {
  requireLogin(() => {
    uni.navigateTo({ url: '/pages/settings/index' })
  })
}
```

交互预期：

```txt
未登录点击头像/昵称 -> 登录页
已登录点击头像/昵称 -> 设置页
个人中心不再出现修改昵称弹窗
```

### 5.2 用户设置页完善账号能力

修改文件：

```txt
miniapp/src/pages/settings/index.vue
```

动作：

```txt
确认头像上传携带 Authorization header
确认 updateProfile 成功后同步 userStore.setFromProfile
确认昵称为空和超长校验可用
手机号改为只读展示，不绑定点击事件，不显示“更换手机号待完善”
退出登录确认弹窗文案明确
退出登录后清 tokenStore、userStore、dev staff session、mock login 标记
```

注意：

```txt
如果当前头像上传没有带 Authorization，需要补上 tokenStore.token
如果 mock login 标记使用 life-assistant:mock-login，需要退出时 removeStorageSync
```

### 5.3 用户端路由和入口检查

检查：

```txt
pages.config.ts 自动页面配置能识别 /pages/settings/index
个人中心“我的应用-设置”入口仍可进入设置页
未登录用户不能直接执行资料保存
```

验收：

```txt
用户从个人中心点击头像进入设置页
用户在设置页修改昵称后返回个人中心，展示最新昵称
用户在设置页修改头像后返回个人中心，展示最新头像
用户退出登录后回到首页，个人中心显示未登录
```

## 6. 师傅端实施计划

### 6.1 师傅个人中心去编辑化

修改文件：

```txt
miniapp/src/pages/staff/profile.vue
```

动作：

```txt
移除 tokenStore import，如果只用于头像上传
移除 editingName / nameInput / saving 等编辑状态
移除 onEditName / onSaveName / onCancelName / onChooseAvatar
移除姓名编辑弹窗模板
头像点击改为进入 /pages/staff/settings
姓名区域点击改为进入 /pages/staff/settings
otherEntries 中“设置”入口继续进入 /pages/staff/settings
```

建议新增：

```ts
function goStaffSettings() {
  uni.navigateTo({ url: '/pages/staff/settings' })
}
```

交互预期：

```txt
师傅个人中心用于看业务数据和入口
头像、姓名、手机号只展示
编辑资料统一到师傅设置页处理
```

### 6.2 师傅设置页承接个人信息

修改文件：

```txt
miniapp/src/pages/staff/settings.vue
miniapp/src/api/staff.ts
miniapp/src/api/types/staff.ts
```

动作：

```txt
保留 getStaffProfile 加载头像、姓名、手机号、认证状态
头像行后续接入上传和保存师傅头像
姓名行后续接入师傅资料更新接口
手机号行改为只读展示，不保留换绑入口或待完善提示
认证状态行跳转认证资料页或保留待完善提示
退出登录统一放在页面底部
```

如果后端已有或后续新增师傅资料更新接口，建议前端 API 命名：

```ts
updateStaffProfile(params: {
  staffName?: string
  avatar?: string
})
```

对应后端建议接口：

```txt
PUT /staff/profile
```

Day 14 如果后端暂未实现，前端可以只完成页面职责收敛，设置页中的姓名和头像继续显示待完善提示。

### 6.3 师傅退出登录清理规则

修改文件：

```txt
miniapp/src/pages/staff/settings.vue
miniapp/src/store/token.ts
miniapp/src/store/user.ts
miniapp/src/utils/devStaffStorage.ts
```

动作：

```txt
调用 tokenStore.logout()
确认 userStore 会被 tokenStore.logout() 清理
调用 clearDevStaffSession()
清理可能存在的师傅本地照片草稿可选
退出后 reLaunch 到 /pages/home/index
```

验收：

```txt
师傅端点击退出登录后回到首页
重新进入师傅工作台时需要重新建立师傅身份
不会残留上一个师傅的 dev staff session
```

## 7. 推荐执行顺序

```txt
1. 用户端 profile/index.vue 去除头像/昵称编辑逻辑，改为跳转设置页
2. 用户端 settings/index.vue 补齐头像上传 token、手机号只读展示、mock login 标记清理和退出登录清理
3. 师傅端 staff/profile.vue 去除头像/姓名编辑逻辑，改为跳转师傅设置页
4. 师傅端 staff/settings.vue 梳理个人信息展示、手机号只读展示、退出登录和待完善入口
5. 检查两个设置页的文案、空值展示和未登录保护
6. 运行 miniapp build:mp
7. 在微信开发者工具中分别走用户端和师傅端点击路径
```

## 8. 验收清单

### 8.1 用户端

```txt
[ ] 个人中心不再直接弹出昵称编辑弹窗
[ ] 个人中心头像点击进入设置页
[ ] 个人中心昵称区域点击进入设置页
[ ] 我的应用中的设置入口可进入设置页
[ ] 设置页可以展示当前头像、昵称、手机号
[ ] 设置页可以修改昵称并同步回个人中心
[ ] 设置页可以修改头像并同步回个人中心
[ ] 设置页手机号只读，不能点击修改
[ ] 设置页退出登录后 token 清空
[ ] 设置页退出登录后 userStore 清空
[ ] 设置页退出登录后 dev staff session 清空
[ ] 退出后回到首页
```

### 8.2 师傅端

```txt
[ ] 师傅个人中心不再直接弹出姓名编辑弹窗
[ ] 师傅个人中心头像点击进入师傅设置页
[ ] 师傅个人中心姓名区域点击进入师傅设置页
[ ] 师傅个人中心设置入口可进入师傅设置页
[ ] 师傅设置页可以展示头像、姓名、手机号、认证状态
[ ] 师傅设置页手机号只读，不能点击修改
[ ] 师傅设置页退出登录后 token 清空
[ ] 师傅设置页退出登录后 dev staff session 清空
[ ] 退出后回到首页
```

### 8.3 构建验证

```txt
cd miniapp
pnpm build:mp
```

如果本次只调整小程序端，不要求运行 server build。

## 9. 风险和注意事项

```txt
不要把个人中心的业务统计和订单入口误删
不要删除进入设置页的入口
不要让未登录用户直接调用 updateProfile
不要提供手机号修改入口，手机号只能展示
头像上传必须携带 Authorization，否则后端可能拒绝上传
退出登录必须清理 dev staff session，否则用户端退出后仍可能保留师傅调试身份
师傅资料更新接口未完成前，不要在前端伪造“保存成功”造成误解
```

## 10. 完成标准

Day 14 完成标准不是“设置页存在”，而是职责边界清晰：

```txt
用户个人中心只展示个人摘要和业务入口
用户设置页独立承载除手机号外的个人信息编辑和退出登录
师傅个人中心只展示师傅摘要、工作数据和业务入口
师傅设置页独立承载除手机号外的师傅个人信息和退出登录
手机号在用户端和师傅端均只读展示
两个端的退出登录都能彻底清空身份状态
miniapp build:mp 通过
```
