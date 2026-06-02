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
        <el-button
          v-if="order?.status === 'pending_dispatch'"
          type="primary"
          @click="openAssign"
        >
          审核并派单
        </el-button>
        <el-button v-if="order" @click="openRemark">后台备注</el-button>
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
              :label="`${item.label} / ${item.phone} / ${item.workStatus}`"
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
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "LifeOrderDetail" });

import LifeAPI from "@/api/life";
import type { OrderDetail, StaffOption } from "@/api/life";

const route = useRoute();
const router = useRouter();

const order = ref<OrderDetail>();
const staffOptions = ref<StaffOption[]>([]);
const assignVisible = ref(false);
const remarkVisible = ref(false);
const assignForm = reactive({
  staffId: "",
  remark: "",
});
const remarkForm = reactive({
  remark: "",
});
const orderPhotos = computed(() => order.value?.photos || []);

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

async function submitRemark() {
  if (!order.value) return;
  order.value = await LifeAPI.updateOrderRemark(order.value.id, remarkForm.remark.trim());
  ElMessage.success("后台备注已保存");
  remarkVisible.value = false;
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
</style>
