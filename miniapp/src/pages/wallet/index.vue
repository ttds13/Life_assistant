<script lang="ts" setup>
definePage({
  style: {
    navigationBarTitleText: '我的钱包',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
  },
})

type WalletTab = 'balance' | 'recharge' | 'withdraw'

interface WalletRecord {
  id: number
  tab: WalletTab
  title: string
  time: string
  amount: number
}

const activeTab = ref<WalletTab>('balance')

const walletSummary = {
  balance: '21898.00',
  totalRecharge: '0',
}

const tabs: Array<{ label: string, value: WalletTab }> = [
  { label: '余额明细', value: 'balance' },
  { label: '充值明细', value: 'recharge' },
  { label: '提现记录', value: 'withdraw' },
]

const records: WalletRecord[] = [
  { id: 1, tab: 'balance', title: '支付服务卡', time: '2026-02-28 18:21:14', amount: -2160 },
  { id: 2, tab: 'balance', title: '服务订单', time: '2025-12-25 19:14:52', amount: -98 },
  { id: 3, tab: 'balance', title: '支付服务卡', time: '2025-11-06 18:31:44', amount: -600 },
  { id: 4, tab: 'balance', title: '服务订单', time: '2025-10-18 12:06:27', amount: -128 },
  { id: 5, tab: 'recharge', title: '余额充值', time: '2025-09-12 09:20:36', amount: 1000 },
  { id: 6, tab: 'recharge', title: '余额充值', time: '2025-08-02 14:42:03', amount: 500 },
  { id: 7, tab: 'withdraw', title: '提现到银行卡', time: '2025-07-19 16:10:18', amount: -300 },
]

const visibleRecords = computed(() => records.filter(item => item.tab === activeTab.value))

function setActiveTab(tab: WalletTab) {
  activeTab.value = tab
}

function getTabClass(tab: WalletTab) {
  return activeTab.value === tab ? 'tab-text tab-text-active' : 'tab-text'
}

function getAmountClass(amount: number) {
  return amount > 0 ? 'record-amount record-amount-income' : 'record-amount'
}

function formatRecordAmount(amount: number) {
  const prefix = amount > 0 ? '+' : '-'
  return `${prefix}${Math.abs(amount).toFixed(2)}`
}

function onRecharge() {
  uni.showToast({ icon: 'none', title: '充值功能待接入' })
}

function onWithdraw() {
  uni.showToast({ icon: 'none', title: '提现功能待接入' })
}
</script>

<template>
  <view class="wallet-page">
    <view class="summary-card">
      <view class="summary-row">
        <view class="summary-item">
          <text class="summary-value">{{ walletSummary.balance }}</text>
          <text class="summary-label">账户余额（元）</text>
        </view>
        <view class="summary-item">
          <text class="summary-value">{{ walletSummary.totalRecharge }}</text>
          <text class="summary-label">累计充值（元）</text>
        </view>
      </view>

      <view class="action-row">
        <view class="wallet-button recharge-button" @tap="onRecharge">
          <text>充值</text>
        </view>
        <view class="wallet-button withdraw-button" @tap="onWithdraw">
          <text>提现</text>
        </view>
      </view>
    </view>

    <view class="detail-panel">
      <view class="tab-row">
        <view
          v-for="tab in tabs"
          :key="tab.value"
          class="tab-item"
          @tap="setActiveTab(tab.value)"
        >
          <text :class="getTabClass(tab.value)">
            {{ tab.label }}
          </text>
          <view v-if="activeTab === tab.value" class="tab-line"></view>
        </view>
      </view>

      <view v-if="visibleRecords.length > 0" class="record-list">
        <view
          v-for="item in visibleRecords"
          :key="item.id"
          class="record-item"
        >
          <view class="record-icon">
            <view class="paper-icon">
              <view class="paper-line paper-line-short"></view>
              <view class="paper-line"></view>
              <view class="paper-line"></view>
            </view>
          </view>

          <view class="record-body">
            <view class="record-head">
              <text class="record-title">{{ item.title }}</text>
              <text :class="getAmountClass(item.amount)">
                {{ formatRecordAmount(item.amount) }}
              </text>
            </view>
            <text class="record-time">充值时间： 时间:{{ item.time }}</text>
          </view>
        </view>
      </view>

      <view v-else class="empty-record">
        <text class="empty-title">暂无记录</text>
        <text class="empty-desc">当前分类下暂无钱包明细</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.wallet-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 24rpx 0 64rpx;
  background: #f5f5f5;
}

