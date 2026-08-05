<template>
  <div class="page-container member-card-products">
    <el-card class="page-header" shadow="never">
      <div>
        <h2>会员卡商品</h2>
        <p>统一管理会员卡商品内容、分钟权益、适用服务和发布版本。</p>
      </div>
      <div class="header-actions">
        <el-button icon="refresh" @click="fetchProducts">刷新</el-button>
        <el-button type="primary" icon="plus" @click="openCreate">新增商品</el-button>
      </div>
    </el-card>

    <el-card class="page-search" shadow="never">
      <el-form :model="query" :inline="true">
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            placeholder="商品编码 / 商品名称"
            clearable
            style="width: 240px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable style="width: 150px">
            <el-option label="草稿" value="draft" />
            <el-option label="在售" value="active" />
            <el-option label="已下架" value="disabled" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="search" @click="handleSearch">查询</el-button>
          <el-button icon="refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="page-content" shadow="never">
      <div class="table-summary">
        <el-tag type="primary" effect="plain">共 {{ total }} 个商品</el-tag>
        <span>草稿保存不会影响小程序，发布后才更新在售版本。</span>
      </div>

      <el-table v-loading="loading" :data="products" border row-key="id">
        <el-table-column label="封面" width="92" fixed="left">
          <template #default="{ row }">
            <el-image
              v-if="row.coverImage"
              class="product-cover"
              :src="row.coverImageDisplayUrl || row.coverImage"
              fit="cover"
              :preview-src-list="[row.coverImageDisplayUrl || row.coverImage]"
              preview-teleported
            />
            <div v-else class="product-cover product-cover--empty">无</div>
          </template>
        </el-table-column>
        <el-table-column prop="code" label="商品编码" min-width="160" show-overflow-tooltip />
        <el-table-column prop="name" label="商品名称" min-width="170" show-overflow-tooltip />
        <el-table-column label="售价" width="105">
          <template #default="{ row }">¥{{ money(row.price) }}</template>
        </el-table-column>
        <el-table-column prop="totalUnits" label="总分钟" width="95" />
        <el-table-column label="激活 / 有效期" width="150">
          <template #default="{ row }">{{ row.activationDeadlineDays }}天 / {{ row.validityDays }}天</template>
        </el-table-column>
        <el-table-column label="服务规则" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">{{ row.effectiveRuleSummary || "未配置" }}</template>
        </el-table-column>
        <el-table-column label="版本" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.currentVersion > 0" type="primary" effect="plain">v{{ row.currentVersion }}</el-tag>
            <el-tag v-else type="info" effect="plain">未发布</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="草稿" width="105">
          <template #default="{ row }">
            <el-tag :type="row.hasUnpublishedChanges ? 'warning' : 'success'" effect="plain">
              {{ row.hasUnpublishedChanges ? "待发布" : "已同步" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="订单 / 权益卡" width="120">
          <template #default="{ row }">{{ row.soldCount }} / {{ row.userCardCount }}</template>
        </el-table-column>
        <el-table-column label="状态" width="95">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="175" />
        <el-table-column label="操作" width="330" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openEdit(row)">编辑</el-button>
            <el-button
              type="success"
              link
              size="small"
              :disabled="!row.hasUnpublishedChanges"
              @click="publishProduct(row)"
            >
              发布
            </el-button>
            <el-button type="info" link size="small" @click="openVersions(row)">版本</el-button>
            <el-button
              v-if="row.status === 'active'"
              type="warning"
              link
              size="small"
              @click="changeStatus(row, 'disabled')"
            >
              下架
            </el-button>
            <el-button
              v-else-if="row.currentVersion > 0"
              type="success"
              link
              size="small"
              @click="changeStatus(row, 'active')"
            >
              上架
            </el-button>
            <el-button
              v-if="row.status === 'draft' && row.soldCount === 0"
              type="danger"
              link
              size="small"
              @click="deleteDraft(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="fetchProducts"
          @current-change="fetchProducts"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="editorVisible"
      :title="editingId ? '编辑会员卡商品草稿' : '新增会员卡商品'"
      width="1080px"
      destroy-on-close
      top="4vh"
    >
      <el-alert
        v-if="editingProduct?.currentVersion"
        class="editor-alert"
        type="info"
        show-icon
        :closable="false"
        title="本页修改只保存为草稿，不会直接改变小程序当前在售版本。"
      />

      <el-form ref="formRef" :model="form" :rules="formRules" label-width="120px">
        <section class="form-section">
          <h3>基础信息</h3>
          <div class="form-grid">
            <el-form-item label="商品编码" prop="code">
              <el-input v-model="form.code" :disabled="Boolean(editingProduct?.currentVersion)" maxlength="64" />
            </el-form-item>
            <el-form-item label="商品名称" prop="name">
              <el-input v-model="form.name" maxlength="64" show-word-limit />
            </el-form-item>
            <el-form-item label="短描述" prop="description" class="form-grid__wide">
              <el-input v-model="form.description" maxlength="120" show-word-limit />
            </el-form-item>
            <el-form-item label="商品详情" class="form-grid__wide">
              <el-input v-model="form.detail" type="textarea" :rows="4" maxlength="2000" show-word-limit />
            </el-form-item>
            <el-form-item label="购买须知" class="form-grid__wide">
              <el-input v-model="form.purchaseNotice" type="textarea" :rows="3" maxlength="1000" show-word-limit />
            </el-form-item>
            <el-form-item label="商品封面" prop="coverImage">
              <single-image-upload
                v-model="form.coverImage"
                :display-url="coverDisplayUrl"
                :data="{ bizType: 'member_card_cover', source: 'admin' }"
                :style="{ width: '160px', height: '110px' }"
              />
            </el-form-item>
            <el-form-item label="展示排序">
              <el-input-number v-model="form.sortOrder" :min="0" :max="9999" style="width: 100%" />
            </el-form-item>
          </div>
        </section>

        <section class="form-section">
          <h3>售卖与权益</h3>
          <div class="form-grid">
            <el-form-item label="售价" prop="price">
              <el-input-number v-model="form.price" :min="0" :precision="2" :step="10" style="width: 100%" />
            </el-form-item>
            <el-form-item label="总权益分钟" prop="totalUnits">
              <el-input-number v-model="form.totalUnits" :min="1" :step="30" style="width: 100%" />
            </el-form-item>
            <el-form-item label="激活期限" prop="activationDeadlineDays">
              <el-select v-model="form.activationDeadlineDays" allow-create filterable style="width: 100%">
                <el-option v-for="days in activationOptions" :key="days" :label="`${days} 天`" :value="days" />
              </el-select>
            </el-form-item>
            <el-form-item label="激活后有效期" prop="validityDays">
              <el-select v-model="form.validityDays" allow-create filterable style="width: 100%">
                <el-option v-for="days in validityOptions" :key="days" :label="`${days} 天`" :value="days" />
              </el-select>
            </el-form-item>
          </div>
        </section>

        <section class="form-section form-section--rules">
          <div class="section-heading">
            <div>
              <h3>适用服务与核销规则</h3>
              <p>权益统一按整数分钟保存，不填写半次浮点值。</p>
            </div>
            <el-button type="primary" plain icon="plus" @click="addRule">添加服务</el-button>
          </div>

          <el-table :data="form.serviceRuleList" border row-key="key">
            <el-table-column label="服务项目" min-width="210">
              <template #default="{ row }">
                <el-select v-model="row.serviceId" filterable placeholder="选择服务" style="width: 100%" @change="onServiceChange(row)">
                  <el-option
                    v-for="service in availableServices(row)"
                    :key="service.id"
                    :label="`${service.name}（${service.durationMinutes || 0}分钟）`"
                    :value="service.id"
                  />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="核销方式" width="150">
              <template #default="{ row }">
                <el-select v-model="row.consumeMode" style="width: 100%" @change="onModeChange(row)">
                  <el-option label="固定分钟" value="fixed_minutes" />
                  <el-option label="半次服务" value="half_service" />
                  <el-option label="自定义分钟" value="custom_minutes" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="默认分钟" width="130">
              <template #default="{ row }">
                <el-input-number v-model="row.consumeUnits" :min="1" :step="30" controls-position="right" style="width: 100%" />
              </template>
            </el-table-column>
            <el-table-column label="最小分钟" width="130">
              <template #default="{ row }">
                <el-input-number v-model="row.minConsumeMinutes" :min="1" :step="30" controls-position="right" style="width: 100%" />
              </template>
            </el-table-column>
            <el-table-column label="可选分钟档位" min-width="180">
              <template #default="{ row }">
                <el-input
                  v-model="row.allowedMinutesText"
                  :disabled="row.consumeMode === 'fixed_minutes'"
                  placeholder="例如 30,60,120"
                />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="75" fixed="right">
              <template #default="{ $index }">
                <el-button type="danger" link size="small" @click="removeRule($index)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!form.serviceRuleList.length" description="至少添加一项适用服务后再发布" :image-size="72" />
        </section>
      </el-form>

      <template #footer>
        <el-button @click="editorVisible = false">取消</el-button>
        <el-button :disabled="!form.name" @click="previewVisible = true">预览草稿</el-button>
        <el-button type="primary" :loading="saving" @click="saveDraft">保存草稿</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="versionsVisible" title="商品版本记录" size="760px">
      <div v-if="versionProduct" class="version-product-title">
        <strong>{{ versionProduct.name }}</strong>
        <span>当前发布版本 v{{ versionProduct.currentVersion || 0 }}</span>
      </div>
      <el-table v-loading="versionsLoading" :data="versions" border>
        <el-table-column label="版本" width="90">
          <template #default="{ row }">
            <el-tag :type="row.isCurrent ? 'success' : 'info'">v{{ row.version }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="productName" label="商品名称" min-width="150" show-overflow-tooltip />
        <el-table-column label="售价" width="100">
          <template #default="{ row }">¥{{ money(row.price) }}</template>
        </el-table-column>
        <el-table-column prop="totalMinutes" label="分钟" width="85" />
        <el-table-column prop="publishedAt" label="发布时间" width="175" />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="viewVersion(row)">快照</el-button>
            <el-button type="warning" link size="small" @click="copyVersion(row)">复制为草稿</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-drawer>

    <el-dialog v-model="versionDetailVisible" title="版本快照" width="820px">
      <pre class="snapshot-view">{{ versionSnapshotText }}</pre>
    </el-dialog>

    <el-dialog v-model="previewVisible" title="会员卡商品草稿预览" width="760px">
      <div class="draft-preview">
        <div class="draft-preview__cover">
          <el-image v-if="form.coverImage" :src="coverDisplayUrl || form.coverImage" fit="cover" />
          <span v-else>会员卡</span>
        </div>
        <div class="draft-preview__body">
          <h3>{{ form.name || "未命名会员卡" }}</h3>
          <p>{{ form.description || "暂无商品短描述" }}</p>
          <strong>¥{{ money(form.price) }}</strong>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="总权益">{{ form.totalUnits }} 分钟</el-descriptions-item>
            <el-descriptions-item label="适用服务">{{ form.serviceRuleList.length }} 项</el-descriptions-item>
            <el-descriptions-item label="激活期限">{{ form.activationDeadlineDays }} 天</el-descriptions-item>
            <el-descriptions-item label="有效期">{{ form.validityDays }} 天</el-descriptions-item>
          </el-descriptions>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from "element-plus";
import LifeAPI from "@/api/life";
import type {
  LifeResourceRecord,
  MemberCardProduct,
  MemberCardProductPayload,
  MemberCardProductServiceRule,
  MemberCardProductVersion,
} from "@/api/life/types";

defineOptions({ name: "LifeMemberCardProducts" });

interface ServiceOption {
  id: number;
  name: string;
  code: string;
  durationMinutes: number;
}

interface EditorRule extends Omit<MemberCardProductServiceRule, "allowedMinutes" | "status"> {
  key: string;
  allowedMinutes: number[];
  allowedMinutesText: string;
  status: number;
}

interface EditorForm extends Omit<MemberCardProductPayload, "serviceRuleList"> {
  serviceRuleList: EditorRule[];
}

const activationOptions = [7, 15, 30, 60, 90];
const validityOptions = [30, 90, 180, 365, 730];
const loading = ref(false);
const saving = ref(false);
const products = ref<MemberCardProduct[]>([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 20, keyword: "", status: "" });
const editorVisible = ref(false);
const editingId = ref<string | null>(null);
const editingProduct = ref<MemberCardProduct | null>(null);
const formRef = ref<FormInstance>();
const coverDisplayUrl = ref("");
const serviceOptions = ref<ServiceOption[]>([]);
const versionsVisible = ref(false);
const versionsLoading = ref(false);
const versions = ref<MemberCardProductVersion[]>([]);
const versionProduct = ref<MemberCardProduct | null>(null);
const versionDetailVisible = ref(false);
const versionSnapshotText = ref("");
const previewVisible = ref(false);

function defaultForm(): EditorForm {
  return {
    code: "",
    name: "",
    description: "",
    detail: "",
    coverImage: "",
    purchaseNotice: "",
    sortOrder: 0,
    totalUnits: 720,
    price: 0,
    activationDeadlineDays: 30,
    validityDays: 365,
    minConsumeUnits: 30,
    allowHalfDeduct: false,
    serviceRuleList: [],
  };
}

const form = reactive<EditorForm>(defaultForm());
const formRules: FormRules<EditorForm> = {
  code: [{ required: true, message: "请输入商品编码", trigger: "blur" }],
  name: [{ required: true, message: "请输入商品名称", trigger: "blur" }],
  description: [{ required: true, message: "请输入商品短描述", trigger: "blur" }],
  coverImage: [{ required: true, message: "请上传商品封面", trigger: "change" }],
  price: [{ required: true, message: "请输入售价", trigger: "change" }],
  totalUnits: [{ required: true, message: "请输入总权益分钟", trigger: "change" }],
  activationDeadlineDays: [{ required: true, message: "请选择激活期限", trigger: "change" }],
  validityDays: [{ required: true, message: "请选择有效期", trigger: "change" }],
};

function ruleKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toEditorRule(rule?: Partial<MemberCardProductServiceRule>): EditorRule {
  const allowedMinutes = Array.isArray(rule?.allowedMinutes) ? rule.allowedMinutes.map(Number).filter(Boolean) : [];
  return {
    key: ruleKey(),
    serviceId: Number(rule?.serviceId || 0),
    serviceCode: rule?.serviceCode || "",
    serviceName: rule?.serviceName || "",
    serviceDurationMinutes: Number(rule?.serviceDurationMinutes || 0),
    consumeUnits: Number(rule?.consumeUnits || 60),
    consumeMode: rule?.consumeMode || "fixed_minutes",
    minConsumeMinutes: Number(rule?.minConsumeMinutes || rule?.consumeUnits || 30),
    allowedMinutes,
    allowedMinutesText: allowedMinutes.join(","),
    status: rule?.status === "disabled" || rule?.status === 0 ? 0 : 1,
    remark: rule?.remark || "",
  };
}

async function fetchProducts() {
  loading.value = true;
  try {
    const result = await LifeAPI.getMemberCardProducts({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
      status: query.status || undefined,
    });
    products.value = result.items;
    total.value = result.total;
  } finally {
    loading.value = false;
  }
}

async function loadServiceOptions() {
  const result = await LifeAPI.getResourcePage("services", {
    pageNum: 1,
    pageSize: 200,
    keywords: "",
    status: "active",
    module: "services",
  });
  serviceOptions.value = result.list.map((item: LifeResourceRecord) => ({
    id: Number(item.id),
    name: String(item.name || item.id),
    code: String(item.code || ""),
    durationMinutes: Number(item.durationMinutes || 0),
  }));
}

function handleSearch() {
  query.page = 1;
  void fetchProducts();
}

function handleReset() {
  Object.assign(query, { page: 1, pageSize: 20, keyword: "", status: "" });
  void fetchProducts();
}

function resetEditor() {
  Object.assign(form, defaultForm());
  editingId.value = null;
  editingProduct.value = null;
  coverDisplayUrl.value = "";
  formRef.value?.clearValidate();
}

async function openCreate() {
  resetEditor();
  if (!serviceOptions.value.length) await loadServiceOptions();
  editorVisible.value = true;
}

async function openEdit(row: MemberCardProduct) {
  if (!serviceOptions.value.length) await loadServiceOptions();
  const product = await LifeAPI.getMemberCardProduct(row.id);
  resetEditor();
  editingId.value = product.id;
  editingProduct.value = product;
  Object.assign(form, {
    code: product.code,
    name: product.name,
    description: product.description,
    detail: product.detail,
    coverImage: product.coverImageOssUrl || product.coverImage,
    purchaseNotice: product.purchaseNotice,
    sortOrder: product.sortOrder,
    totalUnits: product.totalUnits,
    price: product.price,
    activationDeadlineDays: product.activationDeadlineDays,
    validityDays: product.validityDays,
    minConsumeUnits: product.minConsumeUnits,
    allowHalfDeduct: product.allowHalfDeduct,
    serviceRuleList: product.serviceRuleList.map(toEditorRule),
  });
  coverDisplayUrl.value = product.coverImageDisplayUrl || product.coverImage;
  editorVisible.value = true;
}

function addRule() {
  form.serviceRuleList.push(toEditorRule());
}

function removeRule(index: number) {
  form.serviceRuleList.splice(index, 1);
}

function availableServices(row: EditorRule) {
  const used = new Set(form.serviceRuleList.filter((item) => item !== row).map((item) => item.serviceId));
  return serviceOptions.value.filter((service) => !used.has(service.id) || service.id === row.serviceId);
}

function onServiceChange(row: EditorRule) {
  const service = serviceOptions.value.find((item) => item.id === row.serviceId);
  if (!service) return;
  row.serviceName = service.name;
  row.serviceCode = service.code;
  row.serviceDurationMinutes = service.durationMinutes;
  if (!row.consumeUnits || row.consumeUnits === 60) row.consumeUnits = service.durationMinutes || 60;
  onModeChange(row);
}

function onModeChange(row: EditorRule) {
  const duration = row.serviceDurationMinutes || row.consumeUnits || 60;
  if (row.consumeMode === "fixed_minutes") {
    row.consumeUnits = duration;
    row.minConsumeMinutes = duration;
    row.allowedMinutes = [];
    row.allowedMinutesText = "";
    return;
  }
  if (row.consumeMode === "half_service") {
    const half = Math.max(1, Math.floor(duration / 2));
    row.consumeUnits = duration;
    row.minConsumeMinutes = half;
    row.allowedMinutes = [half, duration];
    row.allowedMinutesText = row.allowedMinutes.join(",");
    return;
  }
  row.minConsumeMinutes = Math.min(row.minConsumeMinutes || 30, duration);
  row.allowedMinutes = row.allowedMinutes.length ? row.allowedMinutes : [row.minConsumeMinutes, duration];
  row.allowedMinutesText = row.allowedMinutes.join(",");
}

function parseMinutes(value: string) {
  return Array.from(
    new Set(
      String(value || "")
        .split(/[,，、\s]+/)
        .map(Number)
        .filter((item) => Number.isInteger(item) && item > 0)
    )
  ).sort((left, right) => left - right);
}

function buildPayload(): MemberCardProductPayload {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    description: form.description?.trim(),
    detail: form.detail?.trim(),
    coverImage: form.coverImage,
    purchaseNotice: form.purchaseNotice?.trim(),
    sortOrder: Number(form.sortOrder || 0),
    totalUnits: Number(form.totalUnits),
    price: Number(form.price),
    activationDeadlineDays: Number(form.activationDeadlineDays),
    validityDays: Number(form.validityDays),
    minConsumeUnits: Number(form.minConsumeUnits || 1),
    allowHalfDeduct: form.serviceRuleList.some((rule) => rule.consumeMode === "half_service"),
    serviceRuleList: form.serviceRuleList.map((rule) => ({
      serviceId: Number(rule.serviceId),
      consumeUnits: Number(rule.consumeUnits),
      consumeMode: rule.consumeMode,
      minConsumeMinutes: Number(rule.minConsumeMinutes),
      allowedMinutes: rule.consumeMode === "fixed_minutes" ? [] : parseMinutes(rule.allowedMinutesText),
      status: 1,
      remark: rule.remark || "",
    })),
  };
}

async function saveDraft() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  if (form.serviceRuleList.some((rule) => !rule.serviceId || rule.consumeUnits <= 0 || rule.minConsumeMinutes <= 0)) {
    ElMessage.warning("请完整填写每项服务的核销规则");
    return;
  }
  saving.value = true;
  try {
    const payload = buildPayload();
    if (editingId.value) await LifeAPI.updateMemberCardProduct(editingId.value, payload);
    else await LifeAPI.createMemberCardProduct(payload);
    ElMessage.success("商品草稿已保存");
    editorVisible.value = false;
    await fetchProducts();
  } finally {
    saving.value = false;
  }
}

async function publishProduct(row: MemberCardProduct) {
  await ElMessageBox.confirm(
    `确认发布「${row.name}」的新版本并上架吗？发布后只影响新购买，历史订单和用户权益卡不会变化。`,
    "发布会员卡商品",
    { type: "warning", confirmButtonText: "发布并上架" }
  );
  await LifeAPI.publishMemberCardProduct(row.id, true);
  ElMessage.success("新版本已发布");
  await fetchProducts();
}

async function changeStatus(row: MemberCardProduct, status: "active" | "disabled") {
  const action = status === "active" ? "上架" : "下架";
  await ElMessageBox.confirm(`确认${action}「${row.name}」吗？`, `${action}会员卡商品`, { type: "warning" });
  await LifeAPI.updateMemberCardProductStatus(row.id, status);
  ElMessage.success(`商品已${action}`);
  await fetchProducts();
}

async function deleteDraft(row: MemberCardProduct) {
  await ElMessageBox.confirm(`确认删除未发布草稿「${row.name}」吗？`, "删除商品草稿", { type: "warning" });
  await LifeAPI.deleteMemberCardProduct(row.id);
  ElMessage.success("草稿已删除");
  await fetchProducts();
}

async function openVersions(row: MemberCardProduct) {
  versionProduct.value = row;
  versionsVisible.value = true;
  versionsLoading.value = true;
  try {
    const result = await LifeAPI.getMemberCardProductVersions(row.id);
    versions.value = result.items;
  } finally {
    versionsLoading.value = false;
  }
}

function viewVersion(row: MemberCardProductVersion) {
  versionSnapshotText.value = JSON.stringify(row.snapshot, null, 2);
  versionDetailVisible.value = true;
}

async function copyVersion(row: MemberCardProductVersion) {
  if (!versionProduct.value) return;
  await ElMessageBox.confirm(`基于 v${row.version} 创建新草稿吗？当前未发布草稿将被覆盖。`, "复制版本", {
    type: "warning",
  });
  await LifeAPI.copyMemberCardProductVersionToDraft(versionProduct.value.id, row.id);
  ElMessage.success(`已基于 v${row.version} 创建草稿`);
  versionsVisible.value = false;
  await fetchProducts();
}

function money(value: number) {
  const amount = Number(value || 0);
  return amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2);
}

