<script lang="ts" setup>
import type { Service, ServiceCategory } from '@/api/types/services'
import { getServiceCategories, getServices } from '@/api/services'

definePage({
  type: 'home',
  style: {
    navigationStyle: 'custom',
    navigationBarTitleText: '生活助手',
  },
})

const categories = ref<ServiceCategory[]>([])
const recommendedServices = ref<Service[]>([])
const loading = ref(true)
const isError = ref(false)

const heroService = computed(() => recommendedServices.value[0])
const hotCategories = computed(() => categories.value.filter(item => item.status !== 0))
const isEmpty = computed(() => !loading.value && !isError.value && hotCategories.value.length === 0)

const categoryIconClassMap: Record<string, string> = {
  'i-carbon-clean': 'i-carbon-clean',
  'i-carbon-tools': 'i-carbon-tools',
  'i-carbon-store': 'i-carbon-store',
  'i-carbon-home': 'i-carbon-home',
  'i-carbon-security': 'i-carbon-security',
  'i-carbon-delivery': 'i-carbon-delivery',
  'i-carbon-user-avatar': 'i-carbon-user-avatar',
  'i-carbon-pet-image-b': 'i-carbon-pet-image-b',
}

function normalizeServiceList(data: any): Service[] {
  if (Array.isArray(data))
    return data

  return data?.items || data?.list || data?.records || []
}

function formatPrice(price?: number) {
  if (price === undefined || price === null)
    return '50'
  return price % 1 === 0 ? price.toString() : price.toFixed(2)
}

async function loadData() {
  loading.value = true
  isError.value = false

  try {
    const cateRes = await getServiceCategories()
    categories.value = cateRes

    try {
      const serviceRes = await getServices({ page: 1, pageSize: 1 })
      recommendedServices.value = normalizeServiceList(serviceRes).slice(0, 1)
    }
    catch (err) {
      console.warn('首页推荐服务加载失败:', err)
      recommendedServices.value = []
    }
  }
  catch (err) {
    console.error('首页数据加载失败:', err)
    isError.value = true
  }
  finally {
    loading.value = false
  }
}

function onAddressTap() {
  uni.showToast({ icon: 'none', title: '定位功能待完善' })
}

function onSearchTap() {
  uni.navigateTo({ url: '/pages/service/search' })
}

function onCartTap() {
  uni.showToast({ icon: 'none', title: '购物车功能待完善' })
}

function onBannerTap() {
  if (heroService.value) {
    uni.navigateTo({ url: `/pages/service/detail?id=${heroService.value.id}` })
    return
  }

  onSearchTap()
}

function onCategoryTap(category: ServiceCategory) {
  uni.navigateTo({
    url: `/pages/service/search?categoryId=${category.id}&categoryName=${encodeURIComponent(category.name)}`,
  })
}

function categoryIconClass(category: ServiceCategory) {
  return categoryIconClassMap[category.icon] || 'i-carbon-grid'
}

function categoryHint(category: ServiceCategory) {
  return `查看${category.name}相关服务`
}

