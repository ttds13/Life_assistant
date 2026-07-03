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
        _count: { select: { services: true } },
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
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        select: {
          id: true,
          code: true,
          categoryId: true,
          name: true,
          description: true,
          coverImage: true,
          basePrice: true,
          priceUnit: true,
          durationMinutes: true,
          cardType: true,
          consumeUnit: true,
          consultationRequired: true,
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

  async findServiceByCode(code: string) {
    return this.prisma.service.findUnique({
      where: { code },
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

  async findHomeBanners(query: { status?: number } = {}) {
    return this.prisma.homeBanner.findMany({
      where: { status: query.status ?? SERVICE_STATUS_ONLINE },
      orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
    })
  }

  private buildServiceWhere(query: QueryServicesDto): Prisma.ServiceWhereInput {
    const where: Prisma.ServiceWhereInput = {
      status: query.status ?? SERVICE_STATUS_ONLINE,
      deletedAt: null,
      category: { status: SERVICE_STATUS_ONLINE },
    }

    if (query.categoryId !== undefined) where.categoryId = BigInt(query.categoryId)
    if (query.cardType) where.cardType = query.cardType
    if (query.serviceCodes) {
      const codes = query.serviceCodes.split(',').map(item => item.trim()).filter(Boolean)
      if (codes.length) {
        where.code = { in: codes }
      }
    }
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword } },
        { description: { contains: query.keyword } },
        { detail: { contains: query.keyword } },
        { category: { name: { contains: query.keyword } } },
      ]
    }

    return where
  }
}
