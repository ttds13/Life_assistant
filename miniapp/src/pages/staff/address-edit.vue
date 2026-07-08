<script lang="ts" setup>
import type { SaveAddressPayload } from '@/api/types/address'
import { createStaffAddress, deleteStaffAddress, getStaffAddress, updateStaffAddress } from '@/api/staff-address'
import { chooseAddressLocation, locateCurrentAddress } from '@/utils/location'
import type { AddressLocationResult } from '@/utils/location'

definePage({
  style: {
    navigationBarTitleText: '编辑师傅地址',
  },
})

const addressId = ref<number | null>(null)
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const locating = ref(false)
const locationTip = ref('')
const form = reactive<SaveAddressPayload>({
  contactName: '',
  contactPhone: '',
  provinceName: '',
  cityName: '',
  districtName: '',
  streetName: '',
  addressTitle: '',
  detailAddress: '',
  houseNumber: '',
  addressType: 'home',
  isDefault: false,
  latitude: null,
  longitude: null,
  coordinateType: 'gcj02',
})

const isEdit = computed(() => !!addressId.value)

async function loadAddress(id: number) {
  loading.value = true
  try {
    const address = await getStaffAddress(id, { addressType: form.addressType })
    Object.assign(form, {
      contactName: address.contactName,
      contactPhone: address.contactPhone,
      provinceName: address.provinceName || '',
      cityName: address.cityName || '',
      districtName: address.districtName || '',
      streetName: address.streetName || '',
      addressTitle: address.addressTitle || '',
      detailAddress: address.detailAddress,
      houseNumber: address.houseNumber || '',
      addressType: address.addressType || 'home',
      isDefault: address.isDefault,
      latitude: address.latitude ?? null,
      longitude: address.longitude ?? null,
      coordinateType: address.coordinateType || 'gcj02',
      poiId: address.poiId || undefined,
      mapProvider: address.mapProvider || undefined,
    })
  }
  finally {
    loading.value = false
  }
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

function payload(): SaveAddressPayload {
  return {
    contactName: form.contactName.trim(),
    contactPhone: form.contactPhone.trim(),
    provinceName: form.provinceName?.trim() || undefined,
    cityName: form.cityName?.trim() || undefined,
    districtName: form.districtName?.trim() || undefined,
    streetName: form.streetName?.trim() || undefined,
    addressTitle: form.addressTitle?.trim() || undefined,
    detailAddress: form.detailAddress.trim(),
    houseNumber: form.houseNumber?.trim() || undefined,
    addressType: form.addressType || 'home',
    isDefault: !!form.isDefault,
    latitude: form.latitude ?? null,
    longitude: form.longitude ?? null,
    coordinateType: form.coordinateType || 'gcj02',
    poiId: form.poiId,
    mapProvider: form.mapProvider,
  }
}

async function onSave() {
  const message = validate()
  if (message) {
    uni.showToast({ icon: 'none', title: message })
    return
  }
  saving.value = true
  try {
    if (addressId.value) {
      await updateStaffAddress(addressId.value, payload())
    }
    else {
      await createStaffAddress(payload())
    }
    uni.showToast({ icon: 'success', title: '已保存' })
    uni.navigateBack()
  }
  finally {
    saving.value = false
  }
}

function showLocationFailure(result: AddressLocationResult) {
  locationTip.value = result.message
  uni.showToast({ icon: 'none', title: result.message })
  if (result.reason === 'permission_denied') {
    uni.showModal({
      title: '定位权限未开启',
      content: '可打开设置授权定位，也可以继续手动填写地址并保存。',
      confirmText: '打开设置',
      cancelText: '手动填写',
      success: (res) => {
        if (res.confirm)
          uni.openSetting({})
      },
    })
  }
}

async function applyLocation(result: AddressLocationResult) {
  if (!result.ok) {
    if (result.data)
      Object.assign(form, result.data)
    showLocationFailure(result)
    return
  }

  const patch = result.data || {}
  Object.assign(form, {
    ...patch,
    detailAddress: patch.detailAddress || form.detailAddress,
  })
  locationTip.value = result.message
  uni.showToast({ icon: 'success', title: result.message })
}

async function onLocateCurrent() {
  if (locating.value) return
  locating.value = true
  try {
    await applyLocation(await locateCurrentAddress())
  }
  finally {
    locating.value = false
  }
}

async function onChooseLocation() {
  if (locating.value) return
  locating.value = true
  try {
    await applyLocation(await chooseAddressLocation())
  }
  finally {
    locating.value = false
  }
}

function onDelete() {
  if (!addressId.value)
    return
  uni.showModal({
    title: '删除地址',
    content: '确定删除这个地址吗？',
    success: async (res) => {
      if (!res.confirm || !addressId.value)
        return
      deleting.value = true
      try {
        await deleteStaffAddress(addressId.value, { addressType: form.addressType })
        uni.showToast({ icon: 'success', title: '已删除' })
        uni.navigateBack()
      }
      finally {
        deleting.value = false
      }
    },
  })
}

onLoad((query) => {
  const id = Number(query?.id)
  if (query?.addressType)
    form.addressType = String(query.addressType)
  if (id) {
    addressId.value = id
    void loadAddress(id)
  }
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[160rpx] pt-1">
    <loading-state :loading="loading">
      <form-section title="地址类型">
        <view class="flex gap-2">
          <view
            class="h-[68rpx] px-4 rounded-full flex items-center justify-center border"
            :class="form.addressType === 'home' ? 'bg-[#FFECEC] border-[#FF373D]' : 'bg-white border-[#E5E7EB]'"
            @tap="form.addressType = 'home'"
          >
            <text class="text-[26rpx]" :class="form.addressType === 'home' ? 'text-[#FF373D]' : 'text-gray-600'">常驻地址</text>
          </view>
          <view
            class="h-[68rpx] px-4 rounded-full flex items-center justify-center border"
            :class="form.addressType === 'work' ? 'bg-[#FFECEC] border-[#FF373D]' : 'bg-white border-[#E5E7EB]'"
            @tap="form.addressType = 'work'"
          >
            <text class="text-[26rpx]" :class="form.addressType === 'work' ? 'text-[#FF373D]' : 'text-gray-600'">工作地址</text>
          </view>
        </view>
      </form-section>

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

      <form-section title="师傅地址" required>
        <view class="grid grid-cols-2 gap-2 pb-3 border-b border-[#F3F4F6]">
          <button class="h-[72rpx] rounded-[12rpx] bg-[#FFECEC] text-[#FF373D] text-[26rpx]" :loading="locating" @tap="onLocateCurrent">
            {{ locating ? '定位中' : '定位当前地址' }}
          </button>
          <button class="h-[72rpx] rounded-[12rpx] bg-[#F3F4F6] text-[#374151] text-[26rpx]" :loading="locating" @tap="onChooseLocation">
            地图选点
          </button>
        </view>
        <view v-if="locationTip" class="mt-3 rounded-[12rpx] bg-[#FFF7ED] px-3 py-2">
          <text class="text-[24rpx] leading-[36rpx] text-[#AD6800]">{{ locationTip }}</text>
        </view>
        <view class="flex items-center py-3 border-b border-[#F3F4F6]">
          <text class="w-[160rpx] text-[28rpx] text-gray-700">省份</text>
          <input v-model="form.provinceName" class="flex-1 text-[28rpx]" placeholder="例如：山东省" />
        </view>
        <view class="flex items-center py-3 border-b border-[#F3F4F6]">
          <text class="w-[160rpx] text-[28rpx] text-gray-700">城市</text>
          <input v-model="form.cityName" class="flex-1 text-[28rpx]" placeholder="例如：青岛市" />
        </view>
        <view class="flex items-center py-3 border-b border-[#F3F4F6]">
          <text class="w-[160rpx] text-[28rpx] text-gray-700">区县</text>
          <input v-model="form.districtName" class="flex-1 text-[28rpx]" placeholder="例如：黄岛区" />
        </view>
        <view class="flex items-center py-3 border-b border-[#F3F4F6]">
          <text class="w-[160rpx] text-[28rpx] text-gray-700">位置</text>
          <input v-model="form.addressTitle" class="flex-1 text-[28rpx]" placeholder="小区/写字楼/学校" />
        </view>
        <view class="py-3 border-b border-[#F3F4F6]">
          <text class="text-[28rpx] text-gray-700 block mb-2">详细地址</text>
          <textarea v-model="form.detailAddress" class="w-full min-h-[120rpx] text-[28rpx]" placeholder="请输入楼栋、单元、楼层等" />
        </view>
        <view class="flex items-center py-3">
          <text class="w-[160rpx] text-[28rpx] text-gray-700">门牌号</text>
          <input v-model="form.houseNumber" class="flex-1 text-[28rpx]" placeholder="例如：8 栋 1201" />
        </view>
      </form-section>

      <view class="bg-white rounded-[16rpx] mx-4 mt-3 p-4 flex items-center justify-between">
        <view>
          <text class="text-[30rpx] font-600 text-gray-800 block">设为默认地址</text>
          <text class="text-[24rpx] text-gray-400 block mt-1">用于派单和距离参考</text>
        </view>
        <switch :checked="form.isDefault" color="#FF373D" @change="form.isDefault = $event.detail.value" />
      </view>

      <view v-if="isEdit" class="mx-4 mt-6">
        <button
          class="h-[80rpx] rounded-[16rpx] bg-white text-[#EF4444] text-[28rpx] flex items-center justify-center"
          :loading="deleting"
          :disabled="deleting"
          @tap="onDelete"
        >
          删除地址
        </button>
      </view>
    </loading-state>

    <bottom-action-bar primary-text="保存地址" :loading="saving" @primary="onSave" />
  </view>
</template>
