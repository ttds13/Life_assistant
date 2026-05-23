<script lang="ts" setup>
import type { UserOrder } from '@/api/types/orders'

const props = defineProps<{
  order: UserOrder
}>()

const emit = defineEmits<{
  tap: [order: UserOrder]
  primary: [order: UserOrder]
  secondary: [order: UserOrder]
}>()

const actionConfig = computed(() => {
  switch (props.order.status) {
    case 'pending_payment':
      return { primary: '去支付', secondary: '取消订单' }
    case 'pending_dispatch':
      return { primary: '查看详情', secondary: '' }
    case 'dispatched':
    case 'accepted':
      return { primary: '查看师傅', secondary: '' }
    case 'on_the_way':
    case 'in_service':
      return { primary: '查看进度', secondary: '' }
    case 'pending_confirm':
      return { primary: '确认完成', secondary: '' }
    case 'completed':
      return { primary: '去评价', secondary: '申请售后' }
    case 'cancelled':
      return { primary: '再次预约', secondary: '' }
    default:
      return { primary: '查看详情', secondary: '' }
  }
})

function formatAmount(amount: number) {
  return amount % 1 === 0 ? amount.toString() : amount.toFixed(2)
}
</script>

<template>
  <view class="bg-white rounded-[16rpx] mx-4 mt-3 p-4" @tap="emit('tap', order)">
    <view class="flex items-center justify-between">
      <text class="text-[30rpx] font-600 text-gray-800 truncate flex-1 pr-3">{{ order.serviceName }}</text>
      <order-status-tag :status="order.status" size="sm" />
    </view>

    <view class="mt-3">
      <view class="flex items-start mt-2">
        <text class="text-[24rpx] text-gray-400 w-[112rpx]">时间</text>
        <text class="text-[26rpx] text-gray-700 flex-1">{{ order.appointmentTime }}</text>
      </view>
      <view class="flex items-start mt-2">
        <text class="text-[24rpx] text-gray-400 w-[112rpx]">地址</text>
        <text class="text-[26rpx] text-gray-700 flex-1 leading-[36rpx]">{{ order.addressText }}</text>
      </view>
    </view>

    <view class="flex items-center justify-between mt-4 pt-3 border-t border-[#F3F4F6]">
      <view class="flex items-baseline">
        <text class="text-[24rpx] text-gray-400 mr-1">应付</text>
        <text class="text-[24rpx] text-[#EF4444] font-600">¥</text>
        <text class="text-[34rpx] text-[#EF4444] font-700">{{ formatAmount(order.payableAmount) }}</text>
      </view>
      <view class="flex items-center gap-2" @tap.stop>
        <button
          v-if="actionConfig.secondary"
          class="h-[60rpx] px-4 rounded-full bg-white border border-[#E5E7EB] text-[24rpx] text-gray-600 flex items-center justify-center"
          @tap="emit('secondary', order)"
        >
          {{ actionConfig.secondary }}
        </button>
        <button
          class="h-[60rpx] px-4 rounded-full bg-[#1677FF] text-white text-[24rpx] flex items-center justify-center"
          @tap="emit('primary', order)"
        >
          {{ actionConfig.primary }}
        </button>
      </view>
    </view>
  </view>
</template>
