<script lang="ts" setup>
import type { Service, ServiceCategory } from '@/api/types/services'
import { getUserAddresses } from '@/api/address'
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

// ===== Step 1: 本地类型 =====
interface HomeCategoryItem {
  id: number
  name: string
  icon: string
  color: string
  bg: string
}

interface HomePromoTile {
  title: string
  desc: string
  color: string
  bg: string
}

interface HomePassCard {
  name: string
  count: string
  price: string
  desc: string
}

interface HomeStaffAvatar {
  name: string
  color: string
}

// ===== Step 1: 静态配置 =====
const fallbackAddress = '请选择服务地址'
const defaultAddress = ref(fallbackAddress)
const cartCount = ref(0)
const tokenStore = useTokenStore()

const bannerConfig = {
  title: '日常保洁服务',
  price: '50',
  unit: '元 / 小时',
  desc: '3小时起约',
  actionText: '立即抢购',
}

const guaranteeItems = [
  { label: '不满意重做', icon: 'i-carbon-checkmark-outline' },
  { label: '过期退', icon: 'i-carbon-time' },
  { label: '随时退', icon: 'i-carbon-checkmark-outline' },
  { label: '全场保障', icon: 'i-carbon-security' },
]

const fallbackCategories: HomeCategoryItem[] = [
  { id: -1, name: '爱宠服务', icon: 'i-carbon-pet-image-b', color: '#FF7A59', bg: '#FFF1EC' },
  { id: -2, name: '窗帘清洗', icon: 'i-carbon-clean', color: '#1677FF', bg: '#EAF3FF' },
  { id: -3, name: '收纳整理', icon: 'i-carbon-store', color: '#8B5CF6', bg: '#F1ECFF' },
  { id: -4, name: '家居养护', icon: 'i-carbon-home', color: '#EF3D45', bg: '#FFECEF' },
  { id: -5, name: '开荒保洁', icon: 'i-carbon-clean', color: '#20C997', bg: '#E9FBF5' },
  { id: -6, name: '深度保洁', icon: 'i-carbon-tools', color: '#F5A623', bg: '#FFF6E8' },
  { id: -7, name: '日常保洁', icon: 'i-carbon-clean', color: '#1677FF', bg: '#EAF3FF' },
  { id: -8, name: '衣物洗护', icon: 'i-carbon-store', color: '#4D8DFF', bg: '#EDF4FF' },
  { id: -9, name: '保姆月嫂', icon: 'i-carbon-user-avatar', color: '#EC4899', bg: '#FDECF6' },
  { id: -10, name: '上门美业', icon: 'i-carbon-star', color: '#8B5CF6', bg: '#F1ECFF' },
  { id: -11, name: '上门安装', icon: 'i-carbon-tools', color: '#F5A623', bg: '#FFF6E8' },
  { id: -12, name: '搬家拉货', icon: 'i-carbon-delivery', color: '#FF7A59', bg: '#FFF1EC' },
  { id: -13, name: '上门维修', icon: 'i-carbon-tools', color: '#1677FF', bg: '#EAF3FF' },
  { id: -14, name: '家电清洗', icon: 'i-carbon-clean', color: '#20C997', bg: '#E9FBF5' },
  { id: -15, name: '家庭保洁', icon: 'i-carbon-home', color: '#EF3D45', bg: '#FFECEF' },
]

const housekeepingItems: HomeCategoryItem[] = [
  { id: -101, name: '爱宠服务', icon: 'i-carbon-pet-image-b', color: '#FF7A59', bg: '#FFF1EC' },
  { id: -102, name: '厨房深度', icon: 'i-carbon-clean', color: '#1F2937', bg: '#F3F4F6' },
  { id: -103, name: '收纳整洁', icon: 'i-carbon-store', color: '#1F2937', bg: '#F3F4F6' },
  { id: -104, name: '搬家拉货', icon: 'i-carbon-delivery', color: '#FF7A59', bg: '#FFF1EC' },
  { id: -105, name: '家庭保洁', icon: 'i-carbon-home', color: '#1677FF', bg: '#EAF3FF' },
]

const nearbyStaff: HomeStaffAvatar[] = [
  { name: '洁', color: '#EF3D45' },
  { name: '净', color: '#E5E7EB' },
  { name: '修', color: '#C8171D' },
  { name: '护', color: '#C8171D' },
]

const directServicePromotions: HomePromoTile[] = [
  { title: '60min', desc: '新人特惠', color: '#FFFFFF', bg: '#8FD17F' },
  { title: '家务我来', desc: '全屋净洗', color: '#FFFFFF', bg: '#FF7A59' },
]

