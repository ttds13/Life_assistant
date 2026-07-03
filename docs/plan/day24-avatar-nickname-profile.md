# Day 24 头像昵称完善计划

更新日期：2026-06-28

## 1. 背景

当前小程序已经具备手机号快捷登录、用户资料存储、头像上传和昵称编辑能力，但头像昵称体验还不完整：

```txt
登录成功后不会主动引导用户补全头像昵称。
设置页已有头像上传和昵称编辑，但交互偏基础，没有区分“微信头像昵称”和“本地上传/手动编辑”两种路径。
前端资料更新逻辑分散在页面里，后续抖音端、师傅端或更多资料字段接入时会继续膨胀。
```

微信小程序侧需要注意：不能静默自动获取用户头像昵称。应使用头像昵称填写能力，由用户主动选择头像、填写或确认昵称：

```txt
头像：button open-type="chooseAvatar" 获取临时头像路径。
昵称：input type="nickname" 提供微信昵称填写能力。
保存：前端上传头像后调用 PUT /api/auth/profile 更新 avatar 和 nickname。
```

因此，本次“自动获取弹窗”的定义不是静默抓取，而是在登录完成后自动弹出资料补全弹窗，引导用户一键选择微信头像和昵称，并允许跳过。

## 2. 改造目标

```txt
登录成功后，如果用户头像或昵称仍是默认值，自动弹出头像昵称补全弹窗。
资料补全弹窗支持微信头像选择和昵称填写。
用户可以跳过补全，不阻塞进入业务流程。
设置页支持两种资料修改方式：
  1. 获取微信头像昵称：chooseAvatar + nickname input。
  2. 本地上传/手动编辑：chooseImage + 普通 input。
资料保存后同步后端、userStore 和所有展示入口。
保留本地调试登录场景，避免开发模式下流程被弹窗卡死。
```

## 3. 当前相关文件

前端：

```txt
miniapp/src/pages/login/index.vue
miniapp/src/pages/settings/index.vue
miniapp/src/pages/profile/index.vue
miniapp/src/store/user.ts
miniapp/src/api/auth.ts
miniapp/src/api/types/auth.ts
miniapp/src/utils/uploadImage.ts
```

后端：

```txt
server/src/auth/auth.controller.ts
server/src/auth/auth.service.ts
server/src/auth/dto/update-profile.dto.ts
server/src/upload/upload.controller.ts
server/src/upload/upload.service.ts
```

现有接口：

```txt
GET /api/auth/me
PUT /api/auth/profile
POST /api/upload/image
```

## 4. 产品流程设计

### 4.1 登录后头像昵称补全

触发时机：

```txt
用户通过微信手机号登录成功后。
用户通过本地 mock 登录成功后，可配置是否触发，默认开发模式不强制。
tokenStore 和 userStore 已写入之后。
页面跳转之前或跳转后首屏弹出均可，推荐在 login 页面保存成功后弹出，保存/跳过后再 navigateBack。
```

触发条件：

```txt
nickname 为空、以 User_ 开头、以 Mock_ 开头、或命中默认昵称规则。
avatar 为空、等于 /static/images/default-avatar.png、或后端返回空头像。
只要头像或昵称任一项未完善，就可以弹出。
```

交互：

```txt
弹窗标题：完善头像昵称
头像区域：显示当前头像；微信端使用 open-type="chooseAvatar" 按钮选择微信头像。
昵称区域：微信端使用 input type="nickname"。
按钮：
  保存并继续
  暂时跳过
```

保存规则：

```txt
如果选择了微信头像，先调用 uploadImage({ bizType: 'user_avatar' }) 上传。
如果只修改昵称，只调用 PUT /api/auth/profile 传 nickname。
如果头像和昵称都修改，PUT /api/auth/profile 同时传 avatar 和 nickname。
保存成功后 userStore.setFromProfile(profile)。
如果上传接口返回 signedUrl/displayUrl，需要优先用于本地展示，avatarOssUrl/url 用于后端保存。
```

跳过规则：

```txt
跳过不调用后端。
本地记录 life-assistant:profile-complete-skip:{userId}，避免同一用户每次登录都弹。
设置页仍可继续编辑头像昵称。
后续可以在“我的”或“设置”页展示轻提示，但本次不强制。
```

### 4.2 设置页头像昵称修改

设置页新增“资料编辑面板”，入口仍在 `/pages/settings/index`。

