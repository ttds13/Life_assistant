<script lang="ts" setup>
import { cancelOrder, confirmOrder, getOrderDetail, payOrder } from '@/api/orders'
import type { OrderDetail } from '@/api/types/orders'
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
    default:
      return { title: '订单处理中', desc: '订单状态待刷新', next: '请稍后查看' }
  }
})

const actionConfig = computed(() => {
  const status = order.value?.status
  switch (status) {
    case 'pending_payment':
      return { primary: '去支付', secondary: '取消订单' }
    case 'pending_confirm':
      return { primary: '确认完成', secondary: '申请售后' }
    case 'completed':
      return { primary: '去评价', secondary: '申请售后' }
    case 'cancelled':
      return { primary: '再次预约', secondary: '' }
    default:
      return { primary: '查看进度', secondary: '' }
  }
})

async function loadOrder() {
  loading.value = true
  try {
    order.value = await getOrderDetail(orderId.value)
  }
  finally {
    loading.value = false
  }
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
  if (order.value.status === 'cancelled') {
    uni.switchTab({ url: '/pages/home/index' })
    return
  }
  uni.showToast({ icon: 'none', title: '请查看当前订单状态' })
}

function onSecondary() {
  if (!order.value)
    return
  if (order.value.status === 'pending_payment') {
    uni.showModal({
      title: '取消订单',
      content: '确定取消该订单吗？',
      success: async (res) => {
        if (res.confirm) {
          actionLoading.value = true
          try {
            order.value = await cancelOrder(order.value!.id, { version: order.value!.version })
            uni.showToast({ icon: 'success', title: '已取消' })
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
    loadOrder()
})

onShow(() => {
  if (orderId.value)
    loadOrder()
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
            <view v-for="item in order.statusLogs" :key="item.label" class="flex-1 flex flex-col items-center">
              <view class="w-[24rpx] h-[24rpx] rounded-full" :class="item.active ? 'bg-[#1677FF]' : 'bg-[#E5E7EB]'" />
              <text class="text-[22rpx] mt-2" :class="item.active ? 'text-[#1677FF]' : 'text-gray-400'">{{ item.label }}</text>
            </view>
          </view>
        </form-section>

        <form-section title="服务信息">
          <view class="flex">
            <view class="w-[120rpx] h-[120rpx] rounded-[12rpx] bg-[#EAF3FF] flex items-center justify-center overflow-hidden mr-3">
              <image v-if="order.serviceImage" :src="order.serviceImage" class="w-full h-full" mode="aspectFill" />
              <text v-else class="text-[42rpx]">🧹</text>
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
