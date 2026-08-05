<script lang="ts" setup>
import type { UserAddress } from '@/api/types/address'
import type { UserCoupon } from '@/api/types/coupons'
import type { UserMemberCard } from '@/api/types/memberCards'
import type { PricePreview } from '@/api/types/orders'
import type { Service } from '@/api/types/services'
import { getUserAddresses } from '@/api/address'
import { getAppointmentSlots, type AppointmentSlotItem } from '@/api/appointments'
import { getUsableCoupons } from '@/api/coupons'
import { getMyMemberCards } from '@/api/memberCards'
import { createOrder, getOrderPricePreview } from '@/api/orders'
import { getServiceDetail, getServices } from '@/api/services'
import { formatAddress, getSelectedAddress } from '@/utils/addressSelection'
import { buildAppointmentDateOptions } from '@/utils/appointmentSlots'

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
const slotLoading = ref(false)
const slotLoadError = ref('')
const appointmentSlotItems = ref<AppointmentSlotItem[]>([])
const pricePreview = ref<PricePreview>({ ...emptyPricePreview })
const pricePreviewReady = ref(false)
const memberCards = ref<UserMemberCard[]>([])
const usableCoupons = ref<UserCoupon[]>([])
const selectedMemberCardId = ref<number | undefined>()
const selectedMemberCardConsumeMinutes = ref<number | undefined>()
const selectedCouponId = ref<number | undefined>()
const preferredMemberCardId = ref<number | undefined>()
const preferredMemberCardConsumeMinutes = ref<number | undefined>()
const memberCardLoading = ref(false)
const couponLoading = ref(false)
const source = ref('')
const promotionKey = ref('')
const campaignId = ref('')
const memberCardIntentError = ref('')
let pricePreviewRequestId = 0
let appointmentSlotsRequestId = 0

const dateOptions = computed(() => buildAppointmentDateOptions())
const timeSlots = computed(() => appointmentSlotItems.value
  .filter(item => item.available)
  .map(item => item.timeSlot))
const effectiveServiceId = computed(() => serviceId.value)
const effectiveServiceCode = computed(() => service.value?.code || serviceCode.value)
const hasServiceIdentifier = computed(() => !!effectiveServiceCode.value || effectiveServiceId.value > 0)
const selectedMemberCard = computed(() => memberCards.value.find(item => item.id === selectedMemberCardId.value))
const selectedMemberCardConsumeOptions = computed(() => {
  const card = selectedMemberCard.value
  if (!card)
    return []
  const configured = card.consumeMode === 'custom_minutes' && card.allowedMinutes?.length
    ? card.allowedMinutes
    : [card.consumeMinutes || card.consumeUnits]
  const usableMinutes = card.usableMinutes ?? card.usableUnits
  return Array.from(new Set(configured))
    .filter(value => Number.isInteger(value) && value > 0 && value <= usableMinutes)
    .sort((left, right) => left - right)
})
const selectedCoupon = computed(() => usableCoupons.value.find(item => item.couponId === selectedCouponId.value))
const hasMemberCardIntent = computed(() => source.value === 'member_card' && Boolean(preferredMemberCardId.value))
const isConsultationService = computed(() =>
  service.value?.consultationRequired
  || service.value?.cardType === 'consultation'
  || pricePreview.value.consultationRequired,
)
const isMemberCardBooking = computed(() =>
  pricePreview.value.pricingMode === 'member_card'
  || hasMemberCardIntent.value,
)
const displayPayableAmount = computed(() => pricePreview.value.payableAmount)
const canSubmit = computed(() =>
  !!service.value
  && hasServiceIdentifier.value
  && !!selectedDate.value
  && !!selectedTimeSlot.value
  && !!selectedAddress.value
  && (!selectedMemberCard.value || !!selectedMemberCardConsumeMinutes.value)
  && !memberCardIntentError.value
  && (!hasMemberCardIntent.value || (
    pricePreview.value.pricingMode === 'member_card'
    && pricePreview.value.payableAmount === 0
  ))
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
    await loadMemberCards()
    await loadPricePreview()
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
  memberCardIntentError.value = ''
  try {
    memberCards.value = await getMyMemberCards({ serviceId: service.value.id })
    if (preferredMemberCardId.value) {
      const preferredCard = memberCards.value.find(item => item.id === preferredMemberCardId.value)
      if (!preferredCard) {
        selectedMemberCardId.value = undefined
        if (hasMemberCardIntent.value)
          memberCardIntentError.value = '该会员卡不可用于当前服务，请返回卡包重新选择'
        return
      }
      selectedMemberCardId.value = preferredCard.id
    }
    if (selectedMemberCardId.value && !memberCards.value.some(item => item.id === selectedMemberCardId.value)) {
      selectedMemberCardId.value = undefined
    }
    if (selectedMemberCardId.value) {
      selectedCouponId.value = undefined
      usableCoupons.value = []
    }
    syncSelectedMemberCardConsumeMinutes()
    if (selectedMemberCardId.value && !selectedMemberCardConsumeMinutes.value)
      memberCardIntentError.value = '该会员卡当前没有可用的核销分钟'
  }
  catch {
    memberCards.value = []
    selectedMemberCardId.value = undefined
    if (hasMemberCardIntent.value)
      memberCardIntentError.value = '会员卡权益加载失败，请稍后重试'
  }
  finally {
    memberCardLoading.value = false
  }
}

