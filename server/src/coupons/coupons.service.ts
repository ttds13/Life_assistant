import { Inject, Injectable } from '@nestjs/common'
import { Coupon, Prisma, UserCoupon } from '@prisma/client'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { PrismaService } from '../prisma/prisma.service'
import { COUPON_TYPE, USER_COUPON_STATUS } from './coupon-status'

type CouponClient = PrismaService | Prisma.TransactionClient

interface CalculateDiscountParams {
  userId: bigint | number
  couponId?: bigint | number | null
  serviceId: bigint | number
  amount: Prisma.Decimal
}

interface LockCouponParams extends CalculateDiscountParams {
  tx: Prisma.TransactionClient
  orderId: bigint | number
}

@Injectable()
export class CouponsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listAvailableCoupons(userId: number) {
    const now = new Date()
    const coupons = await this.prisma.coupon.findMany({
      where: {
        status: 1,
        startTime: { lte: now },
        endTime: { gt: now },
      },
      orderBy: [{ endTime: 'asc' }, { id: 'desc' }],
    })
    const owned = await this.prisma.userCoupon.findMany({
      where: {
        userId: BigInt(userId),
        couponId: { in: coupons.map(item => item.id) },
      },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    })
    const ownedByCoupon = new Map(owned.map(item => [item.couponId.toString(), item]))

