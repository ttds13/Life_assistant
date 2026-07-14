<script lang="ts" setup>
import { cancelOrder, confirmOrder, getOrderDetail, payOrder, rescheduleOrder } from '@/api/orders'
import type { OrderDetail } from '@/api/types/orders'
import { availableAppointmentSlots, buildAppointmentDateOptions, formatAppointmentDate, formatAppointmentTimeSlot } from '@/utils/appointmentSlots'
import { ensureChineseStatusLabel, getOrderStatusText } from '@/utils/orderStatus'
import { getWechatPaymentParams, requestWechatPayment } from '@/utils/wechatPayment'

definePage({
  style: {
    navigationBarTitleText: '订单详情',
  },
})

const orderId = ref(0)
const order = ref<OrderDetail | null>(null)
const loading = ref(true)
const actionLoading = ref(false)
const payLoading = ref(false)
const rescheduleVisible = ref(false)
const rescheduleLoading = ref(false)
const selectedDate = ref('')
const selectedTimeSlot = ref('')

const statusInfo = computed(() => {
  const status = order.value?.status
  switch (status) {
    case 'pending_payment':
      return { title: '等待支付', desc: '请在订单保留时间内完成支付', next: '下一步：去支付' }
    case 'pending_dispatch':
      return { title: '等待派单', desc: '平台正在为你安排服务人员', next: '下一步：等待师傅接单' }
    case 'dispatched':
    case 'accepted':
      return { title: '已安排师傅', desc: '师傅会按预约时间上门服务', next: '下一步：等待上门' }
    case 'on_the_way':
      return { title: '师傅上门中', desc: '师傅正在前往服务地址', next: '下一步：开始服务' }
    case 'in_service':
      return { title: '服务中', desc: '服务正在进行，请留意现场情况', next: '下一步：等待完成' }
    case 'pending_confirm':
      return { title: '待确认完成', desc: '服务已提交完成，请确认服务结果', next: '下一步：确认完成' }
    case 'completed':
      return { title: '已完成', desc: '感谢使用生活助手服务', next: '可评价或申请售后' }
    case 'cancelled':
      return { title: '已取消', desc: '该订单已取消', next: '可再次预约服务' }
    case 'refund_pending':
      return { title: '退款审核中', desc: '已提交退款审核，请等待后台处理', next: '下一步：等待退款审核' }
    case 'refunded':
      return { title: '已退款', desc: '订单退款已完成', next: '退款到账时间以支付渠道为准' }
    case 'after_sales':
      return { title: '售后中', desc: '订单正在售后处理中', next: '请等待平台处理结果' }
    default:
      return { title: getOrderStatusText(status), desc: '订单状态待刷新', next: '请稍后查看' }
  }
})

const actionConfig = computed(() => {
  const status = order.value?.status
  switch (status) {
    case 'pending_payment':
      return { primary: '去支付', secondary: '取消订单' }
    case 'pending_dispatch':
      return { primary: '查看进度', secondary: '取消预约' }
    case 'pending_confirm':
      return { primary: '确认完成', secondary: activeTicket.value ? '查看售后' : '申请售后' }
    case 'completed':
      return { primary: '去评价', secondary: activeTicket.value ? '查看售后' : '申请售后' }
    case 'after_sales':
      return { primary: activeTicket.value || latestTicket.value ? '查看售后' : '申请售后', secondary: '' }
    case 'cancelled':
      return { primary: '再次预约', secondary: '' }
    default:
      return { primary: '查看进度', secondary: '' }
  }
})

