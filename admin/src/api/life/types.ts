export type LifeModuleKey =
  | "users"
  | "addresses"
  | "serviceCategories"
  | "services"
  | "fulfillments"
  | "staff"
  | "staffStatus"
  | "payments"
  | "pointLedgers"
  | "reviews"
  | "feedbacks"
  | "faqs"
  | "supportConfig"
  | "homeBanners"
  | "promotionLinks"
  | "coupons"
  | "userCoupons"
  | "memberCards"
  | "userMemberCards"
  | "memberCardRecords";

export type AuditType = "all" | "staff" | "refund" | "withdraw" | "ticket";

export interface LifeQueryParams {
  pageNum: number;
  pageSize: number;
  keywords?: string;
  status?: string;
  orderType?: string;
  module?: LifeModuleKey;
  type?: AuditType;
  recordType?: string;
  cardType?: string;
  source?: string;
  channel?: string;
  startDate?: string;
  endDate?: string;
  userId?: string;
  couponId?: string;
  targetType?: string;
  staffId?: string;
  orderId?: string;
  orderNo?: string;
  sendStatus?: string;
  isRead?: string;
  changeType?: string;
}

export interface LifeColumn {
  prop: string;
  label: string;
  width?: number;
  minWidth?: number;
  type?: "text" | "tag" | "money" | "datetime" | "rate" | "image" | "copy";
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
  submitAction?: string;
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

export interface AdminCreateOrderPayload {
  userId?: number;
  customer?: {
    nickname?: string;
    phone?: string;
    gender?: number;
    cityCode?: string;
    adminRemark?: string;
  };
  serviceId: number;
  addressId?: number;
  address?: {
    contactName: string;
    contactPhone: string;
    provinceName?: string;
    cityName?: string;
    districtName?: string;
    streetName?: string;
    addressTitle?: string;
    detailAddress: string;
    houseNumber?: string;
    latitude?: number;
    longitude?: number;
    coordinateType?: string;
    poiId?: string;
    mapProvider?: string;
    isDefault?: boolean;
  };
  appointmentStartTime: string;
  appointmentEndTime: string;
  source?: string;
  remark?: string;
  adminRemark?: string;
  originalAmount?: number;
  discountAmount?: number;
  payableAmount?: number;
}

export interface DispatchCheckResult {
  canAssign: boolean;
  blockingReasons: string[];
  warnings: string[];
  requiredFields: string[];
}

export interface OrderAccountingResult {
  orderId: number;
  orderNo: string;
  status: string;
  historicalPaidAmount?: number;
  refundedAmount?: number;
  netPaidAmount?: number;
  couponRecord?: {
    id: number;
    status: string;
    usedOrderId?: number | null;
    receivedAt: string;
    usedAt?: string | null;
    expireAt: string;
  } | null;
  passed: boolean;
  checks: Array<{
    key: string;
    passed: boolean;
    message: string;
  }>;
  payments: Array<{
    id: number;
    paymentNo: string;
    channel: string;
    status: string;
    amount: number;
    refundedAmount: number;
    paidAt?: string | null;
  }>;
  pointLedgers: Array<{
    id: number;
    type: string;
    points: number;
    amount: number;
    balanceAfter: number;
    createdAt: string;
  }>;
  incomeRecords: Array<{
    id: number;
    staffId: number;
    amount: number;
    type: string;
    status: string;
    settlementStatus: string;
    withdrawStatus: string;
  }>;
  refunds: Array<{
    id: number;
    refundNo: string;
    amount: number;
    status: string;
    refundedAt?: string | null;
  }>;
}

export interface AdminNotificationItem {
  id: number;
  receiverType: string;
  receiverId: number;
  type: string;
  title: string;
  content: string;
  bizType: string;
  bizId: number | null;
  isRead: boolean;
  channel: string;
  sendStatus: string;
  createdAt: string;
}

export interface AdminStaffNotificationItem extends AdminNotificationItem {
  sentAt?: string | null;
  readAt?: string | null;
  retryCount: number;
  lastRetriedAt?: string | null;
  failureReason: string;
  staffId: number;
  staffName: string;
  staffPhone: string;
  staffStatus?: number | null;
  staffWorkStatus?: number | null;
  orderId?: number | null;
  orderNo: string;
  orderStatus: string;
  orderStaffId?: number | null;
}

export interface StaffProfileSnapshot {
  name: string;
  avatarUrl?: string | null;
  cityCode?: string | null;
  skills: string[];
  idCard?: string | null;
  applicationNote?: string | null;
  applicationImages: string[];
}

export interface StaffProfileChangeRequestItem {
  id: number;
  requestNo: string;
  staffId: number;
  userId?: number | null;
  staffName: string;
  staffPhone: string;
  staffStatus?: number | null;
  staffWorkStatus?: number | null;
  changeType: string;
  status: string;
  beforeSnapshot: StaffProfileSnapshot;
  afterSnapshot: StaffProfileSnapshot;
  changedFields: string[];
  submitNote: string;
  rejectReason: string;
  submittedBy?: number | null;
  reviewedBy?: number | null;
  reviewedAt?: string | null;
  appliedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  beforeAvatarDisplayUrl?: string;
  afterAvatarDisplayUrl?: string;
  beforeApplicationImageUrls?: string[];
  afterApplicationImageUrls?: string[];
}

export interface StaffProfileHistory {
  staff: {
    id: number;
    name: string;
    phone: string;
    avatarUrl: string;
    avatarDisplayUrl: string;
    cityCode: string;
    status: number;
    workStatus: number;
  };
  requests: StaffProfileChangeRequestItem[];
  auditLogs: Array<{
    id: number;
    action: string;
    module: string;
    operatorType: string;
    operatorId: number;
    detail: unknown;
    createdAt: string;
  }>;
}

export interface LifeFormItem {
  prop: string;
  label: string;
  type: "text" | "number" | "textarea" | "select" | "datetime" | "image" | "images" | "switch" | "promotion-target";
  required?: boolean;
  options?: LifeStatusOption[];
  placeholder?: string;
}

export interface LifeSelectOption {
  label: string;
  value: string;
  code?: string;
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

export interface FinanceSummaryGroup {
  status?: string;
  label?: string;
  source?: string;
  channel?: string;
  type?: string;
  count: number;
  amount?: number;
  grossAmount?: number;
  discountAmount?: number;
  payableAmount?: number;
  paidAmount?: number;
  refundedAmount?: number;
  netAmount?: number;
  points?: number;
}

export interface FinanceSummaryData {
  filters: {
    startDate?: string | null;
    endDate?: string | null;
    source: string;
    channel: string;
  };
  summary: {
    orderCount: number;
    grossAmount: number;
    discountAmount: number;
    couponOrderCount: number;
    couponDiscount: number;
    payableAmount: number;
    orderPaidAmount: number;
    paymentCount: number;
    paidAmount: number;
    paymentRefundedAmount: number;
    refundCount: number;
    refundAmount: number;
    netRevenue: number;
    incomeCount: number;
    incomeAmount: number;
    pointsEarned: number;
    pointsDeducted: number;
    pointsNet: number;
  };
  breakdowns: {
    ordersBySource: FinanceSummaryGroup[];
    ordersByStatus: FinanceSummaryGroup[];
    paymentsByChannel: FinanceSummaryGroup[];
    refundsByStatus: FinanceSummaryGroup[];
    incomeByStatus: FinanceSummaryGroup[];
    incomeBySettlement: FinanceSummaryGroup[];
    incomeByWithdraw: FinanceSummaryGroup[];
    withdrawsByStatus: FinanceSummaryGroup[];
    pointsByType: FinanceSummaryGroup[];
  };
}

export interface AdminUserPointsSummary {
  userId: number;
  userName: string;
  userPhone: string;
  totalPoints: number;
  availablePoints: number;
  totalAmount: number;
  ledgerCount: number;
  recentLedgers: Array<{
    id: number;
    orderId?: number | null;
    orderNo: string;
    type: string;
    points: number;
    amount: number;
    balanceAfter: number;
    remark: string;
    createdAt: string;
  }>;
}

export interface OrderListItem {
  id: string;
  orderNo: string;
  orderType?: string;
  status: string;
  staffId?: number | null;
  serviceName: string;
  serviceCardType?: string;
  serviceConsumeUnit?: number;
  userName: string;
  userPhone: string;
  staffName?: string;
  staffPhone?: string;
  appointmentStartTime: string;
  appointmentEndTime: string;
  appointmentTime: string;
  addressText: string;
  totalAmount?: number;
  payableAmount: number;
  paidAmount: number;
  originalAmount?: number;
  discountAmount?: number;
  source: string;
  remark?: string;
  adminRemark?: string;
  memberCardId?: number | null;
  memberCardConsumeUnits?: number;
  memberCardName?: string;
  memberCardUnitName?: string;
  plannedConsumeUnits?: number;
  actualConsumeUnits?: number;
  releasedUnits?: number;
  frozenUnits?: number;
  purchaseCardId?: number | null;
  grantedUserMemberCardId?: number | null;
  acceptedAt?: string | null;
  onTheWayAt?: string | null;
  checkinAt?: string | null;
  startedAt?: string | null;
  paidAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface OrderDetail extends OrderListItem {
  version?: number;
  serviceSpec: string;
  statusLogs: Array<{
    id?: number;
    title: string;
    label?: string;
    action?: string;
    fromStatus?: string | null;
    toStatus?: string;
    operatorType?: string;
    operatorId?: number;
    time: string;
    operator: string;
    description: string;
    remark?: string;
  }>;
  amountItems: Array<{
    label: string;
    amount: number;
    type?: string;
  }>;
  memberCard?: {
    id: number;
    cardId: number;
    name: string;
    cardType: string;
    unitName: string;
    unitMinutes: number;
    remainingUnits: number;
    frozenUnits: number;
    status: string;
  } | null;
  memberCardRecords?: Array<{
    id: number;
    userMemberCardId: number;
    orderId?: number | null;
    recordType: string;
    timesUsed: number;
    units: number;
    beforeUnits: number;
    afterUnits: number;
    operatorType: string;
    operatorId?: number | null;
    remark: string;
    createdAt: string;
    card?: {
      id: number;
      name: string;
      cardType: string;
      unitName: string;
      unitMinutes: number;
    };
  }>;
  assignments?: Array<{
    id: number;
    staffId: number;
    assignType: string;
    assignStatus: string;
    assignedBy: number;
    notificationId?: number | null;
    notificationStatus?: string | null;
    rejectReason: string;
    assignedAt: string;
    acceptedAt?: string | null;
    rejectedAt?: string | null;
  }>;
  assignmentNotification?: {
    id: number;
    type: string;
    title: string;
    sendStatus: string;
    isRead: boolean;
    sentAt?: string | null;
    readAt?: string | null;
    retryCount: number;
    lastRetriedAt?: string | null;
    failureReason: string;
    createdAt: string;
  } | null;
  assignmentNotifications?: Array<{
    id: number;
    type: string;
    title: string;
    sendStatus: string;
    isRead: boolean;
    sentAt?: string | null;
    readAt?: string | null;
    retryCount: number;
    lastRetriedAt?: string | null;
    failureReason: string;
    createdAt: string;
  }>;
  servicePhotos?: string[];
  photos: string[];
}

export interface UpdateOrderPayload {
  status?: string;
  staffId?: number | null;
  appointmentStartTime?: string;
  appointmentEndTime?: string;
  originalAmount?: number;
  discountAmount?: number;
  payableAmount?: number;
  paidAmount?: number;
  remark?: string | null;
  adminRemark?: string | null;
  cityCode?: string | null;
  source?: string;
  createdAt?: string;
  paidAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
}

export interface StaffOption {
  value: string;
  id?: number;
  label: string;
  name?: string;
  phone: string;
  workStatus: string;
  workStatusValue?: number;
  rating?: number;
  cityCode?: string;
}

export interface AuditItem {
  id: string;
  type: AuditType;
  title: string;
  applicant: string;
  bizNo: string;
  amount?: number;
  status: "pending" | "pending_review" | "approved" | "processing" | "refunded" | "failed" | "rejected";
  priority: "normal" | "high" | "urgent";
  submittedAt: string;
  reviewedAt?: string;
  reviewer?: string;
  reason: string;
  detail: string;
}

export interface AfterSalesMessage {
  id: number;
  senderType: string;
  senderId: number;
  content: string;
  images: string[];
  createdAt: string;
}

export interface AfterSalesTicket {
  id: number;
  ticketNo: string;
  orderId: number;
  orderNo: string;
  orderStatus: string;
  userId: number;
  userName?: string;
  userPhone?: string;
  staffId?: number | null;
  type: string;
  title: string;
  description: string;
  status: string;
  priority?: number;
  latestMessage?: string;
  handledBy?: number | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  messages: AfterSalesMessage[];
}

export type WithdrawStatus =
  | "pending_review"
  | "approved"
  | "processing"
  | "wait_user_confirm"
  | "paid"
  | "failed"
  | "rejected"
  | "cancelled"
  | "expired"
  | "manual_handling";

export interface AdminWithdrawRequest {
  id: number;
  withdrawNo: string;
  staffId: number;
  staffName?: string;
  staffPhone?: string;
  staffNickname?: string;
  openidBound?: boolean;
  amount: number;
  amountFen: number;
  feeAmount: number;
  availableSnapshot: number;
  status: WithdrawStatus;
  channel: string;
  outBillNo?: string;
  transferBillNo?: string;
  packageInfo?: string;
  failureReason?: string;
  rejectReason?: string;
  retryCount: number;
  reviewedBy?: number | null;
  reviewedAt?: string | null;
  processedAt?: string | null;
  paidAt?: string | null;
  expiredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminWithdrawIncomeRecord {
  id: number;
  orderId: number;
  orderNo: string;
  orderStatus: string;
  amount: number;
  type: string;
  status: string;
  settlementStatus: string;
  withdrawStatus: string;
  availableAt?: string | null;
  settledAt?: string | null;
  createdAt: string;
}

export interface AdminWithdrawStatusLog {
  id: number;
  fromStatus?: string | null;
  toStatus: string;
  action: string;
  operatorType: string;
  operatorId: number;
  remark?: string;
  detail?: Record<string, unknown> | null;
  requestId?: string;
  createdAt: string;
}

export interface AdminWithdrawDetail extends AdminWithdrawRequest {
  incomeRecords: AdminWithdrawIncomeRecord[];
  statusLogs: AdminWithdrawStatusLog[];
}