    return coupons.map((coupon) => {
      const userCoupon = ownedByCoupon.get(coupon.id.toString())
      return this.presentMarketCoupon(coupon, userCoupon || null)
    })
  }

  async receiveCoupon(userId: number, couponId: number) {
    const now = new Date()
    const existing = await this.prisma.userCoupon.findFirst({
      where: {
        userId: BigInt(userId),
        couponId: BigInt(couponId),
        status: { in: [USER_COUPON_STATUS.AVAILABLE, USER_COUPON_STATUS.LOCKED, USER_COUPON_STATUS.USED] },
      },
      include: { coupon: true },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    })
    if (existing) return this.presentUserCoupon(existing)

    const userCoupon = await this.prisma.$transaction(async (tx) => {
      const coupon = await tx.coupon.findUnique({ where: { id: BigInt(couponId) } })
      if (!coupon) {
        throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'coupon not found', 404)
      }
      this.assertCouponReceivable(coupon, now)

      if (coupon.totalCount > 0) {
        const updated = await tx.coupon.updateMany({
          where: {
            id: coupon.id,
            status: 1,
            startTime: { lte: now },
            endTime: { gt: now },
            issuedCount: { lt: coupon.totalCount },
          },
          data: { issuedCount: { increment: 1 } },
        })
        if (updated.count !== 1) {
          throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'coupon sold out', 409)
        }
      }
      else {
        await tx.coupon.update({ where: { id: coupon.id }, data: { issuedCount: { increment: 1 } } })
      }

      return tx.userCoupon.create({
        data: {
          couponId: coupon.id,
          userId: BigInt(userId),
          status: USER_COUPON_STATUS.AVAILABLE,
          expireAt: coupon.endTime,
        },
        include: { coupon: true },
      })
    })

    return this.presentUserCoupon(userCoupon)
  }

  async listUserCoupons(userId: number, query: { status?: string } = {}) {
    const now = new Date()
    await this.expireUserCoupons(BigInt(userId), now)

    const where: Prisma.UserCouponWhereInput = { userId: BigInt(userId) }
    if (query.status && query.status !== 'all') {
      where.status = this.normalizeExternalStatus(query.status)
    }

    const items = await this.prisma.userCoupon.findMany({
      where,
      include: { coupon: true },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    })
    return items.map(item => this.presentUserCoupon(item))
  }

  async listUsableUserCoupons(userId: number, query: { serviceId?: number, amount?: number }) {
    const now = new Date()
    await this.expireUserCoupons(BigInt(userId), now)
    const amount = new Prisma.Decimal(query.amount || 0)
    const serviceId = query.serviceId ? BigInt(query.serviceId) : null
    const items = await this.prisma.userCoupon.findMany({
      where: {
        userId: BigInt(userId),
        status: USER_COUPON_STATUS.AVAILABLE,
        expireAt: { gt: now },
        coupon: {
          status: 1,
          startTime: { lte: now },
          endTime: { gt: now },
        },
      },
      include: { coupon: true },
      orderBy: [{ expireAt: 'asc' }, { id: 'desc' }],
    })

    return items
      .map(item => ({
        item,
        discountAmount: this.calculateDiscount(item.coupon, amount),
        usable: amount.greaterThanOrEqualTo(item.coupon.minAmount)
          && (!serviceId || this.isServiceApplicable(item.coupon, serviceId)),
      }))
      .filter(item => item.usable && item.discountAmount.greaterThan(0))
      .map(({ item, discountAmount }) => ({
        ...this.presentUserCoupon(item),
        discountAmount: discountAmount.toNumber(),
      }))
  }

  async previewDiscount(params: CalculateDiscountParams) {
    if (!params.couponId) {
      return {
        couponId: null,
        discountAmount: new Prisma.Decimal(0),
        payableAmount: params.amount,
      }
    }

    const userCoupon = await this.findUsableUserCoupon(this.prisma, params)
    const discountAmount = this.calculateDiscount(userCoupon.coupon, params.amount)
    return {
      couponId: userCoupon.couponId,
      userCouponId: userCoupon.id,
      discountAmount,
      payableAmount: this.nonNegative(params.amount.sub(discountAmount)),
    }
  }

  async lockCouponForOrder(params: LockCouponParams) {
    if (!params.couponId) {
      return {
        couponId: null,
        discountAmount: new Prisma.Decimal(0),
        payableAmount: params.amount,
      }
    }

    const userCoupon = await this.findUsableUserCoupon(params.tx, params)
    const discountAmount = this.calculateDiscount(userCoupon.coupon, params.amount)
    const payableAmount = this.nonNegative(params.amount.sub(discountAmount))
    const updated = await params.tx.userCoupon.updateMany({
      where: {
        id: userCoupon.id,
        status: USER_COUPON_STATUS.AVAILABLE,
        usedOrderId: null,
      },
      data: {
        status: USER_COUPON_STATUS.LOCKED,
        usedOrderId: BigInt(params.orderId),
        usedAt: null,
      },
    })
    if (updated.count !== 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'coupon status changed', 409)
    }
    return {
      couponId: userCoupon.couponId,
      userCouponId: userCoupon.id,
      discountAmount,
      payableAmount,
    }
  }

  async markCouponUsedForOrder(tx: Prisma.TransactionClient, orderId: bigint | number, now = new Date()) {
    const order = await tx.order.findUnique({
      where: { id: BigInt(orderId) },
      select: { id: true, couponId: true },
    })
    if (!order?.couponId) return null

    const result = await tx.userCoupon.updateMany({
      where: {
        couponId: order.couponId,
        usedOrderId: order.id,
        status: USER_COUPON_STATUS.LOCKED,
      },
      data: {
        status: USER_COUPON_STATUS.USED,
        usedAt: now,
      },
    })
    if (result.count === 0) {
      const used = await tx.userCoupon.findFirst({
        where: {
          couponId: order.couponId,
          usedOrderId: order.id,
          status: USER_COUPON_STATUS.USED,
        },
      })
      if (used) return used
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'locked coupon not found', 409)
    }
    return tx.userCoupon.findFirst({ where: { couponId: order.couponId, usedOrderId: order.id } })
  }

  async releaseCouponForOrder(tx: Prisma.TransactionClient, orderId: bigint | number, reason = 'order released') {
    const now = new Date()
    const order = await tx.order.findUnique({
      where: { id: BigInt(orderId) },
      select: { id: true, couponId: true },
    })
    if (!order?.couponId) return null

    const current = await tx.userCoupon.findFirst({
      where: {
        couponId: order.couponId,
        usedOrderId: order.id,
      },
      include: { coupon: true },
    })
    if (!current) return null

    const nextStatus = current.expireAt <= now || current.coupon.endTime <= now
      ? USER_COUPON_STATUS.EXPIRED
      : USER_COUPON_STATUS.AVAILABLE

    return tx.userCoupon.update({
      where: { id: current.id },
      data: {
        status: nextStatus,
        usedOrderId: null,
        usedAt: null,
      },
    })
  }

  async releaseCouponForRefund(tx: Prisma.TransactionClient, orderId: bigint | number) {
    return this.releaseCouponForOrder(tx, orderId, 'refund success')
  }

  private async findUsableUserCoupon(client: CouponClient, params: CalculateDiscountParams) {
    const now = new Date()
    const userCoupon = await client.userCoupon.findFirst({
      where: {
        couponId: BigInt(params.couponId!),
        userId: BigInt(params.userId),
        status: USER_COUPON_STATUS.AVAILABLE,
        usedOrderId: null,
        expireAt: { gt: now },
        coupon: {
          status: 1,
          startTime: { lte: now },
          endTime: { gt: now },
        },
      },
      include: { coupon: true },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    })
    if (!userCoupon) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'coupon is not available', 409)
    }
    if (params.amount.lessThan(userCoupon.coupon.minAmount)) {
      throw new BusinessException(ErrorCode.ORDER_PRICE_CHANGED, 'coupon min amount not reached', 409)
    }
    if (!this.isServiceApplicable(userCoupon.coupon, BigInt(params.serviceId))) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'coupon cannot be used for this service', 409)
    }
    const discount = this.calculateDiscount(userCoupon.coupon, params.amount)
    if (discount.lessThanOrEqualTo(0)) {
      throw new BusinessException(ErrorCode.ORDER_PRICE_CHANGED, 'coupon discount is zero', 409)
    }
    return userCoupon
  }

  private async expireUserCoupons(userId: bigint, now: Date) {
    await this.prisma.userCoupon.updateMany({
      where: {
        userId,
        status: USER_COUPON_STATUS.AVAILABLE,
        expireAt: { lte: now },
      },
      data: { status: USER_COUPON_STATUS.EXPIRED },
    })
  }

  private assertCouponReceivable(coupon: Coupon, now: Date) {
    if (coupon.status !== 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'coupon is not published', 409)
    }
    if (coupon.startTime > now || coupon.endTime <= now) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'coupon is not in valid period', 409)
    }
    if (coupon.totalCount > 0 && coupon.issuedCount >= coupon.totalCount) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'coupon sold out', 409)
    }
  }

  private calculateDiscount(coupon: Coupon, amount: Prisma.Decimal) {
    if (coupon.type === COUPON_TYPE.DISCOUNT) {
      const rate = coupon.amount.div(10)
      const discount = amount.sub(amount.mul(rate))
      return this.boundDiscount(discount, amount)
    }
    return this.boundDiscount(coupon.amount, amount)
  }

  private boundDiscount(discount: Prisma.Decimal, amount: Prisma.Decimal) {
    if (discount.lessThanOrEqualTo(0)) return new Prisma.Decimal(0)
    if (discount.greaterThan(amount)) return amount
    return discount.toDecimalPlaces(2)
  }

  private nonNegative(amount: Prisma.Decimal) {
    return amount.lessThan(0) ? new Prisma.Decimal(0) : amount.toDecimalPlaces(2)
  }

  private isServiceApplicable(coupon: Coupon, serviceId: bigint) {
    const value = coupon.applicableServices
    if (!Array.isArray(value) || value.length === 0) return true
    const serviceIdText = serviceId.toString()
    return value.some(item => String(item) === serviceIdText || Number(item) === Number(serviceId))
  }

  private normalizeExternalStatus(status: string) {
    if (status === 'unused') return USER_COUPON_STATUS.AVAILABLE
    if (status === 'all') return undefined
    return status
  }

  private presentMarketCoupon(coupon: Coupon, userCoupon: UserCoupon | null) {
    return {
      id: Number(coupon.id),
      name: coupon.name,
      type: coupon.type,
      amount: coupon.amount.toNumber(),
      minAmount: coupon.minAmount.toNumber(),
      totalCount: coupon.totalCount,
      issuedCount: coupon.issuedCount,
      startTime: coupon.startTime.toISOString(),
      endTime: coupon.endTime.toISOString(),
      status: coupon.status === 1 ? 'published' : 'draft',
      received: Boolean(userCoupon),
      userCoupon: userCoupon ? this.presentUserCoupon({ ...userCoupon, coupon }) : null,
    }
  }

  private presentUserCoupon(userCoupon: UserCoupon & { coupon: Coupon }) {
    const status = this.presentStatus(userCoupon)
    return {
      id: Number(userCoupon.id),
      userCouponId: Number(userCoupon.id),
      couponId: Number(userCoupon.couponId),
      name: userCoupon.coupon.name,
      type: userCoupon.coupon.type,
      amount: userCoupon.coupon.amount.toNumber(),
      minAmount: userCoupon.coupon.minAmount.toNumber(),
      status,
      rawStatus: userCoupon.status,
      usedOrderId: userCoupon.usedOrderId ? Number(userCoupon.usedOrderId) : null,
      receivedAt: userCoupon.receivedAt.toISOString(),
      usedAt: userCoupon.usedAt?.toISOString() || null,
      expireAt: userCoupon.expireAt.toISOString(),
      startTime: userCoupon.coupon.startTime.toISOString(),
      endTime: userCoupon.coupon.endTime.toISOString(),
    }
  }

  private presentStatus(userCoupon: UserCoupon) {
    if (userCoupon.status === USER_COUPON_STATUS.USED) return 'used'
    if (userCoupon.status === USER_COUPON_STATUS.EXPIRED || userCoupon.expireAt <= new Date()) return 'expired'
    if (userCoupon.status === USER_COUPON_STATUS.LOCKED) return 'locked'
    return 'unused'
  }
}
