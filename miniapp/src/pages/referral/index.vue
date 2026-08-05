<script lang="ts" setup>
import { bindReferral, getMyReferralInvitation, getMyReferralRewards, getMyReferralSummary } from '@/api/referrals'
import type { ReferralInvitation, ReferralReward, ReferralSummary } from '@/api/types/referrals'

definePage({
  style: { navigationBarTitleText: '邀请好友', navigationBarBackgroundColor: '#F5F7FA', navigationBarTextStyle: 'black', enablePullDownRefresh: true, enableShareAppMessage: true },
})

const loading = ref(false)
const binding = ref(false)
const invitation = ref<ReferralInvitation>({ shareCode: '', inviteToken: '', sharePath: '', expiresAt: null })
const summary = ref<ReferralSummary>({ invitedCount: 0, activeInvitedCount: 0, rewardCount: 0, rewardPoints: 0, rewardValue: 0 })
const rewards = ref<ReferralReward[]>([])
const shareCodeInput = ref('')

async function load() {
  loading.value = true
  try {
    const [nextInvitation, nextSummary, nextRewards] = await Promise.all([
      getMyReferralInvitation(),
      getMyReferralSummary(),
      getMyReferralRewards({ page: 1, pageSize: 20 }),
    ])
    invitation.value = nextInvitation
    summary.value = nextSummary
    rewards.value = nextRewards.items
  }
  finally { loading.value = false }
}

function copy(value: string, title: string) {
  if (!value) return
  uni.setClipboardData({ data: value, success: () => uni.showToast({ icon: 'success', title }) })
}

async function bindShareCode() {
  const code = shareCodeInput.value.trim().toUpperCase()
  if (!code) { uni.showToast({ icon: 'none', title: '请输入分享码' }); return }
  binding.value = true
  try {
    await bindReferral({ source: 'share_code', shareCode: code })
    uni.showToast({ icon: 'success', title: '邀请关系已绑定' })
    shareCodeInput.value = ''
    await load()
  }
  finally { binding.value = false }
}

function formatTime(value: string) { return value ? value.replace('T', ' ').slice(0, 16) : '-' }
function sourceText(item: ReferralReward) { return item.sourceUser?.nickname || item.sourceUser?.phone || '新用户订单' }

onShow(() => { void load() })
onPullDownRefresh(async () => { try { await load() } finally { uni.stopPullDownRefresh() } })
onShareAppMessage(() => ({ title: '邀请你体验生活助手', path: invitation.value.sharePath || '/pages/home/index' }))
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[64rpx] pt-1">
    <view class="mx-4 mt-3 rounded-[24rpx] bg-[#1677FF] px-5 py-5 text-white">
      <text class="block text-[28rpx] opacity-88">邀请好友，完成服务后获得积分奖励</text>
      <view class="mt-5 flex">
        <view class="flex-1"><text class="block text-[46rpx] font-800">{{ summary.rewardPoints }}</text><text class="mt-1 block text-[22rpx] opacity-80">累计奖励积分</text></view>
        <view class="w-[1rpx] bg-white/25" />
        <view class="flex-1 pl-5"><text class="block text-[46rpx] font-800">{{ summary.invitedCount }}</text><text class="mt-1 block text-[22rpx] opacity-80">已邀请好友</text></view>
      </view>
    </view>

    <view class="mx-4 mt-3 rounded-[18rpx] bg-white px-4 py-4">
      <view class="flex items-center justify-between"><text class="text-[32rpx] text-[#1F2937] font-700">我的分享码</text><text class="text-[22rpx] text-[#9CA3AF]">好友注册后填写</text></view>
      <view class="mt-4 flex items-center rounded-[14rpx] bg-[#F5F7FA] px-4 py-3"><text class="flex-1 text-[38rpx] tracking-[2rpx] text-[#1677FF] font-800">{{ invitation.shareCode || '--' }}</text><text class="text-[26rpx] text-[#1677FF]" @tap="copy(invitation.shareCode, '分享码已复制')">复制</text></view>
      <view class="mt-3 flex gap-3"><button class="flex-1 h-[74rpx] rounded-[14rpx] bg-[#EAF3FF] text-[26rpx] text-[#1677FF]" @tap="copy(invitation.sharePath, '邀请链接已复制')">复制邀请链接</button><button class="flex-1 h-[74rpx] rounded-[14rpx] bg-[#1677FF] text-[26rpx] text-white" @tap="copy(invitation.shareCode, '请发送给好友')">发送分享码</button></view>
    </view>

    <view class="mx-4 mt-3 rounded-[18rpx] bg-white px-4 py-4">
      <text class="block text-[32rpx] text-[#1F2937] font-700">填写好友分享码</text>
      <view class="mt-4 flex gap-3"><input v-model="shareCodeInput" class="flex-1 h-[76rpx] rounded-[14rpx] bg-[#F5F7FA] px-3 text-[28rpx] text-[#1F2937]" placeholder="例如 LIFE-7K3M9Q" /><button class="h-[76rpx] rounded-[14rpx] bg-[#1677FF] px-5 text-[26rpx] text-white" :loading="binding" @tap="bindShareCode">绑定</button></view>
    </view>

    <view class="mx-4 mt-3 rounded-[18rpx] bg-white overflow-hidden"><view class="px-4 py-4 border-b border-[#F3F4F6]"><text class="text-[32rpx] text-[#1F2937] font-700">奖励记录</text></view><view v-if="rewards.length"><view v-for="item in rewards" :key="item.id" class="flex items-center justify-between px-4 py-4 border-b border-[#F3F4F6] last:border-b-0"><view class="min-w-0 flex-1"><text class="block truncate text-[28rpx] text-[#1F2937] font-700">{{ sourceText(item) }}</text><text class="block mt-1 text-[22rpx] text-[#9CA3AF]">{{ formatTime(item.createdAt) }}</text></view><view class="text-right"><text class="block text-[32rpx] text-[#16A34A] font-800">+{{ item.points }}</text><text class="block mt-1 text-[22rpx] text-[#9CA3AF]">约 ¥{{ item.rewardValue.toFixed(2) }}</text></view></view></view><view v-else class="px-4 py-12 text-center"><text class="text-[26rpx] text-[#9CA3AF]">暂无邀请奖励记录</text></view></view>
  </view>
</template>
