<script lang="ts" setup>
import type { UserAddress } from '@/api/types/address'
import { formatAddress } from '@/utils/addressSelection'

const props = withDefaults(defineProps<{
  address: UserAddress
  selectable?: boolean
  selected?: boolean
  editable?: boolean
}>(), {
  selectable: false,
  selected: false,
  editable: false,
})

const emit = defineEmits<{
  select: [address: UserAddress]
  edit: [address: UserAddress]
}>()
</script>

<template>
  <view
    class="bg-white rounded-[16rpx] mx-4 mt-3 p-4 border"
    :class="selected ? 'border-[#1677FF]' : 'border-transparent'"
    @tap="selectable && emit('select', address)"
  >
    <view class="flex items-start justify-between">
      <view class="flex-1 pr-3">
        <view class="flex items-center flex-wrap">
          <text class="text-[30rpx] font-600 text-gray-800 mr-3">{{ address.contactName }}</text>
          <text class="text-[26rpx] text-gray-500">{{ address.contactPhone }}</text>
          <text v-if="address.isDefault" class="ml-2 text-[22rpx] px-2 py-1 rounded-full bg-[#EAF3FF] text-[#1677FF]">默认</text>
        </view>
        <text class="block mt-2 text-[28rpx] text-gray-700 leading-[40rpx]">
          {{ formatAddress(address) }}
        </text>
      </view>
      <view v-if="editable" class="w-[72rpx] h-[72rpx] flex items-center justify-center" @tap.stop="emit('edit', address)">
        <text class="text-[28rpx] text-[#1677FF]">编辑</text>
      </view>
      <view v-else-if="selected" class="w-[44rpx] h-[44rpx] rounded-full bg-[#1677FF] flex items-center justify-center">
        <text class="text-white text-[24rpx]">✓</text>
      </view>
    </view>
  </view>
</template>
