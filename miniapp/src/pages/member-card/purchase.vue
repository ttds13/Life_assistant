<script lang="ts" setup>
import type { MemberCardServiceRule, PurchasableMemberCard } from '@/api/types/memberCards'
import { createMemberCardPurchaseOrder, getPurchasableMemberCardDetail } from '@/api/memberCards'
import { useTokenStore } from '@/store/token'

definePage({
  style: {
    navigationBarTitleText: '确认购买',
  },
})

const tokenStore = useTokenStore()
const card = ref<PurchasableMemberCard | null>(null)
const loading = ref(true)
const submitting = ref(false)
const agreed = ref(false)
const cardId = ref(0)
const source = ref('')
const promotionKey = ref('')
const campaignId = ref('')

const activeRules = computed(() => (card.value?.serviceRuleList || [])
  .filter(rule => rule.status !== 0 && rule.serviceStatus !== 0))
const serviceSummary = computed(() => {
  if (card.value?.serviceSummary)
    return card.value.serviceSummary
  const names = Array.from(new Set(activeRules.value.map(rule => rule.serviceName).filter(Boolean)))
  return names.length ? names.join('、') : '适用服务以预约页可选项目为准'
})
const coverImage = computed(() => card.value?.coverImageDisplayUrl || card.value?.coverImage || '')

function formatPrice(price: number) {
  return price % 1 === 0 ? price.toString() : price.toFixed(2)
}

function activationText(item: PurchasableMemberCard) {
  return item.activationDeadlineDays
    ? `购买后 ${item.activationDeadlineDays} 天内激活`
    : '首次预约时激活'
}

function ruleText(rule: MemberCardServiceRule) {
  const allowed = Array.from(new Set((rule.allowedMinutes || []).filter(value => value > 0))).sort((a, b) => a - b)
  if (rule.consumeMode === 'half_service')
    return `半次/整次核销${allowed.length ? `：${allowed.join('/')} 分钟` : ''}`
  if (rule.consumeMode === 'custom_minutes')
    return allowed.length ? `可选 ${allowed.join('/')} 分钟` : `最少 ${rule.minConsumeMinutes || rule.consumeUnits} 分钟`
  return `${rule.consumeUnits} 分钟/次`
}

function currentUrl() {
  const query = [
    `id=${encodeURIComponent(String(cardId.value))}`,
    source.value ? `source=${encodeURIComponent(source.value)}` : '',
    promotionKey.value ? `promotionKey=${encodeURIComponent(promotionKey.value)}` : '',
    campaignId.value ? `campaignId=${encodeURIComponent(campaignId.value)}` : '',
  ].filter(Boolean).join('&')
  return `/pages/member-card/purchase?${query}`
}

function detailUrl() {
  const query = [
    `id=${encodeURIComponent(String(cardId.value))}`,
    source.value ? `source=${encodeURIComponent(source.value)}` : '',
    promotionKey.value ? `promotionKey=${encodeURIComponent(promotionKey.value)}` : '',
    campaignId.value ? `campaignId=${encodeURIComponent(campaignId.value)}` : '',
  ].filter(Boolean).join('&')
  return `/pages/member-card/detail?${query}`
}

async function loadDetail(showLoading = true) {
  if (!cardId.value) {
    loading.value = false
    card.value = null
    return null
  }
  if (showLoading)
    loading.value = true
  try {
    const latest = await getPurchasableMemberCardDetail(cardId.value)
    card.value = latest
    return latest
  }
  catch {
    card.value = null
    return null
  }
  finally {
    if (showLoading)
      loading.value = false
  }
}

async function confirmPurchase() {
  if (submitting.value || !agreed.value)
    return
  if (!tokenStore.hasLogin) {
    uni.navigateTo({ url: `/pages/login/index?redirect=${encodeURIComponent(currentUrl())}` })
    return
  }

  submitting.value = true
  try {
    const latest = await loadDetail(false)
    if (!latest || latest.status === 0) {
      uni.showToast({ icon: 'none', title: '该会员卡当前不可购买' })
      return
    }
    const order = await createMemberCardPurchaseOrder({
      cardId: latest.id,
      source: source.value || undefined,
      promotionKey: promotionKey.value || undefined,
      campaignId: campaignId.value || undefined,
    })
    uni.redirectTo({
      url: `/pages/payment/result?orderId=${order.id}&status=pending&amount=${order.payableAmount}&orderType=${order.orderType}`,
    })
  }
  finally {
    submitting.value = false
  }
}

function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
    return
  }
  uni.redirectTo({ url: detailUrl() })
}

