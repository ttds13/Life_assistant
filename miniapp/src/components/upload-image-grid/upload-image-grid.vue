<script lang="ts" setup>
import type { UploadImageItem } from '@/api/types/staff'

const props = withDefaults(defineProps<{
  modelValue: UploadImageItem[]
  maxCount?: number
  readonly?: boolean
}>(), {
  maxCount: 9,
  readonly: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: UploadImageItem[]]
  add: []
  remove: [index: number]
  preview: [index: number]
}>()

const canAdd = computed(() => !props.readonly && props.modelValue.length < props.maxCount)

function onAdd() {
  if (!canAdd.value)
    return

  uni.chooseImage({
    count: props.maxCount - props.modelValue.length,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const paths = Array.isArray(res.tempFilePaths) ? res.tempFilePaths : [res.tempFilePaths]
      const files = paths.map((url, index) => ({
        id: `${Date.now()}-${index}`,
        url,
        status: 'local' as const,
        type: 'other' as const,
      }))
      emit('update:modelValue', [...props.modelValue, ...files])
      emit('add')
    },
  })
}

function onRemove(index: number) {
  if (props.readonly)
    return
  const next = props.modelValue.slice()
  next.splice(index, 1)
  emit('update:modelValue', next)
  emit('remove', index)
}

function onPreview(index: number) {
  const urls = props.modelValue.map(item => item.url)
  uni.previewImage({
    urls,
    current: urls[index],
  })
  emit('preview', index)
}
</script>

<template>
  <view class="grid grid-cols-3 gap-[18rpx]">
    <view
      v-for="(item, index) in modelValue"
      :key="item.id || item.url"
      class="relative aspect-square rounded-[18rpx] bg-[#F3F4F6] overflow-hidden"
      @tap="onPreview(index)"
    >
      <image :src="item.url" class="w-full h-full" mode="aspectFill" />
      <view v-if="item.status === 'uploading'" class="absolute inset-0 bg-[rgba(0,0,0,0.4)] flex items-center justify-center">
        <text class="text-white text-[24rpx]">上传中</text>
      </view>
      <view v-if="item.status === 'error'" class="absolute inset-0 bg-[rgba(0,0,0,0.35)] flex items-center justify-center">
        <text class="text-white text-[24rpx]">失败</text>
      </view>
      <view
        v-if="!readonly"
        class="absolute right-[8rpx] top-[8rpx] w-[40rpx] h-[40rpx] rounded-full bg-[rgba(0,0,0,0.5)] flex items-center justify-center"
        @tap.stop="onRemove(index)"
      >
        <text class="i-carbon-close text-[26rpx] text-white" />
      </view>
    </view>

    <view
      v-if="canAdd"
      class="aspect-square rounded-[18rpx] bg-[#F7F8FA] border border-dashed border-[#D1D5DB] flex flex-col items-center justify-center"
      @tap="onAdd"
    >
      <text class="i-carbon-camera text-[54rpx] text-[#C4C8D0]" />
      <text class="mt-[10rpx] text-[24rpx] text-[#9CA3AF]">添加照片</text>
    </view>
  </view>
</template>
