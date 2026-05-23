<script lang="ts" setup>
withDefaults(defineProps<{
  loading: boolean
  text?: string
}>(), {
  text: '加载中...',
})
</script>

<template>
  <view v-if="loading" class="flex flex-col items-center justify-center py-20">
    <view class="animate-spin text-[48rpx] mb-3">⏳</view>
    <text class="text-[26rpx] text-gray-400">{{ text }}</text>
  </view>
  <slot v-else />
</template>