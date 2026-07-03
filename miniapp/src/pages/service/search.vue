<script lang="ts" setup>
import type { Service } from '@/api/types/services'
import { getServices } from '@/api/services'

definePage({
  style: {
    navigationBarTitleText: '搜索服务',
  },
})

const keyword = ref('')
const services = ref<Service[]>([])
const loading = ref(false)
const isError = ref(false)
const searched = ref(false)
const page = ref(1)
const pageSize = 20

function normalizeServiceList(data: any): Service[] {
  if (Array.isArray(data))
    return data

  return data?.items || data?.list || data?.records || []
}

async function loadServices() {
  const searchText = keyword.value.trim()
  if (!searchText) {
    clearKeyword()
    return
  }

  loading.value = true
  isError.value = false
  searched.value = true
  page.value = 1

  try {
    const result = await getServices({
      keyword: searchText,
      page: page.value,
      pageSize,
    })
    services.value = normalizeServiceList(result)
  }
  catch (err) {
    console.error('服务搜索失败:', err)
    isError.value = true
    services.value = []
  }
  finally {
    loading.value = false
  }
}

function handleSearch() {
  void loadServices()
}

function clearKeyword() {
  keyword.value = ''
  services.value = []
  loading.value = false
  isError.value = false
  searched.value = false
  page.value = 1
}

function serviceDetailUrl(service: Service) {
  const query = service.code
    ? `code=${encodeURIComponent(service.code)}`
    : `id=${encodeURIComponent(String(service.id))}`
  return `/pages/service/detail?${query}`
}

function onServiceTap(service: Service) {
  uni.navigateTo({ url: serviceDetailUrl(service) })
}

onLoad((query) => {
  const queryKeyword = typeof query?.keyword === 'string' ? decodeURIComponent(query.keyword) : ''
  if (queryKeyword) {
    keyword.value = queryKeyword
    void loadServices()
  }
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[32rpx]">
    <view class="sticky top-0 z-10 bg-white px-[24rpx] py-[20rpx] shadow-sm">
      <view class="flex items-center gap-[16rpx]">
        <view class="flex-1 h-[76rpx] rounded-full bg-[#F3F4F6] px-[24rpx] flex items-center">
          <view class="i-carbon-search text-[32rpx] text-gray-400" />
          <input
            v-model="keyword"
            class="flex-1 ml-[12rpx] text-[28rpx] text-gray-800"
            confirm-type="search"
            placeholder="输入服务关键词"
            placeholder-class="text-gray-400"
            @confirm="handleSearch"
          />
          <view
            v-if="keyword"
            class="i-carbon-close-filled text-[30rpx] text-gray-300"
            @tap="clearKeyword"
          />
        </view>
        <view
          class="h-[76rpx] px-[28rpx] rounded-full bg-[#FF373D] flex items-center justify-center"
          @tap="handleSearch"
        >
          <text class="text-white text-[28rpx] font-600">搜索</text>
        </view>
      </view>
    </view>

    <loading-state :loading="loading">
      <view v-if="isError" class="px-[24rpx]">
        <empty-state
          type="network"
          title="搜索失败"
          description="请检查网络后重试"
          show-retry
          @retry="handleSearch"
        />
      </view>

      <view v-else-if="services.length" class="pt-[20rpx]">
        <service-card
          v-for="item in services"
          :key="item.id"
          :service="item"
          @tap="onServiceTap"
        />
      </view>

      <view v-else-if="searched" class="px-[24rpx]">
        <empty-state
          type="empty"
          title="未找到相关服务"
          description="换个关键词试试"
        />
      </view>

      <view v-else class="px-[32rpx] py-[48rpx]">
        <view class="rounded-[20rpx] bg-white p-[32rpx]">
          <text class="block text-[32rpx] font-700 text-gray-800">搜索服务</text>
          <text class="block mt-[12rpx] text-[26rpx] leading-[38rpx] text-gray-500">
            输入服务名称、分类或服务说明关键词，系统会展示匹配到的服务卡片。
          </text>
        </view>
      </view>
    </loading-state>
  </view>
</template>
