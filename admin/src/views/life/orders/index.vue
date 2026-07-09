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
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!isFixedOrderType" label="订单类型">
          <el-select v-model="queryParams.orderType" style="width: 170px">
            <el-option label="预约订单" value="bookings" />
            <el-option label="服务预约" value="service_booking" />
            <el-option label="咨询预约" value="consultation" />
            <el-option label="会员卡购买" value="member_card_purchase" />
            <el-option label="全部订单" value="all" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="queryParams.source" clearable style="width: 140px">
            <el-option label="全部" value="" />
            <el-option label="小程序" value="miniapp" />
            <el-option label="后台录入" value="admin" />
            <el-option label="电话订单" value="phone" />
            <el-option label="线下订单" value="offline" />
            <el-option label="微信私域" value="wechat_private" />
            <el-option label="推广渠道" value="channel" />
            <el-option label="推广订单" value="promotion" />
            <el-option label="视频号" value="channels" />
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
          <el-button v-if="isMemberCardPurchasePage" type="primary" icon="plus" @click="handleCreateMemberCardPurchase">
            录入会员卡购买
          </el-button>
          <el-button v-else type="primary" icon="plus" @click="handleCreateOrder">
            录入订单
          </el-button>
          <el-button
            v-if="canDeleteOrders"
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
          <el-tag v-if="!isMemberCardPurchasePage" type="warning" effect="plain">
            待派单优先处理
          </el-tag>
        </div>
        <div class="page-toolbar__right">
          <el-button icon="refresh" @click="fetchOrders">刷新</el-button>
        </div>
      </div>

      <el-table v-loading="loading || batchDeleting" :data="orders" border @selection-change="handleSelectionChange">
        <el-table-column v-if="canDeleteOrders" type="selection" width="55" align="center" fixed="left" />
        <el-table-column label="订单类型" width="120">
          <template #default="{ row }">
            <el-tag :type="orderTypeMeta(row.orderType).type">{{ orderTypeMeta(row.orderType).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="订单号" prop="orderNo" min-width="150" fixed="left" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusMeta(row.status).type">{{ statusMeta(row.status).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="服务/商品" prop="serviceName" min-width="160" />
        <el-table-column label="用户" min-width="150">
          <template #default="{ row }">
            <div>{{ row.userName }}</div>
            <el-text type="info" size="small">{{ row.userPhone }}</el-text>
          </template>
        </el-table-column>
        <el-table-column label="师傅" prop="staffName" width="110">
          <template #default="{ row }">
            {{ row.orderType === "member_card_purchase" ? "-" : row.staffName || "待派单" }}
          </template>
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
          <template #default="{ row }">￥{{ Number(row.paidAmount || 0).toLocaleString("zh-CN") }}</template>
        </el-table-column>
        <el-table-column label="来源" prop="source" width="90" />
        <el-table-column fixed="right" label="操作" width="220">
          <template #default="{ row }">
            <el-button type="primary" link size="small" icon="view" @click="openDetail(row.id)">
              详情
            </el-button>
            <el-button v-if="canUpdateOrders" type="primary" link size="small" icon="edit" @click="openEdit(row)">
              编辑
            </el-button>
            <el-button
              v-if="canAssignOrders && canAssign(row)"
              type="success"
              link
              size="small"
              icon="position"
              @click="openAssign(row)"
            >
              派单
            </el-button>
            <el-button v-if="canDeleteOrders" type="danger" link size="small" icon="delete" @click="deleteOrder(row)">
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
        <el-form-item label="审核备注">
          <el-input v-model="assignForm.remark" type="textarea" :rows="3" placeholder="记录派单依据，便于后续审计" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignVisible = false">取消</el-button>
        <el-button type="primary" :loading="assignSubmitting" :disabled="!assignForm.staffId" @click="submitAssign">
          确认派单
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="createVisible" title="录入外来订单" width="920px">
      <el-alert
        title="按客户、服务、地址、收款方式顺序录入；页面会自动写入用户ID、服务ID、地址ID和会员卡ID，避免手工录错。"
        type="info"
        show-icon
        :closable="false"
        class="mb-4"
      />
      <el-form label-width="110px" class="order-edit-form">
        <div class="order-entry-section">
          <div class="order-entry-section__title">1. 选择客户</div>
          <el-form-item label="已有客户">
            <el-select
              v-model="createForm.userId"
              filterable
              remote
              clearable
              :loading="customerLoading"
              :remote-method="loadCustomerOptions"
              placeholder="输入手机号或姓名搜索客户"
              style="width: 100%"
              @visible-change="handleCustomerSelectVisible"
              @change="handleCustomerChange"
            >
              <el-option
                v-for="item in customerOptions"
                :key="item.id"
                :label="customerOptionLabel(item)"
                :value="Number(item.id)"
              />
            </el-select>
            <div class="form-tip">找不到客户时，可在下方快速填写手机号和地址，提交时自动创建或复用客户。</div>
          </el-form-item>
          <div v-if="selectedCustomer" class="selected-summary">
            <strong>{{ textField(selectedCustomer, "nickname") || textField(selectedCustomer, "phone") || selectedCustomer.id }}</strong>
            <span>{{ textField(selectedCustomer, "phone") || "-" }}</span>
            <el-tag size="small" type="success">{{ sourceText(textField(selectedCustomer, "source")) }}</el-tag>
            <span>历史订单 {{ numberField(selectedCustomer, "orderCount") }} 单</span>
          </div>
          <el-row v-else :gutter="12">
            <el-col :span="10">
              <el-form-item label="客户姓名">
                <el-input v-model="createForm.customerName" maxlength="64" placeholder="不填则使用手机号" />
              </el-form-item>
            </el-col>
            <el-col :span="14">
              <el-form-item label="客户手机号" required>
                <el-input v-model="createForm.customerPhone" maxlength="20" placeholder="新客户或未搜索到客户时填写" />
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <div class="order-entry-section">
          <div class="order-entry-section__title">2. 选择服务</div>
          <el-form-item label="服务项目" required>
            <el-select
              v-model="createForm.serviceId"
              filterable
              remote
              clearable
              :loading="serviceLoading"
              :remote-method="loadServiceOptions"
              placeholder="输入服务名称或分类搜索"
              style="width: 100%"
              @visible-change="handleServiceSelectVisible"
              @change="handleServiceChange"
            >
              <el-option
                v-for="item in serviceOptions"
                :key="item.id"
                :label="serviceOptionLabel(item)"
                :value="Number(item.id)"
              />
            </el-select>
          </el-form-item>
          <div v-if="selectedService" class="selected-summary">
            <strong>{{ textField(selectedService, "name") || selectedService.id }}</strong>
            <span>{{ textField(selectedService, "category") || "-" }}</span>
            <span>￥{{ money(numberField(selectedService, "basePrice")) }}</span>
            <span>{{ textField(selectedService, "duration") || serviceDurationText(selectedService) }}</span>
            <el-tag size="small" :type="textField(selectedService, 'cardType') === 'none' ? 'info' : 'warning'">
              {{ cardTypeText(textField(selectedService, "cardType")) }}
            </el-tag>
          </div>
        </div>

        <div class="order-entry-section">
          <div class="order-entry-section__title">3. 地址和预约时间</div>
          <el-form-item v-if="selectedCustomer" label="服务地址" required>
            <div class="address-choice-list" v-loading="addressLoading">
              <el-radio-group v-model="createForm.addressId" class="address-choice-group">
                <el-radio-button
                  v-for="item in addressOptions"
                  :key="item.id"
                  :label="Number(item.id)"
                >
                  {{ addressOptionLabel(item) }}
                </el-radio-button>
              </el-radio-group>
              <el-empty v-if="!addressLoading && addressOptions.length === 0" description="该客户暂无地址，请在下方快速填写" :image-size="60" />
            </div>
          </el-form-item>
          <el-row :gutter="12">
            <el-col :span="10">
              <el-form-item label="联系人">
                <el-input v-model="createForm.contactName" maxlength="64" :placeholder="defaultContactName" />
              </el-form-item>
            </el-col>
            <el-col :span="14">
              <el-form-item label="联系电话">
                <el-input v-model="createForm.contactPhone" maxlength="20" :placeholder="defaultContactPhone" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="新增地址">
            <el-input
              v-model="createForm.detailAddress"
              type="textarea"
              :rows="2"
              maxlength="256"
              show-word-limit
              placeholder="客户无地址、或本次要使用新地址时填写；已有地址被选中时可留空"
            />
          </el-form-item>
          <el-row :gutter="12">
            <el-col :span="8">
              <el-form-item label="门牌号">
                <el-input v-model="createForm.houseNumber" maxlength="64" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="小区/地点">
                <el-input v-model="createForm.addressTitle" maxlength="128" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="来源">
                <el-select v-model="createForm.source" style="width: 100%">
                  <el-option label="线下订单" value="offline" />
                  <el-option label="电话订单" value="phone" />
                  <el-option label="后台录入" value="admin" />
                  <el-option label="微信私域" value="wechat_private" />
                  <el-option label="推广渠道" value="channel" />
                  <el-option label="推广订单" value="promotion" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="预约开始" required>
                <el-date-picker v-model="createForm.appointmentStartTime" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="预约结束" required>
                <el-date-picker v-model="createForm.appointmentEndTime" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <div class="order-entry-section">
          <div class="order-entry-section__title">4. 收款方式</div>
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="支付方式">
                <el-segmented
                  v-model="createForm.paymentMode"
                  :options="paymentModeOptions"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="应收金额">
                <el-input-number
                  v-model="createForm.payableAmount"
                  :min="0"
                  :precision="2"
                  :disabled="createForm.paymentMode === 'member_card'"
                  style="width: 100%"
                />
                <div class="form-tip">默认使用服务价格；如需改价，请在后台备注写明原因。</div>
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item v-if="createForm.paymentMode === 'member_card'" label="会员卡" required>
            <el-select
              v-model="createForm.memberCardId"
              clearable
              filterable
              :loading="memberCardLoading"
              placeholder="请选择当前客户可用会员卡"
              style="width: 100%"
            >
              <el-option
                v-for="item in memberCardOptions"
                :key="item.id"
                :label="memberCardOptionLabel(item)"
                :value="Number(item.id)"
              />
            </el-select>
            <div class="form-tip">只加载当前客户名下的可用会员卡；最终是否适用当前服务由后端再次校验。</div>
          </el-form-item>
          <el-form-item v-if="createForm.paymentMode === 'offline_paid'" label="收款备注">
            <el-input v-model="createForm.offlinePaymentRemark" maxlength="256" placeholder="默认：线下录入已收款" />
          </el-form-item>
          <el-form-item label="用户备注">
            <el-input v-model="createForm.remark" type="textarea" :rows="2" maxlength="512" show-word-limit />
          </el-form-item>
          <el-form-item label="后台备注">
            <el-input v-model="createForm.adminRemark" type="textarea" :rows="2" maxlength="512" show-word-limit />
          </el-form-item>
        </div>

        <div class="order-entry-summary">
          <div class="order-entry-summary__title">提交摘要</div>
          <div class="order-entry-summary__grid">
            <span>客户：{{ summaryCustomerText }}</span>
            <span>服务：{{ summaryServiceText }}</span>
            <span>地址：{{ summaryAddressText }}</span>
            <span>预约：{{ createForm.appointmentStartTime || "-" }} 至 {{ createForm.appointmentEndTime || "-" }}</span>
            <span>支付：{{ paymentModeText(createForm.paymentMode) }}</span>
            <span>创建后状态：{{ expectedCreateStatus }}</span>
          </div>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreateOrder">创建订单</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="memberCardPurchaseVisible" title="录入线下会员卡购买" width="760px">
      <el-alert
        title="用于线下售卡后补录会员卡购买订单；选择已存在客户和已发布会员卡，系统自动生成购买订单、线下支付流水和发卡流水。"
        type="info"
        show-icon
        :closable="false"
        class="mb-4"
      />
      <el-form label-width="110px" class="order-edit-form">
        <div class="order-entry-section">
          <div class="order-entry-section__title">1. 选择客户</div>
          <el-form-item label="已有客户" required>
            <el-select
              v-model="memberCardPurchaseForm.userId"
              filterable
              remote
              clearable
              :loading="purchaseCustomerLoading"
              :remote-method="loadPurchaseCustomerOptions"
              placeholder="输入手机号或姓名搜索客户"
              style="width: 100%"
              @visible-change="handlePurchaseCustomerVisible"
            >
              <el-option
                v-for="item in purchaseCustomerOptions"
                :key="item.id"
                :label="customerOptionLabel(item)"
                :value="Number(item.id)"
              />
            </el-select>
            <div class="form-tip">会员卡购买订单只绑定已有客户；新客户请先在线下客户入口快速录入手机号和昵称。</div>
          </el-form-item>
          <div v-if="selectedPurchaseCustomer" class="selected-summary">
            <strong>{{ textField(selectedPurchaseCustomer, "nickname") || textField(selectedPurchaseCustomer, "phone") || selectedPurchaseCustomer.id }}</strong>
            <span>{{ textField(selectedPurchaseCustomer, "phone") || "-" }}</span>
            <el-tag size="small" type="success">{{ sourceText(textField(selectedPurchaseCustomer, "source")) }}</el-tag>
            <span>历史订单 {{ numberField(selectedPurchaseCustomer, "orderCount") }} 单</span>
          </div>
        </div>

        <div class="order-entry-section">
          <div class="order-entry-section__title">2. 选择会员卡</div>
          <el-form-item label="会员卡模板" required>
            <el-select
              v-model="memberCardPurchaseForm.cardId"
              filterable
              remote
              clearable
              :loading="purchaseCardLoading"
              :remote-method="loadPurchaseCardOptions"
              placeholder="输入会员卡名称搜索"
              style="width: 100%"
              @visible-change="handlePurchaseCardVisible"
              @change="handlePurchaseCardChange"
            >
              <el-option
                v-for="item in purchaseCardOptions"
                :key="item.id"
                :label="memberCardTemplateOptionLabel(item)"
                :value="Number(item.id)"
              />
            </el-select>
          </el-form-item>
          <div v-if="selectedPurchaseCard" class="selected-summary">
            <strong>{{ textField(selectedPurchaseCard, "name") || `会员卡#${selectedPurchaseCard.id}` }}</strong>
            <span>{{ cardTypeText(textField(selectedPurchaseCard, "cardType")) }}</span>
            <span>￥{{ money(numberField(selectedPurchaseCard, "price")) }}</span>
            <span>{{ numberField(selectedPurchaseCard, "totalUnits") }}{{ textField(selectedPurchaseCard, "unitName") || "额度" }}</span>
            <span>有效 {{ numberField(selectedPurchaseCard, "validityDays") }} 天</span>
          </div>
        </div>

        <div class="order-entry-section">
          <div class="order-entry-section__title">3. 收款和备注</div>
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="收款状态">
                <el-segmented
                  v-model="memberCardPurchaseForm.paymentMode"
                  :options="memberCardPurchasePaymentOptions"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="应收金额" required>
                <el-input-number
                  v-model="memberCardPurchaseForm.payableAmount"
                  :min="0"
                  :precision="2"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="来源">
                <el-select v-model="memberCardPurchaseForm.source" style="width: 100%">
                  <el-option label="线下购买" value="offline" />
                  <el-option label="电话购买" value="phone" />
                  <el-option label="后台录入" value="admin" />
                  <el-option label="微信私域" value="wechat_private" />
                  <el-option label="推广渠道" value="channel" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item v-if="memberCardPurchaseForm.paymentMode === 'offline_paid'" label="收款时间">
                <el-date-picker
                  v-model="memberCardPurchaseForm.offlinePaidAt"
                  type="datetime"
                  value-format="YYYY-MM-DD HH:mm:ss"
                  clearable
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item v-if="memberCardPurchaseForm.paymentMode === 'offline_paid'" label="收款备注">
            <el-input v-model="memberCardPurchaseForm.paymentRemark" maxlength="256" placeholder="默认：线下会员卡购买已收款" />
          </el-form-item>
          <el-form-item label="用户备注">
            <el-input v-model="memberCardPurchaseForm.remark" type="textarea" :rows="2" maxlength="512" show-word-limit />
          </el-form-item>
          <el-form-item label="后台备注">
            <el-input v-model="memberCardPurchaseForm.adminRemark" type="textarea" :rows="2" maxlength="512" show-word-limit />
            <div class="form-tip">如应收金额与会员卡售价不一致，必须填写改价原因。</div>
          </el-form-item>
        </div>

        <div class="order-entry-summary">
          <div class="order-entry-summary__title">提交摘要</div>
          <div class="order-entry-summary__grid">
            <span>客户：{{ selectedPurchaseCustomer ? customerOptionLabel(selectedPurchaseCustomer) : "-" }}</span>
            <span>会员卡：{{ selectedPurchaseCard ? memberCardTemplateOptionLabel(selectedPurchaseCard) : "-" }}</span>
            <span>支付：{{ purchasePaymentModeText(memberCardPurchaseForm.paymentMode) }}</span>
            <span>创建后状态：{{ memberCardPurchaseStatusText }}</span>
          </div>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="memberCardPurchaseVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="memberCardPurchaseSubmitting"
          :disabled="!memberCardPurchaseForm.userId || !memberCardPurchaseForm.cardId"
          @click="submitMemberCardPurchase"
        >
          创建会员卡购买订单
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑订单" width="720px">
      <el-form label-width="100px" class="order-edit-form">
        <el-form-item label="订单号">
          <el-text>{{ currentOrder?.orderNo }}</el-text>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="预约开始">
              <el-date-picker v-model="editForm.appointmentStartTime" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="预约结束">
              <el-date-picker v-model="editForm.appointmentEndTime" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="下单时间">
          <el-date-picker v-model="editForm.createdAt" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
        </el-form-item>
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
import type {
  AddressRecord,
  AdminCreateMemberCardPurchasePayload,
  AdminCreateOrderPayload,
  LifeResourceRecord,
  OrderListItem,
  StaffOption,
  UpdateOrderPayload,
} from "@/api/life";
import { hasPerm } from "@/utils/auth";

const route = useRoute();
const router = useRouter();

const initialStatus = computed(() => String((route.meta.params as Record<string, unknown> | undefined)?.status || ""));
const initialOrderType = computed(() =>
  String((route.meta.params as Record<string, unknown> | undefined)?.orderType || route.query.orderType || "bookings")
);
const isFixedOrderType = computed(() => initialOrderType.value !== "all");
const isMemberCardPurchasePage = computed(() => initialOrderType.value === "member_card_purchase");
const canUpdateOrders = computed(() => hasPerm("order:update"));
const canAssignOrders = computed(() => hasPerm("order:assign"));
const canDeleteOrders = computed(() => hasPerm("order:delete"));

const loading = ref(false);
const batchDeleting = ref(false);
const total = ref(0);
const orders = ref<OrderListItem[]>([]);
const selectedOrders = ref<OrderListItem[]>([]);
const staffOptions = ref<StaffOption[]>([]);
const assignVisible = ref(false);
const editVisible = ref(false);
const createVisible = ref(false);
const creating = ref(false);
const memberCardPurchaseVisible = ref(false);
const memberCardPurchaseSubmitting = ref(false);
const assignSubmitting = ref(false);
const dispatchWarnings = ref<string[]>([]);
const currentOrder = ref<OrderListItem>();
const queryParams = reactive({
  pageNum: 1,
  pageSize: 10,
  keywords: "",
  status: "",
  orderType: "bookings",
  source: "",
});
const assignForm = reactive({
  staffId: "",
  remark: "",
});
const createForm = reactive({
  userId: undefined as number | undefined,
  customerName: "",
  customerPhone: "",
  serviceId: undefined as number | undefined,
  addressId: undefined as number | undefined,
  appointmentStartTime: "",
  appointmentEndTime: "",
  source: "admin",
  contactName: "",
  contactPhone: "",
  provinceName: "",
  cityName: "",
  districtName: "",
  streetName: "",
  addressTitle: "",
  detailAddress: "",
  houseNumber: "",
  payableAmount: 0,
  paymentMode: "offline_paid",
  memberCardId: undefined as number | undefined,
  offlinePaymentRemark: "",
  remark: "",
  adminRemark: "",
});
const customerOptions = ref<LifeResourceRecord[]>([]);
const serviceOptions = ref<LifeResourceRecord[]>([]);
const addressOptions = ref<AddressRecord[]>([]);
const memberCardOptions = ref<LifeResourceRecord[]>([]);
const purchaseCustomerOptions = ref<LifeResourceRecord[]>([]);
const purchaseCardOptions = ref<LifeResourceRecord[]>([]);
const customerLoading = ref(false);
const serviceLoading = ref(false);
const addressLoading = ref(false);
const memberCardLoading = ref(false);
const purchaseCustomerLoading = ref(false);
const purchaseCardLoading = ref(false);
const memberCardPurchaseForm = reactive({
  userId: undefined as number | undefined,
  cardId: undefined as number | undefined,
  source: "offline",
  paymentMode: "offline_paid" as "offline_paid" | "unpaid",
  payableAmount: 0,
  offlinePaidAt: "",
  paymentRemark: "",
  remark: "",
  adminRemark: "",
});
const editForm = reactive({
  appointmentStartTime: "",
  appointmentEndTime: "",
  createdAt: "",
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
const paymentModeOptions = [
  { label: "线下已收款", value: "offline_paid" },
  { label: "待线下收款", value: "unpaid" },
  { label: "会员卡抵扣", value: "member_card" },
];
const memberCardPurchasePaymentOptions = [
  { label: "线下已收款", value: "offline_paid" },
  { label: "待线下收款", value: "unpaid" },
];
const selectedCustomer = computed(() => {
  if (!createForm.userId) return undefined;
  return customerOptions.value.find((item) => Number(item.id) === Number(createForm.userId));
});
const selectedPurchaseCustomer = computed(() => {
  if (!memberCardPurchaseForm.userId) return undefined;
  return purchaseCustomerOptions.value.find((item) => Number(item.id) === Number(memberCardPurchaseForm.userId));
});
const selectedPurchaseCard = computed(() => {
  if (!memberCardPurchaseForm.cardId) return undefined;
  return purchaseCardOptions.value.find((item) => Number(item.id) === Number(memberCardPurchaseForm.cardId));
});
const selectedService = computed(() => {
  if (!createForm.serviceId) return undefined;
  return serviceOptions.value.find((item) => Number(item.id) === Number(createForm.serviceId));
});
const selectedAddress = computed(() => {
  if (!createForm.addressId) return undefined;
  return addressOptions.value.find((item) => Number(item.id) === Number(createForm.addressId));
});
const defaultContactName = computed(() =>
  textField(selectedCustomer.value, "nickname")
    || createForm.customerName.trim()
    || textField(selectedCustomer.value, "phone")
    || createForm.customerPhone.trim()
);
const defaultContactPhone = computed(() => textField(selectedCustomer.value, "phone") || createForm.customerPhone.trim());
const expectedCreateStatus = computed(() => createForm.paymentMode === "unpaid" ? "待支付" : "待派单");
const memberCardPurchaseStatusText = computed(() =>
  memberCardPurchaseForm.paymentMode === "offline_paid" ? "已完成并发卡" : "待支付"
);
const summaryCustomerText = computed(() => {
  if (selectedCustomer.value) {
    return `${textField(selectedCustomer.value, "nickname") || "未命名客户"} / ${textField(selectedCustomer.value, "phone") || "-"}`;
  }
  const phone = createForm.customerPhone.trim();
  return phone ? `${createForm.customerName.trim() || phone} / ${phone}` : "-";
});
const summaryServiceText = computed(() => {
  if (!selectedService.value) return "-";
  return `${textField(selectedService.value, "name") || `服务#${selectedService.value.id}`} / ￥${money(numberField(selectedService.value, "basePrice"))}`;
});
const summaryAddressText = computed(() => {
  if (createForm.detailAddress.trim()) {
    return [createForm.addressTitle.trim(), createForm.detailAddress.trim(), createForm.houseNumber.trim()].filter(Boolean).join(" ");
  }
  return selectedAddress.value ? addressOptionLabel(selectedAddress.value) : "-";
});

watch(
  () => createForm.userId,
  (userId) => {
    createForm.addressId = undefined;
    createForm.memberCardId = undefined;
    addressOptions.value = [];
    memberCardOptions.value = [];
    if (!userId) {
      createForm.customerName = "";
      createForm.customerPhone = "";
      return;
    }
    const customer = selectedCustomer.value;
    if (customer) {
      createForm.customerName = textField(customer, "nickname");
      createForm.customerPhone = textField(customer, "phone");
      if (!createForm.contactName.trim()) createForm.contactName = defaultContactName.value;
      if (!createForm.contactPhone.trim()) createForm.contactPhone = defaultContactPhone.value;
    }
    loadAddressOptions(userId);
    loadMemberCardOptions();
  }
);

watch(
  () => createForm.serviceId,
  () => {
    createForm.memberCardId = undefined;
    applyServiceDefaults();
    loadMemberCardOptions();
  }
);

watch(
  () => createForm.appointmentStartTime,
  () => fillDefaultAppointmentEnd()
);

watch(
  () => createForm.paymentMode,
  (mode) => {
    if (mode !== "member_card") {
      createForm.memberCardId = undefined;
      const price = numberField(selectedService.value, "basePrice");
      if (price > 0 && createForm.payableAmount === 0) createForm.payableAmount = price;
      if (mode === "offline_paid" && !createForm.offlinePaymentRemark.trim()) {
        createForm.offlinePaymentRemark = "线下录入已收款";
      }
      return;
    }
    createForm.payableAmount = 0;
    loadMemberCardOptions();
  }
);

watch(
  () => memberCardPurchaseForm.paymentMode,
  (mode) => {
    if (mode === "offline_paid") {
      if (!memberCardPurchaseForm.paymentRemark.trim()) memberCardPurchaseForm.paymentRemark = "线下会员卡购买已收款";
      if (!memberCardPurchaseForm.offlinePaidAt) memberCardPurchaseForm.offlinePaidAt = formatPickerDateTime(new Date());
    }
  }
);

watch(
  () => createForm.customerPhone,
  (phone) => {
    if (!createForm.contactPhone.trim()) createForm.contactPhone = phone.trim();
    if (!createForm.customerName.trim() && !createForm.contactName.trim()) createForm.contactName = phone.trim();
  }
);

watch(
  () => createForm.customerName,
  (name) => {
    if (!createForm.contactName.trim()) createForm.contactName = name.trim();
  }
);

watch(
  () => createForm.detailAddress,
  (address) => {
    if (!createForm.addressTitle.trim() && address.trim()) createForm.addressTitle = address.trim().slice(0, 20);
  }
);

watch(
  () => [initialStatus.value, initialOrderType.value],
  () => {
    queryParams.status = initialStatus.value;
    queryParams.orderType = initialOrderType.value;
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
  queryParams.orderType = initialOrderType.value;
  queryParams.source = "";
  fetchOrders();
}

function handleCreateOrder() {
  resetCreateForm();
  createVisible.value = true;
  loadCustomerOptions();
  loadServiceOptions();
}

function handleCreateMemberCardPurchase() {
  resetMemberCardPurchaseForm();
  memberCardPurchaseVisible.value = true;
  loadPurchaseCustomerOptions();
  loadPurchaseCardOptions();
}

async function loadCustomerOptions(keyword = "") {
  customerLoading.value = true;
  try {
    const data = await LifeAPI.getResourcePage("users", {
      pageNum: 1,
      pageSize: 20,
      keywords: keyword,
      status: "active",
    });
    customerOptions.value = data.list || [];
  } finally {
    customerLoading.value = false;
  }
}

async function loadPurchaseCustomerOptions(keyword = "") {
  purchaseCustomerLoading.value = true;
  try {
    const data = await LifeAPI.getResourcePage("users", {
      pageNum: 1,
      pageSize: 20,
      keywords: keyword,
      status: "active",
    });
    purchaseCustomerOptions.value = data.list || [];
  } finally {
    purchaseCustomerLoading.value = false;
  }
}

function handlePurchaseCustomerVisible(visible: boolean) {
  if (visible && purchaseCustomerOptions.value.length === 0) loadPurchaseCustomerOptions();
}

async function loadPurchaseCardOptions(keyword = "") {
  purchaseCardLoading.value = true;
  try {
    const data = await LifeAPI.getResourcePage("memberCards", {
      pageNum: 1,
      pageSize: 30,
      keywords: keyword,
      status: "published",
    });
    purchaseCardOptions.value = (data.list || []).filter((item) => textField(item, "cardType") !== "consultation");
    if (memberCardPurchaseForm.cardId && !purchaseCardOptions.value.some((item) => Number(item.id) === Number(memberCardPurchaseForm.cardId))) {
      memberCardPurchaseForm.cardId = undefined;
    }
  } finally {
    purchaseCardLoading.value = false;
  }
}

function handlePurchaseCardVisible(visible: boolean) {
  if (visible && purchaseCardOptions.value.length === 0) loadPurchaseCardOptions();
}

function handlePurchaseCardChange() {
  const card = selectedPurchaseCard.value;
  memberCardPurchaseForm.payableAmount = numberField(card, "price");
}

function handleCustomerSelectVisible(visible: boolean) {
  if (visible && customerOptions.value.length === 0) loadCustomerOptions();
}

function handleCustomerChange() {
  const customer = selectedCustomer.value;
  if (!customer) return;
  createForm.customerName = textField(customer, "nickname");
  createForm.customerPhone = textField(customer, "phone");
  createForm.contactName = defaultContactName.value;
  createForm.contactPhone = defaultContactPhone.value;
}

async function loadServiceOptions(keyword = "") {
  serviceLoading.value = true;
  try {
    const data = await LifeAPI.getResourcePage("services", {
      pageNum: 1,
      pageSize: 30,
      keywords: keyword,
      status: "active",
    });
    serviceOptions.value = data.list || [];
  } finally {
    serviceLoading.value = false;
  }
}

function handleServiceSelectVisible(visible: boolean) {
  if (visible && serviceOptions.value.length === 0) loadServiceOptions();
}

function handleServiceChange() {
  applyServiceDefaults();
}

async function loadAddressOptions(userId?: number) {
  if (!userId) {
    addressOptions.value = [];
    createForm.addressId = undefined;
    return;
  }
  addressLoading.value = true;
  try {
    const data = await LifeAPI.listOwnerAddresses("user", userId);
    const list = data.items || [];
    addressOptions.value = list;
    const defaultAddress = list.find((item) => Boolean(item.isDefault)) || list[0];
    createForm.addressId = defaultAddress ? Number(defaultAddress.id) : undefined;
  } finally {
    addressLoading.value = false;
  }
}

async function loadMemberCardOptions() {
  const userId = createForm.userId;
  const service = selectedService.value;
  const cardType = textField(service, "cardType");
  if (!userId || !["time", "times"].includes(cardType)) {
    memberCardOptions.value = [];
    createForm.memberCardId = undefined;
    return;
  }

  memberCardLoading.value = true;
  try {
    const data = await LifeAPI.getResourcePage("userMemberCards", {
      pageNum: 1,
      pageSize: 50,
      status: "active",
      userId: String(userId),
      cardType,
    });
    memberCardOptions.value = (data.list || []).filter((item) =>
      Number(item.userId) === Number(userId) && textField(item, "cardType") === cardType
    );
    if (createForm.memberCardId && !memberCardOptions.value.some((item) => Number(item.id) === Number(createForm.memberCardId))) {
      createForm.memberCardId = undefined;
    }
  } finally {
    memberCardLoading.value = false;
  }
}

function applyServiceDefaults() {
  const service = selectedService.value;
  const price = numberField(service, "basePrice");
  if (createForm.paymentMode === "member_card") {
    createForm.payableAmount = 0;
  } else if (price > 0) {
    createForm.payableAmount = price;
  }
  fillDefaultAppointmentEnd(true);
}

function fillDefaultAppointmentEnd(force = false) {
  const start = parseLocalDateTime(createForm.appointmentStartTime);
  const minutes = serviceDurationMinutes(selectedService.value);
  if (!start || minutes <= 0) return;
  const currentEnd = parseLocalDateTime(createForm.appointmentEndTime);
  if (!force && currentEnd && currentEnd.getTime() > start.getTime()) return;
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  createForm.appointmentEndTime = formatPickerDateTime(end);
}

function isAppointmentRangeValid() {
  const start = parseLocalDateTime(createForm.appointmentStartTime);
  const end = parseLocalDateTime(createForm.appointmentEndTime);
  return Boolean(start && end && start.getTime() < end.getTime());
}

function parseLocalDateTime(value?: string) {
  if (!value) return undefined;
  const date = new Date(value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatPickerDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function customerOptionLabel(item: LifeResourceRecord) {
  const name = textField(item, "nickname") || `客户#${item.id}`;
  const phone = textField(item, "phone") || "-";
  const source = sourceText(textField(item, "source"));
  const orderCount = numberField(item, "orderCount");
  return `${name} / ${phone} / ${source} / ${orderCount}单`;
}

function serviceOptionLabel(item: LifeResourceRecord) {
  const name = textField(item, "name") || `服务#${item.id}`;
  const category = textField(item, "category") || "未分类";
  const price = money(numberField(item, "basePrice"));
  const duration = textField(item, "duration") || serviceDurationText(item);
  return `${name} / ${category} / ￥${price} / ${duration}`;
}

function addressOptionLabel(item: AddressRecord) {
  const parts = [
    item.contactName,
    item.contactPhone,
    item.addressTitle,
    item.detailAddress,
    item.houseNumber,
  ].filter(Boolean);
  return `${parts.join(" / ") || `地址#${item.id}`}${item.isDefault ? " / 默认" : ""}`;
}

function memberCardOptionLabel(item: LifeResourceRecord) {
  const name = textField(item, "cardName") || `会员卡#${item.id}`;
  const usableUnits = numberField(item, "usableUnits");
  const unitName = textField(item, "unitName") || "额度";
  const remainingTimes = numberField(item, "remainingTimes");
  const expireAt = textField(item, "expireAt") || "长期";
  return `${name} / ${cardTypeText(textField(item, "cardType"))} / 可用${usableUnits}${unitName} / 剩余${remainingTimes}次 / ${expireAt}`;
}

function memberCardTemplateOptionLabel(item: LifeResourceRecord) {
  const name = textField(item, "name") || `会员卡#${item.id}`;
  const price = money(numberField(item, "price"));
  const totalUnits = numberField(item, "totalUnits");
  const unitName = textField(item, "unitName") || "额度";
  const validityDays = numberField(item, "validityDays");
  return `${name} / ${cardTypeText(textField(item, "cardType"))} / ￥${price} / ${totalUnits}${unitName} / ${validityDays}天`;
}

function serviceDurationText(item?: LifeResourceRecord) {
  const minutes = serviceDurationMinutes(item);
  return minutes > 0 ? `${minutes} 分钟` : "未设置时长";
}

function serviceDurationMinutes(item?: LifeResourceRecord) {
  return numberField(item, "durationMinutes");
}

function cardTypeText(value?: string) {
  const map: Record<string, string> = {
    none: "不计卡",
    time: "时长卡",
    times: "次卡",
    consultation: "需咨询",
  };
  return map[value || ""] || value || "未设置";
}

function paymentModeText(value?: string) {
  const option = paymentModeOptions.find((item) => item.value === value);
  return option?.label || value || "-";
}

function purchasePaymentModeText(value?: string) {
  const option = memberCardPurchasePaymentOptions.find((item) => item.value === value);
  return option?.label || value || "-";
}

function sourceText(value?: string) {
  const map: Record<string, string> = {
    miniapp: "小程序",
    admin: "后台录入",
    phone: "电话",
    offline: "线下",
    wechat_private: "微信私域",
    channel: "推广渠道",
    promotion: "推广",
  };
  return map[value || ""] || value || "未知";
}

function money(value?: number) {
  return Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function textField(record: LifeResourceRecord | undefined, key: string) {
  const value = record?.[key];
  return value === undefined || value === null ? "" : String(value);
}

function numberField(record: LifeResourceRecord | undefined, key: string) {
  const value = record?.[key];
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
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
  dispatchWarnings.value = [];
  const check = await LifeAPI.getOrderDispatchCheck(row.id);
  if (!check.canAssign) {
    await ElMessageBox.alert(check.blockingReasons.join("\n") || "当前订单不满足派单条件", "无法派单", {
      type: "warning",
      confirmButtonText: "知道了",
    });
    return;
  }
  dispatchWarnings.value = check.warnings || [];
  staffOptions.value = await LifeAPI.getStaffOptions();
  assignVisible.value = true;
}

async function submitCreateOrder() {
  const payload = buildCreateOrderPayload();
  if (!payload) return;

  creating.value = true;
  try {
    const created = await LifeAPI.createAdminOrder(payload);
    ElMessage.success(payload.paymentMode === "unpaid" ? "订单已创建，当前为待支付状态" : "订单已创建，当前为待派单状态");
    createVisible.value = false;
    await fetchOrders();
    if (created?.id) {
      currentOrder.value = created;
    }
  } finally {
    creating.value = false;
  }
}

function openEdit(row: OrderListItem) {
  if (!canUpdateOrders.value) return;
  currentOrder.value = row;
  editForm.appointmentStartTime = toPickerDate(row.appointmentStartTime);
  editForm.appointmentEndTime = toPickerDate(row.appointmentEndTime);
  editForm.createdAt = toPickerDate(row.createdAt);
  editForm.remark = row.remark || "";
  editForm.adminRemark = row.adminRemark || "";
  editVisible.value = true;
}

async function submitEdit() {
  if (!currentOrder.value) return;
  const payload: UpdateOrderPayload = {
    appointmentStartTime: editForm.appointmentStartTime,
    appointmentEndTime: editForm.appointmentEndTime,
    createdAt: editForm.createdAt,
    remark: editForm.remark || null,
    adminRemark: editForm.adminRemark || null,
  };
  await LifeAPI.updateOrder(currentOrder.value.id, payload);
  ElMessage.success("订单已更新");
  editVisible.value = false;
  fetchOrders();
}

async function deleteOrder(row: OrderListItem) {
  if (!canDeleteOrders.value) return;
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
  if (!canDeleteOrders.value) return;
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
  assignSubmitting.value = true;
  try {
    await LifeAPI.assignOrder(currentOrder.value.id, assignForm);
    ElMessage.success("派单成功，已生成师傅站内通知");
    assignVisible.value = false;
    fetchOrders();
  } finally {
    assignSubmitting.value = false;
  }
}

function resetCreateForm() {
  createForm.userId = undefined;
  createForm.customerName = "";
  createForm.customerPhone = "";
  createForm.serviceId = undefined;
  createForm.addressId = undefined;
  createForm.appointmentStartTime = "";
  createForm.appointmentEndTime = "";
  createForm.source = "offline";
  createForm.contactName = "";
  createForm.contactPhone = "";
  createForm.provinceName = "";
  createForm.cityName = "";
  createForm.districtName = "";
  createForm.streetName = "";
  createForm.addressTitle = "";
  createForm.detailAddress = "";
  createForm.houseNumber = "";
  createForm.payableAmount = 0;
  createForm.paymentMode = "offline_paid";
  createForm.memberCardId = undefined;
  createForm.offlinePaymentRemark = "线下录入已收款";
  createForm.remark = "";
  createForm.adminRemark = "";
  addressOptions.value = [];
  memberCardOptions.value = [];
}

function resetMemberCardPurchaseForm() {
  memberCardPurchaseForm.userId = undefined;
  memberCardPurchaseForm.cardId = undefined;
  memberCardPurchaseForm.source = "offline";
  memberCardPurchaseForm.paymentMode = "offline_paid";
  memberCardPurchaseForm.payableAmount = 0;
  memberCardPurchaseForm.offlinePaidAt = formatPickerDateTime(new Date());
  memberCardPurchaseForm.paymentRemark = "线下会员卡购买已收款";
  memberCardPurchaseForm.remark = "";
  memberCardPurchaseForm.adminRemark = "";
}

async function submitMemberCardPurchase() {
  const payload = buildMemberCardPurchasePayload();
  if (!payload) return;

  memberCardPurchaseSubmitting.value = true;
  try {
    const created = await LifeAPI.createAdminMemberCardPurchase(payload);
    ElMessage.success(
      payload.paymentMode === "offline_paid"
        ? "会员卡购买订单已创建，已完成线下收款和发卡"
        : "会员卡购买订单已创建，当前为待支付状态"
    );
    memberCardPurchaseVisible.value = false;
    await fetchOrders();
    if (created?.id) currentOrder.value = created;
  } finally {
    memberCardPurchaseSubmitting.value = false;
  }
}

function buildMemberCardPurchasePayload(): AdminCreateMemberCardPurchasePayload | null {
  const card = selectedPurchaseCard.value;
  const cardPrice = numberField(card, "price");
  const payableAmount = Number(memberCardPurchaseForm.payableAmount || 0);

  if (!memberCardPurchaseForm.userId) {
    ElMessage.warning("请选择已有客户");
    return null;
  }
  if (!memberCardPurchaseForm.cardId || !card) {
    ElMessage.warning("请选择已发布会员卡模板");
    return null;
  }
  if (payableAmount <= 0) {
    ElMessage.warning("会员卡购买订单应收金额必须大于 0");
    return null;
  }
  if (Math.abs(payableAmount - cardPrice) > 0.005 && !memberCardPurchaseForm.adminRemark.trim()) {
    ElMessage.warning("应收金额与会员卡售价不一致，请在后台备注写明改价原因");
    return null;
  }

  return {
    userId: memberCardPurchaseForm.userId,
    cardId: memberCardPurchaseForm.cardId,
    source: memberCardPurchaseForm.source,
    paymentMode: memberCardPurchaseForm.paymentMode,
    payableAmount,
    offlinePaidAt: memberCardPurchaseForm.paymentMode === "offline_paid"
      ? trimOrUndefined(memberCardPurchaseForm.offlinePaidAt)
      : undefined,
    paymentRemark: memberCardPurchaseForm.paymentMode === "offline_paid"
      ? trimOrUndefined(memberCardPurchaseForm.paymentRemark)
      : undefined,
    remark: trimOrUndefined(memberCardPurchaseForm.remark),
    adminRemark: trimOrUndefined(memberCardPurchaseForm.adminRemark),
  };
}

function buildCreateOrderPayload(): AdminCreateOrderPayload | null {
  const service = selectedService.value;
  const customerPhone = createForm.customerPhone.trim();
  const customerName = createForm.customerName.trim();
  const detailAddress = createForm.detailAddress.trim();
  const servicePrice = numberField(service, "basePrice");

  if (!createForm.userId && !customerPhone) {
    ElMessage.warning("请选择已有客户，或填写新客户手机号");
    return null;
  }
  if (!createForm.serviceId || !service) {
    ElMessage.warning("请选择服务项目");
    return null;
  }
  if (!createForm.appointmentStartTime || !createForm.appointmentEndTime) {
    ElMessage.warning("请选择预约开始和结束时间");
    return null;
  }
  if (!isAppointmentRangeValid()) {
    ElMessage.warning("预约结束时间必须晚于开始时间");
    return null;
  }
  if (!createForm.addressId && !detailAddress) {
    ElMessage.warning("请选择客户已有地址，或填写新增服务地址");
    return null;
  }
  if (createForm.paymentMode === "member_card" && !createForm.memberCardId) {
    ElMessage.warning("会员卡抵扣时请选择当前客户可用会员卡");
    return null;
  }
  if (createForm.paymentMode === "member_card" && !createForm.userId) {
    ElMessage.warning("会员卡抵扣必须先选择已有客户");
    return null;
  }
  if (createForm.paymentMode !== "member_card" && servicePrice > 0 && Math.abs(Number(createForm.payableAmount || 0) - servicePrice) > 0.005 && !createForm.adminRemark.trim()) {
    ElMessage.warning("应收金额与服务价格不一致，请在后台备注写明改价原因");
    return null;
  }

  const payload: AdminCreateOrderPayload = {
    serviceId: createForm.serviceId,
    appointmentStartTime: createForm.appointmentStartTime,
    appointmentEndTime: createForm.appointmentEndTime,
    source: createForm.source,
    paymentMode: createForm.paymentMode,
    memberCardId: createForm.paymentMode === "member_card" ? createForm.memberCardId : undefined,
    offlinePaymentRemark: createForm.paymentMode === "offline_paid" ? trimOrUndefined(createForm.offlinePaymentRemark) : undefined,
    remark: trimOrUndefined(createForm.remark),
    adminRemark: trimOrUndefined(createForm.adminRemark),
  };
  if (createForm.paymentMode !== "member_card" && createForm.payableAmount > 0) {
    payload.payableAmount = createForm.payableAmount;
  }

  if (createForm.userId) {
    payload.userId = createForm.userId;
  } else {
    payload.customer = {
      nickname: customerName || customerPhone,
      phone: customerPhone,
      adminRemark: trimOrUndefined(createForm.adminRemark),
    };
  }

  if (detailAddress) {
    const contactName = createForm.contactName.trim() || defaultContactName.value || customerName || customerPhone;
    const contactPhone = createForm.contactPhone.trim() || defaultContactPhone.value || customerPhone;
    if (!contactName || !contactPhone) {
      ElMessage.warning("新增地址需要联系人和联系电话");
      return null;
    }
    payload.address = {
      contactName,
      contactPhone,
      provinceName: trimOrUndefined(createForm.provinceName),
      cityName: trimOrUndefined(createForm.cityName),
      districtName: trimOrUndefined(createForm.districtName),
      streetName: trimOrUndefined(createForm.streetName),
      addressTitle: trimOrUndefined(createForm.addressTitle) || detailAddress.slice(0, 20),
      detailAddress,
      houseNumber: trimOrUndefined(createForm.houseNumber),
      isDefault: true,
    };
  } else if (createForm.addressId) {
    payload.addressId = createForm.addressId;
  }

  return payload;
}

function trimOrUndefined(value?: string) {
  const text = value?.trim();
  return text || undefined;
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
    refund_pending: { label: "退款中", type: "warning" },
    refunded: { label: "已退款", type: "info" },
    after_sales: { label: "售后中", type: "danger" },
  };
  return map[status] || { label: status, type: "info" };
}

function orderTypeMeta(orderType?: string): { label: string; type: "primary" | "success" | "warning" | "danger" | "info" } {
  const map: Record<string, { label: string; type: "primary" | "success" | "warning" | "danger" | "info" }> = {
    service_booking: { label: "服务预约", type: "primary" },
    consultation: { label: "咨询预约", type: "warning" },
    member_card_purchase: { label: "会员卡购买", type: "success" },
  };
  return orderType ? map[orderType] || { label: orderType, type: "info" } : { label: "-", type: "info" };
}

function canAssign(row: OrderListItem) {
  return row.status === "pending_dispatch" && row.orderType !== "member_card_purchase";
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

.order-entry-section {
  padding: 14px 0 4px;
  border-top: 1px solid var(--el-border-color-lighter);

  &:first-of-type {
    padding-top: 0;
    border-top: 0;
  }

  &__title {
    margin-bottom: 12px;
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
}

.selected-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  padding: 10px 12px;
  margin: -4px 0 12px 110px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.address-choice-list {
  width: 100%;
  min-height: 40px;
}

.address-choice-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  :deep(.el-radio-button__inner) {
    max-width: 360px;
    overflow: hidden;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-left: var(--el-border);
    border-radius: 6px;
  }
}

.order-entry-summary {
  padding: 12px;
  margin-top: 14px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;

  &__title {
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 600;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 16px;
    font-size: 13px;
    color: var(--el-text-color-regular);

    span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

@media (max-width: 768px) {
  .selected-summary {
    margin-left: 0;
  }

  .order-entry-summary__grid {
    grid-template-columns: 1fr;
  }
}
</style>
