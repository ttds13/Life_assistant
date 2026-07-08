export const WITHDRAW_STATUS = {
  LEGACY_PENDING: 'pending',
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  PROCESSING: 'processing',
  WAIT_USER_CONFIRM: 'wait_user_confirm',
  PAID: 'paid',
  FAILED: 'failed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  MANUAL_HANDLING: 'manual_handling',
} as const

export type WithdrawStatus = typeof WITHDRAW_STATUS[keyof typeof WITHDRAW_STATUS]

export const WITHDRAW_ACTIVE_STATUSES = [
  WITHDRAW_STATUS.LEGACY_PENDING,
  WITHDRAW_STATUS.PENDING_REVIEW,
  WITHDRAW_STATUS.APPROVED,
  WITHDRAW_STATUS.PROCESSING,
  WITHDRAW_STATUS.WAIT_USER_CONFIRM,
] as const

export const WITHDRAW_RELEASING_STATUSES = [
  WITHDRAW_STATUS.FAILED,
  WITHDRAW_STATUS.REJECTED,
  WITHDRAW_STATUS.CANCELLED,
  WITHDRAW_STATUS.EXPIRED,
] as const

export const WITHDRAW_INCOME_TYPE = {
  SERVICE_INCOME: 'service_income',
} as const

export const WITHDRAW_CHANNEL = {
  MOCK: 'mock',
  WECHAT: 'wechat',
} as const

