export type LifeModuleKey =
  | "users"
  | "addresses"
  | "serviceCategories"
  | "services"
  | "fulfillments"
  | "staff"
  | "staffStatus"
  | "payments"
  | "reviews"
  | "coupons"
  | "memberCards";

export type AuditType = "all" | "staff" | "refund" | "withdraw" | "ticket";

export interface LifeQueryParams {
  pageNum: number;
  pageSize: number;
  keywords?: string;
  status?: string;
  module?: LifeModuleKey;
  type?: AuditType;
}

export interface LifeColumn {
  prop: string;
  label: string;
  width?: number;
  minWidth?: number;
  type?: "text" | "tag" | "money" | "datetime" | "rate";
}

export interface LifeStatusOption {
  label: string;
  value: string;
  tagType?: "primary" | "success" | "warning" | "danger" | "info";
}

export interface LifeResourceAction {
  key: string;
  label: string;
  type?: "primary" | "success" | "warning" | "danger" | "info";
}

export interface LifeResourceConfig {
  module: LifeModuleKey;
  title: string;
  description: string;
  searchPlaceholder: string;
  columns: LifeColumn[];
  statusOptions: LifeStatusOption[];
  primaryAction?: string;
  editable?: boolean;
  deletable?: boolean;
  formItems?: LifeFormItem[];
  rowActions?: LifeResourceAction[];
}

export interface LifeResourceRecord {
  id: string;
  status?: string;
  [key: string]: unknown;
}

export interface AddressRecord extends LifeResourceRecord {
  ownerType?: "user" | "staff";
  ownerId?: string | number;
  addressType?: string;
  contactName?: string;
  contactPhone?: string;
  provinceName?: string;
  cityName?: string;
  districtName?: string;
  streetName?: string;
  addressTitle?: string;
  detailAddress?: string;
  houseNumber?: string;
  isDefault?: boolean;
}

export interface LifeFormItem {
  prop: string;
  label: string;
  type: "text" | "number" | "textarea" | "select" | "datetime";
  required?: boolean;
  options?: LifeStatusOption[];
  placeholder?: string;
}

export interface LifeResourcePage {
  config: LifeResourceConfig;
  list: LifeResourceRecord[];
  total: number;
}

export interface DashboardMetric {
  key: string;
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  weekDelta: number;
  monthDelta: number;
  totalLabel: string;
  totalValue: number;
  icon: string;
  color: string;
}

export interface DashboardShortcut {
  title: string;
  icon: string;
  color: string;
  path: string;
}

export interface DashboardTodo {
  id: string;
  title: string;
  module: string;
  count: number;
  level: "primary" | "warning" | "danger" | "success" | "info";
  path: string;
}

export interface DashboardAuditItem {
  id: string;
  title: string;
  type: AuditType;
  source: string;
  submittedAt: string;
  status: string;
}

export interface DashboardData {
  metrics: DashboardMetric[];
  shortcuts: DashboardShortcut[];
  trend: {
    dates: string[];
    orderAmounts: number[];
    orderCounts: number[];
  };
  statusDistribution: Array<{
    name: string;
    value: number;
  }>;
  todos: DashboardTodo[];
  audits: DashboardAuditItem[];
}

export interface OrderListItem {
  id: string;
  orderNo: string;
  status: string;
  serviceName: string;
  userName: string;
  userPhone: string;
  staffName?: string;
  appointmentTime: string;
  addressText: string;
  payableAmount: number;
  paidAmount: number;
  source: string;
  createdAt: string;
}

export interface OrderDetail extends OrderListItem {
  remark?: string;
  adminRemark?: string;
  serviceSpec: string;
  statusLogs: Array<{
    title: string;
    time: string;
    operator: string;
    description: string;
  }>;
  amountItems: Array<{
    label: string;
    amount: number;
  }>;
  photos: string[];
}

export interface StaffOption {
  value: string;
  label: string;
  phone: string;
  workStatus: string;
}

export interface AuditItem {
  id: string;
  type: AuditType;
  title: string;
  applicant: string;
  bizNo: string;
  amount?: number;
  status: "pending" | "approved" | "rejected";
  priority: "normal" | "high" | "urgent";
  submittedAt: string;
  reviewedAt?: string;
  reviewer?: string;
  reason: string;
  detail: string;
}
