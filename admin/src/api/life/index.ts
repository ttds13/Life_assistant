import request from "@/utils/request";
import type {
  AuditItem,
  AuditType,
  AddressRecord,
  AfterSalesTicket,
  AdminCreateOrderPayload,
  AdminWithdrawDetail,
  AdminWithdrawRequest,
  DashboardData,
  DispatchCheckResult,
  LifeFormItem,
  LifeModuleKey,
  LifeQueryParams,
  LifeResourceRecord,
  LifeResourceConfig,
  LifeResourcePage,
  LifeSelectOption,
  LifeStatusOption,
  OrderDetail,
  OrderListItem,
  StaffOption,
  UpdateOrderPayload,
} from "./types";

const ADMIN_BASE_URL = "/api/admin";

interface ServerPageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

type ResourcePayload = Record<string, unknown>;

const statusOptions = {
  active: [
    { label: "全部", value: "" },
    { label: "正常", value: "active", tagType: "success" },
    { label: "停用", value: "disabled", tagType: "info" },
  ],
  publish: [
    { label: "全部", value: "" },
    { label: "已发布", value: "published", tagType: "success" },
    { label: "草稿", value: "draft", tagType: "info" },
  ],
  staff: [
    { label: "全部", value: "" },
    { label: "正常", value: "active", tagType: "success" },
    { label: "停用", value: "disabled", tagType: "info" },
    { label: "待审核", value: "pending", tagType: "warning" },
  ],
  work: [
    { label: "全部", value: "" },
    { label: "在线", value: "online", tagType: "success" },
    { label: "忙碌", value: "busy", tagType: "warning" },
    { label: "离线", value: "offline", tagType: "info" },
  ],
  fulfillment: [
    { label: "全部", value: "" },
    { label: "服务中", value: "in_service", tagType: "primary" },
    { label: "待确认", value: "pending_confirm", tagType: "warning" },
    { label: "已完成", value: "completed", tagType: "success" },
  ],
  payments: [
    { label: "全部", value: "" },
    { label: "已支付", value: "paid", tagType: "success" },
    { label: "待支付", value: "pending_payment", tagType: "warning" },
    { label: "已退款", value: "refunded", tagType: "info" },
  ],
  reviews: [
    { label: "全部", value: "" },
    { label: "已发布", value: "published", tagType: "success" },
    { label: "待审核", value: "pending", tagType: "warning" },
    { label: "已驳回", value: "rejected", tagType: "danger" },
  ],
  feedbacks: [
    { label: "全部", value: "" },
    { label: "待处理", value: "open", tagType: "warning" },
    { label: "处理中", value: "processing", tagType: "primary" },
    { label: "已关闭", value: "closed", tagType: "info" },
  ],
} satisfies Record<string, LifeStatusOption[]>;

const categoryStatusOptions = [
  { label: "上架", value: "active" },
  { label: "停用", value: "disabled" },
];

const publishStatusOptions = [
  { label: "发布", value: "published" },
  { label: "草稿", value: "draft" },
];

const bannerLinkTypeOptions = [
  { label: "不跳转", value: "none" },
  { label: "服务详情", value: "service" },
  { label: "服务分类", value: "category" },
  { label: "外部链接", value: "url" },
];

const staffStatusOptions = [
  { label: "正常", value: "active" },
  { label: "停用", value: "disabled" },
  { label: "待审核", value: "pending" },
];

const ownerTypeOptions = [
  { label: "用户", value: "user" },
  { label: "师傅", value: "staff" },
];

const addressTypeOptions = [
  { label: "服务地址", value: "service" },
  { label: "常驻地址", value: "home" },
  { label: "工作地址", value: "work" },
  { label: "结算地址", value: "billing" },
];

const defaultAddressOptions = [
  { label: "默认", value: "true" },
  { label: "普通", value: "false" },
];

const cardTypeOptions = [
  { label: "不计卡", value: "none" },
  { label: "时长卡", value: "time" },
  { label: "次卡", value: "times" },
  { label: "需咨询", value: "consultation" },
];

const memberCardTypeOptions = [
  { label: "时长卡", value: "time" },
  { label: "次卡", value: "times" },
  { label: "需咨询", value: "consultation" },
];

const userMemberCardStatusOptions = [
  { label: "全部", value: "" },
  { label: "正常", value: "active", tagType: "success" },
  { label: "停用", value: "disabled", tagType: "info" },
  { label: "已过期", value: "expired", tagType: "warning" },
  { label: "已用完", value: "used_up", tagType: "info" },
] satisfies LifeStatusOption[];

const memberCardRecordTypeOptions = [
  { label: "全部", value: "" },
  { label: "发放", value: "grant", tagType: "success" },
  { label: "冻结", value: "freeze", tagType: "warning" },
  { label: "释放", value: "release", tagType: "primary" },
  { label: "核销", value: "consume", tagType: "danger" },
] satisfies LifeStatusOption[];

const promotionTargetTypeOptions = [
  { label: "服务商品", value: "service" },
  { label: "会员卡商品", value: "member_card" },
  { label: "服务分类", value: "category" },
  { label: "首页", value: "home" },
];

const userSourceOptions = [
  { label: "小程序", value: "miniapp" },
  { label: "后台录入", value: "admin" },
  { label: "电话客户", value: "phone" },
  { label: "线下客户", value: "offline" },
];

