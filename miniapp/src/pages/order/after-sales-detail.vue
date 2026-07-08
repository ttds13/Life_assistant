<script lang="ts" setup>
import { addAfterSalesMessage, closeAfterSalesTicket, getAfterSalesTicket, getOrderAfterSales } from '@/api/afterSales'
import type { AfterSalesTicket } from '@/api/types/afterSales'
import type { UploadImageItem } from '@/api/types/staff'

definePage({
  style: {
    navigationBarTitleText: '售后详情',
  },
})

const ticketId = ref(0)
const orderId = ref(0)
const ticket = ref<AfterSalesTicket | null>(null)
const loading = ref(false)
const submitting = ref(false)
const closing = ref(false)
const message = ref('')
const images = ref<UploadImageItem[]>([])

const statusMeta = computed(() => {
  const status = ticket.value?.status || ''
  const map: Record<string, { label: string, className: string }> = {
    open: { label: '待处理', className: 'bg-[#FFF7ED] text-[#AD6800]' },
    pending: { label: '处理中', className: 'bg-[#EAF3FF] text-[#1677FF]' },
    resolved: { label: '已解决', className: 'bg-[#ECFDF3] text-[#16A34A]' },
    rejected: { label: '已拒绝', className: 'bg-[#FEF2F2] text-[#EF4444]' },
    closed: { label: '已关闭', className: 'bg-[#F3F4F6] text-[#6B7280]' },
  }
  return map[status] || { label: status || '未知', className: 'bg-[#F3F4F6] text-[#6B7280]' }
})

const canReply = computed(() => ['open', 'pending'].includes(ticket.value?.status || ''))
const canSubmit = computed(() =>
  canReply.value
  && !!message.value.trim()
  && !images.value.some(item => item.status === 'uploading'),
)

function typeLabel(type: string) {
  const map: Record<string, string> = {
    refund: '退款争议',
    service_quality: '服务质量',
    reschedule: '改期履约',
    complaint: '投诉反馈',
    other: '其他问题',
  }
  return map[type] || type
}

async function loadTicket() {
  loading.value = true
  try {
    if (ticketId.value) {
      ticket.value = await getAfterSalesTicket(ticketId.value)
      return
    }
    if (orderId.value) {
      const tickets = await getOrderAfterSales(orderId.value)
      ticket.value = tickets[0] || null
      ticketId.value = ticket.value?.id || 0
    }
  }
  finally {
    loading.value = false
  }
}

function imageUrls() {
  return images.value
    .filter(item => item.status !== 'error')
    .map(item => item.ossUrl || item.url)
    .filter(Boolean)
}

async function submitMessage() {
  if (!ticket.value || submitting.value)
    return
  if (!canSubmit.value) {
    uni.showToast({ icon: 'none', title: '请填写补充说明' })
    return
  }
  submitting.value = true
  try {
    ticket.value = await addAfterSalesMessage(ticket.value.id, {
      content: message.value.trim(),
      images: imageUrls(),
    })
    message.value = ''
    images.value = []
    uni.showToast({ icon: 'success', title: '已提交' })
  }
  finally {
    submitting.value = false
  }
}

function closeTicket() {
  if (!ticket.value || closing.value || !canReply.value)
    return
  uni.showModal({
    title: '关闭售后',
    content: '确认关闭当前售后工单吗？',
    success: async (res) => {
      if (!res.confirm || !ticket.value)
        return
      closing.value = true
      try {
        ticket.value = await closeAfterSalesTicket(ticket.value.id)
        uni.showToast({ icon: 'success', title: '已关闭' })
      }
      finally {
        closing.value = false
      }
    },
  })
}

function preview(images: string[], current: string) {
  if (!images.length)
    return
  uni.previewImage({ urls: images, current })
}

onLoad((query) => {
  ticketId.value = Number(query?.id || 0)
  orderId.value = Number(query?.orderId || 0)
  void loadTicket()
})

onShow(() => {
  if (ticketId.value || orderId.value)
    void loadTicket()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[60rpx] pt-1">
    <loading-state :loading="loading">
      <view v-if="ticket">
        <view class="mx-4 mt-3 rounded-[16rpx] bg-white p-4">
          <view class="flex items-center justify-between">
            <text class="text-[34rpx] text-[#1F2937] font-700">{{ ticket.title }}</text>
            <view class="px-3 h-[48rpx] rounded-full flex items-center" :class="statusMeta.className">
              <text class="text-[24rpx]">{{ statusMeta.label }}</text>
            </view>
          </view>
          <view class="mt-3 flex">
            <text class="w-[150rpx] text-[26rpx] text-gray-400">工单号</text>
            <text class="flex-1 text-[26rpx] text-gray-700">{{ ticket.ticketNo }}</text>
          </view>
          <view class="mt-2 flex">
            <text class="w-[150rpx] text-[26rpx] text-gray-400">订单号</text>
            <text class="flex-1 text-[26rpx] text-gray-700">{{ ticket.orderNo }}</text>
          </view>
          <view class="mt-2 flex">
            <text class="w-[150rpx] text-[26rpx] text-gray-400">类型</text>
            <text class="flex-1 text-[26rpx] text-gray-700">{{ typeLabel(ticket.type) }}</text>
          </view>
        </view>

        <form-section title="处理进度">
          <view v-for="item in ticket.messages || []" :key="item.id" class="mb-4 last:mb-0">
            <view class="flex items-center justify-between">
              <text class="text-[26rpx] font-600" :class="item.senderType === 'admin' ? 'text-[#1677FF]' : 'text-[#1F2937]'">
                {{ item.senderType === 'admin' ? '平台回复' : '我的说明' }}
              </text>
              <text class="text-[22rpx] text-gray-400">{{ item.createdAt }}</text>
            </view>
            <text class="block mt-2 text-[26rpx] leading-[40rpx] text-gray-700">{{ item.content }}</text>
            <view v-if="item.images && item.images.length" class="mt-3 flex flex-wrap gap-2">
              <image
                v-for="img in item.images"
                :key="img"
                :src="img"
                class="w-[150rpx] h-[150rpx] rounded-[12rpx] bg-[#F3F4F6]"
                mode="aspectFill"
                @tap="preview(item.images, img)"
              />
            </view>
          </view>
        </form-section>

        <form-section v-if="canReply" title="补充说明">
          <textarea
            v-model="message"
            class="w-full min-h-[160rpx] text-[28rpx] leading-[42rpx]"
            :maxlength="2000"
            placeholder="补充问题说明或处理诉求"
          />
          <view class="mt-3">
            <upload-image-grid v-model="images" :max-count="6" biz-type="after_sales_image" :biz-id="ticket?.id || ticketId" />
          </view>
          <button
            class="mt-4 h-[80rpx] rounded-[20rpx] bg-[#1677FF] text-white text-[28rpx] flex items-center justify-center"
            :disabled="submitting || !canSubmit"
            @tap="submitMessage"
          >
            {{ submitting ? '提交中...' : '提交补充' }}
          </button>
          <button
            class="mt-3 h-[76rpx] rounded-[20rpx] bg-[#F3F4F6] text-[#6B7280] text-[28rpx] flex items-center justify-center"
            :disabled="closing"
            @tap="closeTicket"
          >
            {{ closing ? '关闭中...' : '关闭工单' }}
          </button>
        </form-section>
      </view>
      <empty-state v-else title="暂无售后工单" />
    </loading-state>
  </view>
</template>
