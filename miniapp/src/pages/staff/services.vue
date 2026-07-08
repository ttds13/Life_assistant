<script lang="ts" setup>
import { getStaffProfile } from '@/api/staff'
import type { StaffProfile } from '@/api/types/staff'

definePage({
  style: {
    navigationBarTitleText: '我的服务',
    navigationBarBackgroundColor: '#F5F7FA',
    navigationBarTextStyle: 'black',
  },
})

const loading = ref(false)
const profile = ref<StaffProfile | null>(null)

const supportTypes = [
  { title: '后台分配订单', desc: '平台后台派单后，师傅端进行接单、出发、开始服务、上传照片和完成服务。' },
  { title: '会员卡预约订单', desc: '支持 5 次卡、10 次卡和 2 小时卡履约，按订单要求选择实际服务时长。' },
  { title: '普通预约订单', desc: '现金支付或咨询预约订单按订单详情中的服务、地址和备注执行。' },
]

const limits = [
  '第一版不开放抢单池，师傅只能处理后台分配给自己的订单。',
  '第一版不支持师傅主动开单或自行改价。',
  '服务区域仅作为后台派单参考，不做自动距离匹配。',
]

async function loadProfile() {
  loading.value = true
  try {
    profile.value = await getStaffProfile()
  }
  finally {
    loading.value = false
  }
}

function goRules() {
  uni.navigateTo({ url: '/pages/staff/service-rules' })
}

onShow(() => {
  void loadProfile()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[60rpx] pt-1">
    <loading-state :loading="loading">
      <view class="mx-4 mt-3 rounded-[16rpx] bg-white p-4">
        <view class="flex items-center">
          <view class="w-[88rpx] h-[88rpx] rounded-full bg-[#EAF3FF] flex items-center justify-center">
            <text class="i-carbon-user-role text-[48rpx] text-[#1677FF]" />
          </view>
          <view class="ml-3 min-w-0 flex-1">
            <text class="block truncate text-[34rpx] text-[#1F2937] font-700">{{ profile?.staffName || '师傅' }}</text>
            <text class="block mt-1 text-[24rpx] text-[#6B7280]">{{ profile?.regionText || '服务城市待完善' }}</text>
          </view>
        </view>
        <view class="mt-4 grid grid-cols-3 gap-2">
          <view class="rounded-[12rpx] bg-[#F8FAFC] p-3">
            <text class="block text-[24rpx] text-[#6B7280]">认证状态</text>
            <text class="block mt-2 text-[28rpx] text-[#16A34A] font-700">{{ profile?.verified ? '已认证' : '待认证' }}</text>
          </view>
          <view class="rounded-[12rpx] bg-[#F8FAFC] p-3">
            <text class="block text-[24rpx] text-[#6B7280]">完成订单</text>
            <text class="block mt-2 text-[28rpx] text-[#1F2937] font-700">{{ profile?.stats?.total?.completedOrderCount || 0 }}</text>
          </view>
          <view class="rounded-[12rpx] bg-[#F8FAFC] p-3">
            <text class="block text-[24rpx] text-[#6B7280]">评分</text>
            <text class="block mt-2 text-[28rpx] text-[#1F2937] font-700">{{ profile?.rating || '5.0' }}</text>
          </view>
        </view>
      </view>

      <form-section title="可处理订单">
        <view v-for="item in supportTypes" :key="item.title" class="py-3 border-b border-[#F3F4F6] last:border-b-0">
          <text class="block text-[30rpx] text-[#1F2937] font-600">{{ item.title }}</text>
          <text class="block mt-1 text-[26rpx] leading-[40rpx] text-[#6B7280]">{{ item.desc }}</text>
        </view>
      </form-section>

      <form-section title="第一版边界">
        <view v-for="item in limits" :key="item" class="flex py-2">
          <text class="i-carbon-checkmark-outline mt-[4rpx] mr-2 text-[32rpx] text-[#1677FF]" />
          <text class="flex-1 text-[26rpx] leading-[40rpx] text-[#4B5563]">{{ item }}</text>
        </view>
      </form-section>

      <view class="mx-4 mt-3 rounded-[16rpx] bg-white p-4">
        <button class="h-[80rpx] rounded-[18rpx] bg-[#1677FF] text-white text-[28rpx]" @tap="goRules">
          查看服务规则
        </button>
      </view>
    </loading-state>
  </view>
</template>
