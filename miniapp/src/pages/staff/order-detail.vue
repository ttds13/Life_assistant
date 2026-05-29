<script lang="ts" setup>
import type { StaffTask, StaffTaskStatus } from '@/api/types/staff'
import { acceptStaffTask, checkinStaffTask, completeStaffTask, getStaffTaskDetail, rejectStaffTask, startStaffTask } from '@/api/staff'

definePage({
  style: {
    navigationBarTitleText: '任务详情',
  },
})

const taskId = ref(0)
const task = ref<StaffTask | null>(null)
const loading = ref(true)
const actionLoading = ref(false)

const statusInfo = computed(() => {
  const map: Record<StaffTaskStatus, { title: string, desc: string, next: string }> = {
    pending_accept: { title: '待接单', desc: '请确认时间和地址后接单', next: '下一步：接单或拒单' },
    accepted: { title: '已接单', desc: '请按预约时间准时上门', next: '下一步：上门打卡' },
    on_the_way: { title: '上门中', desc: '已完成上门打卡', next: '下一步：开始服务' },
    in_service: { title: '服务中', desc: '服务正在进行，请按要求上传照片', next: '下一步：上传照片并完成服务' },
    pending_confirm: { title: '待用户确认', desc: '服务已提交，等待用户确认', next: '下一步：等待确认' },
    completed: { title: '已完成', desc: '订单已完成并进入结算流程', next: '可返回订单列表' },
    rejected: { title: '已拒单', desc: '该任务已拒绝', next: '可返回订单列表' },
    cancelled: { title: '已取消', desc: '该任务已取消', next: '可返回订单列表' },
  }
  return map[task.value?.status || 'pending_accept']
})

const actionConfig = computed(() => {
  const status = task.value?.status
  switch (status) {
    case 'pending_accept':
      return { primary: '接单', secondary: '拒单' }
    case 'accepted':
      return { primary: '上门打卡', secondary: '' }
    case 'on_the_way':
      return { primary: '开始服务', secondary: '' }
    case 'in_service':
      return { primary: '完成服务', secondary: '上传照片' }
    default:
      return { primary: '返回列表', secondary: '' }
  }
})

function rowValue(value?: string) {
  return value || '暂无'
}

async function loadTask() {
  loading.value = true
  task.value = await getStaffTaskDetail(taskId.value || 901)
  loading.value = false
}

function onCallCustomer() {
  if (!task.value?.customerPhone) {
    uni.showToast({ icon: 'none', title: '客户电话待补充' })
    return
  }
  uni.makePhoneCall({ phoneNumber: task.value.customerPhone })
}

function onNavigate() {
  uni.showToast({ icon: 'none', title: '导航功能待接入' })
}

async function doPrimary() {
  if (!task.value)
    return
  actionLoading.value = true
  try {
    if (task.value.status === 'pending_accept') {
      task.value = await acceptStaffTask(task.value.id)
      uni.showToast({ icon: 'success', title: '已接单' })
    }
    else if (task.value.status === 'accepted') {
      task.value = await checkinStaffTask(task.value.id)
      uni.showToast({ icon: 'success', title: '已打卡' })
    }
    else if (task.value.status === 'on_the_way') {
      task.value = await startStaffTask(task.value.id)
      uni.showToast({ icon: 'success', title: '已开始' })
    }
    else if (task.value.status === 'in_service') {
      if (!task.value.photos?.length) {
        uni.showToast({ icon: 'none', title: '请先上传服务照片' })
        return
      }
      uni.showModal({
        title: '完成服务',
        content: '确认已经完成服务并提交给用户确认吗？',
        success: async (res) => {
          if (!res.confirm)
            return
          task.value = await completeStaffTask(task.value!.id)
          uni.showToast({ icon: 'success', title: '已提交' })
        },
      })
    }
    else {
      uni.redirectTo({ url: '/pages/staff/orders?status=processing' })
    }
  }
  finally {
    actionLoading.value = false
  }
}

function onPrimary() {
  doPrimary()
}

function onSecondary() {
  if (!task.value)
    return
  if (task.value.status === 'pending_accept') {
    uni.showModal({
      title: '拒单确认',
      content: '确定拒绝该任务吗？',
      success: async (res) => {
        if (!res.confirm)
          return
        task.value = await rejectStaffTask(task.value!.id)
        uni.showToast({ icon: 'success', title: '已拒单' })
      },
    })
    return
  }
  if (task.value.status === 'in_service') {
    uni.navigateTo({ url: `/pages/staff/upload-photos?id=${task.value.id}` })
  }
}

onLoad((query) => {
  taskId.value = Number(query?.id || 901)
  loadTask()
})