const seasonalPromotions: HomePromoTile[] = [
  { title: '新居开荒', desc: '玻璃清洁', color: '#FFFFFF', bg: '#F5A623' },
  { title: '洗护到家', desc: '取送洗护', color: '#FFFFFF', bg: '#6BAAFB' },
]

const cardPassItems: HomePassCard[] = [
  { name: '家庭保洁', count: '10次', price: '¥1080', desc: '低至108元/次' },
  { name: '家庭保洁Plus', count: '20次', price: '¥2160', desc: '低至108元/次' },
]

// ===== 数据状态 =====
const categories = ref<ServiceCategory[]>([])
const services = ref<Service[]>([])
const loading = ref(true)
const isError = ref(false)

// ===== Step 2: 调整数据加载策略 =====
const displayCategories = computed<HomeCategoryItem[]>(() => {
  if (!categories.value.length)
    return fallbackCategories

  return categories.value.slice(0, 15).map((item, index) => {
    const fallback = fallbackCategories[index] || fallbackCategories[0]
    return {
      id: item.id,
      name: item.name || fallback.name,
      icon: item.icon || fallback.icon,
      color: fallback.color,
      bg: fallback.bg,
    }
  })
})

const hasHotServices = computed(() => services.value.length > 0)

function normalizeServiceList(data: any): Service[] {
  if (Array.isArray(data))
    return data

  return data?.items || data?.list || data?.records || []
}

async function loadData() {
  loading.value = true
  isError.value = false
  try {
    const [cateRes, serviceRes] = await Promise.all([
      getServiceCategories(),
      getServices({ page: 1, pageSize: 10 }),
    ])
    categories.value = cateRes
    services.value = normalizeServiceList(serviceRes)
  }
  catch (err) {
    console.error('首页数据加载失败:', err)
    isError.value = true
  }
  finally {
    loading.value = false
  }
}

// ===== Step 3: 交互方法 =====
function showTodo(title: string) {
  uni.showToast({
    icon: 'none',
    title,
  })
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
  showTodo('购物车功能建设中')
}

function onCategoryTap(item: HomeCategoryItem) {
  showTodo(`${item.name}服务建设中`)
}

function onBannerTap() {
  if (services.value[0]?.id) {
    uni.navigateTo({ url: `/pages/service/detail?id=${services.value[0].id}` })
    return
  }

  showTodo('活动服务建设中')
}

function onOperationTap(title: string) {
  showTodo(`${title}建设中`)
}

