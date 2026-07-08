<script lang="ts" setup>
definePage({
  style: {
    navigationBarTitleText: '关于我们',
    navigationBarBackgroundColor: '#F5F7FA',
    navigationBarTextStyle: 'black',
  },
})

function goContact() {
  uni.navigateTo({ url: '/pages/staff/contact-service' })
}

function goRules() {
  uni.navigateTo({ url: '/pages/staff/service-rules' })
}
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[60rpx] pt-1">
    <view class="mx-4 mt-3 rounded-[16rpx] bg-white p-5 text-center">
      <view class="mx-auto w-[112rpx] h-[112rpx] rounded-[24rpx] bg-[#FF373D] flex items-center justify-center">
        <text class="i-carbon-home text-[64rpx] text-white" />
      </view>
      <text class="block mt-4 text-[36rpx] text-[#1F2937] font-800">生活助手师傅端</text>
      <text class="block mt-2 text-[26rpx] text-[#6B7280]">v1.0.0</text>
    </view>

    <form-section title="当前版本能力">
      <view class="flex py-2">
        <text class="i-carbon-checkmark-outline mt-[4rpx] mr-2 text-[32rpx] text-[#1677FF]" />
        <text class="flex-1 text-[26rpx] leading-[42rpx] text-[#4B5563]">处理后台分配的预约订单和会员卡订单。</text>
      </view>
      <view class="flex py-2">
        <text class="i-carbon-checkmark-outline mt-[4rpx] mr-2 text-[32rpx] text-[#1677FF]" />
        <text class="flex-1 text-[26rpx] leading-[42rpx] text-[#4B5563]">支持接单、出发、开始服务、上传照片和完成服务。</text>
      </view>
      <view class="flex py-2">
        <text class="i-carbon-checkmark-outline mt-[4rpx] mr-2 text-[32rpx] text-[#1677FF]" />
        <text class="flex-1 text-[26rpx] leading-[42rpx] text-[#4B5563]">支持资料认证、证件查看、工作状态和通知偏好。</text>
      </view>
    </form-section>

    <view class="mx-4 mt-3 rounded-[16rpx] bg-white overflow-hidden">
      <view class="px-4 py-4 flex items-center justify-between border-b border-[#F3F4F6]" @tap="goRules">
        <text class="text-[30rpx] text-[#1F2937]">服务规则</text>
        <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
      </view>
      <view class="px-4 py-4 flex items-center justify-between" @tap="goContact">
        <text class="text-[30rpx] text-[#1F2937]">联系客服</text>
        <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
      </view>
    </view>
  </view>
</template>
