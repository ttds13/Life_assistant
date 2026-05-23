<script lang="ts" setup>
import type { Service } from '@/api/types/services'
import { getServiceDetail } from '@/api/services'
import { useTokenStore } from '@/store/token'

definePage({
  style: {
    navigationBarTitleText: '服务详情',
  },
})

const tokenStore = useTokenStore()
const service = ref<Service | null>(null)
const loading = ref(true)

onLoad((query) => {
  const id = Number(query?.id)
  if (id) {
    getServiceDetail(id)
      .then((res) => { service.value = res })
      .catch(() => {})
      .finally(() => { loading.value = false })
  }
  else {
    loading.value = false
  }
})

function onBook() {
  if (!tokenStore.hasLogin) {
    uni.navigateTo({ url: `/pages/login/index?redirect=${encodeURIComponent(`/pages/order/create?serviceId=${service.value?.id || ''}`)}` })
    return
  }
  if (!service.value)
    return
  uni.navigateTo({ url: `/pages/order/create?serviceId=${service.value.id}` })
}
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA]">
    <loading-state :loading="loading">
      <view v-if="service" class="pb-[120rpx]">
        <!-- 封面图 -->
        <view class="w-full h-[400rpx] bg-[#EAF3FF] flex items-center justify-center">
          <image v-if="service.coverImage" :src="service.coverImage" class="w-full h-full" mode="aspectFill" />
          <text v-else class="text-[80rpx]">🧹</text>
        </view>

        <!-- 服务信息 -->
        <view class="bg-white mx-4 mt-[-40rpx] relative rounded-[16rpx] p-4">
          <text class="text-[34rpx] font-600 text-gray-800 block">{{ service.name }}</text>
          <text class="text-[26rpx] text-gray-500 block mt-2">{{ service.description }}</text>
          <view class="mt-3">
            <price-text :price="service.basePrice" :unit="service.priceUnit || '次'" size="lg" />
          </view>
        </view>

        <form-section title="服务范围">
          <text class="text-[28rpx] text-gray-700 leading-[42rpx]">
            服务范围待补充。当前可先按服务项目说明展示，后续由后台配置具体服务边界、不可服务内容和加价规则。
          </text>
        </form-section>

        <form-section title="服务流程">
          <view
            v-for="(item, index) in ['提交预约', '平台确认', '师傅上门', '完成服务']"
            :key="item"
            class="flex items-center py-2"
          >
            <view class="w-[44rpx] h-[44rpx] rounded-full bg-[#EAF3FF] flex items-center justify-center mr-3">
              <text class="text-[24rpx] text-[#1677FF] font-600">{{ index + 1 }}</text>
            </view>
            <text class="text-[28rpx] text-gray-700">{{ item }}</text>
          </view>
        </form-section>

        <form-section title="服务须知">
          <text class="text-[28rpx] text-gray-700 leading-[42rpx]">
            服务须知待补充。后续可补充预约改期、取消规则、上门准备事项和售后说明。
          </text>
        </form-section>

        <form-section title="用户评价" subtitle="后续接入">
          <view class="rounded-[12rpx] bg-[#F9FAFB] p-3">
            <text class="text-[26rpx] text-gray-500">评价摘要待接入，当前先保留入口。</text>
          </view>
        </form-section>
      </view>

      <empty-state v-else type="empty" title="服务不存在" />
    </loading-state>

    <!-- 底部按钮 -->
    <bottom-action-bar
      v-if="service"
      :price="service.basePrice"
      price-label="起步价"
      primary-text="立即预约"
      @primary="onBook"
    />
  </view>
</template>
