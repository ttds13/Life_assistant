<script lang="ts" setup>
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
let avatarChooseFallbackTimer: ReturnType<typeof setTimeout> | undefined

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      clearAvatarChooseFallbackTimer()
      return
    }
    avatarFilePath.value = ''
    nicknameInput.value = props.initialNickname || ''
  },
  { immediate: true },
)

const displayAvatar = computed(() => avatarFilePath.value || props.initialAvatar || defaultAvatarUrl)

function onChooseWechatAvatar(e: any) {
  clearAvatarChooseFallbackTimer()
  const url = e.detail?.avatarUrl
  if (!url) {
    uni.showToast({ icon: 'none', title: '未获取到头像' })
    return
  }
  avatarFilePath.value = url
  uni.showToast({ icon: 'none', title: '头像已选择' })
}

function clearAvatarChooseFallbackTimer() {
  if (!avatarChooseFallbackTimer)
    return
  clearTimeout(avatarChooseFallbackTimer)
  avatarChooseFallbackTimer = undefined
}

function startAvatarChooseFallbackTimer() {
  clearAvatarChooseFallbackTimer()
  avatarChooseFallbackTimer = setTimeout(() => {
    uni.showToast({ icon: 'none', title: '微信头像未回调，可用相册上传' })
  }, 1800)
}

function onWechatAvatarTap() {
  startAvatarChooseFallbackTimer()
}

function onChooseLocalAvatar() {
  if (props.loading)
    return

  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const file = Array.isArray(res.tempFiles) ? res.tempFiles[0] : undefined
      if (!assertImageSize(file?.size))
        return
      const filePath = res.tempFilePaths[0] || ''
      if (!filePath) {
        uni.showToast({ icon: 'none', title: '未获取到头像文件' })
        return
      }
      avatarFilePath.value = filePath
      uni.showToast({ icon: 'none', title: '头像已选择' })
    },
    fail: (err) => {
      const message = getChooseImageErrorMessage(err, '选择头像失败')
      if (message)
        uni.showToast({ icon: 'none', title: message })
    },
  })
}

function onNicknameInput(e: any) {
  nicknameInput.value = e.detail?.value || ''
}

function onNicknameValueChange(e: any) {
  const value = e.detail?.value
  if (typeof value === 'string')
    nicknameInput.value = value
}

function onSubmit() {
  if (props.loading)
    return

  const nickname = nicknameInput.value.trim()
  if (!avatarFilePath.value && !nickname) {
    uni.showToast({ icon: 'none', title: '请先选择头像或填写昵称' })
    return
  }

  emit('submit', {
    avatarFilePath: avatarFilePath.value || undefined,
    nickname: nickname || undefined,
  })
}

function onSkip() {
  if (props.loading)
    return

  clearAvatarChooseFallbackTimer()
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
        <view class="wechat-avatar-choice mt-4" @tap="onWechatAvatarTap">
          <button
            class="avatar-wrapper"
            open-type="chooseAvatar"
            @chooseavatar="onChooseWechatAvatar"
          >
            <image class="avatar" :src="displayAvatar" mode="aspectFill" />
          </button>
        </view>
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

.wechat-avatar-choice {
  width: 144rpx;
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
</style>
