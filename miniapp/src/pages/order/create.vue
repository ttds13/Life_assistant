<script lang="ts" setup>
import { getUserAddresses } from '@/api/address'
import { getMyMemberCards } from '@/api/memberCards'
import { createOrder, getOrderPricePreview } from '@/api/orders'
import { getServiceDetail, getServices } from '@/api/services'
import type { UserAddress } from '@/api/types/address'
import type { UserMemberCard } from '@/api/types/memberCards'
import type { PricePreview } from '@/api/types/orders'
import type { Service } from '@/api/types/services'
import { formatAddress, getSelectedAddress } from '@/utils/addressSelection'
import { availableAppointmentSlots, buildAppointmentDateOptions } from '@/utils/appointmentSlots'

definePage({
  style: {
    navigationBarTitleText: '预约下单',
  },
})

const emptyPricePreview: PricePreview = {
  serviceAmount: 0,
  discountAmount: 0,
  payableAmount: 0,
  items: [],
}

const serviceId = ref(0)
const serviceCode = ref('')
const serviceName = ref('')
const service = ref<Service | null>(null)
const selectedDate = ref('')
const selectedTimeSlot = ref('')
const selectedAddress = ref<UserAddress | null>(null)
const remark = ref('')
const loading = ref(true)
const submitting = ref(false)
const priceLoading = ref(false)
const pricePreview = ref<PricePreview>({ ...emptyPricePreview })
const pricePreviewReady = ref(false)
const memberCards = ref<UserMemberCard[]>([])
const selectedMemberCardId = ref<number | undefined>()
const preferredMemberCardId = ref<number | undefined>()
const memberCardLoading = ref(false)
const source = ref('')
const promotionKey = ref('')
const campaignId = ref('')

const dateOptions = computed(() => buildAppointmentDateOptions())
const timeSlots = computed(() => availableAppointmentSlots(selectedDate.value))
const effectiveServiceId = computed(() => serviceId.value)
const effectiveServiceCode = computed(() => service.value?.code || serviceCode.value)
const hasServiceIdentifier = computed(() => !!effectiveServiceCode.value || effectiveServiceId.value > 0)
const selectedMemberCard = computed(() => memberCards.value.find(item => item.id === selectedMemberCardId.value))
const isConsultationService = computed(() =>
  service.value?.consultationRequired
  || service.value?.cardType === 'consultation'
  || pricePreview.value.consultationRequired,
)
const displayPayableAmount = computed(() =>
  selectedMemberCard.value || isConsultationService.value ? 0 : pricePreview.value.payableAmount,
)
const canSubmit = computed(() =>
  !!service.value
  && hasServiceIdentifier.value
  && !!selectedDate.value
  && !!selectedTimeSlot.value
  && !!selectedAddress.value
  && pricePreviewReady.value
  && !priceLoading.value,
)

function normalizeServiceList(data: any): Service[] {
  if (Array.isArray(data))
    return data
  return data?.items || data?.list || data?.records || []
}

async function resolveServiceByName() {
  if (!serviceName.value)
    return null
  const result = await getServices({ keyword: serviceName.value, page: 1, pageSize: 20 })
  return normalizeServiceList(result).find(item => item.name === serviceName.value && item.id > 0) || null
}

async function ensureServiceLoaded() {
  if (serviceCode.value) {
    try {
      const loaded = await getServiceDetail(serviceCode.value)
      serviceId.value = loaded.id
      serviceCode.value = loaded.code || serviceCode.value
      return loaded
    }
    catch {}
  }

  if (Number.isInteger(serviceId.value) && serviceId.value > 0) {
    try {
      const loaded = await getServiceDetail(serviceId.value)
      serviceCode.value = loaded.code || serviceCode.value
      return loaded
    }
    catch {}
  }

  const matchedService = await resolveServiceByName()
  if (!matchedService)
    throw new Error('service not found')

  serviceId.value = matchedService.id
  serviceCode.value = matchedService.code || ''
  return getServiceDetail(serviceCode.value || serviceId.value)
}

async function loadService() {
  loading.value = true
  try {
    service.value = await ensureServiceLoaded()
    await loadPricePreview()
    await loadMemberCards()
  }
  catch {
    service.value = null
    pricePreview.value = { ...emptyPricePreview }
    pricePreviewReady.value = false
    uni.showToast({ icon: 'none', title: '服务加载失败' })
  }
  finally {
    loading.value = false
  }
}

async function loadMemberCards() {
  if (!service.value?.id) {
    memberCards.value = []
    selectedMemberCardId.value = undefined
    return
  }

  memberCardLoading.value = true
  try {
    memberCards.value = await getMyMemberCards({ serviceId: service.value.id })
    if (preferredMemberCardId.value && memberCards.value.some(item => item.id === preferredMemberCardId.value)) {
      selectedMemberCardId.value = preferredMemberCardId.value
      preferredMemberCardId.value = undefined
    }
    if (selectedMemberCardId.value && !memberCards.value.some(item => item.id === selectedMemberCardId.value)) {
      selectedMemberCardId.value = undefined
    }
  }
  catch {
    memberCards.value = []
    selectedMemberCardId.value = undefined
  }
  finally {
    memberCardLoading.value = false
  }
}