onLoad(() => {
  loadData()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[120rpx]">
    <view class="bg-[#FF373D] pt-safe px-4 pb-4">
      <view class="pt-3 flex items-center min-w-0" @tap="onAddressTap">
        <text class="i-carbon-location text-[34rpx] text-white mr-2 shrink-0" />
        <text class="text-[28rpx] leading-[40rpx] text-white flex-1 truncate">
          请选择服务地址
        </text>
        <text class="i-carbon-chevron-down text-[30rpx] text-white ml-2 shrink-0" />
      </view>

      <view class="mt-3 flex items-center gap-3">
        <view class="flex-1 h-[76rpx] bg-white rounded-full flex items-center px-4" @tap="onSearchTap">
          <text class="i-carbon-search text-[34rpx] text-[#9CA3AF] mr-2 shrink-0" />
          <text class="text-[28rpx] text-[#9CA3AF]">
            关键词搜索服务
          </text>
        </view>
        <view class="w-[76rpx] h-[76rpx] rounded-full bg-white bg-opacity-25 flex items-center justify-center" @tap="onCartTap">
          <text class="i-carbon-shopping-cart text-[46rpx] text-white" />
        </view>
      </view>
    </view>

    <loading-state :loading="loading">
      <empty-state
        v-if="isError"
        type="error"
        title="加载失败"
        description="请检查网络后重试"
        show-retry
        @retry="loadData"
      />

      <empty-state
        v-else-if="isEmpty"
        type="empty"
        title="暂无服务"
        description="服务即将上线"
      />

      <view v-else class="pb-4">
        <view class="bg-white px-4 pt-4 pb-3">
          <view class="rounded-[18rpx] bg-[#F7FBFF] min-h-[250rpx] px-5 py-5 flex items-center overflow-hidden" @tap="onBannerTap">
            <view class="flex-1 min-w-0">
              <text class="block text-[38rpx] leading-[50rpx] font-600 text-gray-900 truncate">
                {{ heroService?.name || '日常保洁服务' }}
              </text>
              <view class="mt-3 flex items-baseline">
                <text class="text-[48rpx] leading-[58rpx] text-[#FF373D] font-700">
                  {{ formatPrice(heroService?.basePrice) }}
                </text>
                <text class="text-[26rpx] text-gray-500 ml-2">
                  元 / {{ heroService?.priceUnit || '小时' }}
                </text>
              </view>
              <text class="block mt-1 text-[26rpx] leading-[36rpx] text-gray-400">
                {{ heroService?.description || '3小时起约，专业师傅上门服务' }}
              </text>
              <view class="mt-4 h-[58rpx] px-4 rounded-full bg-[#FF373D] inline-flex items-center justify-center">
                <text class="text-[26rpx] text-white font-600">
                  立即预约
                </text>
              </view>
            </view>
            <view class="w-[190rpx] h-[180rpx] rounded-[18rpx] bg-[#EAF3FF] ml-4 flex items-center justify-center shrink-0">
              <image
                v-if="heroService?.coverImage"
                :src="heroService.coverImage"
                class="w-full h-full rounded-[18rpx]"
                mode="aspectFill"
              />
              <text v-else class="i-carbon-clean text-[80rpx] text-[#FF373D]" />
            </view>
          </view>

          <view class="grid grid-cols-4 gap-2 pt-3">
            <view class="flex items-center justify-center">
              <text class="i-carbon-checkmark-outline text-[28rpx] text-[#FF373D] mr-1" />
              <text class="text-[22rpx] text-[#B54755]">不满意重做</text>
            </view>
            <view class="flex items-center justify-center">
              <text class="i-carbon-time text-[28rpx] text-[#FF373D] mr-1" />
              <text class="text-[22rpx] text-[#B54755]">过期退</text>
            </view>
            <view class="flex items-center justify-center">
              <text class="i-carbon-checkmark-outline text-[28rpx] text-[#FF373D] mr-1" />
              <text class="text-[22rpx] text-[#B54755]">随时退</text>
            </view>
            <view class="flex items-center justify-center">
              <text class="i-carbon-security text-[28rpx] text-[#FF373D] mr-1" />
              <text class="text-[22rpx] text-[#B54755]">全场保障</text>
            </view>
          </view>
        </view>

        <view v-if="hotCategories.length" class="mt-3 px-4">
          <view class="flex items-center justify-between">
            <text class="text-[34rpx] leading-[46rpx] font-600 text-gray-900">
              热门服务
            </text>
            <text class="text-[24rpx] text-gray-400">
              选择类目查看服务
            </text>
          </view>

          <view class="grid grid-cols-2 gap-3 mt-3">
            <view
              v-for="item in hotCategories"
              :key="item.id"
              class="bg-white rounded-[16rpx] overflow-hidden"
              @tap="onCategoryTap(item)"
            >
              <view class="w-full h-[168rpx] bg-[#EAF3FF] flex items-center justify-center">
                <text :class="categoryIconClass(item)" class="text-[64rpx] text-[#FF373D]" />
              </view>
              <view class="p-3">
                <text class="block text-[28rpx] leading-[38rpx] font-600 text-gray-800 truncate">
                  {{ item.name }}
                </text>
                <text class="block mt-1 text-[24rpx] leading-[32rpx] text-gray-400 truncate">
                  {{ categoryHint(item) }}
                </text>
                <view class="mt-3 flex items-center">
                  <text class="text-[24rpx] text-[#FF373D] font-600">
                    查看服务
                  </text>
                  <text class="i-carbon-chevron-right text-[24rpx] text-[#FF373D] ml-1" />
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>
    </loading-state>
  </view>
</template>
