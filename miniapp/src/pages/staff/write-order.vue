<script lang="ts" setup>
import type { CreateStaffOrderPayload, UploadImageItem } from '@/api/types/staff'
import type { Service } from '@/api/types/services'
import { getServices } from '@/api/services'
import { createStaffOrder } from '@/api/staff'

definePage({
  style: {
    navigationBarTitleText: '录入订单',
  },
})

const serviceAddress = ref('')
const customServiceEnabled = ref(false)
const services = ref<Service[]>([])
const selectedService = ref<Service | null>(null)
const appointmentTime = ref('')
const dispatchMode = ref<'platform' | 'specified' | 'none'>('platform')
const photos = ref<UploadImageItem[]>([])
const remark = ref('')
const submitting = ref(false)

const timeOptions = ['今天 14:00-17:00', '今天 18:00-21:00', '明天 09:00-12:00', '明天 14:00-17:00']
const dispatchOptions: { label: string, value: typeof dispatchMode.value }[] = [
  { label: '平台分配', value: 'platform' },
  { label: '指定师傅', value: 'specified' },
  { label: '暂不分配', value: 'none' },
]

const serviceOptions = computed(() => services.value.map(item => item.name))
const selectedServiceName = computed(() => selectedService.value?.name || '')
const selectedDispatchLabel = computed(() => dispatchOptions.find(item => item.value === dispatchMode.value)?.label || '请选择订单分配方式')

function normalizeServiceList(data: any): Service[] {
  if (Array.isArray(data))
    return data

  return data?.items || data?.list || data?.records || []
}

async function loadServices() {
  try {
    const result = await getServices({ page: 1, pageSize: 100 })
    services.value = normalizeServiceList(result)
  }
  catch {
    services.value = []
    uni.showToast({ icon: 'none', title: '服务列表加载失败' })
  }
}

function chooseAddress() {
  serviceAddress.value = '黄岛区长江中路 118 号海岸花园 8 号楼 1201'
  uni.showToast({ icon: 'none', title: '已使用示例地址' })
}

function chooseService() {
  if (!serviceOptions.value.length) {
    uni.showToast({ icon: 'none', title: '暂无可选服务' })
    return
  }

  uni.showActionSheet({
    itemList: serviceOptions.value,
    success: (res) => {
      selectedService.value = services.value[res.tapIndex] || null
    },
  })
}

function chooseTime() {
  uni.showActionSheet({
    itemList: timeOptions,
    success: (res) => {
      appointmentTime.value = timeOptions[res.tapIndex]
    },
  })
}

function chooseDispatchMode() {
  uni.showActionSheet({
    itemList: dispatchOptions.map(item => item.label),
    success: (res) => {
      dispatchMode.value = dispatchOptions[res.tapIndex].value
    },
  })
}

function validate() {
  if (!serviceAddress.value) {
    uni.showToast({ icon: 'none', title: '请添加服务地址' })
    return false
  }
  if (!selectedService.value) {
    uni.showToast({ icon: 'none', title: '请选择预约服务' })
    return false
  }
  if (!selectedService.value.code && !selectedService.value.id) {
    uni.showToast({ icon: 'none', title: '服务数据异常' })
    return false
  }
  if (!appointmentTime.value) {
    uni.showToast({ icon: 'none', title: '请选择上门时间' })
    return false
  }
  if (photos.value.length > 3) {
    uni.showToast({ icon: 'none', title: '环境照片最多 3 张' })
    return false
  }
  return true
}

async function onSubmit() {
  if (!validate())
    return
  submitting.value = true
  try {
    const payload: CreateStaffOrderPayload = {
      serviceAddress: serviceAddress.value,
      customServiceEnabled: customServiceEnabled.value,
      serviceCode: selectedService.value?.code,
      serviceId: selectedService.value?.code ? undefined : selectedService.value?.id,
      appointmentTime: appointmentTime.value,
      dispatchMode: dispatchMode.value,
      photos: photos.value.map((item, index) => ({
        id: item.id || index,
        url: item.ossUrl || item.url,
        ossUrl: item.ossUrl || item.url,
        displayUrl: item.displayUrl || item.url,
        type: item.type,
      })),
      remark: remark.value,
    }
    await createStaffOrder(payload)
    uni.showToast({ icon: 'success', title: '已录入' })
    setTimeout(() => {
      uni.redirectTo({ url: '/pages/staff/home' })
    }, 400)
  }
  finally {
    submitting.value = false
  }
}