onShow(() => {
  if (taskId.value)
    loadTask()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[170rpx] pt-[2rpx]">
    <loading-state :loading="loading">
      <view v-if="task">
        <view class="mx-[24rpx] mt-[20rpx] rounded-[28rpx] bg-[#FF373D] p-[32rpx]">
          <view class="flex items-center justify-between">
            <text class="text-[42rpx] leading-[52rpx] text-white font-800">{{ statusInfo.title }}</text>
            <staff-status-tag :status="task.status" />
          </view>
          <text class="block mt-[12rpx] text-[26rpx] text-white opacity-85">{{ statusInfo.desc }}</text>
          <text class="block mt-[18rpx] text-[24rpx] text-white opacity-75">{{ statusInfo.next }}</text>
        </view>

        <form-section title="服务信息">
          <text class="block text-[32rpx] text-[#1F2937] font-700">{{ task.serviceName }}</text>
          <text class="block mt-[10rpx] text-[26rpx] text-[#6B7280]">{{ rowValue(task.serviceSpec) }}</text>
          <view class="mt-[18rpx] rounded-[16rpx] bg-[#F9FAFB] p-[20rpx]">
            <text class="text-[26rpx] leading-[38rpx] text-[#4B5563]">{{ rowValue(task.serviceRequirement) }}</text>
          </view>
        </form-section>

        <form-section title="预约信息">
          <view class="py-[10rpx] flex">
            <text class="w-[150rpx] text-[26rpx] text-[#9CA3AF]">上门时间</text>
            <text class="flex-1 text-[26rpx] text-[#1F2937] font-600">{{ task.appointmentTime }}</text>
          </view>
          <view class="py-[10rpx] flex">
            <text class="w-[150rpx] text-[26rpx] text-[#9CA3AF]">客户姓名</text>
            <text class="flex-1 text-[26rpx] text-[#4B5563]">{{ task.customerName }}</text>
          </view>
          <view class="py-[10rpx] flex">
            <text class="w-[150rpx] text-[26rpx] text-[#9CA3AF]">客户电话</text>
            <text class="flex-1 text-[26rpx] text-[#4B5563]">{{ rowValue(task.customerPhone) }}</text>
          </view>
          <view class="py-[10rpx] flex">
            <text class="w-[150rpx] text-[26rpx] text-[#9CA3AF]">服务地址</text>
            <text class="flex-1 text-[26rpx] leading-[38rpx] text-[#4B5563]">{{ task.addressText }}</text>
          </view>
          <view class="mt-[18rpx] flex gap-[16rpx]">
            <button class="flex-1 h-[72rpx] rounded-full bg-[#FFECEF] text-[#FF373D] text-[26rpx] flex items-center justify-center" @tap="onCallCustomer">
              联系客户
            </button>
            <button class="flex-1 h-[72rpx] rounded-full bg-[#EAF3FF] text-[#1677FF] text-[26rpx] flex items-center justify-center" @tap="onNavigate">
              导航
            </button>
          </view>
        </form-section>

        <form-section title="备注与提示">
          <view class="rounded-[16rpx] bg-[#F9FAFB] p-[20rpx]">
            <text class="text-[26rpx] leading-[38rpx] text-[#4B5563]">{{ task.remark || '用户暂无备注' }}</text>
          </view>
          <view class="mt-[18rpx] rounded-[16rpx] bg-[#FFF7ED] p-[20rpx]">
            <text class="text-[24rpx] leading-[36rpx] text-[#B45309]">平台提示：上门前请核对服务地址，服务过程保留必要照片凭证。</text>
          </view>
        </form-section>

        <form-section title="履约记录">
          <view>
            <view class="flex py-[8rpx]">
              <text class="w-[170rpx] text-[26rpx] text-[#9CA3AF]">接单时间</text>
              <text class="flex-1 text-[26rpx] text-[#4B5563]">{{ rowValue(task.acceptedAt) }}</text>
            </view>
            <view class="flex py-[8rpx]">
              <text class="w-[170rpx] text-[26rpx] text-[#9CA3AF]">打卡时间</text>
              <text class="flex-1 text-[26rpx] text-[#4B5563]">{{ rowValue(task.checkinAt) }}</text>
            </view>
            <view class="flex py-[8rpx]">
              <text class="w-[170rpx] text-[26rpx] text-[#9CA3AF]">开始服务</text>
              <text class="flex-1 text-[26rpx] text-[#4B5563]">{{ rowValue(task.startedAt) }}</text>
            </view>
            <view class="flex py-[8rpx]">
              <text class="w-[170rpx] text-[26rpx] text-[#9CA3AF]">完成时间</text>
              <text class="flex-1 text-[26rpx] text-[#4B5563]">{{ rowValue(task.completedAt) }}</text>
            </view>
          </view>
        </form-section>

        <form-section title="服务照片">
          <upload-image-grid
            :model-value="(task.photos || []).map(item => ({ id: item.id, url: item.url, status: 'done' }))"
            readonly
          />
          <view v-if="!task.photos?.length" class="rounded-[16rpx] bg-[#F9FAFB] p-[20rpx]">
            <text class="text-[26rpx] text-[#6B7280]">暂无服务照片</text>
          </view>
        </form-section>
      </view>
      <empty-state v-else title="任务不存在" />
    </loading-state>

    <bottom-action-bar
      v-if="task"
      primary-color="red"
      :primary-text="actionConfig.primary"
      :secondary-text="actionConfig.secondary"
      :loading="actionLoading"
      @primary="onPrimary"
      @secondary="onSecondary"
    />
  </view>
</template>
