<script lang="ts" setup>
import { getUserPoints } from '@/api/points'
import type { UserPointsSummary } from '@/api/types/points'

definePage({
  style: {
    navigationBarTitleText: '我的优惠券',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
  },
})

type CouponStatus = 'unused' | 'used' | 'expired'
type CouponTab = 'all' | CouponStatus

interface CouponItem {
  id: number
  status: CouponStatus
}

const activeTab = ref<CouponTab>('all')
const loadingPoints = ref(false)
const pointsSummary = ref<UserPointsSummary>({
  totalPoints: 0,
  availablePoints: 0,
  totalAmount: 0,
  rule: {
    unitAmount: 0.1,
    pointsPerUnit: 1,
    description: '每实际支付 0.1 元积 1 分，0.01 元不计入积分',
  },
  recentEarned: [],
  recentTotalAmount: 0,
  recentTotalPoints: 0,
})

const tabs: Array<{ label: string, value: CouponTab }> = [
  { label: '全部', value: 'all' },
  { label: '未使用', value: 'unused' },
  { label: '已使用', value: 'used' },
  { label: '已过期', value: 'expired' },
]

const visibleCoupons = computed<CouponItem[]>(() => [])
const pointsRuleText = computed(() => pointsSummary.value.rule.description || '每实际支付 0.1 元积 1 分，0.01 元不计入积分')

function setActiveTab(tab: CouponTab) {
  activeTab.value = tab
}

function getTabClass(tab: CouponTab) {
  return activeTab.value === tab ? 'tab-text tab-text-active' : 'tab-text'
}

function formatAmount(value: number) {
  return value.toFixed(2)
}

async function loadPoints() {
  loadingPoints.value = true
  try {
    pointsSummary.value = await getUserPoints()
  }
  catch {
    pointsSummary.value = {
      ...pointsSummary.value,
      totalPoints: 0,
      availablePoints: 0,
      totalAmount: 0,
      recentEarned: [],
      recentTotalAmount: 0,
      recentTotalPoints: 0,
    }
  }
  finally {
    loadingPoints.value = false
  }
}

onShow(() => {
  loadPoints()
})
</script>

<template>
  <view class="coupon-page">
    <view class="points-panel">
      <view class="points-header">
        <view>
          <text class="points-label">我的积分</text>
          <view class="points-value-row">
            <text class="points-value">{{ pointsSummary.availablePoints }}</text>
            <text class="points-unit">分</text>
          </view>
        </view>
        <view class="points-badge">
          <text>{{ loadingPoints ? '同步中' : '自动累计' }}</text>
        </view>
      </view>

      <view class="points-rule">
        <text>{{ pointsRuleText }}</text>
      </view>

      <view class="points-stats">
        <view class="points-stat-item">
          <text class="points-stat-value">{{ pointsSummary.totalPoints }}</text>
          <text class="points-stat-label">累计积分</text>
        </view>
        <view class="points-stat-divider"></view>
        <view class="points-stat-item">
          <text class="points-stat-value">¥{{ formatAmount(pointsSummary.totalAmount) }}</text>
          <text class="points-stat-label">计分消费</text>
        </view>
      </view>
    </view>

    <view class="tab-row">
      <view
        v-for="tab in tabs"
        :key="tab.value"
        class="tab-item"
        @tap="setActiveTab(tab.value)"
      >
        <text :class="getTabClass(tab.value)">{{ tab.label }}</text>
        <view v-if="activeTab === tab.value" class="tab-line"></view>
      </view>
    </view>

    <view v-if="visibleCoupons.length > 0" class="coupon-list"></view>

    <view v-else class="empty-coupon">
      <text class="empty-title">暂无优惠券</text>
      <text class="empty-desc">当前没有可用优惠券</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
.coupon-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding-bottom: 56rpx;
  background: #f6f7f9;
}

.points-panel {
  margin: 24rpx;
  padding: 30rpx 30rpx 28rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, #ff383d 0%, #ff6a3d 100%);
  color: #ffffff;
  box-shadow: 0 14rpx 28rpx rgba(255, 56, 61, 0.18);
}

.points-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
}

.points-label {
  display: block;
  font-size: 28rpx;
  line-height: 36rpx;
  font-weight: 600;
  opacity: 0.92;
}

.points-value-row {
  margin-top: 8rpx;
  display: flex;
  align-items: baseline;
}

.points-value {
  font-size: 72rpx;
  line-height: 80rpx;
  font-weight: 800;
}

.points-unit {
  margin-left: 10rpx;
  font-size: 28rpx;
  line-height: 36rpx;
  font-weight: 700;
}

.points-badge {
  height: 44rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.points-badge text {
  font-size: 22rpx;
  line-height: 30rpx;
  font-weight: 600;
}

.points-rule {
  margin-top: 18rpx;
  padding: 16rpx 18rpx;
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.16);
}

.points-rule text {
  font-size: 24rpx;
  line-height: 34rpx;
  font-weight: 500;
}

.points-stats {
  margin-top: 24rpx;
  height: 92rpx;
  border-radius: 18rpx;
  background: rgba(255, 255, 255, 0.14);
  display: flex;
  align-items: center;
}

.points-stat-item {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.points-stat-value {
  max-width: 100%;
  color: #ffffff;
  font-size: 30rpx;
  line-height: 38rpx;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.points-stat-label {
  margin-top: 6rpx;
  color: rgba(255, 255, 255, 0.82);
  font-size: 22rpx;
  line-height: 28rpx;
}

.points-stat-divider {
  width: 1rpx;
  height: 48rpx;
  background: rgba(255, 255, 255, 0.24);
}

.tab-row {
  height: 104rpx;
  display: flex;
  align-items: center;
  background: #ffffff;
}

.tab-item {
  position: relative;
  flex: 1;
  height: 104rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab-text {
  color: #2d3035;
  font-size: 29rpx;
  line-height: 38rpx;
  font-weight: 400;
}

.tab-text-active {
  color: #ff383d;
  font-weight: 700;
}

.tab-line {
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 42rpx;
  height: 6rpx;
  border-radius: 999rpx;
  background: #ff383d;
  transform: translateX(-50%);
}

.coupon-list {
  padding: 22rpx 24rpx 56rpx;
}

.empty-coupon {
  min-height: 420rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.empty-title {
  color: #333333;
  font-size: 30rpx;
  line-height: 40rpx;
  font-weight: 600;
}

.empty-desc {
  margin-top: 16rpx;
  color: #999999;
  font-size: 24rpx;
  line-height: 34rpx;
}
</style>
