export type StaffTaskStatus =
  | 'pending_accept'
  | 'accepted'
  | 'on_the_way'
  | 'in_service'
  | 'pending_confirm'
  | 'completed'
  | 'rejected'
  | 'cancelled'

export type StaffTaskGroup = 'grab' | 'dispatch'

export type StaffOrderFilter = 'pending' | 'processing' | 'completed'

export type StaffStatsPeriod = 'today' | 'week' | 'month' | 'total'

export interface StaffServicePhoto {
  id: number | string
  url: string
  type?: 'before' | 'process' | 'after' | 'other'
  remark?: string
  createdAt?: string
}

export interface StaffTask {
  id: number
  orderNo: string
  status: StaffTaskStatus
  group: StaffTaskGroup
  serviceName: string
  serviceSpec?: string
  serviceRequirement?: string
  appointmentTime: string
  customerName: string
  customerPhone?: string
  addressText: string
  distanceText?: string
  remark?: string
  incomeAmount?: number
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
  staffName: string
  avatar?: string
  verified: boolean
  regionText: string
  stats: Record<StaffStatsPeriod, StaffProfileStats>
}

export interface CreateStaffOrderPayload {
  serviceAddress: string
  customServiceEnabled: boolean
  serviceId: number
  appointmentTime: string
  dispatchMode: 'platform' | 'specified' | 'none'
  photos: StaffServicePhoto[]
  remark?: string
}

export interface UploadImageItem {
  id?: number | string
  url: string
  status?: 'local' | 'uploading' | 'done' | 'error'
  type?: 'before' | 'process' | 'after' | 'other'
}