.summary-card {
  margin: 0 32rpx;
  padding: 64rpx 44rpx 42rpx;
  border-radius: 22rpx;
  background: #ffffff;
  box-sizing: border-box;
}

.summary-row {
  display: flex;
  align-items: flex-start;
}

.summary-item {
  flex: 1;
  min-width: 0;
  text-align: center;
}

.summary-value {
  display: block;
  color: #2b2d33;
  font-size: 64rpx;
  line-height: 78rpx;
  font-weight: 700;
  white-space: nowrap;
}

.summary-label {
  display: block;
  margin-top: 18rpx;
  color: #8c8f96;
  font-size: 30rpx;
  line-height: 42rpx;
  font-weight: 600;
}

.action-row {
  display: flex;
  gap: 24rpx;
  margin-top: 66rpx;
}

.wallet-button {
  flex: 1;
  height: 94rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 38rpx;
  line-height: 48rpx;
  font-weight: 500;
}

.recharge-button {
  background: #0f82ff;
}

.withdraw-button {
  background: #ff3b40;
}

.detail-panel {
  margin: 32rpx 32rpx 0;
  background: #ffffff;
  box-sizing: border-box;
}

.tab-row {
  height: 128rpx;
  display: flex;
  align-items: center;
}

.tab-item {
  position: relative;
  flex: 1;
  height: 128rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab-text {
  color: #282c33;
  font-size: 36rpx;
  line-height: 48rpx;
  font-weight: 400;
}

.tab-text-active {
  color: #20232a;
  font-weight: 700;
}

.tab-line {
  position: absolute;
  left: 50%;
  bottom: 18rpx;
  width: 56rpx;
  height: 8rpx;
  border-radius: 999rpx;
  background: #ff3b40;
  transform: translateX(-50%);
}

.record-list {
  padding: 0 32rpx;
}

.record-item {
  display: flex;
  align-items: flex-start;
  padding: 38rpx 0 40rpx;
  border-bottom: 1rpx solid #eeeeee;
  box-sizing: border-box;
}

.record-item:last-child {
  border-bottom: 0;
}

.record-icon {
  width: 40rpx;
  height: 40rpx;
  margin-top: 6rpx;
  border-radius: 50%;
  background: #ff3b40;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.paper-icon {
  width: 20rpx;
  height: 24rpx;
  border-radius: 3rpx;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 3rpx;
}

.paper-line {
  width: 12rpx;
  height: 2rpx;
  border-radius: 2rpx;
  background: #ff3b40;
}

.paper-line-short {
  width: 8rpx;
}

.record-body {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
}

.record-head {
  display: flex;
  align-items: center;
}

.record-title {
  flex: 1;
  min-width: 0;
  color: #20232a;
  font-size: 36rpx;
  line-height: 48rpx;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-amount {
  flex-shrink: 0;
  margin-left: 20rpx;
  color: #e91e4d;
  font-size: 34rpx;
  line-height: 44rpx;
  font-weight: 700;
}

.record-amount-income {
  color: #0f9d58;
}

.record-time {
  display: block;
  margin-top: 28rpx;
  color: #96999f;
  font-size: 28rpx;
  line-height: 38rpx;
}

.empty-record {
  min-height: 360rpx;
  padding-top: 110rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}

.empty-title {
  color: #333333;
  font-size: 32rpx;
  line-height: 44rpx;
  font-weight: 600;
}

.empty-desc {
  margin-top: 14rpx;
  color: #999999;
  font-size: 26rpx;
  line-height: 36rpx;
}
</style>
