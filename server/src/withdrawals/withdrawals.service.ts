import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma, WithdrawRequest } from '@prisma/client'
import { AdminAuditService } from '../audit-log/admin-audit.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { ORDER_STATUS } from '../orders/constants/order-status'
import { ORDER_TYPE, isStaffVisibleOrderType } from '../orders/constants/order-type'
import { WechatPayClient } from '../payments/wechat-pay.client'
import { WechatPayConfig } from '../payments/wechat-pay.config'
import { PrismaService } from '../prisma/prisma.service'
import { WITHDRAW_ACTIVE_STATUSES, WITHDRAW_CHANNEL, WITHDRAW_INCOME_TYPE, WITHDRAW_STATUS } from './constants/withdraw-status'
import { CreateWithdrawRequestDto } from './dto/create-withdraw-request.dto'
import { QueryWithdrawDto } from './dto/query-withdraw.dto'
import { ExecuteWithdrawDto, ManualHandleWithdrawDto, RetryWithdrawDto } from './dto/retry-withdraw.dto'
import { ReviewWithdrawDto } from './dto/review-withdraw.dto'

interface AdminWriteContext {
  adminId: number
  requestId?: string
  ip?: string
}

type DbClient = PrismaService | Prisma.TransactionClient

type WithdrawWithStaff = Prisma.WithdrawRequestGetPayload<{
  include: {
    staff: { include: { user: true } }
    incomeRecords: { include: { order: true } }
    statusLogs: true
  }
}>

const ZERO = new Prisma.Decimal(0)

