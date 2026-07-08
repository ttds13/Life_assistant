<script lang="ts" setup>
import { getMyStaffApplication } from '@/api/support'
import type { StaffApplication } from '@/api/types/support'

definePage({
  style: {
    navigationBarTitleText: '资料认证',
    navigationBarBackgroundColor: '#F5F7FA',
    navigationBarTextStyle: 'black',
  },
})

const loading = ref(false)
const application = ref<StaffApplication | null>(null)

const meta = computed(() => {
  const status = application.value?.status || 'none'
  const map: Record<string, { title: string, desc: string, icon: string, color: string }> = {
    approved: { title: '已完成认证', desc: '你的师傅账号已开通，可以处理后台分配订单。', icon: 'i-carbon-checkmark-filled', color: '#16A34A' },
    pending: { title: '资料审核中', desc: '资料已提交，请等待平台后台审核。', icon: 'i-carbon-time', color: '#F59E0B' },
    rejected: { title: '资料需补充', desc: '请根据后台审核意见补充证件或从业说明。', icon: 'i-carbon-warning-filled', color: '#EF4444' },
    none: { title: '未提交资料', desc: '提交身份信息、服务技能和资质照片后，后台会进行人工审核。', icon: 'i-carbon-certificate', color: '#1677FF' },
  }
  return map[status] || map.none
})

async function loadApplication() {
  loading.value = true
  try {
    application.value = await getMyStaffApplication()
  }
  finally {
    loading.value = false
  }
}

function goCertificates() {
  uni.navigateTo({ url: '/pages/staff/certificates' })
}

function goWorkbench() {
  uni.navigateTo({ url: '/pages/staff/home' })
}

onShow(() => {
  void loadApplication()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[60rpx] pt-1">
    <loading-state :loading="loading">
      <view class="mx-4 mt-3 rounded-[16rpx] bg-white p-5">
        <view class="w-[104rpx] h-[104rpx] rounded-full bg-[#F8FAFC] flex items-center justify-center">
          <text :class="meta.icon" class="text-[58rpx]" :style="{ color: meta.color }" />
        </view>
        <text class="block mt-4 text-[36rpx] text-[#1F2937] font-800">{{ meta.title }}</text>
        <text class="block mt-2 text-[26rpx] leading-[42rpx] text-[#6B7280]">{{ meta.desc }}</text>
        <text v-if="application?.updatedAt" class="block mt-2 text-[24rpx] text-[#9CA3AF]">更新时间：{{ application.updatedAt }}</text>
      </view>

      <form-section title="认证资料">
        <view class="flex justify-between py-2">
          <text class="text-[28rpx] text-[#6B7280]">姓名</text>
          <text class="text-[28rpx] text-[#1F2937]">{{ application?.name || '--' }}</text>
        </view>
        <view class="flex justify-between py-2">
          <text class="text-[28rpx] text-[#6B7280]">手机号</text>
          <text class="text-[28rpx] text-[#1F2937]">{{ application?.phone || '--' }}</text>
        </view>
        <view class="flex justify-between py-2">
          <text class="text-[28rpx] text-[#6B7280]">服务城市</text>
          <text class="text-[28rpx] text-[#1F2937]">{{ application?.cityCode || '--' }}</text>
        </view>
        <view class="flex justify-between py-2">
          <text class="text-[28rpx] text-[#6B7280]">材料数量</text>
          <text class="text-[28rpx] text-[#1F2937]">{{ application?.images?.length || 0 }} 张</text>
        </view>
      </form-section>

      <view class="mx-4 mt-3 rounded-[16rpx] bg-white p-4">
        <button class="h-[84rpx] rounded-[18rpx] bg-[#1677FF] text-white text-[30rpx]" @tap="goCertificates">
          {{ application?.status === 'approved' ? '查看证件资料' : '补充认证资料' }}
        </button>
        <button v-if="application?.status === 'approved'" class="mt-3 h-[84rpx] rounded-[18rpx] bg-[#F3F4F6] text-[#4B5563] text-[30rpx]" @tap="goWorkbench">
          返回工作台
        </button>
      </view>
    </loading-state>
  </view>
</template>
