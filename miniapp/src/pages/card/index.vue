<script lang="ts" setup>
definePage({
  style: {
    navigationBarTitleText: '我的卡包',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
  },
})

interface ServiceCard {
  id: number
  name: string
  expireAt: string
  remainingTimes: number
}

const serviceCards: ServiceCard[] = [
  { id: 1, name: '家庭保洁Plus', expireAt: '2026-03-30 18:21:15', remainingTimes: 20 },
  { id: 2, name: '测试卡', expireAt: '2026-11-06 18:31:44', remainingTimes: 3 },
  { id: 3, name: '测试卡', expireAt: '2026-10-18 20:30:00', remainingTimes: 3 },
  { id: 4, name: '家庭保洁Plus', expireAt: '2025-11-17 19:34:28', remainingTimes: 20 },
]

function goReserve(card: ServiceCard) {
  uni.navigateTo({
    url: `/pages/order/create?cardId=${card.id}`,
    fail: () => {
      uni.showToast({ icon: 'none', title: '预约页跳转失败' })
    },
  })
}
</script>

<template>
  <view class="card-page">
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
          <text class="card-expire">到期时间： {{ item.expireAt }}</text>
          <view class="remain-row">
            <text class="remain-label">剩余</text>
            <text class="remain-value">{{ item.remainingTimes }}</text>
            <text class="remain-unit">次</text>
          </view>
        </view>

        <view class="reserve-button" @tap="goReserve(item)">
          <text>立即预约</text>
        </view>
      </view>
    </view>

    <view v-else class="empty-card">
      <text class="empty-title">暂无服务卡</text>
      <text class="empty-desc">购买服务卡后会展示在这里</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
.card-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 40rpx 32rpx 64rpx;
  background: #f5f5f5;
}

.card-list {
  display: flex;
  flex-direction: column;
  gap: 32rpx;
}

.service-card {
  position: relative;
  height: 210rpx;
  overflow: hidden;
  border-radius: 28rpx;
  background: #ff383d;
  box-sizing: border-box;
}

.card-pattern {
  position: absolute;
  left: -10rpx;
  bottom: 14rpx;
  width: 310rpx;
  height: 118rpx;
  opacity: 0.18;
  background-image: radial-gradient(rgba(255, 255, 255, 0.8) 2rpx, transparent 2rpx);
  background-size: 20rpx 20rpx;
}

.card-slash {
  position: absolute;
  top: -70rpx;
  width: 210rpx;
  height: 370rpx;
  background: rgba(255, 255, 255, 0.08);
  transform: rotate(38deg);
}

.slash-one {
  right: 150rpx;
}

.slash-two {
  right: -24rpx;
}

.card-info {
  position: relative;
  z-index: 1;
  height: 100%;
  box-sizing: border-box;
  padding: 34rpx 280rpx 24rpx 36rpx;
  display: flex;
  flex-direction: column;
}

.card-name {
  color: #ffffff;
  font-size: 40rpx;
  line-height: 52rpx;
  font-weight: 700;
}

.card-expire {
  margin-top: 26rpx;
  color: rgba(255, 255, 255, 0.94);
  font-size: 28rpx;
  line-height: 38rpx;
  white-space: nowrap;
}

.remain-row {
  margin-top: 14rpx;
  display: flex;
  align-items: baseline;
  color: #ffffff;
}

.remain-label {
  font-size: 30rpx;
  line-height: 42rpx;
}

.remain-value {
  margin-left: 8rpx;
  font-size: 64rpx;
  line-height: 70rpx;
  font-weight: 700;
}

.remain-unit {
  margin-left: 4rpx;
  font-size: 30rpx;
  line-height: 42rpx;
}

.reserve-button {
  position: absolute;
  z-index: 2;
  right: 32rpx;
  top: 50%;
  width: 170rpx;
  height: 70rpx;
  border-radius: 999rpx;
  background: #ffffff;
  color: #ff383d;
  font-size: 34rpx;
  line-height: 44rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translateY(-50%);
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
</style>