onLoad((query) => {
  const id = Number(query?.id || query?.cardId || 0)
  cardId.value = Number.isInteger(id) && id > 0 ? id : 0
  source.value = typeof query?.source === 'string' ? decodeURIComponent(query.source) : 'home_member_card'
  promotionKey.value = typeof query?.promotionKey === 'string' ? decodeURIComponent(query.promotionKey) : ''
  campaignId.value = typeof query?.campaignId === 'string' ? decodeURIComponent(query.campaignId) : ''
  void loadDetail()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[150rpx]">
    <loading-state :loading="loading">
      <view v-if="card" class="pt-3">
        <view class="mx-4 rounded-[16rpx] bg-white p-4">
          <view class="flex items-start">
            <view class="h-[112rpx] w-[112rpx] shrink-0 rounded-[12rpx] bg-[#FFF1F2] overflow-hidden flex items-center justify-center">
              <image v-if="coverImage" :src="coverImage" class="h-full w-full" mode="aspectFill" />
              <text v-else class="i-carbon-wallet text-[52rpx] text-[#FF373D]" />
            </view>
            <view class="ml-3 min-w-0 flex-1">
              <text class="block text-[30rpx] font-600 leading-[42rpx] text-gray-800">{{ card.name }}</text>
              <text class="mt-1 block text-[25rpx] leading-[36rpx] text-gray-500">{{ card.totalUnits }} 分钟权益</text>
              <text class="mt-1 block text-[23rpx] leading-[32rpx] text-gray-400">版本 v{{ card.currentVersion || 1 }}</text>
            </view>
          </view>
        </view>

        <form-section title="权益确认">
          <view class="confirm-row">
            <text class="confirm-label">适用服务</text>
            <text class="confirm-value">{{ serviceSummary }}</text>
          </view>
          <view class="confirm-row">
            <text class="confirm-label">激活期限</text>
            <text class="confirm-value">{{ activationText(card) }}</text>
          </view>
          <view class="confirm-row">
            <text class="confirm-label">权益有效期</text>
            <text class="confirm-value">激活后 {{ card.validityDays }} 天</text>
          </view>
        </form-section>

        <form-section title="核销规则">
          <view v-if="activeRules.length">
            <view
              v-for="(rule, index) in activeRules"
              :key="rule.id"
              class="confirm-row"
              :class="index === activeRules.length - 1 ? 'border-b-0' : ''"
            >
              <text class="confirm-label">{{ rule.serviceName }}</text>
              <text class="confirm-value">{{ ruleText(rule) }}</text>
            </view>
          </view>
          <text v-else class="text-[26rpx] leading-[40rpx] text-gray-600">{{ serviceSummary }}</text>
        </form-section>

        <form-section title="金额明细">
          <view class="confirm-row">
            <text class="confirm-label">商品金额</text>
            <text class="confirm-value">¥{{ formatPrice(card.price) }}</text>
          </view>
          <view class="confirm-row">
            <text class="confirm-label">优惠金额</text>
            <text class="confirm-value">-¥0</text>
          </view>
          <view class="confirm-row border-b-0">
            <text class="confirm-label font-600 text-gray-800">应付金额</text>
            <text class="text-[32rpx] font-700 leading-[42rpx] text-[#EF4444]">¥{{ formatPrice(card.price) }}</text>
          </view>
        </form-section>

        <form-section v-if="card.purchaseNotice" title="购买须知">
          <text class="text-[26rpx] leading-[42rpx] text-gray-600">{{ card.purchaseNotice }}</text>
        </form-section>

        <view class="mx-4 mt-3 flex items-start py-3" @tap="agreed = !agreed">
          <view class="agreement-checkbox" :class="agreed ? 'is-agreed' : ''">
            <text v-if="agreed" class="text-[20rpx] text-white">✓</text>
          </view>
          <text class="ml-2 min-w-0 flex-1 text-[24rpx] leading-[36rpx] text-gray-600">
            已阅读并同意会员卡购买与使用规则，确认激活期限、有效期和适用服务。
          </text>
        </view>
      </view>

      <empty-state v-else type="empty" title="会员卡不可购买" description="商品已下架或信息发生变化" />
    </loading-state>

    <bottom-action-bar
      v-if="card"
      :price="card.price"
      price-label="应付金额"
      primary-text="确认购买"
      secondary-text="返回详情"
      :primary-disabled="!agreed || card.status === 0"
      :loading="submitting"
      @primary="confirmPurchase"
      @secondary="goBack"
    />
  </view>
</template>

<style scoped lang="scss">
.confirm-row {
  min-height: 76rpx;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 28rpx;
  padding: 16rpx 0;
  box-sizing: border-box;
  border-bottom: 1rpx solid #f1f5f9;
}

.confirm-label {
  max-width: 210rpx;
  flex-shrink: 0;
  color: #64748b;
  font-size: 26rpx;
  line-height: 38rpx;
}

.confirm-value {
  min-width: 0;
  flex: 1;
  color: #1f2937;
  font-size: 26rpx;
  line-height: 38rpx;
  text-align: right;
}

.agreement-checkbox {
  width: 34rpx;
  height: 34rpx;
  flex-shrink: 0;
  box-sizing: border-box;
  border: 2rpx solid #9ca3af;
  border-radius: 6rpx;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.agreement-checkbox.is-agreed {
  border-color: #1677ff;
  background: #1677ff;
}
</style>
