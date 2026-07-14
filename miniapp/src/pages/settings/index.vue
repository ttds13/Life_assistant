<script lang="ts" setup>
import { useProfileEditor } from '@/hooks/useProfileEditor'
import { useTokenStore } from '@/store/token'
import { useUserStore } from '@/store/user'
import { avatarDebugLog, clearAvatarDebugLogs, formatAvatarDebugLog, logWechatProfileEnvironment } from '@/utils/avatarDebugLog'
import { assertImageSize, getChooseImageErrorMessage } from '@/utils/uploadImage'

definePage({
  style: {
    navigationBarTitleText: '设置',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
  },
})

const tokenStore = useTokenStore()
const userStore = useUserStore()
const { saveUserProfile } = useProfileEditor()

const avatarPanelVisible = ref(false)
const nicknamePanelVisible = ref(false)
const nicknameInput = ref('')
const saving = ref(false)
const defaultAvatarUrl = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

const localDebugLogs = ref<Array<{ time: string, level: 'log' | 'error', label: string, message: string }>>([])
const debugLogItems = computed(() => localDebugLogs.value.slice(-16).reverse())
const avatarPickerUrl = computed(() => userStore.userInfo.avatar || defaultAvatarUrl)

const displayName = computed(() =>
  userStore.userInfo.nickname || (userStore.userInfo.userId > 0 ? `用户${userStore.userInfo.userId}` : '微信用户'),
)

const displayPhone = computed(() =>
  userStore.userInfo.phone || '未绑定手机号',
)

function ensureLogin() {
  if (tokenStore.hasLogin)
    return true
  uni.navigateTo({ url: '/pages/login/index' })
  return false
}

function openAvatarPanel() {
  if (!ensureLogin())
    return
  clearAvatarDebugLogs()
  localDebugLogs.value = []
  logProfileDebug('avatar panel opened')
  logWechatProfileEnvironment('settings avatar panel')
  avatarPanelVisible.value = true
  logProfileDebug('settings avatar panel visible', {
    hasAvatar: !!userStore.userInfo.avatar,
    avatarPickerUrl: avatarPickerUrl.value,
  })
}

function closeAvatarPanel() {
  if (saving.value)
    return
  avatarPanelVisible.value = false
}

function openNicknamePanel() {
  if (!ensureLogin())
    return
  clearAvatarDebugLogs()
  localDebugLogs.value = []
  const nickname = userStore.userInfo.nickname || ''
  nicknameInput.value = nickname
  logProfileDebug('nickname panel opened', { initialLength: nickname.length })
  logWechatProfileEnvironment('settings nickname panel')
  nicknamePanelVisible.value = true
  logProfileDebug('settings nickname input visible', { value: nicknameInput.value })
}

function closeNicknamePanel() {
  if (saving.value)
    return
  nicknamePanelVisible.value = false
}

async function saveAvatarFile(filePath: string) {
  if (!filePath || saving.value)
    return

  logProfileDebug('save avatar requested', {
    filePath,
    isWechatAvatar: filePath.startsWith('http') || filePath.startsWith('wxfile://'),
  })
  saving.value = true
  try {
    await saveUserProfile({ avatarFilePath: filePath })
    avatarPanelVisible.value = false
    uni.showToast({ icon: 'success', title: '头像已更新' })
  }
  catch (err: any) {
    logProfileDebug('save avatar failed', err, 'error')
    const message = err?.message || err?.errMsg || '头像上传失败'
    uni.showToast({ icon: 'none', title: message.slice(0, 20) })
  }
  finally {
    saving.value = false
  }
}

function onChooseWechatAvatar(e: any) {
  logProfileDebug('choose avatar payload', e)
  const avatarUrl = e.detail?.avatarUrl
  if (!avatarUrl) {
    logProfileDebug('choose avatar missing avatarUrl', e, 'error')
    uni.showToast({ icon: 'none', title: '未获取到头像' })
    return
  }
  saveAvatarFile(avatarUrl)
}

