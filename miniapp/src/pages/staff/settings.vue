<script lang="ts" setup>
import { getStaffProfile, updateStaffProfile } from '@/api/staff'
import type { StaffProfileChangeRequest } from '@/api/types/staff'
import { useTokenStore } from '@/store/token'
import { DEFAULT_AVATAR_URL } from '@/store/user'
import { assertImageSize, getChooseImageErrorMessage, uploadImage } from '@/utils/uploadImage'

definePage({
  style: {
    navigationBarTitleText: '设置',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
  },
})

const tokenStore = useTokenStore()

const staffName = ref('')
const staffPhone = ref('')
const avatar = ref(DEFAULT_AVATAR_URL)
const verified = ref(false)
const editingName = ref(false)
const nameInput = ref('')
const saving = ref(false)
const profileChangeRequest = ref<StaffProfileChangeRequest | null>(null)

const serviceEntries = [
  { label: '服务区域', url: '/pages/staff/service-area' },
  { label: '接单设置', url: '/pages/staff/work-settings' },
  { label: '服务规则', url: '/pages/staff/service-rules' },
]

const otherEntries = [
  { label: '通知设置', url: '/pages/staff/notifications' },
  { label: '联系客服', url: '/pages/staff/contact-service' },
  { label: '关于我们', url: '/pages/staff/about' },
]

function applyProfile(profile: Awaited<ReturnType<typeof getStaffProfile>>) {
  staffName.value = profile.staffName
  staffPhone.value = profile.staffPhone || profile.regionText || ''
  avatar.value = profile.avatarDisplayUrl || profile.avatar || DEFAULT_AVATAR_URL
  verified.value = profile.verified
  profileChangeRequest.value = profile.profileChangeRequest || null
}

async function loadProfile() {
  try {
    const profile = await getStaffProfile()
    applyProfile(profile)
  }
  catch {
    uni.showToast({ icon: 'none', title: '加载失败' })
  }
}

function navigate(url: string) {
  uni.navigateTo({ url })
}

function onEditName() {
  nameInput.value = staffName.value || ''
  editingName.value = true
}

async function onSaveName() {
  const val = nameInput.value.trim()
  if (!val) {
    uni.showToast({ icon: 'none', title: '姓名不能为空' })
    return
  }
  if (val.length > 20) {
    uni.showToast({ icon: 'none', title: '姓名最多20个字符' })
    return
  }
  saving.value = true
  try {
    const profile = await updateStaffProfile({ staffName: val })
    applyProfile(profile)
    editingName.value = false
    uni.showToast({ icon: 'success', title: '已提交审核' })
  }
  catch {
    uni.showToast({ icon: 'none', title: '保存失败，请重试' })
  }
  finally {
    saving.value = false
  }
}

function onCancelName() {
  editingName.value = false
}

function onChooseAvatar() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      const filePath = res.tempFilePaths[0]
      const file = Array.isArray(res.tempFiles) ? res.tempFiles[0] : undefined
      if (!assertImageSize(file?.size))
        return
      saving.value = true
      try {
        const uploaded = await uploadImage({ filePath, bizType: 'staff_avatar' })
        const profile = await updateStaffProfile({ avatar: uploaded.url })
        applyProfile(profile)
        uni.showToast({ icon: 'success', title: '头像已提交审核' })
      }
      catch {
        uni.showToast({ icon: 'none', title: '头像上传失败，请重试' })
      }
      finally {
        saving.value = false
      }
    },
    fail: (err) => {
      const message = getChooseImageErrorMessage(err, '选择头像失败')
      if (message)
        uni.showToast({ icon: 'none', title: message })
    },
  })
}

