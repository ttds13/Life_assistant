export const FEEDBACK_TYPE = {
  BUG: 'bug',
  ORDER: 'order',
  PAYMENT_REFUND: 'payment_refund',
  SERVICE_EXPERIENCE: 'service_experience',
  SUGGESTION: 'suggestion',
  OTHER: 'other',
} as const

export type FeedbackType = typeof FEEDBACK_TYPE[keyof typeof FEEDBACK_TYPE]

export const FEEDBACK_TYPE_VALUES = Object.values(FEEDBACK_TYPE)
