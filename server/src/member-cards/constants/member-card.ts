export const MEMBER_CARD_TYPE = {
  TIME: 'time',
  TIMES: 'times',
  CONSULTATION: 'consultation',
} as const

export type MemberCardType = typeof MEMBER_CARD_TYPE[keyof typeof MEMBER_CARD_TYPE]

export const USER_MEMBER_CARD_STATUS = {
  PENDING_ACTIVATION: 'pending_activation',
  ACTIVE: 'active',
  COMPLETED: 'completed',
} as const

export const USER_MEMBER_CARD_COMPLETED_REASON = {
  USED_UP: 'used_up',
  EXPIRED: 'expired',
  DISABLED: 'disabled',
  REFUNDED: 'refunded',
  REVOKED: 'revoked',
} as const

export const USER_MEMBER_CARD_AVAILABILITY = {
  AVAILABLE: 'available',
  SUSPENDED: 'suspended',
} as const

export const MEMBER_CARD_RECORD_TYPE = {
  ISSUED: 'issued',
  ACTIVATED: 'activated',
  RESERVED: 'reserved',
  CONSUMED: 'consumed',
  RELEASED: 'released',
  COMPLETED: 'completed',
  SUSPENDED: 'suspended',
  RESUMED: 'resumed',
  REFUND_REVOKE: 'refunded',
  ADMIN_ADJUST: 'admin_adjust',
  EXTENDED: 'extended',
  REVOKED: 'revoked',
  // Transitional aliases keep existing call sites on the Day49 ledger semantics.
  GRANT: 'issued',
  FREEZE: 'reserved',
  CONSUME: 'consumed',
  RELEASE: 'released',
} as const
