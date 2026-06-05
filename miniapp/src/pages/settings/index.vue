<script lang="ts" setup>
import { updateProfile } from '@/api/auth'
import { useTokenStore } from '@/store/token'
import { useUserStore } from '@/store/user'
import { clearDevStaffSession } from '@/utils/devStaffStorage'

definePage({
  style: {
    navigationBarTitleText: '设置',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
  },
})

const tokenStore = useTokenStore()
const userStore = useUserStore()

const mockLoginFlagKey = 'life-assistant:mock-login'
const editingNickname = ref(false)
const nicknameInput = ref('')
const saving = ref(false)

const displayName = computed(() =>
  userStore.userInfo.nickname || (userStore.userInfo.userId > 0 ? `用户${userStore.userInfo.userId}` : '微信用户'),
)

const displayPhone = computed(() =>
  userStore.userInfo.phone || '未绑定手机号',
)

function onEditNickname() {
  if (!tokenStore.hasLogin) {
    uni.navigateTo({ url: '/pages/login/index' })
    return
  }
  nicknameInput.value = userStore.userInfo.nickname || ''
  editingNickname.value = true
}

async function onSaveNickname() {
  const val = nicknameInput.value.trim()
  if (!val) {
    uni.showToast({ icon: 'none', title: '昵称不能为空' })
    return
  }
  if (val.length > 20) {
    uni.showToast({ icon: 'none', title: '昵称最多20个字符' })
    return
  }
  saving.value = true
  try {
    const profile = await updateProfile({ nickname: val })
    userStore.setFromProfile(profile)
    editingNickname.value = false
    uni.showToast({ icon: 'success', title: '保存成功' })
  }
  catch {
    uni.showToast({ icon: 'none', title: '保存失败，请重试' })
  }
  finally {
    saving.value = false
  }
}

function onCancelNickname() {
  editingNickname.value = false
}

async function onChooseAvatar() {
  if (!tokenStore.hasLogin) {
    uni.navigateTo({ url: '/pages/login/index' })
    return
  }
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
        const profile = await updateProfile({ avatar: uploadResult })
        userStore.setFromProfile(profile)
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

function onLogout() {
  uni.showModal({
    title: '提示',
    content: '确定退出登录？',
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

function onTodo(title: string) {
  uni.showToast({ icon: 'none', title: `${title}待完善` })
}
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

      <!-- 昵称 -->
      <view class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]" @tap="onEditNickname">
        <text class="text-[30rpx] text-[#1F2937]">昵称</text>
        <view class="flex items-center gap-2">
          <text class="text-[28rpx] text-[#6B7280]">{{ displayName }}</text>
          <text class="i-carbon-chevron-right text-[32rpx] text-[#C4C8D0]" />
        </view>
      </view>

      <!-- 手机号 -->
      <view class="flex items-center justify-between px-4 py-[28rpx] border-t border-[#F3F4F6]">
        <text class="text-[30rpx] text-[#1F2937]">手机号</text>
        <view class="flex items-center gap-2">
          <text class="text-[28rpx] text-[#6B7280]">{{ displayPhone }}</text>
        </view>
      </view>
    </view>

    <!-- 其他设置 -->
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

    <!-- 退出登录 -->
    <view v-if="tokenStore.hasLogin" class="mx-4 mt-6">
      <button
        class="w-full h-[88rpx] bg-white text-[30rpx] text-[#EF4444] rounded-[24rpx] center shadow-sm font-500"
        @tap="onLogout"
      >
        退出登录
      </button>
    </view>

    <!-- 编辑昵称弹窗 -->
    <view
      v-if="editingNickname"
      class="fixed inset-0 z-50 flex items-end"
      style="background: rgba(0,0,0,0.4)"
      @tap.self="onCancelNickname"
    >
      <view class="w-full bg-white rounded-t-[32rpx] px-6 pb-[env(safe-area-inset-bottom)] pt-6">
        <view class="flex items-center justify-between mb-5">
          <text class="text-[32rpx] text-[#1F2937] font-600">修改昵称</text>
          <text class="i-carbon-close text-[40rpx] text-[#9CA3AF]" @tap="onCancelNickname" />
        </view>
        <input
          v-model="nicknameInput"
          class="w-full h-[88rpx] px-4 bg-[#F5F7FA] rounded-[16rpx] text-[30rpx] text-[#1F2937]"
          placeholder="请输入昵称"
          placeholder-class="text-[#C4C8D0]"
          :maxlength="20"
          focus
        />
        <view class="mt-1 text-right">
          <text class="text-[24rpx] text-[#9CA3AF]">{{ nicknameInput.length }}/20</text>
        </view>
        <button
          class="mt-4 w-full h-[88rpx] bg-[#1677FF] text-white text-[30rpx] rounded-[20rpx] center font-500"
          :disabled="saving"
          @tap="onSaveNickname"
        >
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </view>
    </view>
  </view>
</template>
