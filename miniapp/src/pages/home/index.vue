<script lang="ts" setup>
import type { HomeBanner } from '@/api/types/home'
import type { Service, ServiceCategory } from '@/api/types/services'
import { getUserAddresses } from '@/api/address'
import { getHomeBanners } from '@/api/home'
import { getServiceCategories, getServices } from '@/api/services'
import { useTokenStore } from '@/store/token'
import { clearSelectedAddress, formatAddress, getSelectedAddress } from '@/utils/addressSelection'

definePage({
  type: 'home',
  style: {
    navigationStyle: 'custom',
    navigationBarTitleText: '生活助手',
  },
})

const fallbackAddress = '请选择服务地址'
const defaultAddress = ref(fallbackAddress)
const cartCount = ref(0)
const tokenStore = useTokenStore()

const recommendedServices = ref<Service[]>([])
const serviceCategories = ref<ServiceCategory[]>([])
const homeBanners = ref<HomeBanner[]>([])
const loading = ref(true)
const isError = ref(false)

const hotServices = computed(() => recommendedServices.value.filter(item => item.status !== 0))
const directServices = computed(() => hotServices.value.slice(0, 6))
const serviceListEntries = computed(() => serviceCategories.value.filter(item => item.status !== 0))
const isEmpty = computed(() => !loading.value && !isError.value && hotServices.value.length === 0 && serviceListEntries.value.length === 0)

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
    const [serviceRes, categoryRes, bannerRes] = await Promise.all([
      getServices({ page: 1, pageSize: 6 }),
      getServiceCategories(),
      getHomeBanners().catch(() => []),
    ])
    recommendedServices.value = normalizeServiceList(serviceRes)
    serviceCategories.value = categoryRes
    homeBanners.value = bannerRes.filter(item => item.status !== 0 && Boolean(item.imageUrl || item.imageDisplayUrl))
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
  uni.navigateTo({ url: '/pages/address/list?mode=select' })
}

async function syncSelectedAddress() {
  const selectedAddress = getSelectedAddress()
  if (!selectedAddress) {
    defaultAddress.value = fallbackAddress
    return
  }

  defaultAddress.value = formatAddress(selectedAddress) || fallbackAddress
  if (!tokenStore.hasLogin)
    return

  try {
    const addresses = await getUserAddresses()
    if (!addresses.some(item => item.id === selectedAddress.id)) {
      clearSelectedAddress()
      defaultAddress.value = fallbackAddress
    }
  }
  catch {
    // 首页不要因为地址校验失败影响服务数据展示。
  }
}

function onSearchTap() {
  uni.navigateTo({ url: '/pages/service/search' })
}

function onCartTap() {
  uni.showToast({ icon: 'none', title: '购物车功能待完善' })
}

function serviceDetailUrl(service: Service) {
  const query = service.code
    ? `code=${encodeURIComponent(service.code)}`
    : `id=${encodeURIComponent(String(service.id))}`
  return `/pages/service/detail?${query}`
}

function onBannerTap(banner?: HomeBanner) {
  if (!banner || banner.linkType === 'none') {
    return
  }

  if (banner.linkType === 'service' && banner.linkValue) {
    uni.navigateTo({ url: `/pages/service/detail?code=${encodeURIComponent(banner.linkValue)}` })
    return
  }

  if (banner.linkType === 'category' && banner.linkValue) {
    uni.navigateTo({ url: `/pages/service/list?categoryId=${encodeURIComponent(banner.linkValue)}` })
    return
  }

  if (banner.linkType === 'url' && banner.linkValue) {
    uni.showToast({ icon: 'none', title: '暂不支持打开外部链接' })
  }
}

function onServiceTap(service: Service) {
  uni.navigateTo({ url: serviceDetailUrl(service) })
}

function serviceListUrl(category: ServiceCategory) {
  const params = [
    `categoryId=${encodeURIComponent(String(category.id))}`,
    `categoryName=${encodeURIComponent(category.name)}`,
  ].filter(Boolean).join('&')
  return `/pages/service/list?${params}`
}

function onServiceListTap(category: ServiceCategory) {
  uni.navigateTo({ url: serviceListUrl(category) })
}

onLoad(() => {
  void syncSelectedAddress()
  loadData()
})

