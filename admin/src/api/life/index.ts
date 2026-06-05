import request from "@/utils/request";
import type {
  AuditItem,
  AuditType,
  AddressRecord,
  DashboardData,
  LifeFormItem,
  LifeModuleKey,
  LifeQueryParams,
  LifeResourceRecord,
  LifeResourceConfig,
  LifeResourcePage,
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
} satisfies Record<string, LifeStatusOption[]>;

const categoryStatusOptions = [
  { label: "上架", value: "active" },
  { label: "停用", value: "disabled" },
];

const publishStatusOptions = [
  { label: "发布", value: "published" },
  { label: "草稿", value: "draft" },
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

const resourceConfigs: Record<LifeModuleKey, LifeResourceConfig> = {
  users: {
    module: "users",
    title: "用户列表",
    description: "管理小程序注册用户、账号状态和订单入口。",
    searchPlaceholder: "昵称 / 手机号 / openid",
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
      { prop: "orderCount", label: "订单数", width: 90 },
      { prop: "totalPaid", label: "累计消费", width: 120, type: "money" },
      { prop: "status", label: "状态", width: 90, type: "tag" },
      { prop: "createdAt", label: "注册时间", width: 170, type: "datetime" },
    ],
    formItems: [
      { prop: "nickname", label: "用户昵称", type: "text" },
      { prop: "phone", label: "手机号", type: "text" },
      { prop: "gender", label: "性别", type: "number" },
      { prop: "cityCode", label: "城市编码", type: "text" },
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
    searchPlaceholder: "服务名称 / 分类",
    primaryAction: "新增服务",
    editable: true,
    deletable: true,
    statusOptions: statusOptions.active,
    columns: [
      { prop: "name", label: "服务名称", minWidth: 180 },
      { prop: "category", label: "分类", width: 120 },
      { prop: "basePrice", label: "基础价格", width: 120, type: "money" },
      { prop: "priceUnit", label: "单位", width: 80 },
      { prop: "duration", label: "时长", width: 100 },
      { prop: "rating", label: "评分", width: 90, type: "rate" },
      { prop: "status", label: "状态", width: 90, type: "tag" },
    ],
    formItems: [
      { prop: "categoryId", label: "分类 ID", type: "number", required: true },
      { prop: "name", label: "服务名称", type: "text", required: true },
      { prop: "description", label: "描述", type: "textarea" },
      { prop: "basePrice", label: "基础价格", type: "number", required: true },
      { prop: "priceUnit", label: "单位", type: "text" },
      { prop: "durationMinutes", label: "时长分钟", type: "number" },
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
      { prop: "rating", label: "评分", width: 90, type: "rate" },
      { prop: "totalOrders", label: "完成单量", width: 100 },
      { prop: "status", label: "状态", width: 90, type: "tag" },
    ],
    formItems: [
      { prop: "userId", label: "绑定用户ID", type: "number" },
      { prop: "name", label: "师傅姓名", type: "text", required: true },
      { prop: "phone", label: "手机号", type: "text", required: true },
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
      { prop: "totalTimes", label: "总次数", width: 100 },
      { prop: "price", label: "售价", width: 120, type: "money" },
      { prop: "validityDays", label: "有效天数", width: 110 },
      { prop: "soldCount", label: "已售", width: 90 },
      { prop: "status", label: "状态", width: 90, type: "tag" },
    ],
    formItems: [
      { prop: "name", label: "会员卡名称", type: "text", required: true },
      { prop: "totalTimes", label: "总次数", type: "number", required: true },
      { prop: "price", label: "售价", type: "number", required: true },
      { prop: "validityDays", label: "有效天数", type: "number", required: true },
      { prop: "status", label: "状态", type: "select", options: publishStatusOptions },
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
  coupons: "coupons",
  memberCards: "member-cards",
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
    type: queryParams.type || undefined,
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

  updateUserRole(id: string, roleType: "user" | "staff") {
    return request({
      url: `${ADMIN_BASE_URL}/users/${id}/role`,
      method: "put",
      data: { roleType },
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
