<script lang="ts" setup>
definePage({
  style: {
    navigationBarTitleText: '服务规则',
    navigationBarBackgroundColor: '#F5F7FA',
    navigationBarTextStyle: 'black',
  },
})

const sections = [
  {
    title: '接单规则',
    items: ['只处理后台分配订单。', '不开放抢单池。', '不支持师傅主动开单或自行改价。'],
  },
  {
    title: '履约流程',
    items: ['接单后按约定时间到达。', '出发、开始服务、完成服务需要在师傅端更新状态。', '完成前必须上传 1 到 6 张服务照片。'],
  },
  {
    title: '会员卡订单',
    items: ['2 小时卡默认冻结 120 分钟。', '实际服务 120 分钟扣 120 分钟。', '实际服务 60 分钟扣 60 分钟，并释放剩余 60 分钟。'],
  },
  {
    title: '异常处理',
    items: ['客户无法联系、地址不清或服务无法继续时，先联系客服或等待后台处理。', '不要线下收取额外费用。', '服务争议以订单记录、照片和后台审核为准。'],
  },
]
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[60rpx] pt-1">
    <view class="mx-4 mt-3 rounded-[16rpx] bg-white p-4">
      <text class="block text-[34rpx] text-[#1F2937] font-800">第一版师傅履约规则</text>
      <text class="block mt-2 text-[26rpx] leading-[42rpx] text-[#6B7280]">
        当前版本以后台人工派单和会员卡履约为主，复杂派单策略、提现和排班能力后续再接入。
      </text>
    </view>

    <form-section v-for="section in sections" :key="section.title" :title="section.title">
      <view v-for="item in section.items" :key="item" class="flex py-2">
        <text class="i-carbon-dot-mark mt-[8rpx] mr-2 text-[24rpx] text-[#1677FF]" />
        <text class="flex-1 text-[26rpx] leading-[42rpx] text-[#4B5563]">{{ item }}</text>
      </view>
    </form-section>
  </view>
</template>
