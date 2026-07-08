<template>
  <div class="page-container">
    <el-card class="page-search" shadow="never">
      <el-form :model="queryParams" :inline="true">
        <el-form-item label="关键字">
          <el-input
            v-model="queryParams.keywords"
            placeholder="订单号 / 用户 / 手机号 / 服务"
            clearable
            @keyup.enter="fetchOrders"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="queryParams.status" clearable style="width: 160px">
            <el-option label="全部" value="" />
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!isFixedOrderType" label="订单类型">
          <el-select v-model="queryParams.orderType" style="width: 170px">
            <el-option label="预约订单" value="bookings" />
            <el-option label="服务预约" value="service_booking" />
            <el-option label="咨询预约" value="consultation" />
            <el-option label="会员卡购买" value="member_card_purchase" />
            <el-option label="全部订单" value="all" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="queryParams.source" clearable style="width: 140px">
            <el-option label="全部" value="" />
            <el-option label="小程序" value="miniapp" />
            <el-option label="后台录入" value="admin" />
            <el-option label="电话订单" value="phone" />
            <el-option label="线下订单" value="offline" />
            <el-option label="推广订单" value="promotion" />
            <el-option label="视频号" value="channels" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="search" @click="fetchOrders">搜索</el-button>
          <el-button icon="refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="page-content" shadow="never">
      <div class="page-toolbar">
        <div class="page-toolbar__left">
          <el-button v-if="!isMemberCardPurchasePage" type="primary" icon="plus" @click="handleCreateOrder">
            录入订单
          </el-button>
          <el-button
            v-if="canDeleteOrders"
            type="danger"
            icon="delete"
            :disabled="selectedOrders.length === 0"
            :loading="batchDeleting"
            @click="batchDeleteOrders"
          >
            批量删除
          </el-button>
          <el-text v-if="selectedOrders.length > 0" type="info" size="small">
            已选 {{ selectedOrders.length }} 单
          </el-text>
          <el-tag v-if="!isMemberCardPurchasePage" type="warning" effect="plain">
            待派单优先处理
          </el-tag>
        </div>
        <div class="page-toolbar__right">
          <el-button icon="refresh" @click="fetchOrders">刷新</el-button>
        </div>
      </div>

      <el-table v-loading="loading || batchDeleting" :data="orders" border @selection-change="handleSelectionChange">
        <el-table-column v-if="canDeleteOrders" type="selection" width="55" align="center" fixed="left" />
        <el-table-column label="订单类型" width="120">
          <template #default="{ row }">
            <el-tag :type="orderTypeMeta(row.orderType).type">{{ orderTypeMeta(row.orderType).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="订单号" prop="orderNo" min-width="150" fixed="left" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusMeta(row.status).type">{{ statusMeta(row.status).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="服务/商品" prop="serviceName" min-width="160" />
        <el-table-column label="用户" min-width="150">
          <template #default="{ row }">
            <div>{{ row.userName }}</div>
            <el-text type="info" size="small">{{ row.userPhone }}</el-text>
          </template>
        </el-table-column>
        <el-table-column label="师傅" prop="staffName" width="110">
          <template #default="{ row }">
            {{ row.orderType === "member_card_purchase" ? "-" : row.staffName || "待派单" }}
          </template>
        </el-table-column>
        <el-table-column label="预约时间" prop="appointmentTime" min-width="190" />
        <el-table-column label="下单时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="完成时间" min-width="170">
          <template #default="{ row }">{{ row.completedAt ? formatDateTime(row.completedAt) : "-" }}</template>
        </el-table-column>
        <el-table-column label="服务地址" prop="addressText" min-width="260" show-overflow-tooltip />
        <el-table-column label="实付金额" width="110" align="right">
          <template #default="{ row }">￥{{ Number(row.paidAmount || 0).toLocaleString("zh-CN") }}</template>
        </el-table-column>
        <el-table-column label="来源" prop="source" width="90" />
        <el-table-column fixed="right" label="操作" width="220">
          <template #default="{ row }">
            <el-button type="primary" link size="small" icon="view" @click="openDetail(row.id)">
              详情
            </el-button>
            <el-button v-if="canUpdateOrders" type="primary" link size="small" icon="edit" @click="openEdit(row)">
              编辑
            </el-button>
            <el-button
              v-if="canAssignOrders && canAssign(row)"
              type="success"
              link
              size="small"
              icon="position"
              @click="openAssign(row)"
            >
              派单
            </el-button>
            <el-button v-if="canDeleteOrders" type="danger" link size="small" icon="delete" @click="deleteOrder(row)">
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
        @pagination="fetchOrders"
      />
    </el-card>

    <el-dialog v-model="assignVisible" title="订单派单审核" width="520px">
      <el-alert
        title="派单属于重要操作，请确认师傅状态、服务城市和技能匹配。"
        type="warning"
        show-icon
        :closable="false"
        class="mb-4"
      />
      <el-form label-width="90px">
        <el-form-item label="订单号">
          <el-text>{{ currentOrder?.orderNo }}</el-text>
        </el-form-item>
        <el-form-item v-if="dispatchWarnings.length" label="诊断提醒">
          <el-alert
            type="warning"
            show-icon
            :closable="false"
            :title="dispatchWarnings.join('；')"
          />
        </el-form-item>
        <el-form-item label="选择师傅">
          <el-select v-model="assignForm.staffId" placeholder="请选择师傅" style="width: 100%">
            <el-option
              v-for="item in staffOptions"
              :key="item.value"
              :label="`#${item.id || item.value} ${item.label} / ${item.phone} / ${item.workStatus}`"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="审核备注">
          <el-input v-model="assignForm.remark" type="textarea" :rows="3" placeholder="记录派单依据，便于后续审计" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignVisible = false">取消</el-button>
        <el-button type="primary" :loading="assignSubmitting" :disabled="!assignForm.staffId" @click="submitAssign">
          确认派单
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="createVisible" title="录入外来订单" width="780px">
      <el-alert
        title="外来订单创建后直接进入待派单状态，可用于电话、线下和推广来源订单。"
        type="info"
        show-icon
        :closable="false"
        class="mb-4"
      />
      <el-form label-width="110px" class="order-edit-form">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="已有用户ID">
              <el-input-number v-model="createForm.userId" :min="1" :step="1" clearable style="width: 100%" />
              <div class="form-tip">留空时会按手机号匹配或创建客户。</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="服务ID" required>
              <el-input-number v-model="createForm.serviceId" :min="1" :step="1" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="客户姓名">
              <el-input v-model="createForm.customerName" maxlength="64" placeholder="新客户或手机号匹配客户姓名" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="客户手机号" required>
              <el-input v-model="createForm.customerPhone" maxlength="20" placeholder="无用户ID时必填" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="预约开始" required>
              <el-date-picker v-model="createForm.appointmentStartTime" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="预约结束" required>
              <el-date-picker v-model="createForm.appointmentEndTime" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="已有地址ID">
              <el-input-number v-model="createForm.addressId" :min="1" :step="1" clearable style="width: 100%" />
              <div class="form-tip">留空时使用下面地址创建客户服务地址。</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="来源">
              <el-select v-model="createForm.source" style="width: 100%">
                <el-option label="后台录入" value="admin" />
                <el-option label="电话订单" value="phone" />
                <el-option label="线下订单" value="offline" />
                <el-option label="推广订单" value="promotion" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="联系人" required>
              <el-input v-model="createForm.contactName" maxlength="64" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系电话" required>
              <el-input v-model="createForm.contactPhone" maxlength="20" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="城市">
              <el-input v-model="createForm.cityName" maxlength="32" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="区县">
              <el-input v-model="createForm.districtName" maxlength="32" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="小区/地点">
              <el-input v-model="createForm.addressTitle" maxlength="128" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="详细地址" required>
          <el-input v-model="createForm.detailAddress" type="textarea" :rows="2" maxlength="256" show-word-limit />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="门牌号">
              <el-input v-model="createForm.houseNumber" maxlength="64" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="应付金额">
              <el-input-number v-model="createForm.payableAmount" :min="0" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="用户备注">
          <el-input v-model="createForm.remark" type="textarea" :rows="2" maxlength="512" show-word-limit />
        </el-form-item>
        <el-form-item label="后台备注">
          <el-input v-model="createForm.adminRemark" type="textarea" :rows="2" maxlength="512" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreateOrder">创建待派单订单</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑订单" width="720px">
      <el-form label-width="100px" class="order-edit-form">
        <el-form-item label="订单号">
          <el-text>{{ currentOrder?.orderNo }}</el-text>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="预约开始">
              <el-date-picker v-model="editForm.appointmentStartTime" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="预约结束">
              <el-date-picker v-model="editForm.appointmentEndTime" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="下单时间">
          <el-date-picker v-model="editForm.createdAt" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
        </el-form-item>
        <el-form-item label="用户备注">
          <el-input v-model="editForm.remark" type="textarea" :rows="2" maxlength="512" show-word-limit />
        </el-form-item>
        <el-form-item label="后台备注">
          <el-input v-model="editForm.adminRemark" type="textarea" :rows="3" maxlength="512" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="submitEdit">保存修改</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "LifeOrderList" });

