export const PAYMENT_CHANNEL = {
  MOCK: 'mock',
  WECHAT: 'wechat',
} as const

export type PaymentChannel = typeof PAYMENT_CHANNEL[keyof typeof PAYMENT_CHANNEL]
