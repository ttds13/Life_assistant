<script lang="ts" setup>
import type { OrderStatus, UserOrder } from '@/api/types/orders'
import { getMockOrders } from '@/utils/mockDay4'

definePage({
  style: {
    navigationBarTitleText: '我的订单',
  },
})

type StatusFilter = 'all' | OrderStatus

const currentStatus = ref<StatusFilter>('all')
const loading = ref(false)
const orders = ref<UserOrder[]>([])

const tabs: { label: string, value: StatusFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '待支付', value: 'pending_payment' },
  { label: '待派单', value: 'pending_dispatch' },
  { label: '服务中', value: 'in_service' },
  { label: '待确认', value: 'pending_confirm' },
  { label: '已完成', value: 'completed' },
]

function isStatusFilter(value: string): value is StatusFilter {
  return tabs.some(tab => tab.value === value)
}

const filteredOrders = computed(() => {
  if (currentStatus.value === 'all')
    return orders.value
  if (currentStatus.value === 'in_service') {
    return orders.value.filter(item => ['dispatched', 'accepted', 'on_the_way', 'in_service'].includes(item.status))
  }
  return orders.value.filter(item => item.status === currentStatus.value)
})

function loadOrders() {
  loading.value = true
  // TODO: 接入 GET /orders
  orders.value = getMockOrders()
  loading.value = false
}

function onTapOrder(order: UserOrder) {
  uni.navigateTo({ url: `/pages/order/detail?id=${order.id}` })
}

function onPrimary(order: UserOrder) {
  if (order.status === 'pending_payment') {
    uni.navigateTo({ url: `/pages/payment/result?orderId=${order.id}&status=pending&amount=${order.payableAmount}` })
    return
  }
  if (order.status === 'completed') {
    uni.showToast({ icon: 'none', title: '评价功能待完善' })
    return
  }
  onTapOrder(order)
}

function onSecondary(order: UserOrder) {
  if (order.status === 'pending_payment') {
    uni.showModal({
      title: '取消订单',
      content: '确定取消该订单吗？',
      success: (res) => {
        if (res.confirm)
          uni.showToast({ icon: 'success', title: '已取消' })
      },
    })
    return
  }
  uni.showToast({ icon: 'none', title: '售后功能待完善' })
}

onLoad((query) => {
  const status = String(query?.status || 'all')
  if (isStatusFilter(status))
    currentStatus.value = status
})

onShow(() => {
  loadOrders()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[120rpx]">
    <view class="bg-white sticky top-0 z-10">
      <scroll-view scroll-x class="whitespace-nowrap px-4 py-3">
        <view
          v-for="tab in tabs"
          :key="tab.value"
          class="inline-flex h-[64rpx] px-4 rounded-full items-center justify-center mr-2"
          :class="currentStatus === tab.value ? 'bg-[#EAF3FF]' : 'bg-[#F3F4F6]'"
          @tap="currentStatus = tab.value"
        >
          <text class="text-[26rpx]" :class="currentStatus === tab.value ? 'text-[#1677FF] font-600' : 'text-gray-500'">{{ tab.label }}</text>
        </view>
      </scroll-view>
    </view>

    <loading-state :loading="loading">
      <view v-if="filteredOrders.length" class="pt-1">
        <order-card
          v-for="item in filteredOrders"
          :key="item.id"
          :order="item"
          @tap="onTapOrder"
          @primary="onPrimary"
          @secondary="onSecondary"
        />
      </view>

      <empty-state
        v-else
        type="empty"
        title="暂无订单"
        description="去首页看看有什么服务吧"
      />
    </loading-state>
  </view>
</template>
