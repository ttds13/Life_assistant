<script lang="ts" setup>
import type { UploadImageItem } from '@/api/types/staff'
import { getStaffTaskDetail, uploadStaffOrderPhotos } from '@/api/staff'

definePage({
  style: {
    navigationBarTitleText: '上传照片',
  },
})

const taskId = ref(0)
const photos = ref<UploadImageItem[]>([])
const remark = ref('')
const submitting = ref(false)

async function loadPhotos() {
  const task = await getStaffTaskDetail(taskId.value)
  photos.value = (task.photos || []).map(item => ({
    id: item.id,
    url: item.ossUrl || item.url,
    ossUrl: item.ossUrl || item.url,
    displayUrl: item.displayUrl || item.url,
    status: 'done',
    type: item.type,
  }))
}

async function onSubmit() {
  if (!photos.value.length) {
    uni.showToast({ icon: 'none', title: '请先添加服务照片' })
    return
  }
  if (photos.value.some(item => item.status === 'uploading')) {
    uni.showToast({ icon: 'none', title: '图片上传中' })
    return
  }
  if (photos.value.some(item => item.status === 'error' || !(item.ossUrl || item.url))) {
    uni.showToast({ icon: 'none', title: '请删除上传失败图片' })
    return
  }

  submitting.value = true
  try {
    await uploadStaffOrderPhotos(taskId.value, photos.value.slice(0, 6).map((item, index) => ({
      id: item.id || index,
      url: item.ossUrl || item.url,
      ossUrl: item.ossUrl || item.url,
      displayUrl: item.displayUrl || item.url,
      type: item.type,
      remark: remark.value,
      createdAt: '刚刚',
    })))
    uni.showToast({ icon: 'success', title: '已保存' })
    setTimeout(() => uni.navigateBack(), 400)
  }
  finally {
    submitting.value = false
  }
}

onLoad((query) => {
  taskId.value = Number(query?.id || 0)
  if (taskId.value)
    loadPhotos()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[160rpx] pt-[20rpx]">
    <view class="mx-[24rpx] rounded-[28rpx] bg-white p-[32rpx]">
      <text class="block text-[34rpx] text-[#1F2937] font-700">上传说明</text>
      <text class="block mt-[14rpx] text-[26rpx] leading-[38rpx] text-[#6B7280]">
        请上传服务现场照片，完成服务前至少需要 1 张，最多 6 张。照片会先上传到服务器，完成服务时随订单一起提交。
      </text>
    </view>

    <view class="mx-[24rpx] mt-[24rpx] rounded-[28rpx] bg-white p-[32rpx]">
      <view class="flex items-baseline justify-between">
        <text class="text-[34rpx] text-[#1F2937] font-700">服务照片</text>
        <text class="text-[24rpx] text-[#9CA3AF]">{{ photos.length }}/6</text>
      </view>
      <view class="mt-[26rpx]">
        <upload-image-grid v-model="photos" :max-count="6" biz-type="service_finish_photo" :biz-id="taskId" />
      </view>
    </view>

    <view class="mx-[24rpx] mt-[24rpx] rounded-[28rpx] bg-white p-[32rpx]">
      <text class="text-[34rpx] text-[#1F2937] font-700">照片备注</text>
      <textarea
        v-model="remark"
        class="mt-[22rpx] w-full h-[180rpx] rounded-[18rpx] bg-[#F9FAFB] p-[20rpx] text-[28rpx] text-[#1F2937]"
        placeholder="可补充说明照片内容"
        placeholder-class="text-[#C4C8D0]"
      />
    </view>

    <bottom-action-bar
      primary-color="red"
      primary-text="保存照片"
      :loading="submitting"
      @primary="onSubmit"
    />
  </view>
</template>