function formatCardBalance(card: UserMemberCard) {
  return `${card.usableMinutes ?? card.usableUnits}分钟可用`
}

function cardValidityText(card: UserMemberCard) {
  if (card.status === 'pending_activation') {
    return card.activationDeadlineAt
      ? `首次预约后开始计时，请在 ${card.activationDeadlineAt.slice(0, 10)} 前激活`
      : '首次预约后开始计时'
  }
  return card.expireAt ? `有效期至 ${card.expireAt.slice(0, 10)}` : '权益卡不可用'
}

function onSelectMemberCard(card?: UserMemberCard) {
  if (!card && hasMemberCardIntent.value)
    return
  selectedMemberCardId.value = card?.id
  memberCardIntentError.value = ''
  syncSelectedMemberCardConsumeMinutes()
  if (card) {
    selectedCouponId.value = undefined
    usableCoupons.value = []
  }
  void loadPricePreview()
}

function syncSelectedMemberCardConsumeMinutes() {
  const options = selectedMemberCardConsumeOptions.value
  const preferred = selectedMemberCard.value?.consumeMinutes || selectedMemberCard.value?.consumeUnits
  selectedMemberCardConsumeMinutes.value = options.includes(selectedMemberCardConsumeMinutes.value || 0)
    ? selectedMemberCardConsumeMinutes.value
    : options.includes(preferredMemberCardConsumeMinutes.value || 0)
      ? preferredMemberCardConsumeMinutes.value
      : options.includes(preferred || 0)
        ? preferred
        : options[0]
}

function onSelectMemberCardConsumeMinutes(minutes: number) {
  selectedMemberCardConsumeMinutes.value = minutes
  void loadPricePreview()
}

function formatCouponAmount(coupon: UserCoupon) {
  if (coupon.type === 'discount')
    return `${coupon.amount}折`
  return `¥${coupon.amount.toFixed(2)}`
}

function formatCouponDesc(coupon: UserCoupon) {
  const condition = coupon.minAmount > 0 ? `满 ¥${coupon.minAmount.toFixed(2)} 可用` : '无门槛'
  return `${condition}，有效期至 ${coupon.expireAt.slice(0, 10)}`
}

function onSelectCoupon(coupon?: UserCoupon) {
  selectedCouponId.value = coupon?.couponId
  if (coupon)
    selectedMemberCardId.value = undefined
  void loadPricePreview()
}

