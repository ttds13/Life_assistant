<script lang="ts" setup>
import { createOrderAfterSales } from '@/api/afterSales'
import { getOrderDetail } from '@/api/orders'
import type { AfterSalesTicketType } from '@/api/types/afterSales'
import type { OrderDetail } from '@/api/types/orders'
import type { UploadImageItem } from '@/api/types/staff'

definePage({
  style: {
    navigationBarTitleText: '申请售后',
  },
})

const orderId = ref(0)
const order = ref<OrderDetail | null>(null)
const loading = ref(false)
const submitting = ref(false)
const type = ref<AfterSalesTicketType>('service_quality')
const title = ref('')
const description = ref('')
const contactPhone = ref('')
const images = ref<UploadImageItem[]>([])

const typeOptions: Array<{ label: string, value: AfterSalesTicketType }> = [
  { label: '服务质量', value: 'service_quality' },
  { label: '退款争议', value: 'refund' },
  { label: '改期履约', value: 'reschedule' },
  { label: '投诉反馈', value: 'complaint' },
  { label: '其他问题', value: 'other' },
]

const canSubmit = computed(() =>
  !!title.value.trim()
  && description.value.trim().length >= 5
  && !images.value.some(item => item.status === 'uploading'),
)

async function loadOrder() {
  if (!orderId.value)
    return
  loading.value = true
  try {
    order.value = await getOrderDetail(orderId.value)
    contactPhone.value = order.value.address?.contactPhone || ''
    if (order.value.latestTicket?.id && ['open', 'pending'].includes(order.value.latestTicket.status)) {
      uni.redirectTo({ url: `/pages/order/after-sales-detail?id=${order.value.latestTicket.id}` })
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

async function submit() {
  if (!orderId.value || submitting.value)
    return
  if (!canSubmit.value) {
    uni.showToast({ icon: 'none', title: '请补全售后信息' })
    return
  }

  submitting.value = true
  try {
    const ticket = await createOrderAfterSales(orderId.value, {
      type: type.value,
      title: title.value.trim(),
      description: description.value.trim(),
      contactPhone: contactPhone.value.trim() || undefined,
      images: imageUrls(),
    })
    uni.showToast({ icon: 'success', title: '已提交' })
    uni.redirectTo({ url: `/pages/order/after-sales-detail?id=${ticket.id}` })
  }
  finally {
    submitting.value = false
  }
}

onLoad((query) => {
  orderId.value = Number(query?.orderId || query?.id || 0)
  void loadOrder()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[150rpx] pt-1">
    <loading-state :loading="loading">
      <view v-if="order">
        <form-section title="订单信息">
          <view class="flex py-2">
            <text class="w-[150rpx] text-[26rpx] text-gray-400">订单号</text>
            <text class="flex-1 text-[26rpx] text-gray-700">{{ order.orderNo }}</text>
          </view>
          <view class="flex py-2">
            <text class="w-[150rpx] text-[26rpx] text-gray-400">服务</text>
            <text class="flex-1 text-[26rpx] text-gray-700">{{ order.serviceName }}</text>
          </view>
        </form-section>

        <form-section title="售后类型" required>
          <view class="flex flex-wrap gap-2">
            <view
              v-for="item in typeOptions"
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

        <form-section title="问题标题" required>
          <input v-model="title" class="h-[72rpx] text-[28rpx]" :maxlength="128" placeholder="请简要描述问题" />
        </form-section>

        <form-section title="问题描述" required>
          <textarea
            v-model="description"
            class="w-full min-h-[180rpx] text-[28rpx] leading-[42rpx]"
            :maxlength="2000"
            placeholder="请说明遇到的问题、期望处理方式"
          />
        </form-section>

        <form-section title="联系电话">
          <input v-model="contactPhone" class="h-[72rpx] text-[28rpx]" type="number" :maxlength="11" placeholder="便于平台联系你" />
        </form-section>

        <form-section title="图片凭证">
          <upload-image-grid v-model="images" :max-count="6" biz-type="after_sales_image" :biz-id="orderId" />
        </form-section>
      </view>
      <empty-state v-else title="订单不存在" />
    </loading-state>

    <view class="fixed left-0 right-0 bottom-0 bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+24rpx)]">
      <button
        class="h-[88rpx] rounded-[22rpx] bg-[#1677FF] text-white text-[30rpx] flex items-center justify-center"
        :disabled="submitting || !canSubmit"
        @tap="submit"
      >
        {{ submitting ? '提交中...' : '提交售后' }}
      </button>
    </view>
  </view>
</template>
