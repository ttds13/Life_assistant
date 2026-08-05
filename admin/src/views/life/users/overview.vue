<template>
  <div class="page-container overview-page">
    <div class="overview-header">
      <div>
        <el-button link icon="arrow-left" @click="router.back()">返回</el-button>
        <h2>{{ data?.user.nickname || `用户 #${userId}` }}</h2>
        <p>{{ data?.user.phone || "未填写手机号" }} · 用户 #{{ userId }}</p>
      </div>
      <div class="overview-actions">
        <el-button v-if="canCreateBooking" type="primary" icon="plus" @click="createBooking">创建预约</el-button>
        <el-button v-if="canGrantCard" type="success" icon="plus" @click="grantCard">发放权益卡</el-button>
        <el-button icon="table" @click="openAll('/users/orders')">用户订单</el-button>
        <el-button icon="document" @click="openAll('/users/service-bookings')">服务预约</el-button>
        <el-button type="primary" icon="file" @click="openAll('/users/member-cards')">用户权益卡</el-button>
      </div>
    </div>

    <el-skeleton :loading="loading" animated :rows="8">
      <template #default>
        <div v-if="data" class="metric-grid">
          <div class="metric-item metric-item--green">
            <span>商品购买</span>
            <strong>{{ data.purchaseSummary.totalOrderCount }}</strong>
            <small>服务 {{ data.purchaseSummary.serviceProductCount }} · 会员卡 {{ data.purchaseSummary.memberCardProductCount }}</small>
          </div>
          <div class="metric-item metric-item--gold">
            <span>累计实付</span>
            <strong>{{ formatMoney(data.purchaseSummary.totalPaidAmount) }}</strong>
            <small>已退款 {{ formatMoney(data.purchaseSummary.refundedAmount) }}</small>
          </div>
          <div class="metric-item metric-item--blue">
            <span>服务预约</span>
            <strong>{{ data.serviceBookingSummary.totalCount }}</strong>
            <small>服务权益 {{ data.serviceBookingSummary.serviceEntitlementCount }} · 会员卡权益 {{ data.serviceBookingSummary.memberCardEntitlementCount }}</small>
          </div>
          <div class="metric-item metric-item--red">
            <span>用户权益卡</span>
            <strong>{{ data.userMemberCardSummary.totalCount }}</strong>
            <small>未激活 {{ data.userMemberCardSummary.pendingActivationCount }} · 激活中 {{ data.userMemberCardSummary.activeCount }} · 已完成 {{ data.userMemberCardSummary.completedCount }}</small>
          </div>
        </div>

        <div v-if="data" class="balance-band">
          <div><span>可用分钟</span><strong>{{ data.userMemberCardSummary.usableMinutes }}</strong></div>
          <div><span>冻结分钟</span><strong>{{ data.userMemberCardSummary.frozenMinutes }}</strong></div>
          <div><span>剩余分钟</span><strong>{{ data.userMemberCardSummary.remainingMinutes }}</strong></div>
          <div><span>30 天内到期</span><strong>{{ data.userMemberCardSummary.expiringWithinThirtyDaysCount }}</strong></div>
        </div>

        <el-card v-if="data" shadow="never">
          <template #header><div class="section-header"><span>最近用户订单</span><el-button link type="primary" @click="openAll('/users/orders')">查看全部</el-button></div></template>
          <el-table :data="data.recentProductOrders" border empty-text="暂无商品购买订单">
            <el-table-column label="商品类型" width="115"><template #default="{ row }"><el-tag :type="row.productType === 'service_product' ? 'success' : 'warning'">{{ row.productType === "service_product" ? "服务商品" : "会员卡商品" }}</el-tag></template></el-table-column>
            <el-table-column label="订单号" prop="orderNo" min-width="160" />
            <el-table-column label="商品" prop="productName" min-width="170" />
            <el-table-column label="状态" prop="transactionStatus" width="110" />
            <el-table-column label="实付" width="110"><template #default="{ row }">{{ formatMoney(row.paidAmount) }}</template></el-table-column>
            <el-table-column label="下单时间" min-width="170"><template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template></el-table-column>
            <el-table-column label="操作" width="90"><template #default="{ row }"><el-button link type="primary" @click="openOrder(row.id)">详情</el-button></template></el-table-column>
          </el-table>
        </el-card>

        <el-card v-if="data" shadow="never">
          <template #header><div class="section-header"><span>最近服务预约</span><el-button link type="primary" @click="openAll('/users/service-bookings')">查看全部</el-button></div></template>
          <el-table :data="data.recentServiceBookings" border empty-text="暂无服务预约">
            <el-table-column label="权益来源" width="120"><template #default="{ row }"><el-tag :type="row.entitlementType === 'service_entitlement' ? 'success' : 'warning'">{{ row.entitlementType === "service_entitlement" ? "服务权益" : "会员卡权益" }}</el-tag></template></el-table-column>
            <el-table-column label="订单号" prop="orderNo" min-width="160" />
            <el-table-column label="服务" prop="serviceName" min-width="160" />
            <el-table-column label="状态" prop="fulfillmentStatus" width="110" />
            <el-table-column label="师傅" width="110"><template #default="{ row }">{{ row.staffName || "待派单" }}</template></el-table-column>
            <el-table-column label="预约时间" min-width="180"><template #default="{ row }">{{ formatDateTime(row.appointmentStartAt) }}</template></el-table-column>
            <el-table-column label="操作" width="90"><template #default="{ row }"><el-button link type="primary" @click="openOrder(row.id)">详情</el-button></template></el-table-column>
          </el-table>
        </el-card>

        <el-card v-if="data" shadow="never">
          <template #header><div class="section-header"><span>最近用户权益卡</span><el-button link type="primary" @click="openAll('/users/member-cards')">查看全部</el-button></div></template>
          <el-table :data="data.recentUserMemberCards" border empty-text="暂无用户权益卡">
            <el-table-column label="权益卡" prop="cardName" min-width="170" />
            <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="memberCardStatusMeta(row.status).type">{{ memberCardStatusMeta(row.status).label }}</el-tag></template></el-table-column>
            <el-table-column label="可用分钟" prop="usableMinutes" width="110" />
            <el-table-column label="冻结分钟" prop="frozenMinutes" width="110" />
            <el-table-column label="激活截止" min-width="170"><template #default="{ row }">{{ formatDateTime(row.activationDeadlineAt) }}</template></el-table-column>
            <el-table-column label="到期时间" min-width="170"><template #default="{ row }">{{ formatDateTime(row.expireAt) }}</template></el-table-column>
            <el-table-column label="操作" width="90"><template #default="{ row }"><el-button link type="primary" @click="openCard(row.id)">查看</el-button></template></el-table-column>
          </el-table>
        </el-card>
      </template>
    </el-skeleton>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "LifeUserCommerceOverview" });

