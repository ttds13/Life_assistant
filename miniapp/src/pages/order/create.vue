<script lang="ts" setup>
import type { Service } from '@/api/types/services'
import type { PricePreview } from '@/api/types/orders'
import type { UserAddress } from '@/api/types/address'
import { getUserAddresses } from '@/api/address'
import { createOrder, getOrderPricePreview } from '@/api/orders'
import { getServiceDetail } from '@/api/services'
import { createMockPricePreview } from '@/utils/mockDay4'
import { formatAddress, getSelectedAddress } from '@/utils/addressSelection'

definePage({
  style: {
    navigationBarTitleText: '预约下单',
  },
})

const serviceId = ref(0)
const service = ref<Service | null>(null)
const selectedDate = ref('')
const selectedTimeSlot = ref('')
const selectedAddress = ref<UserAddress | null>(null)
const remark = ref('')
const loading = ref(true)
const submitting = ref(false)
const pricePreview = ref<PricePreview>(createMockPricePreview(0))

const dateOptions = computed(() => {
  const result: { label: string, value: string }[] = []
  const now = new Date()
  for (let i = 0; i < 5; i++) {
    const date = new Date(now)
    date.setDate(now.getDate() + i)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const label = i === 0 ? '今天' : i === 1 ? '明天' : `${date.getMonth() + 1}月${date.getDate()}日`
    result.push({ label, value })
  }
  return result
})

const timeSlots = ['09:00-11:00', '11:00-13:00', '13:00-15:00', '15:00-17:00', '17:00-19:00']

const canSubmit = computed(() => !!service.value && !!selectedDate.value && !!selectedTimeSlot.value && !!selectedAddress.value)

async function loadService() {
  loading.value = true
  try {
    service.value = await getServiceDetail(serviceId.value)
  }
  catch {
    service.value = {
      id: serviceId.value || 1,
      categoryId: 1,
      name: '服务名称待加载',
      description: '服务说明待接口返回',
      basePrice: 120,
      priceUnit: '次',
      coverImage: '',
      status: 1,
      sortOrder: 1,
    }
  }
  finally {
    const amount = service.value?.basePrice || 0
    await loadPricePreview(amount)
    loading.value = false
  }
}

async function loadPricePreview(fallbackAmount = 0) {
  try {
    pricePreview.value = await getOrderPricePreview({
      serviceId: serviceId.value,
      addressId: selectedAddress.value?.id,
      appointmentDate: selectedDate.value,
      appointmentTimeSlot: selectedTimeSlot.value,
    })
  }
  catch {
    pricePreview.value = createMockPricePreview(fallbackAmount)
  }
}

async function syncSelectedAddress() {
  const cached = getSelectedAddress()
  if (cached) {
    selectedAddress.value = cached
    return
  }
  const addresses = await getUserAddresses()
  selectedAddress.value = addresses.find(item => item.isDefault) || addresses[0] || null
}

function onChooseAddress() {
  uni.navigateTo({ url: '/pages/address/list?mode=select' })
}

function validate() {
  if (!selectedDate.value)
    return '请选择预约日期'
  if (!selectedTimeSlot.value)
    return '请选择预约时间'
  if (!selectedAddress.value)
    return '请选择服务地址'
  return ''
}

async function onSubmit() {
  const message = validate()
  if (message) {
    uni.showToast({ icon: 'none', title: message })
    return
  }
  submitting.value = true
  try {
    const order = await createOrder({
      serviceId: serviceId.value,
      appointmentDate: selectedDate.value,
      appointmentTimeSlot: selectedTimeSlot.value,
      addressId: selectedAddress.value!.id,
      remark: remark.value.trim() || undefined,
    })
    submitting.value = false
    uni.navigateTo({ url: `/pages/payment/result?orderId=${order.id}&status=pending&amount=${pricePreview.value.payableAmount}` })
  }
  finally {
    submitting.value = false
  }
}

onLoad((query) => {
  serviceId.value = Number(query?.serviceId || query?.id || 0)
  void loadService()
  void syncSelectedAddress()
})

onShow(() => {
  void syncSelectedAddress()
})

