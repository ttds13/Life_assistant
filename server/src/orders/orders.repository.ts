import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export const ORDER_DETAIL_INCLUDE = Prisma.validator<Prisma.OrderInclude>()({
  service: {
    select: {
      id: true,
      categoryId: true,
      name: true,
      description: true,
      coverImage: true,
      basePrice: true,
      priceUnit: true,
      status: true,
      sortOrder: true,
    },
  },
  staff: {
    select: {
      id: true,
      name: true,
      phone: true,
      rating: true,
    },
  },
  statusLogs: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
  payments: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
  },
  photos: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
  assignments: {
    orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
    take: 1,
  },
})

export type OrderDetailRecord = Prisma.OrderGetPayload<{ include: typeof ORDER_DETAIL_INCLUDE }>

@Injectable()
export class OrdersRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  get client() {
    return this.prisma
  }

  findActiveService(serviceId: number) {
    return this.prisma.service.findFirst({
      where: { id: BigInt(serviceId), status: 1, deletedAt: null },
      include: { category: true },
    })
  }

  findUserAddress(userId: number, addressId: number) {
    return this.prisma.userAddress.findFirst({
      where: { id: BigInt(addressId), userId: BigInt(userId), deletedAt: null },
    })
  }

  async findUserOrders(params: {
    userId: number
    status?: string
    page: number
    pageSize: number
  }) {
    const where: Prisma.OrderWhereInput = {
      userId: BigInt(params.userId),
    }
    if (params.status && params.status !== 'all') {
      where.status = params.status
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: ORDER_DETAIL_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
    ])

    return { total, items }
  }

  async findAdminOrders(params: {
    status?: string
    page: number
    pageSize: number
  }) {
    const where: Prisma.OrderWhereInput = {}
    if (params.status && params.status !== 'all') {
      where.status = params.status
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: ORDER_DETAIL_INCLUDE,
        orderBy: [{ appointmentStartTime: 'asc' }, { id: 'desc' }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
    ])

    return { total, items }
  }

  async findStaffOrders(params: {
    staffId: number
    status?: string
    page: number
    pageSize: number
  }) {
    const where: Prisma.OrderWhereInput = {
      staffId: BigInt(params.staffId),
    }
    if (params.status && params.status !== 'all') {
      where.status = params.status
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: ORDER_DETAIL_INCLUDE,
        orderBy: [{ appointmentStartTime: 'asc' }, { id: 'desc' }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
    ])

    return { total, items }
  }

  findOrderDetail(orderId: number) {
    return this.prisma.order.findUnique({
      where: { id: BigInt(orderId) },
      include: ORDER_DETAIL_INCLUDE,
    })
  }
}
