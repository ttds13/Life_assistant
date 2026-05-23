<script lang="ts" setup>
import type { SaveAddressPayload, UserAddress } from '@/api/types/address'
import { getMockAddresses, saveMockAddresses } from '@/utils/mockDay4'

definePage({
  style: {
    navigationBarTitleText: '编辑地址',
  },
})

const addressId = ref<number | null>(null)
const saving = ref(false)
const form = reactive<SaveAddressPayload>({
  contactName: '',
  contactPhone: '',
  cityName: '',
  districtName: '',
  detailAddress: '',
  houseNumber: '',
  isDefault: false,
  latitude: null,
  longitude: null,
})

const isEdit = computed(() => !!addressId.value)

function loadAddress(id: number) {
  const address = getMockAddresses().find(item => item.id === id)
  if (!address)
    return
  Object.assign(form, address)
}

function validate() {
  if (!form.contactName.trim())
    return '请填写联系人'
  if (!/^1[3-9]\d{9}$/.test(form.contactPhone))
    return '请填写正确的手机号'
  if (!form.detailAddress.trim())
    return '请填写详细地址'
  return ''
}

function normalizeAddress(id: number): UserAddress {
  return {
    id,
    contactName: form.contactName.trim(),
    contactPhone: form.contactPhone.trim(),
    cityName: form.cityName?.trim() || '城市待选择',
    districtName: form.districtName?.trim() || '',
    detailAddress: form.detailAddress.trim(),
    houseNumber: form.houseNumber?.trim() || '',
    isDefault: !!form.isDefault,
    latitude: form.latitude ?? null,
    longitude: form.longitude ?? null,
  }
}

function onSave() {
  const message = validate()
  if (message) {
    uni.showToast({ icon: 'none', title: message })
    return
  }

  saving.value = true
  const list = getMockAddresses()
  const id = addressId.value || Date.now()
  const nextAddress = normalizeAddress(id)
  const nextList = list.filter(item => item.id !== id)

  if (nextAddress.isDefault) {
    nextList.forEach((item) => {
      item.isDefault = false
    })
  }
  else if (nextList.length === 0) {
    nextAddress.isDefault = true
  }

  saveMockAddresses([nextAddress, ...nextList])
  setTimeout(() => {
    saving.value = false
    uni.showToast({ icon: 'success', title: '已保存' })
    uni.navigateBack()
  }, 300)
}

function onDelete() {
  if (!addressId.value)
    return
  uni.showModal({
    title: '删除地址',
    content: '确定删除这个地址吗？',
    success: (res) => {
      if (!res.confirm)
        return
      const nextList = getMockAddresses().filter(item => item.id !== addressId.value)
      if (nextList.length > 0 && !nextList.some(item => item.isDefault))
        nextList[0].isDefault = true
      saveMockAddresses(nextList)
      uni.showToast({ icon: 'success', title: '已删除' })
      uni.navigateBack()
    },
  })
}

onLoad((query) => {
  const id = Number(query?.id)
  if (id) {
    addressId.value = id
    loadAddress(id)
  }
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[160rpx] pt-1">
    <form-section title="联系人信息" required>
      <view class="flex items-center py-3 border-b border-[#F3F4F6]">
        <text class="w-[160rpx] text-[28rpx] text-gray-700">联系人</text>
        <input v-model="form.contactName" class="flex-1 text-[28rpx]" placeholder="请填写联系人" />
      </view>
      <view class="flex items-center py-3">
        <text class="w-[160rpx] text-[28rpx] text-gray-700">手机号</text>
        <input v-model="form.contactPhone" class="flex-1 text-[28rpx]" type="number" :maxlength="11" placeholder="请填写手机号" />
      </view>
    </form-section>

    <form-section title="服务地址" required subtitle="城市/区域后续接入选择器">
      <view class="flex items-center py-3 border-b border-[#F3F4F6]">
        <text class="w-[160rpx] text-[28rpx] text-gray-700">城市</text>
        <input v-model="form.cityName" class="flex-1 text-[28rpx]" placeholder="城市待选择" />
      </view>
      <view class="flex items-center py-3 border-b border-[#F3F4F6]">
        <text class="w-[160rpx] text-[28rpx] text-gray-700">区域</text>
        <input v-model="form.districtName" class="flex-1 text-[28rpx]" placeholder="区域待选择" />
      </view>
      <view class="py-3 border-b border-[#F3F4F6]">
        <text class="text-[28rpx] text-gray-700 block mb-2">详细地址</text>
        <textarea v-model="form.detailAddress" class="w-full min-h-[120rpx] text-[28rpx]" placeholder="请输入街道、小区、楼栋等" />
      </view>
      <view class="flex items-center py-3">
        <text class="w-[160rpx] text-[28rpx] text-gray-700">门牌号</text>
        <input v-model="form.houseNumber" class="flex-1 text-[28rpx]" placeholder="例：8 栋 1201" />
      </view>
    </form-section>

    <view class="bg-white rounded-[16rpx] mx-4 mt-3 p-4 flex items-center justify-between">
      <view>
        <text class="text-[30rpx] font-600 text-gray-800 block">设为默认地址</text>
        <text class="text-[24rpx] text-gray-400 block mt-1">下单时优先使用该地址</text>
      </view>
      <switch :checked="form.isDefault" color="#1677FF" @change="form.isDefault = $event.detail.value" />
    </view>

    <view v-if="isEdit" class="mx-4 mt-6">
      <button class="h-[80rpx] rounded-[16rpx] bg-white text-[#EF4444] text-[28rpx] flex items-center justify-center" @tap="onDelete">
        删除地址
      </button>
    </view>

    <bottom-action-bar primary-text="保存地址" :loading="saving" @primary="onSave" />
  </view>
</template>
