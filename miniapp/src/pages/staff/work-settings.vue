<script lang="ts" setup>
import { getStaffWorkStatus, updateStaffWorkStatus } from '@/api/staff'
import type { StaffWorkStatusValue } from '@/api/types/staff'

definePage({
  style: {
    navigationBarTitleText: '接单设置',
    navigationBarBackgroundColor: '#F5F7FA',
    navigationBarTextStyle: 'black',
  },
})

const loading = ref(false)
const saving = ref(false)
const workStatus = ref<StaffWorkStatusValue>(0)

const statusText = computed(() => {
  if (workStatus.value === 1) return '在线'
  if (workStatus.value === 2) return '忙碌'
  return '离线'
})

async function loadStatus() {
  loading.value = true
  try {
    const data = await getStaffWorkStatus()
    workStatus.value = data.workStatus
  }
  finally {
    loading.value = false
  }
}

async function setStatus(value: StaffWorkStatusValue) {
  if (saving.value || value === workStatus.value)
    return
  saving.value = true
  try {
    const data = await updateStaffWorkStatus(value)
    workStatus.value = data.workStatus
    uni.showToast({ icon: 'success', title: '已更新' })
  }
  finally {
    saving.value = false
  }
}

function onOnlineChange(event: any) {
  void setStatus(event.detail.value ? 1 : 0)
}

onShow(() => {
  void loadStatus()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[60rpx] pt-1">
    <loading-state :loading="loading">
      <view class="mx-4 mt-3 rounded-[16rpx] bg-white p-4">
        <view class="flex items-center justify-between">
          <view>
            <text class="block text-[32rpx] text-[#1F2937] font-700">当前状态：{{ statusText }}</text>
            <text class="block mt-1 text-[24rpx] text-[#6B7280]">用于后台派单前筛选和确认</text>
          </view>
          <switch :checked="workStatus === 1" color="#1677FF" :disabled="saving" @change="onOnlineChange" />
        </view>
      </view>

      <form-section title="状态设置">
        <view class="grid grid-cols-3 gap-2">
          <view
            class="h-[88rpx] rounded-[16rpx] border flex items-center justify-center"
            :class="workStatus === 0 ? 'bg-[#F3F4F6] border-[#4B5563]' : 'bg-white border-[#E5E7EB]'"
            @tap="setStatus(0)"
          >
            <text class="text-[28rpx]" :class="workStatus === 0 ? 'text-[#1F2937] font-700' : 'text-[#6B7280]'">离线</text>
          </view>
          <view
            class="h-[88rpx] rounded-[16rpx] border flex items-center justify-center"
            :class="workStatus === 1 ? 'bg-[#EAF3FF] border-[#1677FF]' : 'bg-white border-[#E5E7EB]'"
            @tap="setStatus(1)"
          >
            <text class="text-[28rpx]" :class="workStatus === 1 ? 'text-[#1677FF] font-700' : 'text-[#6B7280]'">在线</text>
          </view>
          <view
            class="h-[88rpx] rounded-[16rpx] border flex items-center justify-center"
            :class="workStatus === 2 ? 'bg-[#FFF7ED] border-[#F59E0B]' : 'bg-white border-[#E5E7EB]'"
            @tap="setStatus(2)"
          >
            <text class="text-[28rpx]" :class="workStatus === 2 ? 'text-[#AD6800] font-700' : 'text-[#6B7280]'">忙碌</text>
          </view>
        </view>
      </form-section>

      <form-section title="规则说明">
        <text class="block text-[26rpx] leading-[42rpx] text-[#4B5563]">
          在线状态用于后台选择师傅时参考。离线后仍可查看已分配订单，已接订单需要继续履约。当前版本不支持复杂排班、服务半径和自动派单策略。
        </text>
      </form-section>
    </loading-state>
  </view>
</template>
