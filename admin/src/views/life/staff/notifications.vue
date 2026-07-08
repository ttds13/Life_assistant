<template>
  <div class="page-container staff-notification-page">
    <el-card class="page-header" shadow="never">
      <div>
        <h2>师傅通知</h2>
        <p>按师傅、订单、发送状态和阅读状态追踪派单通知。</p>
      </div>
      <el-button type="primary" icon="refresh" :loading="loading" @click="fetchList">刷新</el-button>
    </el-card>

    <el-card class="page-search" shadow="never">
      <el-form :model="query" :inline="true">
        <el-form-item label="关键词">
          <el-input v-model="query.keywords" clearable placeholder="师傅 / 手机号 / 订单号 / 标题" style="width: 260px" @keyup.enter="search" />
        </el-form-item>
        <el-form-item label="师傅ID">
          <el-input v-model="query.staffId" clearable style="width: 120px" @keyup.enter="search" />
        </el-form-item>
        <el-form-item label="订单ID">
          <el-input v-model="query.orderId" clearable style="width: 120px" @keyup.enter="search" />
        </el-form-item>
        <el-form-item label="发送">
          <el-select v-model="query.sendStatus" clearable style="width: 120px">
            <el-option label="全部" value="" />
            <el-option label="已发送" value="sent" />
            <el-option label="已创建" value="created" />
            <el-option label="失败" value="failed" />
          </el-select>
        </el-form-item>
        <el-form-item label="阅读">
          <el-select v-model="query.isRead" clearable style="width: 120px">
            <el-option label="全部" value="" />
            <el-option label="已读" value="true" />
            <el-option label="未读" value="false" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="search" @click="search">查询</el-button>
          <el-button icon="refresh" @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="items" border>
        <el-table-column prop="id" label="通知ID" width="90" />
        <el-table-column label="师傅" min-width="180">
          <template #default="{ row }">
            <strong>#{{ row.staffId }} {{ row.staffName || "-" }}</strong>
            <div class="muted">{{ row.staffPhone || "-" }}</div>
          </template>
        </el-table-column>
        <el-table-column label="订单" min-width="160">
          <template #default="{ row }">
            <el-button v-if="row.orderId" text type="primary" @click="goOrder(row.orderId)">
              {{ row.orderNo || `#${row.orderId}` }}
            </el-button>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
        <el-table-column label="发送" width="110">
          <template #default="{ row }">
            <el-tag :type="sendStatusMeta(row.sendStatus).type">{{ sendStatusMeta(row.sendStatus).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="阅读" width="100">
          <template #default="{ row }">
            <el-tag :type="row.isRead ? 'success' : 'warning'">{{ row.isRead ? "已读" : "未读" }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="阅读时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.readAt) }}</template>
        </el-table-column>
        <el-table-column prop="retryCount" label="重发" width="80" />
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click="openDetail(row)">详情</el-button>
            <el-button text type="warning" :disabled="!canResend || row.bizType !== 'order'" @click="resend(row)">重发</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-row">
        <el-pagination
          v-model:current-page="query.pageNum"
          v-model:page-size="query.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="fetchList"
          @current-change="fetchList"
        />
      </div>
    </el-card>

    <el-drawer v-model="detailVisible" title="通知详情" size="520px">
      <template v-if="current">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="通知ID">#{{ current.id }}</el-descriptions-item>
          <el-descriptions-item label="师傅">#{{ current.staffId }} {{ current.staffName }} / {{ current.staffPhone || "-" }}</el-descriptions-item>
          <el-descriptions-item label="订单">
            <el-button v-if="current.orderId" text type="primary" @click="goOrder(current.orderId)">
              {{ current.orderNo || `#${current.orderId}` }}
            </el-button>
            <span v-else>-</span>
          </el-descriptions-item>
          <el-descriptions-item label="类型">{{ current.type }}</el-descriptions-item>
          <el-descriptions-item label="标题">{{ current.title }}</el-descriptions-item>
          <el-descriptions-item label="内容">{{ current.content }}</el-descriptions-item>
          <el-descriptions-item label="发送状态">{{ sendStatusMeta(current.sendStatus).label }}</el-descriptions-item>
          <el-descriptions-item label="阅读状态">{{ current.isRead ? "已读" : "未读" }}</el-descriptions-item>
          <el-descriptions-item label="发送时间">{{ formatDateTime(current.sentAt) }}</el-descriptions-item>
          <el-descriptions-item label="阅读时间">{{ formatDateTime(current.readAt) }}</el-descriptions-item>
          <el-descriptions-item label="重发次数">{{ current.retryCount }}</el-descriptions-item>
          <el-descriptions-item label="失败原因">{{ current.failureReason || "-" }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDateTime(current.createdAt) }}</el-descriptions-item>
        </el-descriptions>
        <div class="drawer-actions">
          <el-button type="warning" :disabled="!canResend || current.bizType !== 'order'" :loading="resending" @click="resend(current)">重发派单通知</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "LifeStaffNotifications" });