import LifeAPI from "@/api/life";
import type { AdminCreateOrderPayload, OrderListItem, StaffOption, UpdateOrderPayload } from "@/api/life";
import { hasPerm } from "@/utils/auth";

const route = useRoute();
const router = useRouter();

const initialStatus = computed(() => String((route.meta.params as Record<string, unknown> | undefined)?.status || ""));
const initialOrderType = computed(() =>
  String((route.meta.params as Record<string, unknown> | undefined)?.orderType || route.query.orderType || "bookings")
);
const isFixedOrderType = computed(() => initialOrderType.value !== "all");
const isMemberCardPurchasePage = computed(() => initialOrderType.value === "member_card_purchase");
const canUpdateOrders = computed(() => hasPerm("order:update"));
const canAssignOrders = computed(() => hasPerm("order:assign"));
const canDeleteOrders = computed(() => hasPerm("order:delete"));

const loading = ref(false);
const batchDeleting = ref(false);
const total = ref(0);
const orders = ref<OrderListItem[]>([]);
const selectedOrders = ref<OrderListItem[]>([]);
const staffOptions = ref<StaffOption[]>([]);
const assignVisible = ref(false);
const editVisible = ref(false);
const createVisible = ref(false);
const creating = ref(false);
const assignSubmitting = ref(false);
const dispatchWarnings = ref<string[]>([]);
const currentOrder = ref<OrderListItem>();
const queryParams = reactive({
  pageNum: 1,
  pageSize: 10,
  keywords: "",
  status: "",
  orderType: "bookings",
  source: "",
});
const assignForm = reactive({
  staffId: "",
  remark: "",
});
const createForm = reactive({
  userId: undefined as number | undefined,
  customerName: "",
  customerPhone: "",
  serviceId: undefined as number | undefined,
  addressId: undefined as number | undefined,
  appointmentStartTime: "",
  appointmentEndTime: "",
  source: "admin",
  contactName: "",
  contactPhone: "",
  provinceName: "",
  cityName: "",
  districtName: "",
  streetName: "",
  addressTitle: "",
  detailAddress: "",
  houseNumber: "",
  payableAmount: 0,
  remark: "",
  adminRemark: "",
});
const editForm = reactive({
  appointmentStartTime: "",
  appointmentEndTime: "",
  createdAt: "",
  remark: "",
  adminRemark: "",
});
const statusOptions = [
  { label: "待支付", value: "pending_payment" },
  { label: "待派单", value: "pending_dispatch" },
  { label: "已派单", value: "dispatched" },
  { label: "已接单", value: "accepted" },
  { label: "已出发", value: "on_the_way" },
  { label: "服务中", value: "in_service" },
  { label: "待确认", value: "pending_confirm" },
  { label: "已完成", value: "completed" },
  { label: "已取消", value: "cancelled" },
  { label: "退款中", value: "refund_pending" },
  { label: "已退款", value: "refunded" },
  { label: "售后中", value: "after_sales" },
];

