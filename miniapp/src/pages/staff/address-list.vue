<script lang="ts" setup>
import type { UserAddress } from '@/api/types/address'
import { deleteStaffAddress, getStaffAddresses } from '@/api/staff-address'

definePage({
  style: {
    navigationBarTitleText: '师傅地址',
  },
})

const addresses = ref<UserAddress[]>([])
const loading = ref(false)
const deletingId = ref<number | null>(null)
const isEmpty = computed(() => !loading.value && addresses.value.length === 0)

async function loadAddresses() {
  loading.value = true
  try {
    addresses.value = await getStaffAddresses()
  }
  finally {
    loading.value = false
  }
}

function onCreate() {
  uni.navigateTo({ url: '/pages/staff/address-edit' })
}

function onEdit(address: UserAddress) {
  uni.navigateTo({ url: `/pages/staff/address-edit?id=${address.id}&addressType=${address.addressType || 'home'}` })
}

function onDelete(address: UserAddress) {
  uni.showModal({
    title: '删除地址',
    content: '确定删除这个地址吗？',
    success: async (res) => {
      if (!res.confirm)
        return
      deletingId.value = address.id
      try {
        await deleteStaffAddress(address.id, { addressType: address.addressType || 'home' })
        uni.showToast({ icon: 'success', title: '已删除' })
        await loadAddresses()
      }
      finally {
        deletingId.value = null
      }
    },
  })
}

onShow(() => {
  void loadAddresses()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[140rpx]">
    <loading-state :loading="loading">
      <empty-state
        v-if="isEmpty"
        type="empty"
        title="暂无地址"
        description="新增常驻地址后便于平台派单"
      />
      <view v-else class="pt-1">
        <view v-for="item in addresses" :key="item.id">
          <address-card
            :address="item"
            :editable="true"
            @edit="onEdit"
          />
          <view class="mx-4 mt-[-8rpx] mb-3 bg-white rounded-b-[16rpx] px-4 pb-3 flex items-center justify-end gap-3">
            <button
              class="h-[64rpx] px-4 rounded-full bg-white border border-[#FEE2E2] text-[#EF4444] text-[26rpx]"
              :loading="deletingId === item.id"
              :disabled="deletingId === item.id"
              @tap.stop="onDelete(item)"
            >
              删除
            </button>
            <button
              class="h-[64rpx] px-4 rounded-full bg-[#FF373D] text-white text-[26rpx]"
              @tap="onEdit(item)"
            >
              编辑
            </button>
          </view>
        </view>
      </view>
    </loading-state>

    <bottom-action-bar primary-text="新增地址" @primary="onCreate" />
  </view>
</template>
