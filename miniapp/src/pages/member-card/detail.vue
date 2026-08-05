<script lang="ts" setup>
import type { MemberCardServiceRule, PurchasableMemberCard } from '@/api/types/memberCards'
import { getPurchasableMemberCardDetail } from '@/api/memberCards'
import { useTokenStore } from '@/store/token'

definePage({
  style: {
    navigationBarTitleText: '会员卡详情',
  },
})

const tokenStore = useTokenStore()
const card = ref<PurchasableMemberCard | null>(null)
const loading = ref(true)
const cardId = ref(0)
const source = ref('')
const promotionKey = ref('')
const campaignId = ref('')

const activeRules = computed(() => (card.value?.serviceRuleList || [])
  .filter(rule => rule.status !== 0 && rule.serviceStatus !== 0))
const coverImage = computed(() => {
  if (card.value?.coverImageDisplayUrl || card.value?.coverImage)
    return card.value.coverImageDisplayUrl || card.value.coverImage || ''
  const rule = activeRules.value.find(item => item.serviceCoverImageDisplayUrl || item.serviceCoverImage)
  return rule?.serviceCoverImageDisplayUrl || rule?.serviceCoverImage || ''
})
const productDescription = computed(() => {
  if (card.value?.description)
    return card.value.description
  const rule = activeRules.value.find(item => item.serviceDescription)
  return rule?.serviceDescription || card.value?.serviceSummary || '按会员卡规则预约适用服务，实际核销分钟以预约确认页为准。'
})

function formatPrice(price: number) {
  return price % 1 === 0 ? price.toString() : price.toFixed(2)
}

function purchaseUrl() {
  const query = [
    `id=${encodeURIComponent(String(cardId.value))}`,
    source.value ? `source=${encodeURIComponent(source.value)}` : '',
    promotionKey.value ? `promotionKey=${encodeURIComponent(promotionKey.value)}` : '',
    campaignId.value ? `campaignId=${encodeURIComponent(campaignId.value)}` : '',
  ].filter(Boolean).join('&')
  return `/pages/member-card/purchase?${query}`
}

function activationText(item: PurchasableMemberCard) {
  return item.activationDeadlineDays
    ? `购买后 ${item.activationDeadlineDays} 天内完成首次预约激活`
    : '首次成功预约时激活'
}

function ruleModeText(rule: MemberCardServiceRule) {
  const allowed = Array.from(new Set((rule.allowedMinutes || []).filter(value => value > 0))).sort((a, b) => a - b)
  if (rule.consumeMode === 'half_service') {
    const choices = allowed.length ? allowed : [rule.consumeUnits / 2, rule.consumeUnits].filter(value => value > 0)
    return `支持半次核销，可选 ${choices.join('/')} 分钟`
  }
  if (rule.consumeMode === 'custom_minutes') {
    if (allowed.length)
      return `自定义核销，可选 ${allowed.join('/')} 分钟`
    return `自定义核销，最少 ${rule.minConsumeMinutes || rule.consumeUnits} 分钟`
  }
  return `每次固定核销 ${rule.consumeUnits} 分钟`
}

async function loadDetail() {
  if (!cardId.value) {
    loading.value = false
    card.value = null
    return
  }
  loading.value = true
  try {
    card.value = await getPurchasableMemberCardDetail(cardId.value)
  }
  catch {
    card.value = null
  }
  finally {
    loading.value = false
  }
}

function onNext() {
  if (!card.value || card.value.status === 0)
    return
  const target = purchaseUrl()
  if (!tokenStore.hasLogin) {
    uni.navigateTo({ url: `/pages/login/index?redirect=${encodeURIComponent(target)}` })
    return
  }
  uni.navigateTo({ url: target })
}

function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
    return
  }
  uni.switchTab({ url: '/pages/home/index' })
}