watch(
  () => [initialStatus.value, initialOrderType.value],
  () => {
    queryParams.status = initialStatus.value;
    queryParams.orderType = initialOrderType.value;
    fetchOrders();
  },
  { immediate: true }
);

async function fetchOrders() {
  loading.value = true;
  try {
    const data = await LifeAPI.getOrders(queryParams);
    orders.value = data.list;
    total.value = data.total;
    selectedOrders.value = [];
  } finally {
    loading.value = false;
  }
}

function handleReset() {
  queryParams.pageNum = 1;
  queryParams.keywords = "";
  queryParams.status = initialStatus.value;
  queryParams.orderType = initialOrderType.value;
  queryParams.source = "";
  fetchOrders();
}

function handleCreateOrder() {
  resetCreateForm();
  createVisible.value = true;
}

function openDetail(id: string) {
  router.push(`/orders/detail/${id}`);
}

function handleSelectionChange(selection: OrderListItem[]) {
  selectedOrders.value = selection;
}

async function openAssign(row: OrderListItem) {
  currentOrder.value = row;
  assignForm.staffId = "";
  assignForm.remark = "";
  dispatchWarnings.value = [];
  const check = await LifeAPI.getOrderDispatchCheck(row.id);
  if (!check.canAssign) {
    await ElMessageBox.alert(check.blockingReasons.join("\n") || "当前订单不满足派单条件", "无法派单", {
      type: "warning",
      confirmButtonText: "知道了",
    });
    return;
  }
  dispatchWarnings.value = check.warnings || [];
  staffOptions.value = await LifeAPI.getStaffOptions();
  assignVisible.value = true;
}

