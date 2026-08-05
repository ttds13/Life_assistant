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
        <el-button v-if="order && canUpdateOrders && order.allowedActions?.update && !isMemberCardPurchaseOrder" type="primary" @click="openEdit">编辑订单</el-button>
        <el-button
          v-if="isMemberCardPurchaseOrder"
          type="success"
          :disabled="!memberCardManageId"
          @click="openMemberCardManage"
        >
          管理用户会员卡
        </el-button>
        <el-button
          v-if="isMemberCardPurchaseOrder"
          :disabled="!memberCardManageId"
          @click="openMemberCardRecords"
        >
          查看会员卡流水
        </el-button>
        <el-button v-if="order" :loading="accountingLoading" @click="loadAccounting">账务检查</el-button>
        <el-button
          v-if="canConfirmOfflinePayment"
          type="warning"
          :loading="offlineSubmitting"
          @click="openOfflinePayment"
        >
          确认线下收款
        </el-button>
        <el-button
          v-if="order?.allowedActions?.assign && canAssignOrders"
          type="success"
          @click="openAssign"
        >
          人工派单
        </el-button>
        <el-button v-if="order && canUpdateOrders" @click="openRemark">后台备注</el-button>
        <el-button v-if="order?.allowedActions?.cancel && canCancelOrders" type="warning" @click="cancelOrder">取消订单</el-button>
        <el-button v-if="order?.allowedActions?.deleteDraft && canDeleteOrders" type="danger" @click="deleteOrder">删除草稿</el-button>
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

        <el-card v-if="!isMemberCardPurchaseOrder" shadow="never" class="mb-4">
          <template #header>
            <div class="card-header-row">
              <span>订单服务地址</span>
              <div class="card-header-row__actions">
                <el-button v-if="order?.orderAddress?.mapAvailable" text type="primary" @click="openOrderAddressMap">地图查看</el-button>
                <el-button v-if="order?.orderAddress" text type="primary" @click="copyOrderAddress">复制地址</el-button>
                <el-button v-if="canEditOrderAddress" text type="primary" @click="openOrderAddressEdit">修改本单地址</el-button>
              </div>
            </div>
          </template>
          <el-descriptions v-if="order?.orderAddress" :column="2" border>
            <el-descriptions-item label="位置名称">{{ order.orderAddress.addressTitle || "用户指定服务位置" }}</el-descriptions-item>
            <el-descriptions-item label="地址版本">
              v{{ order.orderAddress.version }}
              <el-tag v-if="order.orderAddress.version > 1" type="warning" size="small" class="ml-2">已修改</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="完整地址" :span="2">{{ order.orderAddress.formattedAddress }}</el-descriptions-item>
            <el-descriptions-item label="联系人">{{ order.orderAddress.contactName }} / {{ order.orderAddress.contactPhone }}</el-descriptions-item>
            <el-descriptions-item label="地址来源">{{ orderAddressSourceText(order.orderAddress.source) }}</el-descriptions-item>
            <el-descriptions-item label="地图状态">
              <el-tag :type="order.orderAddress.mapAvailable ? 'success' : 'info'">
                {{ order.orderAddress.mapAvailable ? "坐标可用" : "手动地址，无地图坐标" }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="坐标">
              {{ order.orderAddress.mapAvailable ? `${order.orderAddress.latitude}, ${order.orderAddress.longitude}` : "-" }}
            </el-descriptions-item>
          </el-descriptions>
          <el-empty v-else description="该上门订单缺少关联地址，请先治理数据后再派单" />

          <template v-if="orderAddressRevisions.length">
            <el-divider content-position="left">地址变更记录</el-divider>
            <el-timeline>
              <el-timeline-item
                v-for="item in orderAddressRevisions"
                :key="item.id"
                :timestamp="formatDateTime(item.createdAt)"
                placement="top"
              >
                <strong>v{{ item.version }} · {{ item.changeType }}</strong>
                <p>{{ item.reason || "无变更原因" }}（{{ item.operatorType }}#{{ item.operatorId || "-" }}）</p>
              </el-timeline-item>
            </el-timeline>
          </template>
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
          <template #header>
            <div class="card-header-row">
              <span>{{ isMemberCardPurchaseOrder ? "发放会员卡" : "会员卡流水" }}</span>
              <div v-if="hasMemberCardUsage" class="card-header-row__actions">
                <el-button text type="primary" size="small" :disabled="!memberCardManageId" @click="openMemberCardManage">
                  管理用户会员卡
                </el-button>
                <el-button text type="primary" size="small" :disabled="!memberCardManageId" @click="openMemberCardRecords">
                  查看流水
                </el-button>
              </div>
            </div>
          </template>
          <template v-if="hasMemberCardUsage">
            <el-descriptions :column="2" border class="mb-4">
              <el-descriptions-item label="会员卡">{{ order?.memberCardName || order?.memberCard?.name || "-" }}</el-descriptions-item>
              <el-descriptions-item label="单位">{{ order?.memberCardUnitName || order?.memberCard?.unitName || "-" }}</el-descriptions-item>
              <el-descriptions-item label="来源订单">{{ order?.orderNo || "-" }}</el-descriptions-item>
              <el-descriptions-item label="用户卡ID">{{ memberCardManageId || "-" }}</el-descriptions-item>
              <el-descriptions-item label="模板ID">{{ order?.memberCardTemplateId || order?.memberCard?.memberCardTemplateId || order?.memberCard?.cardId || "-" }}</el-descriptions-item>
              <el-descriptions-item label="卡状态">
                <el-tag :type="memberCardStatusType(order?.memberCard?.status)">
                  {{ memberCardStatusText(order?.memberCard?.status) }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="规则来源">{{ order?.memberCardRuleSource || "-" }}</el-descriptions-item>
              <el-descriptions-item label="规则变化">
                <el-tag :type="order?.memberCardRuleChanged ? 'warning' : 'success'">
                  {{ order?.memberCardRuleChanged ? "当前规则已变化" : "与当前规则一致" }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="冻结额度">{{ formatUnits(order?.frozenUnits) }}</el-descriptions-item>
              <el-descriptions-item label="预计扣减">{{ formatUnits(order?.plannedConsumeUnits || order?.memberCardConsumeUnits) }}</el-descriptions-item>
              <el-descriptions-item label="实际扣减">{{ formatUnits(order?.actualConsumeUnits) }}</el-descriptions-item>
              <el-descriptions-item label="释放额度">{{ formatUnits(order?.releasedUnits) }}</el-descriptions-item>
              <el-descriptions-item label="卡内余额">{{ formatUnits(order?.memberCard?.remainingUnits) }}</el-descriptions-item>
              <el-descriptions-item label="仍冻结">{{ formatUnits(order?.memberCard?.frozenUnits) }}</el-descriptions-item>
              <el-descriptions-item label="可用余额">{{ formatUnits(order?.memberCard?.usableUnits) }}</el-descriptions-item>
              <el-descriptions-item label="规则快照" :span="2">
                <pre class="json-snapshot">{{ formatJson(order?.memberCardRuleSnapshot) }}</pre>
              </el-descriptions-item>
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
          <template #header>
            <div class="card-header-row">
              <span>账务闭环检查</span>
              <el-button text type="primary" size="small" :loading="accountingLoading" @click="loadAccounting">刷新</el-button>
            </div>
          </template>
          <template v-if="accounting">
            <el-alert
              :type="accounting.passed ? 'success' : 'warning'"
              :title="accounting.passed ? '账务闭环已通过' : '账务闭环存在待处理项'"
              show-icon
              :closable="false"
              class="mb-3"
            />
            <div v-for="item in accounting.checks" :key="item.key" class="accounting-check">
              <el-tag :type="item.passed ? 'success' : 'danger'" size="small">
                {{ item.passed ? '通过' : '异常' }}
              </el-tag>
              <span>{{ item.message }}</span>
            </div>
            <el-divider />
            <div class="accounting-summary">
              <span>支付 {{ accounting.payments.length }}</span>
              <span>优惠券 {{ accounting.couponRecord ? couponStatusText(accounting.couponRecord.status) : "无" }}</span>
              <span>积分 {{ accountingPointTotal }} 分</span>
              <span>收入 {{ accounting.incomeRecords.length }}</span>
              <span>退款 {{ accounting.refunds.length }}</span>
            </div>
          </template>
          <el-empty v-else description="点击账务检查加载结果" />
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

        <el-card shadow="never" class="mb-4">
          <template #header>
            <div class="card-header-row">
              <span>派单通知</span>
              <el-button
                v-if="order?.staffId"
                text
                type="primary"
                :loading="resendNotificationLoading"
                @click="resendOrderNotification"
              >
                补发通知
              </el-button>
            </div>
          </template>
          <el-empty v-if="!order?.staffId" description="该订单尚未派单，暂无师傅通知" />
          <template v-else>
            <el-alert
              v-if="!order.assignmentNotification"
              title="当前订单已有师傅，但没有找到派单通知，可点击补发。"
              type="warning"
              show-icon
              :closable="false"
              class="mb-3"
            />
            <el-descriptions v-if="order.assignmentNotification" :column="1" border>
              <el-descriptions-item label="通知ID">#{{ order.assignmentNotification.id }}</el-descriptions-item>
              <el-descriptions-item label="发送状态">{{ notificationStatusText(order.assignmentNotification.sendStatus) }}</el-descriptions-item>
              <el-descriptions-item label="阅读状态">
                <el-tag :type="order.assignmentNotification.isRead ? 'success' : 'warning'">
                  {{ order.assignmentNotification.isRead ? "已读" : "未读" }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="发送时间">{{ formatDateTime(order.assignmentNotification.sentAt) }}</el-descriptions-item>
              <el-descriptions-item label="阅读时间">{{ formatDateTime(order.assignmentNotification.readAt) }}</el-descriptions-item>
              <el-descriptions-item label="重发次数">{{ order.assignmentNotification.retryCount || 0 }}</el-descriptions-item>
              <el-descriptions-item v-if="order.assignmentNotification.failureReason" label="失败原因">
                {{ order.assignmentNotification.failureReason }}
              </el-descriptions-item>
            </el-descriptions>
            <div v-if="(order.assignmentNotifications || []).length > 1" class="notification-history">
              <div class="notification-history__title">最近通知</div>
              <div v-for="item in order.assignmentNotifications" :key="item.id" class="notification-history__item">
                <span>#{{ item.id }} {{ notificationStatusText(item.sendStatus) }}</span>
                <span>{{ item.isRead ? "已读" : "未读" }}</span>
                <span>{{ formatDateTime(item.createdAt) }}</span>
              </div>
            </div>
          </template>
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

    <el-dialog v-model="offlineVisible" title="确认线下收款" width="520px">
      <el-alert
        :title="offlinePaymentAlertTitle"
        type="warning"
        show-icon
        :closable="false"
        class="mb-4"
      />
      <el-form label-width="100px">
        <el-form-item label="订单号">
          <el-text>{{ order?.orderNo }}</el-text>
        </el-form-item>
        <el-form-item label="收款金额" required>
          <el-input-number v-model="offlineForm.amount" :min="0.01" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="收款时间">
          <el-date-picker
            v-model="offlineForm.paidAt"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            clearable
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="offlineForm.remark" type="textarea" :rows="3" maxlength="256" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="offlineVisible = false">取消</el-button>
        <el-button type="primary" :loading="offlineSubmitting" @click="submitOfflinePayment">确认收款</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑订单" width="720px">
      <el-form label-width="100px" class="order-edit-form">
        <el-form-item label="订单号">
          <el-text>{{ order?.orderNo }}</el-text>
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
        <el-form-item label="修改原因" required>
          <el-input v-model="editForm.reason" type="textarea" :rows="2" maxlength="256" show-word-limit />
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

    <el-dialog v-model="addressEditVisible" title="修改本单服务地址" width="620px" destroy-on-close>
      <el-alert
        title="只修改当前订单，不会修改客户地址簿。已派单后修改会通知师傅重新确认。"
        type="warning"
        :closable="false"
        show-icon
        class="mb-4"
      />
      <el-form label-width="100px" v-loading="addressOptionsLoading">
        <el-form-item label="客户地址" required>
          <el-select v-model="addressEditForm.sourceAddressId" style="width: 100%" placeholder="请选择客户已有地址">
            <el-option
              v-for="item in addressOptions"
              :key="item.id"
              :label="addressOptionLabel(item)"
              :value="Number(item.id)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="修改原因" required>
          <el-input v-model="addressEditForm.reason" type="textarea" :rows="3" maxlength="256" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addressEditVisible = false">取消</el-button>
        <el-button type="primary" :loading="addressSubmitting" @click="submitOrderAddressEdit">确认修改</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "LifeOrderDetail" });

import LifeAPI from "@/api/life";
import type { AddressRecord, OrderAccountingResult, OrderDetail, StaffOption, UpdateOrderPayload } from "@/api/life";
import { hasPerm } from "@/utils/auth";

type TagType = "primary" | "success" | "warning" | "danger" | "info";

const route = useRoute();
const router = useRouter();
const canUpdateOrders = computed(() => hasPerm(["user-order:update", "user-booking:reschedule"]));
const canAssignOrders = computed(() => hasPerm("user-booking:assign"));
const canCancelOrders = computed(() => hasPerm(["user-order:cancel", "user-booking:cancel"]));
const canDeleteOrders = computed(() => hasPerm(["user-order:delete-draft", "user-booking:delete-draft"]));

const order = ref<OrderDetail>();
const staffOptions = ref<StaffOption[]>([]);
const assignVisible = ref(false);
const remarkVisible = ref(false);
const editVisible = ref(false);
const addressEditVisible = ref(false);
const offlineVisible = ref(false);
const assignSubmitting = ref(false);
const accountingLoading = ref(false);
const offlineSubmitting = ref(false);
const resendNotificationLoading = ref(false);
const addressOptionsLoading = ref(false);
const addressSubmitting = ref(false);
const addressOptions = ref<AddressRecord[]>([]);
const dispatchWarnings = ref<string[]>([]);
const accounting = ref<OrderAccountingResult>();
const assignForm = reactive({
  staffId: "",
  remark: "",
});
const remarkForm = reactive({
  remark: "",
});
const editForm = reactive({
  appointmentStartTime: "",
  appointmentEndTime: "",
  reason: "",
  remark: "",
  adminRemark: "",
});
const addressEditForm = reactive({
  sourceAddressId: undefined as number | undefined,
  reason: "",
});
const offlineForm = reactive({
  amount: 0,
  paidAt: "",
  remark: "",
});

const orderPhotos = computed(() => order.value?.photos?.length ? order.value.photos : order.value?.servicePhotos || []);
const assignments = computed(() => order.value?.assignments || []);
const memberCardRecords = computed(() => order.value?.memberCardRecords || []);
const timelineItems = computed(() => order.value?.statusLogs || []);
const orderAddressRevisions = computed(() => order.value?.orderAddressRevisions || []);
const hasMemberCardUsage = computed(() =>
  Boolean(order.value?.userMemberCardId || order.value?.memberCardId || order.value?.memberCardName || order.value?.memberCard || memberCardRecords.value.length),
);
const isMemberCardPurchaseOrder = computed(() => order.value?.orderType === "member_card_purchase");
const memberCardManageId = computed(() =>
  order.value?.grantedUserMemberCardId || order.value?.userMemberCardId || order.value?.memberCardId || order.value?.memberCard?.id || null
);
const isPendingMemberCardPurchasePayment = computed(() =>
  Boolean(
    order.value
    && order.value.orderType === "member_card_purchase"
    && order.value.status === "pending_payment"
    && !order.value.paidAt
    && !order.value.grantedUserMemberCardId
    && order.value.payableAmount > 0,
  ),
);
const offlinePaymentAlertTitle = computed(() =>
  order.value?.orderType === "member_card_purchase"
    ? "确认后会生成 offline 支付流水、核销优惠券、发放会员卡和积分，并将会员卡购买订单完成。"
    : "确认后会生成 offline 支付流水、核销优惠券、积分流水，并将现金服务订单推进到待派单。"
);
const accountingPointTotal = computed(() =>
  (accounting.value?.pointLedgers || []).reduce((sum, item) => sum + item.points, 0),
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
const canConfirmOfflinePayment = computed(() =>
  Boolean(
    order.value
    && canUpdateOrders.value
    && (
      isPendingMemberCardPurchasePayment.value
      || (
        !order.value.paidAt
        && !order.value.userMemberCardId
        && !order.value.memberCardId
        && order.value.orderType !== "member_card_purchase"
        && order.value.payableAmount > 0
        && ["pending_payment", "pending_dispatch"].includes(order.value.status)
      )
    ),
  ),
);
const canEditOrderAddress = computed(() =>
  Boolean(
    order.value?.orderAddress
    && canUpdateOrders.value
    && order.value.allowedActions?.addressUpdate,
  ),
);

onMounted(async () => {
  await fetchDetail();
  await loadAccounting();
  if (route.query.action === "edit" && order.value?.allowedActions?.update && canUpdateOrders.value) {
    openEdit();
  }
});

async function fetchDetail() {
  order.value = await LifeAPI.getOrderDetail(String(route.params.id));
}

function orderAddressSourceText(source?: string) {
  const map: Record<string, string> = {
    gps: "自动定位",
    map: "地图选址",
    manual: "手动填写",
    admin: "Admin 录入",
    migration: "历史数据迁移",
  };
  return source ? map[source] || source : "-";
}

function addressOptionLabel(item: AddressRecord) {
  return item.formattedAddress
    || [item.provinceName, item.cityName, item.districtName, item.addressTitle, item.detailAddress, item.houseNumber]
      .filter(Boolean)
      .join("");
}

async function copyOrderAddress() {
  const text = order.value?.orderAddress?.formattedAddress;
  if (!text) return;
  await navigator.clipboard.writeText(text);
  ElMessage.success("地址已复制");
}

function openOrderAddressMap() {
  const address = order.value?.orderAddress;
  if (!address?.mapAvailable || !Number.isFinite(address.latitude) || !Number.isFinite(address.longitude)) return;
  const marker = `coord:${address.latitude},${address.longitude};title:${address.addressTitle || "订单服务地址"};addr:${address.formattedAddress}`;
  const url = `https://apis.map.qq.com/uri/v1/marker?marker=${encodeURIComponent(marker)}&referer=life-assistant`;
  window.open(url, "_blank", "noopener,noreferrer");
}

async function openOrderAddressEdit() {
  if (!order.value?.userId || !order.value.orderAddress || !canEditOrderAddress.value) return;
  addressEditVisible.value = true;
  addressEditForm.sourceAddressId = order.value.orderAddress.sourceAddressId || undefined;
  addressEditForm.reason = "";
  addressOptionsLoading.value = true;
  try {
    const data = await LifeAPI.listOwnerAddresses("user", order.value.userId);
    addressOptions.value = data.items || [];
  } finally {
    addressOptionsLoading.value = false;
  }
}

async function submitOrderAddressEdit() {
  if (!order.value?.orderAddress || !addressEditForm.sourceAddressId) {
    ElMessage.warning("请选择客户地址");
    return;
  }
  if (!addressEditForm.reason.trim()) {
    ElMessage.warning("请填写修改原因");
    return;
  }
  const source = addressOptions.value.find(item => Number(item.id) === addressEditForm.sourceAddressId);
  addressSubmitting.value = true;
  try {
    order.value = await LifeAPI.updateOrderAddress(order.value.id, {
      sourceAddressId: addressEditForm.sourceAddressId,
      expectedOrderVersion: order.value.version || 0,
      expectedOrderAddressVersion: order.value.orderAddress.version,
      expectedSourceAddressVersion: source?.version,
      reason: addressEditForm.reason.trim(),
    });
    addressEditVisible.value = false;
    ElMessage.success(order.value.staffId ? "订单地址已修改，并已通知师傅" : "订单地址已修改");
  } finally {
    addressSubmitting.value = false;
  }
}

async function loadAccounting() {
  if (!order.value) return;
  accountingLoading.value = true;
  try {
    accounting.value = await LifeAPI.getOrderAccounting(order.value.id);
  } finally {
    accountingLoading.value = false;
  }
}

function openMemberCardManage() {
  if (!memberCardManageId.value) {
    ElMessage.info("订单完成发卡后才能管理用户会员卡");
    return;
  }
  router.push({
    path: "/users/member-cards",
    query: { userMemberCardId: String(memberCardManageId.value) },
  });
}

function openMemberCardRecords() {
  if (!memberCardManageId.value) {
    ElMessage.info("订单完成发卡后才能查看会员卡流水");
    return;
  }
  router.push({
    path: "/marketing/member-card-records",
    query: {
      userMemberCardId: String(memberCardManageId.value),
      orderId: order.value?.id ? String(order.value.id) : undefined,
    },
  });
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

async function resendOrderNotification() {
  if (!order.value?.staffId) return;
  await ElMessageBox.confirm(
    `确认给师傅「${order.value.staffName || `#${order.value.staffId}`}」补发订单 ${order.value.orderNo} 的派单通知吗？`,
    "补发派单通知",
    { type: "warning" },
  );
  resendNotificationLoading.value = true;
  try {
    await LifeAPI.resendOrderStaffNotification(order.value.id);
    ElMessage.success("派单通知已补发");
    await fetchDetail();
  } finally {
    resendNotificationLoading.value = false;
  }
}

function openRemark() {
  if (!canUpdateOrders.value) return;
  remarkForm.remark = order.value?.adminRemark || "";
  remarkVisible.value = true;
}

function openEdit() {
  if (!order.value || !canUpdateOrders.value || !order.value.allowedActions?.update) return;
  editForm.appointmentStartTime = toPickerDate(order.value.appointmentStartTime);
  editForm.appointmentEndTime = toPickerDate(order.value.appointmentEndTime);
  editForm.reason = "";
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

function openOfflinePayment() {
  if (!order.value || !canConfirmOfflinePayment.value) return;
  offlineForm.amount = Number(order.value.payableAmount || 0);
  offlineForm.paidAt = toPickerDate(new Date().toISOString());
  offlineForm.remark = "";
  offlineVisible.value = true;
}

async function submitOfflinePayment() {
  if (!order.value) return;
  if (Number(offlineForm.amount.toFixed(2)) !== Number(order.value.payableAmount.toFixed(2))) {
    ElMessage.warning("线下收款金额必须等于订单应付金额");
    return;
  }
  const isMemberCardPurchase = order.value.orderType === "member_card_purchase";
  offlineSubmitting.value = true;
  try {
    order.value = await LifeAPI.confirmOfflinePayment(order.value.id, {
      amount: offlineForm.amount,
      paidAt: offlineForm.paidAt || undefined,
      remark: offlineForm.remark || undefined,
    });
    ElMessage.success(
      isMemberCardPurchase
        ? "线下收款已确认，支付、优惠券、会员卡和积分流水已生成"
        : "线下收款已确认，支付、优惠券、积分和待派单通知已生成"
    );
    offlineVisible.value = false;
    await loadAccounting();
  } finally {
    offlineSubmitting.value = false;
  }
}

async function submitEdit() {
  if (!order.value) return;
  if (!editForm.reason.trim()) {
    ElMessage.warning("请填写修改原因");
    return;
  }
  const payload: UpdateOrderPayload = {
    expectedVersion: order.value.version,
    reason: editForm.reason.trim(),
    appointmentStartTime: editForm.appointmentStartTime,
    appointmentEndTime: editForm.appointmentEndTime,
    remark: editForm.remark || null,
    adminRemark: editForm.adminRemark || null,
  };
  order.value = isMemberCardPurchaseOrder.value
    ? await LifeAPI.updateOrder(order.value.id, payload)
    : await LifeAPI.rescheduleBooking(order.value.id, payload);
  ElMessage.success("订单已更新");
  editVisible.value = false;
  await loadAccounting();
}

async function deleteOrder() {
  if (!order.value || !canDeleteOrders.value) return;
  const { value } = await ElMessageBox.prompt(
    `仅会删除无支付、退款、履约、积分和权益事实的待支付草稿「${order.value.orderNo}」。请输入原因。`,
    "删除草稿",
    { type: "warning", inputPattern: /\S{2,}/, inputErrorMessage: "原因至少 2 个字符" },
  );
  if (isMemberCardPurchaseOrder.value) {
    await LifeAPI.deleteOrder(order.value.id, { version: order.value.version, reason: value.trim() });
  } else {
    await LifeAPI.deleteBookingDraft(order.value.id, { version: order.value.version, reason: value.trim() });
  }
  ElMessage.success("订单草稿已删除");
  router.replace("/orders/list");
}

async function cancelOrder() {
  if (!order.value || !canCancelOrders.value) return;
  const { value } = await ElMessageBox.prompt(
    `确认取消订单「${order.value.orderNo}」吗？已支付订单会进入退款审核。请输入原因。`,
    "取消订单",
    { type: "warning", inputPattern: /\S{2,}/, inputErrorMessage: "原因至少 2 个字符" },
  );
  order.value = await (isMemberCardPurchaseOrder.value ? LifeAPI.cancelOrder : LifeAPI.cancelBooking)(order.value.id, {
    version: order.value.version,
    reason: value.trim(),
  });
  ElMessage.success(order.value.status === "refund_pending" ? "订单已进入退款处理" : "订单已取消");
  await loadAccounting();
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
    admin_adjust: { label: "后台调整", type: "primary" },
    refund_revoke: { label: "退款回收", type: "info" },
  };
  return map[type] || { label: type, type: "info" };
}

function memberCardStatusText(status?: string) {
  const map: Record<string, string> = {
    active: "正常",
    disabled: "停用",
    expired: "已过期",
    used_up: "已用完",
    refunded: "已退款",
  };
  return status ? map[status] || status : "-";
}

function memberCardStatusType(status?: string): TagType {
  const map: Record<string, TagType> = {
    active: "success",
    disabled: "info",
    expired: "warning",
    used_up: "info",
    refunded: "info",
  };
  return status ? map[status] || "info" : "info";
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
    sent: "站内通知已发送",
    failed: "通知发送失败",
    skipped: "通知未配置",
  };
  return status ? map[status] || status : "未记录";
}

function couponStatusText(status?: string | null) {
  const map: Record<string, string> = {
    available: "可用",
    locked: "已锁定",
    used: "已核销",
    expired: "已过期",
    released: "已释放",
    invalid: "已作废",
  };
  return status ? map[status] || status : "无";
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

function formatJson(value?: Record<string, unknown> | null) {
  if (!value || !Object.keys(value).length) return "-";
  return JSON.stringify(value, null, 2);
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

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  &__actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
}

.accounting-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
  line-height: 22px;
}

.accounting-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.json-snapshot {
  max-height: 180px;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-secondary);
}

.notification-history {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);

  &__title {
    margin-bottom: 8px;
    color: var(--el-text-color-primary);
    font-weight: 600;
  }

  &__item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 56px 120px;
    gap: 8px;
    padding: 6px 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
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
