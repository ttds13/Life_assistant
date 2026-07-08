<script lang="ts" setup>
import { getSupportConfig } from '@/api/support'
import { supportConfig as defaultSupportConfig } from '@/constants/support'

definePage({
  style: {
    navigationBarTitleText: '联系客服',
    navigationBarBackgroundColor: '#F5F7FA',
    navigationBarTextStyle: 'black',
  },
})

const supportConfig = ref({ ...defaultSupportConfig, onlineEnabled: true })

async function loadConfig() {
  try {
    supportConfig.value = { ...supportConfig.value, ...(await getSupportConfig()) }
  }
  catch {
    supportConfig.value = { ...defaultSupportConfig, onlineEnabled: true }
  }
}

function callService() {
  uni.makePhoneCall({
    phoneNumber: supportConfig.value.phone,
    fail: (err) => {
      if (!String(err?.errMsg || '').includes('cancel'))
        uni.showToast({ icon: 'none', title: '拨号失败' })
    },
  })
}

function copyConsultContact() {
  uni.setClipboardData({
    data: supportConfig.value.wechatId,
    success: () => uni.showToast({ icon: 'success', title: '已复制' }),
  })
}

function goRules() {
  uni.navigateTo({ url: '/pages/staff/service-rules' })
}

function goFeedback() {
  uni.navigateTo({ url: '/pages/profile/feedback' })
}

onLoad(() => {
  void loadConfig()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[60rpx] pt-1">
    <view class="mx-4 mt-3 rounded-[16rpx] bg-white p-5">
      <view class="w-[96rpx] h-[96rpx] rounded-full bg-[#EAF3FF] flex items-center justify-center">
        <text class="i-carbon-headset text-[56rpx] text-[#1677FF]" />
      </view>
      <text class="block mt-4 text-[36rpx] text-[#1F2937] font-700">师傅服务支持</text>
      <text class="block mt-2 text-[26rpx] leading-[40rpx] text-[#6B7280]">
        服务时间 {{ supportConfig.serviceHours }}，{{ supportConfig.responseTime }}。
      </text>
    </view>

    <view class="mx-4 mt-3 rounded-[16rpx] bg-white overflow-hidden">
      <view class="px-4 py-4 flex items-center justify-between border-b border-[#F3F4F6]" @tap="callService">
        <view>
          <text class="block text-[30rpx] text-[#1F2937] font-600">客服电话</text>
          <text class="block mt-1 text-[26rpx] text-[#6B7280]">{{ supportConfig.phone }}</text>
        </view>
        <text class="i-carbon-phone text-[40rpx] text-[#1677FF]" />
      </view>
      <view class="px-4 py-4 flex items-center justify-between" @tap="copyConsultContact">
        <view>
          <text class="block text-[30rpx] text-[#1F2937] font-600">服务咨询</text>
          <text class="block mt-1 text-[26rpx] text-[#6B7280]">{{ supportConfig.wechatId }}</text>
        </view>
        <text class="i-carbon-copy text-[40rpx] text-[#1677FF]" />
      </view>
    </view>

    <view class="mx-4 mt-3 rounded-[16rpx] bg-white p-4">
      <text class="block text-[30rpx] text-[#1F2937] font-600">常见处理场景</text>
      <text class="block mt-2 text-[26rpx] leading-[42rpx] text-[#6B7280]">
        订单异常、无法联系客户、照片上传失败、服务时长争议和地址不明确时，请优先联系平台客服。
      </text>
      <button class="mt-4 h-[80rpx] rounded-[18rpx] bg-[#1677FF] text-white text-[28rpx]" @tap="callService">
        拨打电话
      </button>
      <button class="mt-3 h-[80rpx] rounded-[18rpx] bg-[#F3F4F6] text-[#4B5563] text-[28rpx]" @tap="copyConsultContact">
        复制服务咨询
      </button>
    </view>

    <view class="mx-4 mt-3 rounded-[16rpx] bg-white overflow-hidden">
      <view class="px-4 py-4 flex items-center justify-between border-b border-[#F3F4F6]" @tap="goRules">
        <text class="text-[30rpx] text-[#1F2937]">查看服务规则</text>
        <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
      </view>
      <view class="px-4 py-4 flex items-center justify-between" @tap="goFeedback">
        <text class="text-[30rpx] text-[#1F2937]">提交问题反馈</text>
        <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
      </view>
    </view>
  </view>
</template>
