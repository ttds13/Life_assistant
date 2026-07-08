<template>
  <div class="page-container withdraw-page">
    <el-card class="page-header" shadow="never">
      <div>
        <h2>提现管理</h2>
        <p>处理师傅提现审核、打款、重试、查单、撤销和人工异常单。</p>
      </div>
      <el-button type="primary" icon="refresh" @click="fetchList">刷新</el-button>
    </el-card>

    <el-card class="page-search" shadow="never">
      <el-form :model="queryParams" :inline="true">
        <el-form-item label="关键词">
          <el-input
            v-model="queryParams.keywords"
            placeholder="提现单号 / 师傅 / 手机号 / 微信单号"
            clearable
            @keyup.enter="fetchList"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="queryParams.status" style="width: 180px" clearable>
            <el-option label="全部" value="" />
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="search" @click="fetchList">搜索</el-button>
          <el-button icon="refresh" @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="page-content" shadow="never">
      <el-table v-loading="loading" :data="items" border>
        <el-table-column label="提现单号" prop="withdrawNo" min-width="190" fixed="left" />
        <el-table-column label="师傅" min-width="150">
          <template #default="{ row }">
            <div>{{ row.staffName || "-" }}</div>
            <el-text type="info" size="small">{{ row.staffPhone || "-" }}</el-text>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="120" align="right">
          <template #default="{ row }">¥{{ money(row.amount) }}</template>
        </el-table-column>
        <el-table-column label="快照余额" width="120" align="right">
          <template #default="{ row }">¥{{ money(row.availableSnapshot) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="130">
          <template #default="{ row }">
            <el-tag :type="statusMeta(row.status).type">{{ statusMeta(row.status).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="渠道" prop="channel" width="100" />
        <el-table-column label="微信转账单号" prop="transferBillNo" min-width="180" />
        <el-table-column label="失败/拒绝原因" min-width="180">
          <template #default="{ row }">{{ row.failureReason || row.rejectReason || "-" }}</template>
        </el-table-column>
        <el-table-column label="申请时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="审核时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.reviewedAt) }}</template>
        </el-table-column>
        <el-table-column label="到账时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.paidAt) }}</template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="300">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openDetail(row)">详情</el-button>
            <el-button
              v-if="canApprove(row)"
              type="success"
              link
              size="small"
              @click="openReview(row, 'approve')"
            >
              通过
            </el-button>
            <el-button
              v-if="canReject(row)"
              type="danger"
              link
              size="small"
              @click="openReview(row, 'reject')"
            >
              拒绝
            </el-button>
            <el-button
              v-if="canExecute(row)"
              type="warning"
              link
              size="small"
              @click="openExecute(row, 'execute')"
            >
              打款
            </el-button>
            <el-button
              v-if="canRetry(row)"
              type="warning"
              link
              size="small"
              @click="openExecute(row, 'retry')"
            >
              重试
            </el-button>
            <el-button
              v-if="canReconcile(row)"
              link
              size="small"
              @click="queryTransfer(row)"
            >
              查单
            </el-button>
            <el-dropdown v-if="canMore(row)" trigger="click">
              <el-button link size="small">更多</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="canCancel(row)" @click="cancelTransfer(row)">撤销转账</el-dropdown-item>
                  <el-dropdown-item v-if="hasPerm('finance:withdraw:reconcile')" @click="openManual(row)">人工处理</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>

      <pagination
        v-if="total > 0"
        v-model:total="total"
        v-model:page="queryParams.pageNum"
        v-model:limit="queryParams.pageSize"
        @pagination="fetchList"
      />
    </el-card>

    <el-dialog v-model="detailVisible" title="提现详情" width="880px">
      <div v-loading="detailLoading">
        <el-descriptions v-if="detail" :column="2" border>
          <el-descriptions-item label="提现单号">{{ detail.withdrawNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ statusMeta(detail.status).label }}</el-descriptions-item>
          <el-descriptions-item label="师傅">{{ detail.staffName || "-" }} / {{ detail.staffPhone || "-" }}</el-descriptions-item>
          <el-descriptions-item label="金额">¥{{ money(detail.amount) }}</el-descriptions-item>
          <el-descriptions-item label="渠道">{{ detail.channel }}</el-descriptions-item>
          <el-descriptions-item label="商户单号">{{ detail.outBillNo || "-" }}</el-descriptions-item>
          <el-descriptions-item label="微信单号">{{ detail.transferBillNo || "-" }}</el-descriptions-item>
          <el-descriptions-item label="重试次数">{{ detail.retryCount }}</el-descriptions-item>
          <el-descriptions-item label="失败原因" :span="2">{{ detail.failureReason || detail.rejectReason || "-" }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">关联收入</el-divider>
        <el-table :data="detail?.incomeRecords || []" border size="small">
          <el-table-column prop="orderNo" label="订单号" min-width="160" />
          <el-table-column prop="orderStatus" label="订单状态" width="120" />
          <el-table-column label="金额" width="120" align="right">
            <template #default="{ row }">¥{{ money(row.amount) }}</template>
          </el-table-column>
          <el-table-column prop="settlementStatus" label="结算状态" width="120" />
          <el-table-column prop="withdrawStatus" label="提现状态" width="120" />
          <el-table-column label="可提现时间" width="170">
            <template #default="{ row }">{{ formatDateTime(row.availableAt) }}</template>
          </el-table-column>
        </el-table>

        <el-divider content-position="left">状态日志</el-divider>
        <el-timeline>
          <el-timeline-item
            v-for="log in detail?.statusLogs || []"
            :key="log.id"
            :timestamp="formatDateTime(log.createdAt)"
            placement="top"
          >
            <div>
              <strong>{{ statusMeta(log.toStatus).label }}</strong>
              <span class="log-action">{{ log.action }}</span>
            </div>
            <p>{{ log.remark || "-" }}</p>
          </el-timeline-item>
        </el-timeline>
      </div>
    </el-dialog>

    <el-dialog v-model="reviewVisible" :title="reviewAction === 'approve' ? '审核通过' : '审核拒绝'" width="520px">
      <el-form label-width="90px">
        <el-form-item label="提现单">
          <el-text>{{ current?.withdrawNo }}</el-text>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="reviewRemark" type="textarea" :rows="3" placeholder="请输入审核说明" />
        </el-form-item>
        <el-form-item v-if="reviewAction === 'approve'" label="立即打款">
          <el-switch v-model="executeNow" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reviewVisible = false">取消</el-button>
        <el-button type="primary" @click="submitReview">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="executeVisible" :title="executeMode === 'retry' ? '重试打款' : '执行打款'" width="520px">
      <el-form label-width="100px">
        <el-form-item label="提现单">
          <el-text>{{ current?.withdrawNo }}</el-text>
        </el-form-item>
        <el-form-item label="Mock结果">
          <el-select v-model="mockResult" style="width: 180px">
            <el-option label="成功" value="success" />
            <el-option label="失败" value="failed" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="executeRemark" type="textarea" :rows="3" placeholder="请输入打款说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="executeVisible = false">取消</el-button>
        <el-button type="primary" @click="submitExecute">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="manualVisible" title="人工处理" width="520px">
      <el-form label-width="100px">
        <el-form-item label="提现单">
          <el-text>{{ current?.withdrawNo }}</el-text>
        </el-form-item>
        <el-form-item label="处理状态">
          <el-select v-model="manualStatus" style="width: 220px">
            <el-option label="人工处理中" value="manual_handling" />
            <el-option label="标记已到账" value="paid" />
            <el-option label="标记失败" value="failed" />
            <el-option label="标记取消" value="cancelled" />
            <el-option label="标记过期" value="expired" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="manualStatus === 'paid'" label="转账单号">
          <el-input v-model="manualTransferBillNo" placeholder="线下或微信转账单号" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="manualRemark" type="textarea" :rows="3" placeholder="请输入人工处理说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="manualVisible = false">取消</el-button>
        <el-button type="primary" @click="submitManual">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "LifeWithdraws" });