onShow(() => {
  void syncSelectedAddress()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[120rpx]">
    <view class="sticky top-0 z-20 bg-[#FF373D] px-[28rpx] pb-[24rpx]" style="padding-top: calc(env(safe-area-inset-top) + 50rpx);">
      <view class="flex items-center pt-[16rpx] pb-[16rpx]" @tap="onAddressTap">
        <view class="i-carbon-location text-white text-[32rpx]" />
        <text class="text-white text-[28rpx] mx-[12rpx] flex-1 truncate">{{ defaultAddress }}</text>
        <view class="i-carbon-chevron-down text-white text-[24rpx]" />
      </view>

      <view class="flex items-center gap-[20rpx]">
        <view
          class="flex-1 bg-white rounded-full h-[76rpx] flex items-center px-[24rpx]"
          @tap="onSearchTap"
        >
          <view class="i-carbon-search text-gray-400 text-[32rpx]" />
          <text class="text-[26rpx] text-gray-400 ml-[12rpx]">关键词搜索服务</text>
        </view>
        <view class="relative w-[76rpx] h-[76rpx] rounded-full bg-white bg-opacity-25 flex items-center justify-center" @tap="onCartTap">
          <view class="i-carbon-shopping-cart text-white text-[44rpx]" />
          <view
            v-if="cartCount > 0"
            class="absolute -top-[8rpx] -right-[8rpx] bg-[#FFD700] text-[#333] text-[20rpx] min-w-[32rpx] h-[32rpx] rounded-full flex items-center justify-center font-600"
          >
            {{ cartCount }}
          </view>
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
          <view class="rounded-[18rpx] h-[280rpx] overflow-hidden bg-[#F7FBFF]">
            <swiper
              v-if="homeBanners.length"
              class="w-full h-full"
              circular
              autoplay
              indicator-dots
              indicator-color="rgba(255,255,255,0.55)"
              indicator-active-color="#FFFFFF"
            >
              <swiper-item
                v-for="item in homeBanners"
                :key="item.id"
                class="relative"
                @tap="onBannerTap(item)"
              >
                <image
                  :src="item.imageDisplayUrl || item.imageUrl"
                  class="w-full h-full"
                  mode="aspectFill"
                />
                <view class="absolute left-0 right-0 bottom-0 px-5 py-4 banner-overlay">
                  <text class="block text-[34rpx] leading-[44rpx] font-700 text-white truncate">
                    {{ item.title }}
                  </text>
                  <text
                    v-if="item.subtitle"
                    class="block mt-1 text-[24rpx] leading-[32rpx] text-white opacity-90 truncate"
                  >
                    {{ item.subtitle }}
                  </text>
                </view>
              </swiper-item>
            </swiper>

            <view v-else class="h-full px-5 py-5 flex items-center bg-[#FFF3F4]">
              <view class="flex-1 min-w-0">
                <text class="block text-[38rpx] leading-[50rpx] font-700 text-gray-900">
                  品质家政服务
                </text>
                <text class="block mt-2 text-[26rpx] leading-[36rpx] text-gray-500">
                  专业师傅上门，清洁、维修、搬运一站预约
                </text>
                <view class="mt-5 h-[58rpx] px-4 rounded-full bg-[#FF373D] inline-flex items-center justify-center" @tap="onSearchTap">
                  <text class="text-[26rpx] text-white font-600">
                    立即查找服务
                  </text>
                </view>
              </view>
              <view class="w-[180rpx] h-[180rpx] rounded-full bg-white bg-opacity-70 ml-4 flex items-center justify-center shrink-0">
                <text class="i-carbon-home text-[86rpx] text-[#FF373D]" />
              </view>
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

        <view v-if="hotServices.length" class="mt-3 px-4">
          <view class="flex items-center justify-between">
            <text class="text-[34rpx] leading-[46rpx] font-600 text-gray-900">
              热门服务
            </text>
            <text class="text-[24rpx] text-gray-400">
              点击服务直接下单
            </text>
          </view>

          <view class="grid grid-cols-2 gap-3 mt-3">
            <view
              v-for="item in directServices"
              :key="item.code || item.id"
              class="bg-white rounded-[16rpx] overflow-hidden"
              @tap="onServiceTap(item)"
            >
              <view class="w-full h-[168rpx] bg-[#EAF3FF] flex items-center justify-center">
                <image
                  v-if="item.coverImage"
                  :src="item.coverImageDisplayUrl || item.coverImage"
                  class="w-full h-full"
                  mode="aspectFill"
                />
                <text v-else class="i-carbon-clean text-[64rpx] text-[#FF373D]" />
              </view>
              <view class="p-3">
                <text class="block text-[28rpx] leading-[38rpx] font-600 text-gray-800 truncate">
                  {{ item.name }}
                </text>
                <text class="block mt-1 text-[24rpx] leading-[32rpx] text-gray-400 truncate">
                  {{ item.description || '专业师傅上门服务' }}
                </text>
                <view class="mt-3 flex items-center justify-between">
                  <text class="text-[30rpx] text-[#FF373D] font-700">
                    ￥{{ formatPrice(item.basePrice) }}
                  </text>
                  <text class="text-[22rpx] text-gray-400 flex-1 ml-1 truncate">
                    / {{ item.priceUnit || '次' }}
                  </text>
                  <text class="i-carbon-chevron-right text-[24rpx] text-[#FF373D] ml-1" />
                </view>
              </view>
            </view>
          </view>
        </view>

        <view v-if="serviceListEntries.length" class="mt-5 px-4">
          <view class="flex items-center justify-between">
            <text class="text-[34rpx] leading-[46rpx] font-600 text-gray-900">
              更多服务
            </text>
            <text class="text-[24rpx] text-gray-400">
              进入列表选购
            </text>
          </view>

          <view class="grid grid-cols-2 gap-3 mt-3">
            <view
              v-for="item in serviceListEntries"
              :key="`list-${item.id}`"
              class="bg-white rounded-[16rpx] overflow-hidden"
              @tap="onServiceListTap(item)"
            >
              <view class="w-full h-[150rpx] bg-[#EAF3FF] flex items-center justify-center">
                <text :class="item.icon || 'i-carbon-list'" class="text-[60rpx] text-[#FF373D]" />
              </view>
              <view class="p-3">
                <text class="block text-[28rpx] leading-[38rpx] font-600 text-gray-800 truncate">
                  {{ item.name }}
                </text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </loading-state>
  </view>
</template>

<style scoped>
.banner-overlay {
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.48) 100%);
}
</style>
