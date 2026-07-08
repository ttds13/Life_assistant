export type CouponStatus = 'unused' | 'locked' | 'used' | 'expired'

export interface UserCoupon {
  id: number
  userCouponId: number
  couponId: number
  name: string
  type: string
  amount: number
  minAmount: number
  status: CouponStatus
  rawStatus?: string
  usedOrderId?: number | null
  receivedAt: string
  usedAt?: string | null
  expireAt: string
  startTime: string
  endTime: string
  discountAmount?: number
}

export interface AvailableCoupon {
  id: number
  name: string
  type: string
  amount: number
  minAmount: number
  totalCount: number
  issuedCount: number
  startTime: string
  endTime: string
  status: string
  received: boolean
  userCoupon?: UserCoupon | null
}
