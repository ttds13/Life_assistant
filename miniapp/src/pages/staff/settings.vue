<script lang="ts" setup>
import { getStaffProfile, updateStaffProfile } from '@/api/staff'
import { useTokenStore } from '@/store/token'
import { clearDevStaffSession } from '@/utils/devStaffStorage'

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
const avatar = ref('/static/images/default-avatar.png')
const verified = ref(false)
const loading = ref(false)
const editingName = ref(false)
const nameInput = ref('')
const saving = ref(false)
const mockLoginFlagKey = 'life-assistant:mock-login'

function applyProfile(profile: Awaited<ReturnType<typeof getStaffProfile>>) {
  staffName.value = profile.staffName
  staffPhone.value = profile.staffPhone || profile.regionText || ''
  avatar.value = profile.avatar || '/static/images/default-avatar.png'
  verified.value = profile.verified
}

async function loadProfile() {
  loading.value = true
  try {
    const profile = await getStaffProfile()
    applyProfile(profile)
  }
  catch {
    uni.showToast({ icon: 'none', title: '加载失败' })
  }
  finally {
    loading.value = false
  }
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
    uni.showToast({ icon: 'success', title: '保存成功' })
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

async function onChooseAvatar() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      const filePath = res.tempFilePaths[0]
      saving.value = true
      try {
        const uploadResult = await new Promise<string>((resolve, reject) => {
          uni.uploadFile({
            url: `${import.meta.env.VITE_SERVER_BASEURL}/upload/image`,
            filePath,
            name: 'file',
            success: (uploadRes) => {
              try {
                const data = JSON.parse(uploadRes.data)
                resolve(data.url || data.data?.url || '')
              }
              catch {
                reject(new Error('解析上传结果失败'))
              }
            },
            fail: reject,
          })
        })
        if (!uploadResult) throw new Error('上传失败')
        const profile = await updateStaffProfile({ avatar: uploadResult })
        applyProfile(profile)
        uni.showToast({ icon: 'success', title: '头像已更新' })
      }
      catch {
        uni.showToast({ icon: 'none', title: '头像上传失败，请重试' })
      }
      finally {
        saving.value = false
      }
    },
  })
}

function onTodo(title: string) {
  uni.showToast({ icon: 'none', title: `${title}待完善` })
}

function onLogout() {
  uni.showModal({
    title: '提示',
    content: '确定退出师傅端登录？',
    confirmColor: '#EF4444',
    success: (res) => {
      if (res.confirm) {
        tokenStore.logout()
        clearDevStaffSession()
        uni.removeStorageSync(mockLoginFlagKey)
        uni.showToast({ icon: 'success', title: '已退出' })
        setTimeout(() => {
          uni.reLaunch({ url: '/pages/home/index' })
        }, 800)
      }
    },
  })
}

onShow(() => {
  loadProfile()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[60rpx]">
    <!-- 个人信息卡片 -->
    <view class="mx-4 mt-4 bg-white rounded-[24rpx] shadow-sm overflow-hidden">
      <view class="px-4 py-3">
        <text class="text-[28rpx] text-[#9CA3AF] font-500">个人信息</text>
      </view>

      <!-- 头像 -->
      <view class="flex items-center justify-between px-4 py-4 border-t border-[#F3F4F6]" @tap="onChooseAvatar">
        <text class="text-[30rpx] text-[#1F2937]">头像</text>
        <view class="flex items-center gap-3">
          <view class="w-[88rpx] h-[88rpx] rounded-full bg-[#FFE9EA] overflow-hidden">
            <image :src="avatar" class="w-full h-full" mode="aspectFill" />
          </view>
          <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
        </view>
      </view>

      <!-- 姓名 -->
      <view class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]" @tap="onEditName">
        <text class="text-[30rpx] text-[#1F2937]">姓名</text>
        <view class="flex items-center gap-2">
          <text class="text-[28rpx] text-[#6B7280]">{{ staffName || '未设置' }}</text>
          <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
        </view>
      </view>

      <!-- 手机号 -->
      <view class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]">
        <text class="text-[30rpx] text-[#1F2937]">手机号</text>
        <view class="flex items-center gap-2">
          <text class="text-[28rpx] text-[#6B7280]">{{ staffPhone || '未设置' }}</text>
        </view>
      </view>

      <!-- 认证状态 -->
      <view class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]" @tap="onTodo('资料认证')">
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

    <!-- 服务设置 -->
    <view class="mx-4 mt-3 bg-white rounded-[24rpx] shadow-sm overflow-hidden">
      <view class="px-4 py-3">
        <text class="text-[28rpx] text-[#9CA3AF] font-500">服务设置</text>
      </view>
      <view class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]" @tap="onTodo('服务区域')">
        <text class="text-[30rpx] text-[#1F2937]">服务区域</text>
        <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
      </view>
      <view class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]" @tap="onTodo('接单设置')">
        <text class="text-[30rpx] text-[#1F2937]">接单设置</text>
        <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
      </view>
      <view class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]" @tap="onTodo('服务规则')">
        <text class="text-[30rpx] text-[#1F2937]">服务规则</text>
        <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
      </view>
    </view>

    <!-- 其他 -->
    <view class="mx-4 mt-3 bg-white rounded-[24rpx] shadow-sm overflow-hidden">
      <view class="px-4 py-3">
        <text class="text-[28rpx] text-[#9CA3AF] font-500">其他</text>
      </view>
      <view class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]" @tap="onTodo('通知设置')">
        <text class="text-[30rpx] text-[#1F2937]">通知设置</text>
        <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
      </view>
      <view class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]" @tap="onTodo('联系客服')">
        <text class="text-[30rpx] text-[#1F2937]">联系客服</text>
        <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
      </view>
      <view class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]" @tap="onTodo('关于我们')">
        <text class="text-[30rpx] text-[#1F2937]">关于我们</text>
        <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
      </view>
    </view>

    <!-- 退出登录 -->
    <view class="mx-4 mt-6">
      <button
        class="w-full h-[88rpx] bg-white text-[30rpx] text-[#EF4444] rounded-[24rpx] center shadow-sm font-500"
        @tap="onLogout"
      >
        退出登录
      </button>
    </view>

    <!-- 编辑姓名弹窗 -->
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