const canReschedule = computed(() =>
  !!order.value
  && ['pending_payment', 'pending_dispatch'].includes(order.value.status)
  && order.value.orderType !== 'member_card_purchase',
)
const dateOptions = computed(() => buildAppointmentDateOptions())
const timeSlots = computed(() => availableAppointmentSlots(selectedDate.value))
const isPaidCashBooking = computed(() =>
  !!order.value
  && order.value.status === 'pending_dispatch'
  && !order.value.memberCardId
  && (Boolean(order.value.paidAt) || order.value.paidAmount > 0 || order.value.payableAmount > 0),
)
const latestRefund = computed(() => order.value?.latestRefund || order.value?.refunds?.[0] || null)
const latestTicket = computed(() => order.value?.latestTicket || order.value?.tickets?.[0] || null)
const activeTicket = computed(() => {
  const ticket = latestTicket.value
  return ticket && ['open', 'pending'].includes(ticket.status) ? ticket : null
})
const canAfterSales = computed(() =>
  !!order.value
  && ['accepted', 'on_the_way', 'in_service', 'pending_confirm', 'completed', 'after_sales'].includes(order.value.status),
)
const refundStatusInfo = computed(() => {
  const refund = latestRefund.value
  if (!refund)
    return null
  const map: Record<string, { title: string, desc: string, className: string }> = {
    pending: { title: '退款审核中', desc: '退款申请已提交，等待后台审核。', className: 'bg-[#FFF7ED] text-[#AD6800]' },
    approved: { title: '退款已通过', desc: '后台已通过审核，正在准备退款。', className: 'bg-[#EAF3FF] text-[#1677FF]' },
    processing: { title: '退款处理中', desc: '退款已提交至支付渠道，请等待到账。', className: 'bg-[#EAF3FF] text-[#1677FF]' },
    refunded: { title: '退款成功', desc: '退款已完成，具体到账时间以支付渠道为准。', className: 'bg-[#F3F4F6] text-[#6B7280]' },
    failed: { title: '退款失败', desc: refund.failureReason || '支付渠道退款失败，平台将继续处理。', className: 'bg-[#FEF2F2] text-[#EF4444]' },
    rejected: { title: '退款已拒绝', desc: refund.failureReason || '退款申请未通过，请联系客服处理。', className: 'bg-[#FEF2F2] text-[#EF4444]' },
  }
  return map[refund.status] || { title: refund.status, desc: refund.reason || '退款状态已更新。', className: 'bg-[#F3F4F6] text-[#6B7280]' }
})

const ticketStatusInfo = computed(() => {
  const ticket = latestTicket.value
  if (!ticket)
    return null
  const map: Record<string, { title: string, desc: string, className: string }> = {
    open: { title: '售后待处理', desc: ticket.latestMessage || '平台已收到售后申请。', className: 'bg-[#FFF7ED] text-[#AD6800]' },
    pending: { title: '售后处理中', desc: ticket.latestMessage || '平台正在处理售后工单。', className: 'bg-[#EAF3FF] text-[#1677FF]' },
    resolved: { title: '售后已解决', desc: ticket.latestMessage || '售后工单已处理完成。', className: 'bg-[#ECFDF3] text-[#16A34A]' },
    rejected: { title: '售后已拒绝', desc: ticket.latestMessage || '售后申请未通过。', className: 'bg-[#FEF2F2] text-[#EF4444]' },
    closed: { title: '售后已关闭', desc: ticket.latestMessage || '售后工单已关闭。', className: 'bg-[#F3F4F6] text-[#6B7280]' },
  }
  return map[ticket.status] || { title: ticket.status, desc: ticket.latestMessage || '售后状态已更新。', className: 'bg-[#F3F4F6] text-[#6B7280]' }
})

const showMemberCardUsage = computed(() =>
  !!order.value
  && Boolean(order.value.memberCardId || order.value.memberCardName || order.value.memberCard || order.value.memberCardRecords?.length),
)
const currentMemberCardUsableUnits = computed(() => {
  const card = order.value?.memberCard
  if (!card)
    return 0
  return card.usableUnits ?? Math.max(0, card.remainingUnits - card.frozenUnits)
})

function formatMemberCardUnits(value?: number | null) {
  const unit = order.value?.memberCardUnitName || order.value?.memberCard?.unitName || '分钟'
  return `${Number(value || 0)}${unit}`
}

