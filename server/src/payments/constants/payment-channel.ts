export const PAYMENT_CHANNEL = {
  WECHAT: 'wechat',
  MOCK: 'mock',
  OFFLINE: 'offline',
} as const

export type PaymentChannel = typeof PAYMENT_CHANNEL[keyof typeof PAYMENT_CHANNEL]
