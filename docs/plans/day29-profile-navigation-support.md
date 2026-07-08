# Day 29 - 我的页入口跳转与支持页面完善计划

## 1. 目标

完善小程序 `我的` 页中以下入口的真实跳转和基础闭环：

1. `申请师傅`
2. `常见问题`
3. `联系客服`
4. `问题反馈`

同时删除 `申请合作商` 入口，避免展示当前业务不支持的能力。

当前问题集中在 `miniapp/src/pages/profile/index.vue`：

- `申请师傅 / 常见问题 / 联系客服 / 问题反馈` 目前只是 toast 占位。
- `申请合作商` 入口仍在 `appEntries` 中展示。
- 没有对应页面承载说明、表单、客服联系方式或反馈提交结果。

## 2. 完成标准

Day29 完成后应满足：

- `我的` 页不再展示 `申请合作商`。
- 点击 `申请师傅` 能进入申请页面，而不是提示联系客服。
- 点击 `常见问题` 能进入 FAQ 页面，并能按分类查看问题答案。
- 点击 `联系客服` 能进入客服页，支持拨打电话，微信端支持 `open-type="contact"`。
- 点击 `问题反馈` 能进入反馈页，用户可填写类型、内容、联系方式、图片凭证。
- 未登录用户点击需要登录的入口时，仍跳转登录页。
- 所有新增页面通过小程序类型检查和微信端构建。

## 3. 页面与路由规划

建议新增页面：

```text
miniapp/src/pages/profile/apply-staff.vue
miniapp/src/pages/profile/faq.vue
miniapp/src/pages/profile/contact-service.vue
miniapp/src/pages/profile/feedback.vue
```

建议新增前端支持数据/API：

```text
miniapp/src/api/support.ts
miniapp/src/api/types/support.ts
miniapp/src/constants/support.ts
```

如果 Day29 只做前端可用版本：

- FAQ 和客服信息先放在 `constants/support.ts`。
- 申请师傅和问题反馈先完成表单校验、图片上传和提交占位。

如果 Day29 要做完整提交闭环：

- 后端补 `SupportModule` 或在现有用户模块中新增接口。
- `申请师傅` 提交后创建 `Staff.status = pending` 或专门的申请记录。
- `问题反馈` 提交后创建反馈记录或非订单类工单。

## 4. 第一阶段：我的页入口改造

修改文件：

- `miniapp/src/pages/profile/index.vue`

具体步骤：

1. 删除 `AppAction` 中的 `applyPartner`。
2. 删除 `appEntries` 里的 `申请合作商`。
3. 删除 `titleMap.applyPartner`。
4. 给四个入口补真实跳转：

```text
applyStaff      -> /pages/profile/apply-staff
faq             -> /pages/profile/faq
customerService -> /pages/profile/contact-service
feedback        -> /pages/profile/feedback
```

5. 保持登录规则：
   - `申请师傅`：需要登录。
   - `问题反馈`：建议需要登录，方便追踪处理。
   - `常见问题`：不需要登录。
   - `联系客服`：不需要登录。

6. 如果跳转失败，统一 toast `页面暂不可用`，并在控制台打印错误。

验收点：

- 我的页九宫格不再出现 `申请合作商`。
- 四个入口点击后都进入对应页面。
- 未登录点击 `申请师傅/问题反馈` 会进入登录页。

## 5. 第二阶段：申请师傅页面

新增文件：

- `miniapp/src/pages/profile/apply-staff.vue`

页面字段建议：

```text
姓名
手机号
服务城市
服务技能，多选或逗号输入
从业年限
身份证号，可选，第一版可不强制
个人简介
证件/资质图片，最多 3-6 张
```

交互步骤：

1. 页面进入后读取 `userStore.userInfo`，默认填充手机号。
2. 如果当前账号已经是 `staff`，显示“你已开通师傅端”，按钮跳转 `/pages/staff/home`。
3. 如果已经提交过申请，展示申请状态：
   - `pending`：审核中
   - `approved`：已通过，可进入师傅端
   - `rejected`：已驳回，可修改后重新提交
4. 表单校验：
   - 姓名必填。
   - 手机号必填且格式正确。
   - 至少选择或填写 1 个技能。
   - 图片上传中禁止提交。
5. 提交成功后展示“申请已提交，平台将在 1-3 个工作日内审核”。

后端接口建议：

```text
GET  /staff/applications/me
POST /staff/applications
PUT  /staff/applications/me
```

如果复用现有 `Staff` 表：

- 首次提交创建 `Staff`，`userId = 当前用户`，`status = 2` 表示待审核。
- 后台原有 `师傅认证审核` 列表已经读取 `staff.status = 2`，可直接进入审核中心。
- 审核通过后用户 `role` 应变为 `staff`，前端刷新 `auth/me` 后显示 `师傅端`。

验收点：

- 普通用户可提交申请。
- 重复提交不会创建多条待审核记录。
- 申请中再次进入页面能看到状态。
- 审核通过后我的页显示 `师傅端`。

## 6. 第三阶段：常见问题页面

新增文件：

- `miniapp/src/pages/profile/faq.vue`

新增数据：

- `miniapp/src/constants/support.ts`

FAQ 分类建议：

```text
订单与支付
退款与售后
会员卡使用
师傅服务
账号与登录
```

页面能力：

1. 顶部搜索框，按标题和答案关键字过滤。
2. 分类 tabs，默认全部。
3. FAQ 折叠面板，点击展开答案。
4. 底部固定或页面底部提供“没有解决？联系客服 / 问题反馈”入口。

