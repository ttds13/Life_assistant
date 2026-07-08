export const REFUND_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  PROCESSING: 'processing',
  REFUNDED: 'refunded',
  FAILED: 'failed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
} as const

export type RefundStatus = typeof REFUND_STATUS[keyof typeof REFUND_STATUS]

export const REFUND_STATUS_VALUES = Object.values(REFUND_STATUS)

export function isActiveRefundStatus(status: string) {
  const activeStatuses: string[] = [
    REFUND_STATUS.PENDING,
    REFUND_STATUS.APPROVED,
    REFUND_STATUS.PROCESSING,
    REFUND_STATUS.REFUNDED,
    REFUND_STATUS.FAILED,
  ]
  return activeStatuses.includes(status)
}
