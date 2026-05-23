<script lang="ts" setup>
import type { ServiceCategory } from '@/api/types/services'
import type { Service } from '@/api/types/services'
import { getServiceCategories, getServices } from '@/api/services'

definePage({
  type: 'home',
  style: {
    navigationStyle: 'custom',
    navigationBarTitleText: '生活助手',
  },
})

const categories = ref<ServiceCategory[]>([])
const services = ref<Service[]>([])
const loading = ref(true)
const isError = ref(false)

const isEmpty = computed(() => !loading.value && !isError.value && categories.value.length === 0 && services.value.length === 0)

function normalizeServiceList(data: any): Service[] {
  if (Array.isArray(data))
    return data

  return data?.items || data?.list || data?.records || []
}

async function loadData() {
  loading.value = true
  isError.value = false
  try {
    const [cateRes, serviceRes] = await Promise.all([
      getServiceCategories(),
      getServices({ page: 1, pageSize: 10 }),
    ])
    categories.value = cateRes
    services.value = normalizeServiceList(serviceRes)
  }
  catch (err) {
    console.error('首页数据加载失败:', err)
    isError.value = true
  }
  finally {
    loading.value = false
  }
}

onLoad(() => {
  loadData()
})
</script>

<template>
  <view class="min-h-screen bg-[#F5F7FA] pb-[120rpx]">
    <!-- 顶部问候 -->
    <view class="bg-white pt-safe px-4 pb-3">
      <view class="pt-4">
        <text class="text-[34rpx] font-600 text-gray-800">你好，欢迎使用生活助手</text>
      </view>
      <!-- 搜索框占位 -->
      <view class="mt-3 bg-[#F0F2F5] rounded-full h-[72rpx] flex items-center px-4">
        <text class="text-[26rpx] text-gray-400">搜索服务...</text>
      </view>
    </view>

    <!-- 加载状态 -->
    <loading-state :loading="loading">
      <!-- 错误状态 -->
      <empty-state
        v-if="isError"
        type="error"
        title="加载失败"
        description="请检查网络后重试"
        show-retry
        @retry="loadData"
      />

      <!-- 空状态 -->
      <empty-state
        v-else-if="isEmpty"
        type="empty"
        title="暂无服务"
        description="服务即将上线，敬请期待"
      />

      <!-- 正常内容 -->
      <view v-else>
        <!-- 服务分类宫格 -->
        <view class="mt-3">
          <service-category-grid :categories="categories" />
        </view>

        <!-- 优惠活动占位 -->
        <view class="mx-4 mt-3 bg-[#EAF3FF] rounded-[16rpx] h-[160rpx] flex items-center justify-center">
          <text class="text-[28rpx] text-[#1677FF]">🎉 新用户专享优惠</text>
        </view>

        <!-- 热门服务 -->
        <view class="mt-4 px-4">
          <text class="text-[32rpx] font-600 text-gray-800">热门服务</text>
        </view>
        <view class="mt-2">
          <service-card v-for="item in services" :key="item.id" :service="item" />
        </view>
      </view>
    </loading-state>
  </view>
</template>
