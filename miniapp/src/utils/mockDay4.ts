import type { UserAddress } from '@/api/types/address'
import type { OrderDetail, OrderStatus, PricePreview, UserOrder } from '@/api/types/orders'

const addressStorageKey = 'DAY4_MOCK_ADDRESSES'
const selectedAddressStorageKey = 'DAY4_SELECTED_ADDRESS'

export function getMockAddresses(): UserAddress[] {
  const stored = uni.getStorageSync(addressStorageKey)
  if (Array.isArray(stored))
    return stored

  const initial: UserAddress[] = [
    {
      id: 1,
      contactName: '张女士',
      contactPhone: '13800000000',
      cityName: '上海市',
      districtName: '浦东新区',
      detailAddress: '世纪大道 100 号',
      houseNumber: '8 栋 1201',
      isDefault: true,
      latitude: null,
      longitude: null,
    },
  ]
  uni.setStorageSync(addressStorageKey, initial)
  return initial
}

export function saveMockAddresses(addresses: UserAddress[]) {
  uni.setStorageSync(addressStorageKey, addresses)
}

export function getSelectedMockAddress(): UserAddress | null {
  const stored = uni.getStorageSync(selectedAddressStorageKey)
  return stored && typeof stored === 'object' ? stored as UserAddress : null
}

export function setSelectedMockAddress(address: UserAddress) {
  uni.setStorageSync(selectedAddressStorageKey, address)
}

export function formatAddress(address: UserAddress) {
  return `${address.cityName || ''}${address.districtName || ''}${address.detailAddress}${address.houseNumber ? ` ${address.houseNumber}` : ''}`
}

export function getMockOrders(): UserOrder[] {
  return [
    {
      id: 101,
      orderNo: 'LA202605220001',
      status: 'pending_payment',
      serviceName: '日常保洁 2 小时',
      appointmentTime: '2026-05-23 09:00-11:00',
      addressText: '上海市浦东新区世纪大道 100 号 8 栋 1201',
      totalAmount: 120,
      payableAmount: 120,
      remark: '请自带清洁工具',
      createdAt: '2026-05-22 10:20',
    },
    {
      id: 102,
      orderNo: 'LA202605220002',
      status: 'pending_dispatch',
      serviceName: '空调深度清洗',
      appointmentTime: '2026-05-24 13:00-15:00',
      addressText: '上海市徐汇区漕溪北路 88 号',
      totalAmount: 180,
      payableAmount: 160,
      createdAt: '2026-05-22 11:10',
    },
    {
      id: 103,
      orderNo: 'LA202605210006',
      status: 'in_service',
      serviceName: '水电维修上门检测',
      appointmentTime: '2026-05-22 15:00-17:00',
      addressText: '上海市静安区南京西路 500 号',
      totalAmount: 80,
      payableAmount: 80,
      staffName: '李师傅',
      staffPhone: '13900000000',
      staffRating: 4.9,
      createdAt: '2026-05-21 18:30',
    },
    {
      id: 104,
      orderNo: 'LA202605200009',
      status: 'pending_confirm',
      serviceName: '厨房深度清洁',
      appointmentTime: '2026-05-21 09:00-11:00',
      addressText: '上海市黄浦区人民路 66 号',
      totalAmount: 220,
      payableAmount: 220,
      staffName: '王师傅',
      staffPhone: '13700000000',
      staffRating: 4.8,
      createdAt: '2026-05-20 14:20',
    },
    {
      id: 105,
      orderNo: 'LA202605180003',
      status: 'completed',
      serviceName: '油烟机清洗',
      appointmentTime: '2026-05-19 10:00-12:00',
      addressText: '上海市长宁区定西路 36 号',
      totalAmount: 150,
      payableAmount: 150,
      staffName: '赵师傅',
      staffPhone: '13600000000',
      staffRating: 5,
      createdAt: '2026-05-18 09:00',
    },
    {
      id: 106,
      orderNo: 'LA202605170002',
      status: 'cancelled',
      serviceName: '日常保洁 3 小时',
      appointmentTime: '2026-05-18 15:00-18:00',
      addressText: '上海市杨浦区大学路 99 号',
      totalAmount: 180,
      payableAmount: 0,
      createdAt: '2026-05-17 16:45',
    },
  ]
}

export function getMockOrderDetail(id: number): OrderDetail {
  const order = getMockOrders().find(item => item.id === id) || getMockOrders()[0]
  const logSteps: { label: string, status: OrderStatus }[] = [
    { label: '下单', status: 'pending_payment' },
    { label: '支付', status: 'pending_dispatch' },
    { label: '派单', status: 'dispatched' },
    { label: '接单', status: 'accepted' },
    { label: '上门', status: 'on_the_way' },
    { label: '服务中', status: 'in_service' },
    { label: '待确认', status: 'pending_confirm' },
    { label: '完成', status: 'completed' },
  ]
  const activeIndexMap: Record<OrderStatus, number> = {
    pending_payment: 0,
    pending_dispatch: 1,
    dispatched: 2,
    accepted: 3,
    on_the_way: 4,
    in_service: 5,
    pending_confirm: 6,
    completed: 7,
    cancelled: 0,
    refund_pending: 1,
    refunded: 1,
    after_sales: 7,
  }
  const activeIndex = activeIndexMap[order.status]

  return {
    ...order,
    paymentMethod: order.status === 'pending_payment' ? '待支付' : '微信支付',
    statusLogs: logSteps.map((step, index) => ({
      label: step.label,
      status: step.status,
      active: index <= activeIndex && !['cancelled', 'refund_pending', 'refunded'].includes(order.status),
      time: index <= activeIndex ? order.createdAt : '',
    })),
    amountItems: [
      { label: '服务金额', amount: order.totalAmount },
      { label: '优惠金额', amount: Math.max(order.totalAmount - order.payableAmount, 0), type: 'discount' },
    ],
    servicePhotos: order.status === 'completed' ? ['/static/logo.svg'] : [],
  }
}

export function createMockPricePreview(amount: number): PricePreview {
  return {
    serviceAmount: amount,
    discountAmount: 0,
    payableAmount: amount,
    items: [
      { label: '服务金额', amount },
      { label: '优惠金额', amount: 0, type: 'discount' },
    ],
  }
}
