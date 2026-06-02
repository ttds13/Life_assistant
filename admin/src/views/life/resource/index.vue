<template>
  <div class="page-container life-page">
    <el-card class="life-header" shadow="never">
      <div>
        <h2>{{ pageConfig?.title || "业务管理" }}</h2>
        <p>{{ pageConfig?.description || "生活助手后台业务数据管理。" }}</p>
      </div>
      <el-button v-if="pageConfig?.primaryAction" type="primary" icon="plus" @click="handleCreate">
        {{ pageConfig.primaryAction }}
      </el-button>
    </el-card>

    <el-card class="page-search" shadow="never">
      <el-form :model="queryParams" :inline="true">
        <el-form-item label="关键词">
          <el-input
            v-model="queryParams.keywords"
            :placeholder="pageConfig?.searchPlaceholder || '请输入关键词'"
            clearable
            @keyup.enter="fetchPage"
          />
        </el-form-item>
        <el-form-item v-if="statusOptions.length > 1" label="状态">
          <el-select v-model="queryParams.status" clearable style="width: 140px">
            <el-option
              v-for="item in statusOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="search" @click="fetchPage">搜索</el-button>
          <el-button icon="refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="page-content" shadow="never">
      <div class="page-toolbar">
        <div class="page-toolbar__left">
          <el-tag type="primary" effect="plain">共 {{ total }} 条</el-tag>
        </div>
        <div class="page-toolbar__right">
          <el-button icon="refresh" @click="fetchPage">刷新</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="tableData" border>
        <el-table-column label="ID" prop="id" width="110" fixed="left" />
        <el-table-column
          v-for="column in pageConfig?.columns || []"
          :key="column.prop"
          :prop="column.prop"
          :label="column.label"
          :width="column.width"
          :min-width="column.minWidth"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <el-tag v-if="column.type === 'tag'" :type="resolveTagType(row[column.prop])">
              {{ formatValue(row[column.prop], column.type) }}
            </el-tag>
            <span v-else>{{ formatValue(row[column.prop], column.type) }}</span>
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="260">
          <template #default="{ row }">
            <el-button type="primary" link size="small" icon="view" @click="handleView(row)">
              查看
            </el-button>
            <el-button
              v-for="action in pageConfig?.rowActions || []"
              :key="action.key"
              :type="action.type || 'primary'"
              link
              size="small"
              @click="handleRowAction(action.key, row)"
            >
              {{ action.label }}
            </el-button>
            <el-button
              v-if="pageConfig?.editable"
              type="primary"
              link
              size="small"
              icon="edit"
              @click="handleEdit(row)"
            >
              编辑
            </el-button>
            <el-button
              v-if="canToggleStatus(row)"
              :type="isEnabledStatus(row.status) ? 'warning' : 'success'"
              link
              size="small"
              @click="handleToggleStatus(row)"
            >
              {{ isEnabledStatus(row.status) ? "停用" : "启用" }}
            </el-button>
            <el-button
              v-if="pageConfig?.deletable"
              type="danger"
              link
              size="small"
              icon="delete"
              @click="handleDelete(row)"
            >
              删除
            </el-button>
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

    <el-dialog v-model="formVisible" :title="formTitle" width="560px">
      <el-form :model="formModel" label-width="100px">
        <el-form-item
          v-for="item in pageConfig?.formItems || []"
          :key="item.prop"
          :label="item.label"
          :required="item.required"
        >
          <el-input
            v-if="item.type === 'text'"
            :model-value="stringFormValue(item.prop)"
            @update:model-value="(value) => setFormValue(item.prop, value)"
            :placeholder="item.placeholder"
          />
          <el-input
            v-else-if="item.type === 'textarea'"
            :model-value="stringFormValue(item.prop)"
            @update:model-value="(value) => setFormValue(item.prop, value)"
            type="textarea"
            :rows="3"
            :placeholder="item.placeholder"
          />
          <el-input-number
            v-else-if="item.type === 'number'"
            :model-value="numberFormValue(item.prop)"
            @update:model-value="(value) => setFormValue(item.prop, value)"
            :min="0"
            controls-position="right"
            style="width: 100%"
          />
          <el-select
            v-else-if="item.type === 'select'"
            :model-value="stringFormValue(item.prop)"
            @update:model-value="(value) => setFormValue(item.prop, value)"
            style="width: 100%"
          >
            <el-option
              v-for="option in item.options || []"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-date-picker
            v-else-if="item.type === 'datetime'"
            :model-value="dateFormValue(item.prop)"
            @update:model-value="(value) => setFormValue(item.prop, value)"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="addressDialogVisible" :title="addressDialogTitle" width="920px">
      <div class="address-dialog-toolbar">
        <el-button type="primary" icon="plus" @click="handleCreateOwnerAddress">新增地址</el-button>
        <el-button icon="refresh" @click="loadOwnerAddresses">刷新</el-button>
      </div>
      <el-table v-loading="addressLoading" :data="ownerAddresses" border>
        <el-table-column prop="id" label="ID" width="90" />
        <el-table-column prop="addressType" label="类型" width="100" />
        <el-table-column prop="contactName" label="联系人" width="110" />
        <el-table-column prop="contactPhone" label="手机号" width="130" />
        <el-table-column prop="cityName" label="城市" width="100" />
        <el-table-column prop="districtName" label="区域" width="100" />
        <el-table-column prop="formattedAddress" label="详细地址" min-width="260" show-overflow-tooltip />
        <el-table-column prop="isDefault" label="默认" width="80">
          <template #default="{ row }">
            <el-tag :type="row.isDefault ? 'success' : 'info'">{{ row.isDefault ? "是" : "否" }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="150">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleEditOwnerAddress(row)">编辑</el-button>
            <el-button type="danger" link size="small" @click="handleDeleteOwnerAddress(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <el-dialog v-model="addressFormVisible" :title="addressFormTitle" width="560px">
      <el-form :model="addressFormModel" label-width="100px">
        <el-form-item label="类型" required>
          <el-select v-model="addressFormModel.addressType" style="width: 100%">
            <el-option label="服务地址" value="service" />
            <el-option label="常驻地址" value="home" />
            <el-option label="工作地址" value="work" />
            <el-option label="结算地址" value="billing" />
          </el-select>
        </el-form-item>
        <el-form-item label="联系人" required>
          <el-input v-model="addressFormModel.contactName" />
        </el-form-item>
        <el-form-item label="手机号" required>
          <el-input v-model="addressFormModel.contactPhone" maxlength="11" />
        </el-form-item>
        <el-form-item label="省份">
          <el-input v-model="addressFormModel.provinceName" />
        </el-form-item>
        <el-form-item label="城市">
          <el-input v-model="addressFormModel.cityName" />
        </el-form-item>
        <el-form-item label="区域">
          <el-input v-model="addressFormModel.districtName" />
        </el-form-item>
        <el-form-item label="街道">
          <el-input v-model="addressFormModel.streetName" />
        </el-form-item>
        <el-form-item label="位置">
          <el-input v-model="addressFormModel.addressTitle" />
        </el-form-item>
        <el-form-item label="详细地址" required>
          <el-input v-model="addressFormModel.detailAddress" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="门牌号">
          <el-input v-model="addressFormModel.houseNumber" />
        </el-form-item>
        <el-form-item label="默认地址">
          <el-switch v-model="addressFormModel.isDefault" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addressFormVisible = false">取消</el-button>
        <el-button type="primary" :loading="addressSaving" @click="submitOwnerAddress">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "LifeResourcePage" });