@Injectable()
export class WithdrawalsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
    @Inject(WechatPayConfig) private readonly wechatConfig: WechatPayConfig,
    @Inject(WechatPayClient) private readonly wechatPay: WechatPayClient,
  ) {}

  async getStaffWithdrawSummary(staffId: number) {
    await this.settleAvailableIncome(this.prisma, BigInt(staffId))
    const staff = await this.findActiveStaff(staffId)
    const staffBigInt = BigInt(staffId)
    const [
      available,
      pendingSettlement,
      frozen,
      withdrawn,
      activeRequest,
    ] = await Promise.all([
      this.sumIncome({ staffId: staffBigInt, settlementStatus: 'settled', withdrawStatus: 'none' }),
      this.sumIncome({ staffId: staffBigInt, settlementStatus: 'pending', withdrawStatus: 'none' }),
      this.sumIncome({ staffId: staffBigInt, withdrawStatus: 'frozen' }),
      this.sumIncome({ staffId: staffBigInt, withdrawStatus: 'withdrawn' }),
      this.prisma.withdrawRequest.findFirst({
        where: { staffId: staffBigInt, status: { in: [...WITHDRAW_ACTIVE_STATUSES] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ])

    return {
      staffId,
      staffName: staff.name,
      openidBound: Boolean(staff.user?.openid),
      availableAmount: this.decimalToNumber(available),
      pendingSettlementAmount: this.decimalToNumber(pendingSettlement),
      frozenAmount: this.decimalToNumber(frozen),
      withdrawnAmount: this.decimalToNumber(withdrawn),
      minAmount: this.minAmount(),
      maxSingleAmount: this.maxSingleAmount(),
      dailyLimit: this.dailyLimit(),
      settlementDays: this.settlementDays(),
      channel: this.withdrawProvider(),
      activeRequest: activeRequest ? this.presentWithdraw(activeRequest) : null,
      rules: [
        'completed service income is withdrawable after settlement',
        'one active withdrawal is allowed per staff',
        'wechat wallet withdrawal requires bound openid',
      ],
    }
  }

  async listStaffWithdrawRequests(staffId: number, query: QueryWithdrawDto) {
    await this.findActiveStaff(staffId)
    const page = this.normalizePositiveInt(query.page, 1)
    const pageSize = this.normalizePositiveInt(query.pageSize, 20, 100)
    const where: Prisma.WithdrawRequestWhereInput = { staffId: BigInt(staffId) }
    if (query.status && query.status !== 'all') {
      where.status = this.normalizeStatus(query.status)
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.withdrawRequest.count({ where }),
      this.prisma.withdrawRequest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    return { items: items.map(item => this.presentWithdraw(item)), page, pageSize, total }
  }

  async getStaffWithdrawDetail(staffId: number, id: number) {
    const item = await this.prisma.withdrawRequest.findFirst({
      where: { id: BigInt(id), staffId: BigInt(staffId) },
      include: { staff: { include: { user: true } }, incomeRecords: { include: { order: true } }, statusLogs: true },
    })
    if (!item) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'withdraw request not found', 404)
    }
    return this.presentWithdrawDetail(item)
  }

  async getStaffConfirmPackage(staffId: number, id: number) {
    const item = await this.prisma.withdrawRequest.findFirst({
      where: { id: BigInt(id), staffId: BigInt(staffId) },
    })
    if (!item) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, '提现申请不存在', 404)
    }
    if (item.status !== WITHDRAW_STATUS.WAIT_USER_CONFIRM) {
      throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, '当前提现单不是待确认收款状态，无法发起微信确认', 409)
    }
    if (!item.packageInfo) {
      throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, '提现确认参数缺失，请返回后刷新提现详情或联系客服', 409)
    }
    return {
      withdrawId: Number(item.id),
      withdrawNo: item.withdrawNo,
      status: item.status,
      packageInfo: item.packageInfo,
    }
  }

  async createWithdrawRequest(staffId: number, dto: CreateWithdrawRequestDto, requestId?: string) {
    const amountFen = this.amountYuanToFen(dto.amount)
    const amount = new Prisma.Decimal(amountFen).div(100)
    this.assertAmountRules(amount, amountFen)

    const withdrawId = await this.prisma.$transaction(async (tx) => {
      await this.lockStaff(tx, BigInt(staffId))
      await this.settleAvailableIncome(tx, BigInt(staffId))
      const staff = await tx.staff.findFirst({
        where: { id: BigInt(staffId), status: 1, deletedAt: null },
        include: { user: true },
      })
      if (!staff) {
        throw new BusinessException(ErrorCode.STAFF_NOT_FOUND, 'staff not found or disabled', 403)
      }
      if (!staff.user?.openid) {
        throw new BusinessException(ErrorCode.AUTH_WECHAT_FAIL, 'staff wechat openid is required', 400)
      }

      const active = await tx.withdrawRequest.findFirst({
        where: { staffId: staff.id, status: { in: [...WITHDRAW_ACTIVE_STATUSES] } },
        select: { id: true, status: true },
      })
      if (active) {
        throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'active withdraw request already exists', 409)
      }

      const dailyAmount = await this.sumWithdrawAmountToday(tx, staff.id)
      if (dailyAmount.add(amount).greaterThan(this.dailyLimit())) {
        throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'daily withdraw limit exceeded', 409)
      }

      const available = await this.sumIncomeWithClient(tx, {
        staffId: staff.id,
        settlementStatus: 'settled',
        withdrawStatus: 'none',
      })
      if (available.lessThan(amount)) {
        throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'available balance is insufficient', 409)
      }

      const withdrawNo = this.createWithdrawNo()
      const selected = await this.freezeIncomeRecords(tx, staff.id, amount, null)
      const created = await tx.withdrawRequest.create({
        data: {
          withdrawNo,
          staffId: staff.id,
          amount,
          amountFen,
          feeAmount: ZERO,
          availableSnapshot: available,
          status: WITHDRAW_STATUS.PENDING_REVIEW,
          channel: this.withdrawProvider(),
          outBillNo: withdrawNo,
          openid: staff.user.openid,
          bankInfo: { method: 'wechat_wallet', staffUserId: staff.userId ? Number(staff.userId) : null },
          requestId,
        },
      })

      await tx.staffIncomeRecord.updateMany({
        where: { id: { in: selected.map(item => item.id) } },
        data: {
          withdrawRequestId: created.id,
          withdrawStatus: 'frozen',
        },
      })
      await this.writeStatusLog(tx, {
        withdrawRequestId: created.id,
        fromStatus: null,
        toStatus: WITHDRAW_STATUS.PENDING_REVIEW,
        action: 'staff:create',
        operatorType: 'staff',
        operatorId: staff.id,
        remark: dto.remark || 'staff withdraw request',
        requestId,
        detail: { amount: this.decimalToNumber(amount), selectedIncomeRecordIds: selected.map(item => Number(item.id)) },
      })
      return created.id
    })

    return this.getStaffWithdrawDetail(staffId, Number(withdrawId))
  }

  async cancelWithdrawRequest(staffId: number, id: number, requestId?: string) {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.findWithdrawForUpdate(tx, BigInt(id))
      if (current.staffId !== BigInt(staffId)) {
        throw new BusinessException(ErrorCode.STAFF_FORBIDDEN, 'withdraw request forbidden', 403)
      }
      if (![WITHDRAW_STATUS.LEGACY_PENDING, WITHDRAW_STATUS.PENDING_REVIEW].includes(current.status as any)) {
        throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'withdraw cannot be cancelled by staff', 409)
      }
      await tx.withdrawRequest.update({
        where: { id: current.id },
        data: { status: WITHDRAW_STATUS.CANCELLED },
      })
      await this.releaseFrozenIncome(tx, current.id)
      await this.writeStatusLog(tx, {
        withdrawRequestId: current.id,
        fromStatus: current.status,
        toStatus: WITHDRAW_STATUS.CANCELLED,
        action: 'staff:cancel',
        operatorType: 'staff',
        operatorId: BigInt(staffId),
        remark: 'staff cancelled withdraw request',
        requestId,
      })
    })
    return this.getStaffWithdrawDetail(staffId, id)
  }

  async listAdminWithdrawRequests(query: QueryWithdrawDto) {
    const page = this.normalizePositiveInt(query.page, 1)
    const pageSize = this.normalizePositiveInt(query.pageSize, 20, 100)
    const where: Prisma.WithdrawRequestWhereInput = {}
    if (query.status && query.status !== 'all') {
      where.status = this.normalizeStatus(query.status)
    }
    if (query.keyword) {
      where.OR = [
        { withdrawNo: { contains: query.keyword } },
        { outBillNo: { contains: query.keyword } },
        { transferBillNo: { contains: query.keyword } },
        { staff: { name: { contains: query.keyword } } },
        { staff: { phone: { contains: query.keyword } } },
      ]
    }
    const dateStart = this.parseDate(query.dateStart, 'dateStart')
    const dateEnd = this.parseDate(query.dateEnd, 'dateEnd')
    if (dateStart || dateEnd) {
      where.createdAt = {
        ...(dateStart ? { gte: dateStart } : {}),
        ...(dateEnd ? { lte: dateEnd } : {}),
      }
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.withdrawRequest.count({ where }),
      this.prisma.withdrawRequest.findMany({
        where,
        include: { staff: { include: { user: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    return { items: items.map(item => this.presentAdminWithdraw(item)), page, pageSize, total }
  }

  async getAdminWithdrawDetail(id: number) {
    const item = await this.prisma.withdrawRequest.findUnique({
      where: { id: BigInt(id) },
      include: {
        staff: { include: { user: true } },
        incomeRecords: { include: { order: true } },
        statusLogs: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
      },
    })
    if (!item) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'withdraw request not found', 404)
    }
    return this.presentWithdrawDetail(item)
  }

  async reviewWithdraw(id: number, dto: ReviewWithdrawDto, context: AdminWriteContext) {
    if (dto.action === 'approve') {
      const approved = await this.approveWithdraw(id, dto, context)
      if (dto.executeNow) {
        return this.executeWithdraw(id, dto, context)
      }
      return approved
    }
    return this.rejectWithdraw(id, dto, context)
  }

  async approveWithdraw(id: number, dto: Pick<ReviewWithdrawDto, 'remark'>, context: AdminWriteContext) {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.findWithdrawForUpdate(tx, BigInt(id))
      if (current.status === WITHDRAW_STATUS.APPROVED) return
      if (![WITHDRAW_STATUS.LEGACY_PENDING, WITHDRAW_STATUS.PENDING_REVIEW].includes(current.status as any)) {
        throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'withdraw is not pending review', 409)
      }
      const now = new Date()
      await tx.withdrawRequest.update({
        where: { id: current.id },
        data: {
          status: WITHDRAW_STATUS.APPROVED,
          reviewedBy: BigInt(context.adminId),
          reviewedAt: now,
          handledBy: BigInt(context.adminId),
          handledAt: now,
          rejectReason: null,
          failureReason: null,
        },
      })
      await this.writeStatusLog(tx, {
        withdrawRequestId: current.id,
        fromStatus: current.status,
        toStatus: WITHDRAW_STATUS.APPROVED,
        action: 'admin:approve',
        operatorType: 'admin',
        operatorId: BigInt(context.adminId),
        remark: dto.remark || 'withdraw approved',
        requestId: context.requestId,
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'withdraw:approve',
        module: 'finance',
        targetType: 'withdraw_request',
        targetId: current.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: WITHDRAW_STATUS.APPROVED, remark: dto.remark || '' },
      })
    })
    return this.getAdminWithdrawDetail(id)
  }

  async rejectWithdraw(id: number, dto: Pick<ReviewWithdrawDto, 'remark'>, context: AdminWriteContext) {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.findWithdrawForUpdate(tx, BigInt(id))
      if (current.status === WITHDRAW_STATUS.REJECTED) return
      if (![WITHDRAW_STATUS.LEGACY_PENDING, WITHDRAW_STATUS.PENDING_REVIEW].includes(current.status as any)) {
        throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'withdraw is not pending review', 409)
      }
      const now = new Date()
      await tx.withdrawRequest.update({
        where: { id: current.id },
        data: {
          status: WITHDRAW_STATUS.REJECTED,
          reviewedBy: BigInt(context.adminId),
          reviewedAt: now,
          handledBy: BigInt(context.adminId),
          handledAt: now,
          rejectReason: dto.remark || 'withdraw rejected',
        },
      })
      await this.releaseFrozenIncome(tx, current.id)
      await this.writeStatusLog(tx, {
        withdrawRequestId: current.id,
        fromStatus: current.status,
        toStatus: WITHDRAW_STATUS.REJECTED,
        action: 'admin:reject',
        operatorType: 'admin',
        operatorId: BigInt(context.adminId),
        remark: dto.remark || 'withdraw rejected',
        requestId: context.requestId,
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'withdraw:reject',
        module: 'finance',
        targetType: 'withdraw_request',
        targetId: current.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: WITHDRAW_STATUS.REJECTED, remark: dto.remark || '' },
      })
    })
    return this.getAdminWithdrawDetail(id)
  }

  async executeWithdraw(id: number, dto: ExecuteWithdrawDto = {}, context?: AdminWriteContext) {
    const started = await this.prisma.$transaction(async (tx) => {
      const current = await this.findWithdrawForUpdate(tx, BigInt(id))
      if (current.status === WITHDRAW_STATUS.PAID || current.status === WITHDRAW_STATUS.WAIT_USER_CONFIRM) {
        return { withdraw: current, shouldCallChannel: false }
      }
      if (![WITHDRAW_STATUS.APPROVED, WITHDRAW_STATUS.FAILED].includes(current.status as any)) {
        throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'withdraw is not executable', 409)
      }
      await this.ensureFrozenIncomeForWithdraw(tx, current)
      const channel = this.withdrawProvider()
      const outBillNo = current.outBillNo || current.withdrawNo
      const updated = await tx.withdrawRequest.update({
        where: { id: current.id },
        data: {
          status: WITHDRAW_STATUS.PROCESSING,
          channel,
          outBillNo,
          processedAt: new Date(),
          failureReason: null,
          notifyRaw: null,
        },
      })
      await this.writeStatusLog(tx, {
        withdrawRequestId: current.id,
        fromStatus: current.status,
        toStatus: WITHDRAW_STATUS.PROCESSING,
        action: 'admin:execute',
        operatorType: context ? 'admin' : 'system',
        operatorId: BigInt(context?.adminId || 0),
        remark: dto.remark || 'withdraw processing',
        requestId: context?.requestId,
        detail: { channel, outBillNo },
      })
      if (context) {
        await this.audit.writeWithClient(tx, {
          adminId: context.adminId,
          action: 'withdraw:execute',
          module: 'finance',
          targetType: 'withdraw_request',
          targetId: current.id,
          requestId: context.requestId,
          ip: context.ip,
          detail: { before: current.status, after: WITHDRAW_STATUS.PROCESSING, channel, remark: dto.remark || '' },
        })
      }
      return { withdraw: updated, shouldCallChannel: true }
    })

    if (!started.shouldCallChannel) {
      return this.getAdminWithdrawDetail(Number(started.withdraw.id))
    }

    const current = await this.prisma.withdrawRequest.findUniqueOrThrow({
      where: { id: started.withdraw.id },
      include: { staff: { include: { user: true } } },
    })

    if (current.channel === WITHDRAW_CHANNEL.MOCK) {
      const result = dto.mockResult || this.config.get<string>('WITHDRAW_MOCK_RESULT', 'success')
      if (result === 'failed') {
        return this.handleTransferFailed(current.outBillNo || current.withdrawNo, 'mock withdraw failed', JSON.stringify({ channel: 'mock', result }), context?.requestId)
      }
      return this.handleTransferSuccess(current.outBillNo || current.withdrawNo, `MOCK${current.withdrawNo}`, JSON.stringify({ channel: 'mock', result }), context?.requestId)
    }

    try {
      const response = await this.wechatPay.createMerchantTransfer({
        outBillNo: current.outBillNo || current.withdrawNo,
        openid: current.openid || current.staff.user?.openid || '',
        amountFen: current.amountFen || this.decimalYuanToFen(current.amount),
        remark: 'service withdrawal',
        transferSceneId: this.wechatConfig.getWechatConfig().transferSceneId,
        notifyUrl: this.wechatConfig.getWechatConfig().transferNotifyUrl,
        userNameEncrypted: current.userNameEncrypted || undefined,
      })
      return this.applyWechatTransferResult(current.outBillNo || current.withdrawNo, response, JSON.stringify(response), context?.requestId)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'wechat transfer failed'
      return this.handleTransferFailed(current.outBillNo || current.withdrawNo, message, JSON.stringify({ message }), context?.requestId)
    }
  }

  async retryWithdraw(id: number, dto: RetryWithdrawDto, context: AdminWriteContext) {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.findWithdrawForUpdate(tx, BigInt(id))
      if (![WITHDRAW_STATUS.FAILED, WITHDRAW_STATUS.EXPIRED, WITHDRAW_STATUS.CANCELLED].includes(current.status as any)) {
        throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'withdraw cannot be retried', 409)
      }
      const active = await tx.withdrawRequest.findFirst({
        where: {
          staffId: current.staffId,
          id: { not: current.id },
          status: { in: [...WITHDRAW_ACTIVE_STATUSES] },
        },
        select: { id: true },
      })
      if (active) {
        throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'another active withdraw request exists', 409)
      }
      await this.ensureFrozenIncomeForWithdraw(tx, current)
      await tx.withdrawRequest.update({
        where: { id: current.id },
        data: {
          status: WITHDRAW_STATUS.APPROVED,
          retryCount: { increment: 1 },
          failureReason: null,
          rejectReason: null,
          packageInfo: null,
        },
      })
      await this.writeStatusLog(tx, {
        withdrawRequestId: current.id,
        fromStatus: current.status,
        toStatus: WITHDRAW_STATUS.APPROVED,
        action: 'admin:retry',
        operatorType: 'admin',
        operatorId: BigInt(context.adminId),
        remark: dto.remark || 'withdraw retry',
        requestId: context.requestId,
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'withdraw:retry',
        module: 'finance',
        targetType: 'withdraw_request',
        targetId: current.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: WITHDRAW_STATUS.APPROVED, remark: dto.remark || '' },
      })
    })
    return this.executeWithdraw(id, dto, context)
  }

  async cancelWechatTransfer(id: number, context: AdminWriteContext) {
    const current = await this.prisma.withdrawRequest.findUnique({ where: { id: BigInt(id) } })
    if (!current) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'withdraw request not found', 404)
    }
    if (![WITHDRAW_STATUS.PROCESSING, WITHDRAW_STATUS.WAIT_USER_CONFIRM, WITHDRAW_STATUS.APPROVED].includes(current.status as any)) {
      throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'withdraw cannot be cancelled', 409)
    }
    let raw: string | undefined
    if (current.channel === WITHDRAW_CHANNEL.WECHAT && current.outBillNo) {
      const response = await this.wechatPay.cancelMerchantTransfer(current.outBillNo)
      raw = JSON.stringify(response)
    }
    return this.markTerminalStatus(id, WITHDRAW_STATUS.CANCELLED, 'admin:cancel_transfer', context, 'withdraw transfer cancelled', raw)
  }

  async queryWechatTransfer(id: number, context: AdminWriteContext) {
    const current = await this.prisma.withdrawRequest.findUnique({ where: { id: BigInt(id) } })
    if (!current) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'withdraw request not found', 404)
    }
    if (current.channel !== WITHDRAW_CHANNEL.WECHAT) {
      return this.getAdminWithdrawDetail(id)
    }
    if (!current.outBillNo) {
      throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'withdraw out bill no missing', 409)
    }
    const response = await this.wechatPay.queryMerchantTransferByOutBillNo(current.outBillNo)
    await this.audit.write({
      adminId: context.adminId,
      action: 'withdraw:query',
      module: 'finance',
      targetType: 'withdraw_request',
      targetId: id,
      requestId: context.requestId,
      ip: context.ip,
      detail: { state: response.state || '', outBillNo: current.outBillNo },
    })
    return this.applyWechatTransferResult(current.outBillNo, response, JSON.stringify(response), context.requestId)
  }

  async manualHandle(id: number, dto: ManualHandleWithdrawDto, context: AdminWriteContext) {
    if (dto.status === WITHDRAW_STATUS.PAID) {
      const current = await this.prisma.withdrawRequest.findUnique({ where: { id: BigInt(id) } })
      if (!current) {
        throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'withdraw request not found', 404)
      }
      await this.audit.write({
        adminId: context.adminId,
        action: 'withdraw:manual_paid',
        module: 'finance',
        targetType: 'withdraw_request',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { remark: dto.remark || '', transferBillNo: dto.transferBillNo || '' },
      })
      return this.handleTransferSuccess(current.outBillNo || current.withdrawNo, dto.transferBillNo || `MANUAL${current.withdrawNo}`, JSON.stringify({ manual: true, remark: dto.remark || '' }), context.requestId)
    }
    return this.markTerminalStatus(id, dto.status, `admin:manual_${dto.status}`, context, dto.remark || 'manual withdraw handling')
  }

  async handleWechatTransferNotify(rawBody: string, headers: {
    signature: string
    timestamp: string
    nonce: string
    serial: string
  }, requestId?: string) {
    const notify = this.wechatPay.parseTransferNotify(rawBody, headers)
    const transfer = notify.transfer
    if (!transfer.out_bill_no) {
      throw new BusinessException(ErrorCode.PAYMENT_NOT_FOUND, 'wechat out_bill_no missing', 400)
    }

    const config = this.wechatConfig.getWechatConfig()
    if ((transfer.appid && transfer.appid !== config.appid) || (transfer.mchid && transfer.mchid !== config.mchId)) {
      throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'wechat transfer merchant mismatch', 400)
    }
    return this.applyWechatTransferResult(transfer.out_bill_no, transfer, rawBody, requestId)
  }

  async createIncomeForCompletedOrder(tx: Prisma.TransactionClient, order: {
    id: bigint
    staffId: bigint | null
    orderType: string
    payableAmount: Prisma.Decimal
    originalAmount: Prisma.Decimal
  }, completedAt: Date) {
    if (!order.staffId || !isStaffVisibleOrderType(order.orderType)) return
    const amount = order.payableAmount.greaterThan(0) ? order.payableAmount : order.originalAmount
    if (amount.lessThanOrEqualTo(0)) return

    const availableAt = this.addDays(completedAt, this.settlementDays())
    const settled = availableAt.getTime() <= completedAt.getTime()
    await tx.staffIncomeRecord.upsert({
      where: {
        staffId_orderId_type: {
          staffId: order.staffId,
          orderId: order.id,
          type: WITHDRAW_INCOME_TYPE.SERVICE_INCOME,
        },
      },
      create: {
        staffId: order.staffId,
        orderId: order.id,
        amount,
        type: WITHDRAW_INCOME_TYPE.SERVICE_INCOME,
        status: settled ? 'settled' : 'pending_settlement',
        settlementStatus: settled ? 'settled' : 'pending',
        withdrawStatus: 'none',
        availableAt,
        settledAt: settled ? completedAt : null,
      },
      update: {
        amount,
        availableAt,
        settlementStatus: settled ? 'settled' : 'pending',
        status: settled ? 'settled' : 'pending_settlement',
        settledAt: settled ? completedAt : null,
      },
    })
  }

  private async applyWechatTransferResult(outBillNo: string, response: {
    state?: string
    transfer_bill_no?: string
    package_info?: string
    fail_reason?: string
  }, raw: string, requestId?: string) {
    const state = response.state || ''
    if (this.isWechatTransferSuccess(state)) {
      return this.handleTransferSuccess(outBillNo, response.transfer_bill_no || '', raw, requestId)
    }
    if (this.isWechatTransferFailed(state)) {
      return this.handleTransferFailed(outBillNo, response.fail_reason || state, raw, requestId)
    }
    if (response.package_info || this.isWechatTransferWaitUser(state)) {
      await this.prisma.$transaction(async (tx) => {
        const current = await this.findWithdrawByNoForUpdate(tx, outBillNo)
        if (current.status === WITHDRAW_STATUS.PAID) return
        await tx.withdrawRequest.update({
          where: { id: current.id },
          data: {
            status: WITHDRAW_STATUS.WAIT_USER_CONFIRM,
            transferBillNo: response.transfer_bill_no || current.transferBillNo,
            packageInfo: response.package_info || current.packageInfo,
            notifyRaw: raw,
          },
        })
        await this.writeStatusLog(tx, {
          withdrawRequestId: current.id,
          fromStatus: current.status,
          toStatus: WITHDRAW_STATUS.WAIT_USER_CONFIRM,
          action: 'wechat:wait_user_confirm',
          operatorType: 'wechat',
          operatorId: BigInt(0),
          remark: 'wechat transfer waits for user confirmation',
          requestId,
          detail: { state, transferBillNo: response.transfer_bill_no || '' },
        })
      })
      const current = await this.prisma.withdrawRequest.findFirst({ where: { OR: [{ withdrawNo: outBillNo }, { outBillNo }] } })
      return current ? this.getAdminWithdrawDetail(Number(current.id)) : { outBillNo, state }
    }

    await this.prisma.withdrawRequest.updateMany({
      where: { OR: [{ withdrawNo: outBillNo }, { outBillNo }], status: { not: WITHDRAW_STATUS.PAID } },
      data: {
        status: WITHDRAW_STATUS.PROCESSING,
        transferBillNo: response.transfer_bill_no || undefined,
        notifyRaw: raw,
      },
    })
    const current = await this.prisma.withdrawRequest.findFirst({ where: { OR: [{ withdrawNo: outBillNo }, { outBillNo }] } })
    return current ? this.getAdminWithdrawDetail(Number(current.id)) : { outBillNo, state }
  }

  private async handleTransferSuccess(outBillNo: string, transferBillNo?: string, rawNotify?: string, requestId?: string) {
    const id = await this.prisma.$transaction(async (tx) => {
      const current = await this.findWithdrawByNoForUpdate(tx, outBillNo)
      if (current.status === WITHDRAW_STATUS.PAID) return current.id
      if (![WITHDRAW_STATUS.PROCESSING, WITHDRAW_STATUS.WAIT_USER_CONFIRM, WITHDRAW_STATUS.APPROVED, WITHDRAW_STATUS.FAILED].includes(current.status as any)) {
        throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'withdraw cannot be marked paid', 409)
      }
      await this.ensureFrozenIncomeForWithdraw(tx, current)
      const now = new Date()
      await tx.withdrawRequest.update({
        where: { id: current.id },
        data: {
          status: WITHDRAW_STATUS.PAID,
          transferBillNo: transferBillNo || current.transferBillNo,
          notifyRaw: rawNotify || current.notifyRaw,
          failureReason: null,
          paidAt: now,
          processedAt: current.processedAt || now,
        },
      })
      await tx.staffIncomeRecord.updateMany({
        where: { withdrawRequestId: current.id, withdrawStatus: 'frozen' },
        data: { withdrawStatus: 'withdrawn', settlementStatus: 'settled', status: 'withdrawn' },
      })
      await this.writeStatusLog(tx, {
        withdrawRequestId: current.id,
        fromStatus: current.status,
        toStatus: WITHDRAW_STATUS.PAID,
        action: 'wechat:success',
        operatorType: 'wechat',
        operatorId: BigInt(0),
        remark: 'withdraw transfer paid',
        requestId,
        detail: { transferBillNo: transferBillNo || current.transferBillNo || '' },
      })
      return current.id
    })
    return this.getAdminWithdrawDetail(Number(id))
  }

  private async handleTransferFailed(outBillNo: string, reason: string, rawNotify?: string, requestId?: string) {
    const id = await this.prisma.$transaction(async (tx) => {
      const current = await this.findWithdrawByNoForUpdate(tx, outBillNo)
      if (current.status === WITHDRAW_STATUS.PAID) return current.id
      await tx.withdrawRequest.update({
        where: { id: current.id },
        data: {
          status: WITHDRAW_STATUS.FAILED,
          failureReason: reason.slice(0, 512),
          notifyRaw: rawNotify || current.notifyRaw,
          processedAt: current.processedAt || new Date(),
          packageInfo: null,
        },
      })
      await this.releaseFrozenIncome(tx, current.id)
      await this.writeStatusLog(tx, {
        withdrawRequestId: current.id,
        fromStatus: current.status,
        toStatus: WITHDRAW_STATUS.FAILED,
        action: 'wechat:failed',
        operatorType: 'wechat',
        operatorId: BigInt(0),
        remark: reason.slice(0, 512),
        requestId,
      })
      return current.id
    })
    return this.getAdminWithdrawDetail(Number(id))
  }

  private async markTerminalStatus(
    id: number,
    status: string,
    action: string,
    context: AdminWriteContext,
    remark: string,
    rawNotify?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.findWithdrawForUpdate(tx, BigInt(id))
      if (current.status === WITHDRAW_STATUS.PAID) {
        throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'paid withdraw cannot be changed', 409)
      }
      await tx.withdrawRequest.update({
        where: { id: current.id },
        data: {
          status,
          failureReason: status === WITHDRAW_STATUS.FAILED ? remark.slice(0, 512) : current.failureReason,
          notifyRaw: rawNotify || current.notifyRaw,
          packageInfo: status === WITHDRAW_STATUS.CANCELLED || status === WITHDRAW_STATUS.EXPIRED ? null : current.packageInfo,
        },
      })
      if ([WITHDRAW_STATUS.FAILED, WITHDRAW_STATUS.CANCELLED, WITHDRAW_STATUS.EXPIRED].includes(status as any)) {
        await this.releaseFrozenIncome(tx, current.id)
      }
      await this.writeStatusLog(tx, {
        withdrawRequestId: current.id,
        fromStatus: current.status,
        toStatus: status,
        action,
        operatorType: 'admin',
        operatorId: BigInt(context.adminId),
        remark,
        requestId: context.requestId,
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action,
        module: 'finance',
        targetType: 'withdraw_request',
        targetId: current.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: status, remark },
      })
    })
    return this.getAdminWithdrawDetail(id)
  }

  private async ensureFrozenIncomeForWithdraw(tx: Prisma.TransactionClient, withdraw: WithdrawRequest) {
    const frozen = await tx.staffIncomeRecord.aggregate({
      where: { withdrawRequestId: withdraw.id, withdrawStatus: 'frozen' },
      _sum: { amount: true },
    })
    const frozenAmount = frozen._sum.amount || ZERO
    if (frozenAmount.greaterThanOrEqualTo(withdraw.amount)) return

    await this.releaseFrozenIncome(tx, withdraw.id)
    const selected = await this.freezeIncomeRecords(tx, withdraw.staffId, withdraw.amount, withdraw.id)
    await tx.staffIncomeRecord.updateMany({
      where: { id: { in: selected.map(item => item.id) } },
      data: { withdrawRequestId: withdraw.id, withdrawStatus: 'frozen' },
    })
  }

  private async freezeIncomeRecords(
    tx: Prisma.TransactionClient,
    staffId: bigint,
    amount: Prisma.Decimal,
    withdrawRequestId: bigint | null,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: bigint }>>`
      SELECT id
      FROM staff_income_records
      WHERE staff_id = ${staffId}
        AND settlement_status = 'settled'
        AND withdraw_status = 'none'
      ORDER BY COALESCE(available_at, created_at), id
      FOR UPDATE
    `
    if (!rows.length) {
      throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'available balance is insufficient', 409)
    }
    const records = await tx.staffIncomeRecord.findMany({
      where: { id: { in: rows.map(row => row.id) } },
      orderBy: [{ availableAt: 'asc' }, { id: 'asc' }],
    })
    const selected: typeof records = []
    let total = ZERO
    for (const record of records) {
      selected.push(record)
      total = total.add(record.amount)
      if (total.greaterThanOrEqualTo(amount)) break
    }
    if (total.lessThan(amount)) {
      throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'available balance is insufficient', 409)
    }
    if (withdrawRequestId) {
      await tx.staffIncomeRecord.updateMany({
        where: { id: { in: selected.map(item => item.id) }, withdrawStatus: 'none' },
        data: { withdrawRequestId, withdrawStatus: 'frozen' },
      })
    }
    return selected
  }

  private async releaseFrozenIncome(tx: Prisma.TransactionClient, withdrawRequestId: bigint) {
    await tx.staffIncomeRecord.updateMany({
      where: { withdrawRequestId, withdrawStatus: 'frozen' },
      data: {
        withdrawRequestId: null,
        withdrawStatus: 'none',
        status: 'settled',
      },
    })
  }

  private async settleAvailableIncome(client: DbClient, staffId: bigint) {
    const now = new Date()
    await client.staffIncomeRecord.updateMany({
      where: {
        staffId,
        settlementStatus: 'pending',
        withdrawStatus: 'none',
        availableAt: { lte: now },
        order: { status: ORDER_STATUS.COMPLETED },
      },
      data: {
        settlementStatus: 'settled',
        status: 'settled',
        settledAt: now,
      },
    })
  }

  private async sumIncome(where: Prisma.StaffIncomeRecordWhereInput) {
    return this.sumIncomeWithClient(this.prisma, where)
  }

  private async sumIncomeWithClient(client: DbClient, where: Prisma.StaffIncomeRecordWhereInput) {
    const result = await client.staffIncomeRecord.aggregate({ where, _sum: { amount: true } })
    return result._sum.amount || ZERO
  }

  private async sumWithdrawAmountToday(tx: Prisma.TransactionClient, staffId: bigint) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const result = await tx.withdrawRequest.aggregate({
      where: {
        staffId,
        createdAt: { gte: start },
        status: { notIn: [WITHDRAW_STATUS.REJECTED, WITHDRAW_STATUS.CANCELLED] },
      },
      _sum: { amount: true },
    })
    return result._sum.amount || ZERO
  }

  private async findActiveStaff(staffId: number) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: BigInt(staffId), status: 1, deletedAt: null },
      include: { user: true },
    })
    if (!staff) {
      throw new BusinessException(ErrorCode.STAFF_NOT_FOUND, 'staff not found or disabled', 403)
    }
    return staff
  }

  private async lockStaff(tx: Prisma.TransactionClient, staffId: bigint) {
    await tx.$queryRaw`SELECT id FROM staff WHERE id = ${staffId} FOR UPDATE`
  }

  private async findWithdrawForUpdate(tx: Prisma.TransactionClient, id: bigint) {
    await tx.$queryRaw`SELECT id FROM withdraw_requests WHERE id = ${id} FOR UPDATE`
    const current = await tx.withdrawRequest.findUnique({ where: { id } })
    if (!current) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'withdraw request not found', 404)
    }
    return current
  }

  private async findWithdrawByNoForUpdate(tx: Prisma.TransactionClient, no: string) {
    const current = await tx.withdrawRequest.findFirst({
      where: { OR: [{ withdrawNo: no }, { outBillNo: no }] },
      select: { id: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    if (!current) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'withdraw request not found', 404)
    }
    return this.findWithdrawForUpdate(tx, current.id)
  }

  private async writeStatusLog(tx: Prisma.TransactionClient, params: {
    withdrawRequestId: bigint
    fromStatus: string | null
    toStatus: string
    action: string
    operatorType: string
    operatorId: bigint
    remark?: string
    detail?: Record<string, unknown>
    requestId?: string
  }) {
    await tx.withdrawStatusLog.create({
      data: {
        withdrawRequestId: params.withdrawRequestId,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        action: params.action,
        operatorType: params.operatorType,
        operatorId: params.operatorId,
        remark: params.remark,
        detail: params.detail ? params.detail as Prisma.InputJsonObject : undefined,
        requestId: params.requestId,
      },
    })
  }

  private presentWithdraw(item: WithdrawRequest) {
    return {
      id: Number(item.id),
      withdrawNo: item.withdrawNo,
      staffId: Number(item.staffId),
      amount: this.decimalToNumber(item.amount),
      amountFen: item.amountFen,
      feeAmount: this.decimalToNumber(item.feeAmount),
      availableSnapshot: this.decimalToNumber(item.availableSnapshot),
      status: this.normalizeStatus(item.status),
      channel: item.channel,
      outBillNo: item.outBillNo || '',
      transferBillNo: item.transferBillNo || '',
      packageInfo: item.packageInfo || '',
      failureReason: item.failureReason || '',
      rejectReason: item.rejectReason || '',
      retryCount: item.retryCount,
      reviewedBy: item.reviewedBy ? Number(item.reviewedBy) : null,
      reviewedAt: item.reviewedAt?.toISOString() || null,
      processedAt: item.processedAt?.toISOString() || null,
      paidAt: item.paidAt?.toISOString() || null,
      expiredAt: item.expiredAt?.toISOString() || null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }
  }

  private presentAdminWithdraw<T extends WithdrawRequest & { staff?: { name: string, phone: string, user?: { nickname: string | null, phone: string | null, openid: string | null } | null } }>(item: T) {
    return {
      ...this.presentWithdraw(item),
      staffName: item.staff?.name || '',
      staffPhone: item.staff?.phone || item.staff?.user?.phone || '',
      staffNickname: item.staff?.user?.nickname || '',
      openidBound: Boolean(item.openid || item.staff?.user?.openid),
    }
  }

  private presentWithdrawDetail(item: WithdrawWithStaff) {
    return {
      ...this.presentAdminWithdraw(item),
      incomeRecords: item.incomeRecords.map(record => ({
        id: Number(record.id),
        orderId: Number(record.orderId),
        orderNo: record.order.orderNo,
        orderStatus: record.order.status,
        amount: this.decimalToNumber(record.amount),
        type: record.type,
        status: record.status,
        settlementStatus: record.settlementStatus,
        withdrawStatus: record.withdrawStatus,
        availableAt: record.availableAt?.toISOString() || null,
        settledAt: record.settledAt?.toISOString() || null,
        createdAt: record.createdAt.toISOString(),
      })),
      statusLogs: item.statusLogs.map(log => ({
        id: Number(log.id),
        fromStatus: log.fromStatus,
        toStatus: log.toStatus,
        action: log.action,
        operatorType: log.operatorType,
        operatorId: Number(log.operatorId),
        remark: log.remark || '',
        detail: log.detail || null,
        requestId: log.requestId || '',
        createdAt: log.createdAt.toISOString(),
      })),
    }
  }

  private normalizeStatus(status: string) {
    return status === WITHDRAW_STATUS.LEGACY_PENDING ? WITHDRAW_STATUS.PENDING_REVIEW : status
  }

  private withdrawProvider() {
    const provider = this.config.get<string>('WITHDRAW_PROVIDER', WITHDRAW_CHANNEL.MOCK).trim()
    return provider === WITHDRAW_CHANNEL.WECHAT ? WITHDRAW_CHANNEL.WECHAT : WITHDRAW_CHANNEL.MOCK
  }

  private minAmount() {
    return this.positiveNumberConfig('WITHDRAW_MIN_AMOUNT', 10)
  }

  private maxSingleAmount() {
    return this.positiveNumberConfig('WITHDRAW_MAX_SINGLE_AMOUNT', 1999.99)
  }

  private dailyLimit() {
    return this.positiveNumberConfig('WITHDRAW_DAILY_LIMIT', 5000)
  }

  private settlementDays() {
    return Math.max(0, Math.floor(this.positiveNumberConfig('WITHDRAW_SETTLEMENT_DAYS', 1)))
  }

  private positiveNumberConfig(key: string, fallback: number) {
    const value = Number(this.config.get<string | number>(key, fallback))
    return Number.isFinite(value) && value >= 0 ? value : fallback
  }

  private assertAmountRules(amount: Prisma.Decimal, amountFen: number) {
    if (amountFen < this.amountYuanToFen(this.minAmount())) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'withdraw amount is below minimum', 400)
    }
    if (amount.greaterThan(this.maxSingleAmount())) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'withdraw amount exceeds single limit', 400)
    }
  }

  private amountYuanToFen(amount: number) {
    const parsed = Number(amount)
    const fen = Math.round(parsed * 100)
    if (!Number.isFinite(parsed) || !Number.isInteger(fen) || fen < 1 || Math.abs(parsed * 100 - fen) > 0.000001) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid withdraw amount', 400)
    }
    return fen
  }

  private decimalYuanToFen(amount: Prisma.Decimal) {
    const fen = amount.mul(100).toNumber()
    if (!Number.isInteger(fen) || fen < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid withdraw amount', 400)
    }
    return fen
  }

  private decimalToNumber(value: Prisma.Decimal | number | string | null | undefined) {
    if (value === null || value === undefined) return 0
    if (value instanceof Prisma.Decimal) return value.toNumber()
    return Number(value)
  }

  private parseDate(value: string | undefined, field: string) {
    if (!value) return undefined
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, `invalid ${field}`, 400)
    }
    return date
  }

  private normalizePositiveInt(value: unknown, fallback: number, max?: number) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) return fallback
    return max ? Math.min(parsed, max) : parsed
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date)
    next.setDate(next.getDate() + days)
    return next
  }

  private isWechatTransferSuccess(state: string) {
    return ['SUCCESS', 'TRANSFER_SUCCESS', 'PAID'].includes(state)
  }

  private isWechatTransferFailed(state: string) {
    return ['FAIL', 'FAILED', 'TRANSFER_FAIL', 'CANCELLED', 'CLOSED'].includes(state)
  }

  private isWechatTransferWaitUser(state: string) {
    return ['WAIT_USER_CONFIRM', 'ACCEPTED'].includes(state)
  }

  private createWithdrawNo() {
    const now = new Date()
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('')
    const time = [
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('')
    const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0')
    return `WD${date}${time}${random}`
  }
}