const resourceConfigs: Record<LifeModuleKey, LifeResourceConfig> = {
  users: {
    module: "users",
    title: "用户列表",
    description: "管理小程序注册用户、账号状态和订单入口。",
    searchPlaceholder: "昵称 / 手机号 / openid",
    primaryAction: "新增客户",
    editable: true,
    deletable: true,
    rowActions: [{ key: "addresses", label: "地址", type: "success" }],
    statusOptions: statusOptions.active,
    columns: [
      { prop: "nickname", label: "用户昵称", minWidth: 140 },
      { prop: "phone", label: "手机号", width: 130 },
      { prop: "roleType", label: "角色", width: 100, type: "tag" },
      { prop: "staffId", label: "师傅ID", width: 90 },
      { prop: "staffStatus", label: "师傅状态", width: 100, type: "tag" },
      { prop: "staffWorkStatus", label: "工作状态", width: 100, type: "tag" },
      { prop: "city", label: "城市", width: 110 },
      { prop: "source", label: "来源", width: 100, type: "tag" },
      { prop: "orderCount", label: "订单数", width: 90 },
      { prop: "totalPaid", label: "累计消费", width: 120, type: "money" },
      { prop: "adminRemark", label: "客户备注", minWidth: 160 },
      { prop: "status", label: "状态", width: 90, type: "tag" },
      { prop: "createdAt", label: "注册时间", width: 170, type: "datetime" },
    ],
    formItems: [
      { prop: "nickname", label: "用户昵称", type: "text" },
      { prop: "phone", label: "手机号", type: "text" },
      { prop: "gender", label: "性别", type: "number" },
      { prop: "cityCode", label: "城市编码", type: "text" },
      { prop: "source", label: "来源", type: "select", options: userSourceOptions },
      { prop: "adminRemark", label: "客户备注", type: "textarea" },
      { prop: "status", label: "状态", type: "select", options: categoryStatusOptions },
    ],
  },
  addresses: {
    module: "addresses",
    primaryAction: "新增地址",
    editable: true,
    deletable: true,
    title: "地址管理",
    description: "用于客服排查订单地址、联系人和服务区域。",
    searchPlaceholder: "联系人 / 手机号 / 地址",
    statusOptions: [{ label: "全部", value: "" }],
    columns: [
      { prop: "ownerType", label: "归属", width: 90 },
      { prop: "ownerName", label: "所有人", width: 120 },
      { prop: "ownerPhone", label: "所有人手机", width: 130 },
      { prop: "addressType", label: "类型", width: 110 },
      { prop: "contactName", label: "联系人", width: 120 },
      { prop: "contactPhone", label: "手机号", width: 130 },
      { prop: "city", label: "城市", width: 100 },
      { prop: "district", label: "区域", width: 110 },
      { prop: "address", label: "详细地址", minWidth: 260 },
      { prop: "isDefault", label: "默认地址", width: 100, type: "tag" },
      { prop: "updatedAt", label: "更新时间", width: 170, type: "datetime" },
    ],
    formItems: [
      { prop: "ownerType", label: "Owner Type", type: "select", required: true, options: ownerTypeOptions },
      { prop: "ownerId", label: "Owner ID", type: "number", required: true },
      { prop: "addressType", label: "Address Type", type: "select", required: true, options: addressTypeOptions },
      { prop: "contactName", label: "Contact", type: "text", required: true },
      { prop: "contactPhone", label: "Phone", type: "text", required: true },
      { prop: "provinceName", label: "Province", type: "text" },
      { prop: "cityName", label: "City", type: "text" },
      { prop: "districtName", label: "District", type: "text" },
      { prop: "streetName", label: "Street", type: "text" },
      { prop: "addressTitle", label: "Place", type: "text" },
      { prop: "detailAddress", label: "Detail", type: "textarea", required: true },
      { prop: "houseNumber", label: "House No.", type: "text" },
      { prop: "isDefault", label: "Default", type: "select", options: defaultAddressOptions },
    ],
  },
  serviceCategories: {
    module: "serviceCategories",
    title: "服务分类",
    description: "维护小程序首页的服务分类入口和排序。",
    searchPlaceholder: "分类名称",
    primaryAction: "新增分类",
    editable: true,
    deletable: true,
    statusOptions: statusOptions.active,
    columns: [
      { prop: "name", label: "分类名称", minWidth: 140 },
      { prop: "serviceCount", label: "服务数", width: 90 },
      { prop: "sortOrder", label: "排序", width: 80 },
      { prop: "status", label: "状态", width: 90, type: "tag" },
      { prop: "updatedAt", label: "更新时间", width: 170, type: "datetime" },
    ],
    formItems: [
      { prop: "name", label: "分类名称", type: "text", required: true },
      { prop: "description", label: "描述", type: "textarea" },
      { prop: "sortOrder", label: "排序", type: "number" },
      { prop: "status", label: "状态", type: "select", options: categoryStatusOptions },
    ],
  },
  services: {
    module: "services",
    title: "服务项目",
    description: "维护服务价格、服务时长、上下架和展示内容。",
    searchPlaceholder: "服务编码 / 服务名称 / 分类",
    primaryAction: "新增服务",
    editable: true,
    deletable: true,
    statusOptions: statusOptions.active,
    columns: [
      { prop: "coverImage", label: "封面", width: 110, type: "image" },
      { prop: "code", label: "服务编码", minWidth: 150 },
      { prop: "name", label: "服务名称", minWidth: 180 },
      { prop: "category", label: "分类", width: 120 },
      { prop: "basePrice", label: "基础价格", width: 120, type: "money" },
      { prop: "priceUnit", label: "单位", width: 80 },
      { prop: "duration", label: "时长", width: 100 },
      { prop: "cardType", label: "计卡类型", width: 100, type: "tag" },
      { prop: "consumeUnit", label: "扣减额度", width: 100 },
      { prop: "consultationRequired", label: "需咨询", width: 90, type: "tag" },
      { prop: "rating", label: "评分", width: 90, type: "rate" },
      { prop: "status", label: "状态", width: 90, type: "tag" },
    ],
    formItems: [
      { prop: "code", label: "服务编码", type: "text" },
      { prop: "categoryId", label: "分类 ID", type: "number", required: true },
      { prop: "name", label: "服务名称", type: "text", required: true },
      { prop: "description", label: "描述", type: "textarea" },
      { prop: "coverImage", label: "服务封面", type: "image" },
      { prop: "images", label: "服务附图", type: "images" },
      { prop: "basePrice", label: "基础价格", type: "number", required: true },
      { prop: "priceUnit", label: "单位", type: "text" },
      { prop: "durationMinutes", label: "时长分钟", type: "number" },
      { prop: "cardType", label: "计卡类型", type: "select", options: cardTypeOptions },
      { prop: "consumeUnit", label: "单次扣减额度", type: "number" },
      { prop: "consultationRequired", label: "需人工咨询", type: "switch" },
      { prop: "status", label: "状态", type: "select", options: categoryStatusOptions },
    ],
  },
  fulfillments: {
    module: "fulfillments",
    title: "履约记录",
    description: "查看师傅打卡、开始服务、完成服务和服务照片记录。",
    searchPlaceholder: "订单号 / 师傅 / 服务",
    statusOptions: statusOptions.fulfillment,
    columns: [
      { prop: "orderNo", label: "订单号", minWidth: 150 },
      { prop: "serviceName", label: "服务", minWidth: 160 },
      { prop: "staffName", label: "师傅", width: 110 },
      { prop: "checkinAt", label: "打卡时间", width: 170, type: "datetime" },
      { prop: "photoCount", label: "照片数", width: 90 },
      { prop: "status", label: "状态", width: 100, type: "tag" },
    ],
  },
  staff: {
    module: "staff",
    title: "师傅列表",
    description: "管理师傅认证、技能、接单状态、评分和服务范围。",
    searchPlaceholder: "师傅姓名 / 手机号 / 技能",
    primaryAction: "新增师傅",
    editable: true,
    deletable: true,
    rowActions: [{ key: "addresses", label: "地址", type: "success" }],
    statusOptions: statusOptions.staff,
    columns: [
      { prop: "userId", label: "用户ID", width: 90 },
      { prop: "userName", label: "绑定用户", width: 120 },
      { prop: "userStatus", label: "用户状态", width: 100, type: "tag" },
      { prop: "name", label: "师傅姓名", minWidth: 120 },
      { prop: "phone", label: "手机号", width: 130 },
      { prop: "skills", label: "技能", minWidth: 180 },
      { prop: "city", label: "城市", width: 100 },
      { prop: "applicationNote", label: "申请说明", minWidth: 220 },
      { prop: "applicationImageCount", label: "材料数", width: 80 },
      { prop: "rating", label: "评分", width: 90, type: "rate" },
      { prop: "totalOrders", label: "完成单量", width: 100 },
      { prop: "status", label: "状态", width: 90, type: "tag" },
    ],
    formItems: [
      { prop: "userId", label: "绑定用户ID", type: "number" },
      { prop: "name", label: "师傅姓名", type: "text", required: true },
      { prop: "phone", label: "手机号", type: "text", required: true },
      { prop: "avatarUrl", label: "师傅头像", type: "image" },
      { prop: "password", label: "初始密码", type: "text" },
      { prop: "skills", label: "技能", type: "text", placeholder: "用逗号分隔" },
      { prop: "cityCode", label: "城市编码", type: "text" },
      { prop: "status", label: "状态", type: "select", options: staffStatusOptions },
    ],
  },
  staffStatus: {
    module: "staffStatus",
    title: "工作状态",
    description: "观察师傅在线、忙碌、离线和当前订单情况。",
    searchPlaceholder: "师傅姓名 / 手机号",
    statusOptions: statusOptions.work,
    columns: [
      { prop: "name", label: "师傅姓名", minWidth: 120 },
      { prop: "phone", label: "手机号", width: 130 },
      { prop: "workStatus", label: "工作状态", width: 110, type: "tag" },
      { prop: "currentOrder", label: "当前订单", minWidth: 160 },
      { prop: "lastActiveAt", label: "最近在线", width: 170, type: "datetime" },
      { prop: "city", label: "城市", width: 100 },
    ],
  },
  payments: {
    module: "payments",
    title: "支付记录",
    description: "查看订单支付流水、支付渠道和回调结果。",
    searchPlaceholder: "支付单号 / 订单号 / 手机号",
    statusOptions: statusOptions.payments,
    columns: [
      { prop: "paymentNo", label: "支付单号", minWidth: 180 },
      { prop: "orderNo", label: "订单号", minWidth: 150 },
      { prop: "channel", label: "渠道", width: 100 },
      { prop: "transactionNo", label: "微信交易号", minWidth: 180 },
      { prop: "amount", label: "金额", width: 120, type: "money" },
      { prop: "status", label: "状态", width: 100, type: "tag" },
      { prop: "paidAt", label: "支付时间", width: 170, type: "datetime" },
    ],
  },
  reviews: {
    module: "reviews",
    title: "用户评价",
    description: "查看评价内容、服务评分和是否需要人工处理。",
    searchPlaceholder: "订单号 / 用户 / 师傅",
    statusOptions: statusOptions.reviews,
    columns: [
      { prop: "orderNo", label: "订单号", minWidth: 150 },
      { prop: "userName", label: "用户", width: 110 },
      { prop: "staffName", label: "师傅", width: 110 },
      { prop: "serviceName", label: "服务", minWidth: 140 },
      { prop: "rating", label: "评分", width: 90, type: "rate" },
      { prop: "content", label: "评价内容", minWidth: 240 },
      { prop: "status", label: "状态", width: 100, type: "tag" },
    ],
  },
  feedbacks: {
    module: "feedbacks",
    title: "问题反馈",
    description: "处理小程序我的页面提交的问题反馈、联系方式和处理回复。",
    searchPlaceholder: "反馈编号 / 用户 / 手机号 / 内容",
    editable: false,
    deletable: false,
    rowActions: [
      { key: "feedback_reply", label: "回复", type: "primary" },
      { key: "feedback_processing", label: "处理中", type: "warning" },
      { key: "feedback_close", label: "关闭", type: "info" },
    ],
    statusOptions: statusOptions.feedbacks,
    columns: [
      { prop: "feedbackNo", label: "反馈编号", minWidth: 150 },
      { prop: "type", label: "类型", width: 110, type: "tag" },
      { prop: "userName", label: "用户", width: 120 },
      { prop: "userPhone", label: "用户手机", width: 130 },
      { prop: "contactPhone", label: "联系电话", width: 130 },
      { prop: "content", label: "反馈内容", minWidth: 260 },
      { prop: "imageCount", label: "图片数", width: 80 },
      { prop: "status", label: "状态", width: 100, type: "tag" },
      { prop: "reply", label: "处理回复", minWidth: 220 },
      { prop: "createdAt", label: "提交时间", width: 170, type: "datetime" },
    ],
  },
  faqs: {
    module: "faqs",
    title: "常见问题",
    description: "维护小程序常见问题分类、问答内容和展示顺序。",
    searchPlaceholder: "分类 / 问题 / 答案",
    primaryAction: "新增问题",
    editable: true,
    deletable: true,
    statusOptions: statusOptions.active,
    columns: [
      { prop: "category", label: "分类", width: 130 },
      { prop: "question", label: "问题", minWidth: 220 },
      { prop: "answer", label: "答案", minWidth: 320 },
      { prop: "sortOrder", label: "排序", width: 80 },
      { prop: "status", label: "状态", width: 90, type: "tag" },
      { prop: "updatedAt", label: "更新时间", width: 170, type: "datetime" },
    ],
    formItems: [
      { prop: "category", label: "分类", type: "text", required: true },
      { prop: "question", label: "问题", type: "text", required: true },
      { prop: "answer", label: "答案", type: "textarea", required: true },
      { prop: "sortOrder", label: "排序", type: "number" },
      { prop: "status", label: "状态", type: "select", options: categoryStatusOptions },
    ],
  },
  supportConfig: {
    module: "supportConfig",
    title: "客服配置",
    description: "维护小程序联系客服页面展示的热线、服务咨询、服务时间和响应说明。",
    searchPlaceholder: "客服电话 / 服务咨询",
    editable: true,
    deletable: false,
    statusOptions: [{ label: "全部", value: "" }],
    columns: [
      { prop: "phone", label: "客服电话", width: 140 },
      { prop: "wechatId", label: "服务咨询", width: 180 },
      { prop: "serviceHours", label: "服务时间", width: 140 },
      { prop: "responseTime", label: "响应说明", minWidth: 260 },
      { prop: "onlineEnabled", label: "在线客服", width: 100, type: "tag" },
      { prop: "updatedAt", label: "更新时间", width: 170, type: "datetime" },
    ],
    formItems: [
      { prop: "phone", label: "客服电话", type: "text", required: true },
      { prop: "wechatId", label: "服务咨询", type: "text", required: true },
      { prop: "serviceHours", label: "服务时间", type: "text", required: true },
      { prop: "responseTime", label: "响应说明", type: "text", required: true },
      { prop: "onlineEnabled", label: "在线客服", type: "switch" },
    ],
  },
  homeBanners: {
    module: "homeBanners",
    title: "首页图片管理",
    description: "管理小程序首页轮播图。管理员可以上传新图，也可以直接粘贴已经上传到 OSS 的永久图片地址。",
    searchPlaceholder: "标题 / 副标题 / 跳转值",
    primaryAction: "新增图片",
    submitAction: "上传到 OSS 并保存",
    editable: true,
    deletable: true,
    statusOptions: [
      { label: "全部", value: "" },
      { label: "启用", value: "active", tagType: "success" },
      { label: "停用", value: "disabled", tagType: "info" },
    ],
    columns: [
      { prop: "imageUrl", label: "图片预览", width: 150, type: "image" },
      { prop: "imageOssUrl", label: "OSS 链接", minWidth: 320, type: "copy" },
      { prop: "title", label: "标题", minWidth: 160 },
      { prop: "subtitle", label: "副标题", minWidth: 180 },
      { prop: "linkType", label: "跳转类型", width: 110, type: "tag" },
      { prop: "linkValue", label: "跳转值", minWidth: 160 },
      { prop: "sortOrder", label: "排序", width: 80 },
      { prop: "status", label: "状态", width: 90, type: "tag" },
      { prop: "updatedAt", label: "更新时间", width: 170, type: "datetime" },
    ],
    formItems: [
      { prop: "title", label: "标题", type: "text", required: true },
      { prop: "subtitle", label: "副标题", type: "text" },
      { prop: "imageUrl", label: "轮播图片", type: "image", required: true },
      { prop: "linkType", label: "跳转类型", type: "select", options: bannerLinkTypeOptions },
      { prop: "linkValue", label: "跳转值", type: "text", placeholder: "服务 code/ID、分类 ID 或 URL" },
      { prop: "sortOrder", label: "排序", type: "number" },
      { prop: "status", label: "状态", type: "select", options: categoryStatusOptions },
    ],
  },
  promotionLinks: {
    module: "promotionLinks",
    title: "视频号链接管理",
    description: "管理视频号挂载的小程序固定路径，可随时调整链接指向的服务商品、会员卡商品或分类。",
    searchPlaceholder: "链接 key / 标题 / 商品编码",
    primaryAction: "新增链接",
    editable: true,
    deletable: true,
    statusOptions: [
      { label: "全部", value: "" },
      { label: "启用", value: "active", tagType: "success" },
      { label: "停用", value: "disabled", tagType: "info" },
    ],
    columns: [
      { prop: "linkKey", label: "链接 key", minWidth: 150 },
      { prop: "title", label: "标题", minWidth: 160 },
      { prop: "targetType", label: "目标类型", width: 120, type: "tag" },
      { prop: "targetName", label: "目标商品", minWidth: 180 },
      { prop: "miniappPath", label: "小程序固定路径", minWidth: 300, type: "copy" },
      { prop: "resolvedPath", label: "最终跳转路径", minWidth: 360, type: "copy" },
      { prop: "source", label: "来源", width: 110, type: "tag" },
      { prop: "sortOrder", label: "排序", width: 80 },
      { prop: "status", label: "状态", width: 90, type: "tag" },
      { prop: "startAt", label: "生效时间", width: 170, type: "datetime" },
      { prop: "endAt", label: "过期时间", width: 170, type: "datetime" },
      { prop: "updatedAt", label: "更新时间", width: 170, type: "datetime" },
    ],
    formItems: [
      { prop: "title", label: "标题", type: "text", required: true },
      { prop: "linkKey", label: "链接 key", type: "text", required: true, placeholder: "如 cleaning_2h，只允许小写字母、数字、下划线、短横线" },
      { prop: "description", label: "描述", type: "textarea" },
      { prop: "targetType", label: "目标类型", type: "select", required: true, options: promotionTargetTypeOptions },
      { prop: "targetId", label: "选择目标", type: "promotion-target" },
      { prop: "targetCode", label: "服务编码", type: "text", placeholder: "选择服务后自动填充，也可手动填写服务 code" },
      { prop: "source", label: "来源", type: "text", placeholder: "默认 channels" },
      { prop: "campaignId", label: "活动 ID", type: "number" },
      { prop: "sortOrder", label: "排序", type: "number" },
      { prop: "startAt", label: "生效时间", type: "datetime" },
      { prop: "endAt", label: "过期时间", type: "datetime" },
      { prop: "status", label: "状态", type: "select", options: categoryStatusOptions },
    ],
  },
  coupons: {
    module: "coupons",
    title: "优惠券",
    description: "维护平台优惠券、发放数量和有效期。",
    searchPlaceholder: "优惠券名称",
    primaryAction: "新增优惠券",
    editable: true,
    statusOptions: statusOptions.publish,
    columns: [
      { prop: "name", label: "优惠券名称", minWidth: 160 },
      { prop: "type", label: "类型", width: 100 },
      { prop: "amount", label: "面额", width: 100, type: "money" },
      { prop: "minAmount", label: "门槛", width: 100, type: "money" },
      { prop: "issuedCount", label: "已发放", width: 100 },
      { prop: "status", label: "状态", width: 90, type: "tag" },
    ],
    formItems: [
      { prop: "name", label: "优惠券名称", type: "text", required: true },
      { prop: "type", label: "类型", type: "text" },
      { prop: "amount", label: "面额", type: "number", required: true },
      { prop: "minAmount", label: "使用门槛", type: "number" },
      { prop: "totalCount", label: "总数量", type: "number" },
      { prop: "status", label: "状态", type: "select", options: publishStatusOptions },
    ],
  },
  memberCards: {
    module: "memberCards",
    title: "会员卡",
    description: "维护次卡、套餐卡和有效期。",
    searchPlaceholder: "会员卡名称",
    primaryAction: "新增会员卡",
    editable: true,
    statusOptions: statusOptions.publish,
    columns: [
      { prop: "name", label: "会员卡名称", minWidth: 160 },
      { prop: "cardType", label: "卡类型", width: 100, type: "tag" },
      { prop: "unitName", label: "单位", width: 90 },
      { prop: "totalUnits", label: "总额度", width: 100 },
      { prop: "totalTimes", label: "总次数", width: 100 },
      { prop: "price", label: "售价", width: 120, type: "money" },
      { prop: "validityDays", label: "有效天数", width: 110 },
      { prop: "soldCount", label: "已售", width: 90 },
      { prop: "status", label: "状态", width: 90, type: "tag" },
    ],
    formItems: [
      { prop: "name", label: "会员卡名称", type: "text", required: true },
      { prop: "cardType", label: "卡类型", type: "select", required: true, options: memberCardTypeOptions },
      { prop: "unitName", label: "单位名称", type: "text", placeholder: "分钟 / 次" },
      { prop: "unitMinutes", label: "单位分钟数", type: "number" },
      { prop: "totalUnits", label: "总额度", type: "number", required: true },
      { prop: "totalTimes", label: "兼容总次数", type: "number" },
      { prop: "allowHalfDeduct", label: "允许半次核销", type: "switch" },
      { prop: "minConsumeUnits", label: "最小扣减额度", type: "number" },
      { prop: "applicableServices", label: "适用服务", type: "textarea", placeholder: "服务ID、code 或名称，多个用逗号分隔；留空表示通用" },
      { prop: "serviceRules", label: "服务扣减规则", type: "textarea", placeholder: "{\"serviceCode\":{\"consumeUnits\":120}}" },
      { prop: "price", label: "售价", type: "number", required: true },
      { prop: "validityDays", label: "有效天数", type: "number", required: true },
      { prop: "status", label: "状态", type: "select", options: publishStatusOptions },
    ],
  },
  userMemberCards: {
    module: "userMemberCards",
    title: "用户会员卡",
    description: "查看用户已购买或后台发放的会员卡余额、冻结额度和有效期。",
    searchPlaceholder: "用户昵称 / 手机号 / 会员卡名称",
    statusOptions: userMemberCardStatusOptions,
    columns: [
      { prop: "userName", label: "用户", minWidth: 120 },
      { prop: "userPhone", label: "手机号", width: 130 },
      { prop: "cardName", label: "会员卡", minWidth: 160 },
      { prop: "cardType", label: "卡类型", width: 100, type: "tag" },
      { prop: "source", label: "来源", width: 100, type: "tag" },
      { prop: "remainingUnits", label: "剩余额度", width: 100 },
      { prop: "frozenUnits", label: "冻结额度", width: 100 },
      { prop: "usableUnits", label: "可用额度", width: 100 },
      { prop: "remainingTimes", label: "兼容次数", width: 100 },
      { prop: "purchaseOrderNo", label: "购买订单", minWidth: 150 },
      { prop: "expireAt", label: "有效期", width: 170, type: "datetime" },
      { prop: "status", label: "状态", width: 90, type: "tag" },
      { prop: "createdAt", label: "创建时间", width: 170, type: "datetime" },
    ],
  },
  memberCardRecords: {
    module: "memberCardRecords",
    title: "会员卡流水",
    description: "查看会员卡发放、预约冻结、取消释放和服务核销记录。",
    searchPlaceholder: "用户 / 手机号 / 会员卡 / 订单号",
    statusOptions: memberCardRecordTypeOptions,
    columns: [
      { prop: "userName", label: "用户", minWidth: 120 },
      { prop: "userPhone", label: "手机号", width: 130 },
      { prop: "cardName", label: "会员卡", minWidth: 160 },
      { prop: "orderNo", label: "订单号", minWidth: 150 },
      { prop: "recordType", label: "流水类型", width: 100, type: "tag" },
      { prop: "units", label: "变动额度", width: 100 },
      { prop: "beforeUnits", label: "变动前", width: 100 },
      { prop: "afterUnits", label: "变动后", width: 100 },
      { prop: "operatorType", label: "操作方", width: 90 },
      { prop: "operatorId", label: "操作人ID", width: 100 },
      { prop: "remark", label: "备注", minWidth: 220 },
      { prop: "createdAt", label: "创建时间", width: 170, type: "datetime" },
    ],
  },
};