async function submitCreateOrder() {
  const payload = buildCreateOrderPayload();
  if (!payload) return;

  creating.value = true;
  try {
    const created = await LifeAPI.createAdminOrder(payload);
    ElMessage.success("外来订单已创建，当前为待派单状态");
    createVisible.value = false;
    await fetchOrders();
    if (created?.id) {
      currentOrder.value = created;
    }
  } finally {
    creating.value = false;
  }
}

function openEdit(row: OrderListItem) {
  if (!canUpdateOrders.value) return;
  currentOrder.value = row;
  editForm.appointmentStartTime = toPickerDate(row.appointmentStartTime);
  editForm.appointmentEndTime = toPickerDate(row.appointmentEndTime);
  editForm.createdAt = toPickerDate(row.createdAt);
  editForm.remark = row.remark || "";
  editForm.adminRemark = row.adminRemark || "";
  editVisible.value = true;
}

async function submitEdit() {
  if (!currentOrder.value) return;
  const payload: UpdateOrderPayload = {
    appointmentStartTime: editForm.appointmentStartTime,
    appointmentEndTime: editForm.appointmentEndTime,
    createdAt: editForm.createdAt,
    remark: editForm.remark || null,
    adminRemark: editForm.adminRemark || null,
  };
  await LifeAPI.updateOrder(currentOrder.value.id, payload);
  ElMessage.success("订单已更新");
  editVisible.value = false;
  fetchOrders();
}

async function deleteOrder(row: OrderListItem) {
  if (!canDeleteOrders.value) return;
  await ElMessageBox.confirm(
    `确认删除订单「${row.orderNo}」吗？该操作会直接删除订单和相关支付、派单、履约记录。`,
    "删除订单确认",
    { type: "warning" }
  );
  await LifeAPI.deleteOrder(row.id);
  ElMessage.success("订单已删除");
  fetchOrders();
}

async function batchDeleteOrders() {
  if (!canDeleteOrders.value) return;
  const rows = selectedOrders.value;
  if (rows.length === 0) return;

  await ElMessageBox.confirm(
    `确认批量删除已选的 ${rows.length} 个订单吗？该操作会直接删除订单和相关支付、派单、履约记录。`,
    "批量删除订单确认",
    { type: "warning" }
  );

  batchDeleting.value = true;
  try {
    await Promise.all(rows.map((row) => LifeAPI.deleteOrder(row.id)));
    ElMessage.success(`已删除 ${rows.length} 个订单`);
    selectedOrders.value = [];
    fetchOrders();
  } finally {
    batchDeleting.value = false;
  }
}

async function submitAssign() {
  if (!currentOrder.value) return;
  assignSubmitting.value = true;
  try {
    await LifeAPI.assignOrder(currentOrder.value.id, assignForm);
    ElMessage.success("派单成功，已生成师傅站内通知");
    assignVisible.value = false;
    fetchOrders();
  } finally {
    assignSubmitting.value = false;
  }
}

function resetCreateForm() {
  createForm.userId = undefined;
  createForm.customerName = "";
  createForm.customerPhone = "";
  createForm.serviceId = undefined;
  createForm.addressId = undefined;
  createForm.appointmentStartTime = "";
  createForm.appointmentEndTime = "";
  createForm.source = "admin";
  createForm.contactName = "";
  createForm.contactPhone = "";
  createForm.provinceName = "";
  createForm.cityName = "";
  createForm.districtName = "";
  createForm.streetName = "";
  createForm.addressTitle = "";
  createForm.detailAddress = "";
  createForm.houseNumber = "";
  createForm.payableAmount = 0;
  createForm.remark = "";
  createForm.adminRemark = "";
}

