<script lang="ts" setup>
import { cancelStaffWithdrawRequest, getStaffWithdrawConfirmPackage, getStaffWithdrawDetail } from '@/api/staff'
import type { StaffWithdrawDetail } from '@/api/types/staff'
import { requestMerchantTransfer } from '@/utils/wechatTransfer'

definePage({
  style: {
    navigationBarTitleText: '提现详情',
    navigationBarBackgroundColor: '#F5F7FA',
    navigationBarTextStyle: 'black',
  },
})

const id = ref(0)
const loading = ref(false)
const confirming = ref(false)
const detail = ref<StaffWithdrawDetail | null>(null)

const canConfirm = computed(() => detail.value?.status === 'wait_user_confirm')
const canCancel = computed(() => detail.value?.status === 'pending_review')

function money(value?: number) {
  return Number(value || 0).toFixed(2)
}

function statusText(value?: string) {
  const map: Record<string, string> = {
    pending_review: '待后台审核',
    approved: '审核通过，待打款',
    processing: '打款处理中',
    wait_user_confirm: '待确认收款',
    paid: '已到账',
    failed: '打款失败',
    rejected: '审核拒绝',
    cancelled: '已取消',
    expired: '确认超时',
    manual_handling: '人工处理中',
  }
  return map[value || ''] || value || '-'
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

async function loadDetail() {
  if (!id.value) return
  loading.value = true
  try {
    detail.value = await getStaffWithdrawDetail(id.value)
  }
  finally {
    loading.value = false
  }
}

async function confirmReceive() {
  if (!id.value || confirming.value) return
  confirming.value = true
  try {
    const pkg = await getStaffWithdrawConfirmPackage(id.value)
    await requestMerchantTransfer(pkg.packageInfo)
    uni.showToast({ icon: 'none', title: '已提交确认，等待到账结果' })
    void loadDetail()
  }
  catch (error) {
    const message = error instanceof Error ? error.message : '确认收款未完成'
    uni.showToast({ icon: 'none', title: message })
  }
  finally {
    confirming.value = false
  }
}

async function cancelRequest() {
  if (!id.value) return
  const result = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '取消提现',
      content: '确认取消当前待审核提现申请？',
      success: res => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    })
  })
  if (!result) return
  detail.value = await cancelStaffWithdrawRequest(id.value)
  uni.showToast({ icon: 'success', title: '已取消' })
}

onLoad((query) => {
  id.value = Number(query?.id || 0)
  void loadDetail()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[60rpx] pt-1">
    <loading-state :loading="loading">
      <view class="mx-4 mt-3 rounded-[16rpx] bg-white p-4">
        <text class="block text-[26rpx] text-[#6B7280]">提现金额</text>
        <view class="mt-2 flex items-end">
          <text class="text-[64rpx] leading-[76rpx] text-[#1F2937] font-800">{{ money(detail?.amount) }}</text>
          <text class="mb-[8rpx] ml-2 text-[26rpx] text-[#6B7280]">元</text>
        </view>
        <view class="mt-4 rounded-[12rpx] bg-[#F8FAFC] p-3">
          <text class="block text-[28rpx] text-[#1677FF] font-700">{{ statusText(detail?.status) }}</text>
          <text v-if="detail?.failureReason || detail?.rejectReason" class="block mt-2 text-[24rpx] leading-[38rpx] text-[#EF4444]">
            {{ detail?.failureReason || detail?.rejectReason }}
          </text>
        </view>
      </view>

      <view class="mx-4 mt-3 rounded-[16rpx] bg-white p-4">
        <view class="flex py-2">
          <text class="w-[180rpx] text-[26rpx] text-[#8A8F99]">提现单号</text>
          <text class="flex-1 text-[26rpx] text-[#1F2937]">{{ detail?.withdrawNo || '-' }}</text>
        </view>
        <view class="flex py-2">
          <text class="w-[180rpx] text-[26rpx] text-[#8A8F99]">渠道</text>
          <text class="flex-1 text-[26rpx] text-[#1F2937]">{{ detail?.channel === 'wechat' ? '微信钱包' : 'Mock' }}</text>
        </view>
        <view class="flex py-2">
          <text class="w-[180rpx] text-[26rpx] text-[#8A8F99]">申请时间</text>
          <text class="flex-1 text-[26rpx] text-[#1F2937]">{{ formatDate(detail?.createdAt) }}</text>
        </view>
        <view class="flex py-2">
          <text class="w-[180rpx] text-[26rpx] text-[#8A8F99]">审核时间</text>
          <text class="flex-1 text-[26rpx] text-[#1F2937]">{{ formatDate(detail?.reviewedAt) }}</text>
        </view>
        <view class="flex py-2">
          <text class="w-[180rpx] text-[26rpx] text-[#8A8F99]">到账时间</text>
          <text class="flex-1 text-[26rpx] text-[#1F2937]">{{ formatDate(detail?.paidAt) }}</text>
        </view>
        <view v-if="detail?.transferBillNo" class="flex py-2">
          <text class="w-[180rpx] text-[26rpx] text-[#8A8F99]">微信单号</text>
          <text class="flex-1 text-[26rpx] text-[#1F2937]">{{ detail.transferBillNo }}</text>
        </view>
      </view>

      <view v-if="detail?.incomeRecords?.length" class="mx-4 mt-3 rounded-[16rpx] bg-white p-4">
        <text class="block text-[30rpx] text-[#1F2937] font-700">关联收入</text>
        <view v-for="record in detail.incomeRecords" :key="record.id" class="mt-3 border-t border-[#F3F4F6] pt-3">
          <view class="flex items-center justify-between">
            <text class="text-[26rpx] text-[#1F2937]">{{ record.orderNo }}</text>
            <text class="text-[28rpx] text-[#1F2937] font-700">{{ money(record.amount) }}</text>
          </view>
          <text class="block mt-1 text-[24rpx] text-[#8A8F99]">结算状态 {{ record.settlementStatus }} / 提现状态 {{ record.withdrawStatus }}</text>
        </view>
      </view>

      <view v-if="detail?.statusLogs?.length" class="mx-4 mt-3 rounded-[16rpx] bg-white p-4">
        <text class="block text-[30rpx] text-[#1F2937] font-700">处理进度</text>
        <view v-for="log in detail.statusLogs" :key="log.id" class="mt-3 flex">
          <view class="mt-[8rpx] h-[16rpx] w-[16rpx] rounded-full bg-[#1677FF]" />
          <view class="ml-3 flex-1">
            <text class="block text-[26rpx] text-[#1F2937]">{{ statusText(log.toStatus) }}</text>
            <text class="block mt-1 text-[24rpx] text-[#8A8F99]">{{ formatDate(log.createdAt) }} {{ log.remark || '' }}</text>
          </view>
        </view>
      </view>

      <view class="mx-4 mt-5 flex gap-3">
        <button v-if="canCancel" class="h-[88rpx] flex-1 rounded-[18rpx] bg-[#F3F4F6] text-[#4B5563] text-[30rpx]" @tap="cancelRequest">
          取消申请
        </button>
        <button v-if="canConfirm" class="h-[88rpx] flex-1 rounded-[18rpx] bg-[#1677FF] text-white text-[30rpx] font-700" :disabled="confirming" @tap="confirmReceive">
          {{ confirming ? '处理中' : '确认收款' }}
        </button>
      </view>
    </loading-state>
  </view>
</template>