async function loadOrder() {
  loading.value = true
  try {
    order.value = await getOrderDetail(orderId.value)
  }
  finally {
    loading.value = false
  }
}

function openReschedulePanel() {
  if (!order.value || !canReschedule.value)
    return
  const start = order.value.appointmentStartTime ? new Date(order.value.appointmentStartTime) : null
  const end = order.value.appointmentEndTime ? new Date(order.value.appointmentEndTime) : null
  selectedDate.value = start && !Number.isNaN(start.getTime())
    ? formatAppointmentDate(start)
    : dateOptions.value[0]?.value || ''
  selectedTimeSlot.value = start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())
    ? formatAppointmentTimeSlot(start, end)
    : ''
  if (!timeSlots.value.includes(selectedTimeSlot.value)) {
    selectedTimeSlot.value = timeSlots.value[0] || ''
  }
  rescheduleVisible.value = true
}

function closeReschedulePanel() {
  if (rescheduleLoading.value)
    return
  rescheduleVisible.value = false
}

async function submitReschedule() {
  if (!order.value || rescheduleLoading.value)
    return
  if (!selectedDate.value || !selectedTimeSlot.value) {
    uni.showToast({ icon: 'none', title: '请选择新的预约时间' })
    return
  }
  rescheduleLoading.value = true
  try {
    order.value = await rescheduleOrder(order.value.id, {
      appointmentDate: selectedDate.value,
      appointmentTimeSlot: selectedTimeSlot.value,
      version: order.value.version,
    })
    rescheduleVisible.value = false
    uni.showToast({ icon: 'success', title: '已修改时间' })
  }
  finally {
    rescheduleLoading.value = false
  }
}

function cancelModalContent() {
  if (order.value?.memberCardId)
    return '取消后将释放本次冻结的会员卡额度，确认继续吗？'
  if (isPaidCashBooking.value)
    return '订单已支付，取消后将进入退款审核，确认继续吗？'
  return '确定取消该订单吗？'
}

async function runWechatPay() {
  if (!order.value || payLoading.value)
    return
  payLoading.value = true
  try {
    const payment = await payOrder(order.value.id)
    if (payment.status !== 'pending' || !payment.paymentParams) {
      await loadOrder()
      uni.showToast({ icon: 'none', title: '订单状态已刷新' })
      return
    }
    const params = getWechatPaymentParams(payment)
    await requestWechatPayment(params)
    uni.showToast({ icon: 'success', title: '支付完成' })
    setTimeout(() => {
      void loadOrder()
    }, 1200)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    uni.showToast({ icon: 'none', title: message.includes('cancel') ? '已取消支付' : '支付未完成' })
  }
  finally {
    payLoading.value = false
  }
}

function onPrimary() {
  if (!order.value)
    return
  if (order.value.status === 'pending_payment') {
    void runWechatPay()
    return
  }
  if (order.value.status === 'pending_confirm') {
    uni.showModal({
      title: '确认完成',
      content: '确认服务已经完成吗？',
      success: async (res) => {
        if (res.confirm) {
          actionLoading.value = true
          try {
            order.value = await confirmOrder(order.value!.id, { version: order.value!.version })
            uni.showToast({ icon: 'success', title: '已确认' })
          }
          finally {
            actionLoading.value = false
          }
        }
      },
    })
    return
  }
  if (order.value.status === 'completed') {
    uni.showToast({ icon: 'none', title: '当前暂无评价入口' })
    return
  }
  if (order.value.status === 'after_sales') {
    openAfterSales()
    return
  }
  if (order.value.status === 'cancelled') {
    uni.switchTab({ url: '/pages/home/index' })
    return
  }
  uni.showToast({ icon: 'none', title: '请查看当前订单状态' })
}

