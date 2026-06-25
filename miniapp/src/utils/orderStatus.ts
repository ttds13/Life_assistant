import type { OrderStatus } from '@/api/types/orders'

export type OrderStatusLike = OrderStatus | string | undefined | null

export interface OrderStatusDisplay {
  text: string
  className: string
}

const orderStatusMap: Record<string, OrderStatusDisplay> = {
  pending_payment: { text: '待支付', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  pendingpayment: { text: '待支付', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  unpaid: { text: '待支付', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  pending_pay: { text: '待支付', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  create_order: { text: '下单', className: 'bg-[#FFF7ED] text-[#F59E0B]' },

  pending_dispatch: { text: '待派单', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  pendingdispatch: { text: '待派单', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  paid: { text: '待派单', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  success: { text: '待派单', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  waiting_dispatch: { text: '待派单', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  pay_success: { text: '支付成功', className: 'bg-[#FFF7ED] text-[#F59E0B]' },

  dispatched: { text: '已派单', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  assigned: { text: '已派单', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  admin_assign: { text: '平台派单', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  auto_assign: { text: '系统派单', className: 'bg-[#EAF3FF] text-[#1677FF]' },

  accepted: { text: '已接单', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  staff_accepted: { text: '已接单', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  staff_accept: { text: '师傅接单', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  staff_claim: { text: '师傅接单', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  staff_reject: { text: '师傅拒单', className: 'bg-[#FEF2F2] text-[#EF4444]' },

  on_the_way: { text: '上门中', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  ontheway: { text: '上门中', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  staff_on_the_way: { text: '上门中', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  arriving: { text: '上门中', className: 'bg-[#EAF3FF] text-[#1677FF]' },

  in_service: { text: '服务中', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  inservice: { text: '服务中', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  serving: { text: '服务中', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  started: { text: '服务中', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  staff_start: { text: '开始服务', className: 'bg-[#EAF3FF] text-[#1677FF]' },

  pending_confirm: { text: '待确认', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  pendingconfirm: { text: '待确认', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  waiting_confirm: { text: '待确认', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  staff_completed: { text: '待确认', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  staff_complete: { text: '服务完成', className: 'bg-[#FFF7ED] text-[#F59E0B]' },

  completed: { text: '已完成', className: 'bg-[#ECFDF5] text-[#16A34A]' },
  complete: { text: '已完成', className: 'bg-[#ECFDF5] text-[#16A34A]' },
  finished: { text: '已完成', className: 'bg-[#ECFDF5] text-[#16A34A]' },
  user_confirm: { text: '用户确认', className: 'bg-[#ECFDF5] text-[#16A34A]' },
  auto_confirm: { text: '自动确认', className: 'bg-[#ECFDF5] text-[#16A34A]' },

  cancelled: { text: '已取消', className: 'bg-[#F3F4F6] text-[#6B7280]' },
  canceled: { text: '已取消', className: 'bg-[#F3F4F6] text-[#6B7280]' },
  closed: { text: '已取消', className: 'bg-[#F3F4F6] text-[#6B7280]' },
  user_cancel_unpaid: { text: '用户取消', className: 'bg-[#F3F4F6] text-[#6B7280]' },
  timeout_unpaid: { text: '超时取消', className: 'bg-[#F3F4F6] text-[#6B7280]' },

  refund_pending: { text: '退款中', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  refundpending: { text: '退款中', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  refunding: { text: '退款中', className: 'bg-[#FFF7ED] text-[#F59E0B]' },

  refunded: { text: '已退款', className: 'bg-[#F3F4F6] text-[#6B7280]' },
  refund_success: { text: '已退款', className: 'bg-[#F3F4F6] text-[#6B7280]' },

  after_sales: { text: '售后中', className: 'bg-[#FEF2F2] text-[#EF4444]' },
  aftersales: { text: '售后中', className: 'bg-[#FEF2F2] text-[#EF4444]' },
  after_sale: { text: '售后中', className: 'bg-[#FEF2F2] text-[#EF4444]' },
}

export function normalizeOrderStatus(status: OrderStatusLike) {
  return String(status || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
}

export function getOrderStatusDisplay(status: OrderStatusLike): OrderStatusDisplay {
  return orderStatusMap[normalizeOrderStatus(status)] || {
    text: '订单处理中',
    className: 'bg-[#F3F4F6] text-[#6B7280]',
  }
}

export function getOrderStatusText(status: OrderStatusLike) {
  return getOrderStatusDisplay(status).text
}

export function ensureChineseStatusLabel(label: string, fallbackStatus?: OrderStatusLike) {
  if (!label)
    return fallbackStatus ? getOrderStatusText(fallbackStatus) : '状态更新'

  const normalized = normalizeOrderStatus(label)
  const matched = orderStatusMap[normalized]
  return matched ? matched.text : label
}