function statusText(status: MemberCardProduct["status"]) {
  return status === "active" ? "在售" : status === "disabled" ? "已下架" : "草稿";
}

function statusTag(status: MemberCardProduct["status"]) {
  return status === "active" ? "success" : status === "disabled" ? "info" : "warning";
}

onMounted(() => {
  void Promise.all([fetchProducts(), loadServiceOptions()]);
});
</script>

<style scoped lang="scss">
.member-card-products {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header,
.page-search,
.page-content {
  border-radius: 6px;
}

.page-header :deep(.el-card__body) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.page-header h2,
.form-section h3 {
  margin: 0;
  color: var(--el-text-color-primary);
}

.page-header p,
.section-heading p {
  margin: 6px 0 0;
  color: var(--el-text-color-secondary);
}

.header-actions,
.table-summary,
.section-heading,
.version-product-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.table-summary {
  justify-content: flex-start;
  margin-bottom: 14px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.product-cover {
  width: 60px;
  height: 44px;
  border-radius: 4px;
}

.product-cover--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
  background: var(--el-fill-color-light);
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
}

.editor-alert {
  margin-bottom: 16px;
}

.form-section {
  padding: 0 0 20px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.form-section:last-child {
  padding-bottom: 0;
  margin-bottom: 0;
  border-bottom: 0;
}

.form-section h3 {
  margin-bottom: 16px;
  font-size: 16px;
}

.form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  column-gap: 24px;
}

.form-grid__wide {
  grid-column: 1 / -1;
}

.form-section--rules :deep(.el-form-item) {
  margin-bottom: 0;
}

.section-heading {
  margin-bottom: 14px;
}

.section-heading h3 {
  margin-bottom: 0;
}

.version-product-title {
  justify-content: flex-start;
  margin-bottom: 16px;
}

.version-product-title span {
  color: var(--el-text-color-secondary);
}

.snapshot-view {
  max-height: 60vh;
  padding: 16px;
  overflow: auto;
  color: #d1d5db;
  white-space: pre-wrap;
  word-break: break-word;
  background: #111827;
  border-radius: 4px;
}

.draft-preview {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 24px;
}

.draft-preview__cover {
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
}

.draft-preview__cover :deep(.el-image) {
  width: 100%;
  height: 100%;
}

.draft-preview__body h3 {
  margin: 0 0 8px;
  font-size: 22px;
}

.draft-preview__body p {
  min-height: 44px;
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
}

.draft-preview__body strong {
  display: block;
  margin-bottom: 18px;
  color: var(--el-color-danger);
  font-size: 24px;
}

@media (max-width: 900px) {
  .form-grid,
  .draft-preview {
    grid-template-columns: 1fr;
  }

  .form-grid__wide {
    grid-column: auto;
  }
}
</style>
