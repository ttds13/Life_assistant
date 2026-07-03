export const ORDER_TYPE = {
  SERVICE_BOOKING: 'service_booking',
  CONSULTATION: 'consultation',
  MEMBER_CARD_PURCHASE: 'member_card_purchase',
} as const

export type OrderType = typeof ORDER_TYPE[keyof typeof ORDER_TYPE]

export const ORDER_TYPE_VALUES = Object.values(ORDER_TYPE)

export const STAFF_VISIBLE_ORDER_TYPES = [
  ORDER_TYPE.SERVICE_BOOKING,
  ORDER_TYPE.CONSULTATION,
] as const

export function isOrderType(value: unknown): value is OrderType {
  return typeof value === 'string' && ORDER_TYPE_VALUES.includes(value as OrderType)
}

export function isStaffVisibleOrderType(value: unknown) {
  return typeof value === 'string' && STAFF_VISIBLE_ORDER_TYPES.includes(value as typeof STAFF_VISIBLE_ORDER_TYPES[number])
}
