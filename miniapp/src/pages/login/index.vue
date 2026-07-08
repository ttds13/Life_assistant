<script lang="ts" setup>
import { wechatLogin } from '@/api/auth'
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
    const message = String(err?.message || err?.errMsg || '绑定手机号失败').replace(/\u5fae\u4fe1/g, '手机号')
    uni.showToast({ icon: 'none', title: message.slice(0, 20) })
  }
  finally {
    loading.value = false
  }
}

function onH5LoginTap() {
  uni.showToast({ icon: 'none', title: '请在小程序中绑定手机号' })
}

function openLegalPage(url: string) {
  uni.navigateTo({ url })
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
      <!-- #ifdef MP-WEIXIN -->
      <button
        open-type="getPhoneNumber"
        class="w-full h-[88rpx] bg-[#1677FF] text-white text-[30rpx] rounded-full flex items-center justify-center"
        :loading="loading"
        @getphonenumber="onGetPhoneNumber"
      >
        绑定手机号
      </button>
      <!-- #endif -->

      <!-- #ifdef H5 -->
      <button
        class="w-full h-[88rpx] bg-[#1677FF] text-white text-[30rpx] rounded-full flex items-center justify-center"
        :loading="loading"
        @tap="onH5LoginTap"
      >
        绑定手机号
      </button>
      <!-- #endif -->
    </view>

    <view class="flex items-start mt-8 w-full" @tap="agreed = !agreed">
      <view
        class="agreement-checkbox w-[32rpx] h-[32rpx] rounded-full mr-2 mt-[2rpx] flex items-center justify-center shrink-0"
        :class="{ 'is-agreed': agreed }"
      >
        <text v-if="agreed" class="text-white text-[20rpx]">
          ✓
        </text>
      </view>
      <view class="flex-1 flex flex-row flex-wrap items-center">
        <text class="text-[24rpx] text-gray-500">已阅读并同意</text>
        <text
          class="text-[24rpx] text-[#1677FF]"
          @tap.stop="openLegalPage('/pages/legal/user-agreement')"
        >
          《用户协议》
        </text>
        <text class="text-[24rpx] text-gray-500">和</text>
        <text
          class="text-[24rpx] text-[#1677FF]"
          @tap.stop="openLegalPage('/pages/legal/privacy-policy')"
        >
          《隐私政策》
        </text>
      </view>
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

<style scoped>
.agreement-checkbox {
  box-sizing: border-box;
  border: 2rpx solid #111827;
  background: #fff;
}

.agreement-checkbox.is-agreed {
  background: #111827;
}
</style>
