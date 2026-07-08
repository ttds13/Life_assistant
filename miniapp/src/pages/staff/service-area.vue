<script lang="ts" setup>
import { getStaffProfile } from '@/api/staff'
import { getStaffAddresses } from '@/api/staff-address'
import type { UserAddress } from '@/api/types/address'
import type { StaffProfile } from '@/api/types/staff'

definePage({
  style: {
    navigationBarTitleText: '服务区域',
    navigationBarBackgroundColor: '#F5F7FA',
    navigationBarTextStyle: 'black',
  },
})

const loading = ref(false)
const profile = ref<StaffProfile | null>(null)
const addresses = ref<UserAddress[]>([])

async function loadData() {
  loading.value = true
  try {
    const [staffProfile, staffAddresses] = await Promise.all([
      getStaffProfile(),
      getStaffAddresses(),
    ])
    profile.value = staffProfile
    addresses.value = staffAddresses
  }
  finally {
    loading.value = false
  }
}

function addressLabel(address: UserAddress) {
  if (address.addressTitle)
    return address.addressTitle
  return address.formattedAddress || `${address.cityName || ''}${address.districtName || ''}${address.detailAddress || ''}`
}

function goAddresses() {
  uni.navigateTo({ url: '/pages/staff/address-list' })
}

onShow(() => {
  void loadData()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[60rpx] pt-1">
    <loading-state :loading="loading">
      <view class="mx-4 mt-3 rounded-[16rpx] bg-white p-4">
        <text class="block text-[28rpx] text-[#6B7280]">当前服务城市</text>
        <text class="block mt-2 text-[40rpx] text-[#1F2937] font-800">{{ profile?.regionText || '待完善' }}</text>
        <text class="block mt-2 text-[26rpx] leading-[42rpx] text-[#6B7280]">
          第一版由后台人工派单，服务城市和地址作为后台筛选参考，不按师傅端自选区域自动派单。
        </text>
      </view>

      <form-section title="常驻地址">
        <view v-if="addresses.length">
          <view v-for="address in addresses" :key="address.id" class="py-3 border-b border-[#F3F4F6] last:border-b-0">
            <text class="block text-[30rpx] text-[#1F2937] font-600">{{ address.contactName }} {{ address.contactPhone }}</text>
            <text class="block mt-1 text-[26rpx] leading-[40rpx] text-[#6B7280]">{{ addressLabel(address) }}</text>
          </view>
        </view>
        <empty-state v-else title="暂无师傅地址" description="维护常驻地址后，后台派单时更容易核对服务范围" />
        <button class="mt-4 h-[80rpx] rounded-[18rpx] bg-[#1677FF] text-white text-[28rpx]" @tap="goAddresses">
          维护地址
        </button>
      </form-section>
    </loading-state>
  </view>
</template>
