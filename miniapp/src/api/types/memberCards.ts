export type MemberCardType = 'time' | 'times' | 'consultation' | 'none'

export interface MemberCardServiceRule {
  id: number
  memberCardId: number
  serviceId: number
  serviceCode: string
  serviceName: string
  serviceDescription?: string
  serviceCoverImage?: string
  serviceCoverImageDisplayUrl?: string
  serviceCardType?: string
  serviceConsumeUnit: number
  serviceDurationMinutes?: number
  serviceStatus: number
  consumeUnits: number
  consumeMode: 'fixed_minutes' | 'half_service' | 'custom_minutes' | string
  minConsumeMinutes: number
  allowedMinutes: number[]
  status: number
  remark?: string
}

export interface UserMemberCard {
  id: number
  userMemberCardId?: number
  cardId: number
  memberCardTemplateId?: number
  name: string
  cardType: MemberCardType
  unitName: string
  unitMinutes: number
  remainingUnits: number
  frozenUnits: number
  usableUnits: number
  remainingTimes: number
  status: 'pending_activation' | 'active' | 'completed' | string
  completedReason?: 'used_up' | 'expired' | 'refunded' | 'disabled' | string
  availabilityState?: 'available' | 'suspended' | string
  source: string
  issuedAt?: string
  activationDeadlineAt?: string | null
  activatedAt?: string | null
  expireAt: string | null
  available: boolean
  consumeUnits: number
  consumeMinutes?: number
  consumeMode?: 'fixed_minutes' | 'half_service' | 'custom_minutes' | string
  minConsumeMinutes?: number
  allowedMinutes?: number[]
  remainingMinutes?: number
  frozenMinutes?: number
  usableMinutes?: number
  serviceName?: string
  applicableServices?: string[]
  serviceRules?: Record<string, unknown>
  serviceRuleList?: MemberCardServiceRule[]
}

export interface PurchasableMemberCard {
  id: number
  code?: string
  name: string
  description?: string
  detail?: string
  coverImage?: string
  coverImageDisplayUrl?: string
  purchaseNotice?: string
  cardType: MemberCardType
  unitName: string
  unitMinutes: number
  totalTimes: number
  totalUnits: number
  price: number
  activationDeadlineDays?: number
  validityDays: number
  currentVersion?: number
  publishedVersionId?: number
  allowHalfDeduct: boolean
  minConsumeUnits: number
  applicableServices: string[]
  serviceRules: Record<string, unknown>
  serviceRuleList?: MemberCardServiceRule[]
  serviceSummary?: string
  sortOrder?: number
  status: number
}

export interface MemberCardPurchaseOrder {
  id: number
  orderNo: string
  orderType: 'member_card_purchase'
  status: string
  card: PurchasableMemberCard
  totalAmount: number
  payableAmount: number
  createdAt: string
}

export interface MemberCardPurchasePayload {
  cardId: number
  remark?: string
  source?: string
  promotionKey?: string
  campaignId?: string
}
