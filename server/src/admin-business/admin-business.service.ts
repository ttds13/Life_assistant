import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { hashAdminPassword } from '../admin-auth/admin-password'
import { AdminAuditService } from '../audit-log/admin-audit.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { ORDER_STATUS } from '../orders/constants/order-status'
import { PrismaService } from '../prisma/prisma.service'
import { ObjectStorageService } from '../storage/storage.service'
import type { AdminAuditReviewDto, AdminPageQueryDto, AdminStatusDto, AdminUserRoleDto } from './dto/admin-business.dto'

type JsonRecord = Record<string, unknown>
type StaffBindingClient = PrismaService | Prisma.TransactionClient

interface AdminWriteContext {
  adminId: number
  requestId?: string
  ip?: string
}

interface PageMeta {
  page: number
  pageSize: number
  keyword?: string
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

@Injectable()
export class AdminBusinessService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
  ) {}

  async getDashboard() {
    const todayStart = this.startOfDay(new Date())
    const trendStart = this.addDays(todayStart, -6)

    const [
      totalUsers,
      todayUsers,
      totalOrders,
      todayOrders,
      todayAmount,
      pendingDispatch,
      staffPending,
      refundPending,
      withdrawPending,
      ticketPending,
      trendOrders,
      groupedStatuses,
      recentAudits,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, createdAt: { gte: todayStart } } }),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.order.aggregate({
        where: { createdAt: { gte: todayStart } },
        _sum: { paidAmount: true },
      }),
      this.prisma.order.count({ where: { status: ORDER_STATUS.PENDING_DISPATCH } }),
      this.prisma.staff.count({ where: { status: 2, deletedAt: null } }),
      this.prisma.refund.count({ where: { status: 'pending' } }),
      this.prisma.withdrawRequest.count({ where: { status: 'pending' } }),
      this.prisma.ticket.count({ where: { status: { in: ['open', 'pending'] } } }),
      this.prisma.order.findMany({
        where: { createdAt: { gte: trendStart } },
        select: { createdAt: true, paidAmount: true },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.auditLog.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 4,
      }),
    ])

    const pendingAudits = staffPending + refundPending + withdrawPending + ticketPending
    const trendDates = Array.from({ length: 7 }, (_, index) => this.addDays(trendStart, index))
    const trendBuckets = trendDates.map((date) => ({
      key: this.dateKey(date),
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      count: 0,
      amount: 0,
    }))
    const bucketMap = new Map(trendBuckets.map(bucket => [bucket.key, bucket]))
    for (const order of trendOrders) {
      const bucket = bucketMap.get(this.dateKey(order.createdAt))
      if (bucket) {
        bucket.count += 1
        bucket.amount += this.decimalToNumber(order.paidAmount)
      }
    }

    return {
      metrics: [
        this.metric('users', '用户数量', todayUsers, '', '', todayUsers, totalUsers, '总用户数', totalUsers, 'user', '#1677FF'),
        this.metric('orders', '今日订单', todayOrders, '', '', todayOrders, totalOrders, '总订单数', totalOrders, 'table', '#16A34A'),
        this.metric('amount', '今日实收', this.decimalToNumber(todayAmount._sum.paidAmount), '￥', '', 0, 0, '今日实收', this.decimalToNumber(todayAmount._sum.paidAmount), 'monitor', '#F59E0B'),
        this.metric('dispatch', '待派单', pendingDispatch, '', '', pendingDispatch, pendingDispatch, '待处理', pendingDispatch, 'todo', '#EF4444'),
        this.metric('audit', '待审核', pendingAudits, '', '', pendingAudits, pendingAudits, '待审核', pendingAudits, 'setting', '#8B5CF6'),
      ],
      shortcuts: [
        { title: '用户', icon: 'user', color: '#38BDF8', path: '/users/list' },
        { title: '服务', icon: 'project', color: '#A5B4FC', path: '/services/items' },
        { title: '师傅', icon: 'client', color: '#A855F7', path: '/staff/list' },
        { title: '订单', icon: 'table', color: '#F59E0B', path: '/orders/list' },
        { title: '审核', icon: 'todo', color: '#EF4444', path: '/audit/center' },
        { title: '财务', icon: 'monitor', color: '#22C55E', path: '/finance/payments' },
        { title: '营销', icon: 'bell', color: '#EC4899', path: '/marketing/coupons' },
        { title: '日志', icon: 'document', color: '#FB923C', path: '/system/log' },
      ],
      trend: {
        dates: trendBuckets.map(bucket => bucket.label),
        orderAmounts: trendBuckets.map(bucket => bucket.amount),
        orderCounts: trendBuckets.map(bucket => bucket.count),
      },
      statusDistribution: groupedStatuses.map(item => ({
        name: this.orderStatusLabel(item.status),
        value: item._count._all,
      })),
      todos: [
        { id: 'pending_dispatch', title: '待派单订单', module: '订单', count: pendingDispatch, level: 'warning', path: '/orders/dispatch' },
        { id: 'staff_audit', title: '师傅认证审核', module: '师傅', count: staffPending, level: 'danger', path: '/staff/audit' },
        { id: 'refund_audit', title: '退款审核', module: '财务', count: refundPending, level: 'warning', path: '/finance/refunds' },
        { id: 'ticket_audit', title: '售后工单', module: '售后', count: ticketPending, level: 'primary', path: '/after-sales/tickets' },
      ],
      audits: recentAudits.map(item => ({
        id: String(item.id),
        title: item.action,
        type: 'all',
        source: item.module,
        submittedAt: this.formatDateTime(item.createdAt),
        status: 'done',
      })),
    }
  }

  async listUsers(query: AdminPageQueryDto) {
    const page = this.getPage(query)
    const where: Prisma.UserWhereInput = { deletedAt: null }
    if (query.status) where.status = this.activeStatusToNumber(query.status)
    if (page.keyword) {
      where.OR = [
        { nickname: { contains: page.keyword } },
        { phone: { contains: page.keyword } },
        { openid: { contains: page.keyword } },
      ]
    }

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: {
          orders: { select: { paidAmount: true } },
          _count: { select: { orders: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: this.skip(page),
        take: page.pageSize,
      }),
    ])

    const staffRoles = users.length
      ? await this.prisma.staff.findMany({
        where: {
          deletedAt: null,
          userId: { in: this.uniqueBigInts(users.map(user => user.id)) },
        },
        select: { id: true, userId: true, status: true, workStatus: true },
      })
      : []
    const staffByUserId = new Map<string, (typeof staffRoles)[number]>()
    for (const staff of staffRoles) {
      if (staff.userId) staffByUserId.set(String(staff.userId), staff)
    }

    return this.pageResult(users.map((user) => {
      const staff = staffByUserId.get(String(user.id))
      return {
        id: String(user.id),
        nickname: user.nickname || `用户${Number(user.id)}`,
        phone: user.phone || '',
        roleType: staff ? 'staff' : 'user',
        staffId: staff ? String(staff.id) : '',
        staffStatus: staff ? this.staffStatus(staff.status) : '',
        staffWorkStatus: staff ? this.workStatus(staff.workStatus) : '',
        gender: user.gender,
        cityCode: user.cityCode || '',
        city: user.cityCode || '',
        orderCount: user._count.orders,
        totalPaid: user.orders.reduce((sum, order) => sum + this.decimalToNumber(order.paidAmount), 0),
        status: this.activeStatus(user.status),
        createdAt: this.formatDateTime(user.createdAt),
      }
    }), page, total)
  }

  async getUser(id: number) {
    const [user, addresses] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: BigInt(id) },
        include: {
          orders: { orderBy: [{ createdAt: 'desc' }], take: 5 },
        },
      }),
      this.prisma.address.findMany({
        where: { ownerType: 'user', ownerId: BigInt(id), deletedAt: null },
        orderBy: [{ isDefault: 'desc' }, { id: 'desc' }],
      }),
    ])
    if (!user) throw this.notFound('user not found')
    return {
      ...user,
      addresses: addresses.map(address => this.presentAddress(address)),
    }
  }

  async updateUser(id: number, body: JsonRecord, context: AdminWriteContext) {
    const current = await this.prisma.user.findFirst({ where: { id: BigInt(id), deletedAt: null } })
    if (!current) throw this.notFound('user not found')

    const data: Prisma.UserUpdateInput = {}
    if (Object.prototype.hasOwnProperty.call(body, 'nickname')) data.nickname = this.optionalString(body.nickname) ?? null
    if (Object.prototype.hasOwnProperty.call(body, 'phone')) data.phone = this.optionalString(body.phone) ?? null
    if (Object.prototype.hasOwnProperty.call(body, 'gender')) data.gender = this.optionalNumber(body.gender, current.gender)
    if (Object.prototype.hasOwnProperty.call(body, 'cityCode')) data.cityCode = this.optionalString(body.cityCode) ?? null
    if (Object.prototype.hasOwnProperty.call(body, 'status')) data.status = this.activeStatusToNumber(String(body.status))

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: BigInt(id) }, data })
      const staff = await this.findStaffForUser(tx, id)
      if (staff) {
        const staffData: Prisma.StaffUpdateInput = {
          name: updated.nickname || staff.name,
          phone: updated.phone || staff.phone,
          avatarUrl: updated.avatarUrl || '',
          cityCode: updated.cityCode || staff.cityCode,
        }
        if (Object.prototype.hasOwnProperty.call(body, 'status') && updated.status !== 1) {
          staffData.status = 0
          staffData.workStatus = 0
        }
        await tx.staff.update({ where: { id: staff.id }, data: staffData })
      }
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'user:update',
        module: 'user',
        targetType: 'user',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: {
          before: this.userAuditSnapshot(current),
          after: this.userAuditSnapshot(updated),
        },
      })
    })

    return this.getUser(id)
  }

  async updateUserStatus(id: number, dto: AdminStatusDto, context: AdminWriteContext) {
    const status = this.activeStatusToNumber(dto.status)
    const current = await this.prisma.user.findFirst({ where: { id: BigInt(id), deletedAt: null } })
    if (!current) throw this.notFound('user not found')

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: BigInt(id) }, data: { status } })
      if (status !== 1) {
        const staff = await this.findStaffForUser(tx, id)
        if (staff) {
          await tx.staff.update({
            where: { id: staff.id },
            data: { status: 0, workStatus: 0 },
          })
        }
      }
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'user:status:update',
        module: 'user',
        targetType: 'user',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: status },
      })
    })

    return this.getUser(id)
  }

  async updateUserRole(id: number, dto: AdminUserRoleDto, context: AdminWriteContext) {
    const current = await this.prisma.user.findFirst({ where: { id: BigInt(id), deletedAt: null } })
    if (!current) throw this.notFound('user not found')

    const existing = await this.findStaffForUser(this.prisma, current.id, true)

    if (dto.roleType === 'staff') {
      const staff = await this.prisma.$transaction(async (tx) => {
        const phone = current.phone || existing?.phone
        if (!phone) {
          throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'staff phone required', 400)
        }
        const staffData = {
          userId: current.id,
          name: current.nickname || existing?.name || `User ${Number(current.id)}`,
          phone,
          avatarUrl: current.avatarUrl || '',
          status: 1,
          workStatus: existing?.workStatus && existing.workStatus !== 0 ? existing.workStatus : 1,
          deletedAt: null,
          cityCode: current.cityCode || existing?.cityCode || null,
        }
        const updated = existing
          ? await tx.staff.update({
            where: { id: existing.id },
            data: staffData,
          })
          : await tx.staff.create({
            data: {
              ...staffData,
              passwordHash: await hashAdminPassword(`${current.id}:${current.uuid}`),
            },
          })
        await this.audit.writeWithClient(tx, {
          adminId: context.adminId,
          action: 'user:role:update',
          module: 'user',
          targetType: 'user',
          targetId: id,
          requestId: context.requestId,
          ip: context.ip,
          detail: { before: existing?.deletedAt ? 'user' : existing ? 'staff' : 'user', after: 'staff', staffId: Number(updated.id) },
        })
        return updated
      })

      return {
        id: String(current.id),
        roleType: 'staff',
        staffId: String(staff.id),
        staffStatus: this.staffStatus(staff.status),
        staffWorkStatus: this.workStatus(staff.workStatus),
      }
    }

    if (existing && !existing.deletedAt) {
      const activeOrderCount = await this.prisma.order.count({
        where: {
          staffId: existing.id,
          status: { notIn: [ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED] },
        },
      })
      if (activeOrderCount > 0) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'staff has active orders', 409, { activeOrderCount })
      }

      const deletedAt = new Date()
      await this.prisma.$transaction(async (tx) => {
        await tx.staff.update({
          where: { id: existing.id },
          data: { status: 0, workStatus: 0, deletedAt },
        })
        await this.audit.writeWithClient(tx, {
          adminId: context.adminId,
          action: 'user:role:update',
          module: 'user',
          targetType: 'user',
          targetId: id,
          requestId: context.requestId,
          ip: context.ip,
          detail: { before: 'staff', after: 'user', staffId: Number(existing.id), deletedAt: deletedAt.toISOString() },
        })
      })
    }

    return {
      id: String(current.id),
      roleType: 'user',
      staffId: '',
      staffStatus: '',
      staffWorkStatus: '',
    }
  }

  async deleteUser(id: number, context: AdminWriteContext) {
    const current = await this.prisma.user.findFirst({ where: { id: BigInt(id), deletedAt: null } })
    if (!current) throw this.notFound('user not found')
    const deletedAt = new Date()

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: BigInt(id) },
        data: { status: 0, deletedAt },
      })
      const staff = await this.findStaffForUser(tx, id)
      if (staff) {
        await tx.staff.update({
          where: { id: staff.id },
          data: { status: 0, workStatus: 0, deletedAt },
        })
      }
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'user:delete',
        module: 'user',
        targetType: 'user',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: {
          before: this.userAuditSnapshot(current),
          after: { status: 0, deletedAt: deletedAt.toISOString() },
        },
      })
    })

    return { id, status: this.activeStatus(0), deletedAt: deletedAt.toISOString() }
  }

  async listAddresses(query: AdminPageQueryDto) {
    const page = this.getPage(query)
    const where: Prisma.AddressWhereInput = { deletedAt: null }
    if (page.keyword) {
      where.OR = [
        { contactName: { contains: page.keyword } },
        { contactPhone: { contains: page.keyword } },
        { city: { contains: page.keyword } },
        { district: { contains: page.keyword } },
        { detailAddress: { contains: page.keyword } },
        { formattedAddress: { contains: page.keyword } },
      ]
    }

    const [total, addresses] = await this.prisma.$transaction([
      this.prisma.address.count({ where }),
      this.prisma.address.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: this.skip(page),
        take: page.pageSize,
      }),
    ])
    const ownerMap = await this.addressOwnerMap(addresses)

    return this.pageResult(addresses.map(address => ({
      id: String(address.id),
      ownerType: address.ownerType,
      ownerId: String(address.ownerId),
      ownerName: ownerMap.get(`${address.ownerType}:${address.ownerId}`)?.name || '',
      ownerPhone: ownerMap.get(`${address.ownerType}:${address.ownerId}`)?.phone || '',
      userName: ownerMap.get(`${address.ownerType}:${address.ownerId}`)?.name || '',
      userPhone: ownerMap.get(`${address.ownerType}:${address.ownerId}`)?.phone || '',
      addressType: address.addressType,
      contactName: address.contactName,
      contactPhone: address.contactPhone,
      provinceName: address.province || '',
      cityName: address.city || '',
      districtName: address.district || '',
      streetName: address.street || '',
      addressTitle: address.addressTitle || '',
      detailAddress: address.detailAddress,
      houseNumber: address.houseNumber || '',
      formattedAddress: address.formattedAddress,
      city: address.city || '',
      district: address.district || '',
      address: address.formattedAddress,
      isDefault: address.isDefault,
      updatedAt: this.formatDateTime(address.updatedAt),
    })), page, total)
  }

  async listServiceCategories(query: AdminPageQueryDto) {
    const page = this.getPage(query)
    const where: Prisma.ServiceCategoryWhereInput = {}
    if (query.status) where.status = this.activeStatusToNumber(query.status)
    if (page.keyword) where.name = { contains: page.keyword }

    const [total, categories] = await this.prisma.$transaction([
      this.prisma.serviceCategory.count({ where }),
      this.prisma.serviceCategory.findMany({
        where,
        include: { _count: { select: { services: true } } },
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        skip: this.skip(page),
        take: page.pageSize,
      }),
    ])

    return this.pageResult(categories.map(category => ({
      id: String(category.id),
      name: category.name,
      key: String(category.id),
      description: category.description || '',
      serviceCount: category._count.services,
      sortOrder: category.sortOrder,
      status: this.activeStatus(category.status),
      updatedAt: this.formatDateTime(category.updatedAt),
    })), page, total)
  }

  async createServiceCategory(body: JsonRecord, context: AdminWriteContext) {
    const created = await this.prisma.$transaction(async (tx) => {
      const category = await tx.serviceCategory.create({
        data: {
          name: this.requiredString(body.name, 'name required'),
          icon: this.optionalString(body.icon),
          description: this.optionalString(body.description),
          sortOrder: this.optionalNumber(body.sortOrder, 0),
          status: this.activeStatusToNumber(this.optionalString(body.status) || 'active'),
        },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'service-category:create',
        module: 'service',
        targetType: 'service_category',
        targetId: category.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { name: category.name },
      })
      return category
    })
    return created
  }

  async updateServiceCategory(id: number, body: JsonRecord, context: AdminWriteContext) {
    const current = await this.prisma.serviceCategory.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound('service category not found')
    const updated = await this.prisma.$transaction(async (tx) => {
      const category = await tx.serviceCategory.update({
        where: { id: BigInt(id) },
        data: {
          name: this.optionalString(body.name) ?? current.name,
          icon: this.optionalString(body.icon),
          description: this.optionalString(body.description),
          sortOrder: this.optionalNumber(body.sortOrder, current.sortOrder),
          status: body.status ? this.activeStatusToNumber(String(body.status)) : current.status,
        },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'service-category:update',
        module: 'service',
        targetType: 'service_category',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: { name: current.name }, after: { name: category.name } },
      })
      return category
    })
    return updated
  }

  async updateServiceCategoryStatus(id: number, dto: AdminStatusDto, context: AdminWriteContext) {
    const current = await this.prisma.serviceCategory.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound('service category not found')
    const status = this.activeStatusToNumber(dto.status)
    await this.prisma.$transaction(async (tx) => {
      await tx.serviceCategory.update({ where: { id: BigInt(id) }, data: { status } })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'service-category:status:update',
        module: 'service',
        targetType: 'service_category',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: status },
      })
    })
    return { id, status: this.activeStatus(status) }
  }

  async deleteServiceCategory(id: number, context: AdminWriteContext) {
    const current = await this.prisma.serviceCategory.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound('service category not found')

    const serviceCount = await this.prisma.service.count({ where: { categoryId: BigInt(id) } })
    if (serviceCount > 0) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'service category has related services', 409, { serviceCount })
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.serviceCategory.delete({ where: { id: BigInt(id) } })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'service-category:delete',
        module: 'service',
        targetType: 'service_category',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: {
          before: {
            name: current.name,
            status: current.status,
            sortOrder: current.sortOrder,
          },
        },
      })
    })

    return { id, deleted: true }
  }

  async listServices(query: AdminPageQueryDto) {
    const page = this.getPage(query)
    const where: Prisma.ServiceWhereInput = { deletedAt: null }
    if (query.status) where.status = this.activeStatusToNumber(query.status)
    if (page.keyword) {
      where.OR = [
        { code: { contains: page.keyword } },
        { name: { contains: page.keyword } },
        { category: { name: { contains: page.keyword } } },
      ]
    }

    const [total, services] = await this.prisma.$transaction([
      this.prisma.service.count({ where }),
      this.prisma.service.findMany({
        where,
        include: { category: true, images: { orderBy: { sortOrder: 'asc' }, take: 3 } },
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        skip: this.skip(page),
        take: page.pageSize,
      }),
    ])

    return this.pageResult(services.map(service => ({
      id: String(service.id),
      code: service.code,
      categoryId: String(service.categoryId),
      name: service.name,
      category: service.category.name,
      description: service.description || '',
      basePrice: this.decimalToNumber(service.basePrice),
      minPrice: this.decimalToNumber(service.minPrice),
      priceUnit: service.priceUnit,
      duration: service.durationMinutes ? `${service.durationMinutes} 分钟` : '-',
      durationMinutes: service.durationMinutes || 0,
      serviceArea: service.serviceArea || '',
      rating: this.decimalToNumber(service.rating),
      totalOrders: service.totalOrders,
      status: this.activeStatus(service.status),
      coverImage: this.storage.signNullableUrl(service.coverImage) || service.coverImage || '',
      coverImageOssUrl: service.coverImage || '',
      coverImageDisplayUrl: this.storage.signNullableUrl(service.coverImage) || service.coverImage || '',
      updatedAt: this.formatDateTime(service.updatedAt),
    })), page, total)
  }

  async createService(body: JsonRecord, context: AdminWriteContext) {
    const created = await this.prisma.$transaction(async (tx) => {
      const codeInput = this.optionalString(body.code)
      const code = codeInput
        ? await this.ensureManualServiceCode(tx, codeInput)
        : await this.nextUniqueServiceCode(tx, this.optionalString(body.name))
      const coverImage = this.optionalString(body.coverImage)
      this.storage.assertPermanentOssUrl(coverImage)
      const service = await tx.service.create({
        data: {
          code,
          categoryId: BigInt(this.requiredNumber(body.categoryId, 'categoryId required')),
          name: this.requiredString(body.name, 'name required'),
          description: this.optionalString(body.description),
          detail: this.optionalString(body.detail),
          coverImage,
          basePrice: this.requiredDecimal(body.basePrice, 'basePrice required'),
          priceUnit: this.optionalString(body.priceUnit) || '次',
          minPrice: this.optionalDecimal(body.minPrice),
          durationMinutes: this.optionalNumber(body.durationMinutes),
          serviceArea: this.optionalString(body.serviceArea),
          notice: this.optionalString(body.notice),
          sortOrder: this.optionalNumber(body.sortOrder, 0),
          cityCode: this.optionalString(body.cityCode),
          status: this.activeStatusToNumber(this.optionalString(body.status) || 'active'),
        },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'service:create',
        module: 'service',
        targetType: 'service',
        targetId: service.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { code: service.code, name: service.name },
      })
      return service
    })
    return created
  }

  async updateService(id: number, body: JsonRecord, context: AdminWriteContext) {
    const current = await this.prisma.service.findFirst({ where: { id: BigInt(id), deletedAt: null } })
    if (!current) throw this.notFound('service not found')
    const updated = await this.prisma.$transaction(async (tx) => {
      const coverImage = this.optionalString(body.coverImage)
      this.storage.assertPermanentOssUrl(coverImage)
      const service = await tx.service.update({
        where: { id: BigInt(id) },
        data: {
          code: body.code === undefined ? current.code : await this.ensureManualServiceCode(tx, body.code, current.id),
          categoryId: body.categoryId ? BigInt(this.requiredNumber(body.categoryId, 'categoryId required')) : current.categoryId,
          name: this.optionalString(body.name) ?? current.name,
          description: this.optionalString(body.description),
          detail: this.optionalString(body.detail),
          coverImage,
          basePrice: body.basePrice === undefined ? current.basePrice : this.requiredDecimal(body.basePrice, 'basePrice required'),
          priceUnit: this.optionalString(body.priceUnit) ?? current.priceUnit,
          minPrice: body.minPrice === undefined ? current.minPrice : this.optionalDecimal(body.minPrice),
          durationMinutes: body.durationMinutes === undefined ? current.durationMinutes : this.optionalNumber(body.durationMinutes),
          serviceArea: this.optionalString(body.serviceArea),
          notice: this.optionalString(body.notice),
          sortOrder: this.optionalNumber(body.sortOrder, current.sortOrder),
          cityCode: this.optionalString(body.cityCode),
          status: body.status ? this.activeStatusToNumber(String(body.status)) : current.status,
        },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'service:update',
        module: 'service',
        targetType: 'service',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: {
          before: { code: current.code, name: current.name },
          after: { code: service.code, name: service.name },
        },
      })
      return service
    })
    return updated
  }

  async updateServiceStatus(id: number, dto: AdminStatusDto, context: AdminWriteContext) {
    const current = await this.prisma.service.findFirst({ where: { id: BigInt(id), deletedAt: null } })
    if (!current) throw this.notFound('service not found')
    const status = this.activeStatusToNumber(dto.status)
    await this.prisma.$transaction(async (tx) => {
      await tx.service.update({ where: { id: BigInt(id) }, data: { status } })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'service:status:update',
        module: 'service',
        targetType: 'service',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: status },
      })
    })
    return { id, status: this.activeStatus(status) }
  }

  async deleteService(id: number, context: AdminWriteContext) {
    const current = await this.prisma.service.findFirst({ where: { id: BigInt(id), deletedAt: null } })
    if (!current) throw this.notFound('service not found')
    const deletedAt = new Date()

    await this.prisma.$transaction(async (tx) => {
      await tx.service.update({
        where: { id: BigInt(id) },
        data: { status: 0, deletedAt },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'service:delete',
        module: 'service',
        targetType: 'service',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: {
          before: this.serviceAuditSnapshot(current),
          after: { status: 0, deletedAt: deletedAt.toISOString() },
        },
      })
    })

    return { id, status: this.activeStatus(0), deletedAt: deletedAt.toISOString() }
  }

  async listFulfillments(query: AdminPageQueryDto) {
    const page = this.getPage(query)
    const where: Prisma.OrderWhereInput = {}
    if (query.status) where.status = query.status
    if (page.keyword) {
      where.OR = [
        { orderNo: { contains: page.keyword } },
        { service: { name: { contains: page.keyword } } },
        { staff: { name: { contains: page.keyword } } },
        { staff: { phone: { contains: page.keyword } } },
      ]
    }

    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: {
          service: { select: { name: true } },
          staff: { select: { name: true } },
          checkins: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
          photos: true,
        },
        orderBy: [{ appointmentStartTime: 'desc' }, { id: 'desc' }],
        skip: this.skip(page),
        take: page.pageSize,
      }),
    ])

    return this.pageResult(orders.map(order => ({
      id: String(order.id),
      orderNo: order.orderNo,
      serviceName: this.snapshotName(order.serviceSnapshot, order.service?.name || ''),
      staffName: order.staff?.name || '',
      checkinAt: order.checkins[0] ? this.formatDateTime(order.checkins[0].createdAt) : '',
      photoCount: order.photos.length,
      status: order.status,
    })), page, total)
  }

  async listStaff(query: AdminPageQueryDto) {
    const page = this.getPage(query)
    const where: Prisma.StaffWhereInput = { deletedAt: null }
    if (query.status) where.status = this.staffStatusToNumber(query.status)
    if (page.keyword) {
      where.OR = [
        { name: { contains: page.keyword } },
        { phone: { contains: page.keyword } },
        { cityCode: { contains: page.keyword } },
      ]
    }

    const [total, staff] = await this.prisma.$transaction([
      this.prisma.staff.count({ where }),
      this.prisma.staff.findMany({
        where,
        include: {
          user: { select: { id: true, nickname: true, phone: true, status: true } },
        },
        orderBy: [{ status: 'desc' }, { rating: 'desc' }, { id: 'desc' }],
        skip: this.skip(page),
        take: page.pageSize,
      }),
    ])

    return this.pageResult(staff.map(item => this.presentStaff(item)), page, total)
  }

  async listStaffStatus(query: AdminPageQueryDto) {
    const page = this.getPage(query)
    const where: Prisma.StaffWhereInput = { deletedAt: null }
    if (query.status || query.workStatus) where.workStatus = this.workStatusToNumber(query.status || query.workStatus || '')
    if (page.keyword) {
      where.OR = [
        { name: { contains: page.keyword } },
        { phone: { contains: page.keyword } },
      ]
    }

    const [total, staff] = await this.prisma.$transaction([
      this.prisma.staff.count({ where }),
      this.prisma.staff.findMany({
        where,
        include: {
          orders: {
            where: { status: { notIn: [ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED] } },
            orderBy: [{ appointmentStartTime: 'asc' }],
            take: 1,
            select: { orderNo: true },
          },
        },
        orderBy: [{ workStatus: 'asc' }, { id: 'desc' }],
        skip: this.skip(page),
        take: page.pageSize,
      }),
    ])

    return this.pageResult(staff.map(item => ({
      id: String(item.id),
      name: item.name,
      phone: item.phone,
      workStatus: this.workStatus(item.workStatus),
      currentOrder: item.orders[0]?.orderNo || '暂无',
      lastActiveAt: this.formatDateTime(item.updatedAt),
      city: item.cityCode || '',
    })), page, total)
  }

  async createStaff(body: JsonRecord, context: AdminWriteContext) {
    const plainPassword = this.optionalString(body.password) || '123456'
    const passwordHash = await hashAdminPassword(plainPassword)
    const name = this.requiredString(body.name, 'name required')
    const phone = this.requiredString(body.phone, 'phone required')
    const avatarUrl = this.optionalString(body.avatarUrl)
    this.storage.assertPermanentOssUrl(avatarUrl)
    const cityCode = this.optionalString(body.cityCode)
    const userId = this.optionalPositiveInt(body.userId)
    const status = this.staffStatusToNumber(this.optionalString(body.status) || 'active')
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await this.ensureUserForStaff(tx, { userId, name, phone, avatarUrl, cityCode })
      const existing = await this.findStaffForUser(tx, Number(user.id), true)
      const staffData = {
        userId: user.id,
        name,
        phone,
        avatarUrl,
        idCard: this.optionalString(body.idCard),
        skills: this.parseJsonArray(body.skills),
        cityCode,
        status,
        workStatus: status === 1 ? 1 : 0,
        deletedAt: null,
      }
      const staff = existing
        ? await tx.staff.update({
          where: { id: existing.id },
          data: staffData,
        })
        : await tx.staff.create({
          data: {
            ...staffData,
            passwordHash,
          },
        })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: existing ? 'staff:restore' : 'staff:create',
        module: 'staff',
        targetType: 'staff',
        targetId: staff.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { name: staff.name, phone: staff.phone, userId: Number(user.id) },
      })
      return staff
    })
    return this.presentStaff(created)
  }

  async updateStaff(id: number, body: JsonRecord, context: AdminWriteContext) {
    const current = await this.prisma.staff.findFirst({ where: { id: BigInt(id), deletedAt: null } })
    if (!current) throw this.notFound('staff not found')
    const name = this.optionalString(body.name) ?? current.name
    const phone = this.optionalString(body.phone) ?? current.phone
    const avatarUrl = this.optionalString(body.avatarUrl)
    this.storage.assertPermanentOssUrl(avatarUrl)
    const cityCode = this.optionalString(body.cityCode)
    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await this.ensureUserForStaff(tx, {
        userId: this.optionalPositiveInt(body.userId) || (current.userId ? Number(current.userId) : undefined),
        name,
        phone,
        avatarUrl,
        cityCode,
      })
      const staff = await tx.staff.update({
        where: { id: BigInt(id) },
        data: {
          userId: user.id,
          name,
          phone,
          avatarUrl,
          idCard: this.optionalString(body.idCard),
          skills: body.skills === undefined ? current.skills as Prisma.InputJsonValue : this.parseJsonArray(body.skills),
          cityCode,
          status: body.status ? this.staffStatusToNumber(String(body.status)) : current.status,
          workStatus: body.workStatus ? this.workStatusToNumber(String(body.workStatus)) : current.workStatus,
        },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'staff:update',
        module: 'staff',
        targetType: 'staff',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: { name: current.name, userId: current.userId ? Number(current.userId) : null }, after: { name: staff.name, userId: Number(user.id) } },
      })
      return staff
    })
    return this.presentStaff(updated)
  }

  async updateStaffStatus(id: number, dto: AdminStatusDto, context: AdminWriteContext) {
    const current = await this.prisma.staff.findFirst({ where: { id: BigInt(id), deletedAt: null } })
    if (!current) throw this.notFound('staff not found')
    const status = this.staffStatusToNumber(dto.status)
    await this.prisma.$transaction(async (tx) => {
      await tx.staff.update({ where: { id: BigInt(id) }, data: { status } })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'staff:status:update',
        module: 'staff',
        targetType: 'staff',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: status },
      })
    })
    return { id, status: this.staffStatus(status) }
  }

  async deleteStaff(id: number, context: AdminWriteContext) {
    const current = await this.prisma.staff.findFirst({ where: { id: BigInt(id), deletedAt: null } })
    if (!current) throw this.notFound('staff not found')

    const activeOrderCount = await this.prisma.order.count({
      where: {
        staffId: BigInt(id),
        status: { notIn: [ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED] },
      },
    })
    if (activeOrderCount > 0) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'staff has active orders', 409, { activeOrderCount })
    }

    const deletedAt = new Date()
    await this.prisma.$transaction(async (tx) => {
      await tx.staff.update({
        where: { id: BigInt(id) },
        data: { status: 0, workStatus: 0, deletedAt },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'staff:delete',
        module: 'staff',
        targetType: 'staff',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: {
          before: this.staffAuditSnapshot(current),
          after: { status: 0, workStatus: 0, deletedAt: deletedAt.toISOString() },
        },
      })
    })

    return { id, status: this.staffStatus(0), workStatus: this.workStatus(0), deletedAt: deletedAt.toISOString() }
  }

  async listPayments(query: AdminPageQueryDto) {
    const page = this.getPage(query)
    const where: Prisma.PaymentWhereInput = {}
    if (query.status) where.status = this.paymentStatusToDb(query.status)
    if (page.keyword) {
      where.OR = [
        { paymentNo: { contains: page.keyword } },
        { transactionNo: { contains: page.keyword } },
        { order: { orderNo: { contains: page.keyword } } },
        { order: { user: { phone: { contains: page.keyword } } } },
      ]
    }

    const [total, payments] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: { order: { include: { user: true } }, refunds: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: this.skip(page),
        take: page.pageSize,
      }),
    ])

    return this.pageResult(payments.map(payment => ({
      id: String(payment.id),
      paymentNo: payment.paymentNo,
      orderNo: payment.order.orderNo,
      userName: payment.order.user.nickname || '',
      userPhone: payment.order.user.phone || '',
      channel: this.paymentChannel(payment.channel),
      transactionNo: payment.transactionNo || '',
      amount: this.decimalToNumber(payment.amount),
      status: payment.refunds.some(refund => refund.status === 'approved' || refund.status === 'refunded')
        ? 'refunded'
        : this.paymentStatus(payment.status),
      paidAt: payment.paidAt ? this.formatDateTime(payment.paidAt) : this.formatDateTime(payment.createdAt),
    })), page, total)
  }

  async listReviews(query: AdminPageQueryDto) {
    const page = this.getPage(query)
    const where: Prisma.ReviewWhereInput = {}
    if (query.status) where.status = this.reviewStatusToNumber(query.status)
    if (page.keyword) {
      where.OR = [
        { order: { orderNo: { contains: page.keyword } } },
        { user: { nickname: { contains: page.keyword } } },
        { staff: { name: { contains: page.keyword } } },
        { service: { name: { contains: page.keyword } } },
      ]
    }

    const [total, reviews] = await this.prisma.$transaction([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        include: { order: true, user: true, staff: true, service: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: this.skip(page),
        take: page.pageSize,
      }),
    ])

    return this.pageResult(reviews.map(review => ({
      id: String(review.id),
      orderNo: review.order.orderNo,
      userName: review.user.nickname || '',
      staffName: review.staff.name,
      serviceName: review.service.name,
      rating: review.rating,
      content: review.content || '',
      status: this.reviewStatus(review.status),
      createdAt: this.formatDateTime(review.createdAt),
    })), page, total)
  }

  async updateReviewStatus(id: number, dto: AdminStatusDto, context: AdminWriteContext) {
    const current = await this.prisma.review.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound('review not found')
    const status = this.reviewStatusToNumber(dto.status)
    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({ where: { id: BigInt(id) }, data: { status } })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'review:status:update',
        module: 'after-sales',
        targetType: 'review',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: status },
      })
    })
    return { id, status: this.reviewStatus(status) }
  }

  async listCoupons(query: AdminPageQueryDto) {
    const page = this.getPage(query)
    const where: Prisma.CouponWhereInput = {}
    if (query.status) where.status = this.publishStatusToNumber(query.status)
    if (page.keyword) where.name = { contains: page.keyword }

    const [total, coupons] = await this.prisma.$transaction([
      this.prisma.coupon.count({ where }),
      this.prisma.coupon.findMany({
        where,
        include: { _count: { select: { userCoupons: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: this.skip(page),
        take: page.pageSize,
      }),
    ])

    return this.pageResult(coupons.map(coupon => ({
      id: String(coupon.id),
      name: coupon.name,
      type: coupon.type,
      amount: this.decimalToNumber(coupon.amount),
      minAmount: this.decimalToNumber(coupon.minAmount),
      totalCount: coupon.totalCount,
      issuedCount: coupon.issuedCount,
      receivedCount: coupon._count.userCoupons,
      status: this.publishStatus(coupon.status),
      startTime: this.formatDateTime(coupon.startTime),
      endTime: this.formatDateTime(coupon.endTime),
    })), page, total)
  }

  async createCoupon(body: JsonRecord, context: AdminWriteContext) {
    const created = await this.prisma.$transaction(async (tx) => {
      const coupon = await tx.coupon.create({
        data: {
          name: this.requiredString(body.name, 'name required'),
          type: this.optionalString(body.type) || 'amount',
          amount: this.requiredDecimal(body.amount, 'amount required'),
          minAmount: this.optionalDecimal(body.minAmount) || new Prisma.Decimal(0),
          applicableServices: this.parseJsonArray(body.applicableServices),
          totalCount: this.optionalNumber(body.totalCount, 0) || 0,
          startTime: this.optionalDate(body.startTime) || new Date(),
          endTime: this.optionalDate(body.endTime) || this.addDays(new Date(), 30),
          status: this.publishStatusToNumber(this.optionalString(body.status) || 'draft'),
        },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'coupon:create',
        module: 'marketing',
        targetType: 'coupon',
        targetId: coupon.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { name: coupon.name },
      })
      return coupon
    })
    return created
  }

  async updateCoupon(id: number, body: JsonRecord, context: AdminWriteContext) {
    const current = await this.prisma.coupon.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound('coupon not found')
    const updated = await this.prisma.$transaction(async (tx) => {
      const coupon = await tx.coupon.update({
        where: { id: BigInt(id) },
        data: {
          name: this.optionalString(body.name) ?? current.name,
          type: this.optionalString(body.type) ?? current.type,
          amount: body.amount === undefined ? current.amount : this.requiredDecimal(body.amount, 'amount required'),
          minAmount: body.minAmount === undefined
            ? current.minAmount
            : this.optionalDecimal(body.minAmount) || new Prisma.Decimal(0),
          applicableServices: body.applicableServices === undefined ? current.applicableServices as Prisma.InputJsonValue : this.parseJsonArray(body.applicableServices),
          totalCount: this.optionalNumber(body.totalCount, current.totalCount),
          startTime: this.optionalDate(body.startTime) || current.startTime,
          endTime: this.optionalDate(body.endTime) || current.endTime,
          status: body.status ? this.publishStatusToNumber(String(body.status)) : current.status,
        },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'coupon:update',
        module: 'marketing',
        targetType: 'coupon',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: { name: current.name }, after: { name: coupon.name } },
      })
      return coupon
    })
    return updated
  }

  async updateCouponStatus(id: number, dto: AdminStatusDto, context: AdminWriteContext) {
    const current = await this.prisma.coupon.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound('coupon not found')
    const status = this.publishStatusToNumber(dto.status)
    await this.prisma.$transaction(async (tx) => {
      await tx.coupon.update({ where: { id: BigInt(id) }, data: { status } })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'coupon:status:update',
        module: 'marketing',
        targetType: 'coupon',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: status },
      })
    })
    return { id, status: this.publishStatus(status) }
  }

  async listMemberCards(query: AdminPageQueryDto) {
    const page = this.getPage(query)
    const where: Prisma.MemberCardWhereInput = {}
    if (query.status) where.status = this.publishStatusToNumber(query.status)
    if (page.keyword) where.name = { contains: page.keyword }

    const [total, cards] = await this.prisma.$transaction([
      this.prisma.memberCard.count({ where }),
      this.prisma.memberCard.findMany({
        where,
        include: { _count: { select: { userCards: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: this.skip(page),
        take: page.pageSize,
      }),
    ])

    return this.pageResult(cards.map(card => ({
      id: String(card.id),
      name: card.name,
      totalTimes: card.totalTimes,
      price: this.decimalToNumber(card.price),
      validityDays: card.validityDays,
      soldCount: card._count.userCards,
      status: this.publishStatus(card.status),
      updatedAt: this.formatDateTime(card.updatedAt),
    })), page, total)
  }

  async createMemberCard(body: JsonRecord, context: AdminWriteContext) {
    const created = await this.prisma.$transaction(async (tx) => {
      const card = await tx.memberCard.create({
        data: {
          name: this.requiredString(body.name, 'name required'),
          applicableServices: this.parseJsonArray(body.applicableServices),
          totalTimes: this.requiredNumber(body.totalTimes, 'totalTimes required'),
          price: this.requiredDecimal(body.price, 'price required'),
          validityDays: this.requiredNumber(body.validityDays, 'validityDays required'),
          status: this.publishStatusToNumber(this.optionalString(body.status) || 'draft'),
        },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'member-card:create',
        module: 'marketing',
        targetType: 'member_card',
        targetId: card.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { name: card.name },
      })
      return card
    })
    return created
  }

  async updateMemberCard(id: number, body: JsonRecord, context: AdminWriteContext) {
    const current = await this.prisma.memberCard.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound('member card not found')
    const updated = await this.prisma.$transaction(async (tx) => {
      const card = await tx.memberCard.update({
        where: { id: BigInt(id) },
        data: {
          name: this.optionalString(body.name) ?? current.name,
          applicableServices: body.applicableServices === undefined ? current.applicableServices as Prisma.InputJsonValue : this.parseJsonArray(body.applicableServices),
          totalTimes: this.optionalNumber(body.totalTimes, current.totalTimes),
          price: body.price === undefined ? current.price : this.requiredDecimal(body.price, 'price required'),
          validityDays: this.optionalNumber(body.validityDays, current.validityDays),
          status: body.status ? this.publishStatusToNumber(String(body.status)) : current.status,
        },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'member-card:update',
        module: 'marketing',
        targetType: 'member_card',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: { name: current.name }, after: { name: card.name } },
      })
      return card
    })
    return updated
  }

  async updateMemberCardStatus(id: number, dto: AdminStatusDto, context: AdminWriteContext) {
    const current = await this.prisma.memberCard.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound('member card not found')
    const status = this.publishStatusToNumber(dto.status)
    await this.prisma.$transaction(async (tx) => {
      await tx.memberCard.update({ where: { id: BigInt(id) }, data: { status } })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'member-card:status:update',
        module: 'marketing',
        targetType: 'member_card',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: status },
      })
    })
    return { id, status: this.publishStatus(status) }
  }

  async listAuditItems(type: string | undefined, query: AdminPageQueryDto) {
    const page = this.getPage(query)
    const keyword = page.keyword
    const requestedType = type || query.type || 'all'
    const items: Array<{
      id: string
      type: string
      title: string
      applicant: string
      bizNo: string
      amount?: number
      status: 'pending' | 'approved' | 'rejected'
      priority: 'normal' | 'high' | 'urgent'
      submittedAt: string
      reviewedAt?: string
      reviewer?: string
      reason: string
      detail: string
      rawTime: Date
    }> = []

    if (requestedType === 'all' || requestedType === 'staff') {
      const staff = await this.prisma.staff.findMany({
        where: { status: 2, deletedAt: null },
        orderBy: [{ createdAt: 'desc' }],
        take: 100,
      })
      for (const item of staff) {
        items.push({
          id: `staff:${item.id}`,
          type: 'staff',
          title: '师傅认证审核',
          applicant: item.name,
          bizNo: `ST${Number(item.id)}`,
          status: 'pending',
          priority: 'high',
          submittedAt: this.formatDateTime(item.createdAt),
          reason: '师傅资料待管理员审核',
          detail: `姓名：${item.name}，电话：${item.phone}`,
          rawTime: item.createdAt,
        })
      }
    }

    if (requestedType === 'all' || requestedType === 'refund') {
      const refunds = await this.prisma.refund.findMany({
        where: { status: 'pending' },
        include: { payment: { include: { order: { include: { user: true } } } } },
        orderBy: [{ createdAt: 'desc' }],
        take: 100,
      })
      for (const item of refunds) {
        items.push({
          id: `refund:${item.id}`,
          type: 'refund',
          title: '订单退款审核',
          applicant: item.payment.order.user.nickname || item.payment.order.user.phone || '用户',
          bizNo: item.refundNo,
          amount: this.decimalToNumber(item.amount),
          status: 'pending',
          priority: 'urgent',
          submittedAt: this.formatDateTime(item.createdAt),
          reason: item.reason || '用户申请退款',
          detail: `订单号：${item.payment.order.orderNo}`,
          rawTime: item.createdAt,
        })
      }
    }

    if (requestedType === 'all' || requestedType === 'withdraw') {
      const withdraws = await this.prisma.withdrawRequest.findMany({
        where: { status: 'pending' },
        orderBy: [{ createdAt: 'desc' }],
        take: 100,
      })
      const staffMap = await this.staffNameMap(withdraws.map(item => item.staffId))
      for (const item of withdraws) {
        items.push({
          id: `withdraw:${item.id}`,
          type: 'withdraw',
          title: '师傅提现审核',
          applicant: staffMap.get(String(item.staffId)) || `师傅${Number(item.staffId)}`,
          bizNo: `WD${Number(item.id)}`,
          amount: this.decimalToNumber(item.amount),
          status: 'pending',
          priority: 'normal',
          submittedAt: this.formatDateTime(item.createdAt),
          reason: '师傅申请提现',
          detail: `提现金额：${this.decimalToNumber(item.amount)}`,
          rawTime: item.createdAt,
        })
      }
    }

    if (requestedType === 'all' || requestedType === 'ticket') {
      const tickets = await this.prisma.ticket.findMany({
        where: { status: { in: ['open', 'pending'] } },
        include: { user: true, order: true },
        orderBy: [{ createdAt: 'desc' }],
        take: 100,
      })
      for (const item of tickets) {
        items.push({
          id: `ticket:${item.id}`,
          type: 'ticket',
          title: item.title,
          applicant: item.user.nickname || item.user.phone || '用户',
          bizNo: item.ticketNo,
          status: 'pending',
          priority: item.priority >= 2 ? 'urgent' : item.priority === 1 ? 'high' : 'normal',
          submittedAt: this.formatDateTime(item.createdAt),
          reason: item.description || '售后工单待处理',
          detail: `订单号：${item.order.orderNo}`,
          rawTime: item.createdAt,
        })
      }
    }

    const filtered = keyword
      ? items.filter(item => Object.values(item).some(value => String(value ?? '').includes(keyword)))
      : items
    filtered.sort((a, b) => b.rawTime.getTime() - a.rawTime.getTime())

    const pageItems = filtered.slice(this.skip(page), this.skip(page) + page.pageSize)
    return this.pageResult(pageItems.map(({ rawTime, ...item }) => item), page, filtered.length)
  }

  async reviewAuditItem(rawId: string, dto: AdminAuditReviewDto, context: AdminWriteContext) {
    const [type, idText] = rawId.split(':')
    const id = Number(idText)
    if (!type || !Number.isInteger(id) || id < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid audit id', 400)
    }

    if (type === 'staff') {
      return this.updateStaffStatus(id, { status: dto.action === 'approve' ? 'active' : 'disabled' }, context)
    }
    if (type === 'refund') {
      return this.reviewRefund(id, dto, context)
    }
    if (type === 'withdraw') {
      return this.reviewWithdraw(id, dto, context)
    }
    if (type === 'ticket') {
      return this.reviewTicket(id, dto, context)
    }
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'unsupported audit type', 400)
  }

  async reviewRefund(id: number, dto: AdminAuditReviewDto, context: AdminWriteContext) {
    const current = await this.prisma.refund.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound('refund not found')
    const status = dto.action === 'approve' ? 'approved' : 'rejected'
    await this.prisma.$transaction(async (tx) => {
      await tx.refund.update({
        where: { id: BigInt(id) },
        data: {
          status,
          operatedBy: BigInt(context.adminId),
          refundedAt: dto.action === 'approve' ? new Date() : current.refundedAt,
        },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: `refund:${dto.action}`,
        module: 'finance',
        targetType: 'refund',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: status, remark: dto.remark || '' },
      })
    })
    return { id, status }
  }

  async reviewWithdraw(id: number, dto: AdminAuditReviewDto, context: AdminWriteContext) {
    const current = await this.prisma.withdrawRequest.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound('withdraw request not found')
    const status = dto.action === 'approve' ? 'approved' : 'rejected'
    await this.prisma.$transaction(async (tx) => {
      await tx.withdrawRequest.update({
        where: { id: BigInt(id) },
        data: {
          status,
          handledBy: BigInt(context.adminId),
          handledAt: new Date(),
        },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: `withdraw:${dto.action}`,
        module: 'finance',
        targetType: 'withdraw_request',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: status, remark: dto.remark || '' },
      })
    })
    return { id, status }
  }

  async reviewTicket(id: number, dto: AdminAuditReviewDto, context: AdminWriteContext) {
    const current = await this.prisma.ticket.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound('ticket not found')
    const status = dto.action === 'approve' ? 'resolved' : 'rejected'
    await this.prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: BigInt(id) },
        data: {
          status,
          handledBy: BigInt(context.adminId),
          resolvedAt: dto.action === 'approve' ? new Date() : current.resolvedAt,
        },
      })
      if (dto.remark) {
        await tx.ticketMessage.create({
          data: {
            ticketId: BigInt(id),
            senderType: 'admin',
            senderId: BigInt(context.adminId),
            content: dto.remark,
          },
        })
      }
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: `ticket:${dto.action}`,
        module: 'after-sales',
        targetType: 'ticket',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: status, remark: dto.remark || '' },
      })
    })
    return { id, status }
  }

  async addTicketMessage(id: number, content: string, context: AdminWriteContext) {
    const current = await this.prisma.ticket.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound('ticket not found')
    if (!content.trim()) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'content required', 400)
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticketMessage.create({
        data: {
          ticketId: BigInt(id),
          senderType: 'admin',
          senderId: BigInt(context.adminId),
          content: content.trim(),
        },
      })
      await tx.ticket.update({
        where: { id: BigInt(id) },
        data: { handledBy: BigInt(context.adminId) },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'ticket:message:create',
        module: 'after-sales',
        targetType: 'ticket',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { content: content.trim() },
      })
      return created
    })
    return {
      id: Number(message.id),
      ticketId: id,
      content: message.content,
      createdAt: this.formatDateTime(message.createdAt),
    }
  }

  async listAuditLogs(query: AdminPageQueryDto) {
    const page = this.getPage(query)
    const where: Prisma.AuditLogWhereInput = {}
    if (page.keyword) {
      where.OR = [
        { action: { contains: page.keyword } },
        { module: { contains: page.keyword } },
        { targetType: { contains: page.keyword } },
      ]
    }
    const [total, logs] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: this.skip(page),
        take: page.pageSize,
      }),
    ])
    return this.pageResult(logs.map(log => ({
      id: String(log.id),
      operatorType: log.operatorType,
      operatorId: Number(log.operatorId),
      action: log.action,
      module: log.module,
      targetType: log.targetType || '',
      targetId: log.targetId ? Number(log.targetId) : '',
      ip: log.ip || '',
      createdAt: this.formatDateTime(log.createdAt),
    })), page, total)
  }

  private presentStaff(item: {
    id: bigint
    uuid?: string
    userId?: bigint | null
    name: string
    phone: string
    avatarUrl?: string | null
    skills: Prisma.JsonValue | null
    cityCode: string | null
    rating: Prisma.Decimal
    totalOrders: number
    status: number
    workStatus: number
    createdAt: Date
    user?: { id: bigint, nickname: string | null, phone: string | null, status: number } | null
  }) {
    return {
      id: String(item.id),
      userId: item.userId ? String(item.userId) : '',
      userName: item.user?.nickname || item.name,
      userPhone: item.user?.phone || item.phone,
      userStatus: item.user ? this.activeStatus(item.user.status) : '',
      name: item.name,
      phone: item.phone,
      avatarUrl: this.storage.signNullableUrl(item.avatarUrl || '') || item.avatarUrl || '',
      avatarOssUrl: item.avatarUrl || '',
      avatarDisplayUrl: this.storage.signNullableUrl(item.avatarUrl || '') || item.avatarUrl || '',
      skills: this.formatSkills(item.skills),
      city: item.cityCode || '',
      cityCode: item.cityCode || '',
      rating: this.decimalToNumber(item.rating),
      totalOrders: item.totalOrders,
      status: this.staffStatus(item.status),
      workStatus: this.workStatus(item.workStatus),
      createdAt: this.formatDateTime(item.createdAt),
    }
  }

  private async findStaffForUser(client: StaffBindingClient, userId: bigint | number, includeDeleted = false) {
    const id = BigInt(userId)
    return client.staff.findFirst({
      where: {
        ...(includeDeleted ? {} : { deletedAt: null }),
        userId: id,
      },
      orderBy: [{ deletedAt: 'asc' }, { id: 'desc' }],
    })
  }

  private async ensureUserForStaff(
    client: StaffBindingClient,
    params: {
      userId?: number
      name: string
      phone: string
      avatarUrl?: string
      cityCode?: string
    },
  ) {
    const data: Prisma.UserUpdateInput = {
      nickname: params.name,
      phone: params.phone,
      avatarUrl: params.avatarUrl || '',
      cityCode: params.cityCode || null,
      status: 1,
      deletedAt: null,
    }

    if (params.userId) {
      const user = await client.user.findUnique({ where: { id: BigInt(params.userId) } })
      if (!user || user.deletedAt) throw this.notFound('user not found')
      return client.user.update({
        where: { id: user.id },
        data,
      })
    }

    const matchedUsers = await client.user.findMany({
      where: { phone: params.phone, deletedAt: null },
      orderBy: { id: 'asc' },
      take: 2,
    })
    if (matchedUsers.length > 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'multiple users match staff phone; specify userId', 409)
    }
    if (matchedUsers[0]) {
      return client.user.update({
        where: { id: matchedUsers[0].id },
        data,
      })
    }

    return client.user.create({
      data: {
        nickname: params.name,
        phone: params.phone,
        avatarUrl: params.avatarUrl || '',
        cityCode: params.cityCode || null,
        status: 1,
      },
    })
  }

  private userAuditSnapshot(user: {
    nickname: string | null
    phone: string | null
    gender: number
    cityCode: string | null
    status: number
    deletedAt: Date | null
  }) {
    return {
      nickname: user.nickname,
      phone: user.phone,
      gender: user.gender,
      cityCode: user.cityCode,
      status: user.status,
      deletedAt: user.deletedAt?.toISOString() || null,
    }
  }

  private serviceAuditSnapshot(service: {
    code: string
    categoryId: bigint
    name: string
    basePrice: Prisma.Decimal
    priceUnit: string
    status: number
    deletedAt: Date | null
  }) {
    return {
      code: service.code,
      categoryId: Number(service.categoryId),
      name: service.name,
      basePrice: this.decimalToNumber(service.basePrice),
      priceUnit: service.priceUnit,
      status: service.status,
      deletedAt: service.deletedAt?.toISOString() || null,
    }
  }

  private staffAuditSnapshot(staff: {
    name: string
    phone: string
    skills: Prisma.JsonValue | null
    cityCode: string | null
    status: number
    workStatus: number
    deletedAt: Date | null
  }) {
    return {
      name: staff.name,
      phone: staff.phone,
      skills: staff.skills,
      cityCode: staff.cityCode,
      status: staff.status,
      workStatus: staff.workStatus,
      deletedAt: staff.deletedAt?.toISOString() || null,
    }
  }

  private async staffNameMap(ids: bigint[]) {
    const uniqueIds = [...new Set(ids.map(id => id.toString()))].map(id => BigInt(id))
    const staff = uniqueIds.length
      ? await this.prisma.staff.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, name: true } })
      : []
    return new Map(staff.map(item => [String(item.id), item.name]))
  }

  private presentAddress(address: {
    id: bigint
    ownerType: string
    ownerId: bigint
    addressType: string
    contactName: string
    contactPhone: string
    country: string | null
    province: string | null
    city: string | null
    district: string | null
    street: string | null
    addressTitle: string | null
    detailAddress: string
    houseNumber: string | null
    formattedAddress: string
    latitude: Prisma.Decimal | null
    longitude: Prisma.Decimal | null
    coordinateType: string | null
    poiId: string | null
    mapProvider: string | null
    isDefault: boolean
    source: string
    updatedAt: Date
  }) {
    return {
      id: Number(address.id),
      ownerType: address.ownerType,
      ownerId: Number(address.ownerId),
      addressType: address.addressType,
      contactName: address.contactName,
      contactPhone: address.contactPhone,
      country: address.country || '',
      provinceName: address.province || '',
      cityName: address.city || '',
      districtName: address.district || '',
      streetName: address.street || '',
      addressTitle: address.addressTitle || '',
      detailAddress: address.detailAddress,
      houseNumber: address.houseNumber || '',
      formattedAddress: address.formattedAddress,
      latitude: this.decimalToNumber(address.latitude) || null,
      longitude: this.decimalToNumber(address.longitude) || null,
      coordinateType: address.coordinateType || '',
      poiId: address.poiId || '',
      mapProvider: address.mapProvider || '',
      isDefault: address.isDefault,
      source: address.source,
      updatedAt: this.formatDateTime(address.updatedAt),
    }
  }

  private async addressOwnerMap(addresses: Array<{ ownerType: string, ownerId: bigint }>) {
    const userIds = addresses.filter(item => item.ownerType === 'user').map(item => item.ownerId)
    const staffIds = addresses.filter(item => item.ownerType === 'staff').map(item => item.ownerId)
    const [users, staff] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: this.uniqueBigInts(userIds) } },
            select: { id: true, nickname: true, phone: true },
          })
        : [],
      staffIds.length
        ? this.prisma.staff.findMany({
            where: { id: { in: this.uniqueBigInts(staffIds) } },
            select: { id: true, name: true, phone: true },
          })
        : [],
    ])
    const map = new Map<string, { name: string, phone: string }>()
    for (const user of users) {
      map.set(`user:${user.id}`, {
        name: user.nickname || `用户${Number(user.id)}`,
        phone: user.phone || '',
      })
    }
    for (const item of staff) {
      map.set(`staff:${item.id}`, {
        name: item.name,
        phone: item.phone,
      })
    }
    return map
  }

  private uniqueBigInts(ids: bigint[]) {
    return [...new Set(ids.map(id => id.toString()))].map(id => BigInt(id))
  }

  private getPage(query: AdminPageQueryDto): PageMeta {
    return {
      page: this.positiveInt(query.page || query.pageNum, 1, 100000),
      pageSize: this.positiveInt(query.pageSize, 20, 100),
      keyword: query.keyword || query.keywords,
    }
  }

  private pageResult<T>(items: T[], page: PageMeta, total: number) {
    return { items, page: page.page, pageSize: page.pageSize, total }
  }

  private skip(page: PageMeta) {
    return (page.page - 1) * page.pageSize
  }

  private metric(
    key: string,
    title: string,
    value: number,
    prefix: string,
    suffix: string,
    weekDelta: number,
    monthDelta: number,
    totalLabel: string,
    totalValue: number,
    icon: string,
    color: string,
  ) {
    return { key, title, value, prefix, suffix, weekDelta, monthDelta, totalLabel, totalValue, icon, color }
  }

  private positiveInt(value: unknown, fallback: number, max: number) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) return fallback
    return Math.min(parsed, max)
  }

  private activeStatus(value: number) {
    return value === 1 ? 'active' : 'disabled'
  }

  private activeStatusToNumber(value: string) {
    if (value === 'active' || value === 'published') return 1
    if (value === 'disabled' || value === 'draft') return 0
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid status', 400)
  }

  private staffStatus(value: number) {
    if (value === 2) return 'pending'
    return value === 1 ? 'active' : 'disabled'
  }

  private staffStatusToNumber(value: string) {
    if (value === 'active') return 1
    if (value === 'disabled') return 0
    if (value === 'pending') return 2
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid staff status', 400)
  }

  private workStatus(value: number) {
    if (value === 1) return 'online'
    if (value === 2) return 'busy'
    return 'offline'
  }

  private workStatusToNumber(value: string) {
    if (value === 'online') return 1
    if (value === 'busy') return 2
    if (value === 'offline') return 0
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid work status', 400)
  }

  private reviewStatus(value: number) {
    if (value === 2) return 'pending'
    return value === 1 ? 'published' : 'rejected'
  }

  private reviewStatusToNumber(value: string) {
    if (value === 'published' || value === 'active') return 1
    if (value === 'rejected' || value === 'disabled') return 0
    if (value === 'pending') return 2
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid review status', 400)
  }

  private publishStatus(value: number) {
    return value === 1 ? 'published' : 'draft'
  }

  private publishStatusToNumber(value: string) {
    if (value === 'published' || value === 'active') return 1
    if (value === 'draft' || value === 'disabled') return 0
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid publish status', 400)
  }

  private paymentStatus(value: string) {
    if (value === 'success' || value === 'paid') return 'paid'
    if (value === 'pending') return 'pending_payment'
    if (value === 'refunded') return 'refunded'
    return value
  }

  private paymentChannel(value: string) {
    if (value === 'wechat') return '微信支付'
    return value
  }

  private paymentStatusToDb(value: string) {
    if (value === 'paid') return 'success'
    if (value === 'pending_payment') return 'pending'
    return value
  }

  private orderStatusLabel(status: string) {
    const map: Record<string, string> = {
      pending_payment: '待支付',
      pending_dispatch: '待派单',
      dispatched: '已派单',
      accepted: '已接单',
      on_the_way: '上门中',
      in_service: '服务中',
      pending_confirm: '待确认',
      completed: '已完成',
      cancelled: '已取消',
      refund_pending: '退款中',
      refunded: '已退款',
      after_sales: '售后中',
    }
    return map[status] || status
  }

  private decimalToNumber(value: Prisma.Decimal | number | string | null | undefined) {
    if (value === null || value === undefined) return 0
    if (value instanceof Prisma.Decimal) return value.toNumber()
    return Number(value)
  }

  private startOfDay(date: Date) {
    const result = new Date(date)
    result.setHours(0, 0, 0, 0)
    return result
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date)
    result.setDate(result.getDate() + days)
    return result
  }

  private dateKey(date: Date) {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
  }

  private formatDateTime(date: Date) {
    return DATE_TIME_FORMAT.format(date).replace(/\//g, '-')
  }

  private snapshotName(value: Prisma.JsonValue, fallback: string) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const name = (value as JsonRecord).name
      return typeof name === 'string' ? name : fallback
    }
    return fallback
  }

  private formatSkills(value: Prisma.JsonValue | null) {
    if (Array.isArray(value)) return value.map(item => String(item)).join('、')
    if (typeof value === 'string') return value
    return ''
  }

  private requiredString(value: unknown, message: string) {
    const text = this.optionalString(value)
    if (!text) throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, message, 400)
    return text
  }

  private optionalString(value: unknown) {
    if (value === undefined || value === null) return undefined
    const text = String(value).trim()
    return text || undefined
  }

  private requiredNumber(value: unknown, message: string) {
    const number = Number(value)
    if (!Number.isFinite(number)) throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, message, 400)
    return number
  }

  private optionalNumber(value: unknown, fallback?: number) {
    if (value === undefined || value === null || value === '') return fallback
    const number = Number(value)
    return Number.isFinite(number) ? number : fallback
  }

  private optionalPositiveInt(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined
    const number = Number(value)
    return Number.isInteger(number) && number > 0 ? number : undefined
  }

  private async nextUniqueServiceCode(
    client: Prisma.TransactionClient,
    source?: string,
    excludeId?: bigint,
  ) {
    const base = this.normalizeServiceCode(source)
    for (let index = 0; index < 100; index += 1) {
      const suffix = index === 0 ? '' : `_${index + 1}`
      const candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`
      const existing = await client.service.findFirst({
        where: {
          code: candidate,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true },
      })
      if (!existing) return candidate
    }
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'service code is duplicated', 409)
  }

  private async ensureManualServiceCode(
    client: Prisma.TransactionClient,
    value: unknown,
    excludeId?: bigint,
  ) {
    const raw = this.optionalString(value)
    if (!raw) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'service code required', 400)
    }

    const code = this.normalizeServiceCode(raw, false)
    const existing = await client.service.findFirst({
      where: {
        code,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    })
    if (existing) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'service code is duplicated', 409)
    }
    return code
  }

  private normalizeServiceCode(source?: string, allowFallback = true) {
    const input = (source || `svc_${Date.now().toString(36)}`).trim().toLowerCase()
    const cleaned = input
      .normalize('NFKD')
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/-+/g, '-')
      .replace(/^[_-]+|[_-]+$/g, '')
    if (!cleaned && !allowFallback) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'service code contains no valid characters', 400)
    }
    const code = cleaned || `svc_${Date.now().toString(36)}`
    return /^[a-z0-9]/.test(code) ? code.slice(0, 64) : `svc_${code}`.slice(0, 64)
  }

  private requiredDecimal(value: unknown, message: string) {
    const number = Number(value)
    if (!Number.isFinite(number)) throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, message, 400)
    return new Prisma.Decimal(number)
  }

  private optionalDecimal(value: unknown) {
    if (value === undefined || value === null || value === '') return null
    const number = Number(value)
    return Number.isFinite(number) ? new Prisma.Decimal(number) : null
  }

  private optionalDate(value: unknown) {
    if (!value) return undefined
    const date = new Date(String(value))
    return Number.isNaN(date.getTime()) ? undefined : date
  }

  private parseJsonArray(value: unknown): Prisma.InputJsonValue {
    if (Array.isArray(value)) return value as Prisma.InputJsonArray
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return []
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (Array.isArray(parsed)) return parsed as Prisma.InputJsonArray
      }
      catch {
        return trimmed.split(/[,\s，、]+/).filter(Boolean)
      }
      return trimmed.split(/[,\s，、]+/).filter(Boolean)
    }
    return []
  }

  private notFound(message: string) {
    return new BusinessException(ErrorCode.COMMON_NOT_FOUND, message, 404)
  }
}
