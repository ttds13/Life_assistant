<script lang="ts" setup>
import type { Service } from '@/api/types/services'
import { getServices } from '@/api/services'

definePage({
  style: {
    navigationBarTitleText: '服务列表',
  },
})

const categoryId = ref<number | undefined>()
const categoryName = ref('服务列表')
const memberCardId = ref<number | undefined>()
const memberCardName = ref('')
const cardType = ref<'none' | 'time' | 'times' | 'consultation' | undefined>()
const serviceCodes = ref('')
const source = ref('')
const promotionKey = ref('')
const campaignId = ref('')
const services = ref<Service[]>([])
const loading = ref(true)
const isError = ref(false)
const page = ref(1)
const pageSize = 30

function normalizeServiceList(data: any): Service[] {
  if (Array.isArray(data))
    return data

  return data?.items || data?.list || data?.records || []
}

function formatPrice(price?: number) {
  if (price === undefined || price === null)
    return '--'
  return price % 1 === 0 ? price.toString() : price.toFixed(2)
}

function serviceDetailUrl(service: Service) {
  const query = [
    service.code
      ? `code=${encodeURIComponent(service.code)}`
      : `id=${encodeURIComponent(String(service.id))}`,
    memberCardId.value ? `memberCardId=${encodeURIComponent(String(memberCardId.value))}` : '',
    memberCardName.value ? `memberCardName=${encodeURIComponent(memberCardName.value)}` : '',
    source.value ? `source=${encodeURIComponent(source.value)}` : '',
    promotionKey.value ? `promotionKey=${encodeURIComponent(promotionKey.value)}` : '',
    campaignId.value ? `campaignId=${encodeURIComponent(campaignId.value)}` : '',
  ].filter(Boolean).join('&')
  return `/pages/service/detail?${query}`
}

function onServiceTap(service: Service) {
  uni.navigateTo({ url: serviceDetailUrl(service) })
}

async function loadServices() {
  loading.value = true
  isError.value = false

  try {
    const result = await getServices({
      categoryId: categoryId.value,
      cardType: cardType.value,
      serviceCodes: serviceCodes.value || undefined,
      page: page.value,
      pageSize,
    })
    services.value = normalizeServiceList(result)
  }
  catch (err) {
    console.error('服务列表加载失败:', err)
    isError.value = true
    services.value = []
  }
  finally {
    loading.value = false
  }
}

onLoad((query) => {
  const id = Number(query?.categoryId)
  categoryId.value = Number.isInteger(id) && id > 0 ? id : undefined
  categoryName.value = typeof query?.categoryName === 'string'
    ? decodeURIComponent(query.categoryName)
    : '服务列表'
  const cardId = Number(query?.memberCardId)
  memberCardId.value = Number.isInteger(cardId) && cardId > 0 ? cardId : undefined
  memberCardName.value = typeof query?.cardName === 'string' ? decodeURIComponent(query.cardName) : ''
  if (memberCardName.value && !query?.categoryName)
    categoryName.value = `${memberCardName.value}可预约服务`
  cardType.value = ['none', 'time', 'times', 'consultation'].includes(String(query?.cardType))
    ? String(query?.cardType) as any
    : undefined
  serviceCodes.value = typeof query?.serviceCodes === 'string' ? decodeURIComponent(query.serviceCodes) : ''
  source.value = typeof query?.source === 'string' ? decodeURIComponent(query.source) : ''
  promotionKey.value = typeof query?.promotionKey === 'string' ? decodeURIComponent(query.promotionKey) : ''
  campaignId.value = typeof query?.campaignId === 'string' ? decodeURIComponent(query.campaignId) : ''
  void loadServices()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[32rpx]">
    <view class="bg-white px-[28rpx] py-[28rpx]">
      <text class="block text-[40rpx] leading-[52rpx] font-700 text-gray-900">
        {{ categoryName }}
      </text>
      <text class="block mt-[8rpx] text-[26rpx] leading-[38rpx] text-gray-500">
        选择具体服务商品，进入详情后可预约下单。
      </text>
    </view>

    <loading-state :loading="loading">
      <empty-state
        v-if="isError"
        type="error"
        title="加载失败"
        description="请检查网络后重试"
        show-retry
        @retry="loadServices"
      />

      <view v-else-if="services.length" class="px-[24rpx] pt-[20rpx]">
        <view
          v-for="item in services"
          :key="item.code || item.id"
          class="mb-[20rpx] rounded-[16rpx] bg-white overflow-hidden"
          @tap="onServiceTap(item)"
        >
          <view class="flex p-[24rpx]">
            <view class="w-[180rpx] h-[150rpx] rounded-[12rpx] bg-[#EAF3FF] overflow-hidden flex items-center justify-center shrink-0">
              <image
                v-if="item.coverImage"
                :src="item.coverImageDisplayUrl || item.coverImage"
                class="w-full h-full"
                mode="aspectFill"
              />
              <text v-else class="i-carbon-clean text-[56rpx] text-[#FF373D]" />
            </view>

            <view class="flex-1 min-w-0 ml-[20rpx]">
              <text class="block text-[30rpx] leading-[40rpx] font-600 text-gray-900 truncate">
                {{ item.name }}
              </text>
              <text class="block mt-[8rpx] text-[24rpx] leading-[34rpx] text-gray-500 line-clamp-2">
                {{ item.description || '专业师傅上门服务' }}
              </text>
              <view class="mt-[16rpx] flex items-center">
                <text class="text-[34rpx] leading-[42rpx] font-700 text-[#FF373D]">
                  ￥{{ formatPrice(item.basePrice) }}
                </text>
                <text class="ml-[6rpx] text-[22rpx] text-gray-400">
                  / {{ item.priceUnit || '次' }}
                </text>
                <view class="ml-auto h-[48rpx] px-[18rpx] rounded-full bg-[#FFECEF] flex items-center justify-center">
                  <text class="text-[24rpx] text-[#FF373D] font-600">查看详情</text>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <empty-state
        v-else
        type="empty"
        title="暂无服务"
        description="该列表下暂无可选服务"
      />
    </loading-state>
  </view>
</template>
