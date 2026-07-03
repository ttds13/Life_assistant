import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

const POINTS_PER_YUAN = 10
const POINTS_UNIT_YUAN = 0.1

const POINTABLE_ORDER_STATUSES = [
  'pending_dispatch',
  'dispatched',
  'accepted',
  'on_the_way',
  'in_service',
  'pending_confirm',
  'completed',
]

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getUserPoints(userId: number) {
    const orders = await this.prisma.order.findMany({
      where: {
        userId: BigInt(userId),
        status: { in: POINTABLE_ORDER_STATUSES },
        paidAt: { not: null },
      },
      select: {
        id: true,
        orderNo: true,
        paidAmount: true,
        payableAmount: true,
        paidAt: true,
        createdAt: true,
      },
      orderBy: { paidAt: 'desc' },
      take: 20,
    })

    let totalAmount = new Prisma.Decimal(0)
    let totalPoints = 0
    const recentEarned = orders.map((order) => {
      const amount = this.pointableAmount(order.paidAmount, order.payableAmount)
      const points = this.amountToPoints(amount)
      totalAmount = totalAmount.add(amount)
      totalPoints += points
      return {
        orderId: Number(order.id),
        orderNo: order.orderNo,
        amount: amount.toNumber(),
        points,
        earnedAt: (order.paidAt || order.createdAt).toISOString(),
      }
    })

    const aggregate = await this.prisma.order.findMany({
      where: {
        userId: BigInt(userId),
        status: { in: POINTABLE_ORDER_STATUSES },
        paidAt: { not: null },
      },
      select: {
        paidAmount: true,
        payableAmount: true,
      },
    })

    let allAmount = new Prisma.Decimal(0)
    let allPoints = 0
    for (const order of aggregate) {
      const amount = this.pointableAmount(order.paidAmount, order.payableAmount)
      allAmount = allAmount.add(amount)
      allPoints += this.amountToPoints(amount)
    }

    return {
      totalPoints: allPoints,
      totalAmount: allAmount.toNumber(),
      availablePoints: allPoints,
      rule: {
        unitAmount: POINTS_UNIT_YUAN,
        pointsPerUnit: 1,
        description: '',
      },
      recentEarned,
      recentTotalAmount: totalAmount.toNumber(),
      recentTotalPoints: totalPoints,
    }
  }

  private pointableAmount(paidAmount: Prisma.Decimal, payableAmount: Prisma.Decimal) {
    const paid = new Prisma.Decimal(paidAmount || 0)
    if (paid.greaterThan(0)) return paid
    return new Prisma.Decimal(payableAmount || 0)
  }

  private amountToPoints(amount: Prisma.Decimal) {
    return Math.floor(amount.mul(POINTS_PER_YUAN).toNumber())
  }
}
