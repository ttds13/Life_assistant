import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PAYMENT_CHANNEL } from './constants/payment-channel'

@Injectable()
export class PaymentsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  get client() {
    return this.prisma
  }

  findLatestMockPayment(orderId: number, userId: number) {
    return this.prisma.payment.findFirst({
      where: {
        orderId: BigInt(orderId),
        userId: BigInt(userId),
        channel: PAYMENT_CHANNEL.MOCK,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
  }

  findPaymentByNo(paymentNo: string) {
    return this.prisma.payment.findUnique({
      where: { paymentNo },
      include: { order: true },
    })
  }

  findLatestOrderPayment(orderId: number) {
    return this.prisma.payment.findFirst({
      where: { orderId: BigInt(orderId), channel: PAYMENT_CHANNEL.MOCK },
      include: { order: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
  }
}
