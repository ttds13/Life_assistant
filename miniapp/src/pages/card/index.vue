<script lang="ts" setup>
import { createMemberCardPurchaseOrder, getMyMemberCards, getPurchasableMemberCards } from '@/api/memberCards'
import { getServices } from '@/api/services'
import type { PurchasableMemberCard, UserMemberCard } from '@/api/types/memberCards'
import type { Service } from '@/api/types/services'

definePage({
  style: {
    navigationBarTitleText: '我的卡包',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
  },
})

const loading = ref(false)
const shopLoading = ref(false)
const buyingId = ref<number>()
const serviceCards = ref<UserMemberCard[]>([])
const purchasableCards = ref<PurchasableMemberCard[]>([])

function formatBalance(card: UserMemberCard) {
  if (card.cardType === 'time')
    return `${card.usableUnits}分钟`
  return `${card.usableUnits}${card.unitName || '次'}`
}

function formatTemplateBalance(card: PurchasableMemberCard) {
  if (card.cardType === 'time')
    return `${card.totalUnits}分钟`
  return `${card.totalUnits}${card.unitName || '次'}`
}

async function loadCards() {
  loading.value = true
  try {
    serviceCards.value = await getMyMemberCards()
  }
  finally {
    loading.value = false
  }
}

async function loadShopCards() {
  shopLoading.value = true
  try {
    purchasableCards.value = await getPurchasableMemberCards()
  }
  finally {
    shopLoading.value = false
  }
}

function normalizeServiceList(data: any): Service[] {
  if (Array.isArray(data))
    return data
  return data?.items || data?.list || data?.records || []
}

function cardServiceCodes(card: UserMemberCard) {
  return (card.applicableServices || [])
    .filter(item => /^svc_[a-zA-Z0-9_-]+$/.test(item))
}

function serviceDetailUrl(service: Service, card: UserMemberCard) {
  const query = [
    service.code
      ? `code=${encodeURIComponent(service.code)}`
      : `id=${encodeURIComponent(String(service.id))}`,
    `memberCardId=${encodeURIComponent(String(card.id))}`,
    `memberCardName=${encodeURIComponent(card.name)}`,
  ].join('&')
  return `/pages/service/detail?${query}`
}

function serviceListUrl(card: UserMemberCard, serviceCodes: string[]) {
  const params = [
    `memberCardId=${encodeURIComponent(String(card.id))}`,
    `cardType=${encodeURIComponent(card.cardType)}`,
    `cardName=${encodeURIComponent(card.name)}`,
    serviceCodes.length ? `serviceCodes=${encodeURIComponent(serviceCodes.join(','))}` : '',
  ].filter(Boolean).join('&')
  return `/pages/service/list?${params}`
}

async function reserveWithCard(card: UserMemberCard) {
  if (!card.available || card.usableUnits <= 0) {
    uni.showToast({ icon: 'none', title: '会员卡暂无可用余额' })
    return
  }

  const serviceCodes = cardServiceCodes(card)
  try {
    const result = await getServices({
      cardType: card.cardType,
      serviceCodes: serviceCodes.length ? serviceCodes.join(',') : undefined,
      page: 1,
      pageSize: 20,
    })
    const services = normalizeServiceList(result)
    if (services.length === 1) {
      uni.navigateTo({ url: serviceDetailUrl(services[0], card) })
      return
    }
  }
  catch {
  }
  uni.navigateTo({ url: serviceListUrl(card, serviceCodes) })
}

async function buyCard(card: PurchasableMemberCard) {
  if (buyingId.value)
    return
  buyingId.value = card.id
  try {
    const order = await createMemberCardPurchaseOrder({ cardId: card.id })
    uni.navigateTo({ url: `/pages/payment/result?orderId=${order.id}&status=pending&amount=${order.payableAmount}&orderType=${order.orderType}` })
  }
  finally {
    buyingId.value = undefined
  }
}

function loadPage() {
  void loadCards()
  void loadShopCards()
}

onLoad(loadPage)
onShow(loadPage)
</script>

<template>
  <view class="card-page">
    <loading-state :loading="loading">
      <view v-if="serviceCards.length > 0" class="card-list">
        <view
          v-for="item in serviceCards"
          :key="item.id"
          class="service-card"
        >
          <view class="card-pattern"></view>
          <view class="card-slash slash-one"></view>
          <view class="card-slash slash-two"></view>

          <view class="card-info">
            <text class="card-name">{{ item.name }}</text>
            <text class="card-expire">到期时间：{{ item.expireAt.slice(0, 10) }}</text>
            <view class="remain-row">
              <text class="remain-label">剩余</text>
              <text class="remain-value">{{ formatBalance(item) }}</text>
            </view>
          </view>

          <view class="reserve-button" @tap="reserveWithCard(item)">
            <text>去预约</text>
          </view>
        </view>
      </view>

      <view v-else class="empty-card">
        <text class="empty-title">暂无服务卡</text>
        <text class="empty-desc">购买会员卡后可在预约时抵扣</text>
      </view>
    </loading-state>

    <view class="shop-section">
      <view class="section-head">
        <text class="section-title">购买会员卡</text>
        <text class="section-subtitle">支付成功后自动入卡包</text>
      </view>

      <loading-state :loading="shopLoading">
        <view v-if="purchasableCards.length > 0" class="shop-list">
          <view
            v-for="item in purchasableCards"
            :key="item.id"
            class="shop-card"
          >
            <view class="shop-info">
              <text class="shop-name">{{ item.name }}</text>
              <text class="shop-desc">
                {{ formatTemplateBalance(item) }} · 有效期 {{ item.validityDays }} 天
              </text>
              <text v-if="item.allowHalfDeduct" class="shop-tag">支持半次核销</text>
            </view>
            <view class="shop-action">
              <text class="shop-price">¥{{ item.price }}</text>
              <button
                class="buy-button"
                :loading="buyingId === item.id"
                @tap="buyCard(item)"
              >
                购买
              </button>
            </view>
          </view>
        </view>
        <view v-else class="shop-empty">
          <text>暂无可购买会员卡</text>
        </view>
      </loading-state>
    </view>
  </view>
