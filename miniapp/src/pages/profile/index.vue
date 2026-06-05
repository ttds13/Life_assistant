<script lang="ts" setup>
import { createDevStaffSession } from '@/api/auth'
import { getOrders } from '@/api/orders'
import type { OrderStatus } from '@/api/types/orders'
import { useTokenStore } from '@/store/token'
import { useUserStore } from '@/store/user'
import { saveOrderListFilter } from '@/utils/orderListFilter'
import { getStoredDevStaffSession, saveDevStaffSession } from '@/utils/devStaffStorage'

definePage({
  style: {
    navigationBarTitleText: '我的',
    navigationBarBackgroundColor: '#F5F7FA',
    navigationBarTextStyle: 'black',
  },
})

const tokenStore = useTokenStore()
const userStore = useUserStore()
const staffEntering = ref(false)
const mockLoginFlagKey = 'life-assistant:mock-login'
const isMockLoginSession = ref(false)

type StatAction = 'wallet' | 'card' | 'coupon'
type OrderAction = 'all' | 'pendingPayment' | 'pendingDispatch' | 'pendingConfirm' | 'pendingReview' | 'afterSales'
type AppAction = 'address' | 'staffWorkbench' | 'applyStaff' | 'applyPartner' | 'faq' | 'customerService' | 'feedback' | 'settings'

interface StatEntry {
  label: string
  action: StatAction
  value: string
}

interface OrderEntry {
  label: string
  action: OrderAction
  icon: string
  count: number
}

interface AppEntry {
  label: string
  action: AppAction
  icon: string
  color: string
  auth: boolean
}

const mockProfileStats = {
  walletBalance: 0,
  cardCount: 0,
  couponCount: 0,
}

type OrderStats = Record<Exclude<OrderAction, 'all'>, number>

const emptyOrderStats: OrderStats = {
  pendingPayment: 0,
  pendingDispatch: 0,
  pendingConfirm: 0,
  pendingReview: 0,
  afterSales: 0,
}

const profileStats = computed(() => mockProfileStats)
const orderStats = ref<OrderStats>({ ...emptyOrderStats })

const displayName = computed(() => {
  if (!tokenStore.hasLogin)
    return '未登录'
  return userStore.userInfo.nickname || (userStore.userInfo.userId > 0 ? `用户${userStore.userInfo.userId}` : '微信用户')
})

const displayPhone = computed(() => {
  if (!tokenStore.hasLogin)
    return '点击登录后查看个人信息'
  return userStore.userInfo.phone || '未绑定手机号'
})

const statEntries = computed<StatEntry[]>(() => [
  {
    label: '钱包余额',
    action: 'wallet',
    value: tokenStore.hasLogin ? formatMoney(profileStats.value.walletBalance) : '--',
  },
  {
    label: '我的卡包',
    action: 'card',
    value: tokenStore.hasLogin ? String(profileStats.value.cardCount) : '--',
  },
  {
    label: '优惠券',
    action: 'coupon',
    value: tokenStore.hasLogin ? String(profileStats.value.couponCount) : '--',
  },
])

const orderEntries = computed<OrderEntry[]>(() => [
  { label: '待付款', action: 'pendingPayment', icon: 'i-carbon-wallet', count: orderStats.value.pendingPayment },
  { label: '待接单', action: 'pendingDispatch', icon: 'i-carbon-time', count: orderStats.value.pendingDispatch },
  { label: '待验收', action: 'pendingConfirm', icon: 'i-carbon-document-tasks', count: orderStats.value.pendingConfirm },
  { label: '待评价', action: 'pendingReview', icon: 'i-carbon-chat', count: orderStats.value.pendingReview },
  { label: '售后', action: 'afterSales', icon: 'i-carbon-shopping-bag', count: orderStats.value.afterSales },
])

const isDevApi = import.meta.env.VITE_SERVER_BASEURL?.includes('192.168.')
  || import.meta.env.VITE_SERVER_BASEURL?.includes('127.0.0.1')
  || import.meta.env.VITE_SERVER_BASEURL?.includes('localhost')

const isMockLoginUser = computed(() => {
  if (!tokenStore.hasLogin || !isDevApi)
    return false

  const phone = userStore.userInfo.phone
  const nickname = userStore.userInfo.nickname
  return isMockLoginSession.value
    || phone === '13800001111'
    || phone === '138****1111'
    || nickname === '用户_001111'
})

const appEntries: AppEntry[] = [
  { label: '我的地址', action: 'address', icon: 'i-carbon-location', color: '#1677FF', auth: true },
  { label: '师傅端', action: 'staffWorkbench', icon: 'i-carbon-user-certification', color: '#FF373D', auth: true },
  { label: '申请师傅', action: 'applyStaff', icon: 'i-carbon-user-role', color: '#20C997', auth: true },
  { label: '申请合作商', action: 'applyPartner', icon: 'i-carbon-store', color: '#FF7A59', auth: true },
  { label: '常见问题', action: 'faq', icon: 'i-carbon-help', color: '#4D8DFF', auth: false },
  { label: '联系客服', action: 'customerService', icon: 'i-carbon-headset', color: '#F5A623', auth: false },
  { label: '问题反馈', action: 'feedback', icon: 'i-carbon-user-feedback', color: '#EC4899', auth: true },
  { label: '设置', action: 'settings', icon: 'i-carbon-settings', color: '#8B5CF6', auth: true },
]