function formatCardBalance(card: UserMemberCard) {
  if (card.cardType === 'time')
    return `${card.usableUnits}分钟可用`
  return `${card.usableUnits}${card.unitName || '次'}可用`
}

function onSelectMemberCard(card?: UserMemberCard) {
  selectedMemberCardId.value = card?.id
}

async function loadPricePreview() {
  if (!service.value)
    return

  priceLoading.value = true
  pricePreviewReady.value = false
  try {
    pricePreview.value = await getOrderPricePreview({
      serviceCode: effectiveServiceCode.value || undefined,
      serviceId: effectiveServiceCode.value ? undefined : effectiveServiceId.value,
      addressId: selectedAddress.value?.id,
      appointmentDate: selectedDate.value,
      appointmentTimeSlot: selectedTimeSlot.value,
    })
    pricePreviewReady.value = true
  }
  catch {
    pricePreview.value = { ...emptyPricePreview }
    uni.showToast({ icon: 'none', title: '价格预览失败' })
  }
  finally {
    priceLoading.value = false
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
  if (!service.value)
    return '服务加载失败'
  if (!selectedDate.value)
    return '请选择预约日期'
  if (!selectedTimeSlot.value)
    return '请选择预约时间'
  if (!selectedAddress.value)
    return '请选择服务地址'
  if (!pricePreviewReady.value)
    return '请先加载价格预览'
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
      serviceCode: effectiveServiceCode.value || undefined,
      serviceId: effectiveServiceCode.value ? undefined : effectiveServiceId.value,
      appointmentDate: selectedDate.value,
      appointmentTimeSlot: selectedTimeSlot.value,
      addressId: selectedAddress.value!.id,
      remark: remark.value.trim() || undefined,
      memberCardId: selectedMemberCardId.value,
      source: source.value || undefined,
      promotionKey: promotionKey.value || undefined,
      campaignId: campaignId.value || undefined,
    })
    if (selectedMemberCard.value || isConsultationService.value) {
      uni.showToast({ icon: 'success', title: '预约成功' })
      uni.redirectTo({ url: `/pages/order/detail?id=${order.id}` })
      return
    }
    uni.navigateTo({ url: `/pages/payment/result?orderId=${order.id}&status=pending&amount=${pricePreview.value.payableAmount}` })
  }
  finally {
    submitting.value = false
  }
}

onLoad((query) => {
  serviceId.value = Number(query?.serviceId || query?.id || 0)
  serviceCode.value = typeof query?.serviceCode === 'string'
    ? decodeURIComponent(query.serviceCode)
    : typeof query?.code === 'string'
      ? decodeURIComponent(query.code)
      : ''
  serviceName.value = typeof query?.serviceName === 'string' ? decodeURIComponent(query.serviceName) : ''
  const cardId = Number(query?.memberCardId)
  preferredMemberCardId.value = Number.isInteger(cardId) && cardId > 0 ? cardId : undefined
  selectedMemberCardId.value = preferredMemberCardId.value
  source.value = typeof query?.source === 'string' ? decodeURIComponent(query.source) : ''
  promotionKey.value = typeof query?.promotionKey === 'string' ? decodeURIComponent(query.promotionKey) : ''
  campaignId.value = typeof query?.campaignId === 'string' ? decodeURIComponent(query.campaignId) : ''
  selectedDate.value = dateOptions.value[0]?.value || ''
  void loadService()
  void syncSelectedAddress()
})

onShow(() => {
  void syncSelectedAddress()
})

watch([selectedAddress, selectedDate, selectedTimeSlot], () => {
  if (service.value)
    void loadPricePreview()
})