function onChooseLocalAvatar() {
  if (saving.value)
    return

  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      logProfileDebug('choose local avatar payload', res)
      const filePath = res.tempFilePaths[0]
      const file = Array.isArray(res.tempFiles) ? res.tempFiles[0] : undefined
      if (!filePath || !assertImageSize(file?.size))
        return
      saveAvatarFile(filePath)
    },
    fail: (err) => {
      logProfileDebug('choose local avatar failed', err, 'error')
      const message = getChooseImageErrorMessage(err, '选择头像失败')
      if (message) {
        uni.showToast({ icon: 'none', title: message })
      }
    },
  })
}

async function saveNickname(value: string) {
  if (saving.value)
    return

  const nickname = value.trim()
  if (!nickname) {
    logProfileDebug('save nickname blocked: empty value', { value }, 'error')
    uni.showToast({ icon: 'none', title: '请先选择或输入昵称' })
    return
  }

  logProfileDebug('save nickname requested', {
    value: nickname,
    length: nickname.length,
  })
  saving.value = true
  try {
    await saveUserProfile({ nickname })
    nicknamePanelVisible.value = false
    uni.showToast({ icon: 'success', title: '昵称已更新' })
  }
  catch (err: any) {
    logProfileDebug('save nickname failed', err, 'error')
    const message = err?.message || err?.errMsg || '保存失败'
    uni.showToast({ icon: 'none', title: message.slice(0, 20) })
  }
  finally {
    saving.value = false
  }
}

function onWechatNicknameInput(e: any) {
  logProfileDebug('settings nickname input', {
    value: e.detail?.value || '',
    detail: e.detail,
  })
  nicknameInput.value = e.detail?.value || ''
}

function onWechatNicknameFocus(e: any) {
  logProfileDebug('settings nickname focus', {
    value: e.detail?.value || nicknameInput.value,
    detail: e.detail,
  })
}

function onWechatNicknameValueChange(e: any) {
  logProfileDebug('settings nickname value changed', {
    type: e.type,
    value: e.detail?.value || '',
    detail: e.detail,
  })
  const value = e.detail?.value
  if (typeof value === 'string')
    nicknameInput.value = value
}

function normalizeDebugPayload(payload: unknown) {
  if (payload === undefined)
    return ''
  if (payload instanceof Error)
    return payload.message
  if (typeof payload === 'string')
    return payload
  try {
    return JSON.stringify(payload)
  }
  catch {
    return String(payload)
  }
}

function logProfileDebug(label: string, payload?: unknown, level: 'log' | 'error' = 'log') {
  avatarDebugLog(label, payload, level)
  localDebugLogs.value = [
    ...localDebugLogs.value,
    {
      time: new Date().toISOString(),
      level,
      label,
      message: normalizeDebugPayload(payload),
    },
  ].slice(-40)
}

function clearProfileDebugLogs() {
  clearAvatarDebugLogs()
  localDebugLogs.value = []
}

function onLogout() {
  uni.showModal({
    title: '提示',
    content: '确定退出登录？',
    confirmColor: '#EF4444',
    success: (res) => {
      if (res.confirm) {
        tokenStore.logout()
        uni.showToast({ icon: 'success', title: '已退出' })
        setTimeout(() => {
          uni.reLaunch({ url: '/pages/home/index' })
        }, 800)
      }
    },
  })
}

function onTodo(title: string) {
  uni.showToast({ icon: 'none', title: `${title}当前不可用` })
}

