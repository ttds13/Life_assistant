<script lang="ts" setup>
import { resolvePromotionLink } from '@/api/promotionLinks'

definePage({
  style: {
    navigationBarTitleText: '活动跳转',
  },
})

const loading = ref(true)
const failed = ref(false)
const message = ref('正在打开活动')
const promotionKey = ref('')

const tabbarPaths = new Set(['/pages/home/index', '/pages/order/list', '/pages/profile/index'])

function pathOnly(url: string) {
  return url.split('?')[0]
}

function goHome() {
  uni.switchTab({ url: '/pages/home/index' })
}

function redirectToPath(url: string) {
  const path = pathOnly(url)
  if (tabbarPaths.has(path)) {
    uni.switchTab({
      url: path,
      fail: () => uni.reLaunch({ url: path }),
    })
    return
  }

  uni.redirectTo({
    url,
    fail: () => {
      uni.navigateTo({
        url,
        fail: goHome,
      })
    },
  })
}

async function openPromotion() {
  if (!promotionKey.value) {
    loading.value = false
    failed.value = true
    message.value = '活动链接缺少 key'
    return
  }

  loading.value = true
  failed.value = false
  message.value = '正在打开活动'

  try {
    const result = await resolvePromotionLink(promotionKey.value)
    if (!result.targetAvailable) {
      uni.showToast({ icon: 'none', title: '活动商品暂不可用' })
    }
    redirectToPath(result.resolvedPath || result.fallbackPath || '/pages/home/index')
  }
  catch {
    loading.value = false
    failed.value = true
    message.value = '活动暂不可用'
  }
}

onLoad((query) => {
  promotionKey.value = typeof query?.key === 'string' ? decodeURIComponent(query.key) : ''
  void openPromotion()
})
</script>

<template>
  <view class="promo-landing">
    <view class="promo-status">
      <view v-if="loading" class="loading-dot"></view>
      <text class="status-title">{{ message }}</text>
      <text v-if="loading" class="status-desc">请稍候</text>
      <view v-if="failed" class="actions">
        <button class="action-button primary" @tap="openPromotion">重试</button>
        <button class="action-button" @tap="goHome">返回首页</button>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.promo-landing {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 48rpx 32rpx;
  background: #f6f7f9;
  display: flex;
  align-items: center;
  justify-content: center;
}

.promo-status {
  width: 100%;
  min-height: 360rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.loading-dot {
  width: 52rpx;
  height: 52rpx;
  border: 6rpx solid rgba(22, 119, 255, 0.16);
  border-top-color: #1677ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.status-title {
  margin-top: 28rpx;
  color: #1f2937;
  font-size: 34rpx;
  line-height: 46rpx;
  font-weight: 700;
}

.status-desc {
  margin-top: 12rpx;
  color: #8a94a6;
  font-size: 26rpx;
  line-height: 36rpx;
}

.actions {
  margin-top: 34rpx;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.action-button {
  width: 100%;
  height: 84rpx;
  border-radius: 12rpx;
  background: #ffffff;
  color: #1f2937;
  font-size: 28rpx;
  line-height: 84rpx;
}

.primary {
  background: #1677ff;
  color: #ffffff;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