function openAfterSales(mode: 'auto' | 'create' | 'detail' = 'auto') {
  if (!order.value)
    return
  const ticket = latestTicket.value
  if (mode === 'detail' && ticket?.id) {
    uni.navigateTo({ url: `/pages/order/after-sales-detail?id=${ticket.id}` })
    return
  }
  if (mode !== 'create' && activeTicket.value?.id) {
    uni.navigateTo({ url: `/pages/order/after-sales-detail?id=${activeTicket.value.id}` })
    return
  }
  uni.navigateTo({ url: `/pages/order/after-sales-create?orderId=${order.value.id}` })
}

function onSecondary() {
  if (!order.value)
    return
  if (!['pending_payment', 'pending_dispatch'].includes(order.value.status) && canAfterSales.value) {
    openAfterSales()
    return
  }
  if (['pending_payment', 'pending_dispatch'].includes(order.value.status)) {
    uni.showModal({
      title: '取消订单',
      content: cancelModalContent(),
      success: async (res) => {
        if (res.confirm) {
          actionLoading.value = true
          try {
            order.value = await cancelOrder(order.value!.id, { version: order.value!.version })
            uni.showToast({ icon: 'success', title: order.value.status === 'refund_pending' ? '已进入退款审核' : '已取消' })
          }
          finally {
            actionLoading.value = false
          }
        }
      },
    })
    return
  }
  uni.showToast({ icon: 'none', title: '如需帮助请联系客服' })
}

function onCallStaff() {
  if (!order.value?.staffPhone) {
    uni.showToast({ icon: 'none', title: '师傅联系方式待分配' })
    return
  }
  uni.makePhoneCall({ phoneNumber: order.value.staffPhone })
}

onLoad((query) => {
  orderId.value = Number(query?.id || 0)
  if (orderId.value)
    void loadOrder()
})

onShow(() => {
  if (orderId.value)
    void loadOrder()
})