import LifeAPI from "@/api/life";
import type { UserCommerceOverview } from "@/api/life";
import { hasPerm } from "@/utils/auth";

const route = useRoute();
const router = useRouter();
const userId = computed(() => String(route.params.id || ""));
const loading = ref(false);
const data = ref<UserCommerceOverview>();
const canCreateBooking = computed(() => hasPerm("user-booking:create"));
const canGrantCard = computed(() => hasPerm("user-member-card:grant"));

watch(userId, () => void fetchData(), { immediate: true });

async function fetchData() {
  if (!userId.value) return;
  loading.value = true;
  try {
    data.value = await LifeAPI.getUserCommerceOverview(userId.value);
  } finally {
    loading.value = false;
  }
}

function openAll(path: string) {
  void router.push({ path, query: { userId: userId.value } });
}

function createBooking() {
  void router.push({ path: "/orders/list", query: { userId: userId.value, create: "1" } });
}

function grantCard() {
  void router.push({ path: "/users/member-cards", query: { userId: userId.value, grant: "1" } });
}

function openOrder(id: string) {
  void router.push(`/orders/detail/${id}`);
}

function openCard(id: number) {
  void router.push({ path: "/users/member-cards", query: { userMemberCardId: String(id) } });
}

function memberCardStatusMeta(status: string) {
  const map: Record<string, { label: string; type: "success" | "warning" | "info" }> = {
    pending_activation: { label: "未激活", type: "warning" },
    active: { label: "激活中", type: "success" },
    completed: { label: "激活完成", type: "info" },
  };
  return map[status] || { label: status, type: "info" };
}

function formatMoney(value?: number) {
  return `￥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}
</script>

<style scoped>
.overview-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.overview-header,
.overview-actions,
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.overview-actions { flex-wrap: wrap; }

.overview-header h2 {
  margin: 8px 0 0;
  font-size: 22px;
  letter-spacing: 0;
}

.overview-header p {
  margin: 5px 0 0;
  color: var(--el-text-color-secondary);
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.metric-item {
  min-height: 118px;
  padding: 18px;
  border: 1px solid var(--el-border-color-light);
  border-left: 4px solid var(--metric-color);
  border-radius: 6px;
  background: var(--el-bg-color);
}

.metric-item--green { --metric-color: #2f855a; }
.metric-item--gold { --metric-color: #b7791f; }
.metric-item--blue { --metric-color: #2b6cb0; }
.metric-item--red { --metric-color: #c53030; }

.metric-item span,
.metric-item small {
  display: block;
  color: var(--el-text-color-secondary);
}

.metric-item strong {
  display: block;
  margin: 8px 0;
  font-size: 25px;
  letter-spacing: 0;
}

.balance-band {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 14px 0;
  border-top: 1px solid var(--el-border-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.balance-band div {
  padding: 0 18px;
  border-right: 1px solid var(--el-border-color-lighter);
}

.balance-band div:last-child { border-right: 0; }
.balance-band span { color: var(--el-text-color-secondary); }
.balance-band strong { float: right; }

@media (max-width: 1000px) {
  .metric-grid,
  .balance-band { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .overview-header { align-items: flex-start; flex-direction: column; }
}
</style>
