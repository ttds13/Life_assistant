import type { PageData } from './types/common'
import type {
  CreateOrderPayload,
  OrderDetail,
  PayOrderResult,
  PricePreview,
  QueryOrdersParams,
  RescheduleOrderPayload,
  UserOrder,
} from './types/orders'
import { http } from '@/http/http'

export function getOrders(params?: QueryOrdersParams) {
  return http.get<PageData<UserOrder>>('/orders', params)
}

export function getOrderDetail(id: number) {
  return http.get<OrderDetail>(`/orders/${id}`)
}

export function createOrder(data: CreateOrderPayload) {
  return http.post<OrderDetail>('/orders', data)
}

export function cancelOrder(id: number, data?: { version?: number, reason?: string }) {
  return http.post<OrderDetail>(`/orders/${id}/cancel`, data)
}

export function rescheduleOrder(id: number, data: RescheduleOrderPayload) {
  return http.post<OrderDetail>(`/orders/${id}/reschedule`, data)
}

export function confirmOrder(id: number, data?: { version?: number }) {
  return http.post<OrderDetail>(`/orders/${id}/confirm`, data)
}

export function payOrder(id: number) {
  return http.post<PayOrderResult>(`/orders/${id}/pay`)
}

export function getOrderPricePreview(data: Partial<CreateOrderPayload>) {
  return http.get<PricePreview>('/orders/price-preview', data)
}
