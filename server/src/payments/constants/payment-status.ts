export const PAYMENT_STATUS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed',
  CLOSED: 'closed',
  REFUNDED: 'refunded',
  PARTIAL_REFUNDED: 'partial_refunded',
} as const

export type PaymentStatus = typeof PAYMENT_STATUS[keyof typeof PAYMENT_STATUS]
