<script lang="ts" setup>
import { createStaffWithdrawRequest, getStaffWithdrawSummary } from '@/api/staff'
import type { StaffWithdrawSummary } from '@/api/types/staff'

definePage({
  style: {
    navigationBarTitleText: '申请提现',
    navigationBarBackgroundColor: '#F5F7FA',
    navigationBarTextStyle: 'black',
  },
})

const loading = ref(false)
const submitting = ref(false)
const summary = ref<StaffWithdrawSummary | null>(null)
const amountText = ref('')
const remark = ref('')
const agreed = ref(false)

const amount = computed(() => Number(amountText.value || 0))
const submitBlockReason = computed(() => {
  const data = summary.value
  if (!data) return '提现规则加载中'
  if (!data.openidBound) return '请先完成微信登录绑定'
  if (data.activeRequest) return '已有处理中提现单'
  if (!amount.value || Number.isNaN(amount.value)) return '请填写提现金额'
  if (amount.value < data.minAmount) return `最低提现 ${money(data.minAmount)} 元`
  if (amount.value > data.availableAmount) return '提现金额超过可提现余额'
  if (amount.value > data.maxSingleAmount) return `单笔最高提现 ${money(data.maxSingleAmount)} 元`
  if (!agreed.value) return '请先确认提现规则'
  return ''
})
const canSubmit = computed(() => {
  const data = summary.value
  return Boolean(data && agreed.value && amount.value >= data.minAmount && amount.value <= data.availableAmount && amount.value <= data.maxSingleAmount && !data.activeRequest)
})

function money(value?: number) {
  return Number(value || 0).toFixed(2)
}

async function loadSummary() {
  loading.value = true
  try {
    summary.value = await getStaffWithdrawSummary()
    amountText.value = summary.value.availableAmount > 0 ? money(Math.min(summary.value.availableAmount, summary.value.maxSingleAmount)) : ''
  }
  finally {
    loading.value = false
  }
}

function useAll() {
  if (!summary.value) return
  amountText.value = money(Math.min(summary.value.availableAmount, summary.value.maxSingleAmount))
}

function toggleAgree() {
  agreed.value = !agreed.value
}

async function submit() {
  const data = summary.value
  if (!data) {
    uni.showToast({ icon: 'none', title: '提现规则加载中' })
    return
  }
  if (!data.openidBound) {
    uni.showToast({ icon: 'none', title: '请先完成微信登录绑定' })
    return
  }
  if (data.activeRequest) {
    uni.showToast({ icon: 'none', title: '已有处理中提现单' })
    return
  }
  if (!canSubmit.value) {
    uni.showToast({ icon: 'none', title: submitBlockReason.value || '请检查提现金额和规则确认' })
    return
  }
  submitting.value = true
  try {
    const detail = await createStaffWithdrawRequest({
      amount: Number(amount.value.toFixed(2)),
      remark: remark.value.trim() || undefined,
    })
    uni.showToast({ icon: 'success', title: '已提交审核' })
    setTimeout(() => {
      uni.redirectTo({ url: `/pages/staff/withdraw-detail?id=${detail.id}` })
    }, 500)
  }
  finally {
    submitting.value = false
  }
}

onLoad(() => {
  void loadSummary()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[60rpx] pt-1">
    <loading-state :loading="loading">
      <view class="mx-4 mt-3 rounded-[16rpx] bg-white p-4">
        <text class="block text-[26rpx] text-[#6B7280]">可提现余额</text>
        <view class="mt-2 flex items-end">
          <text class="text-[64rpx] leading-[76rpx] text-[#1F2937] font-800">{{ money(summary?.availableAmount) }}</text>
          <text class="mb-[8rpx] ml-2 text-[26rpx] text-[#6B7280]">元</text>
        </view>
      </view>

      <view class="mx-4 mt-3 rounded-[16rpx] bg-white p-4">
        <text class="block text-[28rpx] text-[#1F2937] font-700">提现金额</text>
        <view class="mt-4 flex items-center border-b border-[#E5E7EB] pb-3">
          <text class="text-[44rpx] text-[#1F2937] font-800">¥</text>
          <input
            v-model="amountText"
            class="ml-2 flex-1 text-[52rpx] text-[#1F2937] font-800"
            type="digit"
            placeholder="0.00"
            placeholder-class="text-[#C4C8D0]"
          />
          <text class="text-[26rpx] text-[#1677FF]" @tap="useAll">全部</text>
        </view>
        <text class="block mt-3 text-[24rpx] text-[#8A8F99]">最低 {{ money(summary?.minAmount) }} 元，单笔最高 {{ money(summary?.maxSingleAmount) }} 元</text>
      </view>

      <view class="mx-4 mt-3 rounded-[16rpx] bg-white p-4">
        <text class="block text-[28rpx] text-[#1F2937] font-700">备注</text>
        <textarea
          v-model="remark"
          class="mt-3 h-[120rpx] w-full rounded-[12rpx] bg-[#F8FAFC] p-3 text-[26rpx] text-[#1F2937]"
          :maxlength="100"
          placeholder="可填写提现说明，选填"
          placeholder-class="text-[#A0A6B2]"
        />
      </view>

      <view class="mx-4 mt-3 rounded-[16rpx] bg-white p-4">
        <view class="flex" @tap="toggleAgree">
          <checkbox :checked="agreed" color="#1677FF" />
          <text class="ml-2 flex-1 text-[26rpx] leading-[40rpx] text-[#4B5563]">
            我确认提现到本人微信钱包，前端确认收款不代表到账，最终以微信回调或后台查单结果为准。
          </text>
        </view>
      </view>

      <view class="mx-4 mt-5">
        <view v-if="submitBlockReason && !canSubmit" class="mb-3 rounded-[14rpx] bg-[#FFF7ED] px-3 py-2">
          <text class="text-[24rpx] leading-[36rpx] text-[#AD6800]">{{ submitBlockReason }}</text>
        </view>
        <button class="h-[88rpx] rounded-[18rpx] bg-[#1677FF] text-white text-[30rpx] font-700" :disabled="submitting" @tap="submit">
          {{ submitting ? '提交中' : '提交提现申请' }}
        </button>
      </view>
    </loading-state>
  </view>
</template>
