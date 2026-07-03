<script lang="ts" setup>
import type { StaffTaskStatus } from '@/api/types/staff'

const props = withDefaults(defineProps<{
  status: StaffTaskStatus
  size?: 'sm' | 'md'
}>(), {
  size: 'md',
})

const statusMap: Record<StaffTaskStatus, { text: string, className: string }> = {
  pending_accept: { text: '待接单', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  accepted: { text: '已接单', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  on_the_way: { text: '上门中', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  in_service: { text: '服务中', className: 'bg-[#EAF3FF] text-[#1677FF]' },
  pending_confirm: { text: '待确认', className: 'bg-[#FFF7ED] text-[#F59E0B]' },
  completed: { text: '已完成', className: 'bg-[#ECFDF5] text-[#16A34A]' },
  rejected: { text: '已拒单', className: 'bg-[#F3F4F6] text-[#6B7280]' },
  cancelled: { text: '已取消', className: 'bg-[#F3F4F6] text-[#6B7280]' },
}

const config = computed(() => statusMap[props.status])
const sizeClass = computed(() => props.size === 'sm' ? 'text-[22rpx] px-2 py-1' : 'text-[24rpx] px-3 py-1')
</script>

<template>
  <text class="rounded-full font-500" :class="[config.className, sizeClass]">
    {{ config.text }}
  </text>
</template>
