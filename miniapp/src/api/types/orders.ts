import type { Service } from './services'
import type { UserAddress } from './address'
import type { AfterSalesTicket } from './afterSales'

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
  consultationRequired?: boolean
  cardType?: string
  items: AmountDetailItem[]
}

export interface CreateOrderPayload {
  serviceId?: number
  serviceCode?: string
  appointmentDate: string
  appointmentTimeSlot: string
  addressId: number
  remark?: string
  couponId?: number
  memberCardId?: number
  source?: string
  promotionKey?: string
  campaignId?: string
}

export interface RescheduleOrderPayload {
  appointmentDate: string
  appointmentTimeSlot: string
  version?: number
  reason?: string
}

export interface UserOrder {
  id: number
  orderNo: string
  status: OrderStatus
  version?: number
  staffId?: number | null
  serviceCode?: string
  serviceName: string
  serviceCardType?: 'none' | 'time' | 'times' | 'consultation' | string
  serviceConsumeUnit?: number
  serviceImage?: string
  serviceImageOssUrl?: string
  appointmentStartTime?: string
  appointmentEndTime?: string
  appointmentTime: string
  addressText: string
  totalAmount: number
  payableAmount: number
  paidAmount?: number
  remark?: string
  staffName?: string
  staffPhone?: string
  staffRating?: number
  memberCardId?: number | null
  memberCardConsumeUnits?: number
  memberCardName?: string
  memberCardUnitName?: string
  plannedConsumeUnits?: number
  actualConsumeUnits?: number
  releasedUnits?: number
  frozenUnits?: number
  orderType?: string
  paidAt?: string | null
  completedAt?: string | null
  acceptedAt?: string | null
  onTheWayAt?: string | null
  checkinAt?: string | null
  startedAt?: string | null
  cancelledAt?: string | null
  cancelReason?: string
  createdAt: string
}

export interface OrderStatusLog {
  label: string
  status?: OrderStatus | string
  time?: string
  active: boolean
}

export interface OrderRefund {
  id: number
  refundNo: string
  amount: number
  reason: string
  status: 'pending' | 'approved' | 'processing' | 'refunded' | 'failed' | 'rejected' | 'cancelled' | string
  channel?: string
  channelRefundNo?: string
  failureReason?: string
  reviewedAt?: string | null
  processedAt?: string | null
  refundedAt?: string | null
  createdAt: string
}

export interface OrderDetail extends UserOrder {
  version: number
  service?: Service
  address?: UserAddress
  paymentMethod?: string
  statusLogs: OrderStatusLog[]
  amountItems: AmountDetailItem[]
  refunds?: OrderRefund[]
  latestRefund?: OrderRefund | null
  tickets?: AfterSalesTicket[]
  latestTicket?: AfterSalesTicket | null
  servicePhotos?: string[]
  servicePhotoUrls?: string[]
  servicePhotoOssUrls?: string[]
  memberCard?: {
    id: number
    cardId: number
    name: string
    cardType: string
    unitName: string
    unitMinutes: number
    remainingUnits: number
    frozenUnits: number
    status: string
  } | null
  memberCardRecords?: Array<{
    id: number
    userMemberCardId: number
    orderId: number | null
    recordType: string
    timesUsed: number
    units: number
    beforeUnits?: number | null
    afterUnits?: number | null
    operatorType?: string
    operatorId?: number | null
    remark?: string
    createdAt: string
    card?: {
      id: number
      name: string
      cardType: string
      unitName: string
      unitMinutes: number
    }
  }>
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
  provider?: 'wechat' | 'mock'
  channel?: string
  paymentParams?: WechatPaymentParams & Record<string, any>
}

export interface WechatPaymentParams {
  timeStamp: string
  nonceStr: string
  package: string
  signType: 'RSA'
  paySign: string
}