头像修改分两种方式：

```txt
获取微信头像：
  使用 button open-type="chooseAvatar"。
  拿到临时头像路径后，复用上传逻辑。

本地上传头像：
  使用 uni.chooseImage。
  支持相册和拍照。
  保留 assertImageSize，默认不超过 5MB。
```

昵称修改分两种方式：

```txt
获取微信昵称：
  使用 input type="nickname"。
  用户确认后保存。

手动编辑昵称：
  使用普通 input。
  校验非空、最长 20 个字符。
```

推荐交互结构：

```txt
个人信息卡片：
  头像行：展示当前头像，点击打开“修改头像”操作面板。
  昵称行：展示当前昵称，点击打开“修改昵称”操作面板。
  手机号行：只读展示。

修改头像面板：
  使用微信头像
  从相册/拍照上传
  取消

修改昵称面板：
  微信昵称输入框
  手动昵称输入框
  保存
```

## 5. 前端实现计划

### 5.1 新增通用资料补全组件

建议新增：

```txt
miniapp/src/components/profile-complete-dialog/profile-complete-dialog.vue
```

职责：

```txt
接收 visible、initialAvatar、initialNickname、loading。
内部维护 selectedAvatarPath、nicknameInput。
微信端暴露 chooseAvatar 入口。
非微信端或 H5 展示本地上传兜底。
点击保存时 emit submit({ avatarFilePath?, nickname })。
点击跳过时 emit skip。
```

组件不直接调用后端，避免业务逻辑散落。

### 5.2 新增资料更新组合逻辑

建议新增：

```txt
miniapp/src/composables/useProfileEditor.ts
```

职责：

```txt
判断资料是否需要补全。
处理头像上传。
调用 updateProfile。
同步 userStore。
处理保存中状态和错误提示。
封装微信头像、本地头像、昵称保存的共用逻辑。
```

核心方法建议：

```ts
function shouldCompleteProfile(user: UserInfo): boolean
function hasSkippedProfileComplete(userId: number): boolean
function markProfileCompleteSkipped(userId: number): void
async function saveUserProfile(input: { nickname?: string; avatarFilePath?: string; avatarUrl?: string }): Promise<void>
```

### 5.3 登录页接入资料补全弹窗

修改文件：

```txt
miniapp/src/pages/login/index.vue
```

动作：

```txt
登录成功后先保存 tokenStore 和 userStore。
调用 shouldCompleteProfile(userStore.userInfo)。
如果需要补全且未跳过，展示 profile-complete-dialog。
用户保存成功后再执行 navigateBack。
用户跳过后记录跳过状态，再执行 navigateBack。
如果不需要补全，保持原逻辑 navigateBack。
```

注意：

```txt
loading 和 profileSaving 要分开，避免登录按钮一直转圈。
弹窗保存失败时停留在弹窗内，不跳转。
用户点击系统返回时不应造成半登录状态丢失。
```

### 5.4 设置页重构头像昵称编辑

修改文件：

```txt
miniapp/src/pages/settings/index.vue
```

动作：

```txt
保留现有个人信息卡片布局。
头像行点击后不直接 chooseImage，而是打开头像操作面板。
头像操作面板提供“使用微信头像”和“从相册/拍照上传”。
昵称行点击后打开昵称编辑面板。
昵称编辑面板提供微信昵称填写能力和手动输入能力。
所有保存动作统一走 useProfileEditor.saveUserProfile。
保存成功后关闭面板并刷新 userStore。
```

### 5.5 展示入口同步

检查文件：

```txt
miniapp/src/pages/profile/index.vue
miniapp/src/pages/home/index.vue
miniapp/src/pages/order/detail.vue
miniapp/src/pages/settings/index.vue
```

动作：

```txt
所有头像展示优先使用 userStore.userInfo.avatar。
默认头像统一使用 /static/images/default-avatar.png。
昵称展示统一用 userStore.userInfo.nickname，空值才降级为“微信用户”或“用户{id}”。
```

## 6. 后端实现计划

当前 `PUT /api/auth/profile` 已支持：

```txt
nickname?: string
avatar?: string
```

本次后端原则上不需要新增接口，但需要确认以下规则：

```txt
nickname trim 后不能为空。
nickname 最大长度建议前后端统一为 20 或 32，避免前端 20、后端 64 不一致。
avatar 必须是服务端认可的永久 OSS URL 或本地存储 URL。
不要把微信 chooseAvatar 临时路径直接保存到数据库。
上传头像接口需要支持 Authorization。
```

