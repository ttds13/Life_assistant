<script lang="ts" setup>
import { listStaffNotifications, markStaffNotificationRead, markStaffOrderNotificationsRead } from '@/api/staff'
import type { StaffNotification } from '@/api/types/staff'

definePage({
  style: {
    navigationBarTitleText: '任务通知',
    navigationBarBackgroundColor: '#F5F7FA',
    navigationBarTextStyle: 'black',
  },
})

const loading = ref(false)
const refreshing = ref(false)
const notifications = ref<StaffNotification[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20

const unreadCount = computed(() => notifications.value.filter(item => !item.isRead).length)
const hasMore = computed(() => notifications.value.length < total.value)

async function loadNotifications(reset = true) {
  if (loading.value)
    return
  loading.value = true
  try {
    const nextPage = reset ? 1 : page.value + 1
    const result = await listStaffNotifications({ page: nextPage, pageSize })
    notifications.value = reset ? result.items : notifications.value.concat(result.items)
    total.value = result.total
    page.value = result.page
  }
  finally {
    loading.value = false
    refreshing.value = false
  }
}

async function refreshNotifications() {
  refreshing.value = true
  await loadNotifications(true)
}

async function onNotificationTap(item: StaffNotification) {
  try {
    if (!item.isRead)
      await markStaffNotificationRead(item.id)
    if (item.bizType === 'order' && item.bizId)
      await markStaffOrderNotificationsRead(item.bizId)

    item.isRead = true
    if (item.bizType === 'order' && item.bizId) {
      uni.navigateTo({ url: `/pages/staff/order-detail?id=${item.bizId}` })
      return
    }
    uni.showToast({ icon: 'none', title: '通知已读' })
  }
  catch {
    uni.showToast({ icon: 'none', title: '操作失败，请重试' })
  }
}

function formatTime(value?: string) {
  if (!value)
    return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return value
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

function typeText(type: string) {
  const map: Record<string, string> = {
    order_assigned: '派单任务',
  }
  return map[type] || '平台通知'
}

onShow(() => {
  void loadNotifications(true)
})

onPullDownRefresh(async () => {
  try {
    await refreshNotifications()
  }
  finally {
    uni.stopPullDownRefresh()
  }
})

onReachBottom(() => {
  if (hasMore.value)
    void loadNotifications(false)
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[60rpx] pt-1">
    <view class="mx-4 mt-3 rounded-[18rpx] bg-white p-4">
      <view class="flex items-center justify-between">
        <view>
          <text class="block text-[34rpx] text-[#1F2937] font-700">站内通知</text>
          <text class="block mt-1 text-[24rpx] text-[#6B7280]">后台派单后会在这里生成提醒</text>
        </view>
        <view class="rounded-full bg-[#EAF3FF] px-3 py-1">
          <text class="text-[24rpx] text-[#1677FF] font-700">{{ unreadCount }} 未读</text>
        </view>
      </view>
    </view>

    <loading-state :loading="loading && !notifications.length">
      <view v-if="notifications.length" class="mx-4 mt-3 rounded-[18rpx] bg-white overflow-hidden">
        <view
          v-for="item in notifications"
          :key="item.id"
          class="px-4 py-4 border-b border-[#F3F4F6] last:border-b-0"
          @tap="onNotificationTap(item)"
        >
          <view class="flex items-start gap-3">
            <view
              class="mt-[4rpx] h-[18rpx] w-[18rpx] rounded-full shrink-0"
              :class="item.isRead ? 'bg-[#D1D5DB]' : 'bg-[#1677FF]'"
            />
            <view class="min-w-0 flex-1">
              <view class="flex items-center justify-between gap-2">
                <text class="truncate text-[30rpx] text-[#1F2937] font-700">{{ item.title }}</text>
                <text class="shrink-0 text-[22rpx] text-[#9CA3AF]">{{ formatTime(item.createdAt) }}</text>
              </view>
              <view class="mt-2 flex items-center gap-2">
                <text class="rounded-full bg-[#F3F4F6] px-2 py-[4rpx] text-[22rpx] text-[#6B7280]">{{ typeText(item.type) }}</text>
                <text v-if="item.bizId" class="text-[22rpx] text-[#9CA3AF]">订单 #{{ item.bizId }}</text>
              </view>
              <text class="mt-2 block text-[26rpx] leading-[40rpx] text-[#4B5563]">{{ item.content }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-else class="mx-4 mt-3 min-h-[560rpx] rounded-[18rpx] bg-white flex flex-col items-center justify-center">
        <view class="w-[150rpx] h-[150rpx] rounded-full bg-[#F3F4F6] flex items-center justify-center">
          <text class="i-carbon-notification text-[82rpx] text-[#C4C8D0]" />
        </view>
        <text class="mt-5 text-[32rpx] text-[#6B7280]">暂无通知</text>
      </view>

      <view v-if="notifications.length" class="py-4 text-center">
        <text class="text-[24rpx] text-[#9CA3AF]">
          {{ hasMore ? (loading ? '加载中...' : '上拉加载更多') : '已加载全部通知' }}
        </text>
      </view>
    </loading-state>
  </view>
</template>
