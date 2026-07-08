<script lang="ts" setup>
import { getMyStaffApplication, submitStaffApplication } from '@/api/support'
import type { StaffApplication } from '@/api/types/support'
import type { UploadImageItem } from '@/api/types/staff'
import { staffSkillOptions } from '@/constants/support'
import { useTokenStore } from '@/store/token'
import { useUserStore } from '@/store/user'

definePage({
  style: {
    navigationBarTitleText: '申请师傅',
    navigationBarBackgroundColor: '#F5F7FA',
    navigationBarTextStyle: 'black',
  },
})

const tokenStore = useTokenStore()
const userStore = useUserStore()

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

const statusMeta = computed(() => {
  const status = application.value?.status
  const map: Record<string, { label: string, desc: string, className: string }> = {
    pending: { label: '审核中', desc: '资料已提交，平台会尽快完成审核。', className: 'bg-[#FFF7ED] text-[#AD6800]' },
    approved: { label: '已开通', desc: '你的账号已开通师傅端，可以进入师傅工作台。', className: 'bg-[#ECFDF3] text-[#16A34A]' },
    rejected: { label: '需修改', desc: '申请未通过，可修改资料后重新提交。', className: 'bg-[#FEF2F2] text-[#EF4444]' },
  }
  return status ? map[status] || { label: status, desc: '申请状态已更新。', className: 'bg-[#F3F4F6] text-[#6B7280]' } : null
})

const canSubmit = computed(() =>
  application.value?.status === 'approved'
  || !!form.name.trim()
  && /^1\d{10}$/.test(form.phone.trim())
  && !!form.cityCode.trim()
  && selectedSkills.value.length > 0
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

function hydrateForm(value: StaffApplication | null) {
  form.name = value?.name || userStore.userInfo.nickname || ''
  form.phone = value?.phone || userStore.userInfo.phone || ''
  form.cityCode = value?.cityCode || ''
  form.idCard = value?.idCard || ''
  form.note = value?.note || ''
  selectedSkills.value = value?.skills?.length ? value.skills.slice() : []
  images.value = (value?.images || []).map((url, index) => ({
    id: `application-${index}`,
    url: value?.imageOssUrls?.[index] || url,
    ossUrl: value?.imageOssUrls?.[index] || url,
    displayUrl: url,
    status: 'done',
    type: 'other',
  }))
}

async function loadApplication() {
  if (!ensureLogin())
    return
  loading.value = true
  try {
    application.value = await getMyStaffApplication()
    hydrateForm(application.value)
  }
  finally {
    loading.value = false
  }
}

function toggleSkill(skill: string) {
  const exists = selectedSkills.value.includes(skill)
  selectedSkills.value = exists
    ? selectedSkills.value.filter(item => item !== skill)
    : [...selectedSkills.value, skill]
}

async function submit() {
  if (!ensureLogin() || submitting.value)
    return
  if (application.value?.status === 'approved') {
    uni.navigateTo({ url: '/pages/staff/home' })
    return
  }
  if (!canSubmit.value) {
    uni.showToast({ icon: 'none', title: '请补全申请资料' })
    return
  }

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
    hydrateForm(application.value)
    uni.showToast({ icon: 'success', title: '已提交审核' })
  }
  finally {
    submitting.value = false
  }
}

onLoad(() => {
  void loadApplication()
})

onShow(() => {
  if (tokenStore.hasLogin)
    void userStore.fetchUserInfo()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[150rpx] pt-1">
    <loading-state :loading="loading">
      <view v-if="tokenStore.hasLogin">
        <view v-if="statusMeta" class="mx-4 mt-3 rounded-[16rpx] p-4" :class="statusMeta.className">
          <view class="flex items-center justify-between">
            <text class="text-[30rpx] font-700">{{ statusMeta.label }}</text>
            <text class="text-[24rpx]">{{ application?.updatedAt }}</text>
          </view>
          <text class="block mt-2 text-[24rpx] leading-[36rpx]">{{ statusMeta.desc }}</text>
        </view>

        <form-section title="基础信息" required>
          <view class="py-2">
            <text class="block mb-2 text-[26rpx] text-gray-500">姓名</text>
            <input v-model="form.name" class="h-[72rpx] text-[28rpx]" :maxlength="64" placeholder="请输入真实姓名" />
          </view>
          <view class="py-2">
            <text class="block mb-2 text-[26rpx] text-gray-500">手机号</text>
            <input v-model="form.phone" class="h-[72rpx] text-[28rpx]" type="number" :maxlength="11" placeholder="请输入常用手机号" />
          </view>
          <view class="py-2">
            <text class="block mb-2 text-[26rpx] text-gray-500">服务城市</text>
            <input v-model="form.cityCode" class="h-[72rpx] text-[28rpx]" :maxlength="40" placeholder="如：北京 / 上海 / 深圳" />
          </view>
          <view class="py-2">
            <text class="block mb-2 text-[26rpx] text-gray-500">身份证号</text>
            <input v-model="form.idCard" class="h-[72rpx] text-[28rpx]" :maxlength="20" placeholder="可选，用于平台审核" />
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

        <form-section title="从业说明">
          <textarea
            v-model="form.note"
            class="w-full min-h-[180rpx] text-[28rpx] leading-[42rpx]"
            :maxlength="2000"
            placeholder="简单说明服务经验、可服务区域、可接单时间"
          />
        </form-section>

        <form-section title="资质照片">
          <upload-image-grid v-model="images" :max-count="6" biz-type="staff_application" :biz-id="application?.id" />
        </form-section>
      </view>
    </loading-state>

    <view class="fixed left-0 right-0 bottom-0 bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+24rpx)]">
      <button
        class="h-[88rpx] rounded-[22rpx] bg-[#1677FF] text-white text-[30rpx] flex items-center justify-center"
        :disabled="submitting || !canSubmit"
        @tap="submit"
      >
        {{ application?.status === 'approved' ? '进入师傅端' : submitting ? '提交中...' : '提交申请' }}
      </button>
    </view>
  </view>
</template>
