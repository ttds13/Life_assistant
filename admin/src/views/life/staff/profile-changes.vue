<template>
  <div class="page-container staff-profile-change-page">
    <el-card class="page-header" shadow="never">
      <div>
        <h2>资料变更复核</h2>
        <p>复核师傅提交的姓名、头像、服务城市、技能和认证资料变更。</p>
      </div>
      <el-button type="primary" icon="refresh" :loading="loading" @click="fetchList">刷新</el-button>
    </el-card>

    <el-card class="page-search" shadow="never">
      <el-form :model="query" :inline="true">
        <el-form-item label="关键词">
          <el-input v-model="query.keywords" clearable placeholder="师傅 / 手机号 / 申请编号" style="width: 240px" @keyup.enter="search" />
        </el-form-item>
        <el-form-item label="师傅ID">
          <el-input v-model="query.staffId" clearable style="width: 120px" @keyup.enter="search" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable style="width: 130px">
            <el-option label="全部" value="" />
            <el-option label="待复核" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已驳回" value="rejected" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="query.changeType" clearable style="width: 130px">
            <el-option label="全部" value="" />
            <el-option label="基础资料" value="basic" />
            <el-option label="认证资料" value="certification" />
            <el-option label="混合变更" value="mixed" />
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
        <el-table-column prop="requestNo" label="申请编号" width="180" />
        <el-table-column label="师傅" min-width="180">
          <template #default="{ row }">
            <strong>#{{ row.staffId }} {{ row.staffName || "-" }}</strong>
            <div class="muted">{{ row.staffPhone || "-" }}</div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="110">
          <template #default="{ row }">{{ changeTypeText(row.changeType) }}</template>
        </el-table-column>
        <el-table-column label="变更字段" min-width="220">
          <template #default="{ row }">
            <el-tag v-for="field in row.changedFields" :key="field" class="field-tag" size="small">
              {{ fieldLabel(field) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusMeta(row.status).type">{{ statusMeta(row.status).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="提交时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="审核时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.reviewedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click="openDetail(row)">详情</el-button>
            <el-button text type="success" :disabled="!canReview || row.status !== 'pending'" @click="approve(row)">通过</el-button>
            <el-button text type="danger" :disabled="!canReview || row.status !== 'pending'" @click="openReject(row)">驳回</el-button>
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

    <el-drawer v-model="detailVisible" title="资料变更详情" size="720px">
      <template v-if="current">
        <el-descriptions :column="2" border class="mb-4">
          <el-descriptions-item label="申请编号">{{ current.requestNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusMeta(current.status).type">{{ statusMeta(current.status).label }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="师傅">#{{ current.staffId }} {{ current.staffName }} / {{ current.staffPhone || "-" }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ changeTypeText(current.changeType) }}</el-descriptions-item>
          <el-descriptions-item label="提交时间">{{ formatDateTime(current.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="审核时间">{{ formatDateTime(current.reviewedAt) }}</el-descriptions-item>
          <el-descriptions-item v-if="current.rejectReason" label="驳回原因" :span="2">{{ current.rejectReason }}</el-descriptions-item>
          <el-descriptions-item v-if="current.submitNote" label="提交备注" :span="2">{{ current.submitNote }}</el-descriptions-item>
        </el-descriptions>

        <el-table :data="snapshotRows(current)" border class="mb-4">
          <el-table-column prop="label" label="字段" width="120" />
          <el-table-column label="变更前" min-width="220">
            <template #default="{ row }">{{ formatValue(row.before) }}</template>
          </el-table-column>
          <el-table-column label="变更后" min-width="220">
            <template #default="{ row }">
              <strong v-if="row.changed">{{ formatValue(row.after) }}</strong>
              <span v-else>{{ formatValue(row.after) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="变更" width="80">
            <template #default="{ row }">
              <el-tag v-if="row.changed" type="warning" size="small">已变更</el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </el-table>

        <div class="image-section">
          <div>
            <h4>头像</h4>
            <div class="image-pair">
              <el-image v-if="current.beforeAvatarDisplayUrl" :src="current.beforeAvatarDisplayUrl" fit="cover" class="avatar-preview" preview-teleported />
              <el-image v-if="current.afterAvatarDisplayUrl" :src="current.afterAvatarDisplayUrl" fit="cover" class="avatar-preview" preview-teleported />
            </div>
          </div>
          <div>
            <h4>认证图片</h4>
            <div class="cert-images">
              <el-image
                v-for="url in current.afterApplicationImageUrls || []"
                :key="url"
                :src="url"
                :preview-src-list="current.afterApplicationImageUrls"
                fit="cover"
                class="cert-image"
                preview-teleported
              />
              <el-empty v-if="!(current.afterApplicationImageUrls || []).length" description="暂无图片" :image-size="48" />
            </div>
          </div>
        </div>

        <div class="drawer-actions">
          <el-button @click="detailVisible = false">关闭</el-button>
          <el-button type="success" :disabled="!canReview || current.status !== 'pending'" :loading="reviewing" @click="approve(current)">通过</el-button>
          <el-button type="danger" :disabled="!canReview || current.status !== 'pending'" @click="openReject(current)">驳回</el-button>
        </div>
      </template>
    </el-drawer>

    <el-dialog v-model="rejectVisible" title="驳回资料变更" width="520px">
      <el-form label-width="90px">
        <el-form-item label="申请编号">
          <el-text>{{ reviewTarget?.requestNo || "-" }}</el-text>
        </el-form-item>
        <el-form-item label="常用原因">
          <el-select v-model="rejectForm.quickReason" clearable style="width: 100%" @change="applyQuickReason">
            <el-option label="头像不清晰" value="头像不清晰，请重新上传正面头像" />
            <el-option label="证件信息不完整" value="证件信息不完整，请补充认证资料" />
            <el-option label="图片不清晰" value="认证图片不清晰，请重新上传" />
            <el-option label="技能材料不足" value="技能材料不足，请补充服务能力说明" />
          </el-select>
        </el-form-item>
        <el-form-item label="驳回原因" required>
          <el-input v-model="rejectForm.rejectReason" type="textarea" :rows="4" maxlength="300" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectVisible = false">取消</el-button>
        <el-button type="danger" :loading="reviewing" :disabled="!rejectForm.rejectReason.trim()" @click="submitReject">确认驳回</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "LifeStaffProfileChanges" });

import LifeAPI from "@/api/life";
import type { LifeQueryParams, StaffProfileChangeRequestItem, StaffProfileSnapshot } from "@/api/life";
import { hasPerm } from "@/utils/auth";

type TagType = "primary" | "success" | "warning" | "danger" | "info";

const route = useRoute();
const canReview = computed(() => hasPerm("staff:profile-change:review"));
const loading = ref(false);
const reviewing = ref(false);
const detailVisible = ref(false);
const rejectVisible = ref(false);
const items = ref<StaffProfileChangeRequestItem[]>([]);
const total = ref(0);
const current = ref<StaffProfileChangeRequestItem>();
const reviewTarget = ref<StaffProfileChangeRequestItem>();
const query = reactive<LifeQueryParams>({
  pageNum: 1,
  pageSize: 20,
  keywords: "",
  staffId: String(route.query.staffId || ""),
  status: String(route.query.status || ""),
  changeType: "",
});
const rejectForm = reactive({
  quickReason: "",
  rejectReason: "",
});

onMounted(fetchList);

async function fetchList() {
  loading.value = true;
  try {
    const result = await LifeAPI.getStaffProfileChangeRequests(query);
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
  query.status = "";
  query.changeType = "";
  fetchList();
}

async function openDetail(row: StaffProfileChangeRequestItem) {
  current.value = await LifeAPI.getStaffProfileChangeRequestDetail(row.id);
  detailVisible.value = true;
}

async function approve(row: StaffProfileChangeRequestItem) {
  await ElMessageBox.confirm(`确认通过资料变更申请 ${row.requestNo} 吗？`, "通过资料变更", {
    type: "warning",
  });
  reviewing.value = true;
  try {
    const result = await LifeAPI.reviewStaffProfileChangeRequest(row.id, { decision: "approve", remark: "admin approve" });
    ElMessage.success("资料变更已通过");
    current.value = result;
    await fetchList();
  } finally {
    reviewing.value = false;
  }
}

function openReject(row: StaffProfileChangeRequestItem) {
  reviewTarget.value = row;
  rejectForm.quickReason = "";
  rejectForm.rejectReason = "";
  rejectVisible.value = true;
}

function applyQuickReason() {
  if (rejectForm.quickReason) rejectForm.rejectReason = rejectForm.quickReason;
}

async function submitReject() {
  if (!reviewTarget.value) return;
  reviewing.value = true;
  try {
    const result = await LifeAPI.reviewStaffProfileChangeRequest(reviewTarget.value.id, {
      decision: "reject",
      rejectReason: rejectForm.rejectReason.trim(),
      remark: "admin reject",
    });
    ElMessage.success("资料变更已驳回");
    current.value = result;
    rejectVisible.value = false;
    await fetchList();
  } finally {
    reviewing.value = false;
  }
}

function snapshotRows(item: StaffProfileChangeRequestItem) {
  const fields = ["name", "avatarUrl", "cityCode", "skills", "idCard", "applicationNote", "applicationImages"] as Array<keyof StaffProfileSnapshot>;
  return fields.map((field) => ({
    field,
    label: fieldLabel(field),
    before: item.beforeSnapshot[field],
    after: item.afterSnapshot[field],
    changed: item.changedFields.includes(field),
  }));
}

function fieldLabel(field: string) {
  const map: Record<string, string> = {
    name: "姓名",
    avatarUrl: "头像",
    cityCode: "城市",
    skills: "技能",
    idCard: "身份证",
    applicationNote: "认证说明",
    applicationImages: "认证图片",
  };
  return map[field] || field;
}

function statusMeta(status: string): { label: string; type: TagType } {
  const map: Record<string, { label: string; type: TagType }> = {
    pending: { label: "待复核", type: "warning" },
    approved: { label: "已通过", type: "success" },
    rejected: { label: "已驳回", type: "danger" },
    cancelled: { label: "已取消", type: "info" },
  };
  return map[status] || { label: status || "-", type: "info" };
}

function changeTypeText(type: string) {
  const map: Record<string, string> = {
    basic: "基础资料",
    certification: "认证资料",
    mixed: "混合变更",
  };
  return map[type] || type || "-";
}

function formatValue(value: unknown) {
  if (Array.isArray(value)) return value.length ? value.join("，") : "-";
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
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
.staff-profile-change-page {
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

.field-tag {
  margin-right: 4px;
  margin-bottom: 4px;
}

.pagination-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.image-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.image-section h4 {
  margin: 0 0 8px;
}

.image-pair,
.cert-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.avatar-preview {
  width: 72px;
  height: 72px;
  border-radius: 6px;
  border: 1px solid var(--el-border-color);
}

.cert-image {
  width: 96px;
  height: 72px;
  border-radius: 6px;
  border: 1px solid var(--el-border-color);
}

.drawer-actions {
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
