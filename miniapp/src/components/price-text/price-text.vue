<script lang="ts" setup>
const props = withDefaults(defineProps<{
  price: number
  unit?: string
  size?: 'sm' | 'md' | 'lg'
}>(), {
  unit: '起',
  size: 'md',
})

const fontSize = computed(() => {
  const map = { sm: '28rpx', md: '36rpx', lg: '44rpx' }
  return map[props.size]
})

const displayPrice = computed(() => {
  return props.price % 1 === 0 ? props.price.toString() : props.price.toFixed(2)
})
</script>

<template>
  <view class="inline-flex items-baseline">
    <text class="text-[24rpx] text-[#1677FF] font-600">¥</text>
    <text class="font-700 text-[#1677FF]" :style="{ fontSize }">{{ displayPrice }}</text>
    <text class="text-[22rpx] text-gray-400 ml-1">/{{ unit }}</text>
  </view>
</template>