<script lang="ts" setup>
import { listStaffWithdrawRequests } from '@/api/staff'
import type { StaffWithdrawRequest } from '@/api/types/staff'

definePage({
  style: {
    navigationBarTitleText: '提现记录',
    navigationBarBackgroundColor: '#F5F7FA',
    navigationBarTextStyle: 'black',
  },
})

const loading = ref(false)
const status = ref('all')
const items = ref<StaffWithdrawRequest[]>([])

const tabs = [
  { label: '全部', value: 'all' },
  { label: '处理中', value: 'active' },
  { label: '已到账', value: 'paid' },
  { label: '异常', value: 'failed' },
]

function queryStatus(value: string) {
  if (value === 'active') return 'all'
  return value
}

function money(value?: number) {
  return Number(value || 0).toFixed(2)
}

function statusText(value: string) {
  const map: Record<string, string> = {
    pending_review: '待审核',
    approved: '待打款',
    processing: '打款中',
    wait_user_confirm: '待确认',
    paid: '已到账',
    failed: '失败',
    rejected: '已拒绝',
    cancelled: '已取消',
    expired: '已过期',
    manual_handling: '人工处理',
  }
  return map[value] || value
}

function formatDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getMonth() + 1}-${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

async function loadList() {
  loading.value = true
  try {
    const res = await listStaffWithdrawRequests({
      status: queryStatus(status.value),
      page: 1,
      pageSize: 100,
    })
    const list = res.items || []
    items.value = status.value === 'active'
      ? list.filter(item => ['pending_review', 'approved', 'processing', 'wait_user_confirm'].includes(item.status))
      : list
  }
  finally {
    loading.value = false
  }
}

function switchTab(value: string) {
  status.value = value
  void loadList()
}

function goDetail(id: number) {
  uni.navigateTo({ url: `/pages/staff/withdraw-detail?id=${id}` })
}

onShow(() => {
  void loadList()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[60rpx] pt-1">
    <view class="mx-4 mt-3 flex rounded-full bg-white p-[6rpx]">
      <view
        v-for="tab in tabs"
        :key="tab.value"
        class="h-[64rpx] flex-1 rounded-full flex items-center justify-center"
        :class="status === tab.value ? 'bg-[#1677FF]' : 'bg-transparent'"
        @tap="switchTab(tab.value)"
      >
        <text class="text-[26rpx]" :class="status === tab.value ? 'text-white font-700' : 'text-[#6B7280]'">{{ tab.label }}</text>
      </view>
    </view>

    <loading-state :loading="loading">
      <view v-if="items.length" class="mx-4 mt-3">
        <view
          v-for="item in items"
          :key="item.id"
          class="mb-3 rounded-[16rpx] bg-white p-4"
          @tap="goDetail(item.id)"
        >
          <view class="flex items-center justify-between">
            <text class="text-[26rpx] text-[#6B7280]">{{ item.withdrawNo }}</text>
            <text class="rounded-full bg-[#EEF5FF] px-3 py-1 text-[24rpx] text-[#1677FF]">{{ statusText(item.status) }}</text>
          </view>
          <view class="mt-3 flex items-end justify-between">
            <view>
              <text class="block text-[24rpx] text-[#8A8F99]">申请金额</text>
              <text class="block mt-1 text-[42rpx] text-[#1F2937] font-800">{{ money(item.amount) }}</text>
            </view>
            <text class="text-[24rpx] text-[#8A8F99]">{{ formatDate(item.createdAt) }}</text>
          </view>
        </view>
      </view>
      <empty-state v-else title="暂无提现记录" />
    </loading-state>
  </view>
</template>