function onLogout() {
  uni.showModal({
    title: '提示',
    content: '确定退出师傅端登录？',
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

function profileChangeStatusText(status?: string) {
  const map: Record<string, string> = {
    pending: '待后台复核',
    approved: '已通过',
    rejected: '已驳回',
    cancelled: '已取消',
  }
  return status ? map[status] || status : '暂无'
}

function profileChangeStatusClass(status?: string) {
  if (status === 'pending')
    return 'bg-[#FFF7ED] text-[#F59E0B]'
  if (status === 'approved')
    return 'bg-[#ECFDF5] text-[#10B981]'
  if (status === 'rejected')
    return 'bg-[#FEF2F2] text-[#EF4444]'
  return 'bg-[#F3F4F6] text-[#6B7280]'
}

function changedFieldText(fields?: string[]) {
  const map: Record<string, string> = {
    name: '姓名',
    avatarUrl: '头像',
    cityCode: '城市',
    skills: '技能',
    idCard: '身份证',
    applicationNote: '认证说明',
    applicationImages: '认证图片',
  }
  return (fields || []).map(field => map[field] || field).join('、') || '资料'
}

onShow(() => {
  void loadProfile()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[60rpx]">
    <view class="mx-4 mt-4 bg-white rounded-[24rpx] shadow-sm overflow-hidden">
      <view class="px-4 py-3">
        <text class="text-[28rpx] text-[#9CA3AF] font-500">个人信息</text>
      </view>

      <view class="flex items-center justify-between px-4 py-4 border-t border-[#F3F4F6]" @tap="onChooseAvatar">
        <text class="text-[30rpx] text-[#1F2937]">头像</text>
        <view class="flex items-center gap-3">
          <view class="w-[88rpx] h-[88rpx] rounded-full bg-[#FFE9EA] overflow-hidden">
            <image :src="avatar" class="w-full h-full" mode="aspectFill" />
          </view>
          <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
        </view>
      </view>

      <view class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]" @tap="onEditName">
        <text class="text-[30rpx] text-[#1F2937]">姓名</text>
        <view class="flex items-center gap-2">
          <text class="text-[28rpx] text-[#6B7280]">{{ staffName || '未设置' }}</text>
          <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
        </view>
      </view>

      <view class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]">
        <text class="text-[30rpx] text-[#1F2937]">手机号</text>
        <text class="text-[28rpx] text-[#6B7280]">{{ staffPhone || '未设置' }}</text>
      </view>

      <view class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]" @tap="navigate('/pages/staff/verification')">
        <text class="text-[30rpx] text-[#1F2937]">认证状态</text>
        <view class="flex items-center gap-2">
          <view
            class="px-[16rpx] py-[6rpx] rounded-full text-[24rpx]"
            :class="verified ? 'bg-[#ECFDF5] text-[#10B981]' : 'bg-[#FFF7ED] text-[#F59E0B]'"
          >
            {{ verified ? '已认证' : '未认证' }}
          </view>
          <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
        </view>
      </view>
    </view>

    <view v-if="profileChangeRequest" class="mx-4 mt-3 bg-white rounded-[24rpx] shadow-sm overflow-hidden">
      <view class="px-4 py-3 flex items-center justify-between">
        <text class="text-[28rpx] text-[#9CA3AF] font-500">资料变更</text>
        <view
          class="px-[16rpx] py-[6rpx] rounded-full text-[24rpx]"
          :class="profileChangeStatusClass(profileChangeRequest.status)"
        >
          {{ profileChangeStatusText(profileChangeRequest.status) }}
        </view>
      </view>
      <view class="px-4 py-[24rpx] border-t border-[#F3F4F6]">
        <text class="block text-[28rpx] text-[#1F2937]">
          变更项：{{ changedFieldText(profileChangeRequest.changedFields) }}
        </text>
        <text class="block mt-[10rpx] text-[24rpx] text-[#8A8F99]">
          申请编号：{{ profileChangeRequest.requestNo }}
        </text>
        <text
          v-if="profileChangeRequest.status === 'pending'"
          class="block mt-[10rpx] text-[24rpx] text-[#F59E0B]"
        >
          审核通过前，当前展示资料保持不变。
        </text>
        <text
          v-if="profileChangeRequest.status === 'rejected' && profileChangeRequest.rejectReason"
          class="block mt-[10rpx] text-[24rpx] text-[#EF4444]"
        >
          驳回原因：{{ profileChangeRequest.rejectReason }}
        </text>
      </view>
    </view>

    <view class="mx-4 mt-3 bg-white rounded-[24rpx] shadow-sm overflow-hidden">
      <view class="px-4 py-3">
        <text class="text-[28rpx] text-[#9CA3AF] font-500">服务设置</text>
      </view>
      <view
        v-for="item in serviceEntries"
        :key="item.label"
        class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]"
        @tap="navigate(item.url)"
      >
        <text class="text-[30rpx] text-[#1F2937]">{{ item.label }}</text>
        <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
      </view>
    </view>

    <view class="mx-4 mt-3 bg-white rounded-[24rpx] shadow-sm overflow-hidden">
      <view class="px-4 py-3">
        <text class="text-[28rpx] text-[#9CA3AF] font-500">其他</text>
      </view>
      <view
        v-for="item in otherEntries"
        :key="item.label"
        class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]"
        @tap="navigate(item.url)"
      >
        <text class="text-[30rpx] text-[#1F2937]">{{ item.label }}</text>
        <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
      </view>
    </view>

    <view class="mx-4 mt-6">
      <button
        class="w-full h-[88rpx] bg-white text-[30rpx] text-[#EF4444] rounded-[24rpx] center shadow-sm font-500"
        @tap="onLogout"
      >
        退出登录
      </button>
    </view>

    <view
      v-if="editingName"
      class="fixed inset-0 z-50 flex items-end"
      style="background: rgba(0,0,0,0.4)"
      @tap.self="onCancelName"
    >
      <view class="w-full bg-white rounded-t-[32rpx] px-6 pb-[env(safe-area-inset-bottom)] pt-6">
        <view class="flex items-center justify-between mb-5">
          <text class="text-[32rpx] text-[#1F2937] font-600">修改姓名</text>
          <text class="i-carbon-close text-[40rpx] text-[#9CA3AF]" @tap="onCancelName" />
        </view>
        <input
          v-model="nameInput"
          class="w-full h-[88rpx] px-4 bg-[#F5F7FA] rounded-[16rpx] text-[30rpx] text-[#1F2937]"
          placeholder="请输入姓名"
          placeholder-class="text-[#C4C8D0]"
          :maxlength="20"
          focus
        />
        <view class="mt-1 text-right">
          <text class="text-[24rpx] text-[#9CA3AF]">{{ nameInput.length }}/20</text>
        </view>
        <button
          class="mt-4 w-full h-[88rpx] bg-[#FF373D] text-white text-[30rpx] rounded-[20rpx] center font-500"
          :disabled="saving"
          @tap="onSaveName"
        >
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </view>
    </view>
  </view>
</template>
