import { http } from '@/http/http'
import type {
  AddAfterSalesMessagePayload,
  AfterSalesTicket,
  CreateAfterSalesPayload,
} from './types/afterSales'

export function createOrderAfterSales(orderId: number, data: CreateAfterSalesPayload) {
  return http.post<AfterSalesTicket>(`/orders/${orderId}/after-sales`, data)
}

export function getOrderAfterSales(orderId: number) {
  return http.get<AfterSalesTicket[]>(`/orders/${orderId}/after-sales`)
}

export function getAfterSalesTicket(ticketId: number) {
  return http.get<AfterSalesTicket>(`/after-sales/tickets/${ticketId}`)
}

export function addAfterSalesMessage(ticketId: number, data: AddAfterSalesMessagePayload) {
  return http.post<AfterSalesTicket>(`/after-sales/tickets/${ticketId}/messages`, data)
}

export function closeAfterSalesTicket(ticketId: number) {
  return http.post<AfterSalesTicket>(`/after-sales/tickets/${ticketId}/close`)
}
