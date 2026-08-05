<template>
  <div class="page-container commerce-page">
    <div class="page-heading">
      <div>
        <h2>{{ isProductView ? "用户订单" : "用户服务预约" }}</h2>
        <p>{{ isProductView ? "按用户查看服务商品和会员卡商品购买记录。" : "按用户查看服务权益和会员卡权益形成的履约任务。" }}</p>
      </div>
      <el-tag v-if="queryParams.userId" type="primary" effect="plain" closable @close="clearUserFilter">
        用户 #{{ queryParams.userId }}
      </el-tag>
    </div>

    <el-card class="page-search" shadow="never">
      <el-form :model="queryParams" :inline="true">
        <el-form-item label="用户/订单">
          <el-input
            v-model="queryParams.keywords"
            :placeholder="isProductView ? '订单号 / 用户 / 手机号 / 商品' : '订单号 / 用户 / 手机号 / 服务 / 师傅'"
            clearable
            style="width: 250px"
            @keyup.enter="fetchPage"
          />
        </el-form-item>
        <el-form-item :label="isProductView ? '商品类型' : '权益来源'">
          <el-select v-if="isProductView" v-model="queryParams.productType" clearable style="width: 160px">
            <el-option label="全部商品" value="" />
            <el-option label="服务商品" value="service_product" />
            <el-option label="会员卡商品" value="member_card_product" />
          </el-select>
          <el-select v-else v-model="queryParams.entitlementType" clearable style="width: 170px">
            <el-option label="全部权益" value="" />
            <el-option label="服务权益" value="service_entitlement" />
            <el-option label="会员卡权益" value="member_card_entitlement" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="queryParams.status" clearable style="width: 150px">
            <el-option label="全部" value="" />
            <el-option v-for="item in orderStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width: 240px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="search" @click="handleSearch">搜索</el-button>
          <el-button icon="refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="page-content" shadow="never">
      <div class="page-toolbar">
        <div class="page-toolbar__left">
          <el-tag type="info" effect="plain">共 {{ total }} 条</el-tag>
          <el-text v-if="!isProductView" type="info" size="small">同一预约只按一种权益来源展示</el-text>
        </div>
        <div class="page-toolbar__right">
          <el-button v-if="canCreateCurrent" type="primary" icon="plus" @click="openCreate">
            {{ isProductView ? "新建用户订单" : "新建服务预约" }}
          </el-button>
          <el-button icon="refresh" @click="fetchPage">刷新</el-button>
        </div>
      </div>

      <el-table
        v-if="isProductView"
        v-loading="loading"
        :data="productOrders"
        border
        empty-text="暂无商品购买订单"
      >
        <el-table-column label="商品类型" width="110" fixed="left">
          <template #default="{ row }"><el-tag :type="row.productType === 'service_product' ? 'success' : 'warning'">{{ productTypeText(row.productType) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="订单号" prop="orderNo" min-width="160" fixed="left" />
        <el-table-column label="交易状态" width="110">
          <template #default="{ row }"><el-tag :type="statusMeta(row.transactionStatus).type">{{ statusMeta(row.transactionStatus).label }}</el-tag></template>
        </el-table-column>
        <el-table-column label="商品" prop="productName" min-width="170" show-overflow-tooltip />
        <el-table-column label="用户" min-width="160">
          <template #default="{ row }">
            <el-button link type="primary" @click="openUser(row.userId)">{{ row.userName }}</el-button>
            <div class="cell-secondary">{{ row.userPhone }}</div>
          </template>
        </el-table-column>
        <el-table-column label="实付" width="110" align="right">
          <template #default="{ row }">{{ formatMoney(row.paidAmount) }}</template>
        </el-table-column>
        <el-table-column label="关联结果" min-width="190">
          <template #default="{ row }">
            <template v-if="row.productType === 'service_product'">
              <span>服务权益预约</span>
              <div class="cell-secondary">{{ formatDateTime(row.serviceProductSummary?.appointmentStartAt) }}</div>
            </template>
            <template v-else>
              <span>用户权益卡 #{{ row.memberCardProductSummary?.grantedUserMemberCardId || "-" }}</span>
              <div class="cell-secondary">{{ memberCardStatusText(row.memberCardProductSummary?.userMemberCardStatus) }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column label="来源" prop="source" width="100" />
        <el-table-column label="下单时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="支付时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.paidAt) }}</template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="300">
          <template #default="{ row }">
            <el-button type="primary" link icon="view" @click="openOrder(row.id)">详情</el-button>
            <el-button v-if="canUpdate && row.allowedActions?.update" type="primary" link icon="edit" @click="openOrderEdit(row.id)">编辑</el-button>
            <el-button v-if="canCancel && row.allowedActions?.cancel" type="warning" link @click="cancelOrder(row)">取消</el-button>
            <el-button v-if="canDeleteDraft && row.allowedActions?.deleteDraft" type="danger" link @click="deleteDraft(row)">删除草稿</el-button>
            <el-button
              v-if="row.memberCardProductSummary?.grantedUserMemberCardId"
              type="success"
              link
              @click="openUserCard(row.memberCardProductSummary.grantedUserMemberCardId)"
            >权益卡</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-table
        v-else
        v-loading="loading"
        :data="serviceBookings"
        border
        empty-text="暂无服务预约"
      >
        <el-table-column label="权益来源" width="120" fixed="left">
          <template #default="{ row }"><el-tag :type="row.entitlementType === 'service_entitlement' ? 'success' : 'warning'">{{ entitlementTypeText(row.entitlementType) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="订单号" prop="orderNo" min-width="160" fixed="left" />
        <el-table-column label="履约状态" width="110">
          <template #default="{ row }"><el-tag :type="statusMeta(row.fulfillmentStatus).type">{{ statusMeta(row.fulfillmentStatus).label }}</el-tag></template>
        </el-table-column>
        <el-table-column label="服务" prop="serviceName" min-width="160" show-overflow-tooltip />
        <el-table-column label="用户" min-width="150">
          <template #default="{ row }">
            <el-button link type="primary" @click="openUser(row.userId)">{{ row.userName }}</el-button>
            <div class="cell-secondary">{{ row.userPhone }}</div>
          </template>
        </el-table-column>
        <el-table-column label="师傅" width="120">
          <template #default="{ row }">{{ row.staffName || "待派单" }}</template>
        </el-table-column>
        <el-table-column label="预约时间" min-width="190">
          <template #default="{ row }">{{ formatDateTime(row.appointmentStartAt) }}</template>
        </el-table-column>
        <el-table-column label="服务地址" prop="addressText" min-width="240" show-overflow-tooltip />
        <el-table-column label="权益结算" min-width="220">
          <template #default="{ row }">
            <template v-if="row.redemption">
              <span>{{ row.redemption.memberCardName }} #{{ row.redemption.userMemberCardId }}</span>
              <div class="cell-secondary">冻结 {{ row.redemption.reservedMinutes }} / 核销 {{ row.redemption.consumedMinutes }} / 释放 {{ row.redemption.releasedMinutes }} 分钟</div>
            </template>
            <span v-else>一次服务权益</span>
          </template>
        </el-table-column>
        <el-table-column label="师傅收益" width="110" align="right">
          <template #default="{ row }">{{ formatMoney(row.staffIncomeSummary.amount) }}</template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="300">
          <template #default="{ row }">
            <el-button type="primary" link icon="view" @click="openOrder(row.id)">详情</el-button>
            <el-button v-if="canUpdate && row.allowedActions?.update" type="primary" link icon="edit" @click="openOrderEdit(row.id)">编辑</el-button>
            <el-button v-if="canCancel && row.allowedActions?.cancel" type="warning" link @click="cancelOrder(row)">取消</el-button>
            <el-button v-if="canDeleteDraft && row.allowedActions?.deleteDraft" type="danger" link @click="deleteDraft(row)">删除草稿</el-button>
            <el-button v-if="row.redemption" type="success" link @click="openUserCard(row.redemption.userMemberCardId)">权益卡</el-button>
          </template>
        </el-table-column>
      </el-table>

      <pagination
        v-if="total > 0"
        v-model:total="total"
        v-model:page="queryParams.pageNum"
        v-model:limit="queryParams.pageSize"
        @pagination="fetchPage"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "LifeUserCommerceList" });

