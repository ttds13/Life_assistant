import { defineMock } from "./base";

type TagType = "primary" | "success" | "warning" | "danger" | "info";

interface ResourceRecord {
  id: string;
  status?: string;
  [key: string]: unknown;
}

interface ResourceConfig {
  module: string;
  title: string;
  description: string;
  searchPlaceholder: string;
  columns: Array<{
    prop: string;
    label: string;
    width?: number;
    minWidth?: number;
    type?: "text" | "tag" | "money" | "datetime" | "rate";
  }>;
  statusOptions: Array<{
    label: string;
    value: string;
    tagType?: TagType;
  }>;
  primaryAction?: string;
}

const statusTagMap: Record<string, TagType> = {
  active: "success",
  disabled: "info",
  online: "success",
  busy: "warning",
  offline: "info",
  pending: "warning",
  approved: "success",
  rejected: "danger",
  pending_payment: "warning",
  pending_dispatch: "warning",
  assigned: "primary",
  in_service: "primary",
  pending_confirm: "warning",
  completed: "success",
  cancelled: "info",
  paid: "success",
  refunded: "info",
  published: "success",
  draft: "info",
};

const resourceConfigs: Record<string, ResourceConfig> = {
  users: {
    module: "users",
    title: "用户列表",
    description: "管理小程序注册用户、账号状态和订单入口。",
    searchPlaceholder: "昵称 / 手机号",
    primaryAction: "新增用户",
    statusOptions: [
      { label: "全部", value: "" },
      { label: "正常", value: "active", tagType: "success" },
      { label: "禁用", value: "disabled", tagType: "info" },
    ],
    columns: [
      { prop: "nickname", label: "用户昵称", minWidth: 140 },
      { prop: "phone", label: "手机号", width: 130 },
      { prop: "city", label: "城市", width: 110 },
      { prop: "orderCount", label: "订单数", width: 90 },
      { prop: "totalPaid", label: "累计消费", width: 120, type: "money" },
      { prop: "status", label: "状态", width: 90, type: "tag" },
      { prop: "createdAt", label: "注册时间", width: 170, type: "datetime" },
    ],
  },
  addresses: {
    module: "addresses",
    title: "地址管理",
    description: "用于客服排查订单地址、联系人和服务区域。",
    searchPlaceholder: "联系人 / 手机号 / 地址",
    statusOptions: [{ label: "全部", value: "" }],
    columns: [
      { prop: "contactName", label: "联系人", width: 120 },
      { prop: "contactPhone", label: "手机号", width: 130 },
      { prop: "city", label: "城市", width: 100 },
      { prop: "district", label: "区域", width: 110 },
      { prop: "address", label: "详细地址", minWidth: 260 },
      { prop: "isDefault", label: "默认地址", width: 100, type: "tag" },
      { prop: "updatedAt", label: "更新时间", width: 170, type: "datetime" },
    ],
  },
  serviceCategories: {
    module: "serviceCategories",
    title: "服务分类",
    description: "维护小程序首页的服务分类入口和排序。",
    searchPlaceholder: "分类名称 / key",
    primaryAction: "新增分类",
    statusOptions: [
      { label: "全部", value: "" },
      { label: "上架", value: "active", tagType: "success" },
      { label: "停用", value: "disabled", tagType: "info" },
    ],
    columns: [
      { prop: "name", label: "分类名称", minWidth: 140 },
      { prop: "key", label: "分类 Key", minWidth: 160 },
      { prop: "serviceCount", label: "服务数", width: 90 },
      { prop: "sortOrder", label: "排序", width: 80 },
      { prop: "status", label: "状态", width: 90, type: "tag" },
      { prop: "updatedAt", label: "更新时间", width: 170, type: "datetime" },
    ],
  },
  services: {
    module: "services",
    title: "服务项目",
    description: "维护服务价格、服务时长、上下架和展示内容。",
    searchPlaceholder: "服务名称 / 分类",
    primaryAction: "新增服务",
    statusOptions: [
      { label: "全部", value: "" },
      { label: "上架", value: "active", tagType: "success" },
      { label: "停用", value: "disabled", tagType: "info" },
    ],
    columns: [
      { prop: "name", label: "服务名称", minWidth: 180 },
      { prop: "category", label: "分类", width: 120 },
      { prop: "basePrice", label: "基础价格", width: 120, type: "money" },
      { prop: "priceUnit", label: "单位", width: 80 },
      { prop: "duration", label: "时长", width: 100 },
      { prop: "rating", label: "评分", width: 90, type: "rate" },
      { prop: "status", label: "状态", width: 90, type: "tag" },
    ],
  },
  fulfillments: {
    module: "fulfillments",
    title: "履约记录",
    description: "查看师傅打卡、开始服务、完成服务和服务照片记录。",
    searchPlaceholder: "订单号 / 师傅 / 服务",
    statusOptions: [
      { label: "全部", value: "" },
      { label: "服务中", value: "in_service", tagType: "primary" },
      { label: "待确认", value: "pending_confirm", tagType: "warning" },
      { label: "已完成", value: "completed", tagType: "success" },
    ],
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
    statusOptions: [
      { label: "全部", value: "" },
      { label: "正常", value: "active", tagType: "success" },
      { label: "禁用", value: "disabled", tagType: "info" },
      { label: "待审核", value: "pending", tagType: "warning" },
    ],
    columns: [
      { prop: "name", label: "师傅姓名", minWidth: 120 },
      { prop: "phone", label: "手机号", width: 130 },
      { prop: "skills", label: "技能", minWidth: 180 },
      { prop: "city", label: "城市", width: 100 },
      { prop: "rating", label: "评分", width: 90, type: "rate" },
      { prop: "totalOrders", label: "完成单量", width: 100 },
      { prop: "status", label: "状态", width: 90, type: "tag" },
    ],
  },
  staffStatus: {
    module: "staffStatus",
    title: "工作状态",
    description: "观察师傅在线、忙碌、离线和当前订单情况。",
    searchPlaceholder: "师傅姓名 / 手机号",
    statusOptions: [
      { label: "全部", value: "" },
      { label: "在线", value: "online", tagType: "success" },
      { label: "忙碌", value: "busy", tagType: "warning" },
      { label: "离线", value: "offline", tagType: "info" },
    ],
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
    statusOptions: [
      { label: "全部", value: "" },
      { label: "已支付", value: "paid", tagType: "success" },
      { label: "待支付", value: "pending_payment", tagType: "warning" },
      { label: "已退款", value: "refunded", tagType: "info" },
    ],
    columns: [
      { prop: "paymentNo", label: "支付单号", minWidth: 180 },
      { prop: "orderNo", label: "订单号", minWidth: 150 },
      { prop: "channel", label: "渠道", width: 100 },
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
    statusOptions: [
      { label: "全部", value: "" },
      { label: "已发布", value: "published", tagType: "success" },
      { label: "待审核", value: "pending", tagType: "warning" },
      { label: "已驳回", value: "rejected", tagType: "danger" },
    ],
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
  coupons: {
    module: "coupons",
    title: "优惠券",
    description: "维护平台优惠券、发放数量和有效期。",
    searchPlaceholder: "优惠券名称",
    primaryAction: "新增优惠券",
    statusOptions: [
      { label: "全部", value: "" },
      { label: "已发布", value: "published", tagType: "success" },
      { label: "草稿", value: "draft", tagType: "info" },
    ],
    columns: [
      { prop: "name", label: "优惠券名称", minWidth: 160 },
      { prop: "type", label: "类型", width: 100 },
      { prop: "amount", label: "面额", width: 100, type: "money" },
      { prop: "minAmount", label: "门槛", width: 100, type: "money" },
      { prop: "issuedCount", label: "已发放", width: 100 },
      { prop: "status", label: "状态", width: 90, type: "tag" },
    ],
  },
  memberCards: {
    module: "memberCards",
    title: "会员卡",
    description: "维护次卡、套餐卡和有效期。",
    searchPlaceholder: "会员卡名称",
    primaryAction: "新增会员卡",
    statusOptions: [
      { label: "全部", value: "" },
      { label: "已发布", value: "published", tagType: "success" },
      { label: "草稿", value: "draft", tagType: "info" },
    ],
    columns: [
      { prop: "name", label: "会员卡名称", minWidth: 160 },
      { prop: "totalTimes", label: "总次数", width: 100 },
      { prop: "price", label: "售价", width: 120, type: "money" },
      { prop: "validityDays", label: "有效天数", width: 110 },
      { prop: "soldCount", label: "已售", width: 90 },
      { prop: "status", label: "状态", width: 90, type: "tag" },
    ],
  },
};

const resources: Record<string, ResourceRecord[]> = {
  users: [
    row("U1001", { nickname: "王女士", phone: "13800010001", city: "青岛", orderCount: 8, totalPaid: 2680, status: "active", createdAt: "2026-05-02 09:31" }),
    row("U1002", { nickname: "李先生", phone: "13800010002", city: "上海", orderCount: 3, totalPaid: 760, status: "active", createdAt: "2026-05-08 14:12" }),
    row("U1003", { nickname: "赵女士", phone: "13800010003", city: "长春", orderCount: 0, totalPaid: 0, status: "disabled", createdAt: "2026-05-12 18:20" }),
  ],
  addresses: [
    row("A1001", { contactName: "王女士", contactPhone: "13800010001", city: "青岛", district: "黄岛区", address: "长江中路 118 号海岸花园 8 号楼 1201", isDefault: "active", updatedAt: "2026-05-22 10:11" }),
    row("A1002", { contactName: "李先生", contactPhone: "13800010002", city: "上海", district: "浦东新区", address: "世纪大道 100 号 8 栋 1201", isDefault: "disabled", updatedAt: "2026-05-21 09:00" }),
  ],
  serviceCategories: [
    row("C1001", { name: "家庭保洁", key: "daily_cleaning", serviceCount: 6, sortOrder: 1, status: "active", updatedAt: "2026-05-20 16:22" }),
    row("C1002", { name: "家电清洗", key: "appliance_cleaning", serviceCount: 5, sortOrder: 2, status: "active", updatedAt: "2026-05-19 11:42" }),
    row("C1003", { name: "上门维修", key: "home_repair", serviceCount: 4, sortOrder: 3, status: "active", updatedAt: "2026-05-18 13:10" }),
  ],
  services: [
    row("S1001", { name: "日常保洁 3 小时", category: "家庭保洁", basePrice: 180, priceUnit: "次", duration: "180 分钟", rating: 4.9, status: "active" }),
    row("S1002", { name: "油烟机深度清洗", category: "家电清洗", basePrice: 168, priceUnit: "台", duration: "120 分钟", rating: 4.8, status: "active" }),
    row("S1003", { name: "水电维修上门检测", category: "上门维修", basePrice: 59, priceUnit: "次", duration: "60 分钟", rating: 4.7, status: "disabled" }),
  ],
  fulfillments: [
    row("F1001", { orderNo: "LA202605290001", serviceName: "日常保洁 3 小时", staffName: "黄师傅", checkinAt: "2026-05-29 09:10", photoCount: 5, status: "in_service" }),
    row("F1002", { orderNo: "LA202605280004", serviceName: "窗帘清洗", staffName: "王师傅", checkinAt: "2026-05-28 14:25", photoCount: 7, status: "completed" }),
  ],
  staff: [
    row("ST1001", { name: "黄师傅", phone: "13900010001", skills: "家庭保洁、开荒保洁", city: "青岛", rating: 4.9, totalOrders: 132, status: "active" }),
    row("ST1002", { name: "王师傅", phone: "13900010002", skills: "窗帘清洗、家电清洗", city: "青岛", rating: 4.8, totalOrders: 86, status: "active" }),
    row("ST1003", { name: "刘师傅", phone: "13900010003", skills: "水电维修", city: "上海", rating: 5, totalOrders: 0, status: "pending" }),
  ],
  staffStatus: [
    row("WS1001", { name: "黄师傅", phone: "13900010001", workStatus: "busy", currentOrder: "LA202605290001", lastActiveAt: "2026-05-29 10:12", city: "青岛" }),
    row("WS1002", { name: "王师傅", phone: "13900010002", workStatus: "online", currentOrder: "暂无", lastActiveAt: "2026-05-29 10:14", city: "青岛" }),
    row("WS1003", { name: "李师傅", phone: "13900010004", workStatus: "offline", currentOrder: "暂无", lastActiveAt: "2026-05-28 18:32", city: "上海" }),
  ],
  payments: [
    row("P1001", { paymentNo: "PAY202605290001", orderNo: "LA202605290001", channel: "微信", amount: 180, status: "paid", paidAt: "2026-05-29 08:40" }),
    row("P1002", { paymentNo: "PAY202605280004", orderNo: "LA202605280004", channel: "微信", amount: 320, status: "paid", paidAt: "2026-05-28 13:58" }),
    row("P1003", { paymentNo: "PAY202605270003", orderNo: "LA202605270003", channel: "微信", amount: 168, status: "refunded", paidAt: "2026-05-27 11:28" }),
  ],
  reviews: [
    row("R1001", { orderNo: "LA202605280004", userName: "王女士", staffName: "王师傅", serviceName: "窗帘清洗", rating: 5, content: "服务认真，照片反馈完整。", status: "published" }),
    row("R1002", { orderNo: "LA202605260002", userName: "李先生", staffName: "黄师傅", serviceName: "日常保洁", rating: 4, content: "整体不错，厨房清洁还可加强。", status: "pending" }),
  ],
  coupons: [
    row("CP1001", { name: "新用户立减 20", type: "满减", amount: 20, minAmount: 99, issuedCount: 1200, status: "published" }),
    row("CP1002", { name: "深度清洁专享券", type: "满减", amount: 50, minAmount: 299, issuedCount: 320, status: "draft" }),
  ],
  memberCards: [
    row("MC1001", { name: "家庭保洁 5 次卡", totalTimes: 5, price: 799, validityDays: 180, soldCount: 86, status: "published" }),
    row("MC1002", { name: "家电清洗 3 次卡", totalTimes: 3, price: 399, validityDays: 120, soldCount: 41, status: "draft" }),
  ],
};

const orders = [
  {
    id: "10001",
    orderNo: "LA202605290001",
    status: "pending_dispatch",
    serviceName: "日常保洁 3 小时",
    userName: "王女士",
    userPhone: "13800010001",
    staffName: "",
    appointmentTime: "2026-05-29 14:00-17:00",
    addressText: "青岛市黄岛区长江中路 118 号海岸花园 8 号楼 1201",
    payableAmount: 180,
    paidAmount: 180,
    source: "miniapp",
    createdAt: "2026-05-29 08:38",
  },
  {
    id: "10002",
    orderNo: "LA202605290002",
    status: "assigned",
    serviceName: "油烟机深度清洗",
    userName: "李先生",
    userPhone: "13800010002",
    staffName: "王师傅",
    appointmentTime: "2026-05-29 15:00-17:00",
    addressText: "上海市浦东新区世纪大道 100 号 8 栋 1201",
    payableAmount: 168,
    paidAmount: 168,
    source: "miniapp",
    createdAt: "2026-05-29 09:12",
  },
  {
    id: "10003",
    orderNo: "LA202605280004",
    status: "completed",
    serviceName: "窗帘清洗",
    userName: "王女士",
    userPhone: "13800010001",
    staffName: "王师傅",
    appointmentTime: "2026-05-28 14:00-16:00",
    addressText: "青岛市市南区香港中路 9 号 1 单元 1802",
    payableAmount: 320,
    paidAmount: 320,
    source: "staff",
    createdAt: "2026-05-28 13:40",
  },
];

const staffOptions = [
  { value: "ST1001", label: "黄师傅", phone: "13900010001", workStatus: "busy" },
  { value: "ST1002", label: "王师傅", phone: "13900010002", workStatus: "online" },
  { value: "ST1004", label: "李师傅", phone: "13900010004", workStatus: "offline" },
];

let auditItems = [
  audit("AU1001", "staff", "刘师傅认证审核", "刘师傅", "ST1003", undefined, "high", "身份证、技能证明和服务城市待确认。"),
  audit("AU1002", "refund", "订单退款审核", "李先生", "LA202605270003", 168, "urgent", "用户反馈师傅未按时上门，申请全额退款。"),
  audit("AU1003", "withdraw", "师傅提现审核", "黄师傅", "WD202605290001", 860, "normal", "师傅申请提现本周已结算佣金。"),
  audit("AU1004", "ticket", "售后工单处理", "王女士", "TK202605290001", undefined, "high", "用户反馈家电清洗后需补充照片说明。"),
];

export default defineMock([
  {
    url: "life/dashboard",
    method: ["GET"],
    body: {
      code: "00000",
      data: {
        metrics: [
          metric("users", "用户量", 1286, "", "", 24, 186, "总访问量", 35872, "user", "#1677FF"),
          metric("orders", "订单量", 122, "", "", 8, 42, "总订单量", 9360, "table", "#16A34A"),
          metric("amount", "订单金额", 356426, "¥", "", 16820, 76240, "总金额", 3126890, "monitor", "#F59E0B"),
          metric("income", "平台订单收益", 144493, "¥", "", 6200, 28350, "总收益", 856230, "project", "#8B5CF6"),
          metric("fee", "平台手续费收益", 20480, "¥", "", 1180, 6420, "总收益", 96220, "setting", "#EC4899"),
        ],
        shortcuts: [
          { title: "用户", icon: "user", color: "#38BDF8", path: "/users/list" },
          { title: "服务", icon: "project", color: "#A5B4FC", path: "/services/items" },
          { title: "师傅", icon: "client", color: "#A855F7", path: "/staff/list" },
          { title: "订单", icon: "table", color: "#F59E0B", path: "/orders/list" },
          { title: "审核", icon: "todo", color: "#EF4444", path: "/audit/center" },
          { title: "财务", icon: "monitor", color: "#22C55E", path: "/finance/payments" },
          { title: "营销", icon: "bell", color: "#EC4899", path: "/marketing/coupons" },
          { title: "配置", icon: "setting", color: "#FB923C", path: "/system/config" },
        ],
        trend: {
          dates: ["5/23", "5/24", "5/25", "5/26", "5/27", "5/28", "5/29"],
          orderAmounts: [18200, 22400, 19860, 28600, 31800, 42500, 49800],
          orderCounts: [42, 51, 47, 63, 71, 96, 122],
        },
        statusDistribution: [
          { name: "待派单", value: 18 },
          { name: "服务中", value: 26 },
          { name: "待确认", value: 12 },
          { name: "已完成", value: 66 },
        ],
        todos: [
          { id: "T1", title: "待派单订单", module: "订单", count: 18, level: "warning", path: "/orders/dispatch" },
          { id: "T2", title: "师傅认证审核", module: "师傅", count: 3, level: "danger", path: "/staff/audit" },
          { id: "T3", title: "退款审核", module: "财务", count: 2, level: "warning", path: "/finance/refunds" },
          { id: "T4", title: "售后工单", module: "售后", count: 5, level: "primary", path: "/after-sales/tickets" },
        ],
        audits: auditItems.slice(0, 4),
      },
      msg: "一切ok",
    },
  },
  {
    url: "life/resources/:module",
    method: ["GET"],
    body({ params, query }) {
      const module = params.module;
      const config = resourceConfigs[module];
      const list = filterRows(resources[module] || [], query);
      return ok({
        config,
        list: paginate(list, query).list,
        total: list.length,
      });
    },
  },
  {
    url: "life/resources/:module/:id/status",
    method: ["PUT"],
    body({ params, body }) {
      const rows = resources[params.module] || [];
      const target = rows.find((item) => item.id === params.id);
      if (target) target.status = body.status;
      return ok(null, "状态已更新，等待后端接口接入");
    },
  },
  {
    url: "life/orders",
    method: ["GET"],
    body({ query }) {
      const list = filterRows(orders, query);
      return ok({
        list: paginate(list, query).list,
        total: list.length,
      });
    },
  },
  {
    url: "life/orders/:id",
    method: ["GET"],
    body({ params }) {
      const order = orders.find((item) => item.id === params.id) || orders[0];
      return ok({
        ...order,
        remark: "客户希望重点清洁厨房和卫生间。",
        adminRemark: "高峰时段订单，派单时优先选择同区域师傅。",
        serviceSpec: "3 小时上门保洁，含厨房、卫生间、客厅基础清洁。",
        amountItems: [
          { label: "服务金额", amount: order.payableAmount + 20 },
          { label: "优惠金额", amount: -20 },
          { label: "实付金额", amount: order.paidAmount },
        ],
        photos: ["/src/assets/images/logo.png"],
        statusLogs: [
          { title: "创建订单", time: order.createdAt, operator: "用户", description: "用户提交服务预约" },
          { title: "支付成功", time: "2026-05-29 08:40", operator: "系统", description: "微信支付回调成功" },
          { title: "进入派单", time: "2026-05-29 08:41", operator: "系统", description: "订单进入待派单队列" },
        ],
      });
    },
  },
  {
    url: "life/orders/:id/assign",
    method: ["POST"],
    body({ params, body }) {
      const order = orders.find((item) => item.id === params.id);
      const staff = staffOptions.find((item) => item.value === body.staffId);
      if (order && staff) {
        order.staffName = staff.label;
        order.status = "assigned";
      }
      return ok(null, `订单已指派给 ${staff?.label || "师傅"}`);
    },
  },
  {
    url: "life/staff/options",
    method: ["GET"],
    body: ok(staffOptions),
  },
  {
    url: "life/audits",
    method: ["GET"],
    body({ query }) {
      const type = String(query?.type || "all");
      let list = type === "all" ? auditItems : auditItems.filter((item) => item.type === type);
      list = filterRows(list, query);
      return ok({
        list: paginate(list, query).list,
        total: list.length,
      });
    },
  },
  {
    url: "life/audits/:id/review",
    method: ["POST"],
    body({ params, body }) {
      auditItems = auditItems.map((item) =>
        item.id === params.id
          ? {
              ...item,
              status: body.action === "approve" ? "approved" : "rejected",
              reviewedAt: "刚刚",
              reviewer: "系统管理员",
            }
          : item
      );
      return ok(null, body.action === "approve" ? "审核已通过" : "审核已驳回");
    },
  },
]);

function row(id: string, data: Omit<ResourceRecord, "id">): ResourceRecord {
  return { id, ...data };
}

function audit(
  id: string,
  type: string,
  title: string,
  applicant: string,
  bizNo: string,
  amount: number | undefined,
  priority: string,
  detail: string
) {
  return {
    id,
    type,
    title,
    applicant,
    bizNo,
    amount,
    status: "pending",
    priority,
    submittedAt: "2026-05-29 10:00",
    reason: detail,
    detail,
  };
}

function metric(
  key: string,
  title: string,
  value: number,
  prefix: string,
  suffix: string,
  weekDelta: number,
  monthDelta: number,
  totalLabel: string,
  totalValue: number,
  icon: string,
  color: string
) {
  return { key, title, value, prefix, suffix, weekDelta, monthDelta, totalLabel, totalValue, icon, color };
}

function ok(data: unknown, msg = "一切ok") {
  return {
    code: "00000",
    data,
    msg,
  };
}

function filterRows<T extends Record<string, unknown>>(rows: T[], query: Record<string, unknown>) {
  const keywords = String(query?.keywords || "").trim().toLowerCase();
  const status = String(query?.status || "").trim();
  return rows.filter((row) => {
    const statusMatched = !status || row.status === status || row.workStatus === status;
    const keywordMatched =
      !keywords ||
      Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(keywords));
    return statusMatched && keywordMatched;
  });
}

function paginate<T>(rows: T[], query: Record<string, unknown>) {
  const pageNum = Number(query?.pageNum || 1);
  const pageSize = Number(query?.pageSize || 10);
  const start = (pageNum - 1) * pageSize;
  return {
    list: rows.slice(start, start + pageSize),
    total: rows.length,
  };
}

export { statusTagMap };
