<script lang="ts" setup>
import { useTokenStore } from '@/store/token'
import { useUserStore } from '@/store/user'

definePage({
  style: {
    navigationBarTitleText: '我的',
    navigationBarBackgroundColor: '#F5F7FA',
    navigationBarTextStyle: 'black',
  },
})

const tokenStore = useTokenStore()
const userStore = useUserStore()

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

const mockOrderStats = {
  pendingPayment: 1,
  pendingDispatch: 1,
  pendingConfirm: 1,
  pendingReview: 1,
  afterSales: 0,
}

const profileStats = computed(() => mockProfileStats)

const displayName = computed(() => {
  if (!tokenStore.hasLogin)
    return '未登录'
  return userStore.userInfo.nickname || (userStore.userInfo.userId > 0 ? `用户${userStore.userInfo.userId}` : '微信用户')
})

const displayPhone = computed(() => {
  if (!tokenStore.hasLogin)
    return '点击登录后查看个人信息'
  return formatPhone(userStore.userInfo.phone) || '未绑定手机号'
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
  { label: '待付款', action: 'pendingPayment', icon: 'i-carbon-wallet', count: mockOrderStats.pendingPayment },
  { label: '待接单', action: 'pendingDispatch', icon: 'i-carbon-time', count: mockOrderStats.pendingDispatch },
  { label: '待验收', action: 'pendingConfirm', icon: 'i-carbon-document-tasks', count: mockOrderStats.pendingConfirm },
  { label: '待评价', action: 'pendingReview', icon: 'i-carbon-chat', count: mockOrderStats.pendingReview },
  { label: '售后', action: 'afterSales', icon: 'i-carbon-shopping-bag', count: mockOrderStats.afterSales },
])

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
    return tokenStore.hasLogin && userStore.userInfo.role === 'staff'
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

function onLogout() {
  uni.showModal({
    title: '提示',
    content: '确定退出登录？',
    success: (res) => {
      if (res.confirm) {
        tokenStore.logout()
        uni.showToast({ icon: 'success', title: '已退出' })
      }
    },
  })
}

function formatPhone(phone: string) {
  if (!phone)
    return ''
  if (phone.length < 7)
    return phone
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
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

function onProfileTap() {
  if (!tokenStore.hasLogin)
    onLogin()
}

function onStatTap(action: StatAction) {
  requireLogin(() => {
    const titleMap: Record<StatAction, string> = {
      wallet: '钱包功能待完善',
      card: '卡包功能待完善',
      coupon: '优惠券功能待完善',
    }
    showPendingToast(titleMap[action])
  })
}

function goOrderList(action: OrderAction = 'all') {
  requireLogin(() => {
    const statusMap: Partial<Record<OrderAction, string>> = {
      pendingPayment: 'pending_payment',
      pendingDispatch: 'pending_dispatch',
      pendingConfirm: 'pending_confirm',
      pendingReview: 'completed',
    }

    if (action === 'afterSales') {
      showPendingToast('售后功能待完善')
      return
    }

    const status = statusMap[action]
    uni.navigateTo({
      url: status ? `/pages/order/list?status=${status}` : '/pages/order/list',
    })
  })
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
    if (userStore.userInfo.role !== 'staff') {
      showPendingToast('当前账号暂未开通师傅端')
      return
    }
    uni.navigateTo({ url: '/pages/staff/home' })
    return
  }

  const titleMap: Record<Exclude<AppAction, 'address' | 'staffWorkbench'>, string> = {
    applyStaff: '申请师傅功能待完善',
    applyPartner: '申请合作商功能待完善',
    faq: '常见问题待配置',
    customerService: '客服信息待配置',
    feedback: '问题反馈功能待完善',
    settings: '设置功能待完善',
  }
  showPendingToast(titleMap[item.action])
}
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[150rpx]">
    <view class="pt-safe px-4 pt-4">
      <view class="bg-white rounded-[28rpx] px-4 pt-5 pb-4 shadow-sm">
        <view class="flex items-center" @tap="onProfileTap">
          <view class="w-[128rpx] h-[128rpx] rounded-full bg-[#EAF3FF] center overflow-hidden shrink-0">
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
            <text class="block truncate text-[42rpx] leading-[52rpx] text-[#1F2937] font-700">
              {{ displayName }}
            </text>
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
            @tap="onStatTap(item.action)"
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

    <view v-if="tokenStore.hasLogin" class="mx-4 mt-6">
      <button
        class="w-full h-[84rpx] bg-white text-[28rpx] text-[#6B7280] rounded-[24rpx] center shadow-sm"
        @tap="onLogout"
      >
        退出登录
      </button>
    </view>
  </view>
</template>