如需补强，建议后端增加：

```txt
UpdateProfileDto.nickname 增加最小长度校验。
updateProfile 中 nickname 为空字符串时返回 400。
upload/image 对 bizType=user_avatar 做图片类型和大小校验。
```

## 7. 数据和缓存规则

不新增数据库字段。

本地缓存新增：

```txt
life-assistant:profile-complete-skip:{userId}
```

用途：

```txt
记录某个用户已经跳过登录后的资料补全弹窗。
用户主动在设置页保存头像或昵称后，可以清理该 skip 标记。
退出登录不强制清理 skip 标记，避免同一用户反复弹窗。
```

## 8. 微信端兼容说明

```txt
不能再依赖 getUserProfile 静默获取头像昵称。
chooseAvatar 返回的是临时文件路径，必须上传到业务服务器后保存业务 URL。
input type="nickname" 仍需要用户确认或输入，不能无感获取。
开发工具和真机表现可能不同，最终以真机预览为准。
H5、本地调试和未来抖音端需要走本地上传/手动输入兜底。
```

## 9. 实施顺序

```txt
1. 新增 useProfileEditor，封装资料补全判断、头像上传和 updateProfile。
2. 新增 profile-complete-dialog 组件。
3. 登录页接入资料补全弹窗，完成保存/跳过/跳转流程。
4. 设置页头像编辑改为“微信头像 + 本地上传”双入口。
5. 设置页昵称编辑改为“微信昵称 + 手动编辑”双入口。
6. 检查个人中心和其他头像昵称展示入口。
7. 补齐后端 nickname 空值校验，如当前后端允许空昵称。
8. 运行 type-check 和 mp-weixin 构建。
9. 微信开发者工具和真机验证 chooseAvatar、nickname、上传和保存。
```

## 10. 验收清单

登录流程：

```txt
[ ] 新用户手机号登录成功后自动弹出头像昵称补全弹窗。
[ ] 默认头像或默认昵称用户登录后会触发补全弹窗。
[ ] 已完善头像昵称的用户登录后不弹窗。
[ ] 点击“暂时跳过”后能正常进入原目标页面。
[ ] 同一用户跳过后再次登录不重复弹窗。
[ ] 弹窗内选择微信头像后能上传并保存。
[ ] 弹窗内填写昵称后能保存。
[ ] 保存失败时不跳转，并给出错误提示。
```

设置页：

```txt
[ ] 头像行点击后出现修改头像面板。
[ ] 可以通过微信头像能力选择头像并保存。
[ ] 可以通过相册/拍照上传头像并保存。
[ ] 头像超过大小限制时提示并阻止上传。
[ ] 昵称行点击后出现修改昵称面板。
[ ] 可以通过微信昵称填写能力更新昵称。
[ ] 可以手动输入昵称并保存。
[ ] 空昵称不能保存。
[ ] 超长昵称不能保存。
[ ] 保存成功后设置页立即显示新头像昵称。
[ ] 返回个人中心后显示新头像昵称。
```

后端和数据：

```txt
[ ] PUT /api/auth/profile 能保存 nickname。
[ ] PUT /api/auth/profile 能保存上传后的 avatar URL。
[ ] 数据库不保存 chooseAvatar 临时路径。
[ ] GET /api/auth/me 返回最新头像昵称。
[ ] 上传接口携带 Authorization 后可正常上传头像。
```

构建验证：

```txt
cd miniapp
pnpm type-check
pnpm build:mp
```

## 11. 风险和注意事项

```txt
微信头像昵称必须用户主动授权/选择，不能承诺“无感自动获取”。
chooseAvatar 获取到的临时文件路径不能直接存后端。
头像上传如果使用 OSS 私有桶，前端展示要使用 signedUrl/displayUrl。
登录后弹窗不能阻塞 token 写入，否则用户保存资料失败时会变成未登录。
跳过补全不能影响下单、支付、地址等核心业务。
设置页要保留手动编辑兜底，避免微信能力在开发工具或个别基础库异常时不可用。
```

## 12. 工作量评估

```txt
前端组件和 composable：0.5-1 天
登录页接入：0.5 天
设置页双路径编辑：1 天
后端校验补强：0.5 天
联调和真机验证：0.5-1 天
```

总计建议预留：

```txt
2.5-4 个工作日
```
