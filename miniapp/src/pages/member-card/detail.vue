<script lang="ts" setup>
import { createMemberCardPurchaseOrder, getPurchasableMemberCardDetail } from '@/api/memberCards'
import type { PurchasableMemberCard } from '@/api/types/memberCards'
import { useTokenStore } from '@/store/token'

definePage({
  style: {
    navigationBarTitleText: '会员卡详情',
  },
})

const tokenStore = useTokenStore()
const card = ref<PurchasableMemberCard | null>(null)
const loading = ref(true)
const buying = ref(false)
const cardId = ref(0)
const source = ref('')
const promotionKey = ref('')
const campaignId = ref('')

const totalText = computed(() => {
  if (!card.value) return ''
  if (card.value.cardType === 'time') return `${card.value.totalUnits}分钟`
  return `${card.value.totalUnits}${card.value.unitName || '次'}`
})

function cardTypeLabel(type: string) {
  if (type === 'time') return '时长卡'
  if (type === 'times') return '次卡'
  return '会员卡'
}

function detailUrl() {
  const query = [
    `cardId=${encodeURIComponent(String(cardId.value))}`,
    source.value ? `source=${encodeURIComponent(source.value)}` : '',
    promotionKey.value ? `promotionKey=${encodeURIComponent(promotionKey.value)}` : '',
    campaignId.value ? `campaignId=${encodeURIComponent(campaignId.value)}` : '',
  ].filter(Boolean).join('&')
  return `/pages/member-card/detail?${query}`
}

async function loadDetail() {
  if (!cardId.value) {
    loading.value = false
    card.value = null
    return
  }

  loading.value = true
  try {
    card.value = await getPurchasableMemberCardDetail(cardId.value)
  }
  catch {
    card.value = null
  }
  finally {
    loading.value = false
  }
}

async function buyCard() {
  if (!card.value || buying.value)
    return

  if (!tokenStore.hasLogin) {
    uni.navigateTo({ url: `/pages/login/index?redirect=${encodeURIComponent(detailUrl())}` })
    return
  }

  buying.value = true
  try {
    const order = await createMemberCardPurchaseOrder({
      cardId: card.value.id,
      source: source.value || undefined,
      promotionKey: promotionKey.value || undefined,
      campaignId: campaignId.value || undefined,
    })
    uni.navigateTo({
      url: `/pages/payment/result?orderId=${order.id}&status=pending&amount=${order.payableAmount}&orderType=${order.orderType}`,
    })
  }
  finally {
    buying.value = false
  }
}

function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
    return
  }
  uni.switchTab({ url: '/pages/home/index' })
}

onLoad((query) => {
  const id = Number(query?.cardId || query?.id || 0)
  cardId.value = Number.isInteger(id) && id > 0 ? id : 0
  source.value = typeof query?.source === 'string' ? decodeURIComponent(query.source) : ''
  promotionKey.value = typeof query?.promotionKey === 'string' ? decodeURIComponent(query.promotionKey) : ''
  campaignId.value = typeof query?.campaignId === 'string' ? decodeURIComponent(query.campaignId) : ''
  void loadDetail()
})
</script>

