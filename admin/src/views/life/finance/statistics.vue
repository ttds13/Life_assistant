<template>
  <div class="page-container finance-stat-page">
    <el-card class="page-header" shadow="never">
      <div>
        <h2>财务统计</h2>
        <p>按订单来源、支付渠道和日期汇总订单、支付、退款、优惠券、积分、师傅收入和提现。</p>
      </div>
      <el-button type="primary" icon="refresh" :loading="loading" @click="fetchSummary">刷新</el-button>
    </el-card>

    <el-card class="page-search" shadow="never">
      <el-form :model="query" :inline="true">
        <el-form-item label="日期">
          <el-date-picker
            v-model="query.dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 260px"
          />
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="query.source" clearable style="width: 140px">
            <el-option label="全部" value="" />
            <el-option v-for="item in sourceOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="渠道">
          <el-select v-model="query.channel" clearable style="width: 140px">
            <el-option label="全部" value="" />
            <el-option label="微信" value="wechat" />
            <el-option label="Mock" value="mock" />
            <el-option label="线下" value="offline" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="search" @click="fetchSummary">查询</el-button>
          <el-button icon="refresh" @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <div class="metric-grid" v-loading="loading">
      <div v-for="item in metrics" :key="item.key" class="metric-panel">
        <div class="metric-title">{{ item.title }}</div>
        <div class="metric-value">{{ item.prefix }}{{ item.value }}</div>
        <div class="metric-sub">{{ item.sub }}</div>
      </div>
    </div>

    <el-row :gutter="12" class="summary-row">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>订单来源</template>
          <el-table :data="summary?.breakdowns.ordersBySource || []" border size="small">
            <el-table-column prop="source" label="来源" width="110">
              <template #default="{ row }">{{ sourceLabel(row.source) }}</template>
            </el-table-column>
            <el-table-column prop="count" label="订单数" width="90" />
            <el-table-column label="原价" align="right">
              <template #default="{ row }">￥{{ money(row.grossAmount) }}</template>
            </el-table-column>
            <el-table-column label="优惠" align="right">
              <template #default="{ row }">￥{{ money(row.discountAmount) }}</template>
            </el-table-column>
            <el-table-column label="已付" align="right">
              <template #default="{ row }">￥{{ money(row.paidAmount) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>支付渠道</template>
          <el-table :data="summary?.breakdowns.paymentsByChannel || []" border size="small">
            <el-table-column prop="channel" label="渠道" width="110">
              <template #default="{ row }">{{ channelLabel(row.channel) }}</template>
            </el-table-column>
            <el-table-column prop="count" label="笔数" width="90" />
            <el-table-column label="支付金额" align="right">
              <template #default="{ row }">￥{{ money(row.amount) }}</template>
            </el-table-column>
            <el-table-column label="退款金额" align="right">
              <template #default="{ row }">￥{{ money(row.refundedAmount) }}</template>
            </el-table-column>
            <el-table-column label="净额" align="right">
              <template #default="{ row }">￥{{ money(row.netAmount) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="12" class="summary-row">
      <el-col :span="8">
        <el-card shadow="never">
          <template #header>订单状态</template>
          <el-table :data="summary?.breakdowns.ordersByStatus || []" border size="small">
            <el-table-column prop="label" label="状态" />
            <el-table-column prop="count" label="数量" width="80" />
            <el-table-column label="已付" align="right">
              <template #default="{ row }">￥{{ money(row.paidAmount) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never">
          <template #header>积分口径</template>
          <el-table :data="summary?.breakdowns.pointsByType || []" border size="small">
            <el-table-column prop="type" label="类型" />
            <el-table-column prop="count" label="条数" width="80" />
            <el-table-column prop="points" label="积分" width="100" />
            <el-table-column label="金额" align="right">
              <template #default="{ row }">￥{{ money(row.amount) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never">
          <template #header>师傅收入</template>
          <el-table :data="summary?.breakdowns.incomeByStatus || []" border size="small">
            <el-table-column prop="status" label="状态" />
            <el-table-column prop="count" label="条数" width="80" />
            <el-table-column label="金额" align="right">
              <template #default="{ row }">￥{{ money(row.amount) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="12" class="summary-row">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>退款状态</template>
          <el-table :data="summary?.breakdowns.refundsByStatus || []" border size="small">
            <el-table-column prop="status" label="状态" />
            <el-table-column prop="count" label="数量" width="90" />
            <el-table-column label="金额" align="right">
              <template #default="{ row }">￥{{ money(row.amount) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>提现状态</template>
          <el-table :data="summary?.breakdowns.withdrawsByStatus || []" border size="small">
            <el-table-column prop="status" label="状态" />
            <el-table-column prop="count" label="数量" width="90" />
            <el-table-column label="金额" align="right">
              <template #default="{ row }">￥{{ money(row.amount) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "LifeFinanceStatistics" });

