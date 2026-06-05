import type { Service } from './services'
import type { UserAddress } from './address'

export type OrderStatus =
  | 'pending_payment'
  | 'pending_dispatch'
  | 'dispatched'
  | 'accepted'
  | 'on_the_way'
  | 'in_service'
  | 'pending_confirm'
  | 'completed'
  | 'cancelled'
  | 'refund_pending'
  | 'refunded'
  | 'after_sales'

export interface AmountDetailItem {
  label: string
  amount: number
  type?: 'normal' | 'discount'
}

export interface PricePreview {
  serviceAmount: number
  discountAmount: number
  payableAmount: number
  items: AmountDetailItem[]
}

export interface CreateOrderPayload {
  serviceId: number
  appointmentDate: string
  appointmentTimeSlot: string
  addressId: number
  remark?: string
  couponId?: number
  memberCardId?: number
}

export interface UserOrder {
  id: number
  orderNo: string
  status: OrderStatus
  version?: number
  staffId?: number | null
  serviceName: string
  serviceImage?: string
  appointmentTime: string
  addressText: string
  totalAmount: number
  payableAmount: number
  remark?: string
  staffName?: string
  staffPhone?: string
  staffRating?: number
  createdAt: string
}

export interface OrderStatusLog {
  label: string
  time?: string
  active: boolean
}

export interface OrderDetail extends UserOrder {
  version: number
  service?: Service
  address?: UserAddress
  paymentMethod?: string
  paidAt?: string | null
  completedAt?: string | null
  statusLogs: OrderStatusLog[]
  amountItems: AmountDetailItem[]
  servicePhotos?: string[]
}

export interface QueryOrdersParams {
  status?: OrderStatus | 'all'
  page?: number
  pageSize?: number
}

export interface PayOrderResult {
  paymentNo: string
  status: string
  amount?: number
  channel?: string
  paymentParams?: Record<string, any>
}

export interface MockPaymentSuccessPayload {
  paymentNo?: string
  orderId?: number
}

export interface MockPaymentSuccessResult {
  paymentNo: string
  status: string
  order: OrderDetail | null
}
