import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { SERVICE_STATUS_ONLINE } from './constants/service-status'
import type { QueryServicesDto } from './dto/query-services.dto'

@Injectable()
export class ServicesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findCategories(query: { status?: number } = {}) {
    return this.prisma.serviceCategory.findMany({
      where: { status: query.status ?? SERVICE_STATUS_ONLINE },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        icon: true,
        sortOrder: true,
        status: true,
      },
    })
  }

  async findServices(query: QueryServicesDto) {
    const where = this.buildServiceWhere(query)
    const page = query.page || 1
    const pageSize = query.pageSize || 20

    const [total, items] = await this.prisma.$transaction([
      this.prisma.service.count({ where }),
      this.prisma.service.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
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
          rating: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ])

    return { items, page, pageSize, total }
  }

  async findServiceById(id: number) {
    return this.prisma.service.findUnique({
      where: { id: BigInt(id) },
      include: {
        category: true,
        images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
      },
    })
  }

  async countActiveServices() {
    return this.prisma.service.count({
      where: { status: SERVICE_STATUS_ONLINE, deletedAt: null },
    })
  }

  private buildServiceWhere(query: QueryServicesDto): Prisma.ServiceWhereInput {
    const where: Prisma.ServiceWhereInput = {
      status: query.status ?? SERVICE_STATUS_ONLINE,
      deletedAt: null,
    }

    if (query.categoryId !== undefined) where.categoryId = BigInt(query.categoryId)
    if (query.keyword) where.name = { contains: query.keyword }

    return where
  }
}