</template>

<style scoped lang="scss">
.card-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 28rpx 28rpx 56rpx;
  background: #f6f7f9;
}

.card-list {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.service-card {
  position: relative;
  height: 188rpx;
  overflow: hidden;
  border-radius: 18rpx;
  background: #1677ff;
  box-sizing: border-box;
  box-shadow: 0 10rpx 24rpx rgba(22, 119, 255, 0.14);
}

.card-pattern {
  position: absolute;
  left: -18rpx;
  bottom: 10rpx;
  width: 280rpx;
  height: 104rpx;
  opacity: 0.12;
  background-image: radial-gradient(rgba(255, 255, 255, 0.8) 2rpx, transparent 2rpx);
  background-size: 20rpx 20rpx;
}

.card-slash {
  position: absolute;
  top: -64rpx;
  width: 160rpx;
  height: 320rpx;
  background: rgba(255, 255, 255, 0.055);
  transform: rotate(38deg);
}

.slash-one {
  right: 132rpx;
}

.slash-two {
  right: -36rpx;
}

.card-info {
  position: relative;
  z-index: 1;
  height: 100%;
  box-sizing: border-box;
  padding: 26rpx 188rpx 22rpx 28rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.card-name {
  color: #ffffff;
  font-size: 34rpx;
  line-height: 44rpx;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-expire {
  margin-top: 12rpx;
  color: rgba(255, 255, 255, 0.82);
  font-size: 23rpx;
  line-height: 32rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remain-row {
  margin-top: 10rpx;
  display: flex;
  align-items: baseline;
  color: #ffffff;
}

.remain-label {
  font-size: 23rpx;
  line-height: 32rpx;
  color: rgba(255, 255, 255, 0.9);
}

.remain-value {
  margin-left: 8rpx;
  font-size: 40rpx;
  line-height: 48rpx;
  font-weight: 700;
  letter-spacing: 0;
}

.reserve-button {
  position: absolute;
  z-index: 2;
  right: 26rpx;
  top: 50%;
  width: 140rpx;
  height: 56rpx;
  border-radius: 999rpx;
  background: #ffffff;
  color: #1677ff;
  font-size: 25rpx;
  line-height: 34rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translateY(-50%);
  box-shadow: 0 8rpx 18rpx rgba(0, 56, 132, 0.14);
}

.reserve-button:active {
  opacity: 0.88;
}

.empty-card {
  min-height: 520rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.empty-title {
  color: #333333;
  font-size: 34rpx;
  line-height: 46rpx;
  font-weight: 600;
}

.empty-desc {
  margin-top: 16rpx;
  color: #999999;
  font-size: 28rpx;
  line-height: 38rpx;
}

.shop-section {
  margin-top: 34rpx;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 18rpx;
}

.section-title {
  color: #1f2937;
  font-size: 34rpx;
  line-height: 44rpx;
  font-weight: 700;
}

.section-subtitle {
  color: #8a94a6;
  font-size: 24rpx;
  line-height: 32rpx;
}

.shop-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.shop-card {
  min-height: 156rpx;
  padding: 24rpx;
  box-sizing: border-box;
  border-radius: 16rpx;
  background: #ffffff;
  display: flex;
  justify-content: space-between;
  gap: 18rpx;
  box-shadow: 0 6rpx 18rpx rgba(17, 24, 39, 0.06);
}

.shop-info {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.shop-name {
  color: #1f2937;
  font-size: 30rpx;
  line-height: 40rpx;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shop-desc {
  margin-top: 8rpx;
  color: #64748b;
  font-size: 24rpx;
  line-height: 34rpx;
}

.shop-tag {
  margin-top: 12rpx;
  align-self: flex-start;
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
  color: #1677ff;
  background: rgba(22, 119, 255, 0.1);
  font-size: 22rpx;
  line-height: 30rpx;
}

.shop-action {
  width: 150rpx;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
}

.shop-price {
  color: #ef4444;
  font-size: 34rpx;
  line-height: 44rpx;
  font-weight: 700;
}

.buy-button {
  margin-top: 14rpx;
  width: 132rpx;
  height: 56rpx;
  border-radius: 999rpx;
  background: #1677ff;
  color: #ffffff;
  font-size: 25rpx;
  line-height: 56rpx;
  padding: 0;
}

.shop-empty {
  min-height: 160rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8a94a6;
  font-size: 26rpx;
}
</style>
