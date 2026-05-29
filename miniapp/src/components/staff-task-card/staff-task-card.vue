<script lang="ts" setup>
import type { StaffTask, StaffTaskStatus } from '@/api/types/staff'

const props = defineProps<{
  task: StaffTask
}>()

const emit = defineEmits<{
  tap: [task: StaffTask]
  primary: [task: StaffTask]
  secondary: [task: StaffTask]
}>()

const actionConfig = computed(() => {
  const map: Record<StaffTaskStatus, { primary: string, secondary: string }> = {
    pending_accept: { primary: '接单', secondary: '拒单' },
    accepted: { primary: '上门打卡', secondary: '' },
    on_the_way: { primary: '开始服务', secondary: '' },
    in_service: { primary: '完成服务', secondary: '上传照片' },
    pending_confirm: { primary: '查看详情', secondary: '' },
    completed: { primary: '查看详情', secondary: '' },
    rejected: { primary: '查看详情', secondary: '' },
    cancelled: { primary: '查看详情', secondary: '' },
  }
  return map[props.task.status]
})
</script>

<template>
  <view class="bg-white rounded-[24rpx] mx-[24rpx] mt-[18rpx] p-[28rpx]" @tap="emit('tap', task)">
    <view class="flex items-start justify-between">
      <view class="min-w-0 flex-1 pr-3">
        <text class="block truncate text-[32rpx] leading-[42rpx] text-[#1F2937] font-700">
          {{ task.serviceName }}
        </text>
        <text v-if="task.serviceSpec" class="block mt-[6rpx] truncate text-[24rpx] text-[#6B7280]">
          {{ task.serviceSpec }}
        </text>
      </view>
      <staff-status-tag :status="task.status" size="sm" />
    </view>

    <view class="mt-[22rpx] rounded-[18rpx] bg-[#F9FAFB] p-[20rpx]">
      <view class="flex items-start">
        <text class="i-carbon-time mt-[4rpx] text-[28rpx] text-[#FF373D] mr-[12rpx]" />
        <text class="flex-1 text-[28rpx] leading-[38rpx] text-[#1F2937] font-600">{{ task.appointmentTime }}</text>
      </view>
      <view class="flex items-start mt-[14rpx]">
        <text class="i-carbon-location mt-[4rpx] text-[28rpx] text-[#9CA3AF] mr-[12rpx]" />
        <text class="flex-1 text-[26rpx] leading-[38rpx] text-[#4B5563]">{{ task.addressText }}</text>
      </view>
      <view v-if="task.remark" class="flex items-start mt-[14rpx]">
        <text class="i-carbon-chat mt-[4rpx] text-[28rpx] text-[#9CA3AF] mr-[12rpx]" />
        <text class="flex-1 text-[24rpx] leading-[34rpx] text-[#6B7280]">{{ task.remark }}</text>
      </view>
    </view>

    <view class="mt-[22rpx] flex items-center justify-between">
      <view class="flex items-center min-w-0">
        <text class="i-carbon-location-current text-[28rpx] text-[#1677FF] mr-[8rpx]" />
        <text class="text-[24rpx] text-[#6B7280] truncate">{{ task.distanceText || '距离待定位' }}</text>
        <text v-if="task.incomeAmount !== undefined" class="ml-[16rpx] text-[24rpx] text-[#EF4444]">预计 ¥{{ task.incomeAmount }}</text>
      </view>

      <view class="flex items-center gap-[12rpx]" @tap.stop>
        <button
          v-if="actionConfig.secondary"
          class="h-[60rpx] px-[22rpx] rounded-full bg-white border border-[#E5E7EB] text-[24rpx] text-[#6B7280] flex items-center justify-center"
          @tap="emit('secondary', task)"
        >
          {{ actionConfig.secondary }}
        </button>
        <button
          class="h-[60rpx] px-[26rpx] rounded-full bg-[#FF373D] text-white text-[24rpx] flex items-center justify-center"
          @tap="emit('primary', task)"
        >
          {{ actionConfig.primary }}
        </button>
      </view>
    </view>
  </view>
</template>

