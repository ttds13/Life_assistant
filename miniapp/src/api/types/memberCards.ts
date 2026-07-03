export type MemberCardType = 'time' | 'times' | 'consultation' | 'none'

export interface UserMemberCard {
  id: number
  cardId: number
  name: string
  cardType: MemberCardType
  unitName: string
  unitMinutes: number
  remainingUnits: number
  frozenUnits: number
  usableUnits: number
  remainingTimes: number
  status: string
  source: string
  expireAt: string
  available: boolean
  consumeUnits: number
  serviceName?: string
  applicableServices?: string[]
  serviceRules?: Record<string, unknown>
}

export interface PurchasableMemberCard {
  id: number
  name: string
  cardType: MemberCardType
  unitName: string
  unitMinutes: number
  totalTimes: number
  totalUnits: number
  price: number
  validityDays: number
  allowHalfDeduct: boolean
  minConsumeUnits: number
  applicableServices: string[]
  serviceRules: Record<string, unknown>
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
