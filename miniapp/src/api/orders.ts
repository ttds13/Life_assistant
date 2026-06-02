import type { PageData } from './types/common'
import type {
  CreateOrderPayload,
  MockPaymentSuccessPayload,
  MockPaymentSuccessResult,
  OrderDetail,
  PayOrderResult,
  PricePreview,
  QueryOrdersParams,
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

export function confirmOrder(id: number, data?: { version?: number }) {
  return http.post<OrderDetail>(`/orders/${id}/confirm`, data)
}

export function payOrder(id: number) {
  return http.post<PayOrderResult>(`/orders/${id}/pay`)
}

export function mockPaymentSuccess(data: MockPaymentSuccessPayload) {
  return http.post<MockPaymentSuccessResult>('/payments/mock-success', data)
}

export function getOrderPricePreview(data: Partial<CreateOrderPayload>) {
  return http.get<PricePreview>('/orders/price-preview', data)
}
