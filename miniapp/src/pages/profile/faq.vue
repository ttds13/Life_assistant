<script lang="ts" setup>
import { getSupportFaqs } from '@/api/support'
import type { FaqItem } from '@/api/types/support'
import { faqCategories as defaultFaqCategories, faqItems as defaultFaqItems } from '@/constants/support'

definePage({
  style: {
    navigationBarTitleText: '常见问题',
    navigationBarBackgroundColor: '#F5F7FA',
    navigationBarTextStyle: 'black',
  },
})

const keyword = ref('')
const activeCategory = ref('全部')
const openedIds = ref<string[]>([])
const loading = ref(false)
const faqCategories = ref<string[]>(defaultFaqCategories.slice())
const faqItems = ref<FaqItem[]>(defaultFaqItems.slice())

const filteredItems = computed(() => {
  const key = keyword.value.trim()
  return faqItems.value.filter((item) => {
    const categoryMatched = activeCategory.value === '全部' || item.category === activeCategory.value
    const keywordMatched = !key || `${item.question}${item.answer}`.includes(key)
    return categoryMatched && keywordMatched
  })
})

function toggle(id: string) {
  openedIds.value = openedIds.value.includes(id)
    ? openedIds.value.filter(item => item !== id)
    : [...openedIds.value, id]
}

function goContact() {
  uni.navigateTo({ url: '/pages/profile/contact-service' })
}

function goFeedback() {
  uni.navigateTo({ url: '/pages/profile/feedback' })
}

async function loadFaqs() {
  loading.value = true
  try {
    const data = await getSupportFaqs()
    if (data.items?.length) {
      faqItems.value = data.items
      faqCategories.value = data.categories?.length ? data.categories : ['全部']
      if (!faqCategories.value.includes(activeCategory.value))
        activeCategory.value = '全部'
    }
  }
  catch {
    faqCategories.value = defaultFaqCategories.slice()
    faqItems.value = defaultFaqItems.slice()
  }
  finally {
    loading.value = false
  }
}

onLoad(() => {
  void loadFaqs()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[60rpx] pt-1">
    <loading-state :loading="loading">
      <view class="mx-4 mt-3 rounded-[16rpx] bg-white px-4 py-3">
      <view class="h-[76rpx] rounded-[16rpx] bg-[#F5F7FA] px-3 flex items-center">
        <text class="i-carbon-search text-[34rpx] text-[#9CA3AF] mr-2" />
        <input v-model="keyword" class="flex-1 text-[28rpx]" placeholder="搜索问题" />
      </view>
      <scroll-view scroll-x class="mt-3 whitespace-nowrap">
        <view
          v-for="category in faqCategories"
          :key="category"
          class="inline-flex h-[64rpx] px-4 mr-2 rounded-full items-center justify-center border"
          :class="activeCategory === category ? 'bg-[#EAF3FF] border-[#1677FF]' : 'bg-white border-[#E5E7EB]'"
          @tap="activeCategory = category"
        >
          <text class="text-[26rpx]" :class="activeCategory === category ? 'text-[#1677FF]' : 'text-[#6B7280]'">
            {{ category }}
          </text>
        </view>
      </scroll-view>
    </view>

    <view class="mx-4 mt-3 rounded-[16rpx] bg-white overflow-hidden">
      <view
        v-for="item in filteredItems"
        :key="item.id"
        class="border-b border-[#F3F4F6]"
      >
        <view class="px-4 py-4 flex items-center justify-between" @tap="toggle(item.id)">
          <view class="min-w-0 flex-1">
            <text class="block text-[30rpx] text-[#1F2937] font-600">{{ item.question }}</text>
            <text class="block mt-1 text-[24rpx] text-[#9CA3AF]">{{ item.category }}</text>
          </view>
          <text
            class="ml-3 text-[34rpx] text-[#C4C8D0]"
            :class="openedIds.includes(item.id) ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'"
          />
        </view>
        <view v-if="openedIds.includes(item.id)" class="px-4 pb-4">
          <view class="rounded-[12rpx] bg-[#F8FAFC] p-3">
            <text class="text-[26rpx] leading-[42rpx] text-[#4B5563]">{{ item.answer }}</text>
          </view>
        </view>
      </view>

      <empty-state v-if="!filteredItems.length" title="没有找到相关问题" />
    </view>

    <view class="mx-4 mt-3 rounded-[16rpx] bg-white p-4">
      <text class="block text-[30rpx] text-[#1F2937] font-600">没有解决你的问题？</text>
      <view class="mt-3 flex gap-3">
        <button class="flex-1 h-[76rpx] rounded-[18rpx] bg-[#EAF3FF] text-[#1677FF] text-[28rpx]" @tap="goContact">
          联系客服
        </button>
        <button class="flex-1 h-[76rpx] rounded-[18rpx] bg-[#F3F4F6] text-[#4B5563] text-[28rpx]" @tap="goFeedback">
          问题反馈
        </button>
      </view>
    </view>
    </loading-state>
  </view>
</template>
