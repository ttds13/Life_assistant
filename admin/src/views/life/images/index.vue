<template>
  <div class="page-container image-page">
    <el-card class="image-header" shadow="never">
      <div>
        <h2>图片库</h2>
        <p>统一查看用户端、师傅端和后台上传到后端的业务图片。</p>
      </div>
      <el-button icon="refresh" @click="fetchImages">刷新</el-button>
    </el-card>

    <el-card class="page-search" shadow="never">
      <el-form :model="queryParams" :inline="true">
        <el-form-item label="关键词">
          <el-input v-model="queryParams.keyword" placeholder="文件名 / URL / storageKey" clearable @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="queryParams.bizType" clearable filterable style="width: 190px">
            <el-option v-for="item in bizTypeOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="业务ID">
          <el-input v-model="queryParams.bizId" clearable style="width: 120px" />
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="queryParams.source" clearable style="width: 150px">
            <el-option label="miniapp_user" value="miniapp_user" />
            <el-option label="miniapp_staff" value="miniapp_staff" />
            <el-option label="admin" value="admin" />
            <el-option label="system" value="system" />
            <el-option label="migration" value="migration" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="queryParams.status" clearable style="width: 130px">
            <el-option label="active" value="active" />
            <el-option label="orphaned" value="orphaned" />
            <el-option label="deleted" value="deleted" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="queryParams.onlyOrphaned">仅孤立图</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="search" @click="handleSearch">搜索</el-button>
          <el-button icon="refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="page-content" shadow="never">
      <el-table v-loading="loading" :data="tableData" border>
        <el-table-column label="预览" width="110" fixed="left">
          <template #default="{ row }">
            <el-image
              class="image-thumb"
              :src="row.displayUrl || row.url"
              fit="cover"
              :preview-src-list="[row.displayUrl || row.url]"
              preview-teleported
            />
          </template>
        </el-table-column>
        <el-table-column prop="filename" label="文件名" min-width="180" show-overflow-tooltip />
        <el-table-column prop="bizType" label="类型" width="170" show-overflow-tooltip />
        <el-table-column prop="bizId" label="业务ID" width="100" />
        <el-table-column label="引用" width="90">
          <template #default="{ row }">
            <el-tag :type="row.referenceCount > 0 ? 'success' : 'info'">{{ row.referenceCount }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="source" label="来源" width="130" />
        <el-table-column prop="uploaderType" label="上传方" width="100" />
        <el-table-column prop="uploaderId" label="上传ID" width="100" />
        <el-table-column label="大小" width="100">
          <template #default="{ row }">{{ formatSize(row.size) }}</template>
        </el-table-column>
        <el-table-column prop="mimeType" label="MIME" width="130" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : row.status === 'deleted' ? 'danger' : 'info'">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="上传时间" width="180" />
        <el-table-column fixed="right" label="操作" width="250">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openDetail(row)">详情</el-button>
            <el-button type="success" link size="small" @click="openReferences(row)">引用</el-button>
            <el-button type="info" link size="small" @click="copyUrl(row.url)">复制URL</el-button>
            <el-button
              type="danger"
              link
              size="small"
              :disabled="row.referenceCount > 0 || row.status === 'deleted'"
              @click="deleteImage(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <pagination
        v-if="total > 0"
        v-model:total="total"
        v-model:page="queryParams.page"
        v-model:limit="queryParams.pageSize"
        @pagination="fetchImages"
      />
    </el-card>

    <el-dialog v-model="detailVisible" title="图片详情" width="820px">
      <div v-if="currentImage" class="image-detail">
        <el-image class="image-detail__preview" :src="currentImage.displayUrl || currentImage.url" fit="contain" />
        <el-descriptions :column="2" border>
          <el-descriptions-item label="ID">{{ currentImage.id }}</el-descriptions-item>
          <el-descriptions-item label="UUID">{{ currentImage.uuid }}</el-descriptions-item>
          <el-descriptions-item label="业务类型">{{ currentImage.bizType }}</el-descriptions-item>
          <el-descriptions-item label="业务ID">{{ currentImage.bizId || "-" }}</el-descriptions-item>
          <el-descriptions-item label="storageKey" :span="2">{{ currentImage.storageKey }}</el-descriptions-item>
          <el-descriptions-item label="永久URL" :span="2">{{ currentImage.url }}</el-descriptions-item>
        </el-descriptions>
        <el-form class="image-edit" label-width="80px">
          <el-form-item label="Alt">
            <el-input v-model="editForm.alt" maxlength="128" show-word-limit />
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="editForm.remark" type="textarea" :rows="3" maxlength="512" show-word-limit />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button type="primary" :loading="saving" @click="saveImage">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="referenceVisible" title="业务引用" width="760px">
      <el-empty v-if="!references.length" description="暂无业务引用" />
      <el-table v-else :data="references" border>
        <el-table-column prop="type" label="类型" width="160" />
        <el-table-column prop="table" label="表" width="140" />
        <el-table-column prop="field" label="字段" width="150" />
        <el-table-column prop="recordId" label="记录ID" width="100" />
        <el-table-column prop="title" label="说明" min-width="220" show-overflow-tooltip />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "LifeImageLibrary" });