function buildCreateOrderPayload(): AdminCreateOrderPayload | null {
  if (!createForm.serviceId) {
    ElMessage.warning("请填写服务ID");
    return null;
  }
  if (!createForm.appointmentStartTime || !createForm.appointmentEndTime) {
    ElMessage.warning("请选择预约开始和结束时间");
    return null;
  }
  if (!createForm.userId && !createForm.customerPhone.trim()) {
    ElMessage.warning("请填写已有用户ID，或填写客户手机号");
    return null;
  }
  if (!createForm.addressId && (!createForm.contactName.trim() || !createForm.contactPhone.trim() || !createForm.detailAddress.trim())) {
    ElMessage.warning("请填写联系人、联系电话和详细地址，或填写已有地址ID");
    return null;
  }

  const payload: AdminCreateOrderPayload = {
    serviceId: createForm.serviceId,
    appointmentStartTime: createForm.appointmentStartTime,
    appointmentEndTime: createForm.appointmentEndTime,
    source: createForm.source,
    payableAmount: createForm.payableAmount,
    remark: trimOrUndefined(createForm.remark),
    adminRemark: trimOrUndefined(createForm.adminRemark),
  };

  if (createForm.userId) {
    payload.userId = createForm.userId;
  } else {
    payload.customer = {
      nickname: trimOrUndefined(createForm.customerName) || createForm.customerPhone.trim(),
      phone: createForm.customerPhone.trim(),
      adminRemark: trimOrUndefined(createForm.adminRemark),
    };
  }

  if (createForm.addressId) {
    payload.addressId = createForm.addressId;
  } else {
    payload.address = {
      contactName: createForm.contactName.trim(),
      contactPhone: createForm.contactPhone.trim(),
      provinceName: trimOrUndefined(createForm.provinceName),
      cityName: trimOrUndefined(createForm.cityName),
      districtName: trimOrUndefined(createForm.districtName),
      streetName: trimOrUndefined(createForm.streetName),
      addressTitle: trimOrUndefined(createForm.addressTitle),
      detailAddress: createForm.detailAddress.trim(),
      houseNumber: trimOrUndefined(createForm.houseNumber),
      isDefault: true,
    };
  }

  return payload;
}

function trimOrUndefined(value?: string) {
  const text = value?.trim();
  return text || undefined;
}

function statusMeta(status: string): { label: string; type: "primary" | "success" | "warning" | "danger" | "info" } {
  const map: Record<string, { label: string; type: "primary" | "success" | "warning" | "danger" | "info" }> = {
    pending_payment: { label: "待支付", type: "warning" },
    pending_dispatch: { label: "待派单", type: "warning" },
    dispatched: { label: "已派单", type: "primary" },
    accepted: { label: "已接单", type: "primary" },
    on_the_way: { label: "已出发", type: "primary" },
    in_service: { label: "服务中", type: "primary" },
    pending_confirm: { label: "待确认", type: "warning" },
    completed: { label: "已完成", type: "success" },
    cancelled: { label: "已取消", type: "info" },
    refund_pending: { label: "退款中", type: "warning" },
    refunded: { label: "已退款", type: "info" },
    after_sales: { label: "售后中", type: "danger" },
  };
  return map[status] || { label: status, type: "info" };
}

function orderTypeMeta(orderType?: string): { label: string; type: "primary" | "success" | "warning" | "danger" | "info" } {
  const map: Record<string, { label: string; type: "primary" | "success" | "warning" | "danger" | "info" }> = {
    service_booking: { label: "服务预约", type: "primary" },
    consultation: { label: "咨询预约", type: "warning" },
    member_card_purchase: { label: "会员卡购买", type: "success" },
  };
  return orderType ? map[orderType] || { label: orderType, type: "info" } : { label: "-", type: "info" };
}

function canAssign(row: OrderListItem) {
  return row.status === "pending_dispatch" && row.orderType !== "member_card_purchase";
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return useDateFormat(value, "YYYY-MM-DD HH:mm").value;
}

function toPickerDate(value?: string | null) {
  if (!value) return "";
  return useDateFormat(value, "YYYY-MM-DD HH:mm:ss").value;
}
</script>

<style scoped lang="scss">
.order-edit-form {
  .form-tip {
    margin-top: 4px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}
</style>
