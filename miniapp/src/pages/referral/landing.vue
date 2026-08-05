<script lang="ts" setup>
import { bindReferral } from '@/api/referrals'
import { useTokenStore } from '@/store/token'

definePage({
  style: { navigationBarTitleText: '好友邀请', navigationBarBackgroundColor: '#ffffff', navigationBarTextStyle: 'black' },
})

const tokenStore = useTokenStore()
const loading = ref(true)
const message = ref('正在确认邀请信息')

async function bindInvite(token: string) {
  uni.setStorageSync('pendingReferralInviteToken', token)
  if (!tokenStore.hasLogin) {
    message.value = '请先登录以接受邀请'
    loading.value = false
    uni.navigateTo({ url: `/pages/login/index?redirect=${encodeURIComponent('/pages/referral/index')}` })
    return
  }
  try {
    await bindReferral({ source: 'link', inviteToken: token })
    uni.removeStorageSync('pendingReferralInviteToken')
    message.value = '邀请关系已绑定'
    setTimeout(() => uni.redirectTo({ url: '/pages/referral/index' }), 700)
  }
  catch {
    uni.removeStorageSync('pendingReferralInviteToken')
    message.value = '该邀请暂时无法绑定'
  }
  finally {
    loading.value = false
  }
}

onLoad((query) => {
  const token = typeof query?.token === 'string' ? decodeURIComponent(query.token) : ''
  if (!token) {
    loading.value = false
    message.value = '邀请链接无效'
    return
  }
  void bindInvite(token)
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] px-6 flex items-center justify-center">
    <view class="w-full text-center">
      <view v-if="loading" class="w-[64rpx] h-[64rpx] mx-auto rounded-full border-[6rpx] border-[#DCEBFF] border-t-[#1677FF] animate-spin" />
      <text class="block mt-6 text-[34rpx] text-[#1F2937] font-700">{{ message }}</text>
      <text class="block mt-3 text-[26rpx] text-[#8A94A6]">完成合格服务订单后，邀请人将获得奖励积分</text>
    </view>
  </view>
</template>