</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[60rpx]">
    <view class="mx-4 mt-4 bg-white rounded-[24rpx] shadow-sm overflow-hidden">
      <view class="px-4 py-3">
        <text class="text-[28rpx] text-[#9CA3AF] font-500">个人信息</text>
      </view>

      <view class="flex items-center justify-between px-4 py-4 border-t border-[#F3F4F6]" @tap="openAvatarPanel">
        <text class="text-[30rpx] text-[#1F2937]">头像</text>
        <view class="flex items-center gap-3">
          <view class="w-[88rpx] h-[88rpx] rounded-full bg-[#EAF3FF] overflow-hidden">
            <image
              v-if="userStore.userInfo.avatar"
              :src="userStore.userInfo.avatar"
              class="w-full h-full"
              mode="aspectFill"
            />
            <view v-else class="w-full h-full center">
              <text class="i-carbon-user-avatar text-[56rpx] text-[#1677FF]" />
            </view>
          </view>
          <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
        </view>
      </view>

      <view class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]" @tap="openNicknamePanel">
        <text class="text-[30rpx] text-[#1F2937]">昵称</text>
        <view class="flex items-center gap-2 min-w-0">
          <text class="max-w-[420rpx] truncate text-[28rpx] text-[#6B7280]">{{ displayName }}</text>
          <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0] shrink-0" />
        </view>
      </view>

      <view class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]">
        <text class="text-[30rpx] text-[#1F2937]">手机号</text>
        <view class="flex items-center gap-2">
          <text class="text-[28rpx] text-[#6B7280]">{{ displayPhone }}</text>
        </view>
      </view>
    </view>

    <view class="mx-4 mt-3 bg-white rounded-[24rpx] shadow-sm overflow-hidden">
      <view class="px-4 py-3">
        <text class="text-[28rpx] text-[#9CA3AF] font-500">其他</text>
      </view>
      <view class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]" @tap="onTodo('通知设置')">
        <text class="text-[30rpx] text-[#1F2937]">通知设置</text>
        <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
      </view>
      <view class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]" @tap="onTodo('隐私设置')">
        <text class="text-[30rpx] text-[#1F2937]">隐私设置</text>
        <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
      </view>
      <view class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]" @tap="onTodo('关于我们')">
        <text class="text-[30rpx] text-[#1F2937]">关于我们</text>
        <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
      </view>
    </view>

    <view v-if="tokenStore.hasLogin" class="mx-4 mt-6">
      <button
        class="w-full h-[88rpx] bg-white text-[30rpx] text-[#EF4444] rounded-[24rpx] center shadow-sm font-500"
        @tap="onLogout"
      >
        退出登录
      </button>
    </view>

    <view
      v-if="avatarPanelVisible"
      class="fixed inset-0 z-50 flex items-end"
      style="background: rgba(0,0,0,0.4)"
    >
      <view class="w-full bg-white rounded-t-[32rpx] px-6 pb-[calc(env(safe-area-inset-bottom)+40rpx)] pt-6">
        <view class="flex items-center justify-between mb-5">
          <text class="text-[32rpx] text-[#1F2937] font-600">修改头像</text>
          <text class="i-carbon-close text-[40rpx] text-[#9CA3AF]" @tap="closeAvatarPanel" />
        </view>

        <!-- #ifdef MP-WEIXIN -->
        <button
          class="avatar-wrapper"
          open-type="chooseAvatar"
          @chooseavatar="onChooseWechatAvatar"
        >
          <image class="avatar" :src="avatarPickerUrl" mode="aspectFill" />
        </button>
        <view class="mt-2 text-center">
          <text class="text-[26rpx] text-[#6B7280]">点击头像选择微信头像</text>
        </view>
        <!-- #endif -->

        <button
          class="profile-action-button mt-3 bg-[#1677FF] text-white"
          :disabled="saving"
          @tap="onChooseLocalAvatar"
        >
          {{ saving ? '处理中...' : '从相册/拍照上传' }}
        </button>
        <view v-if="debugLogItems.length" class="profile-debug-log mt-4">
          <view class="profile-debug-log__header">
            <text>调试信息</text>
            <text class="profile-debug-log__clear" @tap="clearProfileDebugLogs">清空</text>
          </view>
          <scroll-view scroll-y class="profile-debug-log__body">
            <text
              v-for="item in debugLogItems"
              :key="item.time + item.label"
              class="profile-debug-log__line"
              :class="{ 'profile-debug-log__line--error': item.level === 'error' }"
            >
              {{ formatAvatarDebugLog(item) }}
            </text>
          </scroll-view>
        </view>
        <view
          class="mt-3 w-full h-[80rpx] bg-white text-[#6B7280] text-[28rpx] rounded-[20rpx] center"
          @tap="closeAvatarPanel"
        >
          取消
        </view>
      </view>
    </view>

    <view
      v-if="nicknamePanelVisible"
      class="fixed inset-0 z-50 flex items-end"
      style="background: rgba(0,0,0,0.4)"
    >
      <view class="w-full bg-white rounded-t-[32rpx] px-6 pb-[calc(env(safe-area-inset-bottom)+40rpx)] pt-6">
        <view class="flex items-center justify-between mb-5">
          <text class="text-[32rpx] text-[#1F2937] font-600">修改昵称</text>
          <text class="i-carbon-close text-[40rpx] text-[#9CA3AF]" @tap="closeNicknamePanel" />
        </view>

        <!-- #ifdef MP-WEIXIN -->
        <view class="mb-5">
          <text class="block mb-2 text-[26rpx] text-[#6B7280]">昵称</text>
          <input
            type="nickname"
            class="weui-input"
            placeholder="请输入昵称"
            placeholder-class="text-[#C4C8D0]"
            :maxlength="20"
            :value="nicknameInput"
            @focus="onWechatNicknameFocus"
            @input="onWechatNicknameInput"
            @change="onWechatNicknameValueChange"
            @blur="onWechatNicknameValueChange"
          />
          <view class="mt-1 text-right">
            <text class="text-[24rpx] text-[#9CA3AF]">{{ nicknameInput.length }}/20</text>
          </view>
          <view
            class="mt-4 w-full h-[84rpx] bg-[#07C160] text-white text-[30rpx] rounded-[20rpx] center font-500"
            @tap="saveNickname(nicknameInput)"
          >
            {{ saving ? '保存中...' : '保存昵称' }}
          </view>
        </view>
        <!-- #endif -->
        <view v-if="debugLogItems.length" class="profile-debug-log mt-4">
          <view class="profile-debug-log__header">
            <text>调试信息</text>
            <text class="profile-debug-log__clear" @tap="clearProfileDebugLogs">清空</text>
          </view>
          <scroll-view scroll-y class="profile-debug-log__body">
            <text
              v-for="item in debugLogItems"
              :key="item.time + item.label"
              class="profile-debug-log__line"
              :class="{ 'profile-debug-log__line--error': item.level === 'error' }"
            >
              {{ formatAvatarDebugLog(item) }}
            </text>
          </scroll-view>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.profile-action-button {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 20rpx;
  font-size: 30rpx;
  font-weight: 500;
  padding: 0;
}

