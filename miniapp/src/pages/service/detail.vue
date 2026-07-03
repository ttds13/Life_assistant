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
const memberCardId = ref<number | undefined>()
const memberCardName = ref('')
const source = ref('')
const promotionKey = ref('')
const campaignId = ref('')

onLoad(async (query) => {
  const code = typeof query?.code === 'string' ? decodeURIComponent(query.code) : ''
  const id = Number(query?.id)
  const cardId = Number(query?.memberCardId)
  memberCardId.value = Number.isInteger(cardId) && cardId > 0 ? cardId : undefined
  memberCardName.value = typeof query?.memberCardName === 'string' ? decodeURIComponent(query.memberCardName) : ''
  source.value = typeof query?.source === 'string' ? decodeURIComponent(query.source) : ''
  promotionKey.value = typeof query?.promotionKey === 'string' ? decodeURIComponent(query.promotionKey) : ''
  campaignId.value = typeof query?.campaignId === 'string' ? decodeURIComponent(query.campaignId) : ''
  const identifier = code || (Number.isInteger(id) && id > 0 ? id : '')
  if (identifier) {
    getServiceDetail(identifier)
      .then((res) => { service.value = res })
      .catch(() => {})
      .finally(() => { loading.value = false })
  }
  else {
    loading.value = false
  }
})

function onBook() {
  if (!service.value)
    return

  const params = [
    service.value.code ? `serviceCode=${encodeURIComponent(service.value.code)}` : '',
    `serviceId=${service.value.id}`,
    `serviceName=${encodeURIComponent(service.value.name)}`,
    memberCardId.value ? `memberCardId=${encodeURIComponent(String(memberCardId.value))}` : '',
    memberCardName.value ? `memberCardName=${encodeURIComponent(memberCardName.value)}` : '',
    source.value ? `source=${encodeURIComponent(source.value)}` : '',
    promotionKey.value ? `promotionKey=${encodeURIComponent(promotionKey.value)}` : '',
    campaignId.value ? `campaignId=${encodeURIComponent(campaignId.value)}` : '',
  ].filter(Boolean).join('&')
  const bookingQuery = `/pages/order/create?${params}`

  if (!tokenStore.hasLogin) {
    uni.navigateTo({ url: `/pages/login/index?redirect=${encodeURIComponent(bookingQuery)}` })
    return
  }

  uni.navigateTo({ url: bookingQuery })
}

function onSkipBook() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
    return
  }

  if (memberCardId.value) {
    uni.redirectTo({ url: '/pages/card/index' })
    return
  }

  uni.switchTab({ url: '/pages/home/index' })
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
            请以服务项目说明和下单页展示的信息为准。
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
            下单前请确认服务地址、预约时间和服务项目。订单提交后可在订单详情中查看进度。
          </text>
        </form-section>

        <form-section title="用户评价">
          <view class="rounded-[12rpx] bg-[#F9FAFB] p-3">
            <text class="text-[26rpx] text-gray-500">暂无评价</text>
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
      secondary-text="暂不预约"
      @primary="onBook"
      @secondary="onSkipBook"
    />
  </view>
</template>
