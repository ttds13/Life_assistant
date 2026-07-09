<template>
  <div class="page-container life-page">
    <el-card class="life-header" shadow="never">
      <div>
        <h2>{{ pageConfig?.title || "业务管理" }}</h2>
        <p>{{ pageConfig?.description || "生活助手后台业务数据管理。" }}</p>
      </div>
      <el-button v-if="pageConfig?.primaryAction" type="primary" icon="plus" @click="handleCreate">
        {{ pageConfig.primaryAction }}
      </el-button>
    </el-card>

    <el-card class="page-search" shadow="never">
      <el-form :model="queryParams" :inline="true">
        <el-form-item label="关键词">
          <el-input
            v-model="queryParams.keywords"
            :placeholder="pageConfig?.searchPlaceholder || '请输入关键词'"
            clearable
            @keyup.enter="fetchPage"
          />
        </el-form-item>
        <el-form-item v-if="statusOptions.length > 1" label="状态">
          <el-select v-model="queryParams.status" clearable style="width: 140px">
            <el-option
              v-for="item in statusOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="search" @click="fetchPage">搜索</el-button>
          <el-button icon="refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="page-content" shadow="never">
      <div class="page-toolbar">
        <div class="page-toolbar__left">
          <el-tag type="primary" effect="plain">共 {{ total }} 条</el-tag>
        </div>
        <div class="page-toolbar__right">
          <el-button icon="refresh" @click="fetchPage">刷新</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="tableData" border>
        <el-table-column label="ID" prop="id" width="110" fixed="left" />
        <el-table-column
          v-for="column in pageConfig?.columns || []"
          :key="column.prop"
          :prop="column.prop"
          :label="column.label"
          :width="column.width"
          :min-width="column.minWidth"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <el-tag v-if="column.type === 'tag'" :type="resolveTagType(row[column.prop])">
              {{ formatValue(row[column.prop], column.type) }}
            </el-tag>
            <el-image
              v-else-if="column.type === 'image'"
              class="life-table-image"
              :src="tableImageUrl(row, column.prop)"
              fit="cover"
              :preview-src-list="tableImageUrl(row, column.prop) ? [tableImageUrl(row, column.prop)] : []"
              preview-teleported
            />
            <div v-else-if="column.type === 'copy'" class="life-copy-cell">
              <span class="life-copy-cell__text">{{ formatValue(row[column.prop], column.type) }}</span>
              <copy-button v-if="copyTextValue(row[column.prop])" :text="copyTextValue(row[column.prop])" />
            </div>
            <span v-else>{{ formatValue(row[column.prop], column.type) }}</span>
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="340">
          <template #default="{ row }">
            <el-button type="primary" link size="small" icon="view" @click="handleView(row)">
              查看
            </el-button>
            <el-button
              v-for="action in pageConfig?.rowActions || []"
              :key="action.key"
              :type="action.type || 'primary'"
              link
              size="small"
              @click="handleRowAction(action.key, row)"
            >
              {{ action.label }}
            </el-button>
            <el-button
              v-if="moduleKey === 'users'"
              :type="isStaffRole(row) ? 'warning' : 'success'"
              link
              size="small"
              @click="handleToggleUserRole(row)"
            >
              {{ isStaffRole(row) ? "关闭师傅" : "开通师傅" }}
            </el-button>
            <el-button
              v-if="moduleKey === 'users'"
              type="success"
              link
              size="small"
              @click="openGrantCard(row)"
            >
              发卡
            </el-button>
            <el-button
              v-if="pageConfig?.editable"
              type="primary"
              link
              size="small"
              icon="edit"
              @click="handleEdit(row)"
            >
              编辑
            </el-button>
            <el-button
              v-if="canToggleStatus(row)"
              :type="isEnabledStatus(row.status) ? 'warning' : 'success'"
              link
              size="small"
              @click="handleToggleStatus(row)"
            >
              {{ isEnabledStatus(row.status) ? "停用" : "启用" }}
            </el-button>
            <el-button
              v-if="pageConfig?.deletable"
              type="danger"
              link
              size="small"
              icon="delete"
              @click="handleDelete(row)"
            >
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
        @pagination="fetchPage"
      />
    </el-card>

    <el-dialog v-model="formVisible" :title="formTitle" width="560px">
      <el-form :model="formModel" label-width="100px">
        <el-form-item
          v-for="item in pageConfig?.formItems || []"
          :key="item.prop"
          :label="item.label"
          :required="item.required"
        >
          <el-input
            v-if="item.type === 'text'"
            :model-value="stringFormValue(item.prop)"
            @update:model-value="(value) => setFormValue(item.prop, value)"
            :placeholder="item.placeholder"
          />
          <el-input
            v-else-if="item.type === 'textarea'"
            :model-value="stringFormValue(item.prop)"
            @update:model-value="(value) => setFormValue(item.prop, value)"
            type="textarea"
            :rows="3"
            :placeholder="item.placeholder"
          />
          <el-input-number
            v-else-if="item.type === 'number'"
            :model-value="numberFormValue(item.prop)"
            @update:model-value="(value) => setFormValue(item.prop, value)"
            :min="0"
            controls-position="right"
            style="width: 100%"
          />
          <el-select
            v-else-if="item.type === 'select'"
            :model-value="stringFormValue(item.prop)"
            @update:model-value="(value) => setFormValue(item.prop, value)"
            style="width: 100%"
          >
            <el-option
              v-for="option in item.options || []"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-date-picker
            v-else-if="item.type === 'datetime'"
            :model-value="dateFormValue(item.prop)"
            @update:model-value="(value) => setFormValue(item.prop, value)"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
          <div v-else-if="item.type === 'promotion-target'" class="promotion-target-control">
            <el-select
              :model-value="stringFormValue(item.prop)"
              filterable
              remote
              clearable
              :disabled="promotionTargetDisabled"
              :loading="promotionTargetLoading"
              :remote-method="loadPromotionTargetOptions"
              :placeholder="promotionTargetPlaceholder"
              style="width: 100%"
              @visible-change="handlePromotionTargetVisible"
              @update:model-value="setPromotionTargetValue"
            >
              <el-option
                v-for="option in promotionTargetOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
            <div class="form-tip">
              {{ promotionTargetTip }}
            </div>
          </div>
          <div v-else-if="item.type === 'image'" class="image-form-control">
            <single-image-upload
              :model-value="stringFormValue(item.prop)"
              :display-url="imageDisplayUrl(item.prop)"
              :data="{ bizType: imageBizType(item.prop) }"
              :max-file-size="5"
              @update:model-value="(value: string) => setFormValue(item.prop, value)"
            />
            <el-input
              :model-value="stringFormValue(item.prop)"
              @update:model-value="(value) => setFormValue(item.prop, value)"
              placeholder="可直接粘贴 OSS 图片地址"
            />
          </div>
          <div v-else-if="item.type === 'images'" class="image-form-control">
            <multi-image-upload
              :model-value="arrayFormValue(item.prop)"
              :display-urls="imageDisplayUrls(item.prop)"
              :data="{ bizType: imageBizType(item.prop) }"
              :limit="9"
              :max-file-size="5"
              @update:model-value="(value: string[]) => setFormValue(item.prop, value)"
            />
          </div>
          <el-switch
            v-else-if="item.type === 'switch'"
            :model-value="Boolean(formModel[item.prop])"
            @update:model-value="(value) => setFormValue(item.prop, value)"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">
          {{ pageConfig?.submitAction || "保存" }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="addressDialogVisible" :title="addressDialogTitle" width="920px">
      <div class="address-dialog-toolbar">
        <el-button type="primary" icon="plus" @click="handleCreateOwnerAddress">新增地址</el-button>
        <el-button icon="refresh" @click="loadOwnerAddresses">刷新</el-button>
      </div>
      <el-table v-loading="addressLoading" :data="ownerAddresses" border>
        <el-table-column prop="id" label="ID" width="90" />
        <el-table-column prop="addressType" label="类型" width="100" />
        <el-table-column prop="contactName" label="联系人" width="110" />
        <el-table-column prop="contactPhone" label="手机号" width="130" />
        <el-table-column prop="cityName" label="城市" width="100" />
        <el-table-column prop="districtName" label="区域" width="100" />
        <el-table-column prop="formattedAddress" label="详细地址" min-width="260" show-overflow-tooltip />
        <el-table-column prop="isDefault" label="默认" width="80">
          <template #default="{ row }">
            <el-tag :type="row.isDefault ? 'success' : 'info'">{{ row.isDefault ? "是" : "否" }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="150">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleEditOwnerAddress(row)">编辑</el-button>
            <el-button type="danger" link size="small" @click="handleDeleteOwnerAddress(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <el-dialog v-model="addressFormVisible" :title="addressFormTitle" width="560px">
      <el-form :model="addressFormModel" label-width="100px">
        <el-form-item label="类型" required>
          <el-select v-model="addressFormModel.addressType" style="width: 100%">
            <el-option label="服务地址" value="service" />
            <el-option label="常驻地址" value="home" />
            <el-option label="工作地址" value="work" />
            <el-option label="结算地址" value="billing" />
          </el-select>
        </el-form-item>
        <el-form-item label="联系人" required>
          <el-input v-model="addressFormModel.contactName" />
        </el-form-item>
        <el-form-item label="手机号" required>
          <el-input v-model="addressFormModel.contactPhone" maxlength="11" />
        </el-form-item>
        <el-form-item label="省份">
          <el-input v-model="addressFormModel.provinceName" />
        </el-form-item>
        <el-form-item label="城市">
          <el-input v-model="addressFormModel.cityName" />
        </el-form-item>
        <el-form-item label="区域">
          <el-input v-model="addressFormModel.districtName" />
        </el-form-item>
        <el-form-item label="街道">
          <el-input v-model="addressFormModel.streetName" />
        </el-form-item>
        <el-form-item label="位置">
          <el-input v-model="addressFormModel.addressTitle" />
        </el-form-item>
        <el-form-item label="详细地址" required>
          <el-input v-model="addressFormModel.detailAddress" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="门牌号">
          <el-input v-model="addressFormModel.houseNumber" />
        </el-form-item>
        <el-form-item label="默认地址">
          <el-switch v-model="addressFormModel.isDefault" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addressFormVisible = false">取消</el-button>
        <el-button type="primary" :loading="addressSaving" @click="submitOwnerAddress">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="customerVisible" title="快速新增线下客户" width="720px">
      <el-alert
        title="只需要填写手机号、客户姓名和服务地址；来源、联系人、联系电话、默认地址等由系统自动补齐。手机号已存在时会复用客户。"
        type="info"
        show-icon
        :closable="false"
        class="mb-4"
      />
      <el-form :model="customerForm" label-width="110px">
        <el-row :gutter="12">
          <el-col :span="10">
            <el-form-item label="客户姓名">
              <el-input v-model="customerForm.nickname" maxlength="64" placeholder="不填则使用手机号" />
            </el-form-item>
          </el-col>
          <el-col :span="14">
            <el-form-item label="手机号" required>
              <el-input v-model="customerForm.phone" maxlength="20" placeholder="客户手机号" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-alert
          v-if="existingCustomer"
          type="warning"
          show-icon
          :closable="false"
          class="existing-customer-tip"
        >
          <template #title>
            手机号已存在，保存时将复用该客户
          </template>
          <div>
            {{ customerSummary(existingCustomer) }}
          </div>
        </el-alert>

        <el-divider content-position="left">默认服务地址</el-divider>
        <el-form-item label="同步创建">
          <el-switch v-model="customerForm.createAddress" />
        </el-form-item>
        <template v-if="customerForm.createAddress">
          <el-form-item label="服务地址">
            <el-input
              v-model="customerForm.detailAddress"
              type="textarea"
              :rows="2"
              maxlength="256"
              show-word-limit
              placeholder="可直接填写小区、楼栋、门牌、补充说明；不填则只创建客户"
            />
          </el-form-item>
          <el-form-item label="门牌号">
            <el-input v-model="customerForm.houseNumber" maxlength="64" placeholder="如 8栋808，可选" />
          </el-form-item>
        </template>
        <el-form-item label="客户备注">
          <el-input v-model="customerForm.adminRemark" type="textarea" :rows="2" maxlength="512" show-word-limit />
        </el-form-item>
        <el-collapse v-model="customerAdvancedVisible" class="quick-customer-advanced">
          <el-collapse-item title="高级选项" name="advanced">
            <el-row :gutter="12">
              <el-col :span="12">
                <el-form-item label="来源">
                  <el-select v-model="customerForm.source" style="width: 100%">
                    <el-option label="线下客户" value="offline" />
                    <el-option label="后台录入" value="admin" />
                    <el-option label="电话客户" value="phone" />
                    <el-option label="微信私域" value="wechat_private" />
                    <el-option label="推广渠道" value="channel" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="城市编码">
                  <el-input v-model="customerForm.cityCode" maxlength="20" />
                </el-form-item>
              </el-col>
            </el-row>
            <template v-if="customerForm.createAddress">
              <el-row :gutter="12">
                <el-col :span="12">
                  <el-form-item label="联系人">
                    <el-input v-model="customerForm.contactName" maxlength="64" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="联系电话">
                    <el-input v-model="customerForm.contactPhone" maxlength="20" />
                  </el-form-item>
                </el-col>
              </el-row>
              <el-row :gutter="12">
                <el-col :span="8">
                  <el-form-item label="城市">
                    <el-input v-model="customerForm.cityName" maxlength="32" />
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="区县">
                    <el-input v-model="customerForm.districtName" maxlength="32" />
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="小区/地点">
                    <el-input v-model="customerForm.addressTitle" maxlength="128" />
                  </el-form-item>
                </el-col>
              </el-row>
            </template>
          </el-collapse-item>
        </el-collapse>
      </el-form>
      <template #footer>
        <el-button @click="customerVisible = false">取消</el-button>
        <el-button type="primary" :loading="customerSaving" @click="submitCustomer">保存客户</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="grantCardVisible" title="给用户发放会员卡" width="520px">
      <el-form :model="grantCardForm" label-width="110px">
        <el-form-item label="用户">
          <el-text>{{ grantCardUser?.nickname || grantCardUser?.phone || grantCardUser?.id }}</el-text>
        </el-form-item>
        <el-form-item label="会员卡模板ID" required>
          <el-input-number v-model="grantCardForm.cardId" :min="1" :step="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="发放额度">
          <el-input-number v-model="grantCardForm.totalUnits" :min="0" :step="1" style="width: 100%" />
          <div class="form-tip">0 表示使用模板默认额度；时长卡单位为分钟，次卡单位为次。</div>
        </el-form-item>
        <el-form-item label="有效天数">
          <el-input-number v-model="grantCardForm.validityDays" :min="0" :step="1" style="width: 100%" />
          <div class="form-tip">0 表示使用模板默认有效期。</div>
        </el-form-item>
        <el-form-item label="发卡来源">
          <el-select v-model="grantCardForm.source" style="width: 100%">
            <el-option label="后台发放" value="admin" />
            <el-option label="线下购买" value="offline" />
            <el-option label="后台调整" value="adjust" />
          </el-select>
        </el-form-item>
        <el-form-item label="收款金额">
          <el-input-number v-model="grantCardForm.offlinePaymentAmount" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="收款方式">
          <el-select v-model="grantCardForm.paymentChannel" style="width: 100%">
            <el-option label="线下收款" value="offline" />
            <el-option label="后台发放" value="admin" />
            <el-option label="微信私域" value="wechat_private" />
          </el-select>
        </el-form-item>
        <el-form-item label="收款备注">
          <el-input v-model="grantCardForm.paymentRemark" maxlength="256" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="grantCardForm.remark" type="textarea" :rows="3" maxlength="256" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="grantCardVisible = false">取消</el-button>
        <el-button type="primary" :loading="grantCardSaving" @click="submitGrantCard">确认发卡</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="pointsDialogVisible" title="用户积分" width="780px">
      <div v-loading="pointsLoading">
        <el-descriptions v-if="pointsSummary" :column="3" border>
          <el-descriptions-item label="用户">{{ pointsSummary.userName || pointsSummary.userPhone || pointsSummary.userId }}</el-descriptions-item>
          <el-descriptions-item label="手机号">{{ pointsSummary.userPhone || "-" }}</el-descriptions-item>
          <el-descriptions-item label="当前积分">{{ pointsSummary.availablePoints }}</el-descriptions-item>
          <el-descriptions-item label="累计金额">￥{{ money(pointsSummary.totalAmount) }}</el-descriptions-item>
          <el-descriptions-item label="流水数">{{ pointsSummary.ledgerCount }}</el-descriptions-item>
          <el-descriptions-item label="用户ID">{{ pointsSummary.userId }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">人工调整</el-divider>
        <el-form :model="pointAdjustForm" label-width="90px" class="points-adjust-form">
          <el-row :gutter="12">
            <el-col :span="8">
              <el-form-item label="积分" required>
                <el-input-number v-model="pointAdjustForm.points" :step="1" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="关联金额">
                <el-input-number v-model="pointAdjustForm.amount" :min="0" :precision="2" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-button type="primary" :loading="pointsSaving" @click="submitPointAdjust">提交调整</el-button>
            </el-col>
          </el-row>
          <el-form-item label="备注">
            <el-input v-model="pointAdjustForm.remark" type="textarea" :rows="2" maxlength="256" show-word-limit />
          </el-form-item>
        </el-form>

        <el-divider content-position="left">最近流水</el-divider>
        <el-table :data="pointsSummary?.recentLedgers || []" border size="small">
          <el-table-column prop="orderNo" label="订单号" min-width="150" />
          <el-table-column prop="type" label="类型" width="120" />
          <el-table-column prop="points" label="积分" width="90" />
          <el-table-column label="金额" width="110">
            <template #default="{ row }">￥{{ money(row.amount) }}</template>
          </el-table-column>
          <el-table-column prop="balanceAfter" label="余额" width="100" />
          <el-table-column prop="remark" label="备注" min-width="180" />
          <el-table-column prop="createdAt" label="时间" width="170" />
        </el-table>
      </div>
    </el-dialog>

    <el-dialog v-model="grantCouponVisible" title="给用户发券" width="520px">
      <el-form :model="grantCouponForm" label-width="100px">
        <el-form-item label="优惠券">
          <el-text>{{ grantCouponRow?.name || grantCouponRow?.couponName || grantCouponRow?.id }}</el-text>
        </el-form-item>
        <el-form-item label="用户ID">
          <el-input v-model="grantCouponForm.userId" placeholder="用户ID，和手机号二选一" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="grantCouponForm.phone" maxlength="20" placeholder="手机号，和用户ID二选一" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="grantCouponForm.remark" type="textarea" :rows="3" maxlength="256" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="grantCouponVisible = false">取消</el-button>
        <el-button type="primary" :loading="grantCouponSaving" @click="submitGrantCoupon">确认发券</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="feedbackDialogVisible" title="问题反馈详情" width="760px">
      <el-descriptions v-if="selectedFeedback" :column="2" border>
        <el-descriptions-item label="反馈编号">{{ selectedFeedback.feedbackNo || "-" }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="resolveTagType(selectedFeedback.status)">
            {{ formatValue(selectedFeedback.status, "tag") }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="类型">{{ formatValue(selectedFeedback.type, "tag") }}</el-descriptions-item>
        <el-descriptions-item label="用户">{{ selectedFeedback.userName || selectedFeedback.userPhone || "-" }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ selectedFeedback.contactPhone || "-" }}</el-descriptions-item>
        <el-descriptions-item label="提交时间">{{ selectedFeedback.createdAt || "-" }}</el-descriptions-item>
        <el-descriptions-item label="反馈内容" :span="2">
          <div class="feedback-detail-text">{{ selectedFeedback.content || "-" }}</div>
        </el-descriptions-item>
        <el-descriptions-item label="当前回复" :span="2">
          <div class="feedback-detail-text">{{ selectedFeedback.reply || "暂无回复" }}</div>
        </el-descriptions-item>
      </el-descriptions>
      <div v-if="feedbackImages.length" class="feedback-images">
        <el-image
          v-for="image in feedbackImages"
          :key="image"
          class="feedback-image"
          :src="image"
          fit="cover"
          :preview-src-list="feedbackImages"
          preview-teleported
        />
      </div>
      <el-form label-width="90px" class="feedback-reply-form">
        <el-form-item label="处理回复">
          <el-input v-model="feedbackReply" type="textarea" :rows="4" maxlength="1000" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="feedbackDialogVisible = false">取消</el-button>
        <el-button :loading="feedbackSaving" @click="markSelectedFeedbackProcessing">标记处理中</el-button>
        <el-button type="primary" :loading="feedbackSaving" @click="submitFeedbackReply">回复并关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "LifeResourcePage" });

import LifeAPI from "@/api/life";
import type {
  AddressRecord,
  AdminUserPointsSummary,
  LifeModuleKey,
  LifeResourceConfig,
  LifeResourceRecord,
  LifeSelectOption,
  LifeStatusOption,
} from "@/api/life";

const route = useRoute();
const router = useRouter();

const moduleKey = computed(() => {
  return ((route.meta.params as Record<string, unknown> | undefined)?.module ||
    route.query.module ||
    "users") as LifeModuleKey;
});

const loading = ref(false);
const saving = ref(false);
const total = ref(0);
const pageConfig = ref<LifeResourceConfig>();
const tableData = ref<LifeResourceRecord[]>([]);
const formVisible = ref(false);
const editingRow = ref<LifeResourceRecord>();
const formModel = reactive<Record<string, unknown>>({});
const addressDialogVisible = ref(false);
const addressFormVisible = ref(false);
const addressLoading = ref(false);
const addressSaving = ref(false);
const customerVisible = ref(false);
const customerSaving = ref(false);
const customerAdvancedVisible = ref<string[]>([]);
const customerLookupLoading = ref(false);
const existingCustomer = ref<LifeResourceRecord>();
const grantCardVisible = ref(false);
const grantCardSaving = ref(false);
const grantCardUser = ref<LifeResourceRecord>();
const pointsDialogVisible = ref(false);
const pointsLoading = ref(false);
const pointsSaving = ref(false);
const pointsUser = ref<LifeResourceRecord>();
const pointsSummary = ref<AdminUserPointsSummary>();
const grantCouponVisible = ref(false);
const grantCouponSaving = ref(false);
const grantCouponRow = ref<LifeResourceRecord>();
const feedbackDialogVisible = ref(false);
const feedbackSaving = ref(false);
const selectedFeedback = ref<LifeResourceRecord>();
const feedbackReply = ref("");
const promotionTargetOptions = ref<LifeSelectOption[]>([]);
const promotionTargetLoading = ref(false);
const addressOwner = ref<{ ownerType: "user" | "staff"; ownerId: string; title: string }>();
const editingAddress = ref<AddressRecord>();
const ownerAddresses = ref<AddressRecord[]>([]);
const addressFormModel = reactive({
  addressType: "service",
  contactName: "",
  contactPhone: "",
  provinceName: "",
  cityName: "",
  districtName: "",
  streetName: "",
  addressTitle: "",
  detailAddress: "",
  houseNumber: "",
  isDefault: false,
});
const customerForm = reactive({
  nickname: "",
  phone: "",
  source: "admin",
  cityCode: "",
  adminRemark: "",
  createAddress: true,
  contactName: "",
  contactPhone: "",
  provinceName: "",
  cityName: "",
  districtName: "",
  streetName: "",
  addressTitle: "",
  detailAddress: "",
  houseNumber: "",
});
const grantCardForm = reactive({
  cardId: 0,
  totalUnits: 0,
  validityDays: 0,
  source: "admin",
  offlinePaymentAmount: 0,
  paymentChannel: "offline",
  paymentRemark: "",
  remark: "",
});
const pointAdjustForm = reactive({
  points: 0,
  amount: 0,
  remark: "",
});
const grantCouponForm = reactive({
  userId: "",
  phone: "",
  remark: "",
});
const queryParams = reactive({
  pageNum: 1,
  pageSize: 10,
  keywords: "",
  status: "",
});

const statusOptions = computed<LifeStatusOption[]>(() => pageConfig.value?.statusOptions || []);
const formTitle = computed(() => `${editingRow.value ? "编辑" : "新增"}${pageConfig.value?.title || ""}`);
const addressDialogTitle = computed(() => `地址管理 - ${addressOwner.value?.title || ""}`);
const addressFormTitle = computed(() => `${editingAddress.value ? "编辑" : "新增"}地址`);
const promotionTargetType = computed(() => String(formModel.targetType || "service"));
const feedbackImages = computed(() => stringArrayValue(selectedFeedback.value?.images));
const promotionTargetDisabled = computed(() => moduleKey.value !== "promotionLinks" || promotionTargetType.value === "home");
const promotionTargetPlaceholder = computed(() => {
  if (promotionTargetType.value === "service") return "搜索并选择服务商品";
  if (promotionTargetType.value === "member_card") return "搜索并选择会员卡商品";
  if (promotionTargetType.value === "category") return "搜索并选择服务分类";
  return "首页不需要选择目标";
});
const promotionTargetTip = computed(() => {
  if (promotionTargetType.value === "service") return "选择服务后会自动生成服务详情页路径。";
  if (promotionTargetType.value === "member_card") return "选择会员卡后会生成会员卡详情页路径。";
  if (promotionTargetType.value === "category") return "选择分类后会生成服务列表页路径。";
  return "目标类型为首页时，固定链接会直接回到小程序首页。";
});
let customerPhoneLookupTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => customerForm.phone,
  (phone, oldPhone) => {
    const nextPhone = phone.trim();
    if (!customerForm.contactPhone || customerForm.contactPhone === oldPhone) {
      customerForm.contactPhone = nextPhone;
    }
    if (!customerForm.nickname && !customerForm.contactName) {
      customerForm.contactName = nextPhone;
    }
    scheduleCustomerPhoneLookup(nextPhone);
  }
);

watch(
  () => customerForm.nickname,
  (nickname, oldNickname) => {
    const nextName = nickname.trim() || customerForm.phone.trim();
    if (!customerForm.contactName || customerForm.contactName === oldNickname || customerForm.contactName === customerForm.phone.trim()) {
      customerForm.contactName = nextName;
    }
  }
);

watch(
  () => customerForm.detailAddress,
  (address) => {
    if (!customerForm.addressTitle && address.trim()) {
      customerForm.addressTitle = address.trim().slice(0, 20);
    }
  }
);

onBeforeUnmount(() => {
  if (customerPhoneLookupTimer) clearTimeout(customerPhoneLookupTimer);
});

watch(
  () => moduleKey.value,
  () => {
    queryParams.pageNum = 1;
    queryParams.keywords = "";
    queryParams.status = "";
    fetchPage();
  },
  { immediate: true }
);

async function fetchPage() {
  loading.value = true;
  try {
    const data = await LifeAPI.getResourcePage(moduleKey.value, {
      ...queryParams,
      module: moduleKey.value,
    });
    pageConfig.value = data.config;
    tableData.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function handleReset() {
  queryParams.pageNum = 1;
  queryParams.keywords = "";
  queryParams.status = "";
  fetchPage();
}

function handleCreate() {
  if (!pageConfig.value?.editable) {
    ElMessage.info("当前模块暂不支持新增");
    return;
  }
  if (moduleKey.value === "users") {
    resetCustomerForm();
    customerVisible.value = true;
    return;
  }
  editingRow.value = undefined;
  resetFormModel();
  seedPromotionTargetOption();
  void loadPromotionTargetOptions();
  formVisible.value = true;
}

function scheduleCustomerPhoneLookup(phone: string) {
  if (customerPhoneLookupTimer) clearTimeout(customerPhoneLookupTimer);
  existingCustomer.value = undefined;
  if (phone.length < 5) return;
  customerPhoneLookupTimer = setTimeout(() => {
    void lookupCustomerByPhone(phone);
  }, 300);
}

async function lookupCustomerByPhone(phone: string) {
  customerLookupLoading.value = true;
  try {
    const data = await LifeAPI.getResourcePage("users", {
      pageNum: 1,
      pageSize: 5,
      keywords: phone,
    });
    if (customerForm.phone.trim() !== phone) return;
    existingCustomer.value = (data.list || []).find((item) => recordText(item, "phone") === phone);
  } finally {
    customerLookupLoading.value = false;
  }
}

function customerSummary(customer: LifeResourceRecord) {
  const name = recordText(customer, "nickname") || recordText(customer, "phone") || `客户#${customer.id}`;
  const phone = recordText(customer, "phone") || "-";
  const source = formatValue(recordText(customer, "source"), "tag");
  const orderCount = recordNumber(customer, "orderCount");
  const paid = money(customer.totalPaid);
  return `${name} / ${phone} / ${source} / 历史订单 ${orderCount} 单 / 累计消费 ￥${paid}`;
}

function recordText(record: LifeResourceRecord | undefined, key: string) {
  const value = record?.[key];
  return value === undefined || value === null ? "" : String(value);
}

function recordNumber(record: LifeResourceRecord | undefined, key: string) {
  const value = Number(record?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function handleView(row: LifeResourceRecord) {
  if (moduleKey.value === "feedbacks") {
    void openFeedbackDetail(row);
    return;
  }
  ElMessageBox.alert(buildDetailText(row), "详情", {
    confirmButtonText: "知道了",
    customClass: "life-detail-message",
  });
}

function handleEdit(row: LifeResourceRecord) {
  editingRow.value = row;
  resetFormModel(row);
  seedPromotionTargetOption(row);
  void loadPromotionTargetOptions();
  formVisible.value = true;
}

function handleRowAction(action: string, row: LifeResourceRecord) {
  if (action === "addresses") {
    openOwnerAddresses(row);
  }
  if (action === "staff_notifications") {
    router.push({ path: "/staff/notifications", query: { staffId: String(row.id) } });
  }
  if (action === "staff_profile_changes") {
    router.push({ path: "/staff/profile-changes", query: { staffId: String(row.id) } });
  }
  if (action === "points") {
    void openUserPoints(row);
  }
  if (action === "grant_coupon") {
    openGrantCoupon(row);
  }
  if (action === "feedback_reply") {
    void openFeedbackDetail(row);
  }
  if (action === "feedback_processing") {
    void updateFeedbackStatus(row, "processing");
  }
  if (action === "feedback_close") {
    void updateFeedbackStatus(row, "closed");
  }
}

function isStaffRole(row: LifeResourceRecord) {
  return row.roleType === "staff";
}

async function handleToggleUserRole(row: LifeResourceRecord) {
  const nextRole = isStaffRole(row) ? "user" : "staff";
  const actionText = nextRole === "staff" ? "开通师傅角色" : "关闭师傅角色";
  await ElMessageBox.confirm(`确认${actionText}吗？`, "角色确认", {
    type: "warning",
    confirmButtonText: "确认",
    cancelButtonText: "取消",
  });
  await LifeAPI.updateUserRole(String(row.id), nextRole);
  ElMessage.success("角色已更新");
  await fetchPage();
}

function openGrantCard(row: LifeResourceRecord) {
  grantCardUser.value = row;
  grantCardForm.cardId = 0;
  grantCardForm.totalUnits = 0;
  grantCardForm.validityDays = 0;
  grantCardForm.source = "admin";
  grantCardForm.offlinePaymentAmount = 0;
  grantCardForm.paymentChannel = "offline";
  grantCardForm.paymentRemark = "";
  grantCardForm.remark = "";
  grantCardVisible.value = true;
}

async function submitGrantCard() {
  if (!grantCardUser.value) return;
  if (!grantCardForm.cardId) {
    ElMessage.warning("请填写会员卡模板ID");
    return;
  }
  grantCardSaving.value = true;
  try {
    await LifeAPI.grantMemberCard({
      userId: grantCardUser.value.id,
      cardId: grantCardForm.cardId,
      totalUnits: grantCardForm.totalUnits || undefined,
      validityDays: grantCardForm.validityDays || undefined,
      source: grantCardForm.source,
      offlinePaymentAmount: grantCardForm.offlinePaymentAmount || undefined,
      paymentChannel: grantCardForm.paymentChannel || undefined,
      paymentRemark: grantCardForm.paymentRemark.trim() || undefined,
      remark: grantCardForm.remark.trim() || undefined,
    });
    ElMessage.success("会员卡已发放");
    grantCardVisible.value = false;
  } finally {
    grantCardSaving.value = false;
  }
}

async function openUserPoints(row: LifeResourceRecord) {
  pointsUser.value = row;
  pointsSummary.value = undefined;
  pointAdjustForm.points = 0;
  pointAdjustForm.amount = 0;
  pointAdjustForm.remark = "";
  pointsDialogVisible.value = true;
  pointsLoading.value = true;
  try {
    pointsSummary.value = await LifeAPI.getUserPoints(String(row.id));
  } finally {
    pointsLoading.value = false;
  }
}

async function submitPointAdjust() {
  if (!pointsUser.value) return;
  if (!Number.isInteger(pointAdjustForm.points) || pointAdjustForm.points === 0) {
    ElMessage.warning("请填写非 0 整数积分");
    return;
  }
  pointsSaving.value = true;
  try {
    await LifeAPI.adjustUserPoints(String(pointsUser.value.id), {
      points: pointAdjustForm.points,
      amount: pointAdjustForm.amount || undefined,
      remark: pointAdjustForm.remark.trim() || undefined,
    });
    ElMessage.success("积分已调整");
    pointAdjustForm.points = 0;
    pointAdjustForm.amount = 0;
    pointAdjustForm.remark = "";
    pointsSummary.value = await LifeAPI.getUserPoints(String(pointsUser.value.id));
    await fetchPage();
  } finally {
    pointsSaving.value = false;
  }
}

function openGrantCoupon(row: LifeResourceRecord) {
  grantCouponRow.value = row;
  grantCouponForm.userId = "";
  grantCouponForm.phone = "";
  grantCouponForm.remark = "";
  grantCouponVisible.value = true;
}

async function submitGrantCoupon() {
  if (!grantCouponRow.value) return;
  const userId = grantCouponForm.userId.trim();
  const phone = grantCouponForm.phone.trim();
  if (!userId && !phone) {
    ElMessage.warning("请填写用户ID或手机号");
    return;
  }
  grantCouponSaving.value = true;
  try {
    await LifeAPI.grantCoupon(String(grantCouponRow.value.id), {
      userId: userId || undefined,
      phone: phone || undefined,
      remark: grantCouponForm.remark.trim() || undefined,
    });
    ElMessage.success("优惠券已发放");
    grantCouponVisible.value = false;
    await fetchPage();
  } finally {
    grantCouponSaving.value = false;
  }
}

async function openFeedbackDetail(row: LifeResourceRecord) {
  selectedFeedback.value = row;
  feedbackReply.value = String(row.reply || "");
  feedbackDialogVisible.value = true;
  try {
    const detail = await LifeAPI.getFeedback(String(row.id));
    selectedFeedback.value = detail;
    feedbackReply.value = String(detail.reply || "");
  } catch {
    // 列表数据已经足够展示，详情接口失败时保留当前行信息。
  }
}

async function updateFeedbackStatus(row: LifeResourceRecord, status: "processing" | "closed") {
  await ElMessageBox.confirm(`确认将该反馈标记为${status === "processing" ? "处理中" : "已关闭"}吗？`, "反馈处理", {
    type: "warning",
    confirmButtonText: "确认",
    cancelButtonText: "取消",
  });
  await LifeAPI.updateResourceStatus("feedbacks", String(row.id), status);
  ElMessage.success("反馈状态已更新");
  await fetchPage();
}

async function markSelectedFeedbackProcessing() {
  if (!selectedFeedback.value) return;
  feedbackSaving.value = true;
  try {
    await LifeAPI.updateResourceStatus("feedbacks", String(selectedFeedback.value.id), "processing");
    selectedFeedback.value = { ...selectedFeedback.value, status: "processing" };
    ElMessage.success("已标记处理中");
    await fetchPage();
  } finally {
    feedbackSaving.value = false;
  }
}

async function submitFeedbackReply() {
  if (!selectedFeedback.value) return;
  const reply = feedbackReply.value.trim();
  if (!reply) {
    ElMessage.warning("请填写处理回复");
    return;
  }
  feedbackSaving.value = true;
  try {
    const updated = await LifeAPI.replyFeedback(String(selectedFeedback.value.id), { reply, status: "closed" });
    selectedFeedback.value = updated;
    ElMessage.success("反馈已回复并关闭");
    feedbackDialogVisible.value = false;
    await fetchPage();
  } finally {
    feedbackSaving.value = false;
  }
}

async function openOwnerAddresses(row: LifeResourceRecord) {
  const ownerType = moduleKey.value === "staff" ? "staff" : "user";
  const title = String(row.nickname || row.name || row.phone || row.id);
  addressOwner.value = {
    ownerType,
    ownerId: String(row.id),
    title,
  };
  addressDialogVisible.value = true;
  await loadOwnerAddresses();
}

async function loadOwnerAddresses() {
  if (!addressOwner.value) return;
  addressLoading.value = true;
  try {
    const data = await LifeAPI.listOwnerAddresses(addressOwner.value.ownerType, addressOwner.value.ownerId);
    ownerAddresses.value = data.items || [];
  } finally {
    addressLoading.value = false;
  }
}

function handleCreateOwnerAddress() {
  if (!addressOwner.value) return;
  editingAddress.value = undefined;
  resetAddressForm();
  addressFormModel.addressType = addressOwner.value.ownerType === "staff" ? "home" : "service";
  addressFormVisible.value = true;
}

function handleEditOwnerAddress(row: AddressRecord) {
  editingAddress.value = row;
  resetAddressForm(row);
  addressFormVisible.value = true;
}

async function handleDeleteOwnerAddress(row: AddressRecord) {
  if (!addressOwner.value) return;
  await ElMessageBox.confirm("确认删除这个地址吗？", "删除确认", {
    type: "warning",
    confirmButtonText: "确认删除",
    cancelButtonText: "取消",
  });
  await LifeAPI.deleteOwnerAddress(addressOwner.value.ownerType, addressOwner.value.ownerId, row.id);
  ElMessage.success("已删除");
  await loadOwnerAddresses();
  await fetchPage();
}

async function submitOwnerAddress() {
  if (!addressOwner.value) return;
  const message = validateAddressForm();
  if (message) {
    ElMessage.warning(message);
    return;
  }
  addressSaving.value = true;
  try {
    const payload = buildAddressPayload();
    if (editingAddress.value) {
      await LifeAPI.updateOwnerAddress(addressOwner.value.ownerType, addressOwner.value.ownerId, editingAddress.value.id, payload);
      ElMessage.success("已更新地址");
    } else {
      await LifeAPI.createOwnerAddress(addressOwner.value.ownerType, addressOwner.value.ownerId, payload);
      ElMessage.success("已新增地址");
    }
    addressFormVisible.value = false;
    await loadOwnerAddresses();
    await fetchPage();
  } finally {
    addressSaving.value = false;
  }
}

async function submitCustomer() {
  const payload = buildCustomerPayload();
  if (!payload) return;

  customerSaving.value = true;
  try {
    await LifeAPI.createResource("users", payload);
    ElMessage.success("客户已创建或复用");
    customerVisible.value = false;
    await fetchPage();
  } finally {
    customerSaving.value = false;
  }
}

function canToggleStatus(row: LifeResourceRecord) {
  if (moduleKey.value === "userMemberCards") {
    return ["active", "disabled"].includes(String(row.status || ""));
  }
  return ["active", "disabled", "published", "draft", "pending", "rejected"].includes(
    String(row.status || "")
  );
}

function isEnabledStatus(status: unknown) {
  return status === "active" || status === "published";
}

function nextStatus(status: unknown) {
  if (status === "active") return "disabled";
  if (status === "published") return "draft";
  if (status === "draft") return "published";
  return "active";
}

async function handleToggleStatus(row: LifeResourceRecord) {
  await ElMessageBox.confirm("确认更新当前数据状态吗？", "操作确认", {
    type: "warning",
    confirmButtonText: "确认",
    cancelButtonText: "取消",
  });
  await LifeAPI.updateResourceStatus(moduleKey.value, String(row.id), nextStatus(row.status));
  ElMessage.success("状态已更新");
  fetchPage();
}

async function handleDelete(row: LifeResourceRecord) {
  const name = resourceDisplayName(row);
  await ElMessageBox.confirm(buildDeleteConfirmText(name), "删除确认", {
    type: "warning",
    confirmButtonText: "确认删除",
    cancelButtonText: "取消",
  });
  await LifeAPI.deleteResource(moduleKey.value, String(row.id));
  ElMessage.success("已删除");
  if (tableData.value.length === 1 && queryParams.pageNum > 1) {
    queryParams.pageNum -= 1;
  }
  fetchPage();
}

async function submitForm() {
  if (!pageConfig.value?.formItems) return;
  for (const item of pageConfig.value.formItems) {
    if (item.required && !formModel[item.prop]) {
      ElMessage.warning(`请填写${item.label}`);
      return;
    }
  }

  saving.value = true;
  try {
    if (editingRow.value) {
      await LifeAPI.updateResource(moduleKey.value, String(editingRow.value.id), { ...formModel });
      ElMessage.success("已更新");
    } else {
      await LifeAPI.createResource(moduleKey.value, { ...formModel });
      ElMessage.success("已新增");
    }
    formVisible.value = false;
    fetchPage();
  } finally {
    saving.value = false;
  }
}

function resetFormModel(row?: LifeResourceRecord) {
  Object.keys(formModel).forEach((key) => delete formModel[key]);
  for (const item of pageConfig.value?.formItems || []) {
    const value = row?.[item.prop];
    if (value !== undefined && value !== null) {
      formModel[item.prop] = normalizeFormValue(item.prop, value);
    } else if (item.type === "number") {
      formModel[item.prop] = 0;
    } else if (item.type === "images") {
      formModel[item.prop] = [];
    } else if (item.type === "select") {
      formModel[item.prop] = item.options?.[0]?.value || "";
    } else {
      formModel[item.prop] = "";
    }
  }
}

function seedPromotionTargetOption(row?: LifeResourceRecord) {
  if (moduleKey.value !== "promotionLinks") {
    promotionTargetOptions.value = [];
    return;
  }
  const targetId = row?.targetId;
  const targetName = row?.targetName;
  if (targetId && targetName) {
    promotionTargetOptions.value = [{
      value: String(targetId),
      label: String(targetName),
      code: typeof row.targetCode === "string" ? row.targetCode : undefined,
    }];
  } else {
    promotionTargetOptions.value = [];
  }
}

function normalizeFormValue(prop: string, value: unknown) {
  if (prop === "coverImage") {
    return editingRow.value?.coverImageOssUrl || value;
  }
  if (prop === "images") {
    return stringArrayValue(editingRow.value?.imageOssUrls || value);
  }
  if (prop === "imageUrl") {
    return editingRow.value?.imageOssUrl || value;
  }
  if (prop === "avatarUrl") {
    return editingRow.value?.avatarOssUrl || editingRow.value?.avatarUrlOssUrl || value;
  }
  if (prop === "isDefault") {
    if (value === true || value === "true" || value === "active") return "true";
    if (value === false || value === "false" || value === "disabled") return "false";
  }
  if (prop === "serviceRuleList" && Array.isArray(value)) {
    return JSON.stringify(value.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const record = item as Record<string, unknown>;
      return {
        serviceId: record.serviceId,
        consumeUnits: record.consumeUnits,
        status: record.status,
        remark: record.remark,
      };
    }), null, 2);
  }
  return value;
}

function resetAddressForm(row?: AddressRecord) {
  addressFormModel.addressType = String(row?.addressType || "service");
  addressFormModel.contactName = String(row?.contactName || "");
  addressFormModel.contactPhone = String(row?.contactPhone || "");
  addressFormModel.provinceName = String(row?.provinceName || "");
  addressFormModel.cityName = String(row?.cityName || "");
  addressFormModel.districtName = String(row?.districtName || "");
  addressFormModel.streetName = String(row?.streetName || "");
  addressFormModel.addressTitle = String(row?.addressTitle || "");
  addressFormModel.detailAddress = String(row?.detailAddress || "");
  addressFormModel.houseNumber = String(row?.houseNumber || "");
  addressFormModel.isDefault = row?.isDefault === true;
}

function resetCustomerForm() {
  if (customerPhoneLookupTimer) clearTimeout(customerPhoneLookupTimer);
  customerForm.nickname = "";
  customerForm.phone = "";
  customerForm.source = "offline";
  customerForm.cityCode = "";
  customerForm.adminRemark = "";
  customerForm.createAddress = true;
  customerForm.contactName = "";
  customerForm.contactPhone = "";
  customerForm.provinceName = "";
  customerForm.cityName = "";
  customerForm.districtName = "";
  customerForm.streetName = "";
  customerForm.addressTitle = "";
  customerForm.detailAddress = "";
  customerForm.houseNumber = "";
  customerAdvancedVisible.value = [];
  customerLookupLoading.value = false;
  existingCustomer.value = undefined;
}

function validateAddressForm() {
  if (!addressFormModel.contactName.trim()) return "请填写联系人";
  if (!/^1\d{10}$/.test(addressFormModel.contactPhone)) return "请填写正确的手机号";
  if (!addressFormModel.detailAddress.trim()) return "请填写详细地址";
  return "";
}

function buildAddressPayload() {
  return {
    addressType: addressFormModel.addressType,
    contactName: addressFormModel.contactName.trim(),
    contactPhone: addressFormModel.contactPhone.trim(),
    provinceName: addressFormModel.provinceName.trim() || undefined,
    cityName: addressFormModel.cityName.trim() || undefined,
    districtName: addressFormModel.districtName.trim() || undefined,
    streetName: addressFormModel.streetName.trim() || undefined,
    addressTitle: addressFormModel.addressTitle.trim() || undefined,
    detailAddress: addressFormModel.detailAddress.trim(),
    houseNumber: addressFormModel.houseNumber.trim() || undefined,
    isDefault: addressFormModel.isDefault,
  };
}

function buildCustomerPayload() {
  const phone = customerForm.phone.trim();
  const nickname = customerForm.nickname.trim();
  const detailAddress = customerForm.detailAddress.trim();
  const houseNumber = customerForm.houseNumber.trim();
  const shouldCreateAddress = customerForm.createAddress && Boolean(detailAddress);

  if (!phone) {
    ElMessage.warning("请填写客户手机号");
    return null;
  }
  if (customerForm.createAddress && !detailAddress && houseNumber) {
    ElMessage.warning("已填写门牌号时，请同时填写服务地址");
    return null;
  }

  const payload: Record<string, unknown> = {
    nickname: nickname || phone,
    phone,
    source: customerForm.source,
    cityCode: customerForm.cityCode.trim() || undefined,
    adminRemark: customerForm.adminRemark.trim() || undefined,
    status: "active",
  };

  if (shouldCreateAddress) {
    const contactName = customerForm.contactName.trim() || nickname || phone;
    const contactPhone = customerForm.contactPhone.trim() || phone;
    payload.address = {
      addressType: "service",
      contactName,
      contactPhone,
      provinceName: customerForm.provinceName.trim() || undefined,
      cityName: customerForm.cityName.trim() || undefined,
      districtName: customerForm.districtName.trim() || undefined,
      streetName: customerForm.streetName.trim() || undefined,
      addressTitle: customerForm.addressTitle.trim() || detailAddress.slice(0, 20),
      detailAddress,
      houseNumber: houseNumber || undefined,
      isDefault: true,
    };
  }

  return payload;
}

function stringFormValue(prop: string) {
  const value = formModel[prop];
  return value === undefined || value === null ? "" : String(value);
}

function arrayFormValue(prop: string) {
  return stringArrayValue(formModel[prop]);
}

function numberFormValue(prop: string) {
  const value = Number(formModel[prop]);
  return Number.isFinite(value) ? value : 0;
}

function dateFormValue(prop: string) {
  const value = formModel[prop];
  return typeof value === "string" || typeof value === "number" || value instanceof Date ? value : "";
}

function setFormValue(prop: string, value: string | string[] | number | boolean | Date | null | undefined) {
  formModel[prop] = value ?? "";
  if (moduleKey.value === "promotionLinks" && prop === "targetType") {
    formModel.targetId = "";
    formModel.targetCode = "";
    promotionTargetOptions.value = [];
    void loadPromotionTargetOptions();
  }
}

async function loadPromotionTargetOptions(keyword = "") {
  if (moduleKey.value !== "promotionLinks" || promotionTargetDisabled.value) {
    promotionTargetOptions.value = [];
    return;
  }
  promotionTargetLoading.value = true;
  try {
    const selectedValue = String(formModel.targetId || "");
    const selectedOption = selectedValue
      ? promotionTargetOptions.value.find((item) => item.value === selectedValue)
      : undefined;
    const options = await LifeAPI.getPromotionTargetOptions(promotionTargetType.value, keyword);
    if (selectedOption && !options.some((item) => item.value === selectedOption.value)) {
      promotionTargetOptions.value = [selectedOption, ...options];
    } else {
      promotionTargetOptions.value = options;
    }
  } finally {
    promotionTargetLoading.value = false;
  }
}

function handlePromotionTargetVisible(visible: boolean) {
  if (visible && !promotionTargetOptions.value.length) {
    void loadPromotionTargetOptions();
  }
}

function setPromotionTargetValue(value: string) {
  formModel.targetId = value || "";
  const selected = promotionTargetOptions.value.find((item) => item.value === value);
  if (promotionTargetType.value === "service") {
    formModel.targetCode = selected?.code || "";
  } else {
    formModel.targetCode = "";
  }
}

function imageBizType(prop: string) {
  if (prop === "coverImage") return "service_cover";
  if (prop === "images") return "service_image";
  if (prop === "imageUrl") return "home_banner";
  if (prop === "avatarUrl") return "staff_avatar";
  return "admin_image";
}

function imageDisplayUrl(prop: string) {
  if (!editingRow.value) return "";
  if (prop === "coverImage") {
    return String(editingRow.value.coverImageDisplayUrl || editingRow.value.coverImage || "");
  }
  if (prop === "imageUrl") {
    return String(editingRow.value.imageDisplayUrl || editingRow.value.imageUrl || "");
  }
  if (prop === "avatarUrl") {
    return String(editingRow.value.avatarDisplayUrl || editingRow.value.avatarUrlDisplayUrl || editingRow.value.avatarUrl || "");
  }
  return "";
}

function imageDisplayUrls(prop: string) {
  if (!editingRow.value) return [];
  if (prop === "images") {
    return stringArrayValue(editingRow.value.imageDisplayUrls || editingRow.value.images);
  }
  return [];
}

function tableImageUrl(row: LifeResourceRecord, prop: string) {
  if (prop === "imageUrl") {
    return String(row.imageDisplayUrl || row.imageUrl || "");
  }
  if (prop === "coverImage") {
    return String(row.coverImageDisplayUrl || row.coverImage || "");
  }
  if (prop === "avatarUrl") {
    return String(row.avatarDisplayUrl || row.avatarUrlDisplayUrl || row.avatarUrl || "");
  }
  return String(row[`${prop}DisplayUrl`] || row[prop] || "");
}

function stringArrayValue(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : [];
}

function resolveTagType(value: unknown) {
  const matched = statusOptions.value.find((item) => item.value === value);
  if (matched?.tagType) return matched.tagType;
  if (value === true) return "success";
  if (value === false) return "info";
  if (value === "active" || value === "published" || value === "online" || value === "staff" || value === "available" || value === "earn") return "success";
  if (value === "service" || value === "member_card" || value === "category" || value === "home" || value === "channels" || value === "channel") return "primary";
  if (value === "processing" || value === "released" || value === "admin_adjust") return "primary";
  if (value === "pending" || value === "busy" || value === "open" || value === "locked" || value === "refund_deduct") return "warning";
  if (value === "rejected" || value === "bug" || value === "invalid") return "danger";
  return "info";
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function formatValue(value: unknown, type?: string) {
  if (value === undefined || value === null || value === "") return "-";
  if (type === "money") return `￥${Number(value).toLocaleString("zh-CN")}`;
  if (type === "rate") return `${value} 分`;
  if (type === "tag") {
    if (value === true) return "是";
    if (value === false) return "否";
    const matched = statusOptions.value.find((item) => item.value === value);
    if (matched) return matched.label;
    const fallback: Record<string, string> = {
      active: "正常",
      disabled: "停用",
      user: "普通用户",
      staff: "师傅用户",
      online: "在线",
      busy: "忙碌",
      offline: "离线",
      published: "已发布",
      draft: "草稿",
      pending: "待审核",
      rejected: "已驳回",
      service: "服务商品",
      member_card: "会员卡商品",
      category: "服务分类",
      home: "首页",
      channels: "视频号",
      channel: "推广渠道",
      miniapp: "小程序",
      admin: "后台",
      phone: "电话",
      wechat_private: "微信私域",
      promotion: "推广",
      available: "可用",
      locked: "锁定",
      used: "已使用",
      expired: "已过期",
      released: "已释放",
      invalid: "已作废",
      earn: "消费发放",
      refund_deduct: "退款扣回",
      admin_adjust: "后台调整",
      pending_payment: "待支付",
      pending_dispatch: "待派单",
      dispatched: "已派单",
      accepted: "已接单",
      on_the_way: "上门中",
      in_service: "服务中",
      pending_confirm: "待确认",
      completed: "已完成",
      cancelled: "已取消",
      refunded: "已退款",
      open: "待处理",
      processing: "处理中",
      closed: "已关闭",
      bug: "功能异常",
      order: "订单问题",
      payment_refund: "支付退款",
      service_experience: "服务体验",
      suggestion: "产品建议",
      other: "其他",
    };
    return fallback[String(value)] || String(value);
  }
  return String(value);
}

function copyTextValue(value: unknown) {
  return value === undefined || value === null ? "" : String(value);
}

function buildDetailText(row: LifeResourceRecord) {
  return Object.entries(row)
    .map(([key, value]) => `${key}: ${String(value ?? "-")}`)
    .join("\n");
}

function resourceDisplayName(row: LifeResourceRecord) {
  return String(row.nickname || row.name || row.orderNo || row.title || row.id || "当前数据");
}

function buildDeleteConfirmText(name: string) {
  if (moduleKey.value === "users") {
    return `确认删除用户「${name}」吗？删除后该用户不会继续出现在用户管理列表，历史订单不会被清除。`;
  }
  if (moduleKey.value === "serviceCategories") {
    return `确认删除服务分类「${name}」吗？如果分类下存在服务，后端会拒绝删除。`;
  }
  if (moduleKey.value === "services") {
    return `确认删除服务「${name}」吗？删除后小程序将不再展示该服务，历史订单不会被清除。`;
  }
  if (moduleKey.value === "staff") {
    return `确认删除师傅「${name}」吗？如果存在进行中订单，后端会拒绝删除。`;
  }
  return `确认删除「${name}」吗？`;
}
</script>

<style scoped lang="scss">
.life-page {
  display: flex;
  flex-direction: column;
}

.life-header {
  margin-bottom: var(--page-gap);

  :deep(.el-card__body) {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  p {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
}

.address-dialog-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 12px;
}

.life-table-image {
  width: 120px;
  height: 48px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}

.image-form-control {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.promotion-target-control {
  width: 100%;
}

.form-tip {
  margin-top: 6px;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-secondary);
}

.quick-customer-advanced {
  margin-top: 4px;
  border-top: 0;
  border-bottom: 0;
}

.existing-customer-tip {
  margin: -4px 0 12px;
}

.life-copy-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.life-copy-cell__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feedback-images {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 14px 0;
}

.feedback-image {
  width: 104px;
  height: 104px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}

.feedback-detail-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
}

.feedback-reply-form {
  margin-top: 14px;
}
</style>
