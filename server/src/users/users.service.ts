import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ORDER_TYPE } from '../orders/constants/order-type'

const POINTS_PER_YUAN = 10
const POINTS_UNIT_YUAN = 0.1
const POINT_LEDGER_TYPE_EARN = 'earn'

const POINTABLE_ORDER_STATUSES = [
  'pending_dispatch',
  'dispatched',
  'accepted',
  'on_the_way',
  'in_service',
  'pending_confirm',
  'completed',
]

type PointClient = PrismaService | Prisma.TransactionClient

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getUserPoints(userId: number) {
    const ledgerCount = await this.prisma.pointLedger.count({ where: { userId: BigInt(userId) } })
    if (ledgerCount === 0) {
      return this.getLegacyUserPoints(userId)
    }

    const [summary, recentLedgers] = await Promise.all([
      this.prisma.pointLedger.aggregate({
        where: { userId: BigInt(userId) },
        _sum: { points: true, amount: true },
      }),
      this.prisma.pointLedger.findMany({
        where: { userId: BigInt(userId) },
        include: { order: { select: { id: true, orderNo: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
      }),
    ])

    const totalPoints = summary._sum.points || 0
    const totalAmount = summary._sum.amount || new Prisma.Decimal(0)
    return {
      totalPoints,
      totalAmount: totalAmount.toNumber(),
      availablePoints: totalPoints,
      rule: this.pointRule(),
      recentEarned: recentLedgers.map(item => this.presentLedger(item)),
      recentTotalAmount: recentLedgers.reduce((sum, item) => sum.add(item.amount || 0), new Prisma.Decimal(0)).toNumber(),
      recentTotalPoints: recentLedgers.reduce((sum, item) => sum + item.points, 0),
    }
  }

  async getUserPointRecords(userId: number, query: { page?: number, pageSize?: number }) {
    const page = this.positiveInt(query.page, 1, 100000)
    const pageSize = this.positiveInt(query.pageSize, 20, 100)
    const where: Prisma.PointLedgerWhereInput = { userId: BigInt(userId) }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.pointLedger.count({ where }),
      this.prisma.pointLedger.findMany({
        where,
        include: { order: { select: { id: true, orderNo: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    return {
      items: items.map(item => this.presentLedger(item)),
      page,
      pageSize,
      total,
    }
  }

  async ensureEarnedPointsForOrder(orderId: bigint | number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma
    const order = await client.order.findUnique({
      where: { id: BigInt(orderId) },
      select: {
        id: true,
        userId: true,
        orderNo: true,
        orderType: true,
        status: true,
        paidAt: true,
        paidAmount: true,
        payableAmount: true,
      },
    })
    if (!order || !order.paidAt || order.orderType === ORDER_TYPE.MEMBER_CARD_PURCHASE) {
      return null
    }

    const existing = await client.pointLedger.findFirst({
      where: { orderId: order.id, type: POINT_LEDGER_TYPE_EARN },
    })
    if (existing) return existing

    const amount = this.pointableAmount(order.paidAmount, order.payableAmount)
    const points = this.amountToPoints(amount)
    if (points <= 0) return null

    const summary = await client.pointLedger.aggregate({
      where: { userId: order.userId },
      _sum: { points: true },
    })
    const balanceAfter = (summary._sum.points || 0) + points
    return client.pointLedger.create({
      data: {
        userId: order.userId,
        orderId: order.id,
        type: POINT_LEDGER_TYPE_EARN,
        points,
        amount,
        balanceAfter,
        remark: `订单 ${order.orderNo} 消费积分`,
      },
    })
  }

  private async getLegacyUserPoints(userId: number) {
    const orders = await this.prisma.order.findMany({
      where: {
        userId: BigInt(userId),
        status: { in: POINTABLE_ORDER_STATUSES },
        paidAt: { not: null },
        orderType: { not: ORDER_TYPE.MEMBER_CARD_PURCHASE },
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
      rule: this.pointRule(),
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

  private presentLedger(ledger: {
    id: bigint
    orderId: bigint | null
    type: string
    points: number
    amount: Prisma.Decimal | null
    balanceAfter: number
    remark: string | null
    createdAt: Date
    order?: { id: bigint, orderNo: string } | null
  }) {
    return {
      id: Number(ledger.id),
      orderId: ledger.orderId ? Number(ledger.orderId) : null,
      orderNo: ledger.order?.orderNo || '',
      type: ledger.type,
      points: ledger.points,
      amount: ledger.amount?.toNumber() || 0,
      balanceAfter: ledger.balanceAfter,
      remark: ledger.remark || '',
      earnedAt: ledger.createdAt.toISOString(),
      createdAt: ledger.createdAt.toISOString(),
    }
  }

  private pointRule() {
    return {
      unitAmount: POINTS_UNIT_YUAN,
      pointsPerUnit: 1,
      description: '每实际支付0.1元积1分，低于0.1元的部分不计入积分。',
    }
  }

  private positiveInt(value: unknown, fallback: number, max: number) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) return fallback
    return Math.min(parsed, max)
  }
}
