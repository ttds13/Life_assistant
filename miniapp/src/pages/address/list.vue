<script lang="ts" setup>
import type { UserAddress } from '@/api/types/address'
import { deleteUserAddress, getUserAddresses } from '@/api/address'
import { clearSelectedAddress, getSelectedAddress, setSelectedAddress } from '@/utils/addressSelection'

definePage({
  style: {
    navigationBarTitleText: '我的地址',
  },
})

const mode = ref<'select' | 'manage'>('manage')
const addresses = ref<UserAddress[]>([])
const loading = ref(false)
const deletingId = ref<number | null>(null)

const isEmpty = computed(() => !loading.value && addresses.value.length === 0)

async function loadAddresses() {
  loading.value = true
  try {
    addresses.value = await getUserAddresses()
  }
  finally {
    loading.value = false
  }
}

function onSelect(address: UserAddress) {
  if (mode.value === 'select') {
    setSelectedAddress(address)
    uni.navigateBack()
  }
}

function onEdit(address: UserAddress) {
  uni.navigateTo({ url: `/pages/address/edit?id=${address.id}` })
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
        await deleteUserAddress(address.id)
        if (getSelectedAddress()?.id === address.id)
          clearSelectedAddress()
        uni.showToast({ icon: 'success', title: '已删除' })
        await loadAddresses()
      }
      finally {
        deletingId.value = null
      }
    },
  })
}

function onCreate() {
  uni.navigateTo({ url: '/pages/address/edit' })
}

onLoad((query) => {
  mode.value = query?.mode === 'select' ? 'select' : 'manage'
  void loadAddresses()
})

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
        description="新增服务地址后可以更快下单"
      />

      <view v-else class="pt-1">
        <view v-for="item in addresses" :key="item.id">
          <address-card
            :address="item"
            :selectable="mode === 'select'"
            :editable="true"
            @select="onSelect"
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
              v-if="mode === 'select'"
              class="h-[64rpx] px-4 rounded-full bg-[#EAF3FF] text-[#1677FF] text-[26rpx]"
              @tap="onSelect(item)"
            >
              选择
            </button>
            <button
              class="h-[64rpx] px-4 rounded-full bg-[#1677FF] text-white text-[26rpx]"
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
