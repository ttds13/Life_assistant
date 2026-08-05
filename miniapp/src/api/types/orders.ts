import type { AfterSalesTicket } from './afterSales'
import type { Service } from './services'

export type OrderStatus
  = | 'pending_payment'
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
  pricingMode?: 'cash' | 'member_card' | 'consultation'
  serviceAmount: number
  discountAmount: number
  memberCardDiscountAmount?: number
  payableAmount: number
  couponId?: number | null
  consultationRequired?: boolean
  cardType?: string
  memberCardId?: number | null
  memberCardConsumeMinutes?: number
  memberCardName?: string
  memberCardUsableMinutes?: number
  items: AmountDetailItem[]
}

export interface OrderAddressView {
  id: number
  orderId: number
  sourceAddressId?: number | null
  sourceAddressVersion?: number | null
  version: number
  contactName: string
  contactPhone: string
  country?: string
  provinceName?: string
  cityName?: string
  districtName?: string
  streetName?: string
  addressTitle?: string
  detailAddress: string
  houseNumber?: string
  formattedAddress: string
  latitude?: number | null
  longitude?: number | null
  coordinateType?: string
  poiId?: string
  mapProvider?: string
  source: string
  mapAvailable: boolean
  createdAt: string
  updatedAt: string
}

export interface UpdateOrderAddressPayload {
  sourceAddressId: number
  expectedOrderVersion: number
  expectedOrderAddressVersion: number
  expectedSourceAddressVersion?: number
  reason: string
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
  memberCardConsumeMinutes?: number
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
  orderAddressVersion?: number | null
  totalAmount: number
  discountAmount?: number
  payableAmount: number
  paidAmount?: number
  couponId?: number | null
  remark?: string
  staffName?: string
  staffPhone?: string
  staffRating?: number
  memberCardId?: number | null
  memberCardConsumeUnits?: number
  memberCardName?: string
  memberCardUnitName?: string
  memberCardConsumeMode?: string
  memberCardMinConsumeMinutes?: number
  memberCardAllowedMinutes?: number[]
  plannedConsumeUnits?: number
  actualConsumeUnits?: number
  releasedUnits?: number
  frozenUnits?: number
  plannedConsumeMinutes?: number
  actualConsumeMinutes?: number
  releasedMinutes?: number
  frozenMinutes?: number
  redemptionState?: 'reserved' | 'consumed' | 'released' | string
  isServiceTask?: boolean
  staffIncomeAmount?: number
  staffIncomeSettlementStatus?: string
  staffIncomeWithdrawStatus?: string
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
  orderAddress?: OrderAddressView | null
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
    usableUnits?: number
    remainingMinutes?: number
    frozenMinutes?: number
    usableMinutes?: number
    status: string
    completedReason?: string
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
    beforeRemainingMinutes?: number | null
    afterRemainingMinutes?: number | null
    beforeFrozenMinutes?: number | null
    afterFrozenMinutes?: number | null
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
  memberCardPurchase?: {
    memberCardPlanId: number
    memberCardPlanVersion: number
    grantedUserMemberCardId: number | null
    grantedAt: string | null
    userCard?: {
      id: number
      status: string
      completedReason?: string
      remainingMinutes: number
      frozenMinutes: number
      activationDeadlineAt?: string | null
      activatedAt?: string | null
      expireAt?: string | null
    } | null
  } | null
}

export interface QueryOrdersParams {
  status?: OrderStatus | 'all'
  orderType?: 'bookings' | 'member_card_purchase' | 'all'
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