async function loadUsableCoupons(amount?: number) {
  if (!service.value?.id || selectedMemberCard.value || isConsultationService.value) {
    usableCoupons.value = []
    selectedCouponId.value = undefined
    return
  }

  couponLoading.value = true
  try {
    const queryAmount = amount ?? pricePreview.value.serviceAmount ?? service.value.basePrice
    usableCoupons.value = await getUsableCoupons({
      serviceId: service.value.id,
      amount: queryAmount,
    })
    if (selectedCouponId.value && !usableCoupons.value.some(item => item.couponId === selectedCouponId.value))
      selectedCouponId.value = undefined
  }
  catch {
    usableCoupons.value = []
    selectedCouponId.value = undefined
  }
  finally {
    couponLoading.value = false
  }
}

async function loadPricePreview() {
  if (!service.value || !selectedDate.value || !selectedTimeSlot.value) {
    pricePreview.value = { ...emptyPricePreview }
    pricePreviewReady.value = false
    return
  }

  if (hasMemberCardIntent.value && !selectedMemberCard.value) {
    pricePreview.value = { ...emptyPricePreview }
    pricePreviewReady.value = false
    return
  }
  if (selectedMemberCard.value && !selectedMemberCardConsumeMinutes.value) {
    pricePreview.value = { ...emptyPricePreview }
    pricePreviewReady.value = false
    memberCardIntentError.value = '请选择本次核销分钟'
    return
  }

  const requestId = ++pricePreviewRequestId
  priceLoading.value = true
  pricePreviewReady.value = false
  try {
    const nextPreview = await getOrderPricePreview({
      serviceCode: effectiveServiceCode.value || undefined,
      serviceId: effectiveServiceCode.value ? undefined : effectiveServiceId.value,
      addressId: selectedAddress.value?.id,
      appointmentDate: selectedDate.value,
      appointmentTimeSlot: selectedTimeSlot.value,
      couponId: selectedMemberCard.value || isConsultationService.value ? undefined : selectedCouponId.value,
      memberCardId: selectedMemberCardId.value,
      memberCardConsumeMinutes: selectedMemberCardId.value ? selectedMemberCardConsumeMinutes.value : undefined,
    }, { hideErrorToast: Boolean(selectedMemberCard.value || hasMemberCardIntent.value) })
    if (requestId !== pricePreviewRequestId)
      return
    if (selectedMemberCard.value
      && (nextPreview.pricingMode !== 'member_card' || nextPreview.payableAmount !== 0)) {
      throw new Error('invalid member card price preview')
    }
    pricePreview.value = nextPreview
    pricePreviewReady.value = true
    memberCardIntentError.value = ''
    await loadUsableCoupons(nextPreview.serviceAmount)
  }
  catch {
    if (requestId !== pricePreviewRequestId)
      return
    pricePreview.value = { ...emptyPricePreview }
    pricePreviewReady.value = false
    if (selectedMemberCard.value || hasMemberCardIntent.value)
      memberCardIntentError.value = '会员卡权益校验失败，请确认卡状态、余额和适用服务'
    else
      uni.showToast({ icon: 'none', title: '价格预览失败' })
  }
  finally {
    if (requestId === pricePreviewRequestId)
      priceLoading.value = false
  }
}

