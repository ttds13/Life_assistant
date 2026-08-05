<template>
  <div class="page-container points-rules">
    <el-card class="page-header" shadow="never">
      <div>
        <h2>积分规则</h2>
        <p>规则发布后只影响后续完成订单；积分数量不会因兑换倍率调整而重算。</p>
      </div>
    </el-card>

    <el-row :gutter="16">
      <el-col v-for="rule in rules" :key="rule.code" :xs="24" :lg="12">
        <el-card shadow="never" class="rule-card">
          <template #header>
            <div class="rule-title">
              <div>
                <strong>{{ rule.name }}</strong>
                <p>{{ rule.description }}</p>
              </div>
              <el-tag :type="rule.status === 'active' ? 'success' : 'info'">{{ rule.status === 'active' ? '已启用' : '已停用' }}</el-tag>
            </div>
          </template>

          <el-form :model="forms[rule.code]" label-width="126px">
            <el-form-item label="消费积分倍率">
              <el-input-number v-model="forms[rule.code].earnPointsPerYuan" :min="1" :max="100000" :precision="0" />
              <span class="unit">分 / 元</span>
            </el-form-item>
            <el-form-item label="积分兑换倍率">
              <el-input-number v-model="forms[rule.code].redemptionPointsPerYuan" :min="1" :max="100000" :precision="0" />
              <span class="unit">分 / 元</span>
            </el-form-item>
            <template v-if="rule.code === 'referral_first_consumption'">
              <el-form-item label="奖励计算方式">
                <el-select v-model="forms[rule.code].calculationType" style="width: 100%">
                  <el-option label="固定积分" value="fixed_points" />
                  <el-option label="B 本次积分百分比" value="invitee_points_percent" />
                  <el-option label="B 本次积分倍数" value="invitee_points_multiplier" />
                  <el-option label="按 B 实付金额倍率" value="amount_multiplier" />
                </el-select>
              </el-form-item>
              <el-form-item :label="referralValueLabel(forms[rule.code].calculationType)">
                <el-input-number v-model="forms[rule.code].calculationValue" :min="0" :max="100000" :precision="2" />
              </el-form-item>
              <el-form-item label="仅首个合格订单">
                <el-switch v-model="forms[rule.code].firstOnly" />
              </el-form-item>
            </template>
            <el-form-item label="最低实付金额">
              <el-input-number v-model="forms[rule.code].minimumPaidAmount" :min="0" :max="100000" :precision="2" />
              <span class="unit">元</span>
            </el-form-item>
          </el-form>

          <div class="preview">
            <span>试算：消费 100 元</span>
            <strong>{{ previewPoints(forms[rule.code]) }} 分</strong>
            <span>，按当前兑换倍率约 {{ previewValue(forms[rule.code]) }} 元</span>
          </div>
          <div class="actions">
            <el-button :loading="savingCode === rule.code" @click="toggleStatus(rule)">{{ rule.status === 'active' ? '停用' : '启用' }}</el-button>
            <el-button type="primary" :loading="savingCode === rule.code" @click="publish(rule)">发布新版本</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never">
      <template #header><strong>积分奖励记录</strong></template>
      <el-form :inline="true" class="filter-form">
        <el-form-item label="订单/手机号"><el-input v-model="eventKeyword" clearable placeholder="订单号或用户手机号" @keyup.enter="loadEvents" /></el-form-item>
        <el-form-item><el-button type="primary" icon="search" @click="loadEvents">查询</el-button></el-form-item>
      </el-form>
      <el-table v-loading="eventsLoading" :data="events" border>
        <el-table-column prop="orderNo" label="订单号" min-width="150" />
        <el-table-column prop="ruleCode" label="规则" min-width="180" />
        <el-table-column label="受益用户" min-width="150"><template #default="{ row }">{{ userText(row.beneficiary) }}</template></el-table-column>
        <el-table-column label="来源用户" min-width="150"><template #default="{ row }">{{ userText(row.sourceUser) }}</template></el-table-column>
        <el-table-column prop="points" label="积分" width="100" />
        <el-table-column label="积分价值" width="110"><template #default="{ row }">¥{{ money(row.rewardValue) }}</template></el-table-column>
        <el-table-column prop="status" label="状态" width="130" />
        <el-table-column prop="createdAt" label="创建时间" width="180" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import LifeAPI from "@/api/life";
import type { PointRewardEvent, PointRewardRule } from "@/api/life/types";

defineOptions({ name: "LifePointRewardRules" });

interface RuleForm {
  earnPointsPerYuan: number;
  redemptionPointsPerYuan: number;
  calculationType: string;
  calculationValue: number;
  firstOnly: boolean;
  minimumPaidAmount: number;
}

const rules = ref<PointRewardRule[]>([]);
const forms = reactive<Record<string, RuleForm>>({});
const savingCode = ref("");
const events = ref<PointRewardEvent[]>([]);
const eventsLoading = ref(false);
const eventKeyword = ref("");

function formFor(rule: PointRewardRule): RuleForm {
  const qualification = rule.qualificationConfig || {};
  const calculation = rule.calculationConfig || {};
  const calculationType = rule.calculationType || "fixed_points";
  const key = calculationType === "fixed_points" ? "fixedPoints" : calculationType === "invitee_points_percent" ? "percent" : "multiplier";
  return {
    earnPointsPerYuan: rule.earnPointsPerYuan,
    redemptionPointsPerYuan: rule.redemptionPointsPerYuan,
    calculationType,
    calculationValue: Number(calculation[key] || 0),
    firstOnly: qualification.firstOnly !== false,
    minimumPaidAmount: Number(qualification.minimumPaidAmount || 0),
  };
}

async function loadRules() {
  rules.value = await LifeAPI.getPointRewardRules();
  for (const rule of rules.value) forms[rule.code] = formFor(rule);
}

async function loadEvents() {
  eventsLoading.value = true;
  try {
    const result = await LifeAPI.getPointRewardEvents({ page: 1, pageSize: 50, keyword: eventKeyword.value || undefined });
    events.value = result.list;
  } finally {
    eventsLoading.value = false;
  }
}

function calculationConfig(form: RuleForm) {
  if (form.calculationType === "fixed_points") return { fixedPoints: form.calculationValue };
  if (form.calculationType === "invitee_points_percent") return { percent: form.calculationValue };
  return { multiplier: form.calculationValue };
}

async function publish(rule: PointRewardRule) {
  const form = forms[rule.code];
  savingCode.value = rule.code;
  try {
    await LifeAPI.publishPointRewardRule(rule.code, {
      status: rule.status,
      earnPointsPerYuan: Math.floor(form.earnPointsPerYuan),
      redemptionPointsPerYuan: Math.floor(form.redemptionPointsPerYuan),
      calculationType: rule.code === "referral_first_consumption" ? form.calculationType : "spend_rate",
      qualificationConfig: { orderTypes: ["service_booking"], minimumPaidAmount: form.minimumPaidAmount, firstOnly: form.firstOnly },
      calculationConfig: calculationConfig(form),
    });
    ElMessage.success("积分规则已发布新版本");
    await loadRules();
  } finally {
    savingCode.value = "";
  }
}

async function toggleStatus(rule: PointRewardRule) {
  savingCode.value = rule.code;
  try {
    await LifeAPI.updatePointRewardRuleStatus(rule.code, rule.status === "active" ? "inactive" : "active");
    ElMessage.success(rule.status === "active" ? "规则已停用" : "规则已启用");
    await loadRules();
  } finally {
    savingCode.value = "";
  }
}

function previewPoints(form: RuleForm) {
  return Math.floor(100 * Number(form.earnPointsPerYuan || 0));
}

function previewValue(form: RuleForm) {
  const rate = Number(form.redemptionPointsPerYuan || 1);
  return (previewPoints(form) / rate).toFixed(2);
}

function referralValueLabel(type: string) {
  if (type === "fixed_points") return "固定积分";
  if (type === "invitee_points_percent") return "积分百分比";
  return "奖励倍数";
}

function userText(user: PointRewardEvent["beneficiary"]) {
  if (!user) return "-";
  return user.nickname || user.phone || `用户${user.id}`;
}

function money(value: number) {
  return Number(value || 0).toFixed(2);
}

onMounted(() => {
  void loadRules();
  void loadEvents();
});
</script>

<style scoped lang="scss">
.points-rules { display: flex; flex-direction: column; gap: 16px; }
.page-header h2 { margin: 0; font-size: 20px; }
.page-header p { margin: 8px 0 0; color: var(--el-text-color-secondary); }
.rule-card { margin-bottom: 16px; min-height: 430px; }
.rule-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.rule-title strong { font-size: 16px; }
.rule-title p { margin: 6px 0 0; color: var(--el-text-color-secondary); line-height: 1.5; }
.unit { margin-left: 8px; color: var(--el-text-color-secondary); }
.preview { padding: 12px; background: var(--el-fill-color-light); color: var(--el-text-color-regular); }
.preview strong { margin: 0 4px; color: var(--el-color-primary); }
.actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px; }
.filter-form { margin-bottom: -18px; }
</style>
