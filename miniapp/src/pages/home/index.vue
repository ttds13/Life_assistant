<script lang="ts" setup>
import type { HomeBanner } from '@/api/types/home'
import type { PurchasableMemberCard } from '@/api/types/memberCards'
import type { Service } from '@/api/types/services'
import { getUserAddresses } from '@/api/address'
import { getHomeBanners } from '@/api/home'
import { getPurchasableMemberCards } from '@/api/memberCards'
import { getServices } from '@/api/services'
import HomeProductCard from '@/components/home-product-card/home-product-card.vue'
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
const purchasableCards = ref<PurchasableMemberCard[]>([])
const homeBanners = ref<HomeBanner[]>([])
const loading = ref(true)
const isError = ref(false)
const memberCardsExpanded = ref(false)

const hotServices = computed(() => recommendedServices.value.filter(item => item.status !== 0))
const directServices = computed(() => hotServices.value.slice(0, 6))
const availableMemberCards = computed(() => purchasableCards.value.filter(item => item.status !== 0))
const visibleMemberCards = computed(() => memberCardsExpanded.value
  ? availableMemberCards.value
  : availableMemberCards.value.slice(0, 6))
const hasMoreMemberCards = computed(() => availableMemberCards.value.length > 6)
const isEmpty = computed(() => !loading.value && !isError.value && hotServices.value.length === 0 && visibleMemberCards.value.length === 0)

function normalizeServiceList(data: any): Service[] {
  if (Array.isArray(data))
    return data

  return data?.items || data?.list || data?.records || []
}

async function loadHomeSection<T>(label: string, loader: () => Promise<T>, fallback: T) {
  try {
    return { ok: true, data: await loader() }
  }
  catch (err) {
    console.warn(`home ${label} load failed`, err)
    return { ok: false, data: fallback }
  }
}

async function loadData() {
  loading.value = true
  isError.value = false

  const [serviceRes, cardRes, bannerRes] = await Promise.all([
    loadHomeSection('services', () => getServices({ page: 1, pageSize: 6 }, { hideErrorToast: true }), { items: [], page: 1, pageSize: 6, total: 0 }),
    loadHomeSection('member cards', () => getPurchasableMemberCards({ hideErrorToast: true }), []),
    loadHomeSection('banners', () => getHomeBanners(), []),
  ])

  recommendedServices.value = normalizeServiceList(serviceRes.data)
  purchasableCards.value = cardRes.data
  homeBanners.value = bannerRes.data.filter(item => item.status !== 0 && Boolean(item.imageUrl || item.imageDisplayUrl))
  isError.value = !serviceRes.ok && !cardRes.ok && !bannerRes.ok
  loading.value = false
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

function memberCardDescription(card: PurchasableMemberCard) {
  if (card.description)
    return card.description
  const names = (card.serviceRuleList || [])
    .filter(rule => rule.status !== 0 && rule.serviceStatus !== 0)
    .map(rule => rule.serviceName)
    .filter(Boolean)
  const serviceText = names.length
    ? (names.length > 1 ? `${names[0]}等 ${names.length} 项服务` : names[0])
    : (card.serviceSummary || '适用服务以商品详情为准')
  return `${card.totalUnits}分钟 · ${serviceText}`
}

function memberCardCover(card: PurchasableMemberCard) {
  if (card.coverImageDisplayUrl || card.coverImage)
    return card.coverImageDisplayUrl || card.coverImage || ''
  const rule = (card.serviceRuleList || []).find(item =>
    item.status !== 0
    && item.serviceStatus !== 0
    && Boolean(item.serviceCoverImageDisplayUrl || item.serviceCoverImage),
  )
  return rule?.serviceCoverImageDisplayUrl || rule?.serviceCoverImage || ''
}

function onMemberCardTap(card: PurchasableMemberCard) {
  const detailUrl = `/pages/member-card/detail?id=${card.id}&source=home_member_card`
  if (!tokenStore.hasLogin) {
    uni.navigateTo({ url: `/pages/login/index?redirect=${encodeURIComponent(detailUrl)}` })
    return
  }
  uni.navigateTo({ url: detailUrl })
}

function toggleMemberCards() {
  memberCardsExpanded.value = !memberCardsExpanded.value
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
            <HomeProductCard
              v-for="item in directServices"
              :key="item.code || item.id"
              :cover-image="item.coverImageDisplayUrl || item.coverImage"
              :title="item.name"
              :description="item.description || '专业师傅上门服务'"
              :price="item.basePrice"
              :unit="item.priceUnit || '次'"
              fallback-icon="i-carbon-clean"
              @tap="onServiceTap(item)"
            />
          </view>
        </view>

        <view class="mt-5 px-4">
          <view class="flex items-center justify-between">
            <text class="text-[34rpx] leading-[46rpx] font-600 text-gray-900">
              会员卡
            </text>
            <view v-if="hasMoreMemberCards" class="flex items-center" @tap="toggleMemberCards">
              <text class="text-[24rpx] text-gray-500">{{ memberCardsExpanded ? '收起' : '展开更多' }}</text>
              <text
                :class="memberCardsExpanded ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'"
                class="ml-1 text-[24rpx] text-gray-400"
              />
            </view>
          </view>

          <view v-if="visibleMemberCards.length" class="grid grid-cols-2 gap-3 mt-3">
            <HomeProductCard
              v-for="item in visibleMemberCards"
              :key="`member-card-${item.id}`"
              :cover-image="memberCardCover(item)"
              :title="item.name"
              :description="memberCardDescription(item)"
              :price="item.price"
              unit="张"
              fallback-icon="i-carbon-wallet"
              @tap="onMemberCardTap(item)"
            />
          </view>
          <view v-else class="mt-3 h-[120rpx] bg-white rounded-[16rpx] flex items-center justify-center">
            <text class="text-[25rpx] text-gray-400">暂无可售会员卡</text>
          </view>
        </view>
      </view>
    </loading-state>
  </view>
</template>
