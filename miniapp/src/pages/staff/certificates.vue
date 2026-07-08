<script lang="ts" setup>
import { getMyStaffApplication, submitStaffApplication } from '@/api/support'
import type { StaffApplication } from '@/api/types/support'
import type { UploadImageItem } from '@/api/types/staff'
import { staffSkillOptions } from '@/constants/support'

definePage({
  style: {
    navigationBarTitleText: '证件管理',
    navigationBarBackgroundColor: '#F5F7FA',
    navigationBarTextStyle: 'black',
  },
})

const loading = ref(false)
const submitting = ref(false)
const application = ref<StaffApplication | null>(null)
const form = reactive({
  name: '',
  phone: '',
  cityCode: '',
  idCard: '',
  note: '',
})
const selectedSkills = ref<string[]>([])
const images = ref<UploadImageItem[]>([])

const approved = computed(() => application.value?.status === 'approved')
const canSubmit = computed(() =>
  !approved.value
  && !!form.name.trim()
  && /^1\d{10}$/.test(form.phone.trim())
  && !!form.cityCode.trim()
  && selectedSkills.value.length > 0
  && !images.value.some(item => item.status === 'uploading'),
)

function statusLabel(status?: string) {
  if (status === 'approved') return '已认证'
  if (status === 'pending') return '审核中'
  if (status === 'rejected') return '需补充'
  return '未提交'
}

function hydrate(value: StaffApplication | null) {
  form.name = value?.name || ''
  form.phone = value?.phone || ''
  form.cityCode = value?.cityCode || ''
  form.idCard = value?.idCard || ''
  form.note = value?.note || ''
  selectedSkills.value = value?.skills?.length ? value.skills.slice() : []
  images.value = (value?.images || []).map((url, index) => ({
    id: `certificate-${index}`,
    url: value?.imageOssUrls?.[index] || url,
    ossUrl: value?.imageOssUrls?.[index] || url,
    displayUrl: url,
    status: 'done',
    type: 'other',
  }))
}

function toggleSkill(skill: string) {
  if (approved.value)
    return
  selectedSkills.value = selectedSkills.value.includes(skill)
    ? selectedSkills.value.filter(item => item !== skill)
    : [...selectedSkills.value, skill]
}

function imageUrls() {
  return images.value
    .filter(item => item.status !== 'error')
    .map(item => item.ossUrl || item.url)
    .filter(Boolean)
}

async function loadApplication() {
  loading.value = true
  try {
    application.value = await getMyStaffApplication()
    hydrate(application.value)
  }
  finally {
    loading.value = false
  }
}

async function submit() {
  if (!canSubmit.value || submitting.value)
    return
  submitting.value = true
  try {
    application.value = await submitStaffApplication({
      name: form.name.trim(),
      phone: form.phone.trim(),
      cityCode: form.cityCode.trim(),
      idCard: form.idCard.trim() || undefined,
      skills: selectedSkills.value,
      note: form.note.trim() || undefined,
      images: imageUrls(),
    })
    hydrate(application.value)
    uni.showToast({ icon: 'success', title: '已提交审核' })
  }
  finally {
    submitting.value = false
  }
}

function goContact() {
  uni.navigateTo({ url: '/pages/staff/contact-service' })
}

onShow(() => {
  void loadApplication()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[150rpx] pt-1">
    <loading-state :loading="loading">
      <view class="mx-4 mt-3 rounded-[16rpx] bg-white p-4">
        <view class="flex items-center justify-between">
          <view>
            <text class="block text-[32rpx] text-[#1F2937] font-700">认证资料</text>
            <text class="block mt-1 text-[24rpx] text-[#6B7280]">用于后台审核师傅服务资质</text>
          </view>
          <view class="rounded-full px-3 py-1" :class="approved ? 'bg-[#ECFDF3]' : 'bg-[#FFF7ED]'">
            <text class="text-[24rpx]" :class="approved ? 'text-[#16A34A]' : 'text-[#AD6800]'">
              {{ statusLabel(application?.status) }}
            </text>
          </view>
        </view>
      </view>

      <form-section title="身份信息" required>
        <view class="py-2">
          <text class="block mb-2 text-[26rpx] text-gray-500">姓名</text>
          <input v-model="form.name" class="h-[72rpx] text-[28rpx]" :disabled="approved" :maxlength="64" placeholder="请输入真实姓名" />
        </view>
        <view class="py-2">
          <text class="block mb-2 text-[26rpx] text-gray-500">手机号</text>
          <input v-model="form.phone" class="h-[72rpx] text-[28rpx]" :disabled="approved" type="number" :maxlength="11" placeholder="请输入常用手机号" />
        </view>
        <view class="py-2">
          <text class="block mb-2 text-[26rpx] text-gray-500">服务城市</text>
          <input v-model="form.cityCode" class="h-[72rpx] text-[28rpx]" :disabled="approved" :maxlength="40" placeholder="如：北京 / 上海 / 深圳" />
        </view>
        <view class="py-2">
          <text class="block mb-2 text-[26rpx] text-gray-500">身份证号</text>
          <input v-model="form.idCard" class="h-[72rpx] text-[28rpx]" :disabled="approved" :maxlength="20" placeholder="用于平台审核" />
        </view>
      </form-section>

      <form-section title="服务技能" required>
        <view class="flex flex-wrap gap-2">
          <view
            v-for="skill in staffSkillOptions"
            :key="skill"
            class="h-[68rpx] px-4 rounded-full border flex items-center justify-center"
            :class="selectedSkills.includes(skill) ? 'bg-[#EAF3FF] border-[#1677FF]' : 'bg-white border-[#E5E7EB]'"
            @tap="toggleSkill(skill)"
          >
            <text class="text-[26rpx]" :class="selectedSkills.includes(skill) ? 'text-[#1677FF]' : 'text-gray-600'">
              {{ skill }}
            </text>
          </view>
        </view>
      </form-section>

      <form-section title="补充说明">
        <textarea
          v-model="form.note"
          class="w-full min-h-[160rpx] text-[28rpx] leading-[42rpx]"
          :disabled="approved"
          :maxlength="2000"
          placeholder="说明证件、经验或可服务范围"
        />
      </form-section>

      <form-section title="证件材料">
        <upload-image-grid v-model="images" :max-count="6" biz-type="staff_application" :biz-id="application?.id" :readonly="approved" />
        <text class="block mt-2 text-[24rpx] leading-[36rpx] text-[#9CA3AF]">
          可上传身份证、健康证、技能证书或其他资质材料，最多 6 张。
        </text>
      </form-section>

      <view v-if="approved" class="mx-4 mt-3 rounded-[16rpx] bg-white p-4">
        <text class="block text-[28rpx] leading-[42rpx] text-[#6B7280]">
          已认证资料暂不支持师傅端直接改动。如需更新证件，请联系客服或由后台发起资料复核。
        </text>
        <button class="mt-3 h-[80rpx] rounded-[18rpx] bg-[#F3F4F6] text-[#4B5563] text-[28rpx]" @tap="goContact">
          联系客服
        </button>
      </view>
    </loading-state>

    <view v-if="!approved" class="fixed left-0 right-0 bottom-0 bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+24rpx)]">
      <button
        class="h-[88rpx] rounded-[22rpx] bg-[#1677FF] text-white text-[30rpx] flex items-center justify-center"
        :disabled="submitting || !canSubmit"
        @tap="submit"
      >
        {{ submitting ? '提交中...' : '提交审核' }}
      </button>
    </view>
  </view>
</template>
