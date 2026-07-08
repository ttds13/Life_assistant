<script lang="ts" setup>
import { getUserPointRecords, getUserPoints } from '@/api/points'
import type { PointLedgerRecord, UserPointsSummary } from '@/api/types/points'

definePage({
  style: {
    navigationBarTitleText: '我的积分',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
    enablePullDownRefresh: true,
  },
})

const loading = ref(false)
const recordsLoading = ref(false)
const summary = ref<UserPointsSummary>({
  totalPoints: 0,
  availablePoints: 0,
  totalAmount: 0,
  rule: {
    unitAmount: 0.1,
    pointsPerUnit: 1,
    description: '每实际支付0.1元积1分，低于0.1元的部分不计入积分。',
  },
  recentEarned: [],
  recentTotalAmount: 0,
  recentTotalPoints: 0,
})
const records = ref<PointLedgerRecord[]>([])
const page = ref(1)
const pageSize = 20
const total = ref(0)

const ruleText = computed(() => summary.value.rule.description || '每实际支付0.1元积1分，低于0.1元的部分不计入积分。')
const hasMore = computed(() => records.value.length < total.value)

async function loadSummary() {
  summary.value = await getUserPoints()
}

async function loadRecords(reset = true) {
  if (recordsLoading.value)
    return
  recordsLoading.value = true
  try {
    const nextPage = reset ? 1 : page.value + 1
    const result = await getUserPointRecords({ page: nextPage, pageSize })
    records.value = reset ? result.items : records.value.concat(result.items)
    total.value = result.total
    page.value = result.page
  }
  finally {
    recordsLoading.value = false
  }
}

async function loadData(reset = true) {
  loading.value = true
  try {
    await Promise.all([
      loadSummary(),
      loadRecords(reset),
    ])
  }
  finally {
    loading.value = false
  }
}

function formatAmount(value?: number) {
  return Number(value || 0).toFixed(2)
}

function formatTime(value?: string) {
  if (!value)
    return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return value
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function typeText(type: string) {
  const map: Record<string, string> = {
    earn: '消费获得',
    adjust: '后台调整',
    consume: '积分抵扣',
  }
  return map[type] || type || '积分变动'
}

function openOrder(record: PointLedgerRecord) {
  if (!record.orderId)
    return
  uni.navigateTo({ url: `/pages/order/detail?id=${record.orderId}` })
}

onShow(() => {
  void loadData(true)
})

onPullDownRefresh(async () => {
  try {
    await loadData(true)
  }
  finally {
    uni.stopPullDownRefresh()
  }
})

onReachBottom(() => {
  if (hasMore.value)
    void loadRecords(false)
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[60rpx] pt-1">
    <view class="mx-4 mt-3 rounded-[24rpx] bg-[#1677FF] p-5 text-white">
      <view class="flex items-start justify-between">
        <view>
          <text class="block text-[28rpx] opacity-90">可用积分</text>
          <view class="mt-2 flex items-baseline">
            <text class="text-[76rpx] leading-[86rpx] font-800">{{ summary.availablePoints }}</text>
            <text class="ml-2 text-[28rpx] font-700">分</text>
          </view>
        </view>
        <view class="rounded-full bg-white/18 px-3 py-1">
          <text class="text-[24rpx] text-white font-700">自动累计</text>
        </view>
      </view>

      <view class="mt-5 rounded-[18rpx] bg-white/14 p-3">
        <text class="text-[24rpx] leading-[36rpx] text-white">{{ ruleText }}</text>
      </view>

      <view class="mt-5 flex rounded-[18rpx] bg-white/14 py-3">
        <view class="flex-1 center flex-col">
          <text class="text-[32rpx] font-800">{{ summary.totalPoints }}</text>
          <text class="mt-1 text-[22rpx] opacity-80">累计积分</text>
        </view>
        <view class="w-[1rpx] bg-white/24" />
        <view class="flex-1 center flex-col">
          <text class="text-[32rpx] font-800">¥{{ formatAmount(summary.totalAmount) }}</text>
          <text class="mt-1 text-[22rpx] opacity-80">计分消费</text>
        </view>
      </view>
    </view>

    <view class="mx-4 mt-3 rounded-[18rpx] bg-white overflow-hidden">
      <view class="px-4 py-4 border-b border-[#F3F4F6]">
        <text class="text-[32rpx] text-[#1F2937] font-700">积分明细</text>
      </view>

      <loading-state :loading="loading && !records.length">
        <view v-if="records.length">
          <view
            v-for="item in records"
            :key="item.id"
            class="px-4 py-4 border-b border-[#F3F4F6] last:border-b-0"
            @tap="openOrder(item)"
          >
            <view class="flex items-start justify-between gap-3">
              <view class="min-w-0 flex-1">
                <text class="block text-[30rpx] text-[#1F2937] font-700">{{ typeText(item.type) }}</text>
                <text class="block mt-1 text-[24rpx] leading-[34rpx] text-[#6B7280]">
                  {{ item.remark || (item.orderNo ? `订单 ${item.orderNo}` : '积分变动') }}
                </text>
                <text class="block mt-1 text-[22rpx] text-[#9CA3AF]">{{ formatTime(item.createdAt || item.earnedAt) }}</text>
              </view>
              <view class="shrink-0 text-right">
                <text class="block text-[34rpx] text-[#16A34A] font-800">+{{ item.points }}</text>
                <text class="block mt-1 text-[22rpx] text-[#9CA3AF]">余额 {{ item.balanceAfter }}</text>
              </view>
            </view>
            <view v-if="item.amount" class="mt-2">
              <text class="text-[22rpx] text-[#9CA3AF]">计分金额 ¥{{ formatAmount(item.amount) }}</text>
            </view>
          </view>
        </view>

        <view v-else class="min-h-[420rpx] flex flex-col items-center justify-center">
          <view class="w-[150rpx] h-[150rpx] rounded-full bg-[#F3F4F6] flex items-center justify-center">
            <text class="i-carbon-chart-line-data text-[82rpx] text-[#C4C8D0]" />
          </view>
          <text class="mt-5 text-[32rpx] text-[#6B7280]">暂无积分明细</text>
          <text class="mt-2 text-[24rpx] text-[#9CA3AF]">完成支付后会自动累计积分</text>
        </view>
      </loading-state>
    </view>

    <view v-if="records.length" class="py-4 text-center">
      <text class="text-[24rpx] text-[#9CA3AF]">
        {{ hasMore ? (recordsLoading ? '加载中...' : '上拉加载更多') : '已加载全部明细' }}
      </text>
    </view>
  </view>
</template>
