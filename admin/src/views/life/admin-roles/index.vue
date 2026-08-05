<template>
  <div class="page-container">
    <div class="page-header">
      <h2>后台角色权限</h2>
      <el-button v-if="canEdit" type="primary" icon="plus" @click="openCreate">新建角色</el-button>
    </div>

    <el-table v-loading="loading" :data="roles" border>
      <el-table-column prop="displayName" label="角色" min-width="140" />
      <el-table-column prop="name" label="编码" min-width="150" />
      <el-table-column label="权限数" width="100"><template #default="{ row }">{{ row.permissions.length }}</template></el-table-column>
      <el-table-column label="管理员" width="100"><template #default="{ row }">{{ row.adminCount }}</template></el-table-column>
      <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.status === 'active' ? 'success' : 'info'">{{ row.status === 'active' ? '启用' : '停用' }}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="100" fixed="right"><template #default="{ row }"><el-button v-if="canEdit" link type="primary" @click="openEdit(row)">编辑</el-button></template></el-table-column>
    </el-table>

    <h3>管理员角色分配</h3>
    <el-table v-loading="loading" :data="admins" border>
      <el-table-column prop="username" label="账号" min-width="150" />
      <el-table-column prop="name" label="姓名" min-width="120" />
      <el-table-column prop="roleName" label="当前角色" min-width="140" />
      <el-table-column label="分配角色" min-width="260"><template #default="{ row }"><el-select v-model="assignment[row.id]" :disabled="!canAssign || row.id === currentAdminId" style="width: 150px"><el-option v-for="role in activeRoles" :key="role.id" :label="role.displayName" :value="role.id" /></el-select><el-button v-if="canAssign && row.id !== currentAdminId" link type="primary" @click="saveAssignment(row)">保存</el-button></template></el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑角色' : '新建角色'" width="760px">
      <el-form label-width="90px"><el-form-item label="编码"><el-input v-model="form.name" :disabled="Boolean(editing)" /></el-form-item><el-form-item label="名称"><el-input v-model="form.displayName" /></el-form-item><el-form-item v-if="editing" label="状态"><el-radio-group v-model="form.status"><el-radio value="active">启用</el-radio><el-radio value="inactive">停用</el-radio></el-radio-group></el-form-item><el-form-item label="权限"><el-checkbox-group v-model="form.permissions" class="permissions"><el-checkbox v-for="item in catalog" :key="item.code" :value="item.code">{{ item.code }}</el-checkbox></el-checkbox-group></el-form-item></el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveRole">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import LifeAPI from "@/api/life";
import type { AdminPermissionDescriptor, AdminRoleAssignment, AdminRoleRecord } from "@/api/life";
import { useUserStore } from "@/stores";
import { hasPerm } from "@/utils/auth";

const roles = ref<AdminRoleRecord[]>([]);
const admins = ref<AdminRoleAssignment[]>([]);
const catalog = ref<AdminPermissionDescriptor[]>([]);
const assignment = reactive<Record<string, string>>({});
const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const editing = ref<AdminRoleRecord>();
const form = reactive({ name: "", displayName: "", status: "active" as "active" | "inactive", permissions: [] as string[] });
const canEdit = computed(() => hasPerm("admin-role:update"));
const canAssign = computed(() => hasPerm("admin-role:assign"));
const currentAdminId = computed(() => String(useUserStore().userInfo?.userId || ""));
const activeRoles = computed(() => roles.value.filter(role => role.status === "active"));

async function load() {
  loading.value = true;
  try {
    [roles.value, admins.value, catalog.value] = await Promise.all([LifeAPI.getAdminRoles(), LifeAPI.getAdminRoleAssignments(), LifeAPI.getAdminPermissionCatalog()]);
    admins.value.forEach(admin => { assignment[admin.id] = admin.roleId || ""; });
  } finally { loading.value = false; }
}
function openCreate() { editing.value = undefined; Object.assign(form, { name: "", displayName: "", status: "active", permissions: [] }); dialogVisible.value = true; }
function openEdit(role: AdminRoleRecord) { editing.value = role; Object.assign(form, { name: role.name, displayName: role.displayName, status: role.status, permissions: [...role.permissions] }); dialogVisible.value = true; }
async function saveRole() {
  if (!form.displayName.trim() || !form.permissions.length) return ElMessage.warning("请填写角色名称并选择权限");
  saving.value = true;
  try {
    if (editing.value) await LifeAPI.updateAdminRole(editing.value.id, { displayName: form.displayName.trim(), status: form.status, permissions: form.permissions, expectedVersion: editing.value.version });
    else await LifeAPI.createAdminRole({ name: form.name.trim(), displayName: form.displayName.trim(), permissions: form.permissions });
    dialogVisible.value = false; await load();
  } finally { saving.value = false; }
}
async function saveAssignment(admin: AdminRoleAssignment) {
  const roleId = assignment[admin.id]; if (!roleId) return ElMessage.warning("请选择角色");
  await LifeAPI.assignAdminRole(admin.id, { roleId, expectedVersion: admin.version }); await load();
}
void load();
</script>

<style scoped>
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
h2, h3 { margin: 0; } h3 { font-size: 16px; margin: 24px 0 12px; }
.permissions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; max-height: 380px; overflow: auto; }
</style>
