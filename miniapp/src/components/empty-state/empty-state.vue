<script lang="ts" setup>
withDefaults(defineProps<{
  type?: 'empty' | 'error' | 'network'
  title?: string
  description?: string
  showRetry?: boolean
}>(), {
  type: 'empty',
  title: '暂无数据',
  description: '',
  showRetry: false,
})

const emit = defineEmits<{
  retry: []
}>()
</script>

<template>
  <view class="flex flex-col items-center justify-center py-20">
    <view class="text-[120rpx] mb-4">
      <text v-if="type === 'empty'">📭</text>
      <text v-else-if="type === 'error'">⚠️</text>
      <text v-else>🌐</text>
    </view>
    <text class="text-[30rpx] text-gray-600 mb-2">{{ title }}</text>
    <text v-if="description" class="text-[26rpx] text-gray-400 mb-4">{{ description }}</text>
    <view v-if="showRetry" class="mt-4">
      <button class="bg-[#1677FF] text-white text-[28rpx] px-8 py-2 rounded-full" @tap="emit('retry')">
        重试
      </button>
    </view>
  </view>
</template>