<template>
  <div class="page-container referrals">
    <el-card class="page-header" shadow="never">
      <div><h2>邀请拉新</h2><p>查看 A-B 邀请绑定，审核异常关系。已产生奖励的关系只能通过积分冲正处理。</p></div>
    </el-card>
    <el-card shadow="never">
      <el-form :inline="true" class="filter-form">
        <el-form-item label="用户/分享码"><el-input v-model="query.keyword" clearable placeholder="手机号或分享码" @keyup.enter="load" /></el-form-item>
        <el-form-item label="状态"><el-select v-model="query.status" clearable placeholder="全部" style="width: 120px"><el-option label="有效" value="active" /><el-option label="待审核" value="held" /><el-option label="无效" value="invalid" /><el-option label="已作废" value="revoked" /></el-select></el-form-item>
        <el-form-item><el-button type="primary" icon="search" @click="load">查询</el-button><el-button icon="refresh" @click="reset">重置</el-button></el-form-item>
      </el-form>
    </el-card>
    <el-card shadow="never">
      <el-table v-loading="loading" :data="items" border>
        <el-table-column label="邀请人 A" min-width="160"><template #default="{ row }">{{ userText(row.inviter) }}</template></el-table-column>
        <el-table-column label="新用户 B" min-width="160"><template #default="{ row }">{{ userText(row.invitee) }}</template></el-table-column>
        <el-table-column label="来源" width="110"><template #default="{ row }">{{ row.source === "link" ? "邀请链接" : "分享码" }}</template></el-table-column>
        <el-table-column prop="shareCode" label="分享码" width="130" />
        <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="tagType(row.status)">{{ statusText(row.status) }}</el-tag></template></el-table-column>
        <el-table-column prop="riskReason" label="风险说明" min-width="180"><template #default="{ row }">{{ row.riskReason || "-" }}</template></el-table-column>
        <el-table-column prop="boundAt" label="绑定时间" width="180" />
        <el-table-column label="操作" width="100" fixed="right"><template #default="{ row }"><el-button type="primary" link @click="openReview(row)">审核</el-button></template></el-table-column>
      </el-table>
    </el-card>
    <el-dialog v-model="dialogVisible" title="审核邀请关系" width="500px" destroy-on-close>
      <el-form :model="reviewForm" label-width="96px"><el-form-item label="状态"><el-select v-model="reviewForm.status" style="width: 100%"><el-option label="有效" value="active" /><el-option label="待审核" value="held" /><el-option label="无效" value="invalid" /><el-option label="已作废" value="revoked" /></el-select></el-form-item><el-form-item label="风险等级"><el-input v-model="reviewForm.riskLevel" maxlength="16" placeholder="例如 high" /></el-form-item><el-form-item label="审核说明"><el-input v-model="reviewForm.riskReason" type="textarea" :rows="3" maxlength="256" /></el-form-item></el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="submitReview">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import LifeAPI from "@/api/life";
import type { ReferralBinding } from "@/api/life/types";

defineOptions({ name: "LifeReferrals" });

const loading = ref(false);
const saving = ref(false);
const items = ref<ReferralBinding[]>([]);
const query = reactive({ keyword: "", status: "" });
const dialogVisible = ref(false);
const editing = ref<ReferralBinding | null>(null);
const reviewForm = reactive({ status: "held" as ReferralBinding["status"], riskLevel: "", riskReason: "" });

async function load() { loading.value = true; try { const result = await LifeAPI.getReferralBindings({ page: 1, pageSize: 100, keyword: query.keyword || undefined, status: query.status || undefined }); items.value = result.list; } finally { loading.value = false; } }
function reset() { Object.assign(query, { keyword: "", status: "" }); void load(); }
function openReview(row: ReferralBinding) { editing.value = row; Object.assign(reviewForm, { status: row.status, riskLevel: row.riskLevel || "", riskReason: row.riskReason || "" }); dialogVisible.value = true; }
async function submitReview() { if (!editing.value) return; saving.value = true; try { await LifeAPI.reviewReferralBinding(editing.value.id, { ...reviewForm }); ElMessage.success("邀请关系已更新"); dialogVisible.value = false; await load(); } finally { saving.value = false; } }
function userText(user: ReferralBinding["inviter"]) { return user ? (user.nickname || user.phone || `用户${user.id}`) : "-"; }
function statusText(status: string) { return ({ active: "有效", held: "待审核", invalid: "无效", revoked: "已作废" } as Record<string, string>)[status] || status; }
function tagType(status: string) { return ({ active: "success", held: "warning", invalid: "danger", revoked: "info" } as Record<string, "success" | "warning" | "danger" | "info">)[status] || "info"; }
onMounted(() => { void load(); });
</script>

<style scoped lang="scss">
.referrals { display: flex; flex-direction: column; gap: 16px; }
.page-header h2 { margin: 0; font-size: 20px; }
.page-header p { margin: 8px 0 0; color: var(--el-text-color-secondary); }
.filter-form { margin-bottom: -18px; }
</style>
