<script lang="ts" setup>
type StaffTab = 'home' | 'orders' | 'profile'

const props = defineProps<{
  active: StaffTab
}>()

const tabs: { key: StaffTab, label: string, icon: string, url: string }[] = [
  { key: 'home', label: '首页', icon: 'i-carbon-home', url: '/pages/staff/home' },
  { key: 'orders', label: '订单管理', icon: 'i-carbon-document', url: '/pages/staff/orders' },
  { key: 'profile', label: '个人中心', icon: 'i-carbon-user', url: '/pages/staff/profile' },
]

function onTap(tab: typeof tabs[number]) {
  if (tab.key === props.active)
    return
  uni.redirectTo({ url: tab.url })
}
</script>

<template>
  <view class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-[#E5E7EB] pb-safe">
    <view class="h-[108rpx] flex items-center">
      <view
        v-for="tab in tabs"
        :key="tab.key"
        class="flex-1 h-full flex flex-col items-center justify-center"
        @tap="onTap(tab)"
      >
        <text
          :class="[tab.icon, active === tab.key ? 'text-[#FF373D]' : 'text-[#8A8F99]']"
          class="text-[44rpx]"
        />
        <text
          class="mt-[6rpx] text-[24rpx]"
          :class="active === tab.key ? 'text-[#FF373D] font-600' : 'text-[#6B7280]'"
        >
          {{ tab.label }}
        </text>
      </view>
    </view>
  </view>
</template>

