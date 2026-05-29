<script lang="ts" setup>
import type { StaffTask, StaffTaskGroup } from '@/api/types/staff'
import { acceptStaffTask, getStaffDashboard, getStaffTasks, rejectStaffTask } from '@/api/staff'

definePage({
  style: {
    navigationBarTitleText: '任务大厅',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
  },
})

const currentGroup = ref<StaffTaskGroup>('dispatch')
const loading = ref(false)
const tasks = ref<StaffTask[]>([])
const dashboard = ref({
  pendingTaskCount: 0,
  dispatchTaskCount: 0,
  processingTaskCount: 0,
  completedTaskCount: 0,
  todayEstimatedIncome: 0,
})

const tabs: { label: string, value: StaffTaskGroup }[] = [
  { label: '抢单任务', value: 'grab' },
  { label: '待分配任务', value: 'dispatch' },
]

async function loadData() {
  loading.value = true
  try {
    const [dashboardData, taskData] = await Promise.all([
      getStaffDashboard(),
      getStaffTasks({ group: currentGroup.value }),
    ])
    dashboard.value = dashboardData
    tasks.value = taskData.filter(item => item.status !== 'completed' && item.status !== 'cancelled' && item.status !== 'rejected')
  }
  finally {
    loading.value = false
  }
}

function onWriteOrder() {
  uni.navigateTo({ url: '/pages/staff/write-order' })
}

function onTaskTap(task: StaffTask) {
  uni.navigateTo({ url: `/pages/staff/order-detail?id=${task.id}` })
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
    content: '确定拒绝该任务吗？',
    success: async (res) => {
      if (!res.confirm)
        return
      await rejectStaffTask(task.id)
      uni.showToast({ icon: 'success', title: '已拒单' })
      loadData()
    },
  })
}

function onTabTap(value: StaffTaskGroup) {
  if (currentGroup.value === value)
    return
  currentGroup.value = value
  loadData()
}

onShow(() => {
  loadData()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[150rpx]">
    <view class="bg-white px-[32rpx] pt-[32rpx] pb-[24rpx]">
      <view class="flex items-center justify-between">
        <view>
          <text class="block text-[48rpx] leading-[58rpx] text-[#1F2937] font-800">任务大厅</text>
          <text class="block mt-[8rpx] text-[24rpx] text-[#9CA3AF]">处理派单、抢单与今日服务</text>
        </view>
        <view class="h-[64rpx] px-[24rpx] rounded-full bg-[#FFECEF] flex items-center" @tap="onWriteOrder">
          <text class="i-carbon-add text-[28rpx] text-[#FF373D] mr-[8rpx]" />
          <text class="text-[26rpx] text-[#FF373D] font-600">录入订单</text>
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

    <view class="bg-white mt-[2rpx] px-[32rpx]">
      <view class="flex">
        <view
          v-for="tab in tabs"
          :key="tab.value"
          class="flex-1 h-[104rpx] flex flex-col items-center justify-center"
          @tap="onTabTap(tab.value)"
        >
          <text
            class="text-[32rpx]"
            :class="currentGroup === tab.value ? 'text-[#FF373D] font-700' : 'text-[#1F2937]'"
          >
            {{ tab.label }}
          </text>
          <view
            class="mt-[16rpx] h-[8rpx] w-[72rpx] rounded-full"
            :class="currentGroup === tab.value ? 'bg-[#FF373D]' : 'bg-transparent'"
          />
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
          <text class="i-carbon-search text-[96rpx] text-[#C4C8D0]" />
        </view>
        <text class="mt-[28rpx] text-[34rpx] text-[#8A8F99]">空空如也</text>
      </view>
    </loading-state>

    <staff-tabbar active="home" />
  </view>
</template>
