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
    pending_accept: { title: '待接单', desc: '请确认预约时间和地址后接单', next: '下一步：接单或拒单' },
    accepted: { title: '已接单', desc: '请按预约时间准时上门', next: '下一步：出发上门' },
    on_the_way: { title: '已出发', desc: '已记录出发时间', next: '下一步：开始服务' },
    in_service: { title: '服务中', desc: '服务完成前请上传现场照片', next: '下一步：上传照片并完成服务' },
    pending_confirm: { title: '待用户确认', desc: '服务已提交，等待用户确认或系统自动确认', next: '可查看履约记录' },
    completed: { title: '已完成', desc: '订单已完成', next: '可返回订单列表' },
    rejected: { title: '已拒单', desc: '该任务已拒绝', next: '可返回订单列表' },
    cancelled: { title: '已取消', desc: '该任务已取消', next: '可返回订单列表' },
  }
  return map[task.value?.status || 'pending_accept']
})

const actionConfig = computed(() => {
  switch (task.value?.status) {
    case 'pending_accept':
      return { primary: '接单', secondary: '拒单' }
    case 'accepted':
      return { primary: '出发上门', secondary: '' }
    case 'on_the_way':
      return { primary: '开始服务', secondary: '' }
    case 'in_service':
      return { primary: '完成服务', secondary: '上传照片' }
    default:
      return { primary: '返回列表', secondary: '' }
  }
})

function rowValue(value?: string | null) {
  return value || '暂无'
}

async function loadTask() {
  loading.value = true
  try {
    task.value = await getStaffTaskDetail(taskId.value)
  }
  finally {
    loading.value = false
  }
}

function onCallCustomer() {
  if (!task.value?.customerPhone) {
    uni.showToast({ icon: 'none', title: '客户电话待补充' })
    return
  }
  uni.makePhoneCall({ phoneNumber: task.value.customerPhone })
}

function onNavigate() {
  if (!task.value)
    return
  if (task.value.latitude && task.value.longitude) {
    uni.openLocation({
      latitude: task.value.latitude,
      longitude: task.value.longitude,
      name: task.value.customerName || '服务地址',
      address: task.value.addressText,
    })
    return
  }
  uni.setClipboardData({
    data: task.value.addressText,
    success: () => uni.showToast({ icon: 'success', title: '地址已复制' }),
  })
}

