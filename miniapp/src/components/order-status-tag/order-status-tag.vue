<script lang="ts" setup>
import type { OrderStatus } from '@/api/types/orders'

const props = withDefaults(defineProps<{
  status: OrderStatus
  size?: 'sm' | 'md'
}>(), {
  size: 'md',
})

const statusMap: Record<OrderStatus, { text: string, className: string }> = {
  pending_payment: { text: '待支付', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  pending_dispatch: { text: '待派单', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  dispatched: { text: '已派单', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  accepted: { text: '已接单', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  on_the_way: { text: '上门中', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  in_service: { text: '服务中', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  pending_confirm: { text: '待确认', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  completed: { text: '已完成', className: 'bg-[#ECFDF5] text-[#16A34A]' },
  cancelled: { text: '已取消', className: 'bg-[#F3F4F6] text-[#6B7280]' },
  refund_pending: { text: '退款中', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  refunded: { text: '已退款', className: 'bg-[#F3F4F6] text-[#6B7280]' },
  after_sales: { text: '售后中', className: 'bg-[#FEF2F2] text-[#EF4444]' },
}

const config = computed(() => statusMap[props.status])
const sizeClass = computed(() => props.size === 'sm' ? 'text-[22rpx] px-2 py-1' : 'text-[24rpx] px-3 py-1')
</script>

<template>
  <text class="rounded-full font-500" :class="[config.className, sizeClass]">
    {{ config.text }}
  </text>
</template>
