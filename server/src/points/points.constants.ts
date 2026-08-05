export const POINT_RULE_CODE = {
  CONSUMER_SPEND: 'consumer_spend',
  REFERRAL_FIRST_CONSUMPTION: 'referral_first_consumption',
} as const

export const POINT_RULE_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const

export const POINT_LEDGER_TYPE = {
  CONSUMER_SPEND_EARN: 'consumer_spend_earn',
  REFERRAL_FIRST_CONSUMPTION_EARN: 'referral_first_consumption_earn',
  CONSUMER_SPEND_REFUND_REVERSE: 'consumer_spend_refund_reverse',
  REFERRAL_FIRST_CONSUMPTION_REFUND_REVERSE: 'referral_first_consumption_refund_reverse',
} as const

export const DEFAULT_POINT_ECONOMY = {
  earnPointsPerYuan: 10,
  redemptionPointsPerYuan: 200,
} as const
