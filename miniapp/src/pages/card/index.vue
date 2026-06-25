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

const serviceCards: ServiceCard[] = []
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

        <view class="reserve-button">
          <text>不可用</text>
        </view>
      </view>
    </view>

    <view v-else class="empty-card">
      <text class="empty-title">暂无服务卡</text>
      <text class="empty-desc">当前没有可用服务卡</text>
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
  border-radius: 24rpx;
  background: #ff383d;
  box-sizing: border-box;
  box-shadow: 0 10rpx 24rpx rgba(255, 56, 61, 0.14);
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
  font-size: 46rpx;
  line-height: 52rpx;
  font-weight: 700;
  letter-spacing: 0;
}

.remain-unit {
  margin-left: 4rpx;
  font-size: 23rpx;
  line-height: 32rpx;
  color: rgba(255, 255, 255, 0.9);
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
  color: #ff383d;
  font-size: 25rpx;
  line-height: 34rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translateY(-50%);
  box-shadow: 0 8rpx 18rpx rgba(180, 24, 30, 0.14);
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
</style>
