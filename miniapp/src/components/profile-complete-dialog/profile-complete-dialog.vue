<script lang="ts" setup>
import { avatarDebugLog, clearAvatarDebugLogs, formatAvatarDebugLog, logWechatProfileEnvironment } from '@/utils/avatarDebugLog'
import { assertImageSize, getChooseImageErrorMessage } from '@/utils/uploadImage'

const props = defineProps<{
  visible: boolean
  initialAvatar?: string
  initialNickname?: string
  loading?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: { avatarFilePath?: string, nickname?: string }]
  skip: []
}>()

const avatarFilePath = ref('')
const nicknameInput = ref('')
const defaultAvatarUrl = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

const localDebugLogs = ref<Array<{ time: string, level: 'log' | 'error', label: string, message: string }>>([])
const debugLogItems = computed(() => localDebugLogs.value.slice(-16).reverse())

watch(
  () => props.visible,
  (visible) => {
    if (!visible)
      return
    clearAvatarDebugLogs()
    localDebugLogs.value = []
    avatarFilePath.value = ''
    nicknameInput.value = ''
    logProfileDebug('profile dialog opened', {
      initialNicknameLength: (props.initialNickname || '').length,
      hasInitialAvatar: !!props.initialAvatar,
    })
    logWechatProfileEnvironment('profile dialog')
    logProfileDebug('profile dialog visible', {
      displayAvatar: avatarFilePath.value || props.initialAvatar || defaultAvatarUrl,
    })
  },
  { immediate: true },
)

const displayAvatar = computed(() => avatarFilePath.value || props.initialAvatar || defaultAvatarUrl)

function onChooseWechatAvatar(e: any) {
  logProfileDebug('profile dialog choose avatar payload', e)
  const url = e.detail?.avatarUrl
  if (!url) {
    logProfileDebug('profile dialog choose avatar missing avatarUrl', e, 'error')
    uni.showToast({ icon: 'none', title: '未获取到头像' })
    return
  }
  avatarFilePath.value = url
  uni.showToast({ icon: 'none', title: '头像已选择' })
}

function onChooseLocalAvatar() {
  if (props.loading)
    return

  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      logProfileDebug('profile dialog choose local avatar payload', res)
      const file = Array.isArray(res.tempFiles) ? res.tempFiles[0] : undefined
      if (!assertImageSize(file?.size))
        return
      const filePath = res.tempFilePaths[0] || ''
      if (!filePath) {
        logProfileDebug('profile dialog choose local avatar missing filePath', res, 'error')
        uni.showToast({ icon: 'none', title: '未获取到头像文件' })
        return
      }
      avatarFilePath.value = filePath
      uni.showToast({ icon: 'none', title: '头像已选择' })
    },
    fail: (err) => {
      logProfileDebug('profile dialog choose local avatar failed', err, 'error')
      const message = getChooseImageErrorMessage(err, '选择头像失败')
      if (message) {
        uni.showToast({ icon: 'none', title: message })
      }
    },
  })
}

function onNicknameInput(e: any) {
  logProfileDebug('profile dialog nickname input', {
    value: e.detail?.value || '',
    detail: e.detail,
  })
  nicknameInput.value = e.detail?.value || ''
}

function onNicknameFocus(e: any) {
  logProfileDebug('profile dialog nickname focus', {
    value: e.detail?.value || nicknameInput.value,
    detail: e.detail,
  })
}

function onNicknameValueChange(e: any) {
  logProfileDebug('profile dialog nickname value changed', {
    type: e.type,
    value: e.detail?.value || '',
    detail: e.detail,
  })
  const value = e.detail?.value
  if (typeof value === 'string')
    nicknameInput.value = value
}

