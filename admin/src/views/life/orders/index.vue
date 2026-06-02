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
          <el-tag type="warning" effect="plain">待派单优先处理</el-tag>
        </div>
        <div class="page-toolbar__right">
          <el-button icon="refresh" @click="fetchOrders">刷新</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="orders" border>
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
        <el-table-column label="服务地址" prop="addressText" min-width="260" show-overflow-tooltip />
        <el-table-column label="实付金额" width="110" align="right">
          <template #default="{ row }">¥{{ row.paidAmount.toLocaleString("zh-CN") }}</template>
        </el-table-column>
        <el-table-column label="来源" prop="source" width="90" />
        <el-table-column fixed="right" label="操作" width="190">
          <template #default="{ row }">
            <el-button type="primary" link size="small" icon="view" @click="openDetail(row.id)">
              详情
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
              :label="`${item.label} / ${item.phone} / ${item.workStatus}`"
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
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "LifeOrderList" });

import LifeAPI from "@/api/life";
import type { OrderListItem, StaffOption } from "@/api/life";

const route = useRoute();
const router = useRouter();

const initialStatus = computed(() => {
  return String((route.meta.params as Record<string, unknown> | undefined)?.status || "");
});

const loading = ref(false);
const total = ref(0);
const orders = ref<OrderListItem[]>([]);
const staffOptions = ref<StaffOption[]>([]);
const assignVisible = ref(false);
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

async function openAssign(row: OrderListItem) {
  currentOrder.value = row;
  assignForm.staffId = "";
  assignForm.remark = "";
  staffOptions.value = await LifeAPI.getStaffOptions();
  assignVisible.value = true;
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
</script>
