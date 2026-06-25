<script lang="ts" setup>
import type { OrderStatus } from '@/api/types/orders'
import { getOrderStatusDisplay } from '@/utils/orderStatus'

const props = withDefaults(defineProps<{
  status: OrderStatus
  size?: 'sm' | 'md'
}>(), {
  size: 'md',
})

const config = computed(() => getOrderStatusDisplay(props.status))
const sizeClass = computed(() => props.size === 'sm' ? 'text-[22rpx] px-2 py-1' : 'text-[24rpx] px-3 py-1')
</script>

<template>
  <text class="rounded-full font-500" :class="[config.className, sizeClass]">
    {{ config.text }}
  </text>
</template>