function onSubmit() {
  if (props.loading)
    return

  const nickname = nicknameInput.value.trim()
  if (!avatarFilePath.value && !nickname) {
    logProfileDebug('profile dialog submit blocked: empty profile', undefined, 'error')
    uni.showToast({ icon: 'none', title: '请先选择头像或填写昵称' })
    return
  }

  logProfileDebug('profile dialog submit requested', {
    hasAvatarFilePath: !!avatarFilePath.value,
    nicknameLength: nickname.length,
  })
  emit('submit', {
    avatarFilePath: avatarFilePath.value || undefined,
    nickname: nickname || undefined,
  })
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

function onSkip() {
  if (props.loading)
    return

  emit('skip')
}

</script>

<template>
  <view
    v-if="visible"
    class="fixed inset-0 z-50 flex items-end"
    style="background: rgba(0,0,0,0.45)"
  >
    <view class="w-full bg-white rounded-t-[32rpx] px-6 pt-6 pb-[calc(env(safe-area-inset-bottom)+40rpx)]">
      <view class="flex items-start justify-between">
        <view class="min-w-0">
          <text class="block text-[34rpx] leading-[44rpx] text-[#1F2937] font-700">完善头像昵称</text>
          <text class="block mt-2 text-[26rpx] leading-[36rpx] text-[#6B7280]">方便师傅联系，也让订单资料更完整</text>
        </view>
        <text class="i-carbon-close text-[42rpx] text-[#9CA3AF] shrink-0" @tap="onSkip" />
      </view>

      <view class="mt-6 flex flex-col items-center">
        <view class="relative w-[144rpx] h-[144rpx] rounded-full bg-[#EAF3FF] overflow-hidden center">
          <image
            v-if="displayAvatar"
            :src="displayAvatar"
            class="w-full h-full"
            mode="aspectFill"
          />
          <text v-else class="i-carbon-user-avatar text-[82rpx] text-[#1677FF]" />
        </view>

        <!-- #ifdef MP-WEIXIN -->
        <button
          class="avatar-wrapper mt-4"
          open-type="chooseAvatar"
          @chooseavatar="onChooseWechatAvatar"
        >
          <image class="avatar" :src="displayAvatar" mode="aspectFill" />
        </button>
        <view class="mt-2 text-center">
          <text class="text-[24rpx] text-[#6B7280]">点击头像选择微信头像</text>
        </view>
        <!-- #endif -->

        <button
          class="profile-dialog-avatar-button mt-3"
          :disabled="loading"
          @tap="onChooseLocalAvatar"
        >
          从相册/拍照上传
        </button>
      </view>

      <view class="mt-6">
        <text class="block mb-2 text-[26rpx] text-[#6B7280]">昵称</text>
        <!-- #ifdef MP-WEIXIN -->
        <input
          type="nickname"
          class="weui-input"
          placeholder="请输入昵称"
          placeholder-class="text-[#C4C8D0]"
          :maxlength="20"
          :value="nicknameInput"
          @focus="onNicknameFocus"
          @input="onNicknameInput"
          @change="onNicknameValueChange"
          @blur="onNicknameValueChange"
        />
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <input
          name="nickname"
          class="w-full h-[88rpx] px-4 bg-[#F5F7FA] rounded-[16rpx] text-[30rpx] text-[#1F2937]"
          placeholder="请输入昵称"
          placeholder-class="text-[#C4C8D0]"
          :maxlength="20"
          :value="nicknameInput"
          @input="onNicknameInput"
          @change="onNicknameValueChange"
          @blur="onNicknameValueChange"
        />
        <!-- #endif -->
        <view class="mt-1 text-right">
          <text class="text-[24rpx] text-[#9CA3AF]">{{ nicknameInput.length }}/20</text>
        </view>
        <view
          class="mt-5 w-full h-[88rpx] rounded-[20rpx] bg-[#1677FF] text-white text-[30rpx] font-600 center"
          @tap="onSubmit"
        >
          {{ loading ? '保存中...' : '保存并继续' }}
        </view>
      </view>

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
        class="mt-3 w-full h-[80rpx] rounded-[20rpx] bg-white text-[#6B7280] text-[28rpx] center"
        @tap="onSkip"
      >
        暂时跳过
      </view>
    </view>
  </view>
</template>

<style scoped>
.profile-dialog-avatar-button {
  height: 68rpx;
  line-height: 68rpx;
  border-radius: 999rpx;
  background: #F3F7FF;
  color: #1677FF;
  font-size: 26rpx;
  padding: 0 48rpx;
}

.profile-dialog-avatar-button::after {
  border: 0;
}

.avatar-wrapper {
  width: 144rpx;
  height: 144rpx;
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
