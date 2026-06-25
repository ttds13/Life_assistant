import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class PaymentsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  get client() {
    return this.prisma
  }

  findLatestPaymentByChannel(orderId: number, userId: number, channel: string) {
    return this.prisma.payment.findFirst({
      where: {
        orderId: BigInt(orderId),
        userId: BigInt(userId),
        channel,
      },
      include: { order: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
  }

  findOrderForPayment(orderId: number) {
    return this.prisma.order.findUnique({
      where: { id: BigInt(orderId) },
      include: {
        user: {
          select: {
            id: true,
            openid: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })
  }

  findPaymentByNo(paymentNo: string) {
    return this.prisma.payment.findUnique({
      where: { paymentNo },
      include: { order: true },
    })
  }

}
