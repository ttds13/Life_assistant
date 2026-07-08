<script lang="ts" setup>
import { getMyFeedback, submitFeedback } from '@/api/support'
import type { FeedbackRecord, FeedbackType } from '@/api/types/support'
import type { UploadImageItem } from '@/api/types/staff'
import { feedbackTypeOptions } from '@/constants/support'
import { useTokenStore } from '@/store/token'
import { useUserStore } from '@/store/user'

definePage({
  style: {
    navigationBarTitleText: '问题反馈',
    navigationBarBackgroundColor: '#F5F7FA',
    navigationBarTextStyle: 'black',
  },
})

const tokenStore = useTokenStore()
const userStore = useUserStore()

const loading = ref(false)
const submitting = ref(false)
const type = ref<FeedbackType>('bug')
const content = ref('')
const contactPhone = ref('')
const images = ref<UploadImageItem[]>([])
const feedbacks = ref<FeedbackRecord[]>([])

const canSubmit = computed(() =>
  content.value.trim().length >= 5
  && /^1\d{10}$/.test(contactPhone.value.trim())
  && !images.value.some(item => item.status === 'uploading'),
)

function ensureLogin() {
  if (tokenStore.hasLogin)
    return true
  uni.navigateTo({ url: '/pages/login/index' })
  return false
}

function imageUrls() {
  return images.value
    .filter(item => item.status !== 'error')
    .map(item => item.ossUrl || item.url)
    .filter(Boolean)
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    open: '待处理',
    processing: '处理中',
    closed: '已关闭',
  }
  return map[status] || status
}

function typeLabel(value: string) {
  return feedbackTypeOptions.find(item => item.value === value)?.label || value
}

async function loadFeedbacks() {
  if (!ensureLogin())
    return
  loading.value = true
  try {
    feedbacks.value = await getMyFeedback()
    contactPhone.value = userStore.userInfo.phone || feedbacks.value[0]?.contactPhone || ''
  }
  finally {
    loading.value = false
  }
}

async function submit() {
  if (!ensureLogin() || submitting.value)
    return
  if (!canSubmit.value) {
    uni.showToast({ icon: 'none', title: '请补全反馈信息' })
    return
  }

  submitting.value = true
  try {
    const record = await submitFeedback({
      type: type.value,
      content: content.value.trim(),
      contactPhone: contactPhone.value.trim(),
      images: imageUrls(),
    })
    feedbacks.value = [record, ...feedbacks.value]
    content.value = ''
    images.value = []
    uni.showToast({ icon: 'success', title: '已提交' })
  }
  finally {
    submitting.value = false
  }
}

onLoad(() => {
  if (tokenStore.hasLogin)
    contactPhone.value = userStore.userInfo.phone || ''
  void loadFeedbacks()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[150rpx] pt-1">
    <loading-state :loading="loading">
      <view v-if="tokenStore.hasLogin">
        <form-section title="反馈类型" required>
          <view class="flex flex-wrap gap-2">
            <view
              v-for="item in feedbackTypeOptions"
              :key="item.value"
              class="h-[68rpx] px-4 rounded-full border flex items-center justify-center"
              :class="type === item.value ? 'bg-[#EAF3FF] border-[#1677FF]' : 'bg-white border-[#E5E7EB]'"
              @tap="type = item.value"
            >
              <text class="text-[26rpx]" :class="type === item.value ? 'text-[#1677FF]' : 'text-gray-600'">
                {{ item.label }}
              </text>
            </view>
          </view>
        </form-section>

        <form-section title="问题描述" required>
          <textarea
            v-model="content"
            class="w-full min-h-[200rpx] text-[28rpx] leading-[42rpx]"
            :maxlength="2000"
            placeholder="请描述遇到的问题、操作路径或希望改进的地方"
          />
        </form-section>

        <form-section title="联系方式" required>
          <input v-model="contactPhone" class="h-[72rpx] text-[28rpx]" type="number" :maxlength="11" placeholder="便于平台联系你" />
        </form-section>

        <form-section title="图片凭证">
          <upload-image-grid v-model="images" :max-count="6" biz-type="feedback_image" />
        </form-section>

        <form-section v-if="feedbacks.length" title="最近反馈">
          <view
            v-for="item in feedbacks"
            :key="item.id"
            class="py-3 border-b border-[#F3F4F6] last:border-b-0"
          >
            <view class="flex items-center justify-between">
              <text class="text-[28rpx] text-[#1F2937] font-600">{{ typeLabel(item.type) }}</text>
              <text class="text-[24rpx] text-[#1677FF]">{{ statusLabel(item.status) }}</text>
            </view>
            <text class="block mt-1 text-[24rpx] text-[#9CA3AF]">{{ item.feedbackNo }} / {{ item.createdAt }}</text>
            <text class="block mt-2 text-[26rpx] leading-[38rpx] text-[#4B5563]">{{ item.content }}</text>
            <view v-if="item.reply" class="mt-2 rounded-[12rpx] bg-[#F8FAFC] p-3">
              <text class="text-[24rpx] leading-[36rpx] text-[#1677FF]">平台回复：{{ item.reply }}</text>
            </view>
          </view>
        </form-section>
      </view>
    </loading-state>

    <view class="fixed left-0 right-0 bottom-0 bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+24rpx)]">
      <button
        class="h-[88rpx] rounded-[22rpx] bg-[#1677FF] text-white text-[30rpx] flex items-center justify-center"
        :disabled="submitting || !canSubmit"
        @tap="submit"
      >
        {{ submitting ? '提交中...' : '提交反馈' }}
      </button>
    </view>
  </view>
</template>