const moduleEndpointMap: Record<LifeModuleKey, string> = {
  users: "users",
  addresses: "addresses",
  serviceCategories: "service-categories",
  services: "services",
  fulfillments: "fulfillments",
  staff: "staff",
  staffStatus: "staff/status",
  payments: "payments",
  reviews: "reviews",
  feedbacks: "feedbacks",
  faqs: "faqs",
  supportConfig: "support-config",
  homeBanners: "home-banners",
  promotionLinks: "promotion-links",
  coupons: "coupons",
  memberCards: "member-cards",
  userMemberCards: "user-member-cards",
  memberCardRecords: "member-card-records",
};

function toPageResult<T>(data: ServerPageResult<T>): PageResult<T> {
  return {
    list: data.items || [],
    total: data.total || 0,
  };
}

function toAdminQuery(queryParams: LifeQueryParams) {
  return {
    page: queryParams.pageNum,
    pageSize: queryParams.pageSize,
    keyword: queryParams.keywords,
    status: queryParams.status || undefined,
    orderType: queryParams.orderType || undefined,
    type: queryParams.type || (queryParams.module === "memberCardRecords" ? queryParams.status : undefined),
    recordType: queryParams.recordType || undefined,
    cardType: queryParams.cardType || undefined,
    source: queryParams.source || undefined,
    targetType: queryParams.targetType || undefined,
  };
}