import LifeAPI from "@/api/life";
import type { AdminWithdrawDetail, AdminWithdrawRequest, LifeQueryParams, WithdrawStatus } from "@/api/life";
import { hasPerm } from "@/utils/auth";

const loading = ref(false);
const detailLoading = ref(false);
const items = ref<AdminWithdrawRequest[]>([]);
const total = ref(0);
const current = ref<AdminWithdrawRequest | null>(null);
const detail = ref<AdminWithdrawDetail | null>(null);
const detailVisible = ref(false);
const reviewVisible = ref(false);
const reviewAction = ref<"approve" | "reject">("approve");
const reviewRemark = ref("");
const executeNow = ref(false);
const executeVisible = ref(false);
const executeMode = ref<"execute" | "retry">("execute");
const executeRemark = ref("");
const mockResult = ref<"success" | "failed">("success");
const manualVisible = ref(false);
const manualStatus = ref<"paid" | "failed" | "cancelled" | "expired" | "manual_handling">("manual_handling");
const manualRemark = ref("");
const manualTransferBillNo = ref("");

const queryParams = reactive<LifeQueryParams>({
  pageNum: 1,
  pageSize: 10,
  keywords: "",
  status: "",
});

const statusOptions = [
  { label: "待审核", value: "pending_review" },
  { label: "待打款", value: "approved" },
  { label: "打款中", value: "processing" },
  { label: "待用户确认", value: "wait_user_confirm" },
  { label: "已到账", value: "paid" },
  { label: "失败", value: "failed" },
  { label: "已拒绝", value: "rejected" },
  { label: "已取消", value: "cancelled" },
  { label: "人工处理", value: "manual_handling" },
];

onMounted(() => {
  fetchList();
});