import LifeAPI from "@/api/life";
import type { AdminStaffNotificationItem, LifeQueryParams } from "@/api/life";
import { hasPerm } from "@/utils/auth";

type TagType = "primary" | "success" | "warning" | "danger" | "info";

const route = useRoute();
const router = useRouter();
const canResend = computed(() => hasPerm("staff:notification:resend"));
const loading = ref(false);
const resending = ref(false);
const detailVisible = ref(false);
const items = ref<AdminStaffNotificationItem[]>([]);
const total = ref(0);
const current = ref<AdminStaffNotificationItem>();
const query = reactive<LifeQueryParams>({
  pageNum: 1,
  pageSize: 20,
  keywords: "",
  staffId: String(route.query.staffId || ""),
  orderId: String(route.query.orderId || ""),
  sendStatus: "",
  isRead: "",
});

onMounted(fetchList);

async function fetchList() {
  loading.value = true;
  try {
    const result = await LifeAPI.getStaffNotifications(query);
    items.value = result.list;
    total.value = result.total;
  } finally {
    loading.value = false;
  }
}

function search() {
  query.pageNum = 1;
  fetchList();
}

function resetQuery() {
  query.pageNum = 1;
  query.keywords = "";
  query.staffId = "";
  query.orderId = "";
  query.sendStatus = "";
  query.isRead = "";
  fetchList();
}

async function openDetail(row: AdminStaffNotificationItem) {
  current.value = await LifeAPI.getStaffNotificationDetail(row.id);
  detailVisible.value = true;
}

async function resend(row: AdminStaffNotificationItem) {
  await ElMessageBox.confirm(`确认给师傅 #${row.staffId} 重发订单 ${row.orderNo || row.orderId} 的派单通知吗？`, "重发派单通知", {
    type: "warning",
  });
  resending.value = true;
  try {
    const result = await LifeAPI.resendStaffNotification(row.id);
    ElMessage.success("派单通知已重发");
    current.value = result;
    await fetchList();
  } finally {
    resending.value = false;
  }
}

function goOrder(orderId?: number | null) {
  if (!orderId) return;
  router.push(`/orders/detail/${orderId}`);
}

function sendStatusMeta(status: string): { label: string; type: TagType } {
  const map: Record<string, { label: string; type: TagType }> = {
    sent: { label: "已发送", type: "success" },
    created: { label: "已创建", type: "primary" },
    failed: { label: "失败", type: "danger" },
  };
  return map[status] || { label: status || "-", type: "info" };
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
</script>

<style scoped>
.staff-notification-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-header h2 {
  margin: 0 0 4px;
  font-size: 20px;
}

.page-header p,
.muted {
  margin: 0;
  color: var(--el-text-color-secondary);
}

.pagination-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.drawer-actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