function endpoint(module: LifeModuleKey) {
  return `${ADMIN_BASE_URL}/${moduleEndpointMap[module]}`;
}

function assertEditable(module: LifeModuleKey) {
  if (!resourceConfigs[module].editable) {
    throw new Error(`${module} 当前页面不支持编辑`);
  }
}

function assertDeletable(module: LifeModuleKey) {
  if (!resourceConfigs[module].deletable) {
    throw new Error(`${module} 当前页面不支持删除`);
  }
}

const LifeAPI = {
  getDashboard() {
    return request<unknown, DashboardData>({
      url: `${ADMIN_BASE_URL}/dashboard`,
      method: "get",
    });
  },

  async getResourcePage(module: LifeModuleKey, queryParams: LifeQueryParams) {
    const data = await request<unknown, ServerPageResult<LifeResourceRecord>>({
      url: endpoint(module),
      method: "get",
      params: toAdminQuery(queryParams),
    });
    return {
      config: resourceConfigs[module],
      list: data.items || [],
      total: data.total || 0,
    } satisfies LifeResourcePage;
  },

  updateResourceStatus(module: LifeModuleKey, id: string, status: string) {
    return request({
      url: `${endpoint(module)}/${id}/status`,
      method: "put",
      data: { status },
    });
  },

  getFeedback(id: string) {
    return request<unknown, LifeResourceRecord>({
      url: `${ADMIN_BASE_URL}/feedbacks/${id}`,
      method: "get",
    });
  },

  replyFeedback(id: string, data: { reply: string; status?: string }) {
    return request<unknown, LifeResourceRecord>({
      url: `${ADMIN_BASE_URL}/feedbacks/${id}/reply`,
      method: "post",
      data,
    });
  },

  updateUserRole(id: string, roleType: "user" | "staff") {
    return request({
      url: `${ADMIN_BASE_URL}/users/${id}/role`,
      method: "put",
      data: { roleType },
    });
  },

  grantMemberCard(data: { userId: number | string; cardId: number | string; totalUnits?: number; validityDays?: number; remark?: string }) {
    return request({
      url: `${ADMIN_BASE_URL}/member-cards/grant`,
      method: "post",
      data: {
        userId: Number(data.userId),
        cardId: Number(data.cardId),
        totalUnits: data.totalUnits ? Number(data.totalUnits) : undefined,
        validityDays: data.validityDays ? Number(data.validityDays) : undefined,
        remark: data.remark,
      },
    });
  },

  getPromotionTargetOptions(targetType: string, keyword?: string) {
    return request<unknown, LifeSelectOption[]>({
      url: `${ADMIN_BASE_URL}/promotion-links/target-options`,
      method: "get",
      params: { targetType, keyword },
    });
  },

  createResource(module: LifeModuleKey, data: ResourcePayload) {
    assertEditable(module);
    return request({
      url: endpoint(module),
      method: "post",
      data,
    });
  },

  updateResource(module: LifeModuleKey, id: string, data: ResourcePayload) {
    assertEditable(module);
    return request({
      url: `${endpoint(module)}/${id}`,
      method: "put",
      data,
    });
  },

  deleteResource(module: LifeModuleKey, id: string) {
    assertDeletable(module);
    return request({
      url: `${endpoint(module)}/${id}`,
      method: "delete",
    });
  },

  async getOrders(queryParams: LifeQueryParams) {
    const data = await request<unknown, ServerPageResult<OrderListItem>>({
      url: `${ADMIN_BASE_URL}/orders`,
      method: "get",
      params: toAdminQuery(queryParams),
    });
    return toPageResult(data);
  },

  getOrderDetail(id: string) {
    return request<unknown, OrderDetail>({
      url: `${ADMIN_BASE_URL}/orders/${id}`,
      method: "get",
    });
  },

  createAdminOrder(data: AdminCreateOrderPayload) {
    return request<unknown, OrderDetail>({
      url: `${ADMIN_BASE_URL}/orders`,
      method: "post",
      data,
    });
  },

  getOrderDispatchCheck(id: string, staffId?: string | number) {
    return request<unknown, DispatchCheckResult>({
      url: `${ADMIN_BASE_URL}/orders/${id}/dispatch-check`,
      method: "get",
      params: staffId ? { staffId } : undefined,
    });
  },

  updateOrder(id: string, data: UpdateOrderPayload) {
    return request<unknown, OrderDetail>({
      url: `${ADMIN_BASE_URL}/orders/${id}`,
      method: "put",
      data,
    });
  },

  deleteOrder(id: string) {
    return request<unknown, { id: string; orderNo: string; deleted: boolean }>({
      url: `${ADMIN_BASE_URL}/orders/${id}`,
      method: "delete",
    });
  },

  assignOrder(id: string, data: { staffId: string; remark?: string }) {
    return request({
      url: `${ADMIN_BASE_URL}/orders/${id}/assign`,
      method: "post",
      data: { ...data, staffId: Number(data.staffId) },
    });
  },

  autoAssignOrder(id: string, data?: { remark?: string }) {
    return request<unknown, OrderDetail>({
      url: `${ADMIN_BASE_URL}/orders/${id}/auto-assign`,
      method: "post",
      data: data || {},
    });
  },

  updateOrderRemark(id: string, remark: string) {
    return request<unknown, OrderDetail>({
      url: `${ADMIN_BASE_URL}/orders/${id}/remark`,
      method: "put",
      data: { remark },
    });
  },

  getStaffOptions() {
    return request<unknown, StaffOption[]>({
      url: `${ADMIN_BASE_URL}/staff/options`,
      method: "get",
    });
  },

  async getAuditItems(type: AuditType, queryParams: LifeQueryParams) {
    const data = await request<unknown, ServerPageResult<AuditItem>>({
      url: `${ADMIN_BASE_URL}/audits`,
      method: "get",
      params: { ...toAdminQuery(queryParams), type },
    });
    return toPageResult(data);
  },

  reviewAuditItem(id: string, data: { action: "approve" | "reject"; remark: string }) {
    return request({
      url: `${ADMIN_BASE_URL}/audits/${encodeURIComponent(id)}/review`,
      method: "post",
      data,
    });
  },

  async getWithdrawRequests(queryParams: LifeQueryParams) {
    const data = await request<unknown, ServerPageResult<AdminWithdrawRequest>>({
      url: `${ADMIN_BASE_URL}/withdraw-requests`,
      method: "get",
      params: toAdminQuery(queryParams),
    });
    return toPageResult(data);
  },

  getWithdrawDetail(id: string | number) {
    return request<unknown, AdminWithdrawDetail>({
      url: `${ADMIN_BASE_URL}/withdraw-requests/${id}`,
      method: "get",
    });
  },

  reviewWithdrawRequest(id: string | number, data: { action: "approve" | "reject"; remark?: string; executeNow?: boolean }) {
    return request<unknown, AdminWithdrawDetail>({
      url: `${ADMIN_BASE_URL}/withdraw-requests/${id}/review`,
      method: "post",
      data,
    });
  },

  executeWithdrawRequest(id: string | number, data?: { remark?: string; mockResult?: "success" | "failed" }) {
    return request<unknown, AdminWithdrawDetail>({
      url: `${ADMIN_BASE_URL}/withdraw-requests/${id}/execute`,
      method: "post",
      data: data || {},
    });
  },

  retryWithdrawRequest(id: string | number, data?: { remark?: string; mockResult?: "success" | "failed" }) {
    return request<unknown, AdminWithdrawDetail>({
      url: `${ADMIN_BASE_URL}/withdraw-requests/${id}/retry`,
      method: "post",
      data: data || {},
    });
  },

  cancelWithdrawTransfer(id: string | number) {
    return request<unknown, AdminWithdrawDetail>({
      url: `${ADMIN_BASE_URL}/withdraw-requests/${id}/cancel-transfer`,
      method: "post",
    });
  },

  queryWithdrawTransfer(id: string | number) {
    return request<unknown, AdminWithdrawDetail>({
      url: `${ADMIN_BASE_URL}/withdraw-requests/${id}/query-transfer`,
      method: "post",
    });
  },

  manualHandleWithdraw(id: string | number, data: { status: "paid" | "failed" | "cancelled" | "expired" | "manual_handling"; remark?: string; transferBillNo?: string }) {
    return request<unknown, AdminWithdrawDetail>({
      url: `${ADMIN_BASE_URL}/withdraw-requests/${id}/manual-handle`,
      method: "post",
      data,
    });
  },

  retryRefund(id: string, data: { remark: string }) {
    const refundId = id.includes(":") ? id.split(":").pop() : id;
    return request({
      url: `${ADMIN_BASE_URL}/refunds/${refundId}/retry`,
      method: "post",
      data,
    });
  },

  getAfterSalesTicket(id: string) {
    return request<unknown, AfterSalesTicket>({
      url: `${ADMIN_BASE_URL}/after-sales/tickets/${id}`,
      method: "get",
    });
  },

  replyAfterSalesTicket(id: string, data: { content: string; images?: string[] }) {
    return request<unknown, AfterSalesTicket>({
      url: `${ADMIN_BASE_URL}/after-sales/tickets/${id}/messages`,
      method: "post",
      data,
    });
  },

  resolveAfterSalesTicket(id: string, data: { remark?: string }) {
    return request<unknown, AfterSalesTicket>({
      url: `${ADMIN_BASE_URL}/after-sales/tickets/${id}/resolve`,
      method: "post",
      data,
    });
  },

  rejectAfterSalesTicket(id: string, data: { remark?: string }) {
    return request<unknown, AfterSalesTicket>({
      url: `${ADMIN_BASE_URL}/after-sales/tickets/${id}/reject`,
      method: "post",
      data,
    });
  },

  closeAfterSalesTicket(id: string, data: { remark?: string }) {
    return request<unknown, AfterSalesTicket>({
      url: `${ADMIN_BASE_URL}/after-sales/tickets/${id}/close`,
      method: "post",
      data,
    });
  },

  listOwnerAddresses(ownerType: "user" | "staff", ownerId: string | number) {
    return request<unknown, ServerPageResult<AddressRecord>>({
      url: `${ADMIN_BASE_URL}/${ownerType === "user" ? "users" : "staff"}/${ownerId}/addresses`,
      method: "get",
    });
  },

  createOwnerAddress(ownerType: "user" | "staff", ownerId: string | number, data: ResourcePayload) {
    return request<unknown, AddressRecord>({
      url: `${ADMIN_BASE_URL}/${ownerType === "user" ? "users" : "staff"}/${ownerId}/addresses`,
      method: "post",
      data,
    });
  },

  updateOwnerAddress(ownerType: "user" | "staff", ownerId: string | number, addressId: string | number, data: ResourcePayload) {
    return request<unknown, AddressRecord>({
      url: `${ADMIN_BASE_URL}/${ownerType === "user" ? "users" : "staff"}/${ownerId}/addresses/${addressId}`,
      method: "put",
      data,
    });
  },

  deleteOwnerAddress(ownerType: "user" | "staff", ownerId: string | number, addressId: string | number) {
    return request({
      url: `${ADMIN_BASE_URL}/${ownerType === "user" ? "users" : "staff"}/${ownerId}/addresses/${addressId}`,
      method: "delete",
    });
  },
};

export default LifeAPI;
export type { LifeFormItem };
export * from "./types";
