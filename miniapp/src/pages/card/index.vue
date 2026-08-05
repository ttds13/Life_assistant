<script lang="ts" setup>
import type { UserMemberCard } from '@/api/types/memberCards'
import { getMyMemberCards } from '@/api/memberCards'
import { navigateToMemberCardReservation } from '@/utils/memberCardReservation'

definePage({
  style: {
    navigationBarTitleText: '我的会员卡',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
  },
})

const loading = ref(false)
const serviceCards = ref<UserMemberCard[]>([])
const userMemberCardId = ref<number>()
let focusedTarget = false
let redirectingLegacyLink = false

function formatUnits(value: number) {
  return `${value}分钟`
}

function cardStatusText(card: UserMemberCard) {
  if (card.status === 'pending_activation')
    return '待激活'
  if (card.status === 'active')
    return card.availabilityState === 'suspended' ? '已暂停' : '使用中'
  const reasons: Record<string, string> = {
    used_up: '已用完',
    expired: '已到期',
    refunded: '已退款',
    disabled: '已停用',
  }
  return reasons[card.completedReason || ''] || '已完成'
}

function cardTimeText(card: UserMemberCard) {
  if (card.status === 'pending_activation') {
    return card.activationDeadlineAt
      ? `请在 ${card.activationDeadlineAt.slice(0, 10)} 前激活`
      : '首次预约后激活'
  }
  return card.expireAt ? `到期时间：${card.expireAt.slice(0, 10)}` : '权益周期已结束'
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

async function reserveWithCard(card: UserMemberCard) {
  await navigateToMemberCardReservation(card)
}

async function focusRequestedCard() {
  if (focusedTarget || !userMemberCardId.value)
    return
  const exists = serviceCards.value.some(card => card.id === userMemberCardId.value)
  if (!exists) {
    focusedTarget = true
    uni.showToast({ icon: 'none', title: '未找到新发放的会员卡' })
    return
  }
  await nextTick()
  focusedTarget = true
  uni.pageScrollTo({ selector: `#user-member-card-${userMemberCardId.value}`, duration: 250 })
}

async function loadPage() {
  await loadCards().catch(() => {})
  await focusRequestedCard()
}

onLoad((query) => {
  const legacyShopCardId = Number(query?.shopCardId)
  if (Number.isInteger(legacyShopCardId) && legacyShopCardId > 0) {
    redirectingLegacyLink = true
    const source = typeof query?.source === 'string' ? decodeURIComponent(query.source) : 'legacy_card_page'
    uni.redirectTo({
      url: `/pages/member-card/detail?id=${legacyShopCardId}&source=${encodeURIComponent(source)}`,
    })
    return
  }

  const requestedUserCardId = Number(query?.userMemberCardId)
  userMemberCardId.value = Number.isInteger(requestedUserCardId) && requestedUserCardId > 0
    ? requestedUserCardId
    : undefined
})

onShow(() => {
  if (!redirectingLegacyLink)
    void loadPage()
})
</script>

<template>
  <view class="card-page">
    <loading-state :loading="loading">
      <view v-if="serviceCards.length > 0" class="card-list">
        <view
          v-for="item in serviceCards"
          :id="`user-member-card-${item.id}`"
          :key="item.id"
          class="service-card"
          :class="userMemberCardId === item.id ? 'focused-card' : ''"
        >
          <view class="card-pattern" />
          <view class="card-slash slash-one" />
          <view class="card-slash slash-two" />

          <view class="card-info">
            <text class="card-name">{{ item.name }}</text>
            <text class="card-expire">{{ cardTimeText(item) }}</text>
            <text class="card-expire">状态：{{ cardStatusText(item) }}</text>
            <view class="remain-row">
              <text class="remain-label">可用</text>
              <text class="remain-value">{{ formatUnits(item.usableUnits) }}</text>
            </view>
            <view class="balance-meta">
              <text>剩余 {{ formatUnits(item.remainingUnits) }}</text>
              <text>已冻结 {{ formatUnits(item.frozenUnits) }}</text>
            </view>
          </view>

          <view class="reserve-button" @tap="reserveWithCard(item)">
            <text>去预约</text>
          </view>
        </view>
      </view>

      <view v-else class="empty-card">
        <view class="empty-icon">
          <text class="i-carbon-wallet text-[64rpx] text-[#9CA3AF]" />
        </view>
        <text class="empty-title">暂无会员卡</text>
        <text class="empty-desc">购买完成后将在这里展示</text>
      </view>
    </loading-state>
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
  min-height: 244rpx;
  overflow: hidden;
  border-radius: 16rpx;
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
  height: 340rpx;
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
  min-width: 0;
  box-sizing: border-box;
  padding: 24rpx 188rpx 22rpx 28rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.card-name,
.card-expire {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-name {
  color: #ffffff;
  font-size: 34rpx;
  line-height: 44rpx;
  font-weight: 700;
}

.card-expire {
  margin-top: 8rpx;
  color: rgba(255, 255, 255, 0.82);
  font-size: 23rpx;
  line-height: 32rpx;
}

.remain-row {
  margin-top: 10rpx;
  display: flex;
  align-items: baseline;
  color: #ffffff;
}

.remain-label {
  color: rgba(255, 255, 255, 0.9);
  font-size: 23rpx;
  line-height: 32rpx;
}

.remain-value {
  margin-left: 8rpx;
  color: #ffffff;
  font-size: 38rpx;
  line-height: 48rpx;
  font-weight: 700;
  letter-spacing: 0;
}

.balance-meta {
  margin-top: 6rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx 18rpx;
  color: rgba(255, 255, 255, 0.82);
  font-size: 22rpx;
  line-height: 30rpx;
}

.focused-card {
  outline: 4rpx solid #fbbf24;
  outline-offset: 4rpx;
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
  min-height: 620rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.empty-icon {
  width: 128rpx;
  height: 128rpx;
  border-radius: 50%;
  background: #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-title {
  margin-top: 28rpx;
  color: #333333;
  font-size: 34rpx;
  line-height: 46rpx;
  font-weight: 600;
}

.empty-desc {
  margin-top: 12rpx;
  color: #999999;
  font-size: 26rpx;
  line-height: 38rpx;
}
</style>