function onDraft() {
  uni.showToast({ icon: 'none', title: '请完成后提交订单' })
}

onLoad(() => {
  void loadServices()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[170rpx] pt-[20rpx]">
    <view class="mx-[24rpx] rounded-[28rpx] bg-white p-[32rpx]" @tap="chooseAddress">
      <view class="h-[112rpx] flex items-center justify-center">
        <view class="w-[72rpx] h-[72rpx] rounded-full bg-[#FF373D] flex items-center justify-center mr-[20rpx]">
          <text class="i-carbon-location-filled text-[40rpx] text-white" />
        </view>
        <text class="text-[36rpx] text-[#1F2937] font-700">{{ serviceAddress || '添加服务地址' }}</text>
      </view>
    </view>

    <view class="mx-[24rpx] mt-[24rpx] rounded-[28rpx] bg-white p-[32rpx]">
      <view class="flex items-center justify-between">
        <text class="text-[34rpx] text-[#1F2937] font-700">自定义预约服务</text>
        <switch :checked="customServiceEnabled" color="#FF373D" @change="customServiceEnabled = $event.detail.value" />
      </view>
      <view class="mt-[28rpx] pt-[28rpx] border-t border-[#F3F4F6] flex items-center justify-between" @tap="chooseService">
        <text class="text-[32rpx] text-[#1F2937] font-700">预约服务</text>
        <view class="flex items-center min-w-0 ml-[20rpx]">
          <text class="truncate text-[30rpx]" :class="selectedServiceName ? 'text-[#1F2937]' : 'text-[#C4C8D0]'">
            {{ selectedServiceName || '请选择预约服务' }}
          </text>
          <text class="i-carbon-chevron-right text-[34rpx] text-[#C4C8D0] ml-[12rpx]" />
        </view>
      </view>
    </view>

    <view class="mx-[24rpx] mt-[24rpx] rounded-[28rpx] bg-white p-[32rpx]">
      <view class="flex items-center justify-between" @tap="chooseTime">
        <text class="text-[32rpx] text-[#1F2937] font-700">上门时间</text>
        <view class="flex items-center min-w-0 ml-[20rpx]">
          <text class="truncate text-[30rpx]" :class="appointmentTime ? 'text-[#1F2937]' : 'text-[#C4C8D0]'">
            {{ appointmentTime || '请选择上门时间' }}
          </text>
          <text class="i-carbon-chevron-right text-[34rpx] text-[#C4C8D0] ml-[12rpx]" />
        </view>
      </view>
      <view class="mt-[28rpx] pt-[28rpx] border-t border-[#F3F4F6] flex items-center justify-between" @tap="chooseDispatchMode">
        <text class="text-[32rpx] text-[#1F2937] font-700">订单分配方式</text>
        <view class="flex items-center min-w-0 ml-[20rpx]">
          <text class="truncate text-[30rpx] text-[#1F2937]">{{ selectedDispatchLabel }}</text>
          <text class="i-carbon-chevron-right text-[34rpx] text-[#C4C8D0] ml-[12rpx]" />
        </view>
      </view>
    </view>

    <view class="mx-[24rpx] mt-[24rpx] rounded-[28rpx] bg-white p-[32rpx]">
      <view class="flex items-baseline">
        <text class="text-[34rpx] text-[#1F2937] font-700">家居照片</text>
        <text class="ml-[16rpx] text-[26rpx] text-[#9CA3AF]">请上传1-3张环境照片</text>
      </view>
      <view class="mt-[26rpx]">
        <upload-image-grid v-model="photos" :max-count="3" />
      </view>
    </view>

    <view class="mx-[24rpx] mt-[24rpx] rounded-[28rpx] bg-white p-[32rpx]">
      <text class="text-[34rpx] text-[#1F2937] font-700">客户需求</text>
      <textarea
        v-model="remark"
        class="mt-[22rpx] w-full h-[180rpx] rounded-[18rpx] bg-[#F9FAFB] p-[20rpx] text-[28rpx] text-[#1F2937]"
        placeholder="补充说明服务要求"
        placeholder-class="text-[#C4C8D0]"
      />
    </view>

    <bottom-action-bar
      primary-color="red"
      primary-text="提交订单"
      secondary-text="保存草稿"
      :loading="submitting"
      @primary="onSubmit"
      @secondary="onDraft"
    />
  </view>
</template>

