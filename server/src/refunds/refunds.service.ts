import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Order, Prisma, Refund } from '@prisma/client'
import { AdminAuditService } from '../audit-log/admin-audit.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { CouponsService } from '../coupons/coupons.service'
import { MemberCardsService } from '../member-cards/member-cards.service'
import { ORDER_ACTION } from '../orders/constants/order-action'
import { ORDER_STATUS } from '../orders/constants/order-status'
import { ORDER_TYPE } from '../orders/constants/order-type'
import { PAYMENT_CHANNEL, PaymentChannel } from '../payments/constants/payment-channel'
import { PAYMENT_STATUS } from '../payments/constants/payment-status'
import { WechatPayClient } from '../payments/wechat-pay.client'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'
import { CreateRefundRequestDto } from './dto/create-refund-request.dto'
import { RejectRefundDto, ReviewRefundDto } from './dto/review-refund.dto'
import { REFUND_STATUS } from './constants/refund-status'

interface AdminWriteContext {
  adminId: number
  requestId?: string
  ip?: string
}

interface CreateRefundForOrderOptions {
  tx: Prisma.TransactionClient
  order: Pick<Order, 'id' | 'userId' | 'orderType' | 'status' | 'memberCardId' | 'payableAmount' | 'paidAmount' | 'paidAt'>
  reason: string
  source?: string
  operatedBy?: bigint
}

type RefundWithRelations = Prisma.RefundGetPayload<{
  include: {
    order: { include: { user: true } }
    payment: true
  }
}>