function chooseActualMinutes(current: StaffTask) {
  return new Promise<number | undefined>((resolve) => {
    if (!(current.memberCardName && current.serviceCardType === 'time')) {
      resolve(undefined)
      return
    }
    const planned = current.plannedConsumeUnits || current.memberCardConsumeUnits || 120
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

function formatTaskCardUnits(value?: number) {
  return `${Number(value || 0)}${task.value?.memberCardUnitName || '分钟'}`
}

async function completeCurrentTask(current: StaffTask) {
  if (!current.photos?.length) {
    uni.showToast({ icon: 'none', title: '请先上传服务照片' })
    uni.navigateTo({ url: `/pages/staff/upload-photos?id=${current.id}` })
    return
  }

  const actualMinutes = await chooseActualMinutes(current)
  if (current.memberCardName && current.serviceCardType === 'time' && !actualMinutes)
    return

  task.value = await completeStaffTask(current.id, {
    version: current.version,
    actualMinutes,
    photoUrls: current.photos.map(photo => photo.ossUrl || photo.url),
  })
  uni.showToast({ icon: 'success', title: '已提交' })
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
      task.value = await checkinStaffTask(task.value.id, task.value.version)
      uni.showToast({ icon: 'success', title: '已出发' })
    }
    else if (task.value.status === 'on_the_way') {
      task.value = await startStaffTask(task.value.id, task.value.version)
      uni.showToast({ icon: 'success', title: '已开始' })
    }
    else if (task.value.status === 'in_service') {
      await completeCurrentTask(task.value)
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
      content: '确定拒绝这笔任务吗？',
      success: async (res) => {
        if (!res.confirm)
          return
        task.value = await rejectStaffTask(task.value!.id, 'staff rejected', task.value!.version)
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
  taskId.value = Number(query?.id || 0)
  if (taskId.value)
    loadTask()
  else
    loading.value = false
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
          <text class="block mt-[10rpx] text-[26rpx] text-[#6B7280]">{{ task.serviceTypeText || rowValue(task.serviceSpec) }}</text>
          <view class="mt-[18rpx] rounded-[16rpx] bg-[#F9FAFB] p-[20rpx]">
            <text class="text-[26rpx] leading-[38rpx] text-[#4B5563]">{{ rowValue(task.serviceRequirement) }}</text>
          </view>
        </form-section>

        <form-section title="会员卡/计费">
          <view class="rounded-[16rpx] bg-[#F9FAFB] p-[20rpx]">
            <text class="text-[26rpx] leading-[38rpx] text-[#4B5563]">{{ task.memberCardTip || '本订单不使用会员卡' }}</text>
          </view>
          <view v-if="task.memberCardName" class="mt-[16rpx] grid grid-cols-3 gap-[12rpx]">
            <view class="rounded-[14rpx] bg-[#FFF7ED] p-[16rpx]">
              <text class="block text-[22rpx] text-[#B45309]">冻结</text>
              <text class="block mt-[6rpx] text-[28rpx] text-[#92400E] font-700">{{ task.frozenUnits || task.plannedConsumeUnits || 0 }}{{ task.memberCardUnitName }}</text>
            </view>
            <view class="rounded-[14rpx] bg-[#ECFDF5] p-[16rpx]">
              <text class="block text-[22rpx] text-[#047857]">已扣</text>
              <text class="block mt-[6rpx] text-[28rpx] text-[#047857] font-700">{{ task.actualConsumeUnits || 0 }}{{ task.memberCardUnitName }}</text>
            </view>
            <view class="rounded-[14rpx] bg-[#EAF3FF] p-[16rpx]">
              <text class="block text-[22rpx] text-[#1677FF]">释放</text>
              <text class="block mt-[6rpx] text-[28rpx] text-[#1677FF] font-700">{{ task.releasedUnits || 0 }}{{ task.memberCardUnitName }}</text>
            </view>
          </view>
          <view v-if="task.memberCardName" class="mt-[12rpx] grid grid-cols-3 gap-[12rpx]">
            <view class="rounded-[14rpx] bg-white p-[16rpx]">
              <text class="block text-[22rpx] text-[#9CA3AF]">卡总剩余</text>
              <text class="block mt-[6rpx] text-[28rpx] text-[#374151] font-700">{{ formatTaskCardUnits(task.memberCardRemainingUnits) }}</text>
            </view>
            <view class="rounded-[14rpx] bg-white p-[16rpx]">
              <text class="block text-[22rpx] text-[#9CA3AF]">卡已冻结</text>
              <text class="block mt-[6rpx] text-[28rpx] text-[#374151] font-700">{{ formatTaskCardUnits(task.memberCardFrozenUnits) }}</text>
            </view>
            <view class="rounded-[14rpx] bg-white p-[16rpx]">
              <text class="block text-[22rpx] text-[#9CA3AF]">可用余额</text>
              <text class="block mt-[6rpx] text-[28rpx] text-[#374151] font-700">{{ formatTaskCardUnits(task.memberCardUsableUnits) }}</text>
            </view>
          </view>
        </form-section>

        <form-section title="预约信息">
          <view class="py-[10rpx] flex">
            <text class="w-[150rpx] text-[26rpx] text-[#9CA3AF]">上门时间</text>
            <text class="flex-1 text-[26rpx] text-[#1F2937] font-600">{{ task.appointmentTime }}</text>
          </view>
          <view class="py-[10rpx] flex">
            <text class="w-[150rpx] text-[26rpx] text-[#9CA3AF]">客户姓名</text>
            <text class="flex-1 text-[26rpx] text-[#4B5563]">{{ task.customerName || '暂无' }}</text>
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
              导航/复制地址
            </button>
          </view>
        </form-section>

        <form-section title="备注与提示">
          <view class="rounded-[16rpx] bg-[#F9FAFB] p-[20rpx]">
            <text class="text-[26rpx] leading-[38rpx] text-[#4B5563]">{{ task.remark || '用户暂无备注' }}</text>
          </view>
          <view class="mt-[18rpx] rounded-[16rpx] bg-[#FFF7ED] p-[20rpx]">
            <text class="text-[24rpx] leading-[36rpx] text-[#B45309]">完成服务前请上传至少 1 张现场照片。会员卡时间类订单完成时请选择实际服务时长。</text>
          </view>
        </form-section>

        <form-section title="履约记录">
          <view>
            <view class="flex py-[8rpx]">
              <text class="w-[170rpx] text-[26rpx] text-[#9CA3AF]">接单时间</text>
              <text class="flex-1 text-[26rpx] text-[#4B5563]">{{ rowValue(task.acceptedAt) }}</text>
            </view>
            <view class="flex py-[8rpx]">
              <text class="w-[170rpx] text-[26rpx] text-[#9CA3AF]">出发时间</text>
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
            :model-value="(task.photos || []).map(item => ({ id: item.id, url: item.ossUrl || item.url, displayUrl: item.displayUrl || item.url, status: 'done' }))"
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
