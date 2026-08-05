<script lang="ts" setup>
import { cancelOrder, getOrders } from '@/api/orders'
import type { UserOrder } from '@/api/types/orders'
import { useTokenStore } from '@/store/token'
import { consumeOrderListFilter } from '@/utils/orderListFilter'
import type { OrderListFilter } from '@/utils/orderListFilter'
import { toLoginPage } from '@/utils/toLoginPage'

definePage({
  style: {
    navigationBarTitleText: '我的订单',
  },
})

type StatusFilter = 'all' | 'pending_payment' | 'pending_dispatch' | 'in_service' | 'pending_confirm' | 'completed' | 'after_sales'
type OrderView = 'bookings' | 'member_card_purchase'

const currentView = ref<OrderView>('bookings')
const currentStatus = ref<StatusFilter>('all')
const loading = ref(false)
const orders = ref<UserOrder[]>([])
const tokenStore = useTokenStore()

const tabs: { label: string, value: StatusFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '待支付', value: 'pending_payment' },
  { label: '待接单', value: 'pending_dispatch' },
  { label: '服务中', value: 'in_service' },
  { label: '待确认', value: 'pending_confirm' },
  { label: '已完成', value: 'completed' },
  { label: '售后', value: 'after_sales' },
]
const visibleTabs = computed(() => currentView.value === 'member_card_purchase'
  ? tabs.filter(tab => ['all', 'pending_payment', 'completed', 'after_sales'].includes(tab.value))
  : tabs,
)

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
  if (!tokenStore.hasLogin) {
    orders.value = []
    loading.value = false
    toLoginPage()
    return
  }

  loading.value = true
  try {
    const result = await getOrders({ orderType: currentView.value, page: 1, pageSize: 100 })
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
    uni.showToast({ icon: 'none', title: '当前暂无评价入口' })
    return
  }
  onTapOrder(order)
}

function onSecondary(order: UserOrder) {
  if (order.status === 'completed') {
    if (order.orderType === 'member_card_purchase') {
      uni.navigateTo({ url: `/pages/order/detail?id=${order.id}` })
      return
    }
    uni.navigateTo({ url: `/pages/order/after-sales-create?orderId=${order.id}` })
    return
  }
  if (['after_sales', 'refund_pending', 'refunded'].includes(order.status)) {
    uni.navigateTo({ url: `/pages/order/detail?id=${order.id}` })
    return
  }
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
  uni.showToast({ icon: 'none', title: '如需帮助请联系客服' })
}

onLoad((query) => {
  applyStatusFilter(String(query?.status || 'all'))
})

function switchOrderView(view: OrderView) {
  if (currentView.value === view)
    return
  currentView.value = view
  currentStatus.value = 'all'
  void loadOrders()
}

onShow(() => {
  applyStatusFilter(consumeOrderListFilter())
  loadOrders()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[120rpx]">
    <view class="bg-white px-4 pt-3">
      <view class="grid grid-cols-2 h-[72rpx] rounded-[8rpx] bg-[#F3F4F6] p-[4rpx]">
        <view
          class="flex items-center justify-center rounded-[6rpx]"
          :class="currentView === 'bookings' ? 'bg-white text-[#1677FF]' : 'text-gray-500'"
          @tap="switchOrderView('bookings')"
        >
          <text class="text-[27rpx]">服务预约</text>
        </view>
        <view
          class="flex items-center justify-center rounded-[6rpx]"
          :class="currentView === 'member_card_purchase' ? 'bg-white text-[#1677FF]' : 'text-gray-500'"
          @tap="switchOrderView('member_card_purchase')"
        >
          <text class="text-[27rpx]">会员卡订单</text>
        </view>
      </view>
    </view>
    <view class="bg-white sticky top-0 z-10">
      <scroll-view scroll-x class="whitespace-nowrap px-4 py-3">
        <view
          v-for="tab in visibleTabs"
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