import ImageAPI from "@/api/images";
import type { ImageRecord, ImageReference } from "@/api/images";

const bizTypeOptions = [
  "user_avatar",
  "staff_avatar",
  "staff_application",
  "service_finish_photo",
  "service_checkin_photo",
  "feedback_image",
  "after_sales_image",
  "home_banner",
  "service_cover",
  "service_image",
  "admin_avatar",
  "rich_text_image",
  "review_image",
  "system_default_avatar",
  "admin_image",
  "image",
  "order_photo",
];

const loading = ref(false);
const saving = ref(false);
const tableData = ref<ImageRecord[]>([]);
const total = ref(0);
const detailVisible = ref(false);
const referenceVisible = ref(false);
const currentImage = ref<ImageRecord | null>(null);
const references = ref<ImageReference[]>([]);
const editForm = reactive({ alt: "", remark: "" });

const queryParams = reactive({
  page: 1,
  pageSize: 10,
  keyword: "",
  bizType: "",
  bizId: "",
  source: "",
  status: "",
  onlyOrphaned: false,
});

async function fetchImages() {
  loading.value = true;
  try {
    const data = await ImageAPI.list({
      ...queryParams,
      bizType: queryParams.bizType || undefined,
      bizId: queryParams.bizId || undefined,
      source: queryParams.source || undefined,
      status: queryParams.status || undefined,
      keyword: queryParams.keyword || undefined,
    });
    tableData.value = data.items || [];
    total.value = data.total || 0;
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  queryParams.page = 1;
  fetchImages();
}

function handleReset() {
  queryParams.page = 1;
  queryParams.keyword = "";
  queryParams.bizType = "";
  queryParams.bizId = "";
  queryParams.source = "";
  queryParams.status = "";
  queryParams.onlyOrphaned = false;
  fetchImages();
}

async function openDetail(row: ImageRecord) {
  currentImage.value = await ImageAPI.detail(row.id);
  editForm.alt = currentImage.value.alt || "";
  editForm.remark = currentImage.value.remark || "";
  detailVisible.value = true;
}

async function saveImage() {
  if (!currentImage.value) return;
  saving.value = true;
  try {
    currentImage.value = await ImageAPI.update(currentImage.value.id, {
      alt: editForm.alt,
      remark: editForm.remark,
    });
    ElMessage.success("图片信息已更新");
    detailVisible.value = false;
    fetchImages();
  } finally {
    saving.value = false;
  }
}

async function openReferences(row: ImageRecord) {
  const data = await ImageAPI.references(row.id);
  references.value = data.references || [];
  referenceVisible.value = true;
}

async function deleteImage(row: ImageRecord) {
  await ElMessageBox.confirm("确认删除这张未引用图片吗？删除后会标记为 deleted，不会物理删除 OSS 对象。", "删除确认", {
    type: "warning",
    confirmButtonText: "确认删除",
    cancelButtonText: "取消",
  });
  await ImageAPI.delete(row.id);
  ElMessage.success("图片已删除");
  fetchImages();
}

async function copyUrl(url: string) {
  await navigator.clipboard.writeText(url);
  ElMessage.success("URL 已复制");
}

function formatSize(size: number) {
  if (!size) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

onMounted(fetchImages);
</script>

<style scoped lang="scss">
.image-page {
  display: flex;
  flex-direction: column;
}

.image-header {
  margin-bottom: var(--page-gap);

  :deep(.el-card__body) {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }

  p {
    margin: 6px 0 0;
    color: var(--el-text-color-secondary);
  }
}

.image-thumb {
  width: 72px;
  height: 72px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}

.image-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.image-detail__preview {
  width: 100%;
  height: 320px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}

.image-edit {
  margin-top: 4px;
}
</style>
