export type StaffApplicationStatus = 'pending' | 'approved' | 'rejected' | string

export interface StaffApplication {
  id: number
  name: string
  phone: string
  cityCode: string
  skills: string[]
  idCard?: string
  note?: string
  images: string[]
  imageOssUrls?: string[]
  status: StaffApplicationStatus
  userRole: 'user' | 'staff' | string
  createdAt: string
  updatedAt: string
}

export interface SubmitStaffApplicationPayload {
  name: string
  phone: string
  cityCode: string
  skills: string[]
  idCard?: string
  note?: string
  images?: string[]
}

export type FeedbackType = 'bug' | 'order' | 'payment_refund' | 'service_experience' | 'suggestion' | 'other'

export interface FeedbackRecord {
  id: number
  feedbackNo: string
  type: FeedbackType | string
  content: string
  contactPhone?: string
  images: string[]
  imageOssUrls?: string[]
  status: 'open' | 'processing' | 'closed' | string
  reply?: string
  handledAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface SubmitFeedbackPayload {
  type: FeedbackType
  content: string
  contactPhone?: string
  images?: string[]
}

export interface SupportConfig {
  id?: string
  phone: string
  wechatId: string
  serviceHours: string
  responseTime: string
  onlineEnabled?: boolean
  updatedAt?: string
}

export interface FaqItem {
  id: string
  category: string
  question: string
  answer: string
  sortOrder?: number
  status?: string
}

export interface SupportFaqResponse {
  categories: string[]
  items: FaqItem[]
}
