import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { ORDER_ACTION } from '../orders/constants/order-action'
import { ORDER_STATUS } from '../orders/constants/order-status'
import { OrderTransitionService } from '../orders/order-transition.service'
import { OrdersRepository } from '../orders/orders.repository'
import { presentOrderDetail } from '../orders/order-presenter'
import { PAYMENT_CHANNEL } from './constants/payment-channel'
import { PAYMENT_STATUS } from './constants/payment-status'
import type { MockSuccessDto } from './dto/mock-success.dto'
import { PaymentsRepository } from './payments.repository'

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PaymentsRepository) private readonly repository: PaymentsRepository,
    @Inject(OrdersRepository) private readonly ordersRepository: OrdersRepository,
    @Inject(OrderTransitionService) private readonly transitions: OrderTransitionService,
  ) {}

  async createMockPayment(userId: number, orderId: number, requestId?: string) {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new BusinessException(ErrorCode.PAYMENT_MOCK_DISABLED, 'mock payment disabled', 403)
    }

    const order = await this.ordersRepository.findOrderDetail(orderId)
    if (!order) {
      throw new BusinessException(ErrorCode.ORDER_NOT_FOUND, 'order not found', 404)
    }
    if (Number(order.userId) !== userId) {
      throw new BusinessException(ErrorCode.ORDER_FORBIDDEN, 'order forbidden', 403)
    }
    if (order.status !== ORDER_STATUS.PENDING_PAYMENT) {
      if (order.status === ORDER_STATUS.PENDING_DISPATCH || order.paidAt) {
        const payment = await this.repository.findLatestMockPayment(orderId, userId)
        return this.presentPayOrderResult(payment?.paymentNo || '', order.payableAmount.toNumber(), 'already_paid')
      }
      throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order is not payable', 409)
    }

    const existing = await this.repository.findLatestMockPayment(orderId, userId)
    if (existing && existing.status !== PAYMENT_STATUS.FAILED && existing.status !== PAYMENT_STATUS.CLOSED) {
      return this.presentPayOrderResult(existing.paymentNo, existing.amount.toNumber(), existing.status)
    }

    const payment = await this.repository.client.payment.create({
      data: {
        paymentNo: this.createPaymentNo(),
        orderId: BigInt(orderId),
        userId: BigInt(userId),
        channel: PAYMENT_CHANNEL.MOCK,
        amount: order.payableAmount,
        status: PAYMENT_STATUS.PENDING,
        callbackRaw: requestId ? JSON.stringify({ requestId }) : null,
      },
    })

    return this.presentPayOrderResult(payment.paymentNo, payment.amount.toNumber(), payment.status)
  }

  async mockSuccess(dto: MockSuccessDto, requestId?: string) {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new BusinessException(ErrorCode.PAYMENT_MOCK_DISABLED, 'mock payment disabled', 403)
    }

    const payment = dto.paymentNo
      ? await this.repository.findPaymentByNo(dto.paymentNo)
      : dto.orderId
        ? await this.repository.findLatestOrderPayment(dto.orderId)
        : null

    if (!payment) {
      throw new BusinessException(ErrorCode.PAYMENT_NOT_FOUND, 'payment not found', 404)
    }

    if (payment.status === PAYMENT_STATUS.SUCCESS) {
      await this.writeNotifyLog(payment.id, payment.paymentNo, 'duplicate_success')
      const order = await this.ordersRepository.findOrderDetail(Number(payment.orderId))
      return {
        paymentNo: payment.paymentNo,
        status: payment.status,
        order: order ? presentOrderDetail(order) : null,
      }
    }

    if (payment.status !== PAYMENT_STATUS.PENDING) {
      throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'payment is not pending', 409)
    }

    const transactionNo = `MOCK${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`
    try {
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
              callbackRaw: JSON.stringify({ channel: PAYMENT_CHANNEL.MOCK, requestId }),
            },
          })
          if (updated.count !== 1) {
            throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'payment status changed', 409)
          }
          await tx.paymentNotifyLog.create({
            data: {
              paymentId: payment.id,
              paymentNo: payment.paymentNo,
              channel: PAYMENT_CHANNEL.MOCK,
              rawBody: JSON.stringify({ paymentNo: payment.paymentNo, orderId: Number(order.id), requestId }),
              processResult: 'success',
            },
          })
        },
      })
    }
    catch (error) {
      if (error instanceof BusinessException && error.code === ErrorCode.ORDER_STATUS_INVALID) {
        const latestPayment = await this.repository.findPaymentByNo(payment.paymentNo)
        const latestOrder = await this.ordersRepository.findOrderDetail(Number(payment.orderId))
        if (latestPayment?.status === PAYMENT_STATUS.SUCCESS && latestOrder) {
          await this.writeNotifyLog(payment.id, payment.paymentNo, 'duplicate')
          return {
            paymentNo: payment.paymentNo,
            status: PAYMENT_STATUS.SUCCESS,
            order: presentOrderDetail(latestOrder),
          }
        }
        if (latestOrder?.status === ORDER_STATUS.CANCELLED) {
          await this.recordAbnormalPaymentSuccess(payment.id, payment.paymentNo, transactionNo, requestId, 'abnormal_cancel')
        }
        else {
          await this.writeNotifyLog(payment.id, payment.paymentNo, 'status_conflict')
        }
      }
      throw error
    }

    const order = await this.ordersRepository.findOrderDetail(Number(payment.orderId))
    return {
      paymentNo: payment.paymentNo,
      status: PAYMENT_STATUS.SUCCESS,
      order: order ? presentOrderDetail(order) : null,
    }
  }

  private async writeNotifyLog(paymentId: bigint, paymentNo: string, result: string) {
    await this.repository.client.paymentNotifyLog.create({
      data: {
        paymentId,
        paymentNo,
        channel: PAYMENT_CHANNEL.MOCK,
        rawBody: JSON.stringify({ paymentNo }),
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
          callbackRaw: JSON.stringify({ channel: PAYMENT_CHANNEL.MOCK, requestId, abnormal: result }),
        },
      })
      await tx.paymentNotifyLog.create({
        data: {
          paymentId,
          paymentNo,
          channel: PAYMENT_CHANNEL.MOCK,
          rawBody: JSON.stringify({ paymentNo, requestId }),
          processResult: result.slice(0, 16),
        },
      })
    })
  }

  private presentPayOrderResult(paymentNo: string, amount: number, status: string) {
    return {
      paymentNo,
      status,
      paymentParams: {
        channel: PAYMENT_CHANNEL.MOCK,
        paymentNo,
        amount,
        mockSuccessPath: '/api/payments/mock-success',
      },
    }
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
