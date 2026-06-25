<script lang="ts" setup>
import type { StaffOrderFilter, StaffTask } from '@/api/types/staff'
import { acceptStaffTask, checkinStaffTask, claimStaffTask, completeStaffTask, getStaffTasks, rejectStaffTask, startStaffTask } from '@/api/staff'

definePage({
  style: {
    navigationBarTitleText: '订单管理',
  },
})

const currentStatus = ref<StaffOrderFilter>('pending')
const loading = ref(false)
const tasks = ref<StaffTask[]>([])

const tabs: { label: string, value: StaffOrderFilter }[] = [
  { label: '待接单', value: 'pending' },
  { label: '进行中', value: 'processing' },
  { label: '已完成', value: 'completed' },
]

async function loadTasks() {
  loading.value = true
  try {
    tasks.value = await getStaffTasks({ status: currentStatus.value })
  }
  finally {
    loading.value = false
  }
}

function onTabTap(value: StaffOrderFilter) {
  currentStatus.value = value
  loadTasks()
}

function onTaskTap(task: StaffTask) {
  uni.navigateTo({ url: `/pages/staff/order-detail?id=${task.id}&group=${task.group}` })
}

async function runPrimary(task: StaffTask) {
  if (task.status === 'pending_accept') {
    if (task.group === 'grab') {
      await claimStaffTask(task.id, task.version)
      uni.showToast({ icon: 'success', title: '领取成功' })
    }
    else {
      await acceptStaffTask(task.id)
      uni.showToast({ icon: 'success', title: '已接单' })
    }
  }
  else if (task.status === 'accepted') {
    await checkinStaffTask(task.id, task.version)
    uni.showToast({ icon: 'success', title: '已打卡' })
  }
  else if (task.status === 'on_the_way') {
    await startStaffTask(task.id, task.version)
    uni.showToast({ icon: 'success', title: '已开始' })
  }
  else if (task.status === 'in_service') {
    uni.showModal({
      title: '完成服务',
      content: '确认已完成现场服务吗？',
      success: async (res) => {
        if (!res.confirm)
          return
        await completeStaffTask(task.id, { version: task.version, photoUrls: task.photos?.map(photo => photo.ossUrl || photo.url) || [] })
        uni.showToast({ icon: 'success', title: '已提交' })
        loadTasks()
      },
    })
    return
  }
  else {
    onTaskTap(task)
    return
  }
  loadTasks()
}

function onPrimary(task: StaffTask) {
  runPrimary(task)
}

function onSecondary(task: StaffTask) {
  if (task.status === 'pending_accept' && task.group === 'dispatch') {
    uni.showModal({
      title: '拒单确认',
      content: '确定拒绝该订单吗？',
      success: async (res) => {
        if (!res.confirm)
          return
        await rejectStaffTask(task.id, 'staff rejected', task.version)
        uni.showToast({ icon: 'success', title: '已拒单' })
        loadTasks()
      },
    })
    return
  }
  if (task.status === 'in_service') {
    uni.navigateTo({ url: `/pages/staff/upload-photos?id=${task.id}` })
    return
  }
  onTaskTap(task)
}

onLoad((query) => {
  const status = String(query?.status || 'pending') as StaffOrderFilter
  if (tabs.some(tab => tab.value === status))
    currentStatus.value = status
})

onShow(() => {
  loadTasks()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[150rpx]">
    <view class="bg-white sticky top-0 z-10 px-[24rpx] py-[18rpx]">
      <view class="grid grid-cols-3 rounded-full bg-[#F3F4F6] p-[6rpx]">
        <view
          v-for="tab in tabs"
          :key="tab.value"
          class="h-[64rpx] rounded-full flex items-center justify-center"
          :class="currentStatus === tab.value ? 'bg-[#FF373D]' : 'bg-transparent'"
          @tap="onTabTap(tab.value)"
        >
          <text class="text-[26rpx]" :class="currentStatus === tab.value ? 'text-white font-700' : 'text-[#6B7280]'">
            {{ tab.label }}
          </text>
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

      <view v-else class="mx-[24rpx] mt-[28rpx] rounded-[28rpx] bg-white">
        <empty-state title="暂无订单" description="当前状态下没有需要处理的订单" />
      </view>
    </loading-state>

    <staff-tabbar active="orders" />
  </view>
</template>
