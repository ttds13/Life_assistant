export const MEMBER_CARD_TYPE = {
  TIME: 'time',
  TIMES: 'times',
  CONSULTATION: 'consultation',
} as const

export type MemberCardType = typeof MEMBER_CARD_TYPE[keyof typeof MEMBER_CARD_TYPE]

export const USER_MEMBER_CARD_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  USED_UP: 'used_up',
  DISABLED: 'disabled',
  REFUNDED: 'refunded',
} as const

export const MEMBER_CARD_RECORD_TYPE = {
  GRANT: 'grant',
  FREEZE: 'freeze',
  CONSUME: 'consume',
  RELEASE: 'release',
  REFUND_REVOKE: 'refund_revoke',
} as const
