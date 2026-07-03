<script lang="ts" setup>
import { mockLogin, wechatLogin } from '@/api/auth'
import type { LoginResult } from '@/api/types/auth'
import ProfileCompleteDialog from '@/components/profile-complete-dialog/profile-complete-dialog.vue'
import {
  hasSkippedProfileComplete,
  markProfileCompleteSkipped,
  shouldCompleteProfile,
  useProfileEditor,
} from '@/hooks/useProfileEditor'
import { useTokenStore } from '@/store/token'
import { useUserStore } from '@/store/user'

definePage({
  style: {
    navigationBarTitleText: '登录',
  },
})

const tokenStore = useTokenStore()
const userStore = useUserStore()
const { saveUserProfile } = useProfileEditor()
const loading = ref(false)
const profileSaving = ref(false)
const profileDialogVisible = ref(false)
const agreed = ref(false)
const isLocalDebugLogin = import.meta.env.VITE_LOCAL_DEBUG_LOGIN === 'true'
const promptLocalDebugProfile = import.meta.env.VITE_LOCAL_DEBUG_PROFILE_COMPLETE === 'true'

async function onLocalDebugLogin() {
  if (loading.value)
    return

  loading.value = true
  try {
    const result = await mockLogin({ phone: import.meta.env.VITE_LOCAL_DEBUG_LOGIN_PHONE || undefined })
    handleLoginSuccess(result, promptLocalDebugProfile)
  }
  catch (err: any) {
    const message = err?.message || err?.errMsg || '本地调试登录失败'
    uni.showToast({ icon: 'none', title: message.slice(0, 20) })
  }
  finally {
    loading.value = false
  }
}

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
    const { code: loginCode } = await new Promise<UniApp.LoginRes>((resolve, reject) => {
      uni.login({ success: resolve, fail: reject })
    })

    const result = await wechatLogin({ loginCode, phoneCode })
    handleLoginSuccess(result, true)
  }
  catch (err: any) {
    const message = err?.message || err?.errMsg || '微信登录失败'
    uni.showToast({ icon: 'none', title: message.slice(0, 20) })
  }
  finally {
    loading.value = false
  }
}

function onH5LoginTap() {
  uni.showToast({ icon: 'none', title: '请在微信小程序中登录' })
}

function handleLoginSuccess(result: LoginResult, allowProfilePrompt: boolean) {
  tokenStore.setTokenInfo(result)
  userStore.setFromProfile(result.user)
  uni.showToast({ icon: 'success', title: '登录成功' })

  const user = userStore.userInfo
  if (allowProfilePrompt && shouldCompleteProfile(user) && !hasSkippedProfileComplete(user.userId)) {
    profileDialogVisible.value = true
    return
  }

  setTimeout(() => navigateBack(), 500)
}

async function onProfileCompleteSubmit(payload: { avatarFilePath?: string, nickname?: string }) {
  if (profileSaving.value)
    return

  profileSaving.value = true
  try {
    await saveUserProfile(payload)
    profileDialogVisible.value = false
    uni.showToast({ icon: 'success', title: '资料已更新' })
    setTimeout(() => navigateBack(), 500)
  }
  catch (err: any) {
    const message = err?.message || err?.errMsg || '资料保存失败'
    uni.showToast({ icon: 'none', title: message.slice(0, 20) })
  }
  finally {
    profileSaving.value = false
  }
}

function onProfileCompleteSkip() {
  markProfileCompleteSkipped(userStore.userInfo.userId)
  profileDialogVisible.value = false
  navigateBack()
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
    <view class="w-[160rpx] h-[160rpx] bg-[#EAF3FF] rounded-full flex items-center justify-center mb-6">
      <text class="text-[72rpx]">家</text>
    </view>
    <text class="text-[36rpx] font-600 text-gray-800">
      生活助手
    </text>
    <text class="text-[26rpx] text-gray-400 mt-2">
      登录后享受更多服务
    </text>

    <view class="w-full mt-[100rpx]">
      <button
        v-if="isLocalDebugLogin"
        class="w-full h-[88rpx] bg-[#1677FF] text-white text-[30rpx] rounded-full flex items-center justify-center"
        :loading="loading"
        @tap="onLocalDebugLogin"
      >
        本地调试登录
      </button>

      <!-- #ifdef MP-WEIXIN -->
      <button
        v-if="!isLocalDebugLogin"
        open-type="getPhoneNumber"
        class="w-full h-[88rpx] bg-[#07C160] text-white text-[30rpx] rounded-full flex items-center justify-center"
        :loading="loading"
        @getphonenumber="onGetPhoneNumber"
      >
        微信手机号快捷登录
      </button>
      <!-- #endif -->

      <!-- #ifdef H5 -->
      <button
        v-if="!isLocalDebugLogin"
        class="w-full h-[88rpx] bg-[#1677FF] text-white text-[30rpx] rounded-full flex items-center justify-center"
        :loading="loading"
        @tap="onH5LoginTap"
      >
        微信小程序登录
      </button>
      <!-- #endif -->
    </view>

    <view class="flex items-center mt-8" @tap="agreed = !agreed">
      <view
        class="w-[32rpx] h-[32rpx] rounded-full border-2 mr-2 flex items-center justify-center"
        :class="agreed ? 'border-[#1677FF] bg-[#1677FF]' : 'border-gray-300'"
      >
        <text v-if="agreed" class="text-white text-[20rpx]">
          ✓
        </text>
      </view>
      <text class="text-[24rpx] text-gray-500">
        已阅读并同意《用户协议》和《隐私政策》
      </text>
    </view>

    <ProfileCompleteDialog
      :visible="profileDialogVisible"
      :initial-avatar="userStore.userInfo.avatar"
      :initial-nickname="userStore.userInfo.nickname"
      :loading="profileSaving"
      @submit="onProfileCompleteSubmit"
      @skip="onProfileCompleteSkip"
    />
  </view>
</template>
