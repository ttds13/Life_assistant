<script lang="ts" setup>
withDefaults(defineProps<{
  coverImage?: string
  title: string
  description: string
  price: number
  unit?: string
  fallbackIcon?: string
}>(), {
  coverImage: '',
  unit: '次',
  fallbackIcon: 'i-carbon-image',
})

defineEmits<{
  tap: []
}>()

function formatPrice(price: number) {
  return price % 1 === 0 ? price.toString() : price.toFixed(2)
}
</script>

<template>
  <view class="product-card" @tap="$emit('tap')">
    <view class="product-cover">
      <image
        v-if="coverImage"
        :src="coverImage"
        class="h-full w-full"
        mode="aspectFill"
      />
      <text v-else :class="fallbackIcon" class="text-[64rpx] text-[#FF373D]" />
    </view>
    <view class="product-content">
      <text class="product-title">{{ title }}</text>
      <text class="product-description">{{ description }}</text>
      <view class="product-price-row">
        <text class="product-price">￥{{ formatPrice(price) }}</text>
        <text class="product-unit">/ {{ unit }}</text>
        <text class="i-carbon-chevron-right ml-1 shrink-0 text-[24rpx] text-[#FF373D]" />
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.product-card {
  overflow: hidden;
  border-radius: 16rpx;
  background: #ffffff;
}

.product-card:active {
  opacity: 0.9;
}

.product-cover {
  width: 100%;
  height: 168rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #eaf3ff;
}

.product-content {
  box-sizing: border-box;
  height: 190rpx;
  padding: 20rpx 24rpx;
  display: flex;
  flex-direction: column;
}

.product-title,
.product-description,
.product-unit {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product-title {
  color: #1f2937;
  font-size: 28rpx;
  line-height: 38rpx;
  font-weight: 600;
}

.product-description {
  margin-top: 8rpx;
  color: #9ca3af;
  font-size: 24rpx;
  line-height: 32rpx;
}

.product-price-row {
  min-width: 0;
  margin-top: auto;
  display: flex;
  align-items: center;
}

.product-price {
  flex-shrink: 0;
  color: #ff373d;
  font-size: 30rpx;
  line-height: 40rpx;
  font-weight: 700;
}

.product-unit {
  min-width: 0;
  flex: 1;
  margin-left: 4rpx;
  color: #9ca3af;
  font-size: 22rpx;
  line-height: 30rpx;
}
</style>