async function loadAppointmentSlots() {
  const date = selectedDate.value
  const requestId = ++appointmentSlotsRequestId
  appointmentSlotItems.value = []
  slotLoadError.value = ''
  if (!date) return

  slotLoading.value = true
  try {
    const result = await getAppointmentSlots(date)
    if (requestId !== appointmentSlotsRequestId) return
    appointmentSlotItems.value = result.items || []
  }
  catch {
    if (requestId !== appointmentSlotsRequestId) return
    slotLoadError.value = '预约时段加载失败，请稍后重试'
  }
  finally {
    if (requestId === appointmentSlotsRequestId)
      slotLoading.value = false
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
  if (memberCardIntentError.value)
    return memberCardIntentError.value
  if (hasMemberCardIntent.value && !selectedMemberCard.value)
    return '指定会员卡不可用'
  if (selectedMemberCard.value && !selectedMemberCardConsumeMinutes.value)
    return '请选择本次核销分钟'
  if (selectedMemberCard.value && pricePreview.value.pricingMode !== 'member_card')
    return '会员卡权益价格尚未确认'
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
      memberCardConsumeMinutes: selectedMemberCardId.value ? selectedMemberCardConsumeMinutes.value : undefined,
      couponId: selectedMemberCard.value || isConsultationService.value ? undefined : selectedCouponId.value,
      source: source.value || undefined,
      promotionKey: promotionKey.value || undefined,
      campaignId: campaignId.value || undefined,
    })
    if (pricePreview.value.pricingMode === 'member_card' || isConsultationService.value) {
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
  const consumeMinutes = Number(query?.memberCardConsumeMinutes)
  preferredMemberCardConsumeMinutes.value = Number.isInteger(consumeMinutes) && consumeMinutes > 0 ? consumeMinutes : undefined
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

watch(selectedDate, () => {
  selectedTimeSlot.value = ''
  void loadAppointmentSlots()
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
            <view v-if="isMemberCardBooking" class="mt-2 rounded-[10rpx] bg-[#EAF3FF] px-3 py-2">
              <text class="block text-[24rpx] font-600 text-[#1677FF]">会员卡权益预约</text>
              <text class="block mt-1 text-[23rpx] text-gray-500">
                {{ selectedMemberCard?.name || '正在确认会员卡' }}<template v-if="selectedMemberCardConsumeMinutes"> · 本次核销 {{ selectedMemberCardConsumeMinutes }} 分钟</template>
              </text>
            </view>
            <view v-else class="mt-2">
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
        <view v-if="slotLoading" class="mt-3 rounded-[12rpx] bg-[#F3F4F6] px-3 py-2">
          <text class="text-[24rpx] text-gray-500">正在加载可预约时段</text>
        </view>
        <view v-else class="flex flex-wrap gap-2 mt-3">
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
        <view v-if="!slotLoading && slotLoadError" class="mt-3 rounded-[12rpx] bg-[#FFF1F0] px-3 py-2">
          <text class="text-[24rpx] text-[#CF1322]">
            {{ slotLoadError }}
          </text>
        </view>
        <view v-else-if="!slotLoading && !timeSlots.length" class="mt-3 rounded-[12rpx] bg-[#FFF7E6] px-3 py-2">
          <text class="text-[24rpx] text-[#AD6800]">
            当天暂无可预约时段，请选择其他日期
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
        <view v-if="memberCardIntentError" class="mb-3 rounded-[12rpx] bg-[#FFF1F2] px-3 py-3">
          <text class="text-[24rpx] leading-[34rpx] text-[#DC2626]">{{ memberCardIntentError }}</text>
        </view>
        <view class="flex items-center justify-between py-3 border-b border-[#F3F4F6]">
          <text class="text-[28rpx] text-gray-700">优惠券</text>
          <text v-if="couponLoading" class="text-[26rpx] text-gray-400">加载中</text>
          <text v-else-if="selectedMemberCard || isConsultationService" class="text-[26rpx] text-gray-400">当前订单不可用</text>
          <text v-else-if="!usableCoupons.length" class="text-[26rpx] text-gray-400">暂无可用</text>
          <text v-else class="text-[26rpx] text-[#1677FF]">
            {{ selectedCoupon ? `${selectedCoupon.name} -${formatCouponAmount(selectedCoupon)}` : '请选择' }}
          </text>
        </view>
        <view v-if="!selectedMemberCard && !isConsultationService && usableCoupons.length" class="mt-2">
          <view
            v-if="!hasMemberCardIntent"
            class="mb-2 rounded-[12rpx] border px-3 py-2"
            :class="!selectedCouponId ? 'border-[#1677FF] bg-[#EAF3FF]' : 'border-[#E5E7EB] bg-white'"
            @tap="onSelectCoupon(undefined)"
          >
            <text class="text-[26rpx]" :class="!selectedCouponId ? 'text-[#1677FF]' : 'text-gray-600'">
              不使用优惠券
            </text>
          </view>
          <view
            v-for="coupon in usableCoupons"
            :key="coupon.id"
            class="mb-2 rounded-[12rpx] border px-3 py-2"
            :class="selectedCouponId === coupon.couponId ? 'border-[#1677FF] bg-[#EAF3FF]' : 'border-[#E5E7EB] bg-white'"
            @tap="onSelectCoupon(coupon)"
          >
            <view class="flex items-center justify-between">
              <text class="text-[26rpx] font-600" :class="selectedCouponId === coupon.couponId ? 'text-[#1677FF]' : 'text-gray-700'">
                {{ coupon.name }}
              </text>
              <text class="text-[24rpx] text-[#ff383d]">
                -{{ formatCouponAmount(coupon) }}
              </text>
            </view>
            <text class="block mt-1 text-[23rpx] text-gray-400">
              {{ formatCouponDesc(coupon) }}
            </text>
          </view>
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
            v-if="!hasMemberCardIntent"
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
                本次扣 {{ selectedMemberCardId === card.id && selectedMemberCardConsumeMinutes ? selectedMemberCardConsumeMinutes : card.consumeUnits }}分钟
              </text>
            </view>
            <text class="block mt-1 text-[23rpx] text-gray-400">
              {{ formatCardBalance(card) }}，{{ cardValidityText(card) }}
            </text>
          </view>
        </view>
        <view v-if="selectedMemberCard && selectedMemberCardConsumeOptions.length > 1" class="mt-3 border-t border-[#F3F4F6] pt-3">
          <text class="block text-[26rpx] text-gray-700">本次核销分钟</text>
          <view class="mt-2 flex flex-wrap gap-2">
            <view
              v-for="minutes in selectedMemberCardConsumeOptions"
              :key="minutes"
              class="h-[64rpx] min-w-[128rpx] px-3 flex items-center justify-center border rounded-[8rpx]"
              :class="selectedMemberCardConsumeMinutes === minutes ? 'border-[#1677FF] bg-[#EAF3FF]' : 'border-[#E5E7EB] bg-white'"
              @tap="onSelectMemberCardConsumeMinutes(minutes)"
            >
              <text class="text-[26rpx]" :class="selectedMemberCardConsumeMinutes === minutes ? 'text-[#1677FF]' : 'text-gray-600'">
                {{ minutes }} 分钟
              </text>
            </view>
          </view>
        </view>
      </form-section>

      <form-section title="金额明细">
        <view v-if="priceLoading" class="py-4 text-center">
          <text class="text-[26rpx] text-gray-400">价格加载中</text>
        </view>
        <amount-detail v-else :items="pricePreview.items" :total="displayPayableAmount" />
        <view v-if="pricePreview.pricingMode === 'member_card'" class="mt-2 rounded-[10rpx] bg-[#F0FDF4] px-3 py-2">
          <text class="text-[24rpx] text-[#15803D]">
            本次冻结 {{ pricePreview.memberCardConsumeMinutes }} 分钟，预约完成后按核销规则结算
          </text>
        </view>
      </form-section>
    </loading-state>

    <bottom-action-bar
      :price="displayPayableAmount"
      price-label="应付"
      :primary-text="isMemberCardBooking || isConsultationService ? '提交预约' : '提交订单'"
      :primary-disabled="!canSubmit"
      :loading="submitting"
      @primary="onSubmit"
    />
  </view>
</template>