async function fetchList() {
  loading.value = true;
  try {
    const data = await LifeAPI.getWithdrawRequests(queryParams);
    items.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function resetQuery() {
  queryParams.pageNum = 1;
  queryParams.keywords = "";
  queryParams.status = "";
  fetchList();
}

async function openDetail(row: AdminWithdrawRequest) {
  current.value = row;
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    detail.value = await LifeAPI.getWithdrawDetail(row.id);
  } finally {
    detailLoading.value = false;
  }
}

function openReview(row: AdminWithdrawRequest, action: "approve" | "reject") {
  current.value = row;
  reviewAction.value = action;
  reviewRemark.value = "";
  executeNow.value = false;
  reviewVisible.value = true;
}

async function submitReview() {
  if (!current.value) return;
  await LifeAPI.reviewWithdrawRequest(current.value.id, {
    action: reviewAction.value,
    remark: reviewRemark.value,
    executeNow: executeNow.value,
  });
  ElMessage.success(reviewAction.value === "approve" ? "审核已通过" : "提现已拒绝");
  reviewVisible.value = false;
  fetchList();
}

function openExecute(row: AdminWithdrawRequest, mode: "execute" | "retry") {
  current.value = row;
  executeMode.value = mode;
  executeRemark.value = "";
  mockResult.value = "success";
  executeVisible.value = true;
}

async function submitExecute() {
  if (!current.value) return;
  const payload = { remark: executeRemark.value, mockResult: mockResult.value };
  if (executeMode.value === "retry") {
    await LifeAPI.retryWithdrawRequest(current.value.id, payload);
    ElMessage.success("重试已提交");
  } else {
    await LifeAPI.executeWithdrawRequest(current.value.id, payload);
    ElMessage.success("打款已提交");
  }
  executeVisible.value = false;
  fetchList();
}

async function queryTransfer(row: AdminWithdrawRequest) {
  await LifeAPI.queryWithdrawTransfer(row.id);
  ElMessage.success("查单已完成");
  fetchList();
}

async function cancelTransfer(row: AdminWithdrawRequest) {
  await ElMessageBox.confirm("确认撤销这笔未确认转账？", "撤销转账", { type: "warning" });
  await LifeAPI.cancelWithdrawTransfer(row.id);
  ElMessage.success("已撤销");
  fetchList();
}

function openManual(row: AdminWithdrawRequest) {
  current.value = row;
  manualStatus.value = "manual_handling";
  manualRemark.value = "";
  manualTransferBillNo.value = "";
  manualVisible.value = true;
}

async function submitManual() {
  if (!current.value) return;
  await LifeAPI.manualHandleWithdraw(current.value.id, {
    status: manualStatus.value,
    remark: manualRemark.value,
    transferBillNo: manualTransferBillNo.value || undefined,
  });
  ElMessage.success("人工处理已提交");
  manualVisible.value = false;
  fetchList();
}

function canApprove(row: AdminWithdrawRequest) {
  return row.status === "pending_review" && hasPerm("finance:withdraw:audit");
}

function canReject(row: AdminWithdrawRequest) {
  return row.status === "pending_review" && hasPerm("finance:withdraw:audit");
}

function canExecute(row: AdminWithdrawRequest) {
  return row.status === "approved" && hasPerm("finance:withdraw:execute");
}

function canRetry(row: AdminWithdrawRequest) {
  return ["failed", "expired", "cancelled"].includes(row.status) && hasPerm("finance:withdraw:retry");
}

function canCancel(row: AdminWithdrawRequest) {
  return ["approved", "processing", "wait_user_confirm"].includes(row.status) && hasPerm("finance:withdraw:execute");
}

function canReconcile(row: AdminWithdrawRequest) {
  return row.channel === "wechat" && ["processing", "wait_user_confirm", "failed"].includes(row.status) && hasPerm("finance:withdraw:reconcile");
}

function canMore(row: AdminWithdrawRequest) {
  return canCancel(row) || hasPerm("finance:withdraw:reconcile");
}

function money(value?: number) {
  return Number(value || 0).toFixed(2);
}

function statusMeta(status: string): { label: string; type: "primary" | "success" | "warning" | "danger" | "info" } {
  const map: Record<string, { label: string; type: "primary" | "success" | "warning" | "danger" | "info" }> = {
    pending_review: { label: "待审核", type: "warning" },
    approved: { label: "待打款", type: "primary" },
    processing: { label: "打款中", type: "warning" },
    wait_user_confirm: { label: "待用户确认", type: "warning" },
    paid: { label: "已到账", type: "success" },
    failed: { label: "失败", type: "danger" },
    rejected: { label: "已拒绝", type: "danger" },
    cancelled: { label: "已取消", type: "info" },
    expired: { label: "已过期", type: "info" },
    manual_handling: { label: "人工处理", type: "warning" },
  };
  return map[status] || { label: status, type: "info" };
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return useDateFormat(value, "YYYY-MM-DD HH:mm").value;
}
</script>

<style scoped lang="scss">
.page-header {
  margin-bottom: var(--page-gap);

  :deep(.el-card__body) {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  h2 {
    margin: 0;
    font-size: 20px;
  }

  p {
    margin: 6px 0 0;
    color: var(--el-text-color-secondary);
  }
}

.log-action {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
}
</style>

