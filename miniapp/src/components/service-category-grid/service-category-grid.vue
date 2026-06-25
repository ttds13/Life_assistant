<script lang="ts" setup>
import type { ServiceCategory } from '@/api/types/services'

withDefaults(defineProps<{
  categories: ServiceCategory[]
  inset?: boolean
}>(), {
  inset: true,
})

function onCategoryTap(category: ServiceCategory) {
  uni.navigateTo({
    url: `/pages/service/search?categoryId=${category.id}&categoryName=${encodeURIComponent(category.name)}`,
  })
}
</script>

<template>
  <view class="bg-white rounded-[16rpx] p-4" :class="inset ? 'mx-4' : ''">
    <view class="grid grid-cols-4 gap-4">
      <view
        v-for="item in categories"
        :key="item.id"
        class="flex flex-col items-center gap-1"
        @tap="onCategoryTap(item)"
      >
        <view class="w-[80rpx] h-[80rpx] bg-[#EAF3FF] rounded-full flex items-center justify-center text-[36rpx]">
          {{ item.icon || '服务' }}
        </view>
        <text class="text-[24rpx] text-gray-700 text-center line-clamp-2">
          {{ item.name }}
        </text>
      </view>
    </view>
  </view>
</template>
