<template>
  <div class="page-container appointment-time-locks">
    <el-card class="page-header" shadow="never">
      <div>
        <h2>不可预约时段</h2>
        <p>锁定全平台新服务预约时段。已创建订单不会受这里的配置影响。</p>
      </div>
      <el-button type="primary" icon="plus" @click="openCreate">新增锁定</el-button>
    </el-card>

    <el-card shadow="never">
      <el-form :inline="true" :model="query" class="filter-form">
        <el-form-item label="开始日期">
          <el-date-picker v-model="query.dateStart" type="date" value-format="YYYY-MM-DD" placeholder="从今天开始" />
        </el-form-item>
        <el-form-item label="结束日期">
          <el-date-picker v-model="query.dateEnd" type="date" value-format="YYYY-MM-DD" placeholder="不限" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width: 120px">
            <el-option label="生效中" value="active" />
            <el-option label="已停用" value="inactive" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="search" @click="fetchLocks">查询</el-button>
          <el-button icon="refresh" @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="locks" border>
        <el-table-column prop="lockDate" label="日期" width="130" />
        <el-table-column prop="timeSlot" label="不可预约时段" width="150" />
        <el-table-column prop="reason" label="锁定原因" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">{{ row.reason || '未填写原因' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'danger' : 'info'">
              {{ row.status === 'active' ? '生效中' : '已停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180" />
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openEdit(row)">编辑</el-button>
            <el-button type="warning" link size="small" @click="toggleStatus(row)">
              {{ row.status === 'active' ? '停用' : '启用' }}
            </el-button>
            <el-button type="danger" link size="small" @click="removeLock(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !locks.length" description="未来暂无不可预约时段" :image-size="88" />
    </el-card>

    <el-dialog v-model="formVisible" :title="editingId ? '编辑不可预约时段' : '新增不可预约时段'" width="560px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="112px">
        <el-form-item label="锁定日期" prop="lockDate">
          <el-date-picker v-model="form.lockDate" type="date" value-format="YYYY-MM-DD" :disabled="Boolean(editingId)" style="width: 100%" />
        </el-form-item>
        <el-form-item v-if="!editingId" label="预约时段" prop="timeSlots">
          <el-checkbox-group v-model="form.timeSlots" class="slot-options">
            <el-checkbox v-for="slot in timeSlotOptions" :key="slot" :value="slot">{{ slot }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item v-else label="预约时段" prop="timeSlot">
          <el-select v-model="form.timeSlot" style="width: 100%">
            <el-option v-for="slot in timeSlotOptions" :key="slot" :label="slot" :value="slot" />
          </el-select>
        </el-form-item>
        <el-form-item label="锁定原因" prop="reason">
          <el-input v-model="form.reason" :rows="3" type="textarea" maxlength="256" show-word-limit placeholder="例如：师傅排满、天气原因" />
        </el-form-item>
        <el-form-item v-if="editingId" label="状态" prop="status">
          <el-radio-group v-model="form.status">
            <el-radio value="active">生效中</el-radio>
            <el-radio value="inactive">已停用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from "element-plus";
import LifeAPI from "@/api/life";
import type { AppointmentTimeLock } from "@/api/life/types";

defineOptions({ name: "LifeAppointmentTimeLocks" });

const timeSlotOptions = ["08:00-10:00", "10:00-12:00", "12:00-14:00", "14:00-16:00", "16:00-17:00"];
const loading = ref(false);
const saving = ref(false);
const locks = ref<AppointmentTimeLock[]>([]);
const formVisible = ref(false);
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const query = reactive({ dateStart: "", dateEnd: "", status: "" });
const form = reactive({ lockDate: "", timeSlots: [] as string[], timeSlot: "", reason: "", status: "active" as "active" | "inactive" });
const formRules: FormRules = {
  lockDate: [{ required: true, message: "请选择锁定日期", trigger: "change" }],
  timeSlots: [{ type: "array", required: true, min: 1, message: "至少选择一个预约时段", trigger: "change" }],
  timeSlot: [{ required: true, message: "请选择预约时段", trigger: "change" }],
};

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function resetForm() {
  Object.assign(form, { lockDate: today(), timeSlots: [], timeSlot: "", reason: "", status: "active" });
  editingId.value = null;
  formRef.value?.clearValidate();
}

async function fetchLocks() {
  loading.value = true;
  try {
    const result = await LifeAPI.getAppointmentTimeLocks({
      dateStart: query.dateStart || undefined,
      dateEnd: query.dateEnd || undefined,
      status: query.status || undefined,
    });
    locks.value = result.items || [];
  } finally {
    loading.value = false;
  }
}

function resetQuery() {
  Object.assign(query, { dateStart: "", dateEnd: "", status: "" });
  void fetchLocks();
}

function openCreate() {
  resetForm();
  formVisible.value = true;
}

function openEdit(row: AppointmentTimeLock) {
  resetForm();
  editingId.value = row.id;
  Object.assign(form, {
    lockDate: row.lockDate,
    timeSlot: row.timeSlot,
    reason: row.reason,
    status: row.status,
  });
  formVisible.value = true;
}

async function submitForm() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  saving.value = true;
  try {
    if (editingId.value) {
      await LifeAPI.updateAppointmentTimeLock(editingId.value, {
        timeSlot: form.timeSlot,
        reason: form.reason,
        status: form.status,
      });
      ElMessage.success("不可预约时段已更新");
    } else {
      await LifeAPI.createAppointmentTimeLocks({
        lockDate: form.lockDate,
        timeSlots: form.timeSlots,
        reason: form.reason || undefined,
      });
      ElMessage.success("不可预约时段已创建");
    }
    formVisible.value = false;
    await fetchLocks();
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(row: AppointmentTimeLock) {
  const nextStatus = row.status === "active" ? "inactive" : "active";
  await LifeAPI.updateAppointmentTimeLock(row.id, { status: nextStatus });
  ElMessage.success(nextStatus === "active" ? "时段已启用" : "时段已停用");
  await fetchLocks();
}

async function removeLock(row: AppointmentTimeLock) {
  await ElMessageBox.confirm(`确认删除 ${row.lockDate} ${row.timeSlot} 的锁定记录吗？`, "删除不可预约时段", { type: "warning" });
  await LifeAPI.deleteAppointmentTimeLock(row.id);
  ElMessage.success("锁定记录已删除");
  await fetchLocks();
}

onMounted(() => {
  void fetchLocks();
});
</script>

<style scoped lang="scss">
.appointment-time-locks {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  h2 {
    margin: 0;
    font-size: 20px;
    color: var(--el-text-color-primary);
  }

  p {
    margin: 8px 0 0;
    color: var(--el-text-color-secondary);
  }
}

.filter-form {
  margin-bottom: -18px;
}

.slot-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 8px;
}

@media (max-width: 720px) {
  .page-header {
    align-items: flex-start;
    gap: 12px;
    flex-direction: column;
  }

  .slot-options {
    grid-template-columns: 1fr;
  }
}
</style>