watch(timeSlots, (slots) => {
  if (selectedTimeSlot.value && !slots.includes(selectedTimeSlot.value))
    selectedTimeSlot.value = ''
  if (!selectedTimeSlot.value && slots.length)
    selectedTimeSlot.value = slots[0]
}, { immediate: true })
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[170rpx] pt-1">
    <loading-state :loading="loading">
      <form-section title="服务信息">
        <view v-if="service" class="flex">
          <view class="w-[144rpx] h-[144rpx] rounded-[12rpx] bg-[#EAF3FF] overflow-hidden flex items-center justify-center mr-3">
            <image v-if="service.coverImage" :src="service.coverImage" class="w-full h-full" mode="aspectFill" />
            <text v-else class="text-[48rpx]">家</text>
          </view>
          <view class="flex-1">
            <text class="text-[30rpx] font-600 text-gray-800 block">
              {{ service.name }}
            </text>
            <text class="text-[24rpx] text-gray-400 block mt-1 leading-[34rpx]">
              {{ service.description || '暂无服务说明' }}
            </text>
            <view class="mt-2">
              <price-text :price="service.basePrice" :unit="service.priceUnit || '次'" size="sm" />
            </view>
          </view>
        </view>
        <empty-state v-else title="服务加载失败" />
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
            <text class="text-[26rpx]" :class="selectedDate === item.value ? 'text-[#1677FF]' : 'text-gray-600'">
              {{ item.label }}
            </text>
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
            <text class="text-[26rpx]" :class="selectedTimeSlot === slot ? 'text-[#1677FF]' : 'text-gray-600'">
              {{ slot }}
            </text>
          </view>
        </view>
        <view v-if="!timeSlots.length" class="mt-3 rounded-[12rpx] bg-[#FFF7E6] px-3 py-2">
          <text class="text-[24rpx] text-[#AD6800]">
            今天已无可预约时间段，请选择明天或更晚日期
          </text>
        </view>
      </form-section>

      <form-section title="服务地址" required>
        <view v-if="selectedAddress" class="rounded-[12rpx] bg-[#F9FAFB] p-3" @tap="onChooseAddress">
          <view class="flex items-center">
            <text class="text-[28rpx] font-600 text-gray-800 mr-2">
              {{ selectedAddress.contactName }}
            </text>
            <text class="text-[24rpx] text-gray-500">
              {{ selectedAddress.contactPhone }}
            </text>
          </view>
          <text class="block mt-2 text-[26rpx] text-gray-700 leading-[38rpx]">
            {{ formatAddress(selectedAddress) }}
          </text>
        </view>
        <view v-else class="h-[96rpx] rounded-[12rpx] bg-[#F9FAFB] flex items-center justify-between px-3" @tap="onChooseAddress">
          <text class="text-[28rpx] text-gray-500">
            请选择服务地址
          </text>
          <text class="text-[28rpx] text-[#1677FF]">
            去选择
          </text>
        </view>
      </form-section>

      <form-section title="备注">
        <textarea v-model="remark" :maxlength="100" class="w-full min-h-[120rpx] text-[28rpx]" placeholder="可填写门禁、服务重点等补充说明" />
        <text class="block text-right text-[22rpx] text-gray-400">
          {{ remark.length }}/100
        </text>
      </form-section>

      <form-section title="优惠权益">
        <view class="flex items-center justify-between py-3 border-b border-[#F3F4F6]">
          <text class="text-[28rpx] text-gray-700">优惠券</text>
          <text class="text-[26rpx] text-gray-400">暂无可用</text>
        </view>
        <view class="flex items-center justify-between py-3">
          <text class="text-[28rpx] text-gray-700">会员卡</text>
          <text v-if="memberCardLoading" class="text-[26rpx] text-gray-400">加载中</text>
          <text v-else-if="!memberCards.length" class="text-[26rpx] text-gray-400">暂无可用</text>
          <text v-else class="text-[26rpx] text-[#1677FF]">
            {{ selectedMemberCard ? selectedMemberCard.name : '请选择' }}
          </text>
        </view>
        <view v-if="memberCards.length" class="mt-2">
          <view
            class="mb-2 rounded-[12rpx] border px-3 py-2"
            :class="!selectedMemberCardId ? 'border-[#1677FF] bg-[#EAF3FF]' : 'border-[#E5E7EB] bg-white'"
            @tap="onSelectMemberCard(undefined)"
          >
            <text class="text-[26rpx]" :class="!selectedMemberCardId ? 'text-[#1677FF]' : 'text-gray-600'">
              不使用会员卡
            </text>
          </view>
          <view
            v-for="card in memberCards"
            :key="card.id"
            class="mb-2 rounded-[12rpx] border px-3 py-2"
            :class="selectedMemberCardId === card.id ? 'border-[#1677FF] bg-[#EAF3FF]' : 'border-[#E5E7EB] bg-white'"
            @tap="onSelectMemberCard(card)"
          >
            <view class="flex items-center justify-between">
              <text class="text-[26rpx] font-600" :class="selectedMemberCardId === card.id ? 'text-[#1677FF]' : 'text-gray-700'">
                {{ card.name }}
              </text>
              <text class="text-[24rpx] text-gray-500">
                本次扣 {{ card.consumeUnits }}{{ card.cardType === 'time' ? '分钟' : card.unitName || '次' }}
              </text>
            </view>
            <text class="block mt-1 text-[23rpx] text-gray-400">
              {{ formatCardBalance(card) }}，有效期至 {{ card.expireAt.slice(0, 10) }}
            </text>
          </view>
        </view>
      </form-section>

      <form-section title="金额明细">
        <view v-if="priceLoading" class="py-4 text-center">
          <text class="text-[26rpx] text-gray-400">价格加载中</text>
        </view>
        <amount-detail v-else :items="pricePreview.items" :total="displayPayableAmount" />
      </form-section>
    </loading-state>

    <bottom-action-bar
      :price="displayPayableAmount"
      :primary-text="selectedMemberCard || isConsultationService ? '提交预约' : '提交订单'"
      :primary-disabled="!canSubmit"
      :loading="submitting"
      @primary="onSubmit"
    />
  </view>
</template>
