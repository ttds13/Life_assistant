<template>
  <div class="admin-dashboard">
    <section class="metric-grid">
      <el-card v-for="item in dashboard?.metrics || []" :key="item.key" shadow="never" class="metric-card">
        <div class="metric-card__head">
          <span>{{ item.title }}</span>
          <span class="metric-card__icon" :style="{ color: item.color, borderColor: item.color }">
            <span :class="`i-svg:${item.icon}`" />
          </span>
        </div>
        <div class="metric-card__value">
          <span>{{ item.prefix }}</span>
          {{ item.value.toLocaleString("zh-CN") }}
          <span>{{ item.suffix }}</span>
        </div>
        <div class="metric-card__delta">
          <span>
            周新增 {{ formatSigned(item.weekDelta) }}
            <i class="delta-up" />
          </span>
          <span>
            月新增 {{ formatSigned(item.monthDelta) }}
            <i class="delta-down" />
          </span>
        </div>
        <div class="metric-card__footer">
          <span>{{ item.totalLabel }}：</span>
          <strong>{{ item.prefix }}{{ item.totalValue.toLocaleString("zh-CN") }}</strong>
        </div>
      </el-card>
    </section>

    <section class="shortcut-grid">
      <el-card
        v-for="item in dashboard?.shortcuts || []"
        :key="item.title"
        shadow="never"
        class="shortcut-card"
        @click="router.push(item.path)"
      >
        <span class="shortcut-card__icon" :style="{ color: item.color }">
          <span :class="`i-svg:${item.icon}`" />
        </span>
        <span>{{ item.title }}</span>
      </el-card>
    </section>

    <section class="dashboard-main">
      <el-card shadow="never" class="chart-card">
        <template #header>
          <div class="card-title">
            <span>订单金额</span>
            <el-tag type="primary" effect="plain">近 7 天</el-tag>
          </div>
        </template>
        <ECharts :options="orderTrendOptions" height="340px" />
      </el-card>

      <el-card shadow="never" class="chart-card">
        <template #header>
          <div class="card-title">
            <span>订单状态</span>
            <el-tag type="success" effect="plain">实时</el-tag>
          </div>
        </template>
        <ECharts :options="statusChartOptions" height="340px" />
      </el-card>
    </section>

    <section class="dashboard-bottom">
      <el-card shadow="never">
        <template #header>
          <div class="card-title">
            <span>待处理事项</span>
            <el-button type="primary" link @click="router.push('/audit/center')">查看全部</el-button>
          </div>
        </template>
        <div class="todo-list">
          <div v-for="item in dashboard?.todos || []" :key="item.id" class="todo-item">
            <div>
              <strong>{{ item.title }}</strong>
              <span>{{ item.module }}</span>
            </div>
            <div class="todo-item__right">
              <el-tag :type="item.level">{{ item.count }} 项</el-tag>
              <el-button link type="primary" @click="router.push(item.path)">处理</el-button>
            </div>
          </div>
        </div>
      </el-card>

      <el-card shadow="never">
        <template #header>
          <div class="card-title">
            <span>审核动态</span>
            <el-tag type="warning" effect="plain">重要操作</el-tag>
          </div>
        </template>
        <el-timeline>
          <el-timeline-item
            v-for="item in dashboard?.audits || []"
            :key="item.id"
            :timestamp="item.submittedAt"
            placement="top"
          >
            <div class="audit-line">
              <strong>{{ item.title }}</strong>
              <span>{{ item.source }} / {{ item.status }}</span>
            </div>
          </el-timeline-item>
        </el-timeline>
      </el-card>
    </section>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "Dashboard" });

import LifeAPI from "@/api/life";
import type { DashboardData } from "@/api/life";

const router = useRouter();
const dashboard = ref<DashboardData>();