第一版 FAQ 可前端静态配置，后续再迁到后台内容管理。

验收点：

- 未登录也能访问。
- 搜索、分类、展开收起正常。
- 页面内容不依赖接口也能展示。

## 7. 第四阶段：联系客服页面

新增文件：

- `miniapp/src/pages/profile/contact-service.vue`

页面内容建议：

```text
客服热线
服务时间
微信客服按钮
常见问题入口
问题反馈入口
```

交互步骤：

1. `拨打电话` 使用 `uni.makePhoneCall`。
2. 微信小程序端增加按钮：

```html
<!-- #ifdef MP-WEIXIN -->
<button open-type="contact">在线客服</button>
<!-- #endif -->
```

3. 非微信端展示“复制客服微信 / 拨打电话”。
4. 客服信息先从 `constants/support.ts` 读取：

```ts
supportPhone
serviceHours
wechatId
```

验收点：

- 未登录也能访问。
- 电话按钮能唤起拨号。
- 微信端在线客服按钮能正常渲染。
- 能从客服页跳到 FAQ 和问题反馈。

## 8. 第五阶段：问题反馈页面

新增文件：

- `miniapp/src/pages/profile/feedback.vue`

字段建议：

```text
反馈类型：功能异常 / 订单问题 / 支付退款 / 服务体验 / 其他
问题描述
联系方式，默认用户手机号
图片凭证，最多 6 张
```

交互步骤：

1. 登录校验，未登录跳转登录页。
2. 图片使用现有 `upload-image-grid`。
3. 校验描述长度至少 5 个字。
4. 提交中禁用按钮，防重复提交。
5. 提交成功后显示反馈编号或成功提示，并返回我的页或停留在成功态。

后端接口建议：

```text
POST /feedback
GET  /feedback/my
GET  /admin/feedback
POST /admin/feedback/:id/reply
POST /admin/feedback/:id/close
```

数据模型建议：

```text
Feedback
- id
- feedbackNo
- userId
- type
- content
- contactPhone
- images
- status: open / processing / closed
- reply
- handledBy
- handledAt
- createdAt
- updatedAt
```

如果不想新增 `Feedback` 表，也可以扩展 Day28 的 `Ticket`，但当前 `Ticket.orderId` 必填，订单无关反馈不适合直接复用，建议单独建表。

验收点：

- 可提交文字反馈。
- 可提交图片凭证。
- 登录态丢失时不提交，跳登录。
- 重复点击不会重复提交。

## 9. 第六阶段：后台承接计划

如果 Day29 要形成处理闭环，后台还需补：

1. 后台“师傅认证审核”支持查看用户提交资料和资质图片。
2. 审核通过后：
   - `Staff.status = active`
   - `User.roleType/role = staff`
   - 写 admin audit log
3. 审核拒绝后：
   - 保留申请记录
   - 写拒绝原因
   - 用户端申请页展示拒绝原因
4. 后台新增“问题反馈”列表：
   - 反馈编号
   - 用户
   - 类型
   - 内容摘要
   - 图片
   - 状态
   - 提交时间
5. 反馈处理动作：
   - 标记处理中
   - 回复
   - 关闭
   - 写 admin audit log

## 10. 测试清单

小程序验证：

```bash
cd miniapp
npm run type-check
npm run build:mp
```

功能测试：

1. 我的页不显示 `申请合作商`。
2. 未登录点击 `常见问题/联系客服` 可直接进入。
3. 未登录点击 `申请师傅/问题反馈` 跳登录。
4. 登录后点击 `申请师傅` 进入表单页。
5. 已是师傅账号进入申请页时提示已开通，并可跳师傅端。
6. FAQ 搜索、分类、展开收起正常。
7. 客服页拨打电话能唤起系统拨号。
8. 微信端客服按钮正常渲染。
9. 问题反馈描述为空或过短时不能提交。
10. 图片上传中不能提交反馈。
11. 提交失败时有明确错误提示。
12. 页面返回、刷新、重新进入状态正常。

## 11. Day29 执行拆分

### 上午：入口和静态页面

1. 删除 `申请合作商` 入口和类型。
2. 新增四个页面文件。
3. 修改 `onAppTap` 路由跳转。
4. 完成 FAQ 静态数据和页面。
5. 完成联系客服页面。
6. 跑小程序 `type-check`。

### 下午：表单页面和 API 预留

1. 完成申请师傅表单 UI、校验和状态展示。
2. 完成问题反馈表单 UI、校验、图片上传。
3. 新增 `support.ts` API 封装和类型定义。
4. 如果后端接口未完成，先用明确的 `TODO` 和统一提交占位，不再 toast 混在我的页中。
5. 跑小程序 `type-check`。

### 晚上：联调与验收

1. 接入后端申请师傅接口。
2. 接入后端反馈提交接口。
3. 验证未登录、已登录、已是师傅、申请审核中等状态。
4. 跑 `npm run build:mp`。
5. 在微信开发者工具中验证页面跳转和客服按钮。

## 12. 风险与注意事项

- `申请师傅` 如果直接创建 `Staff`，要保证手机号、userId 幂等，避免一个用户重复申请多条待审核记录。
- `问题反馈` 不建议复用订单售后 `Ticket`，因为当前 `Ticket.orderId` 必填。
- 客服按钮 `open-type="contact"` 只在微信小程序端有效，需要条件编译。
- FAQ 第一版静态化最稳，后续再迁后台内容管理。
- 新页面不要只做说明页，至少要有真实表单、真实跳转或明确的联系动作。
