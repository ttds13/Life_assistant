<script lang="ts" setup>
import { getStaffProfile, getStaffWithdrawSummary } from '@/api/staff'
import type { StaffProfile, StaffWithdrawSummary } from '@/api/types/staff'

definePage({
  style: {
    navigationBarTitleText: '证件结算',
    navigationBarBackgroundColor: '#F5F7FA',
    navigationBarTextStyle: 'black',
  },
})

const loading = ref(false)
const summary = ref<StaffWithdrawSummary | null>(null)
const profile = ref<StaffProfile | null>(null)

const activeStatusText = computed(() => summary.value?.activeRequest ? statusText(summary.value.activeRequest.status) : '')
const withdrawBlockReason = computed(() => {
  const data = summary.value
  if (!data) return '结算信息加载中'
  if (!data.openidBound) return '请先完成微信登录绑定'
  if (data.activeRequest) return `已有${statusText(data.activeRequest.status)}提现单`
  if (data.availableAmount < data.minAmount) return `最低提现 ${money(data.minAmount)} 元`
  if (data.availableAmount <= 0) return '暂无可提现余额'
  return ''
})
const canWithdraw = computed(() => {
  const data = summary.value
  return Boolean(data?.openidBound && data.availableAmount >= data.minAmount && !data.activeRequest)
})

function money(value?: number) {
  return Number(value || 0).toFixed(2)
}

function statusText(status?: string) {
  const map: Record<string, string> = {
    pending_review: '待审核',
    approved: '待打款',
    processing: '打款中',
    wait_user_confirm: '待确认收款',
    paid: '已到账',
    failed: '打款失败',
    rejected: '已拒绝',
    cancelled: '已取消',
    expired: '已过期',
    manual_handling: '人工处理中',
  }
  return map[status || ''] || status || '-'
}

async function loadData() {
  loading.value = true
  try {
    const [nextSummary, nextProfile] = await Promise.all([
      getStaffWithdrawSummary(),
      getStaffProfile('month'),
    ])
    summary.value = nextSummary
    profile.value = nextProfile
  }
  finally {
    loading.value = false
  }
}

function goCreate() {
  if (!summary.value) {
    uni.showToast({ icon: 'none', title: '结算信息加载中' })
    return
  }
  if (!summary.value?.openidBound) {
    uni.showToast({ icon: 'none', title: '请先完成微信登录绑定' })
    return
  }
  if (summary.value.activeRequest) {
    uni.showToast({ icon: 'none', title: '已有处理中提现单' })
    setTimeout(goActive, 400)
    return
  }
  if (summary.value.availableAmount < summary.value.minAmount) {
    uni.showToast({ icon: 'none', title: `最低提现 ${money(summary.value.minAmount)} 元` })
    return
  }
  uni.navigateTo({ url: '/pages/staff/withdraw-create' })
}

function goList() {
  uni.navigateTo({ url: '/pages/staff/withdraw-list' })
}

function goActive() {
  const id = summary.value?.activeRequest?.id
  if (id) uni.navigateTo({ url: `/pages/staff/withdraw-detail?id=${id}` })
}

onShow(() => {
  void loadData()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[60rpx] pt-1">
    <loading-state :loading="loading">
      <view class="mx-4 mt-3 rounded-[16rpx] bg-[#1677FF] p-4">
        <text class="block text-[26rpx] text-white/80">可提现余额</text>
        <view class="mt-2 flex items-end">
          <text class="text-[72rpx] leading-[82rpx] text-white font-800">{{ money(summary?.availableAmount) }}</text>
          <text class="mb-[10rpx] ml-2 text-[28rpx] text-white/80">元</text>
        </view>
        <view class="mt-4 flex gap-3">
          <button class="h-[80rpx] flex-1 rounded-[16rpx] bg-white text-[#1677FF] text-[28rpx] font-700" @tap="goCreate">
            申请提现
          </button>
          <button class="h-[80rpx] flex-1 rounded-[16rpx] bg-white/15 text-white text-[28rpx]" @tap="goList">
            提现记录
          </button>
        </view>
      </view>

      <view v-if="withdrawBlockReason && !canWithdraw" class="mx-4 mt-3 rounded-[16rpx] bg-[#FFF7ED] px-4 py-3">
        <text class="text-[26rpx] leading-[40rpx] text-[#AD6800]">{{ withdrawBlockReason }}</text>
      </view>

      <view v-if="summary?.activeRequest" class="mx-4 mt-3 rounded-[16rpx] bg-white p-4" @tap="goActive">
        <view class="flex items-center justify-between">
          <text class="text-[30rpx] text-[#1F2937] font-700">处理中提现单</text>
          <text class="text-[26rpx] text-[#1677FF]">{{ activeStatusText }}</text>
        </view>
        <view class="mt-3 flex items-center justify-between">
          <text class="text-[26rpx] text-[#6B7280]">{{ summary.activeRequest.withdrawNo }}</text>
          <text class="text-[34rpx] text-[#1F2937] font-800">{{ money(summary.activeRequest.amount) }}</text>
        </view>
      </view>

      <view class="mx-4 mt-3 grid grid-cols-2 gap-3">
        <view class="rounded-[16rpx] bg-white p-4">
          <text class="block text-[24rpx] text-[#6B7280]">提现中冻结</text>
          <text class="block mt-2 text-[44rpx] text-[#F59E0B] font-800">{{ money(summary?.frozenAmount) }}</text>
        </view>
        <view class="rounded-[16rpx] bg-white p-4">
          <text class="block text-[24rpx] text-[#6B7280]">累计到账</text>
          <text class="block mt-2 text-[44rpx] text-[#16A34A] font-800">{{ money(summary?.withdrawnAmount) }}</text>
        </view>
        <view class="rounded-[16rpx] bg-white p-4">
          <text class="block text-[24rpx] text-[#6B7280]">待结算</text>
          <text class="block mt-2 text-[44rpx] text-[#1F2937] font-800">{{ money(summary?.pendingSettlementAmount) }}</text>
        </view>
        <view class="rounded-[16rpx] bg-white p-4">
          <text class="block text-[24rpx] text-[#6B7280]">本月服务额</text>
          <text class="block mt-2 text-[44rpx] text-[#1F2937] font-800">{{ money(profile?.stats?.month?.commissionAmount) }}</text>
        </view>
      </view>

      <form-section title="提现规则">
        <view class="py-2">
          <text class="block text-[26rpx] leading-[42rpx] text-[#4B5563]">最低提现 {{ money(summary?.minAmount) }} 元，单笔最高 {{ money(summary?.maxSingleAmount) }} 元。</text>
          <text class="block mt-1 text-[26rpx] leading-[42rpx] text-[#4B5563]">订单完成后默认 T+{{ summary?.settlementDays || 0 }} 进入可提现余额。</text>
          <text class="block mt-1 text-[26rpx] leading-[42rpx] text-[#4B5563]">同一时间只能存在一笔待审核、打款中或待确认的提现。</text>
          <text class="block mt-1 text-[26rpx] leading-[42rpx] text-[#4B5563]">线上打款到微信钱包，前端确认成功不代表到账，最终以后台回调或查单结果为准。</text>
        </view>
      </form-section>
    </loading-state>
  </view>
</template>