import LifeAPI from "@/api/life";
import type {
  AddressRecord,
  LifeModuleKey,
  LifeResourceConfig,
  LifeResourceRecord,
  LifeStatusOption,
} from "@/api/life";

const route = useRoute();

const moduleKey = computed(() => {
  return ((route.meta.params as Record<string, unknown> | undefined)?.module ||
    route.query.module ||
    "users") as LifeModuleKey;
});

const loading = ref(false);
const saving = ref(false);
const total = ref(0);
const pageConfig = ref<LifeResourceConfig>();
const tableData = ref<LifeResourceRecord[]>([]);
const formVisible = ref(false);
const editingRow = ref<LifeResourceRecord>();
const formModel = reactive<Record<string, unknown>>({});
const addressDialogVisible = ref(false);
const addressFormVisible = ref(false);
const addressLoading = ref(false);
const addressSaving = ref(false);
const addressOwner = ref<{ ownerType: "user" | "staff"; ownerId: string; title: string }>();
const editingAddress = ref<AddressRecord>();
const ownerAddresses = ref<AddressRecord[]>([]);
const addressFormModel = reactive({
  addressType: "service",
  contactName: "",
  contactPhone: "",
  provinceName: "",
  cityName: "",
  districtName: "",
  streetName: "",
  addressTitle: "",
  detailAddress: "",
  houseNumber: "",
  isDefault: false,
});
const queryParams = reactive({
  pageNum: 1,
  pageSize: 10,
  keywords: "",
  status: "",
});

