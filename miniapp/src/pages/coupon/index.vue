<script lang="ts" setup>
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
  amount: number
  title: string
  desc: string
  validity: string
}

const activeTab = ref<CouponTab>('all')

const tabs: Array<{ label: string, value: CouponTab }> = [
  { label: '全部', value: 'all' },
  { label: '未使用', value: 'unused' },
  { label: '已使用', value: 'used' },
  { label: '已过期', value: 'expired' },
]

const coupons: CouponItem[] = []

const visibleCoupons = computed(() => {
  if (activeTab.value === 'all')
    return coupons
  return coupons.filter(item => item.status === activeTab.value)
})

function setActiveTab(tab: CouponTab) {
  activeTab.value = tab
}

function getTabClass(tab: CouponTab) {
  return activeTab.value === tab ? 'tab-text tab-text-active' : 'tab-text'
}

function getCouponClass() {
  return 'coupon-card coupon-card-disabled'
}
</script>

<template>
  <view class="coupon-page">
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

    <view v-if="visibleCoupons.length > 0" class="coupon-list">
      <view
        v-for="item in visibleCoupons"
        :key="item.id"
        :class="getCouponClass()"
      >
        <view class="amount-panel">
          <view class="amount-row">
            <text class="amount-symbol">¥</text>
            <text class="amount-value">{{ item.amount }}</text>
          </view>
          <text class="amount-scope">全场通用</text>
        </view>

        <view class="coupon-content">
          <text class="coupon-title">{{ item.title }}</text>
          <text class="coupon-desc">{{ item.desc }}</text>
          <text class="coupon-validity">{{ item.validity }}</text>
        </view>

        <view class="coupon-action">
          <text>不可用</text>
        </view>
      </view>
    </view>

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
  background: #f6f7f9;
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
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.coupon-card {
  height: 180rpx;
  display: flex;
  overflow: hidden;
  border-radius: 18rpx;
  background: #ffffff;
  box-shadow: 0 8rpx 20rpx rgba(25, 31, 40, 0.06);
}

.coupon-card-disabled {
  box-shadow: 0 6rpx 16rpx rgba(25, 31, 40, 0.04);
}

.amount-panel {
  width: 164rpx;
  height: 100%;
  flex-shrink: 0;
  background: #ff383d;
  color: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.amount-row {
  display: flex;
  align-items: baseline;
  min-width: 0;
}

.amount-symbol {
  margin-right: 6rpx;
  font-size: 25rpx;
  line-height: 32rpx;
  font-weight: 700;
}

.amount-value {
  font-size: 52rpx;
  line-height: 58rpx;
  font-weight: 700;
}

.amount-scope {
  max-width: 132rpx;
  margin-top: 8rpx;
  font-size: 23rpx;
  line-height: 30rpx;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.coupon-content {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  padding: 24rpx 22rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.coupon-title {
  color: #20232a;
  font-size: 31rpx;
  line-height: 40rpx;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.coupon-desc {
  margin-top: 10rpx;
  color: #8c8f96;
  font-size: 23rpx;
  line-height: 31rpx;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.coupon-validity {
  margin-top: 10rpx;
  color: #4c4f55;
  font-size: 22rpx;
  line-height: 30rpx;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.coupon-action {
  width: 54rpx;
  height: 100%;
  flex-shrink: 0;
  background: #ff383d;
  color: #ffffff;
  font-size: 24rpx;
  line-height: 30rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  writing-mode: vertical-rl;
  letter-spacing: 1rpx;
}

.coupon-action:active {
  opacity: 0.86;
}

.coupon-card-disabled .amount-panel,
.coupon-card-disabled .coupon-action {
  background: #c8ccd3;
}

.coupon-card-disabled .coupon-action:active {
  opacity: 1;
}

.coupon-card-disabled .coupon-title {
  color: #747984;
}

.coupon-card-disabled .coupon-desc {
  color: #a3a7af;
}

.coupon-card-disabled .coupon-validity {
  color: #8e939c;
}

.empty-coupon {
  min-height: 480rpx;
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
