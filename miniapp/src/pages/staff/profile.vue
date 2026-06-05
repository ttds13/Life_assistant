<script lang="ts" setup>
import type { StaffProfileStats, StaffStatsPeriod } from '@/api/types/staff'
import { getStaffProfile } from '@/api/staff'

definePage({
  style: {
    navigationBarTitleText: '个人中心',
    navigationBarBackgroundColor: '#FF373D',
    navigationBarTextStyle: 'white',
  },
})

const period = ref<StaffStatsPeriod>('today')
const staffName = ref('黄岛爱干净')
const avatar = ref('/static/images/default-avatar.png')
const verified = ref(true)
const staffPhone = ref('')
const statsMap = ref<Record<StaffStatsPeriod, StaffProfileStats> | null>(null)

const periodTabs: { label: string, value: StaffStatsPeriod }[] = [
  { label: '本日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '总数', value: 'total' },
]

const currentStats = computed(() => statsMap.value?.[period.value])

const statItems = computed(() => [
  { label: '新增师傅', value: currentStats.value?.newStaffCount || 0 },
  { label: '新增订单', value: currentStats.value?.newOrderCount || 0 },
  { label: '录入订单', value: currentStats.value?.writeOrderCount || 0 },
  { label: '完成订单', value: currentStats.value?.completedOrderCount || 0 },
])

const appEntries = [
  { label: '地址管理', icon: 'i-carbon-location' },
  { label: '我的钱包', icon: 'i-carbon-wallet' },
  { label: '我的服务', icon: 'i-carbon-user-role' },
  { label: '证件管理', icon: 'i-carbon-id' },
  { label: '证件结算', icon: 'i-carbon-document' },
]

const otherEntries = [
  { label: '资料认证', icon: 'i-carbon-certificate' },
  { label: '服务规则', icon: 'i-carbon-document-tasks' },
  { label: '联系客服', icon: 'i-carbon-headset' },
  { label: '设置', icon: 'i-carbon-settings' },
]

function formatMoney(value?: number) {
  const amount = Number(value || 0)
  return amount % 1 === 0 ? amount.toString() : amount.toFixed(1)
}

async function loadProfile() {
  const profile = await getStaffProfile(period.value)
  staffName.value = profile.staffName
  avatar.value = profile.avatar || '/static/images/default-avatar.png'
  verified.value = profile.verified
  staffPhone.value = profile.staffPhone || profile.regionText || ''
  statsMap.value = profile.stats
}

function goStaffSettings() {
  uni.navigateTo({ url: '/pages/staff/settings' })
}

function onTodo(title: string) {
  if (title === '地址管理') {
    uni.navigateTo({ url: '/pages/staff/address-list' })
    return
  }
  if (title === '设置') {
    goStaffSettings()
    return
  }
  uni.showToast({ icon: 'none', title: `${title}待接入` })
}

function onPeriodTap(value: StaffStatsPeriod) {
  period.value = value
}

onShow(() => {
  loadProfile()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[150rpx]">
    <view class="relative bg-[#FF373D] px-[32rpx] pt-[34rpx] pb-[180rpx]">
      <view class="absolute right-[28rpx] top-[26rpx] flex gap-[24rpx]">
        <text class="i-carbon-chat text-[44rpx] text-white opacity-90" @tap="onTodo('消息')" />
        <text class="i-carbon-qr-code text-[44rpx] text-white opacity-90" @tap="onTodo('二维码')" />
      </view>

      <text class="block text-center text-[44rpx] leading-[54rpx] text-white font-800">个人中心</text>

      <view class="mt-[54rpx] flex items-center">
        <view class="w-[132rpx] h-[132rpx] rounded-full bg-white overflow-hidden flex items-center justify-center" @tap="goStaffSettings">
          <image :src="avatar" class="w-full h-full" mode="aspectFill" />
        </view>
        <view class="ml-[28rpx] flex-1 min-w-0">
          <view class="flex items-center min-w-0 gap-2" @tap="goStaffSettings">
            <text class="truncate text-[42rpx] text-white font-800">{{ staffName }}</text>
            <text class="i-carbon-chevron-right text-[32rpx] text-white opacity-80 shrink-0" />
            <text v-if="verified" class="ml-[4rpx] rounded-[10rpx] border border-white/80 px-[14rpx] py-[4rpx] text-[24rpx] text-white shrink-0">已认证</text>
          </view>
          <view class="mt-[18rpx] flex items-center">
            <text class="i-carbon-phone text-[30rpx] text-white mr-[10rpx]" />
            <text class="truncate text-[28rpx] text-white opacity-90">{{ staffPhone || '手机号未设置' }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="relative z-1 mx-[24rpx] mt-[-132rpx]">
      <view class="rounded-[28rpx] bg-white p-[28rpx]">
        <view class="flex items-center justify-between">
          <text class="text-[36rpx] text-[#1F2937] font-800">
            <text class="text-[#FF373D]">工作</text>统计
          </text>
          <view class="flex rounded-full border border-[#FFB6BA] overflow-hidden">
            <view
              v-for="item in periodTabs"
              :key="item.value"
              class="h-[58rpx] px-[24rpx] flex items-center justify-center"
              :class="period === item.value ? 'bg-[#FF373D]' : 'bg-white'"
              @tap="onPeriodTap(item.value)"
            >
              <text class="text-[26rpx]" :class="period === item.value ? 'text-white font-700' : 'text-[#FF373D]'">
                {{ item.label }}
              </text>
            </view>
          </view>
        </view>

        <view class="grid grid-cols-4 mt-[34rpx]">
          <view v-for="item in statItems" :key="item.label" class="flex flex-col items-center">
            <view class="flex items-baseline">
              <text class="text-[48rpx] leading-[58rpx] text-[#1F2937] font-700">{{ item.value }}</text>
              <text class="ml-[4rpx] text-[24rpx] text-[#1F2937]">人</text>
            </view>
            <text class="mt-[10rpx] text-[24rpx] text-[#8A8F99]">{{ item.label }}</text>
          </view>
        </view>
      </view>

      <view class="mt-[24rpx] rounded-[28rpx] bg-white p-[28rpx]">
        <view class="grid grid-cols-2 gap-[22rpx]">
          <view class="rounded-[22rpx] bg-[#F7F8FA] p-[28rpx] flex items-center justify-between" @tap="onTodo('佣金明细')">
            <view>
              <text class="block text-[48rpx] text-[#1F2937] font-700">{{ formatMoney(currentStats?.commissionAmount) }}</text>
              <text class="block mt-[10rpx] text-[28rpx] text-[#8A8F99]">我的佣金</text>
            </view>
            <view class="w-[88rpx] h-[88rpx] rounded-full bg-[#1EA7E1] flex items-center justify-center">
              <text class="i-carbon-money text-[48rpx] text-white" />
            </view>
          </view>
          <view class="rounded-[22rpx] bg-[#F7F8FA] p-[28rpx] flex items-center justify-between" @tap="onTodo('奖金明细')">
            <view>
              <text class="block text-[48rpx] text-[#1F2937] font-700">{{ formatMoney(currentStats?.bonusAmount) }}</text>
              <text class="block mt-[10rpx] text-[28rpx] text-[#8A8F99]">我的奖金</text>
            </view>
            <view class="w-[88rpx] h-[88rpx] rounded-full bg-[#D99420] flex items-center justify-center">
              <text class="i-carbon-piggy-bank text-[48rpx] text-white" />
            </view>
          </view>
        </view>
      </view>

      <view class="mt-[24rpx] rounded-[28rpx] bg-white p-[28rpx]">
        <text class="text-[36rpx] text-[#1F2937] font-800">
          <text class="text-[#FF373D]">应用</text>管理
        </text>
        <view class="grid grid-cols-4 mt-[34rpx]">
          <view v-for="item in appEntries" :key="item.label" class="flex flex-col items-center" @tap="onTodo(item.label)">
            <view class="w-[92rpx] h-[92rpx] rounded-full bg-[#FF373D] flex items-center justify-center">
              <text :class="item.icon" class="text-[48rpx] text-white" />
            </view>
            <text class="mt-[14rpx] text-[24rpx] text-[#1F2937]">{{ item.label }}</text>
          </view>
        </view>
      </view>

      <view class="mt-[24rpx] rounded-[28rpx] bg-white p-[8rpx]">
        <view
          v-for="item in otherEntries"
          :key="item.label"
          class="h-[96rpx] px-[24rpx] flex items-center border-b border-[#F3F4F6]"
          @tap="onTodo(item.label)"
        >
          <text :class="item.icon" class="text-[36rpx] text-[#FF373D] mr-[18rpx]" />
          <text class="flex-1 text-[28rpx] text-[#1F2937]">{{ item.label }}</text>
          <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
        </view>
      </view>
    </view>
    <staff-tabbar active="profile" />
  </view>
</template>
