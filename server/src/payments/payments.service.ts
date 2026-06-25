import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { ORDER_ACTION } from '../orders/constants/order-action'
import { ORDER_STATUS } from '../orders/constants/order-status'
import type { AutoAssignSystemResult } from '../orders/orders.service'
import { OrdersService } from '../orders/orders.service'
import { OrderTransitionService } from '../orders/order-transition.service'
import { OrdersRepository } from '../orders/orders.repository'
import { presentOrderDetail } from '../orders/order-presenter'
import { PAYMENT_CHANNEL, PaymentChannel } from './constants/payment-channel'
import { PAYMENT_STATUS } from './constants/payment-status'
import { PaymentsRepository } from './payments.repository'
import { WechatPayClient } from './wechat-pay.client'
import { WechatPayConfig } from './wechat-pay.config'
import type { WechatNotifyHeaders, WechatTransactionNotify } from './wechat-pay.types'

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PaymentsRepository) private readonly repository: PaymentsRepository,
    @Inject(OrdersRepository) private readonly ordersRepository: OrdersRepository,
    @Inject(OrdersService) private readonly ordersService: OrdersService,
    @Inject(OrderTransitionService) private readonly transitions: OrderTransitionService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(WechatPayConfig) private readonly payConfig: WechatPayConfig,
    @Inject(WechatPayClient) private readonly wechatPay: WechatPayClient,
  ) {}

  async createPayment(userId: number, orderId: number, requestId?: string) {
    if (this.config.get<string>('PAYMENT_PROVIDER', 'wechat') === PAYMENT_CHANNEL.MOCK) {
      return this.createMockPayment(userId, orderId, requestId)
    }
    return this.createWechatPayment(userId, orderId, requestId)
  }

  async createMockPayment(userId: number, orderId: number, requestId?: string) {
    const order = await this.repository.findOrderForPayment(orderId)
    if (!order) {
      throw new BusinessException(ErrorCode.ORDER_NOT_FOUND, 'order not found', 404)
    }
    if (Number(order.userId) !== userId) {
      throw new BusinessException(ErrorCode.ORDER_FORBIDDEN, 'order forbidden', 403)
    }
    if (order.status !== ORDER_STATUS.PENDING_PAYMENT) {
      if (order.status === ORDER_STATUS.PENDING_DISPATCH || order.paidAt) {
        const payment = await this.repository.findLatestPaymentByChannel(orderId, userId, PAYMENT_CHANNEL.MOCK)
        return this.presentMockPaymentResult(payment?.paymentNo || '', order.payableAmount.toNumber(), 'already_paid')
      }
      throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order is not payable', 409)
    }

    const payment = await this.repository.client.payment.create({
      data: {
        paymentNo: this.createPaymentNo(),
        orderId: BigInt(orderId),
        userId: BigInt(userId),
        channel: PAYMENT_CHANNEL.MOCK,
        amount: order.payableAmount,
        status: PAYMENT_STATUS.PENDING,
        callbackRaw: JSON.stringify({ channel: PAYMENT_CHANNEL.MOCK, requestId }),
      },
    })

    const transactionNo = `MOCK${Date.now()}`
    const paymentWithOrder = await this.repository.findPaymentByNo(payment.paymentNo)
    if (!paymentWithOrder) {
      throw new BusinessException(ErrorCode.PAYMENT_NOT_FOUND, 'payment not found', 404)
    }
    await this.markPaymentSuccess(paymentWithOrder, transactionNo, JSON.stringify({ channel: PAYMENT_CHANNEL.MOCK, requestId }), PAYMENT_CHANNEL.MOCK, requestId)
    const autoAssign = await this.tryAutoAssignAfterPayment(payment.id, payment.paymentNo, payment.orderId, requestId, PAYMENT_CHANNEL.MOCK)
    const updatedOrder = await this.ordersRepository.findOrderDetail(Number(payment.orderId))

    return {
      ...this.presentMockPaymentResult(payment.paymentNo, payment.amount.toNumber(), PAYMENT_STATUS.SUCCESS),
      autoAssign,
      order: updatedOrder ? presentOrderDetail(updatedOrder) : null,
    }
  }

  async createWechatPayment(userId: number, orderId: number, requestId?: string) {
    const config = this.payConfig.getWechatConfig()
    const order = await this.repository.findOrderForPayment(orderId)
    if (!order) {
      throw new BusinessException(ErrorCode.ORDER_NOT_FOUND, 'order not found', 404)
    }
    if (Number(order.userId) !== userId) {
      throw new BusinessException(ErrorCode.ORDER_FORBIDDEN, 'order forbidden', 403)
    }
    if (!order.user.openid) {
      throw new BusinessException(ErrorCode.AUTH_WECHAT_FAIL, 'user openid is required for wechat pay', 400)
    }
    if (order.status !== ORDER_STATUS.PENDING_PAYMENT) {
      if (order.status === ORDER_STATUS.PENDING_DISPATCH || order.paidAt) {
        const payment = await this.repository.findLatestPaymentByChannel(orderId, userId, PAYMENT_CHANNEL.WECHAT)
        return this.presentWechatPayOrderResult(payment?.paymentNo || '', order.payableAmount.toNumber(), 'already_paid')
      }
      throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order is not payable', 409)
    }

    const existing = await this.repository.findLatestPaymentByChannel(orderId, userId, PAYMENT_CHANNEL.WECHAT)
    if (existing && existing.status === PAYMENT_STATUS.PENDING && existing.prepayId) {
      return this.presentWechatPayOrderResult(existing.paymentNo, existing.amount.toNumber(), existing.status, existing.prepayId)
    }
    if (existing && existing.status === PAYMENT_STATUS.SUCCESS) {
      return this.presentWechatPayOrderResult(existing.paymentNo, existing.amount.toNumber(), existing.status)
    }

    const payment = await this.repository.client.payment.create({
      data: {
        paymentNo: this.createPaymentNo(),
        orderId: BigInt(orderId),
        userId: BigInt(userId),
        channel: PAYMENT_CHANNEL.WECHAT,
        amount: order.payableAmount,
        status: PAYMENT_STATUS.PENDING,
        callbackRaw: requestId ? JSON.stringify({ requestId }) : null,
      },
    })

    const amountFen = this.decimalYuanToFen(order.payableAmount)
    const result = await this.wechatPay.createJsapiOrder({
      paymentNo: payment.paymentNo,
      description: order.service.name || `生活助手订单${order.orderNo}`,
      amountFen,
      openid: order.user.openid,
    })

    await this.repository.client.payment.update({
      where: { id: payment.id },
      data: { prepayId: result.prepay_id },
    })

    return this.presentWechatPayOrderResult(payment.paymentNo, payment.amount.toNumber(), payment.status, result.prepay_id, config.appid)
  }

  async handleWechatNotify(rawBody: string, headers: WechatNotifyHeaders, requestId?: string) {
    const notify = this.wechatPay.parseNotify(rawBody, headers)
    const transaction = notify.transaction
    const paymentNo = transaction.out_trade_no
    if (!paymentNo) {
      throw new BusinessException(ErrorCode.PAYMENT_NOT_FOUND, 'wechat out_trade_no missing', 400)
    }

    const payment = await this.repository.findPaymentByNo(paymentNo)
    if (!payment) {
      await this.repository.client.paymentNotifyLog.create({
        data: {
          paymentNo,
          channel: PAYMENT_CHANNEL.WECHAT,
          rawBody,
          processResult: 'not_found',
        },
      })
      throw new BusinessException(ErrorCode.PAYMENT_NOT_FOUND, 'payment not found', 404)
    }

    const config = this.payConfig.getWechatConfig()
    if (transaction.appid !== config.appid || transaction.mchid !== config.mchId) {
      await this.writeNotifyLog(payment.id, payment.paymentNo, 'merchant_mismatch', PAYMENT_CHANNEL.WECHAT, rawBody)
      throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'wechat merchant mismatch', 400)
    }

    if (transaction.trade_state !== 'SUCCESS') {
      await this.writeNotifyLog(payment.id, payment.paymentNo, `trade_${transaction.trade_state || 'unknown'}`, PAYMENT_CHANNEL.WECHAT, rawBody)
      return {
        paymentNo: payment.paymentNo,
        status: payment.status,
        tradeState: transaction.trade_state,
      }
    }

    this.assertWechatAmount(payment.amount, transaction)

    if (payment.status === PAYMENT_STATUS.SUCCESS) {
      await this.writeNotifyLog(payment.id, payment.paymentNo, 'duplicate_success', PAYMENT_CHANNEL.WECHAT, rawBody)
      const autoAssign = await this.tryAutoAssignAfterPayment(payment.id, payment.paymentNo, payment.orderId, requestId)
      const order = await this.ordersRepository.findOrderDetail(Number(payment.orderId))
      return {
        paymentNo: payment.paymentNo,
        status: payment.status,
        autoAssign,
        order: order ? presentOrderDetail(order) : null,
      }
    }

    if (payment.status !== PAYMENT_STATUS.PENDING) {
      await this.writeNotifyLog(payment.id, payment.paymentNo, 'status_conflict', PAYMENT_CHANNEL.WECHAT, rawBody)
      return {
        paymentNo: payment.paymentNo,
        status: payment.status,
      }
    }

    const transactionNo = transaction.transaction_id || ''
    try {
      await this.markPaymentSuccess(payment, transactionNo, rawBody, PAYMENT_CHANNEL.WECHAT, requestId)
    }
    catch (error) {
      if (error instanceof BusinessException && error.code === ErrorCode.ORDER_STATUS_INVALID) {
        const latestPayment = await this.repository.findPaymentByNo(payment.paymentNo)
        const latestOrder = await this.ordersRepository.findOrderDetail(Number(payment.orderId))
        if (latestPayment?.status === PAYMENT_STATUS.SUCCESS && latestOrder) {
          await this.writeNotifyLog(payment.id, payment.paymentNo, 'duplicate', PAYMENT_CHANNEL.WECHAT, rawBody)
          const autoAssign = await this.tryAutoAssignAfterPayment(payment.id, payment.paymentNo, payment.orderId, requestId)
          const latestAssignedOrder = await this.ordersRepository.findOrderDetail(Number(payment.orderId))
          return {
            paymentNo: payment.paymentNo,
            status: PAYMENT_STATUS.SUCCESS,
            autoAssign,
            order: latestAssignedOrder ? presentOrderDetail(latestAssignedOrder) : presentOrderDetail(latestOrder),
          }
        }
        if (latestOrder?.status === ORDER_STATUS.CANCELLED) {
          await this.recordAbnormalPaymentSuccess(payment.id, payment.paymentNo, transactionNo, requestId, 'abnormal_cancel', PAYMENT_CHANNEL.WECHAT, rawBody)
          return {
            paymentNo: payment.paymentNo,
            status: PAYMENT_STATUS.SUCCESS,
            abnormal: 'cancelled_order',
          }
        }
        await this.writeNotifyLog(payment.id, payment.paymentNo, 'status_conflict', PAYMENT_CHANNEL.WECHAT, rawBody)
      }
      throw error
    }

    const autoAssign = await this.tryAutoAssignAfterPayment(payment.id, payment.paymentNo, payment.orderId, requestId)
    const order = await this.ordersRepository.findOrderDetail(Number(payment.orderId))
    return {
      paymentNo: payment.paymentNo,
      status: PAYMENT_STATUS.SUCCESS,
      autoAssign,
      order: order ? presentOrderDetail(order) : null,
    }
  }

  private async tryAutoAssignAfterPayment(
    paymentId: bigint,
    paymentNo: string,
    orderId: bigint,
    requestId?: string,
    channel: PaymentChannel = PAYMENT_CHANNEL.WECHAT,
  ): Promise<AutoAssignSystemResult | null> {
    try {
      return await this.ordersService.autoAssignOrderBySystem(Number(orderId), {
        requestId,
        source: 'payment_success',
        remark: 'auto assign after payment success',
      })
    }
    catch {
      try {
        await this.writeNotifyLog(paymentId, paymentNo, 'auto_assign_fail', channel)
      }
      catch {
        // Payment success must remain authoritative even if dispatch failure logging fails.
      }
      return null
    }
  }

  private async writeNotifyLog(paymentId: bigint, paymentNo: string, result: string, channel: PaymentChannel, rawBody?: string) {
    await this.repository.client.paymentNotifyLog.create({
      data: {
        paymentId,
        paymentNo,
        channel,
        rawBody: rawBody || JSON.stringify({ paymentNo }),
        processResult: result.slice(0, 16),
      },
    })
  }

  private async recordAbnormalPaymentSuccess(
    paymentId: bigint,
    paymentNo: string,
    transactionNo: string,
    requestId: string | undefined,
    result: string,
    channel: PaymentChannel,
    rawBody?: string,
  ) {
    await this.repository.client.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: {
          id: paymentId,
          status: PAYMENT_STATUS.PENDING,
        },
        data: {
          status: PAYMENT_STATUS.SUCCESS,
          transactionNo,
          paidAt: new Date(),
          callbackRaw: JSON.stringify({ channel, requestId, abnormal: result }),
        },
      })
      await tx.paymentNotifyLog.create({
        data: {
          paymentId,
          paymentNo,
          channel,
          rawBody: rawBody || JSON.stringify({ paymentNo, requestId }),
          processResult: result.slice(0, 16),
        },
      })
    })
  }

  private async markPaymentSuccess(
    payment: NonNullable<Awaited<ReturnType<PaymentsRepository['findPaymentByNo']>>>,
    transactionNo: string,
    rawBody: string,
    channel: string,
    requestId?: string,
  ) {
    await this.transitions.transition({
      orderId: payment.orderId,
      action: ORDER_ACTION.PAY_SUCCESS,
      operatorType: 'system',
      operatorId: BigInt(0),
      requestId,
      detail: { paymentNo: payment.paymentNo, transactionNo },
      orderData: {
        paidAt: new Date(),
        paidAmount: payment.amount,
      },
      check: (order) => {
        if (order.userId !== payment.userId) {
          throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'payment user mismatch', 409)
        }
        if (!new Prisma.Decimal(order.payableAmount).equals(payment.amount)) {
          throw new BusinessException(ErrorCode.ORDER_PRICE_CHANGED, 'payment amount mismatch', 409)
        }
      },
      sideEffect: async (tx, order, now) => {
        const updated = await tx.payment.updateMany({
          where: {
            id: payment.id,
            status: PAYMENT_STATUS.PENDING,
          },
          data: {
            status: PAYMENT_STATUS.SUCCESS,
            transactionNo,
            paidAt: now,
            callbackRaw: rawBody,
          },
        })
        if (updated.count !== 1) {
          throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'payment status changed', 409)
        }
        await tx.paymentNotifyLog.create({
          data: {
            paymentId: payment.id,
            paymentNo: payment.paymentNo,
            channel,
            rawBody: JSON.stringify({ paymentNo: payment.paymentNo, orderId: Number(order.id), requestId }),
            processResult: 'success',
          },
        })
      },
    })
  }

  private presentWechatPayOrderResult(paymentNo: string, amount: number, status: string, prepayId?: string, appid?: string) {
    return {
      paymentNo,
      amount,
      provider: PAYMENT_CHANNEL.WECHAT,
      status,
      paymentParams: prepayId
        ? {
            appid,
            channel: PAYMENT_CHANNEL.WECHAT,
            ...this.wechatPay.buildMiniProgramPaymentParams(prepayId),
          }
        : undefined,
    }
  }

  private presentMockPaymentResult(paymentNo: string, amount: number, status: string) {
    return {
      paymentNo,
      amount,
      provider: PAYMENT_CHANNEL.MOCK,
      status,
      paymentParams: {
        channel: PAYMENT_CHANNEL.MOCK,
        mock: true,
      },
    }
  }

  private assertWechatAmount(amount: Prisma.Decimal, transaction: WechatTransactionNotify) {
    const actual = transaction.amount?.total
    const expected = this.decimalYuanToFen(amount)
    if (actual !== expected) {
      throw new BusinessException(ErrorCode.ORDER_PRICE_CHANGED, 'wechat payment amount mismatch', 409)
    }
  }

  private decimalYuanToFen(amount: Prisma.Decimal) {
    const fenDecimal = new Prisma.Decimal(amount).mul(100)
    const fen = fenDecimal.toNumber()
    if (!Number.isInteger(fen) || fen < 1) {
      throw new BusinessException(ErrorCode.ORDER_PRICE_CHANGED, 'invalid payment amount', 409)
    }
    return fen
  }

  private createPaymentNo() {
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
    return `PM${date}${time}${random}`
  }
}
