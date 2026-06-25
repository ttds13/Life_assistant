<script lang="ts" setup>
import { getOrderDetail, payOrder } from '@/api/orders'
import { getWechatPaymentParams, requestWechatPayment } from '@/utils/wechatPayment'

definePage({
  style: {
    navigationBarTitleText: '支付结果',
  },
})

const orderId = ref('')
const status = ref<'pending' | 'success' | 'fail'>('pending')
const amount = ref(0)
const paying = ref(false)

const resultConfig = computed(() => {
  if (status.value === 'success') {
    return {
      icon: '✓',
      title: '支付成功',
      description: '支付结果仅作提示，订单状态以后端确认为准',
      color: '#16A34A',
    }
  }
  if (status.value === 'fail') {
    return {
      icon: '!',
      title: '支付失败',
      description: '可返回订单详情重新发起支付',
      color: '#EF4444',
    }
  }
  return {
    icon: '…',
    title: '订单已提交',
    description: '请完成微信支付，支付结果以后端确认为准',
    color: '#1677FF',
  }
})

function onDetail() {
  uni.redirectTo({ url: `/pages/order/detail?id=${orderId.value || 101}` })
}

function onHome() {
  uni.switchTab({ url: '/pages/home/index' })
}

async function refreshOrderStatus() {
  const id = Number(orderId.value)
  if (!id)
    return
  const detail = await getOrderDetail(id)
  if (detail.status !== 'pending_payment')
    status.value = 'success'
}

async function runWechatPay() {
  const id = Number(orderId.value)
  if (!id || paying.value)
    return
  paying.value = true
  try {
    const payment = await payOrder(id)
    if (payment.status !== 'pending' || !payment.paymentParams) {
      await refreshOrderStatus()
      uni.showToast({ icon: 'none', title: '订单状态已刷新' })
      return
    }
    const params = getWechatPaymentParams(payment)
    await requestWechatPayment(params)
    status.value = 'success'
    uni.showToast({ icon: 'success', title: '支付完成' })
    setTimeout(() => {
      void refreshOrderStatus()
    }, 1200)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('cancel')) {
      uni.showToast({ icon: 'none', title: '已取消支付' })
    }
    else {
      status.value = 'fail'
      uni.showToast({ icon: 'none', title: '支付未完成' })
    }
  }
  finally {
    paying.value = false
  }
}

onLoad((query) => {
  orderId.value = String(query?.orderId || '')
  status.value = ['success', 'fail', 'pending'].includes(String(query?.status)) ? query?.status as any : 'pending'
  amount.value = Number(query?.amount || 0)
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] px-4 pt-safe">
    <view class="bg-white rounded-[16rpx] mt-8 p-6 flex flex-col items-center">
      <view class="w-[128rpx] h-[128rpx] rounded-full flex items-center justify-center" :style="{ backgroundColor: `${resultConfig.color}18` }">
        <text class="text-[64rpx] font-700" :style="{ color: resultConfig.color }">{{ resultConfig.icon }}</text>
      </view>
      <text class="text-[36rpx] font-600 text-gray-800 mt-5">{{ resultConfig.title }}</text>
      <text class="text-[26rpx] text-gray-500 text-center leading-[38rpx] mt-2">{{ resultConfig.description }}</text>

      <view class="w-full mt-6 bg-[#F9FAFB] rounded-[12rpx] p-4">
        <view class="flex items-center justify-between">
          <text class="text-[26rpx] text-gray-500">订单号</text>
          <text class="text-[26rpx] text-gray-700">{{ orderId || '待生成' }}</text>
        </view>
        <view class="flex items-center justify-between mt-3">
          <text class="text-[26rpx] text-gray-500">订单金额</text>
          <text class="text-[30rpx] text-[#EF4444] font-600">¥{{ amount || '--' }}</text>
        </view>
      </view>
    </view>

    <view class="mt-6">
      <button
        v-if="status === 'pending'"
        class="h-[88rpx] rounded-full bg-[#1677FF] text-white text-[30rpx] flex items-center justify-center mb-3"
        :loading="paying"
        @tap="runWechatPay"
      >
        立即支付
      </button>
      <button class="h-[88rpx] rounded-full bg-white text-[#1677FF] text-[30rpx] flex items-center justify-center" @tap="onDetail">
        查看订单
      </button>
      <button class="h-[88rpx] rounded-full bg-white text-gray-600 text-[30rpx] flex items-center justify-center mt-3" @tap="onHome">
        返回首页
      </button>
    </view>
  </view>
</template>
