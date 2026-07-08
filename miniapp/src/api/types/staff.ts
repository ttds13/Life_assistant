export type StaffTaskStatus =
  | 'pending_accept'
  | 'accepted'
  | 'on_the_way'
  | 'in_service'
  | 'pending_confirm'
  | 'completed'
  | 'rejected'
  | 'cancelled'

export type StaffTaskGroup = 'dispatch'

export type StaffOrderFilter = 'pending' | 'processing' | 'completed'

export type StaffStatsPeriod = 'today' | 'week' | 'month' | 'total'

export type StaffWorkStatusValue = 0 | 1 | 2

export interface StaffWorkStatus {
  staffId: number
  workStatus: StaffWorkStatusValue
  workStatusText: string
}

export interface StaffServicePhoto {
  id: number | string
  url: string
  displayUrl?: string
  ossUrl?: string
  type?: 'before' | 'process' | 'after' | 'other'
  remark?: string
  createdAt?: string
}

export interface StaffTask {
  id: number
  orderNo: string
  status: StaffTaskStatus
  rawStatus?: string
  version?: number
  group: StaffTaskGroup
  canReject?: boolean
  serviceName: string
  serviceSpec?: string
  serviceCardType?: string
  serviceTypeText?: string
  serviceRequirement?: string
  appointmentTime: string
  customerName: string
  customerPhone?: string
  addressText: string
  latitude?: number | null
  longitude?: number | null
  distanceText?: string
  remark?: string
  incomeAmount?: number
  memberCardName?: string
  memberCardUnitName?: string
  memberCardConsumeUnits?: number
  plannedConsumeUnits?: number
  actualConsumeUnits?: number
  releasedUnits?: number
  frozenUnits?: number
  memberCardTip?: string
  actualMinutes?: number
  createdAt: string
  acceptedAt?: string
  checkinAt?: string
  startedAt?: string
  completedAt?: string
  photos?: StaffServicePhoto[]
}

export interface StaffDashboard {
  pendingTaskCount: number
  dispatchTaskCount: number
  processingTaskCount: number
  completedTaskCount: number
  todayEstimatedIncome: number
  tasks: StaffTask[]
}

export interface StaffNotification {
  id: number
  receiverType: string
  receiverId: number
  type: string
  title: string
  content: string
  bizType: string
  bizId: number | null
  isRead: boolean
  channel: string
  sendStatus: string
  createdAt: string
}

export interface StaffUnreadCount {
  count: number
  unreadCount: number
}

export interface StaffProfileStats {
  period: StaffStatsPeriod
  newStaffCount: number
  newOrderCount: number
  writeOrderCount: number
  completedOrderCount: number
  commissionAmount: number
  bonusAmount: number
}

export interface StaffProfile {
  staffId?: number
  staffName: string
  staffPhone?: string
  avatar?: string
  avatarOssUrl?: string
  avatarDisplayUrl?: string
  verified: boolean
  regionText: string
  workStatus?: StaffWorkStatusValue
  workStatusText?: string
  rating?: number
  stats: Record<StaffStatsPeriod, StaffProfileStats>
}

export interface UpdateStaffProfileParams {
  staffName?: string
  avatar?: string
}

export interface UploadImageItem {
  id?: number | string
  fileId?: number | string
  uuid?: string
  url: string
  displayUrl?: string
  ossUrl?: string
  status?: 'local' | 'uploading' | 'done' | 'error'
  type?: 'before' | 'process' | 'after' | 'other'
}

export type StaffWithdrawStatus =
  | 'pending_review'
  | 'approved'
  | 'processing'
  | 'wait_user_confirm'
  | 'paid'
  | 'failed'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'manual_handling'

export interface StaffWithdrawRequest {
  id: number
  withdrawNo: string
  staffId: number
  amount: number
  amountFen: number
  feeAmount: number
  availableSnapshot: number
  status: StaffWithdrawStatus
  channel: 'mock' | 'wechat' | string
  outBillNo?: string
  transferBillNo?: string
  packageInfo?: string
  failureReason?: string
  rejectReason?: string
  retryCount: number
  reviewedBy?: number | null
  reviewedAt?: string | null
  processedAt?: string | null
  paidAt?: string | null
  expiredAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface StaffWithdrawIncomeRecord {
  id: number
  orderId: number
  orderNo: string
  orderStatus: string
  amount: number
  type: string
  status: string
  settlementStatus: string
  withdrawStatus: string
  availableAt?: string | null
  settledAt?: string | null
  createdAt: string
}

export interface StaffWithdrawStatusLog {
  id: number
  fromStatus?: string | null
  toStatus: string
  action: string
  operatorType: string
  operatorId: number
  remark?: string
  detail?: Record<string, any> | null
  requestId?: string
  createdAt: string
}

export interface StaffWithdrawDetail extends StaffWithdrawRequest {
  staffName?: string
  staffPhone?: string
  staffNickname?: string
  openidBound?: boolean
  incomeRecords: StaffWithdrawIncomeRecord[]
  statusLogs: StaffWithdrawStatusLog[]
}

export interface StaffWithdrawSummary {
  staffId: number
  staffName: string
  openidBound: boolean
  availableAmount: number
  pendingSettlementAmount: number
  frozenAmount: number
  withdrawnAmount: number
  minAmount: number
  maxSingleAmount: number
  dailyLimit: number
  settlementDays: number
  channel: 'mock' | 'wechat' | string
  activeRequest?: StaffWithdrawRequest | null
  rules: string[]
}

export interface StaffWithdrawCreateParams {
  amount: number
  remark?: string
}

export interface StaffWithdrawConfirmPackage {
  withdrawId: number
  withdrawNo: string
  status: StaffWithdrawStatus
  packageInfo: string
}
