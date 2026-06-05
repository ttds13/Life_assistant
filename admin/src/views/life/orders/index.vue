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
            <el-option label="待支付" value="pending_payment" />
            <el-option label="待派单" value="pending_dispatch" />
            <el-option label="已派单" value="dispatched" />
            <el-option label="服务中" value="in_service" />
            <el-option label="待确认" value="pending_confirm" />
            <el-option label="已完成" value="completed" />
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
          <el-button type="primary" icon="plus" @click="handleCreateOrder">录入订单</el-button>
          <el-button
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
          <el-tag type="warning" effect="plain">待派单优先处理</el-tag>
        </div>
        <div class="page-toolbar__right">
          <el-button icon="refresh" @click="fetchOrders">刷新</el-button>
        </div>
      </div>

      <el-table v-loading="loading || batchDeleting" :data="orders" border @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="55" align="center" fixed="left" />
        <el-table-column label="订单号" prop="orderNo" min-width="150" fixed="left" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusMeta(row.status).type">{{ statusMeta(row.status).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="服务" prop="serviceName" min-width="160" />
        <el-table-column label="用户" min-width="150">
          <template #default="{ row }">
            <div>{{ row.userName }}</div>
            <el-text type="info" size="small">{{ row.userPhone }}</el-text>
          </template>
        </el-table-column>
        <el-table-column label="师傅" prop="staffName" width="110">
          <template #default="{ row }">{{ row.staffName || "待派单" }}</template>
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
          <template #default="{ row }">¥{{ row.paidAmount.toLocaleString("zh-CN") }}</template>
        </el-table-column>
        <el-table-column label="来源" prop="source" width="90" />
        <el-table-column fixed="right" label="操作" width="220">
          <template #default="{ row }">
            <el-button type="primary" link size="small" icon="view" @click="openDetail(row.id)">
              详情
            </el-button>
            <el-button type="primary" link size="small" icon="edit" @click="openEdit(row)">
              编辑
            </el-button>
            <el-button
              v-if="row.status === 'pending_dispatch'"
              type="success"
              link
              size="small"
              icon="position"
              @click="openAssign(row)"
            >
              派单
            </el-button>
            <el-button type="danger" link size="small" icon="delete" @click="deleteOrder(row)">
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
          <el-input
            v-model="assignForm.remark"
            type="textarea"
            :rows="3"
            placeholder="记录派单依据，便于后续审计"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!assignForm.staffId" @click="submitAssign">
          确认派单
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑订单" width="720px">
      <el-form label-width="100px" class="order-edit-form">
        <el-form-item label="订单号">
          <el-text>{{ currentOrder?.orderNo }}</el-text>
        </el-form-item>
        <el-form-item label="订单状态">
          <el-select v-model="editForm.status" style="width: 100%">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="师傅ID">
          <el-input-number v-model="editForm.staffId" :min="1" :step="1" clearable style="width: 100%" />
          <div class="form-tip">清空后保存，会解除订单当前师傅绑定。</div>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="预约开始">
              <el-date-picker
                v-model="editForm.appointmentStartTime"
                type="datetime"
                value-format="YYYY-MM-DD HH:mm:ss"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="预约结束">
              <el-date-picker
                v-model="editForm.appointmentEndTime"
                type="datetime"
                value-format="YYYY-MM-DD HH:mm:ss"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="下单时间">
              <el-date-picker
                v-model="editForm.createdAt"
                type="datetime"
                value-format="YYYY-MM-DD HH:mm:ss"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="完成时间">
              <el-date-picker
                v-model="editForm.completedAt"
                type="datetime"
                value-format="YYYY-MM-DD HH:mm:ss"
                clearable
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="应付金额">
              <el-input-number v-model="editForm.payableAmount" :min="0" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="实付金额">
              <el-input-number v-model="editForm.paidAmount" :min="0" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
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
import type { OrderListItem, StaffOption, UpdateOrderPayload } from "@/api/life";

const route = useRoute();
const router = useRouter();

const initialStatus = computed(() => {
  return String((route.meta.params as Record<string, unknown> | undefined)?.status || "");
});

const loading = ref(false);
const batchDeleting = ref(false);
const total = ref(0);
const orders = ref<OrderListItem[]>([]);
const selectedOrders = ref<OrderListItem[]>([]);
const staffOptions = ref<StaffOption[]>([]);
const assignVisible = ref(false);
const editVisible = ref(false);
const currentOrder = ref<OrderListItem>();
const queryParams = reactive({
  pageNum: 1,
  pageSize: 10,
  keywords: "",
  status: "",
});
const assignForm = reactive({
  staffId: "",
  remark: "",
});
const editForm = reactive({
  status: "",
  staffId: undefined as number | undefined,
  appointmentStartTime: "",
  appointmentEndTime: "",
  createdAt: "",
  completedAt: "",
  payableAmount: 0,
  paidAmount: 0,
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
  () => initialStatus.value,
  () => {
    queryParams.status = initialStatus.value;
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
  fetchOrders();
}

function handleCreateOrder() {
  ElMessage.info("管理员录入订单表单后续接入，当前先由小程序师傅端录入。");
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
  staffOptions.value = await LifeAPI.getStaffOptions();
  assignVisible.value = true;
}

function openEdit(row: OrderListItem) {
  currentOrder.value = row;
  editForm.status = row.status;
  editForm.staffId = row.staffId ?? undefined;
  editForm.appointmentStartTime = toPickerDate(row.appointmentStartTime);
  editForm.appointmentEndTime = toPickerDate(row.appointmentEndTime);
  editForm.createdAt = toPickerDate(row.createdAt);
  editForm.completedAt = row.completedAt ? toPickerDate(row.completedAt) : "";
  editForm.payableAmount = row.payableAmount;
  editForm.paidAmount = row.paidAmount;
  editForm.remark = row.remark || "";
  editForm.adminRemark = row.adminRemark || "";
  editVisible.value = true;
}

async function submitEdit() {
  if (!currentOrder.value) return;
  const payload: UpdateOrderPayload = {
    status: editForm.status,
    staffId: editForm.staffId ?? null,
    appointmentStartTime: editForm.appointmentStartTime,
    appointmentEndTime: editForm.appointmentEndTime,
    createdAt: editForm.createdAt,
    completedAt: editForm.completedAt || null,
    payableAmount: editForm.payableAmount,
    paidAmount: editForm.paidAmount,
    remark: editForm.remark || null,
    adminRemark: editForm.adminRemark || null,
  };
  await LifeAPI.updateOrder(currentOrder.value.id, payload);
  ElMessage.success("订单已更新");
  editVisible.value = false;
  fetchOrders();
}

async function deleteOrder(row: OrderListItem) {
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
  await LifeAPI.assignOrder(currentOrder.value.id, assignForm);
  ElMessage.success("派单成功，操作已进入审计记录");
  assignVisible.value = false;
  fetchOrders();
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
  };
  return map[status] || { label: status, type: "info" };
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