const statusOptions = computed<LifeStatusOption[]>(() => pageConfig.value?.statusOptions || []);
const formTitle = computed(() => `${editingRow.value ? "编辑" : "新增"}${pageConfig.value?.title || ""}`);
const addressDialogTitle = computed(() => `地址管理 - ${addressOwner.value?.title || ""}`);
const addressFormTitle = computed(() => `${editingAddress.value ? "编辑" : "新增"}地址`);

watch(
  () => moduleKey.value,
  () => {
    queryParams.pageNum = 1;
    queryParams.keywords = "";
    queryParams.status = "";
    fetchPage();
  },
  { immediate: true }
);

async function fetchPage() {
  loading.value = true;
  try {
    const data = await LifeAPI.getResourcePage(moduleKey.value, {
      ...queryParams,
      module: moduleKey.value,
    });
    pageConfig.value = data.config;
    tableData.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function handleReset() {
  queryParams.pageNum = 1;
  queryParams.keywords = "";
  queryParams.status = "";
  fetchPage();
}

function handleCreate() {
  if (!pageConfig.value?.editable) {
    ElMessage.info("当前模块暂不支持新增");
    return;
  }
  editingRow.value = undefined;
  resetFormModel();
  formVisible.value = true;
}

function handleView(row: LifeResourceRecord) {
  ElMessageBox.alert(buildDetailText(row), "详情", {
    confirmButtonText: "知道了",
    customClass: "life-detail-message",
  });
}

function handleEdit(row: LifeResourceRecord) {
  editingRow.value = row;
  resetFormModel(row);
  formVisible.value = true;
}

function handleRowAction(action: string, row: LifeResourceRecord) {
  if (action === "addresses") {
    openOwnerAddresses(row);
  }
}

async function openOwnerAddresses(row: LifeResourceRecord) {
  const ownerType = moduleKey.value === "staff" ? "staff" : "user";
  const title = String(row.nickname || row.name || row.phone || row.id);
  addressOwner.value = {
    ownerType,
    ownerId: String(row.id),
    title,
  };
  addressDialogVisible.value = true;
  await loadOwnerAddresses();
}

async function loadOwnerAddresses() {
  if (!addressOwner.value) return;
  addressLoading.value = true;
  try {
    const data = await LifeAPI.listOwnerAddresses(addressOwner.value.ownerType, addressOwner.value.ownerId);
    ownerAddresses.value = data.items || [];
  } finally {
    addressLoading.value = false;
  }
}

function handleCreateOwnerAddress() {
  if (!addressOwner.value) return;
  editingAddress.value = undefined;
  resetAddressForm();
  addressFormModel.addressType = addressOwner.value.ownerType === "staff" ? "home" : "service";
  addressFormVisible.value = true;
}

function handleEditOwnerAddress(row: AddressRecord) {
  editingAddress.value = row;
  resetAddressForm(row);
  addressFormVisible.value = true;
}

async function handleDeleteOwnerAddress(row: AddressRecord) {
  if (!addressOwner.value) return;
  await ElMessageBox.confirm("确认删除这个地址吗？", "删除确认", {
    type: "warning",
    confirmButtonText: "确认删除",
    cancelButtonText: "取消",
  });
  await LifeAPI.deleteOwnerAddress(addressOwner.value.ownerType, addressOwner.value.ownerId, row.id);
  ElMessage.success("已删除");
  await loadOwnerAddresses();
  await fetchPage();
}

async function submitOwnerAddress() {
  if (!addressOwner.value) return;
  const message = validateAddressForm();
  if (message) {
    ElMessage.warning(message);
    return;
  }
  addressSaving.value = true;
  try {
    const payload = buildAddressPayload();
    if (editingAddress.value) {
      await LifeAPI.updateOwnerAddress(addressOwner.value.ownerType, addressOwner.value.ownerId, editingAddress.value.id, payload);
      ElMessage.success("已更新地址");
    } else {
      await LifeAPI.createOwnerAddress(addressOwner.value.ownerType, addressOwner.value.ownerId, payload);
      ElMessage.success("已新增地址");
    }
    addressFormVisible.value = false;
    await loadOwnerAddresses();
    await fetchPage();
  } finally {
    addressSaving.value = false;
  }
}

function canToggleStatus(row: LifeResourceRecord) {
  return ["active", "disabled", "published", "draft", "pending", "rejected"].includes(
    String(row.status || "")
  );
}

function isEnabledStatus(status: unknown) {
  return status === "active" || status === "published";
}

function nextStatus(status: unknown) {
  if (status === "active") return "disabled";
  if (status === "published") return "draft";
  if (status === "draft") return "published";
  return "active";
}

async function handleToggleStatus(row: LifeResourceRecord) {
  await ElMessageBox.confirm("确认更新当前数据状态吗？", "操作确认", {
    type: "warning",
    confirmButtonText: "确认",
    cancelButtonText: "取消",
  });
  await LifeAPI.updateResourceStatus(moduleKey.value, String(row.id), nextStatus(row.status));
  ElMessage.success("状态已更新");
  fetchPage();
}

async function handleDelete(row: LifeResourceRecord) {
  const name = resourceDisplayName(row);
  await ElMessageBox.confirm(buildDeleteConfirmText(name), "删除确认", {
    type: "warning",
    confirmButtonText: "确认删除",
    cancelButtonText: "取消",
  });
  await LifeAPI.deleteResource(moduleKey.value, String(row.id));
  ElMessage.success("已删除");
  if (tableData.value.length === 1 && queryParams.pageNum > 1) {
    queryParams.pageNum -= 1;
  }
  fetchPage();
}

async function submitForm() {
  if (!pageConfig.value?.formItems) return;
  for (const item of pageConfig.value.formItems) {
    if (item.required && !formModel[item.prop]) {
      ElMessage.warning(`请填写${item.label}`);
      return;
    }
  }

  saving.value = true;
  try {
    if (editingRow.value) {
      await LifeAPI.updateResource(moduleKey.value, String(editingRow.value.id), { ...formModel });
      ElMessage.success("已更新");
    } else {
      await LifeAPI.createResource(moduleKey.value, { ...formModel });
      ElMessage.success("已新增");
    }
    formVisible.value = false;
    fetchPage();
  } finally {
    saving.value = false;
  }
}

function resetFormModel(row?: LifeResourceRecord) {
  Object.keys(formModel).forEach((key) => delete formModel[key]);
  for (const item of pageConfig.value?.formItems || []) {
    const value = row?.[item.prop];
    if (value !== undefined && value !== null) {
      formModel[item.prop] = normalizeFormValue(item.prop, value);
    } else if (item.type === "number") {
      formModel[item.prop] = 0;
    } else if (item.type === "select") {
      formModel[item.prop] = item.options?.[0]?.value || "";
    } else {
      formModel[item.prop] = "";
    }
  }
}

function normalizeFormValue(prop: string, value: unknown) {
  if (prop === "isDefault") {
    if (value === true || value === "true" || value === "active") return "true";
    if (value === false || value === "false" || value === "disabled") return "false";
  }
  return value;
}

function resetAddressForm(row?: AddressRecord) {
  addressFormModel.addressType = String(row?.addressType || "service");
  addressFormModel.contactName = String(row?.contactName || "");
  addressFormModel.contactPhone = String(row?.contactPhone || "");
  addressFormModel.provinceName = String(row?.provinceName || "");
  addressFormModel.cityName = String(row?.cityName || "");
  addressFormModel.districtName = String(row?.districtName || "");
  addressFormModel.streetName = String(row?.streetName || "");
  addressFormModel.addressTitle = String(row?.addressTitle || "");
  addressFormModel.detailAddress = String(row?.detailAddress || "");
  addressFormModel.houseNumber = String(row?.houseNumber || "");
  addressFormModel.isDefault = row?.isDefault === true;
}

function validateAddressForm() {
  if (!addressFormModel.contactName.trim()) return "请填写联系人";
  if (!/^1\d{10}$/.test(addressFormModel.contactPhone)) return "请填写正确的手机号";
  if (!addressFormModel.detailAddress.trim()) return "请填写详细地址";
  return "";
}

function buildAddressPayload() {
  return {
    addressType: addressFormModel.addressType,
    contactName: addressFormModel.contactName.trim(),
    contactPhone: addressFormModel.contactPhone.trim(),
    provinceName: addressFormModel.provinceName.trim() || undefined,
    cityName: addressFormModel.cityName.trim() || undefined,
    districtName: addressFormModel.districtName.trim() || undefined,
    streetName: addressFormModel.streetName.trim() || undefined,
    addressTitle: addressFormModel.addressTitle.trim() || undefined,
    detailAddress: addressFormModel.detailAddress.trim(),
    houseNumber: addressFormModel.houseNumber.trim() || undefined,
    isDefault: addressFormModel.isDefault,
  };
}

function stringFormValue(prop: string) {
  const value = formModel[prop];
  return value === undefined || value === null ? "" : String(value);
}

function numberFormValue(prop: string) {
  const value = Number(formModel[prop]);
  return Number.isFinite(value) ? value : 0;
}

function dateFormValue(prop: string) {
  const value = formModel[prop];
  return typeof value === "string" || typeof value === "number" || value instanceof Date ? value : "";
}

function setFormValue(prop: string, value: string | number | boolean | Date | null | undefined) {
  formModel[prop] = value ?? "";
}

function resolveTagType(value: unknown) {
  const matched = statusOptions.value.find((item) => item.value === value);
  if (matched?.tagType) return matched.tagType;
  if (value === true) return "success";
  if (value === false) return "info";
  if (value === "active" || value === "published" || value === "online") return "success";
  if (value === "pending" || value === "busy") return "warning";
  if (value === "rejected") return "danger";
  return "info";
}

function formatValue(value: unknown, type?: string) {
  if (value === undefined || value === null || value === "") return "-";
  if (type === "money") return `￥${Number(value).toLocaleString("zh-CN")}`;
  if (type === "rate") return `${value} 分`;
  if (type === "tag") {
    if (value === true) return "是";
    if (value === false) return "否";
    const matched = statusOptions.value.find((item) => item.value === value);
    if (matched) return matched.label;
    const fallback: Record<string, string> = {
      active: "正常",
      disabled: "停用",
      online: "在线",
      busy: "忙碌",
      offline: "离线",
      published: "已发布",
      draft: "草稿",
      pending: "待审核",
      rejected: "已驳回",
      pending_payment: "待支付",
      pending_dispatch: "待派单",
      dispatched: "已派单",
      accepted: "已接单",
      on_the_way: "上门中",
      in_service: "服务中",
      pending_confirm: "待确认",
      completed: "已完成",
      cancelled: "已取消",
      refunded: "已退款",
    };
    return fallback[String(value)] || String(value);
  }
  return String(value);
}

function buildDetailText(row: LifeResourceRecord) {
  return Object.entries(row)
    .map(([key, value]) => `${key}: ${String(value ?? "-")}`)
    .join("\n");
}

function resourceDisplayName(row: LifeResourceRecord) {
  return String(row.nickname || row.name || row.orderNo || row.title || row.id || "当前数据");
}

function buildDeleteConfirmText(name: string) {
  if (moduleKey.value === "users") {
    return `确认删除用户「${name}」吗？删除后该用户不会继续出现在用户管理列表，历史订单不会被清除。`;
  }
  if (moduleKey.value === "serviceCategories") {
    return `确认删除服务分类「${name}」吗？如果分类下存在服务，后端会拒绝删除。`;
  }
  if (moduleKey.value === "services") {
    return `确认删除服务「${name}」吗？删除后小程序将不再展示该服务，历史订单不会被清除。`;
  }
  if (moduleKey.value === "staff") {
    return `确认删除师傅「${name}」吗？如果存在进行中订单，后端会拒绝删除。`;
  }
  return `确认删除「${name}」吗？`;
}
</script>

<style scoped lang="scss">
.life-page {
  display: flex;
  flex-direction: column;
}

.life-header {
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
    color: var(--el-text-color-primary);
  }

  p {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
}

.address-dialog-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 12px;
}
</style>