onLoad((query) => {
  const id = Number(query?.id || query?.cardId || 0)
  cardId.value = Number.isInteger(id) && id > 0 ? id : 0
  source.value = typeof query?.source === 'string' ? decodeURIComponent(query.source) : 'home_member_card'
  promotionKey.value = typeof query?.promotionKey === 'string' ? decodeURIComponent(query.promotionKey) : ''
  campaignId.value = typeof query?.campaignId === 'string' ? decodeURIComponent(query.campaignId) : ''
  void loadDetail()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA]">
    <loading-state :loading="loading">
      <view v-if="card" class="pb-[150rpx]">
        <view class="h-[400rpx] w-full bg-[#EAF3FF] flex items-center justify-center">
          <image v-if="coverImage" :src="coverImage" class="h-full w-full" mode="aspectFill" />
          <text v-else class="i-carbon-wallet text-[92rpx] text-[#FF373D]" />
        </view>

        <view class="relative mx-4 mt-[-40rpx] rounded-[16rpx] bg-white p-4">
          <text class="block text-[34rpx] font-600 leading-[46rpx] text-gray-800">{{ card.name }}</text>
          <text class="mt-2 block text-[26rpx] leading-[38rpx] text-gray-500">{{ productDescription }}</text>
          <view class="mt-3 flex items-baseline">
            <text class="text-[24rpx] font-600 text-[#EF4444]">¥</text>
            <text class="text-[40rpx] font-700 text-[#EF4444]">{{ formatPrice(card.price) }}</text>
            <text class="ml-1 text-[23rpx] text-gray-400">/ 张</text>
          </view>
        </view>

        <form-section title="权益内容">
          <view class="info-row">
            <text class="info-label">总权益</text>
            <text class="info-value">{{ card.totalUnits }} 分钟</text>
          </view>
          <view class="info-row">
            <text class="info-label">权益状态</text>
            <text class="info-value">支付成功后待激活</text>
          </view>
          <view class="info-row">
            <text class="info-label">核销口径</text>
            <text class="info-value">按分钟核销</text>
          </view>
        </form-section>

        <form-section title="适用服务与核销规则">
          <view v-if="activeRules.length">
            <view
              v-for="(rule, index) in activeRules"
              :key="rule.id"
              class="rule-row"
              :class="index === activeRules.length - 1 ? 'border-b-0' : ''"
            >
              <view class="min-w-0 flex-1">
                <text class="block text-[28rpx] font-600 leading-[38rpx] text-gray-800">{{ rule.serviceName }}</text>
                <text class="mt-1 block text-[25rpx] leading-[36rpx] text-gray-500">{{ ruleModeText(rule) }}</text>
                <text v-if="rule.minConsumeMinutes" class="mt-1 block text-[23rpx] leading-[32rpx] text-gray-400">
                  最小核销单位 {{ rule.minConsumeMinutes }} 分钟
                </text>
              </view>
            </view>
          </view>
          <text v-else class="text-[27rpx] leading-[42rpx] text-gray-600">
            {{ card.serviceSummary || '适用服务以下单时可选项目为准' }}
          </text>
        </form-section>

        <form-section title="激活与有效期">
          <view class="timeline-row">
            <view class="timeline-index">
              1
            </view>
            <text class="timeline-text">支付成功后发放未激活会员卡</text>
          </view>
          <view class="timeline-row">
            <view class="timeline-index">
              2
            </view>
            <text class="timeline-text">{{ activationText(card) }}</text>
          </view>
          <view class="timeline-row">
            <view class="timeline-index">
              3
            </view>
            <text class="timeline-text">激活后 {{ card.validityDays }} 天内有效，到期后权益结束</text>
          </view>
        </form-section>

        <form-section title="购买与使用流程">
          <text class="text-[27rpx] leading-[44rpx] text-gray-700">
            购买会员卡不会直接生成师傅任务。支付并发卡后，请从“我的会员卡”选择权益预约服务；预约成功后才会生成服务订单并通知师傅。
          </text>
        </form-section>

        <form-section v-if="card.purchaseNotice" title="商品购买须知">
          <text class="text-[27rpx] leading-[44rpx] text-gray-700">
            {{ card.purchaseNotice }}
          </text>
        </form-section>

        <form-section title="购买须知">
          <text class="text-[27rpx] leading-[44rpx] text-gray-700">
            预约时按所选服务规则冻结分钟，服务完成后按实际履约结果核销并释放未使用的冻结分钟。退款范围和处理结果以订单售后审核为准。
          </text>
        </form-section>
      </view>

      <empty-state v-else type="empty" title="会员卡不存在" description="该会员卡已下架或暂不可购买" />
    </loading-state>

    <bottom-action-bar
      v-if="card"
      :price="card.price"
      price-label="商品价格"
      primary-text="下一步"
      secondary-text="返回"
      :primary-disabled="card.status === 0"
      @primary="onNext"
      @secondary="goBack"
    />
  </view>
</template>

<style scoped lang="scss">
.info-row {
  min-height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  border-bottom: 1rpx solid #f1f5f9;
}

.info-row:last-child {
  border-bottom: 0;
}

.info-label {
  flex-shrink: 0;
  color: #64748b;
  font-size: 26rpx;
  line-height: 36rpx;
}

.info-value {
  min-width: 0;
  color: #1f2937;
  font-size: 27rpx;
  line-height: 38rpx;
  font-weight: 600;
  text-align: right;
}

.rule-row {
  padding: 18rpx 0;
  border-bottom: 1rpx solid #f1f5f9;
}

.timeline-row {
  min-height: 66rpx;
  display: flex;
  align-items: flex-start;
}

.timeline-index {
  width: 44rpx;
  height: 44rpx;
  flex-shrink: 0;
  border-radius: 50%;
  background: #eaf3ff;
  color: #1677ff;
  font-size: 24rpx;
  line-height: 44rpx;
  font-weight: 600;
  text-align: center;
}

.timeline-text {
  min-width: 0;
  margin-left: 20rpx;
  color: #374151;
  font-size: 27rpx;
  line-height: 42rpx;
}
</style>
