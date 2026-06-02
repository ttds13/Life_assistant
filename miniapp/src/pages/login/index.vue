<script lang="ts" setup>
import { wechatLogin, mockLogin } from '@/api/auth'
import { useTokenStore } from '@/store/token'
import { useUserStore } from '@/store/user'
import { clearDevStaffSession } from '@/utils/devStaffStorage'

definePage({
  style: {
    navigationBarTitleText: '登录',
  },
})

const tokenStore = useTokenStore()
const userStore = useUserStore()
const loading = ref(false)
const agreed = ref(false)
const mockLoginFlagKey = 'life-assistant:mock-login'
const showMockLogin = import.meta.env.VITE_WX_APPID === 'touristappid'
  || import.meta.env.VITE_SERVER_BASEURL?.includes('192.168.')
  || import.meta.env.VITE_SERVER_BASEURL?.includes('127.0.0.1')
  || import.meta.env.VITE_SERVER_BASEURL?.includes('localhost')

// 微信手机号快捷登录
async function onGetPhoneNumber(e: any) {
  if (!agreed.value) {
    uni.showToast({ icon: 'none', title: '请先同意用户协议' })
    return
  }
  const phoneCode = e.detail?.code
  if (!phoneCode) {
    uni.showToast({ icon: 'none', title: '手机号授权失败' })
    return
  }

  loading.value = true
  try {
    // 同时获取 wx.login code
    const { code: loginCode } = await new Promise<UniApp.LoginRes>((resolve, reject) => {
      uni.login({ success: resolve, fail: reject })
    })

    const result = await wechatLogin({ loginCode, phoneCode })
    tokenStore.setTokenInfo({ token: result.accessToken, expiresIn: result.expiresIn })
    userStore.setFromProfile(result.user)
    uni.removeStorageSync(mockLoginFlagKey)
    clearDevStaffSession()
    uni.showToast({ icon: 'success', title: '登录成功' })
    setTimeout(() => navigateBack(), 500)
  }
  catch (err: any) {
    console.error('微信登录失败:', err)
    const message = err?.message || err?.errMsg || '微信登录失败'
    uni.showToast({ icon: 'none', title: message.slice(0, 20) })
  }
  finally {
    loading.value = false
  }
}

// 开发环境模拟登录
async function onMockLogin() {
  if (!agreed.value) {
    uni.showToast({ icon: 'none', title: '请先同意用户协议' })
    return
  }
  loading.value = true
  try {
    const result = await mockLogin({ phone: '13800001111' })
    tokenStore.setTokenInfo({ token: result.accessToken, expiresIn: result.expiresIn })
    userStore.setFromProfile(result.user)
    uni.setStorageSync(mockLoginFlagKey, '1')
    clearDevStaffSession()
    uni.showToast({ icon: 'success', title: '登录成功' })
    setTimeout(() => navigateBack(), 500)
  }
  catch (err: any) {
    console.error('模拟登录失败:', err)
    const message = err?.message || err?.errMsg || '模拟登录失败'
    uni.showToast({ icon: 'none', title: message.slice(0, 20) })
  }
  finally {
    loading.value = false
  }
}

function navigateBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
  }
  else {
    uni.switchTab({ url: '/pages/home/index' })
  }
}
</script>

<template>
  <view class="min-h-screen bg-white flex flex-col items-center px-8 pt-[200rpx]">
    <!-- Logo -->
    <view class="w-[160rpx] h-[160rpx] bg-[#EAF3FF] rounded-full flex items-center justify-center mb-6">
      <text class="text-[72rpx]">🏠</text>
    </view>
    <text class="text-[36rpx] font-600 text-gray-800">生活助手</text>
    <text class="text-[26rpx] text-gray-400 mt-2">登录后享受更多服务</text>

    <!-- 登录按钮 -->
    <view class="w-full mt-[100rpx]">
      <!-- #ifdef MP-WEIXIN -->
      <button
        open-type="getPhoneNumber"
        class="w-full h-[88rpx] bg-[#07C160] text-white text-[30rpx] rounded-full flex items-center justify-center"
        :loading="loading"
        @getphonenumber="onGetPhoneNumber"
      >
        微信手机号快捷登录
      </button>
      <button
        v-if="showMockLogin"
        class="w-full h-[88rpx] mt-4 bg-[#1677FF] text-white text-[30rpx] rounded-full flex items-center justify-center"
        :loading="loading"
        @tap="onMockLogin"
      >
        开发模拟登录
      </button>
      <!-- #endif -->

      <!-- #ifdef H5 -->
      <button
        class="w-full h-[88rpx] bg-[#1677FF] text-white text-[30rpx] rounded-full flex items-center justify-center"
        :loading="loading"
        @tap="onMockLogin"
      >
        开发模拟登录
      </button>
      <!-- #endif -->
    </view>

    <!-- 用户协议 -->
    <view class="flex items-center mt-8" @tap="agreed = !agreed">
      <view
        class="w-[32rpx] h-[32rpx] rounded-full border-2 mr-2 flex items-center justify-center"
        :class="agreed ? 'border-[#1677FF] bg-[#1677FF]' : 'border-gray-300'"
      >
        <text v-if="agreed" class="text-white text-[20rpx]">✓</text>
      </view>
      <text class="text-[24rpx] text-gray-500">已阅读并同意《用户协议》和《隐私政策》</text>
    </view>
  </view>
</template>
