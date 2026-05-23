<script lang="ts" setup>
import type { UserAddress } from '@/api/types/address'
import { getMockAddresses, setSelectedMockAddress } from '@/utils/mockDay4'

definePage({
  style: {
    navigationBarTitleText: '我的地址',
  },
})

const mode = ref<'select' | 'manage'>('manage')
const addresses = ref<UserAddress[]>([])

const isEmpty = computed(() => addresses.value.length === 0)

function loadAddresses() {
  // TODO: 接入 GET /user/addresses
  addresses.value = getMockAddresses()
}

function onSelect(address: UserAddress) {
  if (mode.value === 'select') {
    setSelectedMockAddress(address)
    uni.navigateBack()
  }
}

function onEdit(address: UserAddress) {
  uni.navigateTo({ url: `/pages/address/edit?id=${address.id}` })
}

function onCreate() {
  uni.navigateTo({ url: '/pages/address/edit' })
}

onLoad((query) => {
  mode.value = query?.mode === 'select' ? 'select' : 'manage'
  loadAddresses()
})

onShow(() => {
  loadAddresses()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[140rpx]">
    <empty-state
      v-if="isEmpty"
      type="empty"
      title="暂无地址"
      description="新增服务地址后可以更快下单"
    />

    <view v-else class="pt-1">
      <address-card
        v-for="item in addresses"
        :key="item.id"
        :address="item"
        :selectable="mode === 'select'"
        :editable="mode === 'manage'"
        @select="onSelect"
        @edit="onEdit"
      />
    </view>

    <bottom-action-bar primary-text="新增地址" @primary="onCreate" />
  </view>
</template>