@Injectable()
export class RefundsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
    @Inject(WechatPayClient) private readonly wechatPay: WechatPayClient,
    @Inject(MemberCardsService) private readonly memberCards: MemberCardsService,
    @Inject(CouponsService) private readonly coupons: CouponsService,
    @Inject(UsersService) private readonly users: UsersService,
  ) {}

  async createUserRefundRequest(userId: number, orderId: number, dto: CreateRefundRequestDto, requestId?: string) {
    const reason = dto.reason || 'user request refund'
    const refund = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${BigInt(orderId)} FOR UPDATE`
      const order = await tx.order.findUnique({ where: { id: BigInt(orderId) } })
      if (!order) {
        throw new BusinessException(ErrorCode.ORDER_NOT_FOUND, 'order not found', 404)
      }
      if (order.userId !== BigInt(userId)) {
        throw new BusinessException(ErrorCode.ORDER_FORBIDDEN, 'order forbidden', 403)
      }
      if (order.status === ORDER_STATUS.REFUND_PENDING || order.status === ORDER_STATUS.REFUNDED) {
        return this.findActiveRefundForOrder(tx, order.id)
      }
      if (order.status !== ORDER_STATUS.PENDING_DISPATCH) {
        throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order cannot request refund here', 409)
      }
      this.assertRefundablePaidBooking(order)

      const created = await this.createRefundRequestForOrder({
        tx,
        order,
        reason,
        source: dto.source || 'user_request',
        operatedBy: BigInt(userId),
      })

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: ORDER_STATUS.REFUND_PENDING,
          version: { increment: 1 },
          cancelledAt: new Date(),
          cancelReason: reason,
        },
      })
      await tx.orderStatusLog.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: ORDER_STATUS.REFUND_PENDING,
          operatorType: 'user',
          operatorId: BigInt(userId),
          action: ORDER_ACTION.USER_REQUEST_REFUND,
          requestId,
          remark: reason,
          detail: { refundNo: created.refundNo, source: dto.source || 'user_request' },
        },
      })

      return created
    })

    if (!refund) {
      throw new BusinessException(ErrorCode.PAYMENT_NOT_FOUND, 'refund not found', 404)
    }
    return this.presentRefund(refund)
  }

  async listUserOrderRefunds(userId: number, orderId: number) {
    const order = await this.prisma.order.findUnique({ where: { id: BigInt(orderId) } })
    if (!order) {
      throw new BusinessException(ErrorCode.ORDER_NOT_FOUND, 'order not found', 404)
    }
    if (order.userId !== BigInt(userId)) {
      throw new BusinessException(ErrorCode.ORDER_FORBIDDEN, 'order forbidden', 403)
    }
    const refunds = await this.prisma.refund.findMany({
      where: { orderId: BigInt(orderId) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    return refunds.map(refund => this.presentRefund(refund))
  }

  async listAdminRefunds(query: { page?: number, pageSize?: number, status?: string, keyword?: string }) {
    const page = this.normalizePositiveInt(query.page, 1)
    const pageSize = this.normalizePositiveInt(query.pageSize, 20, 100)
    const where: Prisma.RefundWhereInput = {}
    if (query.status && query.status !== 'all') {
      where.status = query.status
    }
    if (query.keyword) {
      where.OR = [
        { refundNo: { contains: query.keyword } },
        { channelRefundNo: { contains: query.keyword } },
        { payment: { paymentNo: { contains: query.keyword } } },
        { order: { orderNo: { contains: query.keyword } } },
        { order: { user: { phone: { contains: query.keyword } } } },
      ]
    }
    const [total, refunds] = await this.prisma.$transaction([
      this.prisma.refund.count({ where }),
      this.prisma.refund.findMany({
        where,
        include: { order: { include: { user: true } }, payment: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    return { items: refunds.map(refund => this.presentAdminRefund(refund)), page, pageSize, total }
  }

  async getAdminRefund(id: number) {
    const refund = await this.prisma.refund.findUnique({
      where: { id: BigInt(id) },
      include: { order: { include: { user: true } }, payment: true },
    })
    if (!refund) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'refund not found', 404)
    }
    return this.presentAdminRefund(refund)
  }

  async createRefundRequestForOrder(options: CreateRefundForOrderOptions) {
    const { tx, order, reason } = options
    const existing = await this.findActiveRefundForOrder(tx, order.id)
    if (existing) return existing

    const payment = await tx.payment.findFirst({
      where: {
        orderId: order.id,
        status: PAYMENT_STATUS.SUCCESS,
      },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    })
    if (!payment) {
      throw new BusinessException(ErrorCode.PAYMENT_NOT_FOUND, 'paid payment not found', 404)
    }

    const refundNo = this.createRefundNo()
    const refundChannel = this.resolveRefundChannel(payment.channel)
    return tx.refund.create({
      data: {
        refundNo,
        orderId: order.id,
        paymentId: payment.id,
        amount: payment.amount,
        reason,
        status: REFUND_STATUS.PENDING,
        channel: refundChannel,
        outRefundNo: refundNo,
        operatedBy: options.operatedBy || BigInt(0),
      },
    })
  }

  async approveRefund(id: number, dto: ReviewRefundDto, context: AdminWriteContext) {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.findRefundForUpdate(tx, BigInt(id))
      if (current.status === REFUND_STATUS.REFUNDED) return
      if (current.status !== REFUND_STATUS.PENDING) {
        throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'refund is not pending review', 409)
      }
      await this.assertRefundExecutionAllowed(tx, current)
      const now = new Date()
      await tx.refund.update({
        where: { id: current.id },
        data: {
          status: REFUND_STATUS.APPROVED,
          reviewedBy: BigInt(context.adminId),
          reviewedAt: now,
          operatedBy: BigInt(context.adminId),
          failureReason: null,
        },
      })
      await this.writeRefundOrderLog(tx, current.order, ORDER_ACTION.ADMIN_REFUND_APPROVE, context.adminId, context.requestId, dto.remark || 'refund approved', {
        refundNo: current.refundNo,
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'refund:approve',
        module: 'finance',
        targetType: 'refund',
        targetId: current.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: REFUND_STATUS.APPROVED, remark: dto.remark || '' },
      })
    })

    return this.executeRefund(id, { requestId: context.requestId })
  }

  async rejectRefund(id: number, dto: RejectRefundDto, context: AdminWriteContext) {
    const nextOrderStatus = dto.nextOrderStatus || ORDER_STATUS.AFTER_SALES
    const refund = await this.prisma.$transaction(async (tx) => {
      const current = await this.findRefundForUpdate(tx, BigInt(id))
      if (current.status === REFUND_STATUS.REJECTED) return current
      if (current.status !== REFUND_STATUS.PENDING) {
        throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'refund is not pending review', 409)
      }

      const now = new Date()
      const updated = await tx.refund.update({
        where: { id: current.id },
        data: {
          status: REFUND_STATUS.REJECTED,
          reviewedBy: BigInt(context.adminId),
          reviewedAt: now,
          operatedBy: BigInt(context.adminId),
          failureReason: dto.remark || 'refund rejected',
        },
      })

      if (current.order.status === ORDER_STATUS.REFUND_PENDING) {
        await tx.order.update({
          where: { id: current.order.id },
          data: {
            status: nextOrderStatus,
            version: { increment: 1 },
            ...(nextOrderStatus === ORDER_STATUS.PENDING_DISPATCH
              ? { cancelledAt: null, cancelReason: null }
              : {}),
          },
        })
        await tx.orderStatusLog.create({
          data: {
            orderId: current.order.id,
            fromStatus: current.order.status,
            toStatus: nextOrderStatus,
            operatorType: 'admin',
            operatorId: BigInt(context.adminId),
            action: ORDER_ACTION.ADMIN_REFUND_REJECT,
            requestId: context.requestId,
            remark: dto.remark || 'refund rejected',
            detail: { refundNo: current.refundNo, nextOrderStatus },
          },
        })
      }

      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'refund:reject',
        module: 'finance',
        targetType: 'refund',
        targetId: current.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: REFUND_STATUS.REJECTED, remark: dto.remark || '', nextOrderStatus },
      })
      return updated
    })

    return this.presentRefund(refund)
  }

  async retryRefund(id: number, dto: ReviewRefundDto, context: AdminWriteContext) {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.findRefundForUpdate(tx, BigInt(id))
      if (current.status === REFUND_STATUS.REFUNDED) return
      if (![REFUND_STATUS.FAILED, REFUND_STATUS.APPROVED].includes(current.status as any)) {
        throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'refund cannot be retried', 409)
      }
      await this.assertRefundExecutionAllowed(tx, current)
      await tx.refund.update({
        where: { id: current.id },
        data: {
          status: REFUND_STATUS.APPROVED,
          retryCount: { increment: 1 },
          operatedBy: BigInt(context.adminId),
          failureReason: null,
        },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'refund:retry',
        module: 'finance',
        targetType: 'refund',
        targetId: current.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: REFUND_STATUS.APPROVED, remark: dto.remark || '' },
      })
    })
    return this.executeRefund(id, { requestId: context.requestId })
  }

  async executeRefund(id: number, options?: { requestId?: string }) {
    const started = await this.prisma.$transaction(async (tx) => {
      const current = await this.findRefundForUpdate(tx, BigInt(id))
      if (current.status === REFUND_STATUS.REFUNDED) return { refund: current, shouldCallChannel: false }
      if (current.status === REFUND_STATUS.PROCESSING) return { refund: current, shouldCallChannel: false }
      if (![REFUND_STATUS.APPROVED, REFUND_STATUS.FAILED].includes(current.status as any)) {
        throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'refund is not executable', 409)
      }
      await this.assertRefundExecutionAllowed(tx, current)
      const channel = this.resolveRefundChannel(current.channel || current.payment.channel)
      const outRefundNo = current.outRefundNo || current.refundNo
      const updated = await tx.refund.update({
        where: { id: current.id },
        data: {
          status: REFUND_STATUS.PROCESSING,
          channel,
          outRefundNo,
          processedAt: new Date(),
          failureReason: null,
        },
        include: { order: { include: { user: true } }, payment: true },
      })
      await this.writeRefundOrderLog(tx, current.order, ORDER_ACTION.REFUND_PROCESSING, 0, options?.requestId, 'refund processing', {
        refundNo: current.refundNo,
        channel,
      })
      return { refund: updated, shouldCallChannel: true }
    })

    const refund = started.refund
    if (!started.shouldCallChannel || refund.status === REFUND_STATUS.REFUNDED) {
      return this.presentAdminRefund(refund)
    }
    if (refund.status === REFUND_STATUS.PROCESSING && refund.channel !== PAYMENT_CHANNEL.MOCK && refund.channel !== PAYMENT_CHANNEL.WECHAT) {
      return this.handleRefundFailed(refund.refundNo, `unsupported refund channel: ${refund.channel}`, undefined, options?.requestId)
    }

    try {
      if (refund.channel === PAYMENT_CHANNEL.MOCK) {
        return this.handleRefundSuccess(refund.refundNo, `MOCK${refund.refundNo}`, JSON.stringify({ channel: PAYMENT_CHANNEL.MOCK }), options?.requestId)
      }

      const response = await this.wechatPay.createRefund({
        paymentNo: refund.payment.paymentNo,
        refundNo: refund.outRefundNo || refund.refundNo,
        reason: refund.reason || undefined,
        amountFen: this.decimalYuanToFen(refund.amount),
        totalFen: this.decimalYuanToFen(refund.payment.amount),
      })

      if (response.status === 'SUCCESS') {
        return this.handleRefundSuccess(refund.refundNo, response.refund_id || response.out_refund_no, JSON.stringify(response), options?.requestId)
      }
      if (response.status === 'CLOSED' || response.status === 'ABNORMAL') {
        return this.handleRefundFailed(refund.refundNo, response.status || 'wechat refund failed', JSON.stringify(response), options?.requestId)
      }

      await this.prisma.refund.update({
        where: { id: refund.id },
        data: {
          channelRefundNo: response.refund_id || refund.channelRefundNo,
          notifyRaw: JSON.stringify(response),
        },
      })
      return this.getAdminRefund(Number(refund.id))
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'refund channel failed'
      return this.handleRefundFailed(refund.refundNo, message, JSON.stringify({ message }), options?.requestId)
    }
  }

  async handleWechatRefundNotify(rawBody: string, headers: {
    signature: string
    timestamp: string
    nonce: string
    serial: string
  }, requestId?: string) {
    const notify = this.wechatPay.parseRefundNotify(rawBody, headers)
    const refund = notify.refund
    if (!refund.out_refund_no) {
      throw new BusinessException(ErrorCode.PAYMENT_NOT_FOUND, 'wechat out_refund_no missing', 400)
    }
    if (refund.refund_status === 'SUCCESS') {
      return this.handleRefundSuccess(refund.out_refund_no, refund.refund_id || '', rawBody, requestId)
    }
    if (refund.refund_status === 'CLOSED' || refund.refund_status === 'ABNORMAL') {
      return this.handleRefundFailed(refund.out_refund_no, refund.refund_status, rawBody, requestId)
    }
    await this.prisma.refund.updateMany({
      where: {
        OR: [
          { refundNo: refund.out_refund_no },
          { outRefundNo: refund.out_refund_no },
        ],
        status: { not: REFUND_STATUS.REFUNDED },
      },
      data: {
        status: REFUND_STATUS.PROCESSING,
        channelRefundNo: refund.refund_id || undefined,
        notifyRaw: rawBody,
      },
    })
    return { refundNo: refund.out_refund_no, status: refund.refund_status }
  }

  async handleRefundSuccess(refundNo: string, channelRefundNo?: string, rawNotify?: string, requestId?: string) {
    const refund = await this.prisma.$transaction(async (tx) => {
      const current = await this.findRefundByNoForUpdate(tx, refundNo)
      if (current.status === REFUND_STATUS.REFUNDED) return current
      if (![REFUND_STATUS.PROCESSING, REFUND_STATUS.APPROVED, REFUND_STATUS.FAILED].includes(current.status as any)) {
        throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'refund cannot be marked success', 409)
      }

      if (current.order.orderType === ORDER_TYPE.MEMBER_CARD_PURCHASE) {
        await this.memberCards.revokePurchaseGrantForRefund(tx, current.order, 'system', BigInt(0), 'revoke after refund success')
      }

      const now = new Date()
      const refundedAmount = new Prisma.Decimal(current.payment.refundedAmount).add(current.amount)
      const nextPaymentStatus = refundedAmount.greaterThanOrEqualTo(current.payment.amount)
        ? PAYMENT_STATUS.REFUNDED
        : PAYMENT_STATUS.PARTIAL_REFUNDED

      await tx.payment.update({
        where: { id: current.paymentId },
        data: {
          refundedAmount,
          status: nextPaymentStatus,
        },
      })

      const updated = await tx.refund.update({
        where: { id: current.id },
        data: {
          status: REFUND_STATUS.REFUNDED,
          channelRefundNo: channelRefundNo || current.channelRefundNo,
          notifyRaw: rawNotify || current.notifyRaw,
          processedAt: current.processedAt || now,
          refundedAt: now,
          failureReason: null,
        },
        include: { order: { include: { user: true } }, payment: true },
      })

      if (current.order.status !== ORDER_STATUS.REFUNDED) {
        await tx.order.update({
          where: { id: current.orderId },
          data: {
            status: ORDER_STATUS.REFUNDED,
            version: { increment: 1 },
          },
        })
        await tx.orderStatusLog.create({
          data: {
            orderId: current.orderId,
            fromStatus: current.order.status,
            toStatus: ORDER_STATUS.REFUNDED,
            operatorType: 'system',
            operatorId: BigInt(0),
            action: ORDER_ACTION.REFUND_SUCCESS,
            requestId,
            remark: 'refund success',
            detail: {
              refundNo: current.refundNo,
              channelRefundNo: channelRefundNo || current.channelRefundNo,
            },
          },
        })
      }

      await this.coupons.releaseCouponForRefund(tx, current.orderId)
      await this.users.ensureRefundDeductPointsForOrder(
        tx,
        current.orderId,
        current.amount,
        `退款 ${current.refundNo} 扣回积分`,
      )
      await this.reverseIncomeForRefund(tx, current.orderId, current.refundNo, requestId)

      await tx.paymentNotifyLog.create({
        data: {
          paymentId: current.paymentId,
          paymentNo: current.payment.paymentNo,
          channel: current.channel || current.payment.channel,
          rawBody: rawNotify || JSON.stringify({ refundNo: current.refundNo }),
          processResult: 'refund_success',
        },
      })

      return updated
    })

    return this.getAdminRefund(Number(refund.id))
  }

  private async reverseIncomeForRefund(tx: Prisma.TransactionClient, orderId: bigint, refundNo: string, requestId?: string) {
    const incomes = await tx.staffIncomeRecord.findMany({ where: { orderId } })
    for (const income of incomes) {
      if (income.withdrawStatus === 'none') {
        await tx.staffIncomeRecord.update({
          where: { id: income.id },
          data: {
            status: 'reversed',
            settlementStatus: 'reversed',
          },
        })
        continue
      }

      await tx.orderStatusLog.create({
        data: {
          orderId,
          fromStatus: ORDER_STATUS.REFUNDED,
          toStatus: ORDER_STATUS.REFUNDED,
          operatorType: 'system',
          operatorId: BigInt(0),
          action: 'refund_income_manual_review',
          requestId,
          remark: 'refund success requires manual income review',
          detail: {
            refundNo,
            incomeRecordId: Number(income.id),
            withdrawStatus: income.withdrawStatus,
            settlementStatus: income.settlementStatus,
          },
        },
      })
    }
  }

  async handleRefundFailed(refundNo: string, reason: string, rawNotify?: string, requestId?: string) {
    const refund = await this.prisma.$transaction(async (tx) => {
      const current = await this.findRefundByNoForUpdate(tx, refundNo)
      if (current.status === REFUND_STATUS.REFUNDED) return current
      const updated = await tx.refund.update({
        where: { id: current.id },
        data: {
          status: REFUND_STATUS.FAILED,
          failureReason: reason.slice(0, 512),
          notifyRaw: rawNotify || current.notifyRaw,
          processedAt: current.processedAt || new Date(),
        },
        include: { order: { include: { user: true } }, payment: true },
      })
      await this.writeRefundOrderLog(tx, current.order, ORDER_ACTION.REFUND_FAIL, 0, requestId, reason, {
        refundNo: current.refundNo,
      })
      await tx.paymentNotifyLog.create({
        data: {
          paymentId: current.paymentId,
          paymentNo: current.payment.paymentNo,
          channel: current.channel || current.payment.channel,
          rawBody: rawNotify || JSON.stringify({ refundNo: current.refundNo, reason }),
          processResult: 'refund_failed',
        },
      })
      return updated
    })
    return this.presentAdminRefund(refund)
  }

  private async findActiveRefundForOrder(tx: Prisma.TransactionClient, orderId: bigint) {
    return tx.refund.findFirst({
      where: {
        orderId,
        status: { in: [REFUND_STATUS.PENDING, REFUND_STATUS.APPROVED, REFUND_STATUS.PROCESSING, REFUND_STATUS.REFUNDED, REFUND_STATUS.FAILED] },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
  }

  private async findRefundForUpdate(tx: Prisma.TransactionClient, id: bigint): Promise<RefundWithRelations> {
    await tx.$queryRaw`SELECT id FROM refunds WHERE id = ${id} FOR UPDATE`
    const refund = await tx.refund.findUnique({
      where: { id },
      include: { order: { include: { user: true } }, payment: true },
    })
    if (!refund) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'refund not found', 404)
    }
    return refund
  }

  private async findRefundByNoForUpdate(tx: Prisma.TransactionClient, refundNo: string): Promise<RefundWithRelations> {
    const current = await tx.refund.findFirst({
      where: {
        OR: [
          { refundNo },
          { outRefundNo: refundNo },
        ],
      },
      select: { id: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    if (!current) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'refund not found', 404)
    }
    return this.findRefundForUpdate(tx, current.id)
  }

  private async assertRefundExecutionAllowed(tx: Prisma.TransactionClient, refund: RefundWithRelations) {
    if (refund.payment.status !== PAYMENT_STATUS.SUCCESS && refund.payment.status !== PAYMENT_STATUS.PARTIAL_REFUNDED) {
      throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'payment is not refundable', 409)
    }
    if (refund.order.orderType === ORDER_TYPE.MEMBER_CARD_PURCHASE) {
      await this.assertMemberCardPurchaseRefundable(tx, refund.order)
    }
  }

  private async assertMemberCardPurchaseRefundable(tx: Prisma.TransactionClient, order: RefundWithRelations['order']) {
    const userCard = order.grantedUserMemberCardId
      ? await tx.userMemberCard.findUnique({ where: { id: order.grantedUserMemberCardId }, include: { card: true } })
      : null
    if (!userCard) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card grant not found', 409)
    }
    const records = await tx.memberCardRecord.findMany({
      where: { userMemberCardId: userCard.id },
      select: { recordType: true, units: true },
    })
    const grantUnits = records.find(item => item.recordType === 'grant')?.units || userCard.card.totalUnits || userCard.remainingUnits
    const hasUsage = records.some(item => item.recordType !== 'grant' && item.recordType !== 'refund_revoke')
    if (hasUsage || userCard.frozenUnits > 0 || userCard.remainingUnits !== grantUnits) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card has been used or frozen, refund requires after-sales review', 409)
    }
  }

  private assertRefundablePaidBooking(order: Pick<Order, 'orderType' | 'memberCardId' | 'paidAt' | 'paidAmount' | 'payableAmount'>) {
    if (order.orderType === ORDER_TYPE.MEMBER_CARD_PURCHASE || order.memberCardId) {
      throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order does not use cash refund flow', 409)
    }
    if (!order.paidAt && !order.paidAmount.gt(0) && !order.payableAmount.gt(0)) {
      throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'order is not paid', 409)
    }
  }

  private async writeRefundOrderLog(
    tx: Prisma.TransactionClient,
    order: RefundWithRelations['order'],
    action: string,
    operatorId: number,
    requestId: string | undefined,
    remark: string,
    detail: Record<string, unknown>,
  ) {
    await tx.orderStatusLog.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: order.status,
        operatorType: operatorId > 0 ? 'admin' : 'system',
        operatorId: BigInt(operatorId),
        action,
        requestId,
        remark,
        detail: detail as Prisma.InputJsonObject,
      },
    })
  }

  private resolveRefundChannel(paymentChannel: string): PaymentChannel {
    const provider = this.config.get<string>('REFUND_PROVIDER', '').trim()
    if (provider === PAYMENT_CHANNEL.MOCK || provider === PAYMENT_CHANNEL.WECHAT) return provider
    if (paymentChannel === PAYMENT_CHANNEL.MOCK || paymentChannel === PAYMENT_CHANNEL.WECHAT) return paymentChannel
    return PAYMENT_CHANNEL.MOCK
  }

  private decimalYuanToFen(amount: Prisma.Decimal) {
    const fenDecimal = new Prisma.Decimal(amount).mul(100)
    const fen = fenDecimal.toNumber()
    if (!Number.isInteger(fen) || fen < 1) {
      throw new BusinessException(ErrorCode.ORDER_PRICE_CHANGED, 'invalid refund amount', 409)
    }
    return fen
  }

  private createRefundNo() {
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
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0')
    return `RF${date}${time}${random}`
  }

  private normalizePositiveInt(value: unknown, fallback: number, max = 1000) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) return fallback
    return Math.min(parsed, max)
  }

  private presentRefund(refund: Refund) {
    return {
      id: Number(refund.id),
      refundNo: refund.refundNo,
      orderId: Number(refund.orderId),
      paymentId: Number(refund.paymentId),
      amount: this.decimalToNumber(refund.amount),
      reason: refund.reason || '',
      status: refund.status,
      channel: refund.channel || '',
      outRefundNo: refund.outRefundNo || '',
      channelRefundNo: refund.channelRefundNo || '',
      failureReason: refund.failureReason || '',
      retryCount: refund.retryCount,
      reviewedBy: refund.reviewedBy ? Number(refund.reviewedBy) : null,
      reviewedAt: refund.reviewedAt?.toISOString() || null,
      processedAt: refund.processedAt?.toISOString() || null,
      refundedAt: refund.refundedAt?.toISOString() || null,
      createdAt: refund.createdAt.toISOString(),
      updatedAt: refund.updatedAt.toISOString(),
    }
  }

  private presentAdminRefund(refund: RefundWithRelations) {
    return {
      ...this.presentRefund(refund),
      orderNo: refund.order.orderNo,
      orderStatus: refund.order.status,
      userName: refund.order.user.nickname || '',
      userPhone: refund.order.user.phone || '',
      paymentNo: refund.payment.paymentNo,
      paymentStatus: refund.payment.status,
      paymentChannel: refund.payment.channel,
      paymentAmount: this.decimalToNumber(refund.payment.amount),
      refundedAmount: this.decimalToNumber(refund.payment.refundedAmount),
    }
  }

  private decimalToNumber(value: Prisma.Decimal | number | string | null | undefined) {
    if (value === null || value === undefined) return 0
    if (value instanceof Prisma.Decimal) return value.toNumber()
    return Number(value)
  }
}