watch(timeSlots, (slots) => {
  if (selectedTimeSlot.value && !slots.includes(selectedTimeSlot.value))
    selectedTimeSlot.value = ''
  if (!selectedTimeSlot.value && slots.length)
    selectedTimeSlot.value = slots[0]
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[170rpx] pt-1">
    <loading-state :loading="loading">
      <view v-if="order">
        <view class="mx-4 mt-3 rounded-[16rpx] bg-[#1677FF] p-5">
          <view class="flex items-center justify-between">
            <text class="text-[38rpx] font-700 text-white">{{ statusInfo.title }}</text>
            <order-status-tag :status="order.status" />
          </view>
          <text class="block mt-2 text-[26rpx] text-white opacity-85">{{ statusInfo.desc }}</text>
          <text class="block mt-3 text-[24rpx] text-white opacity-75">{{ statusInfo.next }}</text>
        </view>

        <form-section title="状态进度">
          <view class="flex justify-between">
            <view v-for="(item, index) in order.statusLogs" :key="`${item.label}-${index}`" class="flex-1 flex flex-col items-center">
              <view class="w-[24rpx] h-[24rpx] rounded-full" :class="item.active ? 'bg-[#1677FF]' : 'bg-[#E5E7EB]'" />
              <text class="text-[22rpx] mt-2" :class="item.active ? 'text-[#1677FF]' : 'text-gray-400'">
                {{ ensureChineseStatusLabel(item.label, item.status) }}
              </text>
            </view>
          </view>
        </form-section>

        <form-section title="服务信息">
          <view class="flex">
            <view class="w-[120rpx] h-[120rpx] rounded-[12rpx] bg-[#EAF3FF] flex items-center justify-center overflow-hidden mr-3">
              <image v-if="order.serviceImage" :src="order.serviceImage" class="w-full h-full" mode="aspectFill" />
              <text v-else class="text-[42rpx]">家</text>
            </view>
            <view class="flex-1">
              <text class="text-[30rpx] font-600 text-gray-800 block">{{ order.serviceName }}</text>
              <text class="text-[24rpx] text-gray-400 block mt-1">价格快照以后端订单金额为准</text>
              <view class="mt-2">
                <price-text :price="order.totalAmount" unit="单" size="sm" />
              </view>
            </view>
          </view>
        </form-section>

        <form-section title="预约信息">
          <view class="flex py-2">
            <text class="w-[140rpx] text-[26rpx] text-gray-400">预约时间</text>
            <text class="flex-1 text-[26rpx] text-gray-700">{{ order.appointmentTime }}</text>
          </view>
          <view v-if="canReschedule" class="mt-2 flex justify-end">
            <button
              class="h-[64rpx] px-4 rounded-full bg-[#EAF3FF] text-[#1677FF] text-[26rpx] flex items-center justify-center"
              :disabled="rescheduleLoading"
              @tap="openReschedulePanel"
            >
              修改时间
            </button>
          </view>
          <view class="flex py-2">
            <text class="w-[140rpx] text-[26rpx] text-gray-400">服务地址</text>
            <text class="flex-1 text-[26rpx] text-gray-700 leading-[38rpx]">{{ order.addressText }}</text>
          </view>
          <view class="flex py-2">
            <text class="w-[140rpx] text-[26rpx] text-gray-400">用户备注</text>
            <text class="flex-1 text-[26rpx] text-gray-700">{{ order.remark || '暂无备注' }}</text>
          </view>
        </form-section>

        <form-section title="师傅信息">
          <view v-if="order.staffName" class="flex items-center justify-between">
            <view>
              <text class="text-[30rpx] font-600 text-gray-800 block">{{ order.staffName }}</text>
              <text class="text-[24rpx] text-gray-400 block mt-1">评分 {{ order.staffRating || '--' }}</text>
            </view>
            <button class="h-[64rpx] px-4 rounded-full bg-[#EAF3FF] text-[#1677FF] text-[26rpx] flex items-center justify-center" @tap="onCallStaff">
              联系师傅
            </button>
          </view>
          <view v-else class="rounded-[12rpx] bg-[#F9FAFB] p-3">
            <text class="text-[26rpx] text-gray-500">平台正在安排服务人员</text>
          </view>
        </form-section>

        <form-section title="支付信息">
          <view class="flex py-2">
            <text class="w-[140rpx] text-[26rpx] text-gray-400">订单号</text>
            <text class="flex-1 text-[26rpx] text-gray-700">{{ order.orderNo }}</text>
          </view>
          <view class="flex py-2">
            <text class="w-[140rpx] text-[26rpx] text-gray-400">支付方式</text>
            <text class="flex-1 text-[26rpx] text-gray-700">{{ order.paymentMethod || '待支付' }}</text>
          </view>
          <amount-detail :items="order.amountItems" :total="order.payableAmount" />
        </form-section>

        <form-section v-if="showMemberCardUsage" title="会员卡使用">
          <view class="rounded-[16rpx] bg-[#F9FAFB] p-[20rpx]">
            <view class="flex py-[8rpx]">
              <text class="w-[150rpx] text-[26rpx] text-gray-400">会员卡</text>
              <text class="flex-1 text-[26rpx] text-gray-700">{{ order.memberCardName || order.memberCard?.name || '会员卡' }}</text>
            </view>
            <view class="grid grid-cols-3 gap-[12rpx] mt-[8rpx]">
              <view class="rounded-[14rpx] bg-[#FFF7ED] p-[16rpx]">
                <text class="block text-[22rpx] text-[#B45309]">预计冻结</text>
                <text class="block mt-[6rpx] text-[28rpx] text-[#92400E] font-700">{{ formatMemberCardUnits(order.plannedConsumeUnits || order.memberCardConsumeUnits || order.frozenUnits) }}</text>
              </view>
              <view class="rounded-[14rpx] bg-[#ECFDF5] p-[16rpx]">
                <text class="block text-[22rpx] text-[#047857]">实际核销</text>
                <text class="block mt-[6rpx] text-[28rpx] text-[#047857] font-700">{{ formatMemberCardUnits(order.actualConsumeUnits) }}</text>
              </view>
              <view class="rounded-[14rpx] bg-[#EAF3FF] p-[16rpx]">
                <text class="block text-[22rpx] text-[#1677FF]">已释放</text>
                <text class="block mt-[6rpx] text-[28rpx] text-[#1677FF] font-700">{{ formatMemberCardUnits(order.releasedUnits) }}</text>
              </view>
            </view>
            <view v-if="order.memberCard" class="grid grid-cols-3 gap-[12rpx] mt-[12rpx]">
              <view class="rounded-[14rpx] bg-white p-[16rpx]">
                <text class="block text-[22rpx] text-gray-400">总剩余</text>
                <text class="block mt-[6rpx] text-[28rpx] text-gray-700 font-700">{{ formatMemberCardUnits(order.memberCard.remainingUnits) }}</text>
              </view>
              <view class="rounded-[14rpx] bg-white p-[16rpx]">
                <text class="block text-[22rpx] text-gray-400">已冻结</text>
                <text class="block mt-[6rpx] text-[28rpx] text-gray-700 font-700">{{ formatMemberCardUnits(order.memberCard.frozenUnits) }}</text>
              </view>
              <view class="rounded-[14rpx] bg-white p-[16rpx]">
                <text class="block text-[22rpx] text-gray-400">可用余额</text>
                <text class="block mt-[6rpx] text-[28rpx] text-gray-700 font-700">{{ formatMemberCardUnits(currentMemberCardUsableUnits) }}</text>
              </view>
            </view>
          </view>
        </form-section>

        <form-section v-if="latestRefund && refundStatusInfo" title="退款信息">
          <view class="rounded-[12rpx] p-3" :class="refundStatusInfo.className">
            <view class="flex items-center justify-between">
              <text class="text-[28rpx] font-600">{{ refundStatusInfo.title }}</text>
              <text class="text-[24rpx]">{{ latestRefund.refundNo }}</text>
            </view>
            <text class="block mt-2 text-[24rpx] leading-[36rpx]">{{ refundStatusInfo.desc }}</text>
          </view>
          <view class="flex py-2 mt-2">
            <text class="w-[140rpx] text-[26rpx] text-gray-400">退款金额</text>
            <text class="flex-1 text-[26rpx] text-gray-700">¥{{ latestRefund.amount }}</text>
          </view>
          <view class="flex py-2">
            <text class="w-[140rpx] text-[26rpx] text-gray-400">退款原因</text>
            <text class="flex-1 text-[26rpx] text-gray-700">{{ latestRefund.reason || '暂无' }}</text>
          </view>
          <view v-if="latestRefund.refundedAt" class="flex py-2">
            <text class="w-[140rpx] text-[26rpx] text-gray-400">完成时间</text>
            <text class="flex-1 text-[26rpx] text-gray-700">{{ latestRefund.refundedAt }}</text>
          </view>
        </form-section>

        <form-section v-if="latestTicket && ticketStatusInfo" title="售后信息">
          <view class="rounded-[12rpx] p-3" :class="ticketStatusInfo.className">
            <view class="flex items-center justify-between">
              <text class="text-[28rpx] font-600">{{ ticketStatusInfo.title }}</text>
              <text class="text-[24rpx]">{{ latestTicket.ticketNo }}</text>
            </view>
            <text class="block mt-2 text-[24rpx] leading-[36rpx]">{{ ticketStatusInfo.desc }}</text>
          </view>
          <view class="flex py-2 mt-2">
            <text class="w-[140rpx] text-[26rpx] text-gray-400">售后标题</text>
            <text class="flex-1 text-[26rpx] text-gray-700">{{ latestTicket.title }}</text>
          </view>
          <view class="flex py-2">
            <text class="w-[140rpx] text-[26rpx] text-gray-400">更新时间</text>
            <text class="flex-1 text-[26rpx] text-gray-700">{{ latestTicket.updatedAt }}</text>
          </view>
          <view class="mt-2 flex justify-end">
            <button
              class="h-[64rpx] px-4 rounded-full bg-[#EAF3FF] text-[#1677FF] text-[26rpx] flex items-center justify-center"
              @tap="openAfterSales('detail')"
            >
              查看售后
            </button>
          </view>
        </form-section>

        <form-section title="服务凭证">
          <view v-if="order.servicePhotos && order.servicePhotos.length" class="flex flex-wrap gap-2">
            <image v-for="photo in order.servicePhotos" :key="photo" :src="photo" class="w-[160rpx] h-[160rpx] rounded-[12rpx] bg-[#F3F4F6]" mode="aspectFill" />
          </view>
          <view v-else class="rounded-[12rpx] bg-[#F9FAFB] p-3">
            <text class="text-[26rpx] text-gray-500">暂无服务照片</text>
          </view>
        </form-section>
      </view>

      <empty-state v-else title="订单不存在" />
    </loading-state>

    <view
      v-if="rescheduleVisible"
      class="fixed inset-0 z-50 flex items-end"
      style="background: rgba(0,0,0,0.4)"
    >
      <view class="w-full bg-white rounded-t-[32rpx] px-5 pb-[calc(env(safe-area-inset-bottom)+40rpx)] pt-5">
        <view class="flex items-center justify-between mb-4">
          <text class="text-[32rpx] text-[#1F2937] font-600">修改预约时间</text>
          <text class="i-carbon-close text-[40rpx] text-[#9CA3AF]" @tap="closeReschedulePanel" />
        </view>
        <view class="flex flex-wrap gap-2">
          <view
            v-for="item in dateOptions"
            :key="item.value"
            class="px-4 h-[64rpx] rounded-full flex items-center justify-center border"
            :class="selectedDate === item.value ? 'bg-[#EAF3FF] border-[#1677FF]' : 'bg-white border-[#E5E7EB]'"
            @tap="selectedDate = item.value"
          >
            <text class="text-[26rpx]" :class="selectedDate === item.value ? 'text-[#1677FF]' : 'text-gray-600'">
              {{ item.label }}
            </text>
          </view>
        </view>
        <view class="flex flex-wrap gap-2 mt-3">
          <view
            v-for="slot in timeSlots"
            :key="slot"
            class="px-4 h-[64rpx] rounded-full flex items-center justify-center border"
            :class="selectedTimeSlot === slot ? 'bg-[#EAF3FF] border-[#1677FF]' : 'bg-white border-[#E5E7EB]'"
            @tap="selectedTimeSlot = slot"
          >
            <text class="text-[26rpx]" :class="selectedTimeSlot === slot ? 'text-[#1677FF]' : 'text-gray-600'">
              {{ slot }}
            </text>
          </view>
        </view>
        <view v-if="!timeSlots.length" class="mt-3 rounded-[12rpx] bg-[#FFF7E6] px-3 py-2">
          <text class="text-[24rpx] text-[#AD6800]">
            今天已无可预约时间段，请选择明天或更晚日期
          </text>
        </view>
        <button
          class="mt-5 w-full h-[88rpx] bg-[#1677FF] text-white text-[30rpx] rounded-[20rpx] flex items-center justify-center"
          :disabled="rescheduleLoading || !selectedDate || !selectedTimeSlot"
          @tap="submitReschedule"
        >
          {{ rescheduleLoading ? '提交中...' : '确认修改' }}
        </button>
        <view
          class="mt-3 w-full h-[80rpx] bg-white text-[#6B7280] text-[28rpx] rounded-[20rpx] flex items-center justify-center"
          @tap="closeReschedulePanel"
        >
          取消
        </view>
      </view>
    </view>

    <bottom-action-bar
      v-if="order"
      :primary-text="actionConfig.primary"
      :secondary-text="actionConfig.secondary"
      :loading="actionLoading || payLoading"
      @primary="onPrimary"
      @secondary="onSecondary"
    />
  </view>
</template>