const orderTrendOptions = computed(() => ({
  tooltip: { trigger: "axis" },
  legend: { data: ["订单金额", "订单量"], bottom: 0 },
  grid: { left: "2%", right: "3%", top: "8%", bottom: "14%", containLabel: true },
  xAxis: {
    type: "category",
    data: dashboard.value?.trend.dates || [],
    axisTick: { show: false },
  },
  yAxis: [
    { type: "value", name: "金额" },
    { type: "value", name: "订单" },
  ],
  series: [
    {
      name: "订单金额",
      type: "line",
      smooth: true,
      data: dashboard.value?.trend.orderAmounts || [],
      lineStyle: { color: "#1677FF", width: 3 },
      itemStyle: { color: "#1677FF" },
      areaStyle: { color: "rgba(22, 119, 255, 0.12)" },
    },
    {
      name: "订单量",
      type: "bar",
      yAxisIndex: 1,
      data: dashboard.value?.trend.orderCounts || [],
      itemStyle: { color: "#16A34A", borderRadius: [4, 4, 0, 0] },
      barWidth: 18,
    },
  ],
}));

const statusChartOptions = computed(() => ({
  tooltip: { trigger: "item" },
  legend: { bottom: 0 },
  series: [
    {
      name: "订单状态",
      type: "pie",
      radius: ["45%", "68%"],
      center: ["50%", "45%"],
      data: dashboard.value?.statusDistribution || [],
      label: { formatter: "{b}: {c}" },
    },
  ],
}));

onMounted(async () => {
  dashboard.value = await LifeAPI.getDashboard();
});

function formatSigned(value: number) {
  return value >= 0 ? value.toLocaleString("zh-CN") : `-${Math.abs(value).toLocaleString("zh-CN")}`;
}
</script>

<style scoped lang="scss">
.admin-dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background: var(--page-bg);
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(220px, 1fr));
  gap: 16px;
}

.metric-card {
  min-height: 150px;

  :deep(.el-card__body) {
    padding: 0;
  }

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 14px;
    font-size: 15px;
    color: var(--el-text-color-primary);
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  &__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: 1px solid;
    border-radius: 4px;

    [class^="i-svg:"] {
      width: 18px;
      height: 18px;
    }
  }

  &__value {
    padding: 20px 20px 10px;
    font-size: 32px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  &__delta {
    display: flex;
    justify-content: space-between;
    padding: 0 20px 18px;
    font-size: 13px;
    color: var(--el-text-color-regular);
  }

  &__footer {
    display: flex;
    justify-content: space-between;
    padding: 14px 20px;
    border-top: 1px solid var(--el-border-color-lighter);
  }
}

.delta-up,
.delta-down {
  display: inline-block;
  width: 0;
  height: 0;
  margin-left: 3px;
  vertical-align: middle;
  border-right: 4px solid transparent;
  border-left: 4px solid transparent;
}

.delta-up {
  border-bottom: 6px solid #10b981;
}

.delta-down {
  border-top: 6px solid #fbbf24;
}

.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(120px, 1fr));
  gap: 16px;
}

.shortcut-card {
  cursor: pointer;

  :deep(.el-card__body) {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    font-size: 15px;
  }

  &:hover {
    border-color: var(--el-color-primary);
  }

  &__icon {
    [class^="i-svg:"] {
      width: 32px;
      height: 32px;
    }
  }
}

.dashboard-main,
.dashboard-bottom {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
}

.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
}

.todo-list {
  display: flex;
  flex-direction: column;
}

.todo-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);

  &:last-child {
    border-bottom: 0;
  }

  strong,
  span {
    display: block;
  }

  span {
    margin-top: 4px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  &__right {
    display: flex;
    gap: 8px;
    align-items: center;
  }
}

.audit-line {
  strong,
  span {
    display: block;
  }

  span {
    margin-top: 4px;
    color: var(--el-text-color-secondary);
  }
}

@media (max-width: 1400px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(220px, 1fr));
  }

  .shortcut-grid {
    grid-template-columns: repeat(4, minmax(120px, 1fr));
  }
}

@media (max-width: 992px) {
  .dashboard-main,
  .dashboard-bottom {
    grid-template-columns: 1fr;
  }
}
</style>
