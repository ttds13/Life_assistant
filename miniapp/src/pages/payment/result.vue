<script lang="ts" setup>
import type { OrderDetail } from '@/api/types/orders'
import { getOrderDetail, payOrder } from '@/api/orders'
import { navigateToMemberCardReservation } from '@/utils/memberCardReservation'
import { getWechatPaymentParams, requestWechatPayment } from '@/utils/wechatPayment'

definePage({
  style: {
    navigationBarTitleText: '支付结果',
  },
})

const orderId = ref('')
const orderType = ref('')
const status = ref<'pending' | 'success' | 'fail'>('pending')
const amount = ref(0)
const paying = ref(false)
const confirming = ref(false)
const promptedReserve = ref(false)
const orderDetail = ref<OrderDetail | null>(null)
let pageActive = true

const grantedUserMemberCardId = computed(() =>
  orderDetail.value?.memberCardPurchase?.grantedUserMemberCardId || 0,
)

const resultConfig = computed(() => {
  if (status.value === 'success') {
    return {
      icon: 'i-carbon-checkmark-filled',
      title: orderType.value === 'member_card_purchase' ? '购卡成功' : '支付成功',
      description: orderType.value === 'member_card_purchase'
        ? '会员权益已发放到我的会员卡，可立即预约服务'
        : '订单已支付，服务进度以订单详情为准',
      color: '#16A34A',
    }
  }
  if (status.value === 'fail') {
    return {
      icon: 'i-carbon-warning-filled',
      title: '支付未完成',
      description: '可返回订单详情重新发起支付',
      color: '#EF4444',
    }
  }
  return {
    icon: 'i-carbon-time-filled',
    title: confirming.value ? '正在确认支付结果' : '订单待支付',
    description: confirming.value
      ? '支付结果确认后将自动更新，请勿重复支付'
      : '请完成微信支付，最终结果以服务端确认为准',
    color: '#1677FF',
  }
})

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isFailedOrder(detail: OrderDetail) {
  return ['cancelled', 'refunded'].includes(detail.status)
}

function onHome() {
  uni.switchTab({ url: '/pages/home/index' })
}

function onDetail() {
  if (orderType.value === 'member_card_purchase' && grantedUserMemberCardId.value) {
    uni.redirectTo({ url: `/pages/card/index?userMemberCardId=${grantedUserMemberCardId.value}` })
    return
  }
  uni.redirectTo({ url: `/pages/order/detail?id=${orderId.value}` })
}

async function onReserve() {
  if (!grantedUserMemberCardId.value) {
    uni.showToast({ icon: 'none', title: '会员权益仍在发放中' })
    return
  }
  await navigateToMemberCardReservation(grantedUserMemberCardId.value)
}

function promptReserveAfterCardPurchase() {
  if (orderType.value !== 'member_card_purchase'
    || status.value !== 'success'
    || !grantedUserMemberCardId.value
    || promptedReserve.value) {
    return
  }
  promptedReserve.value = true
  uni.showModal({
    title: '会员卡已发放',
    content: '是否现在预约服务？也可以稍后在“我的会员卡”中使用。',
    confirmText: '立即预约',
    cancelText: '暂不预约',
    success: (result) => {
      if (result.confirm) {
        void onReserve()
        return
      }
      uni.redirectTo({ url: `/pages/card/index?userMemberCardId=${grantedUserMemberCardId.value}` })
    },
  })
}

async function refreshOrderStatus() {
  const id = Number(orderId.value)
  if (!id)
    return false

  const detail = await getOrderDetail(id)
  if (!pageActive)
    return false
  orderDetail.value = detail
  orderType.value = detail.orderType || orderType.value
  amount.value = detail.payableAmount ?? amount.value

  if (isFailedOrder(detail)) {
    status.value = 'fail'
    return true
  }
  if (detail.status === 'pending_payment') {
    status.value = 'pending'
    return false
  }
  if (orderType.value === 'member_card_purchase') {
    if (detail.status !== 'completed' || !detail.memberCardPurchase?.grantedUserMemberCardId) {
      status.value = 'pending'
      return false
    }
  }

  status.value = 'success'
  promptReserveAfterCardPurchase()
  return true
}

