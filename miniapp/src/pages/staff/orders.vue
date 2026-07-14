<script lang="ts" setup>
import type { StaffOrderFilter, StaffTask } from '@/api/types/staff'
import { acceptStaffTask, checkinStaffTask, completeStaffTask, getStaffTasks, rejectStaffTask, startStaffTask } from '@/api/staff'

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
  uni.navigateTo({ url: `/pages/staff/order-detail?id=${task.id}` })
}

function chooseActualMinutes(task: StaffTask) {
  return new Promise<number | undefined>((resolve) => {
    if (!(task.memberCardName && task.serviceCardType === 'time')) {
      resolve(undefined)
      return
    }
    const planned = task.plannedConsumeUnits || task.memberCardConsumeUnits || 120
    const half = Math.max(1, Math.ceil(planned / 2))
    const options = Array.from(new Set([half, planned])).map(value => ({ label: `${value} 分钟`, value }))
    const customIndex = options.length
    uni.showActionSheet({
      itemList: [...options.map(item => item.label), '手动输入'],
      success: (res) => {
        if (res.tapIndex === customIndex) {
          inputActualMinutes(planned).then(resolve)
          return
        }
        resolve(options[res.tapIndex]?.value)
      },
      fail: () => resolve(undefined),
    })
  })
}

function inputActualMinutes(planned: number) {
  return new Promise<number | undefined>((resolve) => {
    ;(uni.showModal as any)({
      title: '确认实际服务时长',
      editable: true,
      placeholderText: `请输入 1-${planned} 分钟`,
      success: (res: any) => {
        if (!res.confirm) {
          resolve(undefined)
          return
        }
        const minutes = Number(res.content)
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > planned) {
          uni.showToast({ icon: 'none', title: '时长不正确' })
          resolve(undefined)
          return
        }
        resolve(minutes)
      },
      fail: () => resolve(undefined),
    })
  })
}

async function completeTask(task: StaffTask) {
  if (!task.photos?.length) {
    uni.showToast({ icon: 'none', title: '请先上传服务照片' })
    uni.navigateTo({ url: `/pages/staff/upload-photos?id=${task.id}` })
    return
  }
  const actualMinutes = await chooseActualMinutes(task)
  if (task.memberCardName && task.serviceCardType === 'time' && !actualMinutes)
    return

  await completeStaffTask(task.id, {
    version: task.version,
    actualMinutes,
    photoUrls: task.photos.map(photo => photo.ossUrl || photo.url),
  })
  uni.showToast({ icon: 'success', title: '已提交' })
  loadTasks()
}

async function runPrimary(task: StaffTask) {
  if (task.status === 'pending_accept') {
    await acceptStaffTask(task.id)
    uni.showToast({ icon: 'success', title: '已接单' })
  }
  else if (task.status === 'accepted') {
    await checkinStaffTask(task.id, task.version)
    uni.showToast({ icon: 'success', title: '已出发' })
  }
  else if (task.status === 'on_the_way') {
    await startStaffTask(task.id, task.version)
    uni.showToast({ icon: 'success', title: '已开始' })
  }
  else if (task.status === 'in_service') {
    await completeTask(task)
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
  if (task.status === 'pending_accept') {
    uni.showModal({
      title: '拒单确认',
      content: '确定拒绝这笔订单吗？',
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