import LifeAPI from "@/api/life";
import type { FinanceSummaryData } from "@/api/life";

const loading = ref(false);
const summary = ref<FinanceSummaryData>();
const query = reactive({
  dateRange: [] as string[],
  source: "",
  channel: "",
});

const sourceOptions = [
  { label: "小程序", value: "miniapp" },
  { label: "后台录入", value: "admin" },
  { label: "电话订单", value: "phone" },
  { label: "线下订单", value: "offline" },
  { label: "微信私域", value: "wechat_private" },
  { label: "推广渠道", value: "channel" },
  { label: "推广订单", value: "promotion" },
  { label: "视频号", value: "channels" },
];

const metrics = computed(() => {
  const item = summary.value?.summary;
  return [
    { key: "gross", title: "订单原价", value: money(item?.grossAmount), prefix: "￥", sub: `订单 ${item?.orderCount || 0} 单` },
    { key: "discount", title: "优惠金额", value: money(item?.discountAmount), prefix: "￥", sub: `优惠券抵扣 ￥${money(item?.couponDiscount)}` },
    { key: "paid", title: "历史实收", value: money(item?.paidAmount), prefix: "￥", sub: `支付 ${item?.paymentCount || 0} 笔` },
    { key: "refund", title: "退款金额", value: money(item?.refundAmount), prefix: "￥", sub: `退款 ${item?.refundCount || 0} 笔` },
    { key: "net", title: "净收入", value: money(item?.netRevenue), prefix: "￥", sub: "支付金额 - 已退款金额" },
    { key: "income", title: "师傅收入", value: money(item?.incomeAmount), prefix: "￥", sub: `收入记录 ${item?.incomeCount || 0} 条` },
    { key: "points", title: "积分净值", value: String(item?.pointsNet || 0), prefix: "", sub: `发放 ${item?.pointsEarned || 0} / 扣回 ${item?.pointsDeducted || 0}` },
    { key: "coupon", title: "用券订单", value: String(item?.couponOrderCount || 0), prefix: "", sub: `券抵扣 ￥${money(item?.couponDiscount)}` },
  ];
});

onMounted(fetchSummary);

async function fetchSummary() {
  loading.value = true;
  try {
    summary.value = await LifeAPI.getFinanceSummary({
      startDate: query.dateRange?.[0],
      endDate: query.dateRange?.[1],
      source: query.source || undefined,
      channel: query.channel || undefined,
    });
  } finally {
    loading.value = false;
  }
}

function resetQuery() {
  query.dateRange = [];
  query.source = "";
  query.channel = "";
  fetchSummary();
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sourceLabel(value: string) {
  return sourceOptions.find((item) => item.value === value)?.label || value || "-";
}

function channelLabel(value: string) {
  const map: Record<string, string> = { wechat: "微信", mock: "Mock", offline: "线下" };
  return map[value] || value || "-";
}
</script>

<style scoped>
.finance-stat-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.page-header :deep(.el-card__body) {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
}

.page-header p {
  margin: 6px 0 0;
  color: var(--el-text-color-secondary);
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.metric-panel {
  min-height: 104px;
  padding: 18px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background: var(--el-bg-color);
}

.metric-title {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.metric-value {
  margin-top: 8px;
  font-size: 24px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.metric-sub {
  margin-top: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.summary-row {
  margin-top: 0;
}

@media (max-width: 1200px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
