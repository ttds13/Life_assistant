<script lang="ts" setup>
const props = withDefaults(defineProps<{
  price?: number
  priceLabel?: string
  primaryText: string
  secondaryText?: string
  primaryDisabled?: boolean
  loading?: boolean
}>(), {
  price: undefined,
  priceLabel: '合计',
  secondaryText: '',
  primaryDisabled: false,
  loading: false,
})

const emit = defineEmits<{
  primary: []
  secondary: []
}>()

const displayPrice = computed(() => {
  if (props.price === undefined)
    return ''
  return props.price % 1 === 0 ? props.price.toString() : props.price.toFixed(2)
})

function onPrimary() {
  if (props.primaryDisabled || props.loading)
    return
  emit('primary')
}
</script>

<template>
  <view class="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-[#E5E7EB] px-4 py-3 pb-safe">
    <view class="flex items-center gap-3">
      <view v-if="price !== undefined" class="flex-1">
        <text class="text-[24rpx] text-gray-500 block">{{ priceLabel }}</text>
        <view class="flex items-baseline mt-1">
          <text class="text-[24rpx] text-[#EF4444] font-600">¥</text>
          <text class="text-[40rpx] text-[#EF4444] font-700">{{ displayPrice }}</text>
        </view>
      </view>

      <button
        v-if="secondaryText"
        class="min-w-[180rpx] h-[88rpx] rounded-full bg-white border border-[#E5E7EB] text-[28rpx] text-gray-600 flex items-center justify-center"
        @tap="emit('secondary')"
      >
        {{ secondaryText }}
      </button>

      <button
        class="h-[88rpx] rounded-full text-[30rpx] flex items-center justify-center"
        :class="[
          price !== undefined || secondaryText ? 'min-w-[220rpx] px-6' : 'flex-1',
          primaryDisabled || loading ? 'bg-gray-300 text-white' : 'bg-[#1677FF] text-white',
        ]"
        @tap="onPrimary"
      >
        {{ loading ? '处理中...' : primaryText }}
      </button>
    </view>
  </view>
</template>