async function confirmOrderResult(maxAttempts = 6) {
  if (confirming.value)
    return
  confirming.value = true
  try {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (!pageActive)
        return
      try {
        if (await refreshOrderStatus())
          return
      }
      catch {
        // 支付通知与查询可能短暂不同步，继续有限重试。
      }
      if (attempt < maxAttempts - 1)
        await delay(800)
    }
    if (pageActive && status.value === 'pending')
      uni.showToast({ icon: 'none', title: '支付结果确认中，请稍后刷新' })
  }
  finally {
    confirming.value = false
  }
}

async function runWechatPay() {
  const id = Number(orderId.value)
  if (!id || paying.value || confirming.value)
    return
  paying.value = true
  try {
    const payment = await payOrder(id)
    if (payment.status === 'pending' && payment.paymentParams) {
      const params = getWechatPaymentParams(payment)
      await requestWechatPayment(params)
    }
    await confirmOrderResult()
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('cancel')) {
      uni.showToast({ icon: 'none', title: '已取消支付' })
      return
    }
    status.value = 'fail'
    uni.showToast({ icon: 'none', title: '支付未完成' })
  }
  finally {
    paying.value = false
  }
}

onLoad((query) => {
  orderId.value = String(query?.orderId || '')
  orderType.value = String(query?.orderType || '')
  status.value = ['success', 'fail', 'pending'].includes(String(query?.status)) ? query?.status as any : 'pending'
  amount.value = Number(query?.amount || 0)
  const shouldWaitForConfirmation = status.value === 'success'
  if (shouldWaitForConfirmation)
    status.value = 'pending'
  void confirmOrderResult(shouldWaitForConfirmation ? 6 : 1)
})

onUnload(() => {
  pageActive = false
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] px-4 pt-safe">
    <view class="bg-white rounded-[16rpx] mt-8 p-6 flex flex-col items-center">
      <view class="w-[128rpx] h-[128rpx] rounded-full flex items-center justify-center" :style="{ backgroundColor: `${resultConfig.color}18` }">
        <text :class="resultConfig.icon" class="text-[64rpx]" :style="{ color: resultConfig.color }" />
      </view>
      <text class="text-[36rpx] font-600 text-gray-800 mt-5">{{ resultConfig.title }}</text>
      <text class="text-[26rpx] text-gray-500 text-center leading-[38rpx] mt-2">{{ resultConfig.description }}</text>

      <view class="w-full mt-6 bg-[#F9FAFB] rounded-[12rpx] p-4">
        <view class="flex items-center justify-between">
          <text class="text-[26rpx] text-gray-500">订单号</text>
          <text class="text-[26rpx] text-gray-700">{{ orderDetail?.orderNo || orderId || '待生成' }}</text>
        </view>
        <view class="flex items-center justify-between mt-3">
          <text class="text-[26rpx] text-gray-500">订单金额</text>
          <text class="text-[30rpx] text-[#EF4444] font-600">¥{{ amount }}</text>
        </view>
      </view>
    </view>

    <view class="mt-6">
      <button
        v-if="status === 'pending' && !confirming"
        class="h-[88rpx] rounded-full bg-[#1677FF] text-white text-[30rpx] flex items-center justify-center mb-3"
        :loading="paying"
        @tap="runWechatPay"
      >
        立即支付
      </button>
      <button
        v-if="status === 'pending'"
        class="h-[88rpx] rounded-full bg-white text-[#1677FF] text-[30rpx] flex items-center justify-center mb-3"
        :loading="confirming"
        @tap="confirmOrderResult()"
      >
        刷新支付结果
      </button>
      <button
        v-if="status === 'success' && orderType === 'member_card_purchase'"
        class="h-[88rpx] rounded-full bg-[#1677FF] text-white text-[30rpx] flex items-center justify-center mb-3"
        @tap="onReserve"
      >
        立即预约
      </button>
      <button class="h-[88rpx] rounded-full bg-white text-[#1677FF] text-[30rpx] flex items-center justify-center" @tap="onDetail">
        {{ orderType === 'member_card_purchase' && grantedUserMemberCardId ? '查看我的会员卡' : '查看订单' }}
      </button>
      <button class="h-[88rpx] rounded-full bg-white text-gray-600 text-[30rpx] flex items-center justify-center mt-3" @tap="onHome">
        返回首页
      </button>
    </view>
  </view>
</template>