watch([selectedAddress, selectedDate, selectedTimeSlot], () => {
  if (service.value) {
    void loadPricePreview(service.value.basePrice)
  }
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[170rpx] pt-1">
    <loading-state :loading="loading">
      <form-section title="服务信息">
        <view v-if="service" class="flex">
          <view class="w-[144rpx] h-[144rpx] rounded-[12rpx] bg-[#EAF3FF] overflow-hidden flex items-center justify-center mr-3">
            <image v-if="service.coverImage" :src="service.coverImage" class="w-full h-full" mode="aspectFill" />
            <text v-else class="text-[48rpx]">🧹</text>
          </view>
          <view class="flex-1">
            <text class="text-[30rpx] font-600 text-gray-800 block">{{ service.name }}</text>
            <text class="text-[24rpx] text-gray-400 block mt-1 leading-[34rpx]">{{ service.description || '服务说明待补充' }}</text>
            <view class="mt-2">
              <price-text :price="service.basePrice" :unit="service.priceUnit || '次'" size="sm" />
            </view>
          </view>
        </view>
      </form-section>

      <form-section title="预约时间" required>
        <view class="flex flex-wrap gap-2">
          <view
            v-for="item in dateOptions"
            :key="item.value"
            class="px-4 h-[64rpx] rounded-full flex items-center justify-center border"
            :class="selectedDate === item.value ? 'bg-[#EAF3FF] border-[#1677FF]' : 'bg-white border-[#E5E7EB]'"
            @tap="selectedDate = item.value"
          >
            <text class="text-[26rpx]" :class="selectedDate === item.value ? 'text-[#1677FF]' : 'text-gray-600'">{{ item.label }}</text>
          </view>
        </view>
        <view class="flex flex-wrap gap-2 mt-3">
          <view
            v-for="slot in timeSlots"
            :key="slot"
            class="px-4 h-[64rpx] rounded-full flex items-center justify-center border"
            :class="selectedTimeSlot === slot ? 'bg-[#EAF3FF] border-[#1677FF]' : 'bg-white border-[#E5E7EB]'"
            @tap="selectedTimeSlot = slot"
          >
            <text class="text-[26rpx]" :class="selectedTimeSlot === slot ? 'text-[#1677FF]' : 'text-gray-600'">{{ slot }}</text>
          </view>
        </view>
        <text class="block mt-3 text-[24rpx] text-gray-400">预约规则待补充</text>
      </form-section>

      <form-section title="服务地址" required>
        <view v-if="selectedAddress" class="rounded-[12rpx] bg-[#F9FAFB] p-3" @tap="onChooseAddress">
          <view class="flex items-center">
            <text class="text-[28rpx] font-600 text-gray-800 mr-2">{{ selectedAddress.contactName }}</text>
            <text class="text-[24rpx] text-gray-500">{{ selectedAddress.contactPhone }}</text>
          </view>
          <text class="block mt-2 text-[26rpx] text-gray-700 leading-[38rpx]">
            {{ formatAddress(selectedAddress) }}
          </text>
        </view>
        <view v-else class="h-[96rpx] rounded-[12rpx] bg-[#F9FAFB] flex items-center justify-between px-3" @tap="onChooseAddress">
          <text class="text-[28rpx] text-gray-500">请选择服务地址</text>
          <text class="text-[28rpx] text-[#1677FF]">去选择</text>
        </view>
      </form-section>

      <form-section title="备注">
        <textarea v-model="remark" :maxlength="100" class="w-full min-h-[120rpx] text-[28rpx]" placeholder="可填写门禁、服务重点等补充说明" />
        <text class="block text-right text-[22rpx] text-gray-400">{{ remark.length }}/100</text>
      </form-section>

      <form-section title="优惠权益" subtitle="后续接入">
        <view class="flex items-center justify-between py-3 border-b border-[#F3F4F6]">
          <text class="text-[28rpx] text-gray-700">优惠券</text>
          <text class="text-[26rpx] text-gray-400">暂不可用</text>
        </view>
        <view class="flex items-center justify-between py-3">
          <text class="text-[28rpx] text-gray-700">会员次卡</text>
          <text class="text-[26rpx] text-gray-400">暂不可用</text>
        </view>
      </form-section>

      <form-section title="金额明细">
        <amount-detail :items="pricePreview.items" :total="pricePreview.payableAmount" />
      </form-section>
    </loading-state>

    <bottom-action-bar
      :price="pricePreview.payableAmount"
      primary-text="提交订单"
      :primary-disabled="!canSubmit"
      :loading="submitting"
      @primary="onSubmit"
    />
  </view>
</template>
