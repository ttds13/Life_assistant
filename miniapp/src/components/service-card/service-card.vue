<script lang="ts" setup>
import type { Service } from '@/api/types/services'

defineProps<{
  service: Service
}>()

const emit = defineEmits<{
  tap: [service: Service]
}>()
</script>

<template>
  <view class="bg-white rounded-[16rpx] overflow-hidden mb-3 mx-4" @tap="emit('tap', service)">
    <image
      v-if="service.coverImage"
      :src="service.coverImage"
      class="w-full h-[200rpx]"
      mode="aspectFill"
    />
    <view v-else class="w-full h-[200rpx] bg-[#EAF3FF] flex items-center justify-center">
      <text class="text-[48rpx]">🧹</text>
    </view>
    <view class="p-3">
      <text class="text-[30rpx] font-600 text-gray-800 block">{{ service.name }}</text>
      <text class="text-[26rpx] text-gray-400 block mt-1 truncate">{{ service.description }}</text>
      <view class="mt-2">
        <price-text :price="service.basePrice" :unit="service.priceUnit || '次'" size="md" />
      </view>
    </view>
  </view>
</template>
