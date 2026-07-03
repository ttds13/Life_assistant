import type { OrderStatus } from '@/api/types/orders'

export type OrderListFilter = 'all' | OrderStatus

const ORDER_LIST_FILTER_KEY = 'life-assistant:order-list-filter'
const ORDER_LIST_FILTERS: OrderListFilter[] = [
  'all',
  'pending_payment',
  'pending_dispatch',
  'dispatched',
  'accepted',
  'on_the_way',
  'in_service',
  'pending_confirm',
  'completed',
  'cancelled',
  'refund_pending',
  'refunded',
  'after_sales',
]

export function isOrderListFilter(value: string): value is OrderListFilter {
  return ORDER_LIST_FILTERS.includes(value as OrderListFilter)
}

export function saveOrderListFilter(filter: OrderListFilter) {
  uni.setStorageSync(ORDER_LIST_FILTER_KEY, filter)
}

export function consumeOrderListFilter(): OrderListFilter | null {
  const value = uni.getStorageSync(ORDER_LIST_FILTER_KEY) as OrderListFilter | ''
  if (!value)
    return null
  uni.removeStorageSync(ORDER_LIST_FILTER_KEY)
  return value
}