const displayAppEntries = computed(() => {
  return appEntries.filter((item) => {
    if (item.action !== 'staffWorkbench')
      return true
    return userStore.userInfo.role === 'staff' || isMockLoginUser.value
  })
})

function onLogin() {
  uni.navigateTo({ url: '/pages/login/index' })
}

function requireLogin(next: () => void) {
  if (!tokenStore.hasLogin) {
    onLogin()
    return
  }
  next()
}

function goSettings() {
  requireLogin(() => {
    uni.navigateTo({ url: '/pages/settings/index' })
  })
}


function formatMoney(value: number) {
  const amount = Number(value)
  if (Number.isNaN(amount))
    return '0.00'
  return amount.toFixed(2)
}

function formatBadge(count: number) {
  if (count > 99)
    return '99+'
  return String(count)
}

function showPendingToast(title: string) {
  uni.showToast({ icon: 'none', title })
}

function syncMockLoginSession() {
  isMockLoginSession.value = uni.getStorageSync(mockLoginFlagKey) === '1'
}

async function loadOrderStats() {
  if (!tokenStore.hasLogin) {
    orderStats.value = { ...emptyOrderStats }
    return
  }

  try {
    const result = await getOrders({ page: 1, pageSize: 100 })
    const count = (statuses: OrderStatus[]) => result.items.filter(item => statuses.includes(item.status)).length
    orderStats.value = {
      pendingPayment: count(['pending_payment']),
      pendingDispatch: count(['pending_dispatch']),
      pendingConfirm: count(['pending_confirm']),
      pendingReview: count(['completed']),
      afterSales: count(['after_sales', 'refund_pending', 'refunded']),
    }
  }
  catch {
    orderStats.value = { ...emptyOrderStats }
  }
}

function onProfileTap() {
  goSettings()
}

function goWalletPage() {
  requireLogin(() => {
    uni.navigateTo({
      url: '/pages/wallet/index',
      fail: (err) => {
        console.error('跳转钱包页失败:', err)
        uni.showToast({ icon: 'none', title: '钱包页跳转失败' })
      },
    })
  })
}

function goCardPage() {
  requireLogin(() => {
    uni.navigateTo({
      url: '/pages/card/index',
      fail: (err) => {
        console.error('跳转卡包页失败:', err)
        uni.showToast({ icon: 'none', title: '卡包页跳转失败' })
      },
    })
  })
}

function goCouponPage() {
  requireLogin(() => {
    uni.navigateTo({
      url: '/pages/coupon/index',
      fail: (err) => {
        console.error('跳转优惠券页失败:', err)
        uni.showToast({ icon: 'none', title: '优惠券页跳转失败' })
      },
    })
  })
}

function onStatEntryTap(action: StatAction) {
  if (action === 'wallet') {
    goWalletPage()
    return
  }
  if (action === 'card') {
    goCardPage()
    return
  }
  goCouponPage()
}

function goOrderList(action: OrderAction = 'all') {
  requireLogin(() => {
    const statusMap: Partial<Record<OrderAction, OrderStatus>> = {
      pendingPayment: 'pending_payment',
      pendingDispatch: 'pending_dispatch',
      pendingConfirm: 'pending_confirm',
      pendingReview: 'completed',
      afterSales: 'after_sales',
    }

    saveOrderListFilter(statusMap[action] || 'all')
    uni.switchTab({
      url: '/pages/order/list',
      fail: (err) => {
        console.error('跳转订单页失败:', err)
        uni.showToast({ icon: 'none', title: '订单页跳转失败' })
      },
    })
  })
}

async function enterStaffWorkbench() {
  if (staffEntering.value)
    return
  staffEntering.value = true
  try {
    const session = getStoredDevStaffSession() || await createDevStaffSession()
    saveDevStaffSession(session)
    uni.navigateTo({ url: '/pages/staff/home' })
  }
  finally {
    staffEntering.value = false
  }
}

function onAppTap(item: AppEntry) {
  if (item.auth && !tokenStore.hasLogin) {
    onLogin()
    return
  }

  if (item.action === 'address') {
    uni.navigateTo({ url: '/pages/address/list?mode=manage' })
    return
  }

  if (item.action === 'staffWorkbench') {
    if (userStore.userInfo.role !== 'staff' && !isMockLoginUser.value) {
      showPendingToast('当前账号暂未开通师傅端')
      return
    }
    enterStaffWorkbench()
    return
  }

  if (item.action === 'settings') {
    uni.navigateTo({ url: '/pages/settings/index' })
    return
  }

  const titleMap: Record<Exclude<AppAction, 'address' | 'staffWorkbench' | 'settings'>, string> = {
    applyStaff: '申请师傅功能待完善',
    applyPartner: '申请合作商功能待完善',
    faq: '常见问题待配置',
    customerService: '客服信息待配置',
    feedback: '问题反馈功能待完善',
  }
  showPendingToast(titleMap[item.action])
}

