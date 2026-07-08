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
              v-if="isPendingAudit(row) && canReview(row)"
              type="success"
              link
              size="small"
              @click="openReview(row, 'approve')"
            >
              通过
            </el-button>
            <el-button
              v-if="isPendingAudit(row) && canReview(row)"
              type="danger"
              link
              size="small"
              @click="openReview(row, 'reject')"
            >
              驳回
            </el-button>
            <el-button
              v-if="row.type === 'refund' && row.status === 'failed' && hasPerm('finance:refund:retry')"
              type="warning"
              link
              size="small"
              @click="openReview(row, 'retry')"
            >
              重试
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

    <el-dialog v-model="detailVisible" title="审核详情" width="720px">
      <div v-loading="detailLoading">
        <el-descriptions v-if="currentAudit" :column="1" border>
          <el-descriptions-item label="标题">{{ currentAudit.title }}</el-descriptions-item>
          <el-descriptions-item label="申请人">{{ currentAudit.applicant }}</el-descriptions-item>
          <el-descriptions-item label="业务单号">{{ currentAudit.bizNo }}</el-descriptions-item>
          <el-descriptions-item label="申请原因">{{ currentAudit.reason }}</el-descriptions-item>
          <el-descriptions-item label="详情">{{ currentAudit.detail }}</el-descriptions-item>
        </el-descriptions>

        <div v-if="ticketDetail" class="ticket-detail">
          <el-divider content-position="left">售后沟通</el-divider>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="工单号">{{ ticketDetail.ticketNo }}</el-descriptions-item>
            <el-descriptions-item label="状态">{{ ticketStatusLabel(ticketDetail.status) }}</el-descriptions-item>
            <el-descriptions-item label="用户">{{ ticketDetail.userName || "-" }}</el-descriptions-item>
            <el-descriptions-item label="订单号">{{ ticketDetail.orderNo }}</el-descriptions-item>
          </el-descriptions>

          <el-empty v-if="!ticketDetail.messages?.length" description="暂无沟通记录" />
          <el-timeline v-else class="ticket-timeline">
            <el-timeline-item
              v-for="item in ticketDetail.messages"
              :key="item.id"
              :timestamp="formatDateTime(item.createdAt)"
              placement="top"
            >
              <div class="ticket-message">
                <div class="ticket-message__sender">
                  {{ senderLabel(item.senderType) }}
                </div>
                <p>{{ item.content }}</p>
                <div v-if="item.images?.length" class="ticket-images">
                  <el-image
                    v-for="image in item.images"
                    :key="image"
                    :src="image"
                    :preview-src-list="item.images"
                    fit="cover"
                  />
                </div>
              </div>
            </el-timeline-item>
          </el-timeline>

          <div v-if="canOperateTicket" class="ticket-reply">
            <el-input
              v-if="canReplyTicket"
              v-model="ticketReply"
              type="textarea"
              :rows="3"
              maxlength="2000"
              show-word-limit
              placeholder="输入平台回复或处理说明"
            />
            <div v-if="canReplyTicket" class="ticket-reply-images">
              <multi-image-upload
                v-model="ticketReplyImages"
                :data="{ bizType: 'after_sales_image', bizId: ticketDetail.id }"
                :limit="6"
                :max-file-size="5"
              />
            </div>
            <div class="ticket-actions">
              <el-button
                v-if="canReplyTicket"
                type="primary"
                :loading="ticketSubmitting"
                :disabled="!ticketReply.trim()"
                @click="submitTicketReply"
              >
                发送回复
              </el-button>
              <el-button
                v-if="canResolveTicket"
                type="success"
                :loading="ticketSubmitting"
                @click="handleTicketStatus('resolved')"
              >
                标记解决
              </el-button>
              <el-button
                v-if="canResolveTicket"
                type="danger"
                :loading="ticketSubmitting"
                @click="handleTicketStatus('rejected')"
              >
                驳回工单
              </el-button>
              <el-button
                v-if="canResolveTicket"
                :loading="ticketSubmitting"
                @click="handleTicketStatus('closed')"
              >
                关闭工单
              </el-button>
            </div>
          </div>
        </div>
      </div>
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
import type { AfterSalesTicket, AuditItem, AuditType } from "@/api/life";
import { hasPerm } from "@/utils/auth";

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
const ticketDetail = ref<AfterSalesTicket | null>(null);
const detailVisible = ref(false);
const detailLoading = ref(false);
const reviewVisible = ref(false);
const reviewAction = ref<"approve" | "reject" | "retry">("approve");
const reviewRemark = ref("");
const ticketReply = ref("");
const ticketReplyImages = ref<string[]>([]);
const ticketSubmitting = ref(false);
const queryParams = reactive({
  pageNum: 1,
  pageSize: 10,
  keywords: "",
  status: "",
});

const reviewTitle = computed(() => {
  if (reviewAction.value === "approve") return "审核通过";
  if (reviewAction.value === "retry") return "退款重试";
  return "审核驳回";
});
const isActiveTicket = computed(() => !!ticketDetail.value && ["open", "pending"].includes(ticketDetail.value.status));
const canReplyTicket = computed(() => isActiveTicket.value && hasPerm("after-sales:ticket:reply"));
const canResolveTicket = computed(() => isActiveTicket.value && hasPerm("after-sales:ticket:resolve"));
const canOperateTicket = computed(() => canReplyTicket.value || canResolveTicket.value);

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

