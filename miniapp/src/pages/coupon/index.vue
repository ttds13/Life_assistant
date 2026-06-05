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

const coupons: CouponItem[] = [
  { id: 1, status: 'unused', amount: 50, title: '新人礼金券', desc: '满800减50(每次仅能用一张)', validity: '领取当天30天内可用' },
  { id: 2, status: 'unused', amount: 30, title: '新人礼金券', desc: '满500减30(每次仅能用一张)', validity: '领取当天30天内可用' },
  { id: 3, status: 'unused', amount: 20, title: '新人礼金券', desc: '满200减20(每次仅能用一张)', validity: '领取当天30天内可用' },
  { id: 4, status: 'used', amount: 20, title: '新人礼金券', desc: '满200减20(每次仅能用一张)', validity: '已使用' },
  { id: 5, status: 'expired', amount: 20, title: '新人礼金券', desc: '满200减20(每次仅能用一张)', validity: '已过期' },
]

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

function getCouponClass(status: CouponStatus) {
  return status === 'unused' ? 'coupon-card' : 'coupon-card coupon-card-disabled'
}

function getActionText(status: CouponStatus) {
  if (status === 'used')
    return '已使用'
  if (status === 'expired')
    return '已过期'
  return '立即使用'
}

function onUseCoupon(coupon: CouponItem) {
  if (coupon.status !== 'unused') {
    uni.showToast({ icon: 'none', title: '该优惠券不可使用' })
    return
  }

  uni.navigateTo({
    url: `/pages/order/create?couponId=${coupon.id}`,
    fail: () => {
      uni.showToast({ icon: 'none', title: '下单页跳转失败' })
    },
  })
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
        :class="getCouponClass(item.status)"
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

        <view class="coupon-action" @tap="onUseCoupon(item)">
          <text>{{ getActionText(item.status) }}</text>
        </view>
      </view>
    </view>

    <view v-else class="empty-coupon">
      <text class="empty-title">暂无优惠券</text>
      <text class="empty-desc">领取优惠券后会展示在这里</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
.coupon-page {
  min-height: 100vh;
  box-sizing: border-box;
  background: #f5f5f5;
}

.tab-row {
  height: 128rpx;
  display: flex;
  align-items: center;
  background: #ffffff;
}

.tab-item {
  position: relative;
  flex: 1;
  height: 128rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab-text {
  color: #2d3035;
  font-size: 40rpx;
  line-height: 52rpx;
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
  width: 56rpx;
  height: 8rpx;
  border-radius: 999rpx;
  background: #ff383d;
  transform: translateX(-50%);
}

.coupon-list {
  padding: 24rpx 24rpx 64rpx;
  display: flex;
  flex-direction: column;
  gap: 26rpx;
}

.coupon-card {
  height: 198rpx;
  display: flex;
  overflow: hidden;
  border-radius: 18rpx;
  background: #ffffff;
}

.coupon-card-disabled {
  opacity: 0.64;
}

.amount-panel {
  width: 196rpx;
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
}

.amount-symbol {
  margin-right: 10rpx;
  font-size: 34rpx;
  line-height: 42rpx;
  font-weight: 700;
}

.amount-value {
  font-size: 70rpx;
  line-height: 76rpx;
  font-weight: 700;
}

.amount-scope {
  margin-top: 14rpx;
  font-size: 34rpx;
  line-height: 44rpx;
  font-weight: 600;
}

.coupon-content {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  padding: 34rpx 28rpx 26rpx;
  display: flex;
  flex-direction: column;
}

.coupon-title {
  color: #20232a;
  font-size: 38rpx;
  line-height: 50rpx;
  font-weight: 700;
}

.coupon-desc {
  margin-top: 18rpx;
  color: #8c8f96;
  font-size: 28rpx;
  line-height: 38rpx;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.coupon-validity {
  margin-top: 18rpx;
  color: #4c4f55;
  font-size: 30rpx;
  line-height: 40rpx;
  white-space: nowrap;
}

.coupon-action {
  width: 64rpx;
  height: 100%;
  flex-shrink: 0;
  background: #ff383d;
  color: #ffffff;
  font-size: 30rpx;
  line-height: 38rpx;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  writing-mode: vertical-rl;
  letter-spacing: 2rpx;
}

.empty-coupon {
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
</style>
