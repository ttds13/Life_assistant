<script lang="ts" setup>
import { cancelOrder, getOrders } from '@/api/orders'
import type { UserOrder } from '@/api/types/orders'
import { consumeOrderListFilter } from '@/utils/orderListFilter'
import type { OrderListFilter } from '@/utils/orderListFilter'

definePage({
  style: {
    navigationBarTitleText: '我的订单',
  },
})

type StatusFilter = 'all' | 'pending_payment' | 'pending_dispatch' | 'in_service' | 'pending_confirm' | 'completed' | 'after_sales'

const currentStatus = ref<StatusFilter>('all')
const loading = ref(false)
const orders = ref<UserOrder[]>([])

const tabs: { label: string, value: StatusFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '待支付', value: 'pending_payment' },
  { label: '待接单', value: 'pending_dispatch' },
  { label: '服务中', value: 'in_service' },
  { label: '待确认', value: 'pending_confirm' },
  { label: '已完成', value: 'completed' },
  { label: '售后', value: 'after_sales' },
]

function normalizeStatusFilter(value: string): StatusFilter | null {
  if (tabs.some(tab => tab.value === value))
    return value as StatusFilter

  if (['dispatched', 'accepted', 'on_the_way'].includes(value))
    return 'in_service'

  if (['refund_pending', 'refunded'].includes(value))
    return 'after_sales'

  return null
}

function applyStatusFilter(value?: string | OrderListFilter | null) {
  if (!value)
    return
  const status = normalizeStatusFilter(value)
  if (status)
    currentStatus.value = status
}

const filteredOrders = computed(() => {
  if (currentStatus.value === 'all')
    return orders.value
  if (currentStatus.value === 'in_service') {
    return orders.value.filter(item => ['dispatched', 'accepted', 'on_the_way', 'in_service'].includes(item.status))
  }
  if (currentStatus.value === 'after_sales') {
    return orders.value.filter(item => ['after_sales', 'refund_pending', 'refunded'].includes(item.status))
  }
  return orders.value.filter(item => item.status === currentStatus.value)
})

async function loadOrders() {
  loading.value = true
  try {
    const result = await getOrders({ page: 1, pageSize: 100 })
    orders.value = result.items
  }
  finally {
    loading.value = false
  }
}

function onTapOrder(order: UserOrder) {
  uni.navigateTo({ url: `/pages/order/detail?id=${order.id}` })
}

function onPrimary(order: UserOrder) {
  if (order.status === 'pending_payment') {
    uni.navigateTo({ url: `/pages/order/detail?id=${order.id}` })
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
      success: async (res) => {
        if (res.confirm) {
          await cancelOrder(order.id)
          uni.showToast({ icon: 'success', title: '已取消' })
          loadOrders()
        }
      },
    })
    return
  }
  uni.showToast({ icon: 'none', title: '售后功能待完善' })
}

onLoad((query) => {
  applyStatusFilter(String(query?.status || 'all'))
})

onShow(() => {
  applyStatusFilter(consumeOrderListFilter())
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