import LifeAPI from "@/api/life";
import type { UserProductOrderItem, UserServiceBookingItem } from "@/api/life";
import { hasPerm } from "@/utils/auth";

const route = useRoute();
const router = useRouter();
const viewMode = computed(() => String((route.meta.params as Record<string, unknown> | undefined)?.view || "orders"));
const isProductView = computed(() => viewMode.value === "orders");
const canCreateCurrent = computed(() => isProductView.value
  ? hasPerm("user-order:create")
  : hasPerm("user-booking:create"));
const canUpdate = computed(() => hasPerm(["user-order:update", "user-booking:reschedule"]));
const canCancel = computed(() => hasPerm(["user-order:cancel", "user-booking:cancel"]));
const canDeleteDraft = computed(() => hasPerm(["user-order:delete-draft", "user-booking:delete-draft"]));
const loading = ref(false);
const total = ref(0);
const productOrders = ref<UserProductOrderItem[]>([]);
const serviceBookings = ref<UserServiceBookingItem[]>([]);
const dateRange = ref<string[]>([]);
const queryParams = reactive({
  pageNum: 1,
  pageSize: 10,
  keywords: "",
  userId: "",
  status: "",
  source: "",
  productType: "",
  entitlementType: "",
});

const orderStatusOptions = [
  { label: "待支付", value: "pending_payment" },
  { label: "待派单", value: "pending_dispatch" },
  { label: "已派单", value: "dispatched" },
  { label: "已接单", value: "accepted" },
  { label: "服务中", value: "in_service" },
  { label: "待确认", value: "pending_confirm" },
  { label: "已完成", value: "completed" },
  { label: "已取消", value: "cancelled" },
  { label: "已退款", value: "refunded" },
];

