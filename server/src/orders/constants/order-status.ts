export const ORDER_STATUS = {
  PENDING_PAYMENT: 'pending_payment',
  PENDING_DISPATCH: 'pending_dispatch',
  DISPATCHED: 'dispatched',
  ACCEPTED: 'accepted',
  ON_THE_WAY: 'on_the_way',
  IN_SERVICE: 'in_service',
  PENDING_CONFIRM: 'pending_confirm',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REFUND_PENDING: 'refund_pending',
  REFUNDED: 'refunded',
  AFTER_SALES: 'after_sales',
} as const

export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS]

export const ORDER_STATUS_VALUES = Object.values(ORDER_STATUS)

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && ORDER_STATUS_VALUES.includes(value as OrderStatus)
}