onShow(() => {
  syncMockLoginSession()
  loadOrderStats()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[150rpx]">
    <view class="pt-safe px-4 pt-4">
      <view class="bg-white rounded-[28rpx] px-4 pt-5 pb-4 shadow-sm">
        <view class="flex items-center">
          <view class="w-[128rpx] h-[128rpx] rounded-full bg-[#EAF3FF] center overflow-hidden shrink-0" @tap="onProfileTap">
            <image
              v-if="tokenStore.hasLogin && userStore.userInfo.avatar"
              :src="userStore.userInfo.avatar"
              class="w-full h-full"
              mode="aspectFill"
            />
            <view v-else class="w-full h-full center bg-[#EAF3FF]">
              <text class="i-carbon-user-avatar text-[72rpx] text-[#1677FF]" />
            </view>
          </view>

          <view class="ml-4 min-w-0 flex-1">
            <view class="flex items-center gap-2" @tap="goSettings">
              <text class="block truncate text-[42rpx] leading-[52rpx] text-[#1F2937] font-700">
                {{ displayName }}
              </text>
              <text v-if="tokenStore.hasLogin" class="i-carbon-chevron-right text-[32rpx] text-[#9CA3AF] shrink-0" />
            </view>
            <view class="mt-2 flex items-center min-w-0">
              <text class="i-carbon-phone text-[28rpx] text-[#9CA3AF] mr-2 shrink-0" />
              <text class="truncate text-[28rpx] leading-[36rpx] text-[#6B7280]">
                {{ displayPhone }}
              </text>
            </view>
          </view>
        </view>

        <view class="mt-5 bg-[#F7FAFF] rounded-[20rpx] py-4 flex items-center">
          <view
            v-for="(item, index) in statEntries"
            :key="item.action"
            class="relative flex-1 center flex-col min-w-0"
            @tap="onStatEntryTap(item.action)"
          >
            <view v-if="index > 0" class="absolute left-0 top-[24rpx] w-[1rpx] h-[56rpx] bg-[#E5E7EB]" />
            <text class="max-w-full truncate text-[40rpx] leading-[50rpx] text-[#1677FF] font-700">
              {{ item.value }}
            </text>
            <text class="mt-2 text-[26rpx] leading-[34rpx] text-[#6B7280]">
              {{ item.label }}
            </text>
          </view>
        </view>
      </view>
    </view>

    <view class="relative z-1 px-4 mt-3">
      <view class="bg-white rounded-[28rpx] px-4 pt-5 pb-4 shadow-sm">
        <view class="flex items-center justify-between">
          <text class="text-[36rpx] leading-[44rpx] text-[#1F2937] font-700">我的订单</text>
          <view class="flex items-center" @tap="goOrderList('all')">
            <text class="text-[26rpx] text-[#9CA3AF]">查看全部</text>
            <text class="i-carbon-chevron-right text-[30rpx] text-[#B8BEC8] ml-1" />
          </view>
        </view>

        <view class="mt-6 flex items-start">
          <view
            v-for="item in orderEntries"
            :key="item.action"
            class="flex-1 center flex-col min-w-0"
            @tap="goOrderList(item.action)"
          >
            <view class="relative w-[68rpx] h-[68rpx] rounded-[18rpx] bg-[#F3F7FF] center">
              <text :class="item.icon" class="text-[42rpx] text-[#1677FF]" />
              <view
                v-if="item.count > 0"
                class="absolute right-[-8rpx] top-[-8rpx] min-w-[32rpx] h-[32rpx] px-[8rpx] rounded-full bg-[#EF4444] center border-2 border-white"
              >
                <text class="text-[18rpx] leading-[24rpx] text-white font-600">{{ formatBadge(item.count) }}</text>
              </view>
            </view>
            <text class="mt-3 text-[26rpx] leading-[34rpx] text-[#2F3542] whitespace-nowrap">
              {{ item.label }}
            </text>
          </view>
        </view>
      </view>

      <view class="mt-3 bg-white rounded-[28rpx] px-4 pt-5 pb-3 shadow-sm">
        <text class="block text-[36rpx] leading-[44rpx] text-[#1F2937] font-700">我的应用</text>

        <view class="mt-5 flex flex-wrap">
          <view
            v-for="item in displayAppEntries"
            :key="item.action"
            class="w-1/4 h-[156rpx] center flex-col"
            @tap="onAppTap(item)"
          >
            <view
              class="w-[92rpx] h-[92rpx] rounded-full center"
              :style="{ backgroundColor: item.color }"
            >
              <text :class="item.icon" class="text-[48rpx] text-white" />
            </view>
            <text class="mt-3 max-w-full truncate text-[26rpx] leading-[34rpx] text-[#1F2937]">
              {{ item.label }}
            </text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>