function onPassCardTap(item: HomePassCard) {
  showTodo(`${item.name}建设中`)
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
    <!-- 7.1 顶部地址搜索模块 -->
    <view class="sticky top-0 z-20 bg-[#FF373D] px-[28rpx] pb-[24rpx]" style="padding-top: calc(env(safe-area-inset-top) + 50rpx);">
      <!-- 地址行 -->
      <view class="flex items-center pt-[16rpx] pb-[16rpx]" @tap="onAddressTap">
        <view class="i-carbon-location text-white text-[32rpx]" />
        <text class="text-white text-[28rpx] mx-[12rpx] flex-1 truncate">{{ defaultAddress }}</text>
        <view class="i-carbon-chevron-down text-white text-[24rpx]" />
      </view>
      <!-- 搜索 + 购物车行 -->
      <view class="flex items-center gap-[20rpx]">
        <view
          class="flex-1 bg-white rounded-full h-[76rpx] flex items-center px-[24rpx]"
          @tap="onSearchTap"
        >
          <view class="i-carbon-search text-gray-400 text-[32rpx]" />
          <text class="text-[26rpx] text-gray-400 ml-[12rpx]">关键词搜索服务</text>
        </view>
        <view class="relative" @tap="onCartTap">
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

    <!-- 7.2 Banner -->
    <view
      class="mx-[24rpx] mt-[20rpx] rounded-[24rpx] p-[32rpx] flex items-center overflow-hidden"
      style="background: linear-gradient(135deg, #EAF9FF 0%, #FFFFFF 48%, #D9F3EA 100%);"
      @tap="onBannerTap"
    >
      <view class="flex-1">
        <text class="text-[32rpx] font-700 text-gray-800 block">{{ bannerConfig.title }}</text>
        <view class="flex items-baseline mt-[12rpx]">
          <text class="text-[48rpx] font-800 text-[#FF373D]">{{ bannerConfig.price }}</text>
          <text class="text-[24rpx] text-gray-500 ml-[8rpx]">{{ bannerConfig.unit }}</text>
        </view>
        <text class="text-[24rpx] text-gray-400 mt-[8rpx] block">{{ bannerConfig.desc }}</text>
        <view class="mt-[20rpx] bg-[#FF373D] rounded-full px-[28rpx] py-[12rpx] inline-flex">
          <text class="text-white text-[24rpx] font-600">{{ bannerConfig.actionText }}</text>
        </view>
      </view>
      <!-- 右侧占位插画 -->
      <view class="w-[180rpx] h-[180rpx] rounded-[16rpx] bg-[#E0F7FA] flex items-center justify-center ml-[20rpx]">
        <view class="i-carbon-clean text-[80rpx] text-[#26C6DA]" />
      </view>
    </view>

    <!-- 7.3 保障说明横条 -->
    <view class="mx-[24rpx] mt-[18rpx] flex items-center justify-between">
      <view
        v-for="(item, idx) in guaranteeItems"
        :key="idx"
        class="flex items-center gap-[6rpx]"
      >
        <view :class="item.icon" class="text-[26rpx] text-[#EF3D45]" />
        <text class="text-[22rpx] text-[#EF3D45]">{{ item.label }}</text>
      </view>
    </view>

    <!-- 7.4 服务分类宫格 -->
    <view class="mx-[24rpx] mt-[22rpx] bg-white rounded-[24rpx] p-[24rpx]">
      <view class="grid grid-cols-5 gap-y-[32rpx]">
        <view
          v-for="item in displayCategories"
          :key="item.id"
          class="flex flex-col items-center"
          @tap="onCategoryTap(item)"
        >
          <view
            class="w-[88rpx] h-[88rpx] rounded-full flex items-center justify-center"
            :style="{ backgroundColor: item.bg }"
          >
            <view :class="item.icon" class="text-[40rpx]" :style="{ color: item.color }" />
          </view>
          <text class="text-[24rpx] text-gray-700 mt-[12rpx] text-center truncate w-full">{{ item.name }}</text>
        </view>
      </view>
    </view>

    <!-- 7.5 家政通卡片 -->
    <view class="mx-[24rpx] mt-[22rpx] bg-white rounded-[24rpx] p-[24rpx]">
      <view class="flex items-center justify-between mb-[20rpx]">
        <text class="text-[30rpx] font-700 text-gray-800">家政通</text>
        <text class="text-[22rpx] text-gray-400">平台安全保障</text>
      </view>
      <view class="grid grid-cols-5 gap-y-[24rpx]">
        <view
          v-for="item in housekeepingItems"
          :key="item.id"
          class="flex flex-col items-center"
          @tap="onCategoryTap(item)"
        >
          <view
            class="w-[80rpx] h-[80rpx] rounded-full flex items-center justify-center"
            :style="{ backgroundColor: item.bg }"
          >
            <view :class="item.icon" class="text-[36rpx]" :style="{ color: item.color }" />
          </view>
          <text class="text-[22rpx] text-gray-600 mt-[10rpx] text-center">{{ item.name }}</text>
        </view>
      </view>
    </view>

    <!-- 7.6 运营卡片区 -->
    <view class="flex gap-[20rpx] mx-[24rpx] mt-[22rpx]">
      <!-- 左列：附近师傅 -->
      <view
        class="flex-1 bg-white rounded-[24rpx] p-[24rpx] flex flex-col"
        @tap="onOperationTap('附近师傅')"
      >
        <text class="text-[28rpx] font-700 text-gray-800">附近师傅</text>
        <text class="text-[20rpx] text-gray-400 mt-[6rpx]">全程保障,放心直约上门</text>
        <!-- 红色主视觉占位 -->
        <view class="mt-[16rpx] flex-1 bg-[#FFECEF] rounded-[16rpx] flex items-center justify-center min-h-[160rpx]">
          <view class="i-carbon-user-avatar text-[60rpx] text-[#EF3D45]" />
        </view>
        <!-- 底部头像 -->
        <view class="flex items-center gap-[12rpx] mt-[16rpx]">
          <view
            v-for="(staff, idx) in nearbyStaff"
            :key="idx"
            class="w-[52rpx] h-[52rpx] rounded-full flex items-center justify-center text-white text-[22rpx] font-600"
            :style="{ backgroundColor: staff.color }"
          >
            {{ staff.name }}
          </view>
        </view>
      </view>

      <!-- 右列：直选服务 + 换季热推 -->
      <view class="flex-1 flex flex-col gap-[20rpx]">
        <!-- 直选服务 -->
        <view
          class="bg-white rounded-[24rpx] p-[20rpx] flex-1"
          @tap="onOperationTap('直选服务')"
        >
          <view class="flex items-center gap-[10rpx]">
            <text class="text-[26rpx] font-700 text-gray-800">直选服务</text>
            <text class="text-[18rpx] text-gray-400 bg-[#F3F4F6] rounded-full px-[12rpx] py-[4rpx]">品质保障</text>
          </view>
          <view class="flex gap-[12rpx] mt-[14rpx]">
            <view
              v-for="(promo, idx) in directServicePromotions"
              :key="idx"
              class="flex-1 rounded-[12rpx] p-[14rpx] flex flex-col items-center justify-center"
              :style="{ backgroundColor: promo.bg }"
            >
              <text class="text-[24rpx] font-700" :style="{ color: promo.color }">{{ promo.title }}</text>
              <text class="text-[18rpx] mt-[4rpx]" :style="{ color: promo.color }">{{ promo.desc }}</text>
            </view>
          </view>
        </view>

        <!-- 换季热推 -->
        <view
          class="bg-white rounded-[24rpx] p-[20rpx] flex-1"
          @tap="onOperationTap('换季热推')"
        >
          <view class="flex items-center gap-[10rpx]">
            <text class="text-[26rpx] font-700 text-gray-800">换季热推</text>
            <text class="text-[18rpx] text-gray-400 bg-[#F3F4F6] rounded-full px-[12rpx] py-[4rpx]">取送洗护</text>
          </view>
          <view class="flex gap-[12rpx] mt-[14rpx]">
            <view
              v-for="(promo, idx) in seasonalPromotions"
              :key="idx"
              class="flex-1 rounded-[12rpx] p-[14rpx] flex flex-col items-center justify-center"
              :style="{ backgroundColor: promo.bg }"
            >
              <text class="text-[24rpx] font-700" :style="{ color: promo.color }">{{ promo.title }}</text>
              <text class="text-[18rpx] mt-[4rpx]" :style="{ color: promo.color }">{{ promo.desc }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 7.7 优惠次卡模块 -->
    <view class="mx-[24rpx] mt-[22rpx] bg-white rounded-[24rpx] p-[24rpx]">
      <view class="flex items-center justify-between mb-[20rpx]">
        <text class="text-[30rpx] font-700 text-gray-800">优惠次卡</text>
        <view class="flex items-center gap-[6rpx]">
          <text class="text-[22rpx] text-gray-400">更多</text>
          <view class="i-carbon-arrow-right text-[22rpx] text-gray-400" />
        </view>
      </view>
      <view class="flex gap-[20rpx]">
        <view
          v-for="(card, idx) in cardPassItems"
          :key="idx"
          class="flex-1 bg-[#FF373D] rounded-[16rpx] p-[24rpx]"
          @tap="onPassCardTap(card)"
        >
          <text class="text-white text-[24rpx] block">{{ card.name }}</text>
          <text class="text-white text-[20rpx] opacity-80 block mt-[6rpx]">{{ card.count }}</text>
          <text class="text-white text-[36rpx] font-800 block mt-[12rpx]">{{ card.price }}</text>
          <text class="text-white text-[20rpx] opacity-80 block mt-[6rpx]">{{ card.desc }}</text>
        </view>
      </view>
    </view>

    <!-- 7.8 热门服务区域 -->
    <view class="mx-[24rpx] mt-[22rpx]">
      <text class="text-[32rpx] font-700 text-gray-800 block mb-[16rpx]">热门服务</text>

      <!-- 加载中 -->
      <loading-state v-if="loading" :loading="true" />

      <!-- 错误状态 -->
      <view v-else-if="isError" class="bg-white rounded-[16rpx] p-[32rpx] flex flex-col items-center">
        <text class="text-[26rpx] text-gray-400">加载失败，请检查网络</text>
        <view
          class="mt-[20rpx] bg-[#FF373D] rounded-full px-[32rpx] py-[14rpx]"
          @tap="loadData"
        >
          <text class="text-white text-[24rpx]">重试</text>
        </view>
      </view>

      <!-- 空状态 -->
      <view v-else-if="!hasHotServices" class="bg-white rounded-[16rpx] p-[32rpx] flex items-center justify-center">
        <text class="text-[26rpx] text-gray-400">热门服务即将上线</text>
      </view>

      <!-- 服务列表 -->
      <view v-else>
        <service-card v-for="item in services" :key="item.id" :service="item" />
      </view>
    </view>
  </view>
</template>
