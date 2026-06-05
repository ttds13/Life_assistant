<template>
  <div class="page-container order-detail">
    <el-card class="order-summary" shadow="never">
      <div>
        <el-tag v-if="order" :type="statusMeta(order.status).type" size="large">
          {{ statusMeta(order.status).label }}
        </el-tag>
        <h2>{{ order?.orderNo || "订单详情" }}</h2>
        <p>{{ order?.serviceName }} / {{ order?.appointmentTime }}</p>
      </div>
      <div class="order-summary__actions">
        <el-button @click="router.back()">返回</el-button>
        <el-button v-if="order" type="primary" @click="openEdit">
          编辑订单
        </el-button>
        <el-button
          v-if="order?.status === 'pending_dispatch'"
          type="primary"
          @click="openAssign"
        >
          审核并派单
        </el-button>
        <el-button v-if="order" @click="openRemark">后台备注</el-button>
        <el-button v-if="order" type="danger" @click="deleteOrder">删除订单</el-button>
      </div>
    </el-card>

    <el-row :gutter="16">
      <el-col :lg="16" :md="24">
        <el-card shadow="never" class="mb-4">
          <template #header>订单信息</template>
          <el-descriptions v-if="order" :column="2" border>
            <el-descriptions-item label="服务项目">{{ order.serviceName }}</el-descriptions-item>
            <el-descriptions-item label="服务规格">{{ order.serviceSpec }}</el-descriptions-item>
            <el-descriptions-item label="用户">{{ order.userName }} / {{ order.userPhone }}</el-descriptions-item>
            <el-descriptions-item label="师傅">{{ order.staffName || "待派单" }}</el-descriptions-item>
            <el-descriptions-item label="预约时间">{{ order.appointmentTime }}</el-descriptions-item>
            <el-descriptions-item label="来源">{{ order.source }}</el-descriptions-item>
            <el-descriptions-item label="下单时间">{{ formatDateTime(order.createdAt) }}</el-descriptions-item>
            <el-descriptions-item label="支付时间">{{ order.paidAt ? formatDateTime(order.paidAt) : "-" }}</el-descriptions-item>
            <el-descriptions-item label="完成时间">{{ order.completedAt ? formatDateTime(order.completedAt) : "-" }}</el-descriptions-item>
            <el-descriptions-item label="取消时间">
              {{ order.cancelledAt ? formatDateTime(order.cancelledAt) : "-" }}
            </el-descriptions-item>
            <el-descriptions-item label="服务地址" :span="2">{{ order.addressText }}</el-descriptions-item>
            <el-descriptions-item label="用户备注" :span="2">{{ order.remark || "暂无" }}</el-descriptions-item>
            <el-descriptions-item label="管理员备注" :span="2">
              {{ order.adminRemark || "暂无" }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-card shadow="never">
          <template #header>履约时间线</template>
          <el-timeline>
            <el-timeline-item
              v-for="item in order?.statusLogs || []"
              :key="item.title"
              :timestamp="item.time"
              placement="top"
            >
              <h4>{{ item.title }}</h4>
              <p>{{ item.operator }}：{{ item.description }}</p>
            </el-timeline-item>
          </el-timeline>
        </el-card>
      </el-col>

      <el-col :lg="8" :md="24">
        <el-card shadow="never" class="mb-4">
          <template #header>金额明细</template>
          <div v-for="item in order?.amountItems || []" :key="item.label" class="amount-row">
            <span>{{ item.label }}</span>
            <strong>¥{{ item.amount.toLocaleString("zh-CN") }}</strong>
          </div>
        </el-card>

        <el-card shadow="never">
          <template #header>服务照片</template>
          <el-empty v-if="!orderPhotos.length" description="暂无照片" />
          <div v-else class="photo-grid">
            <div v-for="photo in orderPhotos" :key="photo" class="photo-grid__item">
              <img :src="photo" alt="" />
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="assignVisible" title="订单派单审核" width="520px">
      <el-alert
        title="重要操作：派单会改变订单履约责任人，请确认师傅资质与服务时间。"
        type="warning"
        show-icon
        :closable="false"
        class="mb-4"
      />
      <el-form label-width="90px">
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
          <el-input v-model="assignForm.remark" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!assignForm.staffId" @click="submitAssign">
          确认派单
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="remarkVisible" title="后台备注" width="520px">
      <el-form label-width="90px">
        <el-form-item label="订单号">
          <el-text>{{ order?.orderNo }}</el-text>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="remarkForm.remark"
            type="textarea"
            :rows="4"
            maxlength="512"
            show-word-limit
            placeholder="填写后台处理备注"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="remarkVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!remarkForm.remark.trim()" @click="submitRemark">
          保存备注
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑订单" width="720px">
      <el-form label-width="100px" class="order-edit-form">
        <el-form-item label="订单号">
          <el-text>{{ order?.orderNo }}</el-text>
        </el-form-item>
        <el-form-item label="订单状态">
          <el-select v-model="editForm.status" style="width: 100%">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="师傅ID">
          <el-input-number v-model="editForm.staffId" :min="1" :step="1" style="width: 100%" />
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
defineOptions({ name: "LifeOrderDetail" });

import LifeAPI from "@/api/life";
import type { OrderDetail, StaffOption, UpdateOrderPayload } from "@/api/life";

const route = useRoute();
const router = useRouter();

const order = ref<OrderDetail>();
const staffOptions = ref<StaffOption[]>([]);
const assignVisible = ref(false);
const remarkVisible = ref(false);
const editVisible = ref(false);
const assignForm = reactive({
  staffId: "",
  remark: "",
});
const remarkForm = reactive({
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
const orderPhotos = computed(() => order.value?.photos || []);
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

onMounted(fetchDetail);

async function fetchDetail() {
  order.value = await LifeAPI.getOrderDetail(String(route.params.id));
}

async function openAssign() {
  staffOptions.value = await LifeAPI.getStaffOptions();
  assignForm.staffId = "";
  assignForm.remark = "";
  assignVisible.value = true;
}

async function submitAssign() {
  if (!order.value) return;
  await LifeAPI.assignOrder(order.value.id, assignForm);
  ElMessage.success("派单成功，审核记录已保存");
  assignVisible.value = false;
  fetchDetail();
}

function openRemark() {
  remarkForm.remark = order.value?.adminRemark || "";
  remarkVisible.value = true;
}

function openEdit() {
  if (!order.value) return;
  editForm.status = order.value.status;
  editForm.staffId = order.value.staffId ?? undefined;
  editForm.appointmentStartTime = toPickerDate(order.value.appointmentStartTime);
  editForm.appointmentEndTime = toPickerDate(order.value.appointmentEndTime);
  editForm.createdAt = toPickerDate(order.value.createdAt);
  editForm.completedAt = order.value.completedAt ? toPickerDate(order.value.completedAt) : "";
  editForm.payableAmount = order.value.payableAmount;
  editForm.paidAmount = order.value.paidAmount;
  editForm.remark = order.value.remark || "";
  editForm.adminRemark = order.value.adminRemark || "";
  editVisible.value = true;
}

async function submitRemark() {
  if (!order.value) return;
  order.value = await LifeAPI.updateOrderRemark(order.value.id, remarkForm.remark.trim());
  ElMessage.success("后台备注已保存");
  remarkVisible.value = false;
}

async function submitEdit() {
  if (!order.value) return;
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
  order.value = await LifeAPI.updateOrder(order.value.id, payload);
  ElMessage.success("订单已更新");
  editVisible.value = false;
}

async function deleteOrder() {
  if (!order.value) return;
  await ElMessageBox.confirm(
    `确认删除订单「${order.value.orderNo}」吗？该操作会直接删除订单和相关支付、派单、履约记录。`,
    "删除订单确认",
    { type: "warning" }
  );
  await LifeAPI.deleteOrder(order.value.id);
  ElMessage.success("订单已删除");
  router.replace("/orders/list");
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
.order-summary {
  margin-bottom: var(--page-gap);

  :deep(.el-card__body) {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  h2 {
    margin: 12px 0 4px;
    font-size: 22px;
  }

  p {
    margin: 0;
    color: var(--el-text-color-secondary);
  }

  &__actions {
    display: flex;
    gap: 8px;
  }
}

.amount-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);

  &:last-child {
    border-bottom: 0;
  }
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;

  &__item {
    aspect-ratio: 1;
    overflow: hidden;
    background: var(--el-fill-color-light);
    border-radius: 6px;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }
}

.order-edit-form {
  .form-tip {
    margin-top: 4px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}
</style>