<template>
  <view class="member-card-detail">
    <loading-state :loading="loading">
      <view v-if="card" class="content">
        <view class="hero">
          <view class="hero-line"></view>
          <view class="hero-info">
            <text class="card-type">{{ cardTypeLabel(card.cardType) }}</text>
            <text class="card-name">{{ card.name }}</text>
            <text class="card-balance">{{ totalText }}</text>
          </view>
          <view class="hero-price">
            <text class="price-prefix">¥</text>
            <text class="price-value">{{ card.price }}</text>
          </view>
        </view>

        <view class="section">
          <text class="section-title">权益说明</text>
          <view class="info-row">
            <text class="info-label">总额度</text>
            <text class="info-value">{{ totalText }}</text>
          </view>
          <view class="info-row">
            <text class="info-label">有效期</text>
            <text class="info-value">{{ card.validityDays }} 天</text>
          </view>
          <view class="info-row">
            <text class="info-label">核销单位</text>
            <text class="info-value">{{ card.unitName || (card.cardType === 'time' ? '分钟' : '次') }}</text>
          </view>
          <view class="info-row">
            <text class="info-label">半次核销</text>
            <text class="info-value">{{ card.allowHalfDeduct ? '支持' : '不支持' }}</text>
          </view>
        </view>

        <view class="section">
          <text class="section-title">适用范围</text>
          <text class="section-desc">
            {{ card.applicableServices.length ? '适用于指定服务项目，具体以下单页可选服务为准。' : '适用于平台支持会员卡抵扣的服务项目。' }}
          </text>
        </view>
      </view>

      <empty-state v-else type="empty" title="会员卡不存在" description="该会员卡暂不可购买" />
    </loading-state>

    <view v-if="card" class="bottom-bar">
      <button class="secondary-button" @tap="goBack">暂不购买</button>
      <button class="primary-button" :loading="buying" @tap="buyCard">立即购买</button>
    </view>
  </view>
</template>

<style scoped lang="scss">
.member-card-detail {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 28rpx 28rpx 148rpx;
  background: #f6f7f9;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.hero {
  position: relative;
  min-height: 300rpx;
  overflow: hidden;
  border-radius: 16rpx;
  background: #1677ff;
  color: #ffffff;
  box-sizing: border-box;
  padding: 34rpx;
  box-shadow: 0 18rpx 32rpx rgba(22, 119, 255, 0.18);
}

.hero-line {
  position: absolute;
  right: -90rpx;
  top: -120rpx;
  width: 360rpx;
  height: 520rpx;
  background: rgba(255, 255, 255, 0.08);
  transform: rotate(34deg);
}

.hero-info {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
}

.card-type {
  align-self: flex-start;
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.16);
  font-size: 23rpx;
  line-height: 32rpx;
}

.card-name {
  margin-top: 28rpx;
  font-size: 42rpx;
  line-height: 54rpx;
  font-weight: 700;
}

.card-balance {
  margin-top: 14rpx;
  color: rgba(255, 255, 255, 0.82);
  font-size: 28rpx;
  line-height: 38rpx;
}

.hero-price {
  position: absolute;
  right: 34rpx;
  bottom: 30rpx;
  z-index: 1;
  display: flex;
  align-items: baseline;
}

.price-prefix {
  font-size: 28rpx;
  line-height: 38rpx;
}

.price-value {
  font-size: 56rpx;
  line-height: 66rpx;
  font-weight: 800;
}

.section {
  padding: 28rpx;
  border-radius: 14rpx;
  background: #ffffff;
}

.section-title {
  display: block;
  color: #1f2937;
  font-size: 32rpx;
  line-height: 42rpx;
  font-weight: 700;
  margin-bottom: 12rpx;
}

.info-row {
  min-height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1rpx solid #f1f5f9;
}

.info-row:last-child {
  border-bottom: 0;
}

.info-label {
  color: #64748b;
  font-size: 26rpx;
  line-height: 36rpx;
}

.info-value {
  color: #1f2937;
  font-size: 27rpx;
  line-height: 38rpx;
  font-weight: 600;
}

.section-desc {
  color: #64748b;
  font-size: 27rpx;
  line-height: 42rpx;
}

.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  padding: 18rpx 28rpx calc(18rpx + env(safe-area-inset-bottom));
  background: #ffffff;
  display: flex;
  gap: 18rpx;
  box-shadow: 0 -8rpx 24rpx rgba(15, 23, 42, 0.06);
}

.secondary-button,
.primary-button {
  flex: 1;
  height: 84rpx;
  border-radius: 12rpx;
  font-size: 29rpx;
  line-height: 84rpx;
  font-weight: 600;
}

.secondary-button {
  background: #eef2f7;
  color: #1f2937;
}

.primary-button {
  background: #1677ff;
  color: #ffffff;
}
</style>
