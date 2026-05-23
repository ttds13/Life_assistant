<script lang="ts" setup>
withDefaults(defineProps<{
  title: string
  subtitle?: string
  required?: boolean
}>(), {
  subtitle: '',
  required: false,
})
</script>

<template>
  <view class="bg-white rounded-[16rpx] mx-4 mt-3 p-4">
    <view class="flex items-center justify-between mb-3">
      <view class="flex items-center">
        <text v-if="required" class="text-[#EF4444] text-[26rpx] mr-1">*</text>
        <text class="text-[30rpx] font-600 text-gray-800">{{ title }}</text>
      </view>
      <text v-if="subtitle" class="text-[24rpx] text-gray-400">{{ subtitle }}</text>
    </view>
    <slot />
  </view>
</template>