async function openDetail(row: AuditItem) {
  currentAudit.value = row;
  ticketDetail.value = null;
  ticketReply.value = "";
  ticketReplyImages.value = [];
  detailVisible.value = true;
  if (row.type !== "ticket") return;

  const ticketId = ticketIdFromAudit(row);
  if (!ticketId) return;
  detailLoading.value = true;
  try {
    ticketDetail.value = await LifeAPI.getAfterSalesTicket(ticketId);
  } finally {
    detailLoading.value = false;
  }
}

function openReview(row: AuditItem, action: "approve" | "reject" | "retry") {
  currentAudit.value = row;
  reviewAction.value = action;
  reviewRemark.value = "";
  reviewVisible.value = true;
}

async function submitReview() {
  if (!currentAudit.value) return;
  if (reviewAction.value === "retry") {
    await LifeAPI.retryRefund(currentAudit.value.id, {
      remark: reviewRemark.value,
    });
    ElMessage.success("退款重试已提交");
  } else {
    await LifeAPI.reviewAuditItem(currentAudit.value.id, {
      action: reviewAction.value,
      remark: reviewRemark.value,
    });
    ElMessage.success(reviewAction.value === "approve" ? "审核已通过" : "审核已驳回");
  }
  reviewVisible.value = false;
  fetchAudits();
}

function canReview(row: AuditItem) {
  const permissionMap: Partial<Record<AuditType, string>> = {
    staff: "staff:audit",
    refund: "finance:refund:audit",
    withdraw: "finance:withdraw:audit",
    ticket: "after-sales:ticket:resolve",
  };
  const permission = permissionMap[row.type];
  return permission ? hasPerm(permission) : false;
}

function isPendingAudit(row: AuditItem) {
  return row.status === "pending" || row.status === "pending_review";
}

function ticketIdFromAudit(row: AuditItem) {
  if (row.type !== "ticket") return "";
  return row.id.includes(":") ? row.id.split(":").pop() || "" : row.id;
}

async function submitTicketReply() {
  if (!ticketDetail.value || !ticketReply.value.trim()) return;
  ticketSubmitting.value = true;
  try {
    ticketDetail.value = await LifeAPI.replyAfterSalesTicket(String(ticketDetail.value.id), {
      content: ticketReply.value.trim(),
      images: ticketReplyImages.value,
    });
    ticketReply.value = "";
    ticketReplyImages.value = [];
    ElMessage.success("售后回复已发送");
    fetchAudits();
  } finally {
    ticketSubmitting.value = false;
  }
}

async function handleTicketStatus(status: "resolved" | "rejected" | "closed") {
  if (!ticketDetail.value) return;
  const remark = ticketReply.value.trim() || undefined;
  ticketSubmitting.value = true;
  try {
    if (status === "resolved") {
      ticketDetail.value = await LifeAPI.resolveAfterSalesTicket(String(ticketDetail.value.id), { remark });
      ElMessage.success("售后工单已标记解决");
    } else if (status === "rejected") {
      ticketDetail.value = await LifeAPI.rejectAfterSalesTicket(String(ticketDetail.value.id), { remark });
      ElMessage.success("售后工单已驳回");
    } else {
      ticketDetail.value = await LifeAPI.closeAfterSalesTicket(String(ticketDetail.value.id), { remark });
      ElMessage.success("售后工单已关闭");
    }
    ticketReply.value = "";
    ticketReplyImages.value = [];
    fetchAudits();
  } finally {
    ticketSubmitting.value = false;
  }
}

function senderLabel(senderType: string) {
  if (senderType === "admin") return "平台客服";
  if (senderType === "staff") return "服务人员";
  return "用户";
}

function ticketStatusLabel(status: string) {
  const map: Record<string, string> = {
    open: "待处理",
    pending: "处理中",
    resolved: "已解决",
    rejected: "已驳回",
    closed: "已关闭",
  };
  return map[status] || status;
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
    pending_review: { label: "待审核", type: "warning" },
    approved: { label: "已通过", type: "success" },
    processing: { label: "退款处理中", type: "warning" },
    refunded: { label: "已退款", type: "info" },
    failed: { label: "退款失败", type: "danger" },
    rejected: { label: "已驳回", type: "danger" },
  };
  return map[status] || { label: status, type: "info" };
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return useDateFormat(value, "YYYY-MM-DD HH:mm").value;
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

.ticket-detail {
  margin-top: 16px;
}

.ticket-timeline {
  margin-top: 18px;
}

.ticket-message {
  p {
    margin: 6px 0 0;
    line-height: 1.6;
    color: var(--el-text-color-primary);
  }

  &__sender {
    font-weight: 600;
    color: var(--el-color-primary);
  }
}

.ticket-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;

  :deep(.el-image) {
    width: 72px;
    height: 72px;
    overflow: hidden;
    border-radius: 6px;
  }
}

.ticket-reply {
  margin-top: 16px;
}

.ticket-reply-images {
  margin-top: 12px;
}

.ticket-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
</style>
