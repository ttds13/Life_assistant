import type { PageData } from './types/common'
import type { CreateOrderPayload, OrderDetail, PricePreview, QueryOrdersParams, UserOrder } from './types/orders'
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

export function cancelOrder(id: number) {
  return http.post<OrderDetail>(`/orders/${id}/cancel`)
}

export function confirmOrder(id: number) {
  return http.post<OrderDetail>(`/orders/${id}/confirm`)
}

export function payOrder(id: number) {
  return http.post<{ paymentParams?: Record<string, any> }>(`/orders/${id}/pay`)
}

export function getOrderPricePreview(data: Partial<CreateOrderPayload>) {
  return http.get<PricePreview>('/orders/price-preview', data)
}
