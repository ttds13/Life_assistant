<template>
  <div class="page-container order-detail">
    <el-card class="order-summary" shadow="never">
      <div>
        <el-tag v-if="order" :type="statusMeta(order.status).type" size="large">
          {{ statusMeta(order.status).label }}
        </el-tag>
        <h2>{{ order?.orderNo || "订单详情" }}</h2>
        <p>{{ order?.serviceName || "-" }} / {{ order?.appointmentTime || "-" }}</p>
      </div>
      <div class="order-summary__actions">
        <el-button @click="router.back()">返回</el-button>
        <el-button v-if="order && canUpdateOrders" type="primary" @click="openEdit">编辑订单</el-button>
        <el-button
          v-if="order?.status === 'pending_dispatch' && canAssignOrders"
          type="success"
          @click="openAssign"
        >
          人工派单
        </el-button>
        <el-button v-if="order && canUpdateOrders" @click="openRemark">后台备注</el-button>
        <el-button v-if="order && canDeleteOrders" type="danger" @click="deleteOrder">删除订单</el-button>
      </div>
    </el-card>

    <el-row :gutter="16">
      <el-col :lg="16" :md="24">
        <el-card shadow="never" class="mb-4">
          <template #header>订单信息</template>
          <el-descriptions v-if="order" :column="2" border>
            <el-descriptions-item label="服务项目">{{ order.serviceName }}</el-descriptions-item>
            <el-descriptions-item label="服务规格">{{ order.serviceSpec || serviceSpecText }}</el-descriptions-item>
            <el-descriptions-item label="订单类型">{{ orderTypeText(order.orderType) }}</el-descriptions-item>
            <el-descriptions-item label="计卡类型">{{ cardTypeText(order.serviceCardType) }}</el-descriptions-item>
            <el-descriptions-item label="用户">{{ order.userName }} / {{ order.userPhone || "-" }}</el-descriptions-item>
            <el-descriptions-item label="师傅">
              {{ order.staffName || "待派单" }}
              <span v-if="order.staffPhone"> / {{ order.staffPhone }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="预约时间">{{ order.appointmentTime }}</el-descriptions-item>
            <el-descriptions-item label="来源">{{ order.source || "-" }}</el-descriptions-item>
            <el-descriptions-item label="下单时间">{{ formatDateTime(order.createdAt) }}</el-descriptions-item>
            <el-descriptions-item label="支付时间">{{ formatDateTime(order.paidAt) }}</el-descriptions-item>
            <el-descriptions-item label="完成时间">{{ formatDateTime(order.completedAt) }}</el-descriptions-item>
            <el-descriptions-item label="取消时间">{{ formatDateTime(order.cancelledAt) }}</el-descriptions-item>
            <el-descriptions-item label="服务地址" :span="2">{{ order.addressText || "-" }}</el-descriptions-item>
            <el-descriptions-item label="用户备注" :span="2">{{ order.remark || "暂无" }}</el-descriptions-item>
            <el-descriptions-item label="后台备注" :span="2">{{ order.adminRemark || "暂无" }}</el-descriptions-item>
            <el-descriptions-item v-if="order.cancelReason" label="取消原因" :span="2">
              {{ order.cancelReason }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-card shadow="never" class="mb-4">
          <template #header>履约信息</template>
          <el-descriptions v-if="order" :column="2" border>
            <el-descriptions-item label="负责师傅">
              {{ order.staffName || "未分配" }}
              <span v-if="order.staffPhone"> / {{ order.staffPhone }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="实际服务">{{ actualServiceText }}</el-descriptions-item>
            <el-descriptions-item label="接单时间">{{ formatDateTime(order.acceptedAt) }}</el-descriptions-item>
            <el-descriptions-item label="出发时间">{{ formatDateTime(order.onTheWayAt || order.checkinAt) }}</el-descriptions-item>
            <el-descriptions-item label="开始服务">{{ formatDateTime(order.startedAt) }}</el-descriptions-item>
            <el-descriptions-item label="完成服务">{{ formatDateTime(order.completedAt) }}</el-descriptions-item>
          </el-descriptions>
          <el-empty v-else description="暂无履约信息" />
        </el-card>

        <el-card shadow="never" class="mb-4">
          <template #header>订单状态日志</template>
          <el-timeline v-if="timelineItems.length">
            <el-timeline-item
              v-for="item in timelineItems"
              :key="`${item.title}-${item.time}`"
              :timestamp="formatDateTime(item.time)"
              placement="top"
            >
              <h4>{{ item.title || item.label }}</h4>
              <p>{{ item.operator || operatorText(item) }}：{{ item.description || item.remark || "-" }}</p>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="暂无日志" />
        </el-card>

        <el-card shadow="never">
          <template #header>会员卡流水</template>
          <template v-if="hasMemberCardUsage">
            <el-descriptions :column="2" border class="mb-4">
              <el-descriptions-item label="会员卡">{{ order?.memberCardName || order?.memberCard?.name || "-" }}</el-descriptions-item>
              <el-descriptions-item label="单位">{{ order?.memberCardUnitName || order?.memberCard?.unitName || "-" }}</el-descriptions-item>
              <el-descriptions-item label="冻结额度">{{ formatUnits(order?.frozenUnits) }}</el-descriptions-item>
              <el-descriptions-item label="预计扣减">{{ formatUnits(order?.plannedConsumeUnits || order?.memberCardConsumeUnits) }}</el-descriptions-item>
              <el-descriptions-item label="实际扣减">{{ formatUnits(order?.actualConsumeUnits) }}</el-descriptions-item>
              <el-descriptions-item label="释放额度">{{ formatUnits(order?.releasedUnits) }}</el-descriptions-item>
              <el-descriptions-item label="卡内余额">{{ formatUnits(order?.memberCard?.remainingUnits) }}</el-descriptions-item>
              <el-descriptions-item label="仍冻结">{{ formatUnits(order?.memberCard?.frozenUnits) }}</el-descriptions-item>
            </el-descriptions>

            <el-table :data="memberCardRecords" border>
              <el-table-column label="类型" width="110">
                <template #default="{ row }">
                  <el-tag :type="recordTypeMeta(row.recordType).type">
                    {{ recordTypeMeta(row.recordType).label }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="变动额度" width="110">
                <template #default="{ row }">{{ formatUnits(row.units, row.card?.unitName) }}</template>
              </el-table-column>
              <el-table-column label="变动前" width="100">
                <template #default="{ row }">{{ formatUnits(row.beforeUnits, row.card?.unitName) }}</template>
              </el-table-column>
              <el-table-column label="变动后" width="100">
                <template #default="{ row }">{{ formatUnits(row.afterUnits, row.card?.unitName) }}</template>
              </el-table-column>
              <el-table-column label="操作人" width="130">
                <template #default="{ row }">{{ row.operatorType || "-" }}#{{ row.operatorId || "-" }}</template>
              </el-table-column>
              <el-table-column label="时间" width="170">
                <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
              </el-table-column>
              <el-table-column label="备注" prop="remark" min-width="220" show-overflow-tooltip />
            </el-table>
          </template>
          <el-empty v-else description="非会员卡订单或暂无流水" />
        </el-card>
      </el-col>

      <el-col :lg="8" :md="24">
        <el-card shadow="never" class="mb-4">
          <template #header>金额明细</template>
          <div v-for="item in order?.amountItems || []" :key="item.label" class="amount-row">
            <span>{{ item.label }}</span>
            <strong>{{ formatMoney(item.amount) }}</strong>
          </div>
          <div class="amount-row amount-row--total">
            <span>实付金额</span>
            <strong>{{ formatMoney(order?.paidAmount || 0) }}</strong>
          </div>
        </el-card>

        <el-card shadow="never" class="mb-4">
          <template #header>服务照片</template>
          <el-empty v-if="!orderPhotos.length" description="暂无照片" />
          <div v-else class="photo-grid">
            <el-image
              v-for="photo in orderPhotos"
              :key="photo"
              :src="photo"
              :preview-src-list="orderPhotos"
              fit="cover"
              class="photo-grid__item"
              preview-teleported
            />
          </div>
        </el-card>

        <el-card shadow="never">
          <template #header>派单记录</template>
          <el-empty v-if="!assignments.length" description="暂无派单记录" />
          <el-timeline v-else>
            <el-timeline-item
              v-for="item in assignments"
              :key="item.id"
              :timestamp="formatDateTime(item.assignedAt)"
              placement="top"
            >
              <h4>师傅 #{{ item.staffId }} / {{ assignmentStatusText(item.assignStatus) }}</h4>
              <p>派单人 #{{ item.assignedBy }}</p>
              <p>
                通知：{{ notificationStatusText(item.notificationStatus) }}
                <span v-if="item.notificationId"> / #{{ item.notificationId }}</span>
              </p>
              <p v-if="item.acceptedAt">接单：{{ formatDateTime(item.acceptedAt) }}</p>
              <p v-if="item.rejectedAt">拒单：{{ formatDateTime(item.rejectedAt) }}</p>
              <p v-if="item.rejectReason">原因：{{ item.rejectReason }}</p>
            </el-timeline-item>
          </el-timeline>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="assignVisible" title="人工派单" width="520px">
      <el-alert
        title="派单会改变订单履约责任人，请确认师傅状态和预约时间。"
        type="warning"
        show-icon
        :closable="false"
        class="mb-4"
      />
      <el-form label-width="90px">
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
        <el-form-item label="派单备注">
          <el-input v-model="assignForm.remark" type="textarea" :rows="3" maxlength="256" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignVisible = false">取消</el-button>
        <el-button type="primary" :loading="assignSubmitting" :disabled="!assignForm.staffId" @click="submitAssign">确认派单</el-button>
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
        <el-button type="primary" :disabled="!remarkForm.remark.trim()" @click="submitRemark">保存备注</el-button>
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
          <div class="form-tip">清空后保存会解除订单当前师傅绑定。</div>
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
import { hasPerm } from "@/utils/auth";

type TagType = "primary" | "success" | "warning" | "danger" | "info";

const route = useRoute();
const router = useRouter();
const canUpdateOrders = computed(() => hasPerm("order:update"));
const canAssignOrders = computed(() => hasPerm("order:assign"));
const canDeleteOrders = computed(() => hasPerm("order:delete"));

const order = ref<OrderDetail>();
const staffOptions = ref<StaffOption[]>([]);
const assignVisible = ref(false);
const remarkVisible = ref(false);
const editVisible = ref(false);
const assignSubmitting = ref(false);
const dispatchWarnings = ref<string[]>([]);
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

const orderPhotos = computed(() => order.value?.photos?.length ? order.value.photos : order.value?.servicePhotos || []);
const assignments = computed(() => order.value?.assignments || []);
const memberCardRecords = computed(() => order.value?.memberCardRecords || []);
const timelineItems = computed(() => order.value?.statusLogs || []);
const hasMemberCardUsage = computed(() =>
  Boolean(order.value?.memberCardId || order.value?.memberCardName || order.value?.memberCard || memberCardRecords.value.length),
);
const serviceSpecText = computed(() => {
  if (!order.value) return "-";
  const unit = order.value.memberCardUnitName || "";
  const consumeUnit = order.value.serviceConsumeUnit || order.value.memberCardConsumeUnits || 0;
  if (consumeUnit > 0) return `${consumeUnit}${unit || "单位"}`;
  return "-";
});
const actualServiceText = computed(() => {
  if (!order.value) return "-";
  if (order.value.actualConsumeUnits && (order.value.serviceCardType === "time" || order.value.memberCardUnitName === "分钟")) {
    return `${order.value.actualConsumeUnits}分钟`;
  }
  if (order.value.actualConsumeUnits) return formatUnits(order.value.actualConsumeUnits);
  if (order.value.startedAt && order.value.completedAt) {
    const minutes = Math.max(0, Math.round((new Date(order.value.completedAt).getTime() - new Date(order.value.startedAt).getTime()) / 60000));
    return minutes ? `${minutes}分钟` : "-";
  }
  return "-";
});

onMounted(fetchDetail);

async function fetchDetail() {
  order.value = await LifeAPI.getOrderDetail(String(route.params.id));
}

async function openAssign() {
  if (!order.value || !canAssignOrders.value) return;
  dispatchWarnings.value = [];
  const check = await LifeAPI.getOrderDispatchCheck(order.value.id);
  if (!check.canAssign) {
    await ElMessageBox.alert(check.blockingReasons.join("\n") || "当前订单不满足派单条件", "无法派单", {
      type: "warning",
      confirmButtonText: "知道了",
    });
    return;
  }
  dispatchWarnings.value = check.warnings || [];
  staffOptions.value = await LifeAPI.getStaffOptions();
  assignForm.staffId = "";
  assignForm.remark = "";
  assignVisible.value = true;
}

async function submitAssign() {
  if (!order.value) return;
  assignSubmitting.value = true;
  try {
    await LifeAPI.assignOrder(order.value.id, assignForm);
    ElMessage.success("派单成功，已生成师傅站内通知");
    assignVisible.value = false;
    fetchDetail();
  } finally {
    assignSubmitting.value = false;
  }
}

function openRemark() {
  if (!canUpdateOrders.value) return;
  remarkForm.remark = order.value?.adminRemark || "";
  remarkVisible.value = true;
}

function openEdit() {
  if (!order.value || !canUpdateOrders.value) return;
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
  if (!order.value || !canDeleteOrders.value) return;
  await ElMessageBox.confirm(
    `确认删除订单「${order.value.orderNo}」吗？该操作会直接删除订单和相关支付、派单、履约记录。`,
    "删除订单确认",
    { type: "warning" },
  );
  await LifeAPI.deleteOrder(order.value.id);
  ElMessage.success("订单已删除");
  router.replace("/orders/list");
}

function statusMeta(status: string): { label: string; type: TagType } {
  const map: Record<string, { label: string; type: TagType }> = {
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

function recordTypeMeta(type: string): { label: string; type: TagType } {
  const map: Record<string, { label: string; type: TagType }> = {
    grant: { label: "发放", type: "success" },
    freeze: { label: "冻结", type: "warning" },
    consume: { label: "扣减", type: "danger" },
    release: { label: "释放", type: "primary" },
    refund_revoke: { label: "退款回收", type: "info" },
  };
  return map[type] || { label: type, type: "info" };
}

function orderTypeText(type?: string) {
  const map: Record<string, string> = {
    service_booking: "服务预约",
    consultation: "咨询预约",
    member_card_purchase: "会员卡购买",
  };
  return type ? map[type] || type : "-";
}

function cardTypeText(type?: string) {
  const map: Record<string, string> = {
    time: "时间卡",
    times: "次卡",
    none: "不计卡",
    consultation: "咨询",
  };
  return type ? map[type] || type : "-";
}

function assignmentStatusText(status: string) {
  const map: Record<string, string> = {
    pending: "待接单",
    accepted: "已接单",
    rejected: "已拒单",
    cancelled: "已取消",
  };
  return map[status] || status;
}

function notificationStatusText(status?: string | null) {
  const map: Record<string, string> = {
    created: "站内通知已生成",
    sent: "微信通知已发送",
    failed: "微信通知发送失败",
    skipped: "微信通知未配置",
  };
  return status ? map[status] || status : "未记录";
}

function operatorText(item: OrderDetail["statusLogs"][number]) {
  return item.operator || `${item.operatorType || "-"}#${item.operatorId || "-"}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return useDateFormat(value, "YYYY-MM-DD HH:mm").value;
}

function toPickerDate(value?: string | null) {
  if (!value) return "";
  return useDateFormat(value, "YYYY-MM-DD HH:mm:ss").value;
}

function formatMoney(value: number) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatUnits(value?: number | null, unitName?: string) {
  if (value === null || value === undefined) return "-";
  const unit = unitName || order.value?.memberCardUnitName || order.value?.memberCard?.unitName || "";
  return `${value}${unit}`;
}
</script>

<style scoped lang="scss">
.order-summary {
  margin-bottom: var(--page-gap);

  :deep(.el-card__body) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
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
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
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

  &--total {
    font-size: 16px;
  }
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;

  &__item {
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    background: var(--el-fill-color-light);
    border-radius: 6px;
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