.profile-action-button::after {
  border: 0;
}

.avatar-wrapper {
  width: 152rpx;
  height: 152rpx;
  margin: 0 auto;
  padding: 0;
  border-radius: 999rpx;
  background: #EAF3FF;
  overflow: hidden;
  line-height: normal;
}

.avatar-wrapper::after {
  border: 0;
}

.avatar {
  width: 100%;
  height: 100%;
  display: block;
}

.weui-input {
  width: 100%;
  height: 88rpx;
  box-sizing: border-box;
  padding: 0 24rpx;
  border-radius: 16rpx;
  background: #F5F7FA;
  color: #1F2937;
  font-size: 30rpx;
}

.profile-debug-log {
  padding: 20rpx;
  border-radius: 16rpx;
  background: #111827;
}

.profile-debug-log__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #E5E7EB;
  font-size: 24rpx;
  font-weight: 600;
}

.profile-debug-log__clear {
  color: #93C5FD;
  font-weight: 500;
}

.profile-debug-log__body {
  height: 220rpx;
  margin-top: 12rpx;
}

.profile-debug-log__line {
  display: block;
  margin-bottom: 10rpx;
  color: #D1D5DB;
  font-size: 22rpx;
  line-height: 32rpx;
  word-break: break-all;
}

.profile-debug-log__line--error {
  color: #FCA5A5;
}
</style>
