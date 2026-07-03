<template>
  <div class="page-container audit-page">
    <el-card class="audit-summary" shadow="never">
      <div>
        <h2>{{ title }}</h2>
        <p>重要操作必须经过确认，审核结果会进入后续审计日志。</p>
      </div>
      <el-tag type="warning" size="large">待处理 {{ total }} 项</el-tag>
    </el-card>

    <el-card class="page-search" shadow="never">
      <el-form :model="queryParams" :inline="true">
        <el-form-item label="关键字">
          <el-input
            v-model="queryParams.keywords"
            placeholder="申请人 / 单号 / 标题"
            clearable
            @keyup.enter="fetchAudits"
          />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="currentType" style="width: 140px" :disabled="lockedType !== 'all'">
            <el-option label="全部" value="all" />
            <el-option label="师傅认证" value="staff" />
            <el-option label="退款" value="refund" />
            <el-option label="提现" value="withdraw" />
            <el-option label="售后工单" value="ticket" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="search" @click="fetchAudits">搜索</el-button>
          <el-button icon="refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="page-content" shadow="never">
      <el-table v-loading="loading" :data="auditList" border>
        <el-table-column label="标题" prop="title" min-width="180" fixed="left" />
        <el-table-column label="类型" width="110">
          <template #default="{ row }">{{ typeLabel(row.type) }}</template>
        </el-table-column>
        <el-table-column label="申请人" prop="applicant" width="120" />
        <el-table-column label="业务单号" prop="bizNo" min-width="150" />
        <el-table-column label="金额" width="110" align="right">
          <template #default="{ row }">{{ row.amount ? `¥${row.amount}` : "-" }}</template>
        </el-table-column>
        <el-table-column label="优先级" width="100">
          <template #default="{ row }">
            <el-tag :type="priorityMeta(row.priority).type">
              {{ priorityMeta(row.priority).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="auditStatusMeta(row.status).type">
              {{ auditStatusMeta(row.status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="提交时间" prop="submittedAt" width="170" />
        <el-table-column fixed="right" label="操作" width="210">
          <template #default="{ row }">
            <el-button type="primary" link size="small" icon="view" @click="openDetail(row)">
              查看
            </el-button>
            <el-button
              v-if="row.status === 'pending'"
              type="success"
              link
              size="small"
              @click="openReview(row, 'approve')"
            >
              通过
            </el-button>
            <el-button
              v-if="row.status === 'pending'"
              type="danger"
              link
              size="small"
              @click="openReview(row, 'reject')"
            >
              驳回
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <pagination
        v-if="total > 0"
        v-model:total="total"
        v-model:page="queryParams.pageNum"
        v-model:limit="queryParams.pageSize"
        @pagination="fetchAudits"
      />
    </el-card>

    <el-dialog v-model="detailVisible" title="审核详情" width="560px">
      <el-descriptions v-if="currentAudit" :column="1" border>
        <el-descriptions-item label="标题">{{ currentAudit.title }}</el-descriptions-item>
        <el-descriptions-item label="申请人">{{ currentAudit.applicant }}</el-descriptions-item>
        <el-descriptions-item label="业务单号">{{ currentAudit.bizNo }}</el-descriptions-item>
        <el-descriptions-item label="申请原因">{{ currentAudit.reason }}</el-descriptions-item>
        <el-descriptions-item label="详情">{{ currentAudit.detail }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>

    <el-dialog v-model="reviewVisible" :title="reviewTitle" width="520px">
      <el-alert
        title="审核操作不可随意撤销，请填写清晰的审核依据。"
        type="warning"
        show-icon
        :closable="false"
        class="mb-4"
      />
      <el-form label-width="90px">
        <el-form-item label="审核对象">
          <el-text>{{ currentAudit?.title }}</el-text>
        </el-form-item>
        <el-form-item label="审核备注">
          <el-input
            v-model="reviewRemark"
            type="textarea"
            :rows="3"
            placeholder="请输入审核说明"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reviewVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!reviewRemark.trim()" @click="submitReview">
          提交审核
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "LifeAuditCenter" });

import LifeAPI from "@/api/life";
import type { AuditItem, AuditType } from "@/api/life";

const route = useRoute();

const lockedType = computed(() => {
  return ((route.meta.params as Record<string, unknown> | undefined)?.type || "all") as AuditType;
});
const currentType = ref<AuditType>("all");
const title = computed(() => {
  const map: Record<AuditType, string> = {
    all: "审核中心",
    staff: "师傅认证审核",
    refund: "退款审核",
    withdraw: "提现审核",
    ticket: "售后工单审核",
  };
  return map[lockedType.value] || "审核中心";
});

const loading = ref(false);
const total = ref(0);
const auditList = ref<AuditItem[]>([]);
const currentAudit = ref<AuditItem>();
const detailVisible = ref(false);
const reviewVisible = ref(false);
const reviewAction = ref<"approve" | "reject">("approve");
const reviewRemark = ref("");
const queryParams = reactive({
  pageNum: 1,
  pageSize: 10,
  keywords: "",
  status: "",
});

const reviewTitle = computed(() => (reviewAction.value === "approve" ? "审核通过" : "审核驳回"));

watch(
  () => lockedType.value,
  () => {
    currentType.value = lockedType.value;
    fetchAudits();
  },
  { immediate: true }
);

watch(
  () => currentType.value,
  () => {
    queryParams.pageNum = 1;
    fetchAudits();
  }
);

async function fetchAudits() {
  loading.value = true;
  try {
    const data = await LifeAPI.getAuditItems(currentType.value, {
      ...queryParams,
      type: currentType.value,
    });
    auditList.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function handleReset() {
  queryParams.pageNum = 1;
  queryParams.keywords = "";
  queryParams.status = "";
  currentType.value = lockedType.value;
  fetchAudits();
}

function openDetail(row: AuditItem) {
  currentAudit.value = row;
  detailVisible.value = true;
}

function openReview(row: AuditItem, action: "approve" | "reject") {
  currentAudit.value = row;
  reviewAction.value = action;
  reviewRemark.value = "";
  reviewVisible.value = true;
}

async function submitReview() {
  if (!currentAudit.value) return;
  await LifeAPI.reviewAuditItem(currentAudit.value.id, {
    action: reviewAction.value,
    remark: reviewRemark.value,
  });
  ElMessage.success(reviewAction.value === "approve" ? "审核已通过" : "审核已驳回");
  reviewVisible.value = false;
  fetchAudits();
}

function typeLabel(type: AuditType) {
  const map: Record<AuditType, string> = {
    all: "全部",
    staff: "师傅认证",
    refund: "退款",
    withdraw: "提现",
    ticket: "售后工单",
  };
  return map[type] || type;
}

function priorityMeta(priority: string): { label: string; type: "primary" | "success" | "warning" | "danger" | "info" } {
  const map: Record<string, { label: string; type: "primary" | "success" | "warning" | "danger" | "info" }> = {
    normal: { label: "普通", type: "info" },
    high: { label: "高", type: "warning" },
    urgent: { label: "紧急", type: "danger" },
  };
  return map[priority] || { label: priority, type: "info" };
}

function auditStatusMeta(status: string): { label: string; type: "primary" | "success" | "warning" | "danger" | "info" } {
  const map: Record<string, { label: string; type: "primary" | "success" | "warning" | "danger" | "info" }> = {
    pending: { label: "待审核", type: "warning" },
    approved: { label: "已通过", type: "success" },
    rejected: { label: "已驳回", type: "danger" },
  };
  return map[status] || { label: status, type: "info" };
}
</script>

<style scoped lang="scss">
.audit-summary {
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
</style>
