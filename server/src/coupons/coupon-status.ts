export const USER_COUPON_STATUS = {
  AVAILABLE: 'available',
  LOCKED: 'locked',
  USED: 'used',
  EXPIRED: 'expired',
  RELEASED: 'released',
  INVALID: 'invalid',
} as const

export type UserCouponStatus = typeof USER_COUPON_STATUS[keyof typeof USER_COUPON_STATUS]

export const COUPON_TYPE = {
  AMOUNT: 'amount',
  DISCOUNT: 'discount',
} as const

