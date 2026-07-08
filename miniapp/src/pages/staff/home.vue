<script lang="ts" setup>
import type { StaffTask } from '@/api/types/staff'
import { acceptStaffTask, getStaffDashboard, getStaffTasks, getStaffUnreadCount, rejectStaffTask } from '@/api/staff'

definePage({
  style: {
    navigationBarTitleText: '我的任务',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
  },
})

const loading = ref(false)
const tasks = ref<StaffTask[]>([])
const unreadCount = ref(0)
const dashboard = ref({
  pendingTaskCount: 0,
  dispatchTaskCount: 0,
  processingTaskCount: 0,
  completedTaskCount: 0,
  todayEstimatedIncome: 0,
})

async function loadData() {
  loading.value = true
  try {
    const [dashboardData, taskData] = await Promise.all([
      getStaffDashboard(),
      getStaffTasks(),
    ])
    getStaffUnreadCount()
      .then((result) => {
        unreadCount.value = result.unreadCount || result.count || 0
      })
      .catch(() => {
        unreadCount.value = 0
      })
    dashboard.value = dashboardData
    tasks.value = taskData.filter(item => !['completed', 'cancelled', 'rejected'].includes(item.status))
  }
  finally {
    loading.value = false
  }
}

function onTaskTap(task: StaffTask) {
  uni.navigateTo({ url: `/pages/staff/order-detail?id=${task.id}` })
}

function goNotifications() {
  uni.navigateTo({ url: '/pages/staff/notifications' })
}

async function onPrimary(task: StaffTask) {
  if (task.status === 'pending_accept') {
    await acceptStaffTask(task.id)
    uni.showToast({ icon: 'success', title: '已接单' })
    loadData()
    return
  }
  onTaskTap(task)
}

function onSecondary(task: StaffTask) {
  if (task.status !== 'pending_accept') {
    onTaskTap(task)
    return
  }
  uni.showModal({
    title: '拒单确认',
    content: '确定拒绝这笔已分配任务吗？',
    success: async (res) => {
      if (!res.confirm)
        return
      await rejectStaffTask(task.id, 'staff rejected', task.version)
      uni.showToast({ icon: 'success', title: '已拒单' })
      loadData()
    },
  })
}

onShow(() => {
  loadData()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[150rpx]">
    <view class="bg-white px-[32rpx] pt-[32rpx] pb-[24rpx]">
      <view class="flex items-start justify-between gap-3">
        <view class="min-w-0 flex-1">
          <text class="block text-[48rpx] leading-[58rpx] text-[#1F2937] font-800">我的任务</text>
          <text class="block mt-[8rpx] text-[24rpx] text-[#9CA3AF]">只显示后台分配给你的订单</text>
        </view>
        <view class="relative h-[72rpx] w-[72rpx] rounded-full bg-[#F3F7FF] flex items-center justify-center" @tap="goNotifications">
          <text class="i-carbon-notification text-[38rpx] text-[#1677FF]" />
          <view v-if="unreadCount > 0" class="absolute right-[-6rpx] top-[-6rpx] min-w-[32rpx] h-[32rpx] rounded-full bg-[#EF4444] px-[8rpx] flex items-center justify-center">
            <text class="text-[18rpx] text-white font-700">{{ unreadCount > 99 ? '99+' : unreadCount }}</text>
          </view>
        </view>
      </view>

      <view class="grid grid-cols-4 gap-[16rpx] mt-[28rpx]">
        <view class="rounded-[18rpx] bg-[#F9FAFB] p-[18rpx]">
          <text class="block text-[34rpx] text-[#1F2937] font-700">{{ dashboard.pendingTaskCount }}</text>
          <text class="block mt-[4rpx] text-[22rpx] text-[#6B7280]">待接单</text>
        </view>
        <view class="rounded-[18rpx] bg-[#F9FAFB] p-[18rpx]">
          <text class="block text-[34rpx] text-[#1F2937] font-700">{{ dashboard.processingTaskCount }}</text>
          <text class="block mt-[4rpx] text-[22rpx] text-[#6B7280]">进行中</text>
        </view>
        <view class="rounded-[18rpx] bg-[#F9FAFB] p-[18rpx]">
          <text class="block text-[34rpx] text-[#1F2937] font-700">{{ dashboard.completedTaskCount }}</text>
          <text class="block mt-[4rpx] text-[22rpx] text-[#6B7280]">已完成</text>
        </view>
        <view class="rounded-[18rpx] bg-[#F9FAFB] p-[18rpx]">
          <text class="block text-[34rpx] text-[#FF373D] font-700">{{ dashboard.todayEstimatedIncome }}</text>
          <text class="block mt-[4rpx] text-[22rpx] text-[#6B7280]">预计收入</text>
        </view>
      </view>
    </view>

    <loading-state :loading="loading">
      <view v-if="tasks.length" class="pt-[4rpx]">
        <staff-task-card
          v-for="task in tasks"
          :key="task.id"
          :task="task"
          @tap="onTaskTap"
          @primary="onPrimary"
          @secondary="onSecondary"
        />
      </view>

      <view v-else class="mx-[24rpx] mt-[28rpx] rounded-[28rpx] bg-white min-h-[620rpx] flex flex-col items-center justify-center">
        <view class="w-[180rpx] h-[180rpx] rounded-full bg-[#F3F4F6] flex items-center justify-center">
          <text class="i-carbon-task text-[96rpx] text-[#C4C8D0]" />
        </view>
        <text class="mt-[28rpx] text-[34rpx] text-[#8A8F99]">暂无分配任务</text>
      </view>
    </loading-state>

    <staff-tabbar active="home" />
  </view>
</template>
