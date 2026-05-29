import { Inject, Injectable } from '@nestjs/common'
import { Order, Prisma } from '@prisma/client'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { PrismaService } from '../prisma/prisma.service'
import { OrderAction } from './constants/order-action'
import { OrderStatus } from './constants/order-status'
import { getOrderTransition, OrderLockMode } from './order-state-machine'

export type OrderOperatorType = 'user' | 'staff' | 'admin' | 'system'

export interface OrderTransitionParams {
  orderId: bigint
  action: OrderAction
  operatorType: OrderOperatorType
  operatorId: bigint
  requestId?: string
  version?: number
  lockMode?: OrderLockMode
  remark?: string
  detail?: Record<string, unknown>
  orderData?: Prisma.OrderUncheckedUpdateInput
  check?: (order: Order) => void | Promise<void>
  sideEffect?: (tx: Prisma.TransactionClient, order: Order, now: Date) => Promise<void>
}

export interface CreateInitialStatusLogParams {
  tx: Prisma.TransactionClient
  orderId: bigint
  operatorType: OrderOperatorType
  operatorId: bigint
  requestId?: string
  remark?: string
  detail?: Record<string, unknown>
}

@Injectable()
export class OrderTransitionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async transition(params: OrderTransitionParams) {
    const rule = getOrderTransition(params.action)
    if (rule.from === null) {
      throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'create_order must create a new order', 409)
    }
    const expectedStatus = rule.from

    const lockMode = params.lockMode || rule.lockMode
    const run = () => this.prisma.$transaction(async (tx) => {
      const now = new Date()
      const order = lockMode === 'pessimistic'
        ? await this.readOrderForUpdate(tx, params.orderId)
        : await tx.order.findUnique({ where: { id: params.orderId } })

      if (!order) {
        throw new BusinessException(ErrorCode.ORDER_NOT_FOUND, 'order not found', 404)
      }

      this.assertExpectedStatus(order.status, expectedStatus)
      if (params.version !== undefined && order.version !== params.version) {
        throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order version changed, refresh and retry', 409)
      }

      if (params.check) {
        await params.check(order)
      }

      if (params.sideEffect) {
        await params.sideEffect(tx, order, now)
      }

      const data: Prisma.OrderUncheckedUpdateInput = {
        ...(params.orderData || {}),
        status: rule.to,
        version: { increment: 1 },
      }

      let updated: Order
      if (lockMode === 'optimistic') {
        const result = await tx.order.updateMany({
          where: {
            id: order.id,
            status: expectedStatus,
            version: order.version,
          },
          data,
        })
        if (result.count !== 1) {
          throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order status changed, refresh and retry', 409)
        }
        updated = await tx.order.findUniqueOrThrow({ where: { id: order.id } })
      }
      else {
        updated = await tx.order.update({
          where: { id: order.id },
          data,
        })
      }

      await tx.orderStatusLog.create({
        data: {
          orderId: order.id,
          fromStatus: expectedStatus,
          toStatus: rule.to,
          operatorType: params.operatorType,
          operatorId: params.operatorId,
          action: params.action,
          requestId: params.requestId,
          remark: params.remark,
          detail: params.detail ? params.detail as Prisma.InputJsonObject : undefined,
        },
      })

      return updated
    })

    return lockMode === 'pessimistic'
      ? this.withLockRetry(run)
      : run()
  }

  async createInitialStatusLog(params: CreateInitialStatusLogParams) {
    const rule = getOrderTransition('create_order')
    await params.tx.orderStatusLog.create({
      data: {
        orderId: params.orderId,
        fromStatus: null,
        toStatus: rule.to,
        operatorType: params.operatorType,
        operatorId: params.operatorId,
        action: 'create_order',
        requestId: params.requestId,
        remark: params.remark,
        detail: params.detail ? params.detail as Prisma.InputJsonObject : undefined,
      },
    })
  }

  private async readOrderForUpdate(tx: Prisma.TransactionClient, orderId: bigint) {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`
    return tx.order.findUnique({ where: { id: orderId } })
  }

  private assertExpectedStatus(actual: string, expected: OrderStatus) {
    if (actual !== expected) {
      throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order status changed, refresh and retry', 409)
    }
  }

  private async withLockRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await fn()
      }
      catch (error) {
        lastError = error
        if (!this.isRetryableLockError(error) || attempt === 2) {
          throw error
        }
        await this.sleep(50 * (attempt + 1))
      }
    }
    throw lastError
  }

  private isRetryableLockError(error: unknown) {
    if (!error || typeof error !== 'object') return false
    const record = error as { code?: string, message?: string, meta?: { code?: string } }
    const message = record.message || ''
    return record.code === 'P2034'
      || record.meta?.code === '1213'
      || record.meta?.code === '1205'
      || message.includes('Deadlock')
      || message.includes('Lock wait timeout')
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
