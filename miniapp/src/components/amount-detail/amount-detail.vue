<script lang="ts" setup>
import type { AmountDetailItem } from '@/api/types/orders'

const props = defineProps<{
  items: AmountDetailItem[]
  total: number
}>()

function formatAmount(amount: number) {
  return amount % 1 === 0 ? amount.toString() : amount.toFixed(2)
}
</script>

<template>
  <view>
    <view
      v-for="item in props.items"
      :key="item.label"
      class="flex items-center justify-between py-2"
    >
      <text class="text-[26rpx] text-gray-500">{{ item.label }}</text>
      <text
        class="text-[26rpx]"
        :class="item.type === 'discount' ? 'text-[#F59E0B]' : 'text-gray-700'"
      >
        {{ item.type === 'discount' && item.amount > 0 ? '-' : '' }}¥{{ formatAmount(item.amount) }}
      </text>
    </view>
    <view class="h-[1rpx] bg-[#E5E7EB] my-2" />
    <view class="flex items-center justify-between py-2">
      <text class="text-[28rpx] font-600 text-gray-800">应付金额</text>
      <view class="flex items-baseline">
        <text class="text-[24rpx] text-[#EF4444] font-600">¥</text>
        <text class="text-[40rpx] text-[#EF4444] font-700">{{ formatAmount(total) }}</text>
      </view>
    </view>
  </view>
</template>