watch(
  () => [viewMode.value, route.query.userId, route.query.keywords],
  () => {
    queryParams.pageNum = 1;
    queryParams.userId = routeQueryText(route.query.userId);
    queryParams.keywords = routeQueryText(route.query.keywords);
    queryParams.productType = "";
    queryParams.entitlementType = "";
    void fetchPage();
  },
  { immediate: true }
);

function routeQueryText(value: unknown) {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

async function fetchPage() {
  loading.value = true;
  try {
    const params = {
      ...queryParams,
      startDate: dateRange.value?.[0] || "",
      endDate: dateRange.value?.[1] || "",
    };
    if (isProductView.value) {
      const data = await LifeAPI.getUserProductOrders(params);
      productOrders.value = data.list;
      total.value = data.total;
    } else {
      const data = await LifeAPI.getUserServiceBookings(params);
      serviceBookings.value = data.list;
      total.value = data.total;
    }
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  queryParams.pageNum = 1;
  void fetchPage();
}

function handleReset() {
  queryParams.pageNum = 1;
  queryParams.keywords = "";
  queryParams.status = "";
  queryParams.source = "";
  queryParams.productType = "";
  queryParams.entitlementType = "";
  dateRange.value = [];
  void fetchPage();
}

function clearUserFilter() {
  queryParams.userId = "";
  void router.replace({ path: route.path, query: {} });
}

function openOrder(id: string) {
  void router.push(`/orders/detail/${id}`);
}

function openOrderEdit(id: string) {
  void router.push({ path: `/orders/detail/${id}`, query: { action: "edit" } });
}

function openCreate() {
  void router.push({
    path: "/orders/list",
    query: {
      create: "1",
      userId: queryParams.userId || undefined,
    },
  });
}

async function cancelOrder(row: UserProductOrderItem | UserServiceBookingItem) {
  const { value } = await ElMessageBox.prompt(
    `确认取消订单「${row.orderNo}」吗？已支付订单会进入退款审核。请输入原因。`,
    "取消订单",
    { type: "warning", inputPattern: /\S{2,}/, inputErrorMessage: "原因至少 2 个字符" },
  );
  if ("productType" in row && row.productType === "member_card_product") {
    await LifeAPI.cancelOrder(row.id, { version: row.version, reason: value.trim() });
  } else {
    await LifeAPI.cancelBooking(row.id, { version: row.version, reason: value.trim() });
  }
  ElMessage.success(row.paidAt || row.paidAmount > 0 ? "订单已进入退款处理" : "订单已取消");
  await fetchPage();
}

async function deleteDraft(row: UserProductOrderItem | UserServiceBookingItem) {
  const { value } = await ElMessageBox.prompt(
    `仅会删除无支付、退款、履约、积分和权益事实的待支付草稿「${row.orderNo}」。请输入原因。`,
    "删除草稿",
    { type: "warning", inputPattern: /\S{2,}/, inputErrorMessage: "原因至少 2 个字符" },
  );
  if ("productType" in row && row.productType === "member_card_product") {
    await LifeAPI.deleteOrder(row.id, { version: row.version, reason: value.trim() });
  } else {
    await LifeAPI.deleteBookingDraft(row.id, { version: row.version, reason: value.trim() });
  }
  ElMessage.success("订单草稿已删除");
  await fetchPage();
}

function openUser(userId?: number) {
  if (userId) void router.push(`/users/detail/${userId}/commerce`);
}

function openUserCard(userMemberCardId: number) {
  void router.push({ path: "/users/member-cards", query: { userMemberCardId: String(userMemberCardId) } });
}

function productTypeText(value: string) {
  return value === "member_card_product" ? "会员卡商品" : "服务商品";
}

function entitlementTypeText(value: string) {
  return value === "member_card_entitlement" ? "会员卡权益" : "服务权益";
}

function memberCardStatusText(value?: string) {
  return ({ pending_activation: "未激活", active: "激活中", completed: "激活完成" } as Record<string, string>)[value || ""] || "未发卡";
}

function statusMeta(status: string) {
  const map: Record<string, { label: string; type: "success" | "warning" | "danger" | "info" | "primary" }> = {
    pending_payment: { label: "待支付", type: "warning" },
    pending_dispatch: { label: "待派单", type: "warning" },
    dispatched: { label: "已派单", type: "primary" },
    accepted: { label: "已接单", type: "primary" },
    on_the_way: { label: "上门中", type: "primary" },
    in_service: { label: "服务中", type: "primary" },
    pending_confirm: { label: "待确认", type: "warning" },
    completed: { label: "已完成", type: "success" },
    cancelled: { label: "已取消", type: "info" },
    refunded: { label: "已退款", type: "info" },
  };
  return map[status] || { label: status || "-", type: "info" as const };
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
.commerce-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-heading,
.page-toolbar,
.page-toolbar__left {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.page-heading h2 {
  margin: 0;
  font-size: 22px;
  letter-spacing: 0;
}

.page-heading p {
  margin: 6px 0 0;
  color: var(--el-text-color-secondary);
}

.page-toolbar {
  margin-bottom: 14px;
}

.page-toolbar__left {
  justify-content: flex-start;
}

.cell-secondary {
  margin-top: 3px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
