import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ORDER_STATUS } from './constants/order-status'

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
  user: {
    select: {
      id: true,
      nickname: true,
      phone: true,
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

const STAFF_BUSY_ORDER_STATUSES = [
  ORDER_STATUS.DISPATCHED,
  ORDER_STATUS.ACCEPTED,
  ORDER_STATUS.ON_THE_WAY,
  ORDER_STATUS.IN_SERVICE,
  ORDER_STATUS.PENDING_CONFIRM,
]

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

  findUserServiceAddress(userId: number, addressId: number) {
    return this.prisma.address.findFirst({
      where: {
        id: BigInt(addressId),
        ownerType: 'user',
        ownerId: BigInt(userId),
        addressType: 'service',
        status: 1,
        deletedAt: null,
      },
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
    keyword?: string
    dateStart?: Date
    dateEnd?: Date
    page: number
    pageSize: number
  }) {
    const where: Prisma.OrderWhereInput = {}
    if (params.status && params.status !== 'all') {
      where.status = params.status
    }
    if (params.keyword) {
      const keyword = params.keyword
      where.OR = [
        { orderNo: { contains: keyword } },
        { user: { nickname: { contains: keyword } } },
        { user: { phone: { contains: keyword } } },
        { service: { name: { contains: keyword } } },
      ]
    }
    if (params.dateStart || params.dateEnd) {
      where.appointmentStartTime = {
        ...(params.dateStart ? { gte: params.dateStart } : {}),
        ...(params.dateEnd ? { lte: params.dateEnd } : {}),
      }
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

  async findAvailableStaffOrders(params: {
    page: number
    pageSize: number
  }) {
    const where: Prisma.OrderWhereInput = {
      status: ORDER_STATUS.PENDING_DISPATCH,
      staffId: null,
      cancelledAt: null,
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: ORDER_DETAIL_INCLUDE,
        orderBy: [{ appointmentStartTime: 'asc' }, { id: 'asc' }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
    ])

    return { total, items }
  }

  findWorkingStaff(staffId: number) {
    return this.prisma.staff.findFirst({
      where: {
        id: BigInt(staffId),
        status: 1,
        workStatus: 1,
        deletedAt: null,
      },
    })
  }

  countStaffBusyOrders(staffId: number, excludeOrderId?: number) {
    return this.prisma.order.count({
      where: {
        staffId: BigInt(staffId),
        status: { in: STAFF_BUSY_ORDER_STATUSES },
        ...(excludeOrderId ? { id: { not: BigInt(excludeOrderId) } } : {}),
      },
    })
  }

  findAutoAssignableStaff(orderId: number) {
    return this.prisma.staff.findFirst({
      where: {
        status: 1,
        workStatus: 1,
        deletedAt: null,
        orders: {
          none: {
            status: { in: STAFF_BUSY_ORDER_STATUSES },
          },
        },
        assignments: {
          none: {
            orderId: BigInt(orderId),
            assignStatus: 'rejected',
          },
        },
      },
      orderBy: [{ id: 'asc' }],
    })
  }

  findOrderDetail(orderId: number) {
    return this.prisma.order.findUnique({
      where: { id: BigInt(orderId) },
      include: ORDER_DETAIL_INCLUDE,
    })
  }

  findAssignableStaffOptions() {
    return this.prisma.staff.findMany({
      where: { status: 1, deletedAt: null },
      orderBy: [{ workStatus: 'asc' }, { rating: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        phone: true,
        workStatus: true,
        rating: true,
        cityCode: true,
      },
    })
  }
}
