import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { hashAdminPassword } from '../admin-auth/admin-password'
import { AdminAuditService } from '../audit-log/admin-audit.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { USER_COUPON_STATUS } from '../coupons/coupon-status'
import { CouponsService } from '../coupons/coupons.service'
import { MEMBER_CARD_RECORD_TYPE, MEMBER_CARD_TYPE, USER_MEMBER_CARD_STATUS } from '../member-cards/constants/member-card'
import { ORDER_STATUS } from '../orders/constants/order-status'
import { PAYMENT_STATUS } from '../payments/constants/payment-status'
import { PrismaService } from '../prisma/prisma.service'
import { REFUND_STATUS } from '../refunds/constants/refund-status'
import { RefundsService } from '../refunds/refunds.service'
import { IMAGE_BIZ_TYPE } from '../storage/image-biz-types'
import { ObjectStorageService } from '../storage/storage.service'
import { WITHDRAW_STATUS } from '../withdrawals/constants/withdraw-status'
import { WithdrawalsService } from '../withdrawals/withdrawals.service'
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
    @Inject(CouponsService) private readonly coupons: CouponsService,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
    @Inject(RefundsService) private readonly refunds: RefundsService,
    @Inject(WithdrawalsService) private readonly withdrawals: WithdrawalsService,
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
      this.prisma.withdrawRequest.count({ where: { status: { in: [WITHDRAW_STATUS.LEGACY_PENDING, WITHDRAW_STATUS.PENDING_REVIEW] } } }),
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
        source: user.source || 'miniapp',
        adminRemark: user.adminRemark || '',
        orderCount: user._count.orders,
        totalPaid: user.orders.reduce((sum, order) => sum + this.decimalToNumber(order.paidAmount), 0),
        status: this.activeStatus(user.status),
        createdAt: this.formatDateTime(user.createdAt),
      }
    }), page, total)
  }

  async createUser(body: JsonRecord, context: AdminWriteContext) {
    const phone = this.requiredString(body.phone, 'phone required')
    const source = this.normalizeUserSource(body.source)
    const addressBody = this.optionalObject(body.address)
    const existing = await this.prisma.user.findFirst({
      where: { phone, deletedAt: null },
      select: { id: true, adminRemark: true, source: true },
    })
    if (existing) {
      await this.prisma.$transaction(async (tx) => {
        if ((body.adminRemark || body.source) && (!existing.adminRemark || !existing.source)) {
          await tx.user.update({
            where: { id: existing.id },
            data: {
              adminRemark: existing.adminRemark || this.optionalString(body.adminRemark) || null,
              source: existing.source || source,
            },
          })
        }
        const address = addressBody
          ? await this.createUserServiceAddress(tx, existing.id, addressBody)
          : null
        await this.audit.writeWithClient(tx, {
          adminId: context.adminId,
          action: 'user:reuse',
          module: 'user',
          targetType: 'user',
          targetId: existing.id,
          requestId: context.requestId,
          ip: context.ip,
          detail: {
            userId: Number(existing.id),
            source,
            phone,
            addressId: address ? Number(address.id) : null,
          },
        })
      })
      return this.getUser(Number(existing.id))
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          nickname: this.optionalString(body.nickname) || this.optionalString(body.name) || phone,
          phone,
          gender: this.optionalNumber(body.gender, 0),
          cityCode: this.optionalString(body.cityCode) || null,
          source,
          adminRemark: this.optionalString(body.adminRemark) || null,
          status: body.status ? this.activeStatusToNumber(String(body.status)) : 1,
        },
      })

      const address = addressBody
        ? await this.createUserServiceAddress(tx, user.id, addressBody)
        : null

      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'user:create',
        module: 'user',
        targetType: 'user',
        targetId: user.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: {
          userId: Number(user.id),
          source,
          phone,
          addressId: address ? Number(address.id) : null,
        },
      })

      return user
    })

    return this.getUser(Number(created.id))
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
      source: user.source || 'miniapp',
      adminRemark: user.adminRemark || '',
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
    if (Object.prototype.hasOwnProperty.call(body, 'source')) data.source = this.normalizeUserSource(body.source)
    if (Object.prototype.hasOwnProperty.call(body, 'adminRemark')) data.adminRemark = this.optionalString(body.adminRemark) ?? null
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
        include: { category: true, images: { orderBy: { sortOrder: 'asc' } } },
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
      cardType: service.cardType,
      consumeUnit: service.consumeUnit || 0,
      consultationRequired: service.consultationRequired,
      serviceArea: service.serviceArea || '',
      rating: this.decimalToNumber(service.rating),
      totalOrders: service.totalOrders,
      status: this.activeStatus(service.status),
      coverImage: this.storage.signNullableUrl(service.coverImage) || service.coverImage || '',
      coverImageOssUrl: service.coverImage || '',
      coverImageDisplayUrl: this.storage.signNullableUrl(service.coverImage) || service.coverImage || '',
      images: this.storage.signUrlList(service.images.map(image => image.url).filter(Boolean)),
      imageOssUrls: service.images.map(image => image.url).filter(Boolean),
      imageDisplayUrls: this.storage.signUrlList(service.images.map(image => image.url).filter(Boolean)),
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
      const imageUrls = this.parseImageUrlList(body.images)
      imageUrls.forEach(url => this.storage.assertPermanentOssUrl(url))
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
          cardType: this.normalizeCardType(body.cardType, 'none'),
          consumeUnit: this.optionalNumber(body.consumeUnit),
          consultationRequired: this.optionalBoolean(body.consultationRequired),
          serviceArea: this.optionalString(body.serviceArea),
          notice: this.optionalString(body.notice),
          sortOrder: this.optionalNumber(body.sortOrder, 0),
          cityCode: this.optionalString(body.cityCode),
          status: this.activeStatusToNumber(this.optionalString(body.status) || 'active'),
        },
      })
      await this.replaceServiceImages(tx, service.id, imageUrls)
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
    await this.storage.bindFilesToBiz([created.coverImage], IMAGE_BIZ_TYPE.SERVICE_COVER, created.id)
    await this.storage.bindFilesToBiz(this.parseImageUrlList(body.images), IMAGE_BIZ_TYPE.SERVICE_IMAGE, created.id)
    return created
  }

  async updateService(id: number, body: JsonRecord, context: AdminWriteContext) {
    const current = await this.prisma.service.findFirst({ where: { id: BigInt(id), deletedAt: null } })
    if (!current) throw this.notFound('service not found')
    const updated = await this.prisma.$transaction(async (tx) => {
      const coverImage = Object.prototype.hasOwnProperty.call(body, 'coverImage')
        ? this.optionalString(body.coverImage)
        : current.coverImage || undefined
      this.storage.assertPermanentOssUrl(coverImage)
      const hasImages = Object.prototype.hasOwnProperty.call(body, 'images')
      const imageUrls = hasImages ? this.parseImageUrlList(body.images) : undefined
      imageUrls?.forEach(url => this.storage.assertPermanentOssUrl(url))
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
          cardType: body.cardType === undefined ? current.cardType : this.normalizeCardType(body.cardType, current.cardType),
          consumeUnit: body.consumeUnit === undefined ? current.consumeUnit : this.optionalNumber(body.consumeUnit),
          consultationRequired: body.consultationRequired === undefined ? current.consultationRequired : this.optionalBoolean(body.consultationRequired),
          serviceArea: this.optionalString(body.serviceArea),
          notice: this.optionalString(body.notice),
          sortOrder: this.optionalNumber(body.sortOrder, current.sortOrder),
          cityCode: this.optionalString(body.cityCode),
          status: body.status ? this.activeStatusToNumber(String(body.status)) : current.status,
        },
      })
      if (imageUrls) {
        await this.replaceServiceImages(tx, service.id, imageUrls)
      }
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
    await this.storage.bindFilesToBiz([updated.coverImage], IMAGE_BIZ_TYPE.SERVICE_COVER, updated.id)
    if (Object.prototype.hasOwnProperty.call(body, 'images')) {
      await this.storage.bindFilesToBiz(this.parseImageUrlList(body.images), IMAGE_BIZ_TYPE.SERVICE_IMAGE, updated.id)
    }
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

  async listHomeBanners(query: AdminPageQueryDto) {
    const page = this.getPage(query)
    const where: Prisma.HomeBannerWhereInput = {}
    if (query.status) where.status = this.activeStatusToNumber(query.status)
    if (page.keyword) {
      where.OR = [
        { title: { contains: page.keyword } },
        { subtitle: { contains: page.keyword } },
        { linkValue: { contains: page.keyword } },
      ]
    }

    const [total, banners] = await this.prisma.$transaction([
      this.prisma.homeBanner.count({ where }),
      this.prisma.homeBanner.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        skip: this.skip(page),
        take: page.pageSize,
      }),
    ])

    return this.pageResult(banners.map(banner => this.presentHomeBanner(banner)), page, total)
  }

  async createHomeBanner(body: JsonRecord, context: AdminWriteContext) {
    const imageUrl = this.requiredString(body.imageUrl, 'imageUrl required')
    this.storage.assertPermanentOssUrl(imageUrl, { force: true })
    const linkType = this.homeBannerLinkType(body.linkType)
    const linkValue = this.homeBannerLinkValue(linkType, body.linkValue)

    const created = await this.prisma.$transaction(async (tx) => {
      const banner = await tx.homeBanner.create({
        data: {
          title: this.requiredString(body.title, 'title required'),
          subtitle: this.optionalString(body.subtitle),
          imageUrl,
          linkType,
          linkValue,
          sortOrder: this.optionalNumber(body.sortOrder, 0),
          status: this.activeStatusToNumber(this.optionalString(body.status) || 'active'),
        },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'home-banner:create',
        module: 'marketing',
        targetType: 'home_banner',
        targetId: banner.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { title: banner.title, linkType: banner.linkType, linkValue: banner.linkValue },
      })
      return banner
    })

    await this.storage.bindFilesToBiz([created.imageUrl], IMAGE_BIZ_TYPE.HOME_BANNER, created.id)
    return this.presentHomeBanner(created)
  }

  async updateHomeBanner(id: number, body: JsonRecord, context: AdminWriteContext) {
    const current = await this.prisma.homeBanner.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound('home banner not found')

    const imageUrl = Object.prototype.hasOwnProperty.call(body, 'imageUrl')
      ? this.requiredString(body.imageUrl, 'imageUrl required')
      : current.imageUrl
    this.storage.assertPermanentOssUrl(imageUrl, { force: true })
    const linkType = Object.prototype.hasOwnProperty.call(body, 'linkType')
      ? this.homeBannerLinkType(body.linkType)
      : current.linkType
    const linkValue = Object.prototype.hasOwnProperty.call(body, 'linkValue')
      ? this.homeBannerLinkValue(linkType, body.linkValue)
      : current.linkValue

    const updated = await this.prisma.$transaction(async (tx) => {
      const banner = await tx.homeBanner.update({
        where: { id: BigInt(id) },
        data: {
          title: this.optionalString(body.title) ?? current.title,
          subtitle: this.optionalString(body.subtitle),
          imageUrl,
          linkType,
          linkValue,
          sortOrder: this.optionalNumber(body.sortOrder, current.sortOrder),
          status: body.status ? this.activeStatusToNumber(String(body.status)) : current.status,
        },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'home-banner:update',
        module: 'marketing',
        targetType: 'home_banner',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: {
          before: this.homeBannerAuditSnapshot(current),
          after: this.homeBannerAuditSnapshot(banner),
        },
      })
      return banner
    })

    await this.storage.bindFilesToBiz([updated.imageUrl], IMAGE_BIZ_TYPE.HOME_BANNER, updated.id)
    return this.presentHomeBanner(updated)
  }

  async updateHomeBannerStatus(id: number, dto: AdminStatusDto, context: AdminWriteContext) {
    const current = await this.prisma.homeBanner.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound('home banner not found')
    const status = this.activeStatusToNumber(dto.status)
    await this.prisma.$transaction(async (tx) => {
      await tx.homeBanner.update({ where: { id: BigInt(id) }, data: { status } })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'home-banner:status:update',
        module: 'marketing',
        targetType: 'home_banner',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: status },
      })
    })
    return { id, status: this.activeStatus(status) }
  }

  async deleteHomeBanner(id: number, context: AdminWriteContext) {
    const current = await this.prisma.homeBanner.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound('home banner not found')

    await this.prisma.$transaction(async (tx) => {
      await tx.homeBanner.delete({ where: { id: BigInt(id) } })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'home-banner:delete',
        module: 'marketing',
        targetType: 'home_banner',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: this.homeBannerAuditSnapshot(current) },
      })
    })

    return { id, deleted: true }
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
    this.storage.assertPermanentOssUrl(avatarUrl, { force: true })
    const applicationImages = this.parseImageUrlList(body.applicationImages)
    applicationImages.forEach(url => this.storage.assertPermanentOssUrl(url))
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
        applicationNote: this.optionalString(body.applicationNote),
        applicationImages,
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
    await this.storage.bindFilesToBiz([created.avatarUrl], IMAGE_BIZ_TYPE.STAFF_AVATAR, created.id)
    await this.storage.bindFilesToBiz(applicationImages, IMAGE_BIZ_TYPE.STAFF_APPLICATION, created.id)
    return this.presentStaff(created)
  }

  async updateStaff(id: number, body: JsonRecord, context: AdminWriteContext) {
    const current = await this.prisma.staff.findFirst({ where: { id: BigInt(id), deletedAt: null } })
    if (!current) throw this.notFound('staff not found')
    const name = this.optionalString(body.name) ?? current.name
    const phone = this.optionalString(body.phone) ?? current.phone
    const avatarUrl = this.optionalString(body.avatarUrl)
    this.storage.assertPermanentOssUrl(avatarUrl, { force: true })
    const hasApplicationImages = Object.prototype.hasOwnProperty.call(body, 'applicationImages')
    const applicationImages = hasApplicationImages ? this.parseImageUrlList(body.applicationImages) : undefined
    applicationImages?.forEach(url => this.storage.assertPermanentOssUrl(url))
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
          applicationNote: body.applicationNote === undefined ? current.applicationNote : this.optionalString(body.applicationNote),
          applicationImages: applicationImages === undefined ? current.applicationImages as Prisma.InputJsonValue : applicationImages,
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
    await this.storage.bindFilesToBiz([updated.avatarUrl], IMAGE_BIZ_TYPE.STAFF_AVATAR, updated.id)
    if (applicationImages) {
      await this.storage.bindFilesToBiz(applicationImages, IMAGE_BIZ_TYPE.STAFF_APPLICATION, updated.id)
    }
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
      status: payment.status === 'refunded' || payment.refunds.some(refund => refund.status === 'refunded')
        ? 'refunded'
        : this.paymentStatus(payment.status),
      paidAt: payment.paidAt ? this.formatDateTime(payment.paidAt) : this.formatDateTime(payment.createdAt),
    })), page, total)
  }

  async getFinanceSummary(query: AdminPageQueryDto) {
    const range = this.dateRangeFromQuery(query)
    const paidStatuses = [PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.PARTIAL_REFUNDED, PAYMENT_STATUS.REFUNDED]

    const orderWhere: Prisma.OrderWhereInput = {}
    if (range) orderWhere.createdAt = range
    if (query.source) orderWhere.source = query.source
    if (query.channel) {
      orderWhere.payments = { some: { channel: query.channel, status: { in: paidStatuses } } }
    }

    const paymentWhere: Prisma.PaymentWhereInput = { status: { in: paidStatuses } }
    if (range) paymentWhere.paidAt = range
    if (query.channel) paymentWhere.channel = query.channel
    if (query.source) paymentWhere.order = { source: query.source }

    const refundWhere: Prisma.RefundWhereInput = { status: REFUND_STATUS.REFUNDED }
    if (range) refundWhere.refundedAt = range
    if (query.source) refundWhere.order = { source: query.source }
    if (query.channel) refundWhere.payment = { channel: query.channel }

    const incomeWhere: Prisma.StaffIncomeRecordWhereInput = {}
    if (range) incomeWhere.createdAt = range
    if (query.source || query.channel) {
      incomeWhere.order = {
        ...(query.source ? { source: query.source } : {}),
        ...(query.channel ? { payments: { some: { channel: query.channel, status: { in: paidStatuses } } } } : {}),
      }
    }

    const withdrawWhere: Prisma.WithdrawRequestWhereInput = {}
    if (range) withdrawWhere.createdAt = range
    if (query.channel) withdrawWhere.channel = query.channel

    const pointWhere: Prisma.PointLedgerWhereInput = {}
    if (range) pointWhere.createdAt = range
    if (query.source || query.channel) {
      pointWhere.order = {
        ...(query.source ? { source: query.source } : {}),
        ...(query.channel ? { payments: { some: { channel: query.channel, status: { in: paidStatuses } } } } : {}),
      }
    }

    const couponOrderWhere: Prisma.OrderWhereInput = { ...orderWhere, couponId: { not: null } }

    const [
      orderAggregate,
      couponOrderAggregate,
      paymentAggregate,
      refundAggregate,
      incomeAggregate,
      incomeByStatus,
      incomeBySettlement,
      incomeByWithdraw,
      withdrawByStatus,
      pointLedgers,
      ordersBySource,
      ordersByStatus,
      paymentsByChannel,
      refundsByStatus,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: orderWhere,
        _count: { _all: true },
        _sum: { originalAmount: true, discountAmount: true, payableAmount: true, paidAmount: true },
      }),
      this.prisma.order.aggregate({
        where: couponOrderWhere,
        _count: { _all: true },
        _sum: { discountAmount: true },
      }),
      this.prisma.payment.aggregate({
        where: paymentWhere,
        _count: { _all: true },
        _sum: { amount: true, refundedAmount: true },
      }),
      this.prisma.refund.aggregate({
        where: refundWhere,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.staffIncomeRecord.aggregate({
        where: incomeWhere,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.staffIncomeRecord.groupBy({
        by: ['status'],
        where: incomeWhere,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.staffIncomeRecord.groupBy({
        by: ['settlementStatus'],
        where: incomeWhere,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.staffIncomeRecord.groupBy({
        by: ['withdrawStatus'],
        where: incomeWhere,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.withdrawRequest.groupBy({
        by: ['status'],
        where: withdrawWhere,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.pointLedger.findMany({
        where: pointWhere,
        select: { type: true, points: true, amount: true },
      }),
      this.prisma.order.groupBy({
        by: ['source'],
        where: orderWhere,
        _count: { _all: true },
        _sum: { originalAmount: true, discountAmount: true, payableAmount: true, paidAmount: true },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: orderWhere,
        _count: { _all: true },
        _sum: { payableAmount: true, paidAmount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['channel'],
        where: paymentWhere,
        _count: { _all: true },
        _sum: { amount: true, refundedAmount: true },
      }),
      this.prisma.refund.groupBy({
        by: ['status'],
        where: {
          ...(range ? { createdAt: range } : {}),
          ...(query.source ? { order: { source: query.source } } : {}),
          ...(query.channel ? { payment: { channel: query.channel } } : {}),
        },
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ])

    const paidAmount = this.decimalToNumber(paymentAggregate._sum.amount)
    const refundAmount = this.decimalToNumber(refundAggregate._sum.amount)
    const pointSummary = pointLedgers.reduce((acc, item) => {
      acc.net += item.points
      if (item.points > 0) acc.earned += item.points
      if (item.points < 0) acc.deducted += Math.abs(item.points)
      const current = acc.byType.get(item.type) || { type: item.type, points: 0, amount: 0, count: 0 }
      current.points += item.points
      current.amount += this.decimalToNumber(item.amount)
      current.count += 1
      acc.byType.set(item.type, current)
      return acc
    }, { earned: 0, deducted: 0, net: 0, byType: new Map<string, { type: string, points: number, amount: number, count: number }>() })

    return {
      filters: {
        startDate: range?.gte instanceof Date ? range.gte.toISOString() : null,
        endDate: range?.lte instanceof Date ? range.lte.toISOString() : null,
        source: query.source || '',
        channel: query.channel || '',
      },
      summary: {
        orderCount: orderAggregate._count._all,
        grossAmount: this.decimalToNumber(orderAggregate._sum.originalAmount),
        discountAmount: this.decimalToNumber(orderAggregate._sum.discountAmount),
        couponOrderCount: couponOrderAggregate._count._all,
        couponDiscount: this.decimalToNumber(couponOrderAggregate._sum.discountAmount),
        payableAmount: this.decimalToNumber(orderAggregate._sum.payableAmount),
        orderPaidAmount: this.decimalToNumber(orderAggregate._sum.paidAmount),
        paymentCount: paymentAggregate._count._all,
        paidAmount,
        paymentRefundedAmount: this.decimalToNumber(paymentAggregate._sum.refundedAmount),
        refundCount: refundAggregate._count._all,
        refundAmount,
        netRevenue: paidAmount - refundAmount,
        incomeCount: incomeAggregate._count._all,
        incomeAmount: this.decimalToNumber(incomeAggregate._sum.amount),
        pointsEarned: pointSummary.earned,
        pointsDeducted: pointSummary.deducted,
        pointsNet: pointSummary.net,
      },
      breakdowns: {
        ordersBySource: ordersBySource.map(item => ({
          source: item.source,
          count: item._count._all,
          grossAmount: this.decimalToNumber(item._sum.originalAmount),
          discountAmount: this.decimalToNumber(item._sum.discountAmount),
          payableAmount: this.decimalToNumber(item._sum.payableAmount),
          paidAmount: this.decimalToNumber(item._sum.paidAmount),
        })),
        ordersByStatus: ordersByStatus.map(item => ({
          status: item.status,
          label: this.orderStatusLabel(item.status),
          count: item._count._all,
          payableAmount: this.decimalToNumber(item._sum.payableAmount),
          paidAmount: this.decimalToNumber(item._sum.paidAmount),
        })),
        paymentsByChannel: paymentsByChannel.map(item => ({
          channel: item.channel,
          count: item._count._all,
          amount: this.decimalToNumber(item._sum.amount),
          refundedAmount: this.decimalToNumber(item._sum.refundedAmount),
          netAmount: this.decimalToNumber(item._sum.amount) - this.decimalToNumber(item._sum.refundedAmount),
        })),
        refundsByStatus: refundsByStatus.map(item => ({
          status: item.status,
          count: item._count._all,
          amount: this.decimalToNumber(item._sum.amount),
        })),
        incomeByStatus: incomeByStatus.map(item => ({
          status: item.status,
          count: item._count._all,
          amount: this.decimalToNumber(item._sum.amount),
        })),
        incomeBySettlement: incomeBySettlement.map(item => ({
          status: item.settlementStatus,
          count: item._count._all,
          amount: this.decimalToNumber(item._sum.amount),
        })),
        incomeByWithdraw: incomeByWithdraw.map(item => ({
          status: item.withdrawStatus,
          count: item._count._all,
          amount: this.decimalToNumber(item._sum.amount),
        })),
        withdrawsByStatus: withdrawByStatus.map(item => ({
          status: item.status,
          count: item._count._all,
          amount: this.decimalToNumber(item._sum.amount),
        })),
        pointsByType: Array.from(pointSummary.byType.values()),
      },
    }
  }

  async listPointLedgers(query: AdminPageQueryDto) {
    const page = this.getPage(query)
    const where: Prisma.PointLedgerWhereInput = {}
    const type = query.type || query.status
    if (type && type !== 'all') where.type = type
    if (query.userId) where.userId = BigInt(Number(query.userId))
    const range = this.dateRangeFromQuery(query)
    if (range) where.createdAt = range
    if (page.keyword) {
      where.OR = [
        { type: { contains: page.keyword } },
        { remark: { contains: page.keyword } },
        { user: { nickname: { contains: page.keyword } } },
        { user: { phone: { contains: page.keyword } } },
        { order: { orderNo: { contains: page.keyword } } },
      ]
    }

    const [total, ledgers] = await this.prisma.$transaction([
      this.prisma.pointLedger.count({ where }),
      this.prisma.pointLedger.findMany({
        where,
        include: { user: true, order: { select: { id: true, orderNo: true, source: true, status: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: this.skip(page),
        take: page.pageSize,
      }),
    ])

    return this.pageResult(ledgers.map(item => ({
      id: String(item.id),
      userId: String(item.userId),
      userName: item.user.nickname || '',
      userPhone: item.user.phone || '',
      orderId: item.orderId ? String(item.orderId) : '',
      orderNo: item.order?.orderNo || '',
      orderSource: item.order?.source || '',
      orderStatus: item.order?.status || '',
      type: item.type,
      points: item.points,
      amount: this.decimalToNumber(item.amount),
      balanceAfter: item.balanceAfter,
      remark: item.remark || '',
      createdAt: this.formatDateTime(item.createdAt),
    })), page, total)
  }

  async getAdminUserPoints(id: number) {
    const user = await this.prisma.user.findFirst({ where: { id: BigInt(id), deletedAt: null } })
    if (!user) throw this.notFound('user not found')
    const [summary, recentLedgers] = await Promise.all([
      this.prisma.pointLedger.aggregate({
        where: { userId: user.id },
        _sum: { points: true, amount: true },
        _count: { _all: true },
      }),
      this.prisma.pointLedger.findMany({
        where: { userId: user.id },
        include: { order: { select: { id: true, orderNo: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 10,
      }),
    ])

    return {
      userId: Number(user.id),
      userName: user.nickname || '',
      userPhone: user.phone || '',
      totalPoints: summary._sum.points || 0,
      availablePoints: summary._sum.points || 0,
      totalAmount: this.decimalToNumber(summary._sum.amount),
      ledgerCount: summary._count._all,
      recentLedgers: recentLedgers.map(item => ({
        id: Number(item.id),
        orderId: item.orderId ? Number(item.orderId) : null,
        orderNo: item.order?.orderNo || '',
        type: item.type,
        points: item.points,
        amount: this.decimalToNumber(item.amount),
        balanceAfter: item.balanceAfter,
        remark: item.remark || '',
        createdAt: this.formatDateTime(item.createdAt),
      })),
    }
  }

  async listUsableUserCouponsForOrderEntry(id: number, query: Record<string, unknown>) {
    const user = await this.prisma.user.findFirst({ where: { id: BigInt(id), deletedAt: null, status: 1 } })
    if (!user) throw this.notFound('user not found')

    const amount = this.optionalNumber(query.amount, 0) || 0
    let serviceId = this.optionalNumber(query.serviceId)
    const target = this.optionalString(query.target)
    if (!serviceId && target === 'member_card_purchase') {
      const purchaseService = await this.prisma.service.findFirst({
        where: { code: 'member_card_purchase' },
        select: { id: true },
      })
      serviceId = purchaseService ? Number(purchaseService.id) : undefined
    }

    return this.coupons.listUsableUserCoupons(id, {
      serviceId,
      amount,
    })
  }

  async adjustUserPoints(id: number, body: JsonRecord, context: AdminWriteContext) {
    const points = Number(body.points)
    if (!Number.isInteger(points) || points === 0) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'points must be non-zero integer', 400)
    }
    const remark = this.optionalString(body.remark) || 'admin point adjustment'
    const amount = this.optionalDecimal(body.amount)
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({ where: { id: BigInt(id), deletedAt: null } })
      if (!user) throw this.notFound('user not found')
      const summary = await tx.pointLedger.aggregate({
        where: { userId: user.id },
        _sum: { points: true },
      })
      const balanceAfter = (summary._sum.points || 0) + points
      const ledger = await tx.pointLedger.create({
        data: {
          userId: user.id,
          type: 'admin_adjust',
          points,
          amount,
          balanceAfter,
          remark,
        },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'points:adjust',
        module: 'finance',
        targetType: 'user',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { points, balanceAfter, remark },
      })
      return ledger
    })

    return {
      id: Number(created.id),
      userId: id,
      type: created.type,
      points: created.points,
      amount: this.decimalToNumber(created.amount),
      balanceAfter: created.balanceAfter,
      remark: created.remark || '',
      createdAt: this.formatDateTime(created.createdAt),
    }
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
    const couponIds = coupons.map(coupon => coupon.id)
    const statusCounts = couponIds.length
      ? await this.prisma.userCoupon.groupBy({
          by: ['couponId', 'status'],
          where: { couponId: { in: couponIds } },
          _count: { _all: true },
        })
      : []
    const statusCountMap = new Map<string, Record<string, number>>()
    for (const item of statusCounts) {
      const key = String(item.couponId)
      const current = statusCountMap.get(key) || {}
      current[item.status] = item._count._all
      statusCountMap.set(key, current)
    }

    return this.pageResult(coupons.map((coupon) => {
      const counts = statusCountMap.get(String(coupon.id)) || {}
      return {
        id: String(coupon.id),
        name: coupon.name,
        type: coupon.type,
        amount: this.decimalToNumber(coupon.amount),
        minAmount: this.decimalToNumber(coupon.minAmount),
        totalCount: coupon.totalCount,
        issuedCount: coupon.issuedCount,
        receivedCount: coupon._count.userCoupons,
        availableCount: counts[USER_COUPON_STATUS.AVAILABLE] || 0,
        lockedCount: counts[USER_COUPON_STATUS.LOCKED] || 0,
        usedCount: counts[USER_COUPON_STATUS.USED] || 0,
        expiredCount: counts[USER_COUPON_STATUS.EXPIRED] || 0,
        releasedCount: counts[USER_COUPON_STATUS.RELEASED] || 0,
        invalidCount: counts[USER_COUPON_STATUS.INVALID] || 0,
        status: this.publishStatus(coupon.status),
        startTime: this.formatDateTime(coupon.startTime),
        endTime: this.formatDateTime(coupon.endTime),
      }
    }), page, total)
  }

  async listUserCouponsAdmin(query: AdminPageQueryDto) {
    const page = this.getPage(query)
    const where: Prisma.UserCouponWhereInput = {}
    if (query.status && query.status !== 'all') where.status = query.status
    if (query.couponId) where.couponId = BigInt(Number(query.couponId))
    if (query.userId) where.userId = BigInt(Number(query.userId))
    if (page.keyword) {
      const matchedOrders = await this.prisma.order.findMany({
        where: { orderNo: { contains: page.keyword } },
        select: { id: true },
        take: 100,
      })
      where.OR = [
        { coupon: { name: { contains: page.keyword } } },
        { user: { nickname: { contains: page.keyword } } },
        { user: { phone: { contains: page.keyword } } },
        ...(matchedOrders.length ? [{ usedOrderId: { in: matchedOrders.map(order => order.id) } }] : []),
      ]
    }

    const [total, userCoupons] = await this.prisma.$transaction([
      this.prisma.userCoupon.count({ where }),
      this.prisma.userCoupon.findMany({
        where,
        include: { coupon: true, user: true },
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        skip: this.skip(page),
        take: page.pageSize,
      }),
    ])
    const usedOrderIds = userCoupons.map(item => item.usedOrderId).filter((id): id is bigint => Boolean(id))
    const orders = usedOrderIds.length
      ? await this.prisma.order.findMany({
          where: { id: { in: this.uniqueBigInts(usedOrderIds) } },
          select: { id: true, orderNo: true, status: true, source: true },
        })
      : []
    const orderMap = new Map(orders.map(order => [String(order.id), order]))

    return this.pageResult(userCoupons.map((item) => {
      const order = item.usedOrderId ? orderMap.get(String(item.usedOrderId)) : undefined
      return {
        id: String(item.id),
        couponId: String(item.couponId),
        couponName: item.coupon.name,
        couponType: item.coupon.type,
        couponAmount: this.decimalToNumber(item.coupon.amount),
        couponMinAmount: this.decimalToNumber(item.coupon.minAmount),
        userId: String(item.userId),
        userName: item.user.nickname || '',
        userPhone: item.user.phone || '',
        status: item.status,
        usedOrderId: item.usedOrderId ? String(item.usedOrderId) : '',
        usedOrderNo: order?.orderNo || '',
        usedOrderStatus: order?.status || '',
        usedOrderSource: order?.source || '',
        receivedAt: this.formatDateTime(item.receivedAt),
        usedAt: item.usedAt ? this.formatDateTime(item.usedAt) : '',
        expireAt: this.formatDateTime(item.expireAt),
      }
    }), page, total)
  }

  async grantCoupon(id: number, body: JsonRecord, context: AdminWriteContext) {
    const userIdFromBody = this.optionalNumber(body.userId)
    const phone = this.optionalString(body.phone)
    if (!userIdFromBody && !phone) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'userId or phone required', 400)
    }
    const remark = this.optionalString(body.remark) || 'admin grant coupon'
    const now = new Date()

    const created = await this.prisma.$transaction(async (tx) => {
      const coupon = await tx.coupon.findUnique({ where: { id: BigInt(id) } })
      if (!coupon) throw this.notFound('coupon not found')
      if (coupon.status !== 1 || coupon.startTime > now || coupon.endTime <= now) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'coupon is not grantable', 409)
      }
      const user = userIdFromBody
        ? await tx.user.findFirst({ where: { id: BigInt(userIdFromBody), deletedAt: null } })
        : await tx.user.findFirst({ where: { phone, deletedAt: null }, orderBy: { id: 'desc' } })
      if (!user) throw this.notFound('user not found')

      const existing = await tx.userCoupon.findFirst({
        where: {
          couponId: coupon.id,
          userId: user.id,
          status: { in: [USER_COUPON_STATUS.AVAILABLE, USER_COUPON_STATUS.LOCKED] },
        },
        include: { coupon: true, user: true },
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      })
      if (existing) return existing

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

      const userCoupon = await tx.userCoupon.create({
        data: {
          couponId: coupon.id,
          userId: user.id,
          status: USER_COUPON_STATUS.AVAILABLE,
          expireAt: coupon.endTime,
        },
        include: { coupon: true, user: true },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'coupon:grant',
        module: 'marketing',
        targetType: 'coupon',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { userId: Number(user.id), userCouponId: Number(userCoupon.id), remark },
      })
      return userCoupon
    })

    return {
      id: String(created.id),
      couponId: String(created.couponId),
      couponName: created.coupon.name,
      userId: String(created.userId),
      userName: created.user.nickname || '',
      userPhone: created.user.phone || '',
      status: created.status,
      receivedAt: this.formatDateTime(created.receivedAt),
      expireAt: this.formatDateTime(created.expireAt),
    }
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
        include: {
          _count: { select: { userCards: true, serviceRuleItems: true } },
          serviceRuleItems: {
            where: { status: 1 },
            include: { service: true },
            orderBy: [{ serviceId: 'asc' }, { id: 'asc' }],
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: this.skip(page),
        take: page.pageSize,
      }),
    ])

    return this.pageResult(cards.map(card => ({
      id: String(card.id),
      name: card.name,
      totalTimes: card.totalTimes,
      cardType: card.cardType,
      unitName: card.unitName,
      unitMinutes: card.unitMinutes || 0,
      totalUnits: card.totalUnits,
      allowHalfDeduct: card.allowHalfDeduct,
      minConsumeUnits: card.minConsumeUnits,
      applicableServices: Array.isArray(card.applicableServices) ? card.applicableServices.join(',') : '',
      serviceRules: card.serviceRules ? JSON.stringify(card.serviceRules) : '',
      serviceRuleList: this.presentMemberCardServiceRules(card.serviceRuleItems),
      serviceRuleCount: card._count.serviceRuleItems,
      effectiveRuleSummary: this.memberCardRuleSummary(card.serviceRuleItems),
      price: this.decimalToNumber(card.price),
      validityDays: card.validityDays,
      soldCount: card._count.userCards,
      status: this.publishStatus(card.status),
      updatedAt: this.formatDateTime(card.updatedAt),
    })), page, total)
  }

  async createMemberCard(body: JsonRecord, context: AdminWriteContext) {
    const created = await this.prisma.$transaction(async (tx) => {
      const totalUnits = this.optionalNumber(body.totalUnits)
      const totalTimes = this.optionalNumber(body.totalTimes, totalUnits)
      if (!totalTimes || totalTimes <= 0) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'totalUnits required', 400)
      }
      const card = await tx.memberCard.create({
        data: {
          name: this.requiredString(body.name, 'name required'),
          applicableServices: this.parseJsonArray(body.applicableServices),
          totalTimes,
          cardType: this.normalizeCardType(body.cardType, 'times'),
          unitName: this.optionalString(body.unitName) || '次',
          unitMinutes: this.optionalPositiveInt(body.unitMinutes),
          totalUnits: this.optionalNumber(body.totalUnits, totalTimes) || totalTimes,
          serviceRules: this.parseJsonObject(body.serviceRules),
          allowHalfDeduct: this.optionalBoolean(body.allowHalfDeduct),
          minConsumeUnits: this.optionalNumber(body.minConsumeUnits, 1),
          price: this.requiredDecimal(body.price, 'price required'),
          validityDays: this.requiredNumber(body.validityDays, 'validityDays required'),
          status: this.publishStatusToNumber(this.optionalString(body.status) || 'draft'),
        },
      })
      await this.syncMemberCardServiceRulesFromBody(tx, card, body)
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
          cardType: body.cardType === undefined ? current.cardType : this.normalizeCardType(body.cardType, current.cardType),
          unitName: this.optionalString(body.unitName) ?? current.unitName,
          unitMinutes: body.unitMinutes === undefined ? current.unitMinutes : this.optionalPositiveInt(body.unitMinutes),
          totalUnits: this.optionalNumber(body.totalUnits, current.totalUnits || current.totalTimes),
          serviceRules: body.serviceRules === undefined ? current.serviceRules as Prisma.InputJsonValue : this.parseJsonObject(body.serviceRules),
          allowHalfDeduct: body.allowHalfDeduct === undefined ? current.allowHalfDeduct : this.optionalBoolean(body.allowHalfDeduct),
          minConsumeUnits: this.optionalNumber(body.minConsumeUnits, current.minConsumeUnits),
          price: body.price === undefined ? current.price : this.requiredDecimal(body.price, 'price required'),
          validityDays: this.optionalNumber(body.validityDays, current.validityDays),
          status: body.status ? this.publishStatusToNumber(String(body.status)) : current.status,
        },
      })
      if (this.shouldSyncMemberCardServiceRules(body)) {
        await this.syncMemberCardServiceRulesFromBody(tx, card, body)
      }
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

  async getMemberCardServiceRules(id: number) {
    const card = await this.prisma.memberCard.findUnique({
      where: { id: BigInt(id) },
      include: {
        serviceRuleItems: {
          include: { service: true },
          orderBy: [{ status: 'desc' }, { serviceId: 'asc' }, { id: 'asc' }],
        },
      },
    })
    if (!card) throw this.notFound('member card not found')
    return {
      id: String(card.id),
      name: card.name,
      cardType: card.cardType,
      totalUnits: card.totalUnits || card.totalTimes,
      serviceRuleList: this.presentMemberCardServiceRules(card.serviceRuleItems),
      serviceRuleCount: card.serviceRuleItems.length,
      effectiveRuleSummary: this.memberCardRuleSummary(card.serviceRuleItems),
      applicableServices: Array.isArray(card.applicableServices) ? card.applicableServices.join(',') : '',
      serviceRules: card.serviceRules || {},
    }
  }

  async updateMemberCardServiceRules(id: number, body: JsonRecord, context: AdminWriteContext) {
    const card = await this.prisma.memberCard.findUnique({ where: { id: BigInt(id) } })
    if (!card) throw this.notFound('member card not found')
    await this.prisma.$transaction(async (tx) => {
      await this.replaceMemberCardServiceRules(tx, card, this.parseMemberCardServiceRuleInput(body.serviceRuleList ?? body.rules ?? body.serviceRulesV2) || [])
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'member-card:service-rules:update',
        module: 'marketing',
        targetType: 'member_card',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: {
          ruleCount: (this.parseMemberCardServiceRuleInput(body.serviceRuleList ?? body.rules ?? body.serviceRulesV2) || []).length,
        },
      })
    })
    return this.getMemberCardServiceRules(id)
  }

  async auditMemberCardRules(query: AdminPageQueryDto) {
    const page = this.getPage(query)
    const cards = await this.prisma.memberCard.findMany({
      include: {
        serviceRuleItems: {
          include: { service: true },
          orderBy: [{ serviceId: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    })

    const issues: Array<Record<string, unknown>> = []
    for (const card of cards) {
      const totalUnits = card.totalUnits || card.totalTimes
      const legacyApplicable = this.jsonStringArray(card.applicableServices)
      if (legacyApplicable.length && !card.serviceRuleItems.length) {
        issues.push({
          level: 'warning',
          code: 'legacy_json_not_migrated',
          memberCardId: Number(card.id),
          memberCardName: card.name,
          message: 'legacy applicableServices exists but structured service rules are empty',
        })
      }
      for (const rule of card.serviceRuleItems) {
        const serviceCardType = this.resolveServiceCardType(rule.service)
        if (serviceCardType !== card.cardType) {
          issues.push({
            level: 'error',
            code: 'card_type_mismatch',
            memberCardId: Number(card.id),
            memberCardName: card.name,
            serviceId: Number(rule.serviceId),
            serviceName: rule.service.name,
            cardType: card.cardType,
            serviceCardType,
            message: 'member card type does not match service card type',
          })
        }
        if (rule.service.deletedAt || rule.service.status !== 1) {
          issues.push({
            level: 'warning',
            code: 'service_inactive',
            memberCardId: Number(card.id),
            memberCardName: card.name,
            serviceId: Number(rule.serviceId),
            serviceName: rule.service.name,
            message: 'structured rule references inactive or deleted service',
          })
        }
        if (rule.consumeUnits <= 0 || rule.consumeUnits > totalUnits) {
          issues.push({
            level: rule.consumeUnits <= 0 ? 'error' : 'warning',
            code: 'consume_units_invalid',
            memberCardId: Number(card.id),
            memberCardName: card.name,
            serviceId: Number(rule.serviceId),
            serviceName: rule.service.name,
            consumeUnits: rule.consumeUnits,
            totalUnits,
            message: 'consume units must be positive and should not exceed card total units',
          })
        }
      }
    }

    const keyword = page.keyword?.toLowerCase()
    const filtered = keyword
      ? issues.filter(item => JSON.stringify(item).toLowerCase().includes(keyword))
      : issues
    const start = this.skip(page)
    return this.pageResult(filtered.slice(start, start + page.pageSize), page, filtered.length)
  }

  async listUserMemberCards(query: AdminPageQueryDto) {
    const page = this.getPage(query)
    const where: Prisma.UserMemberCardWhereInput = {}
    if (query.userMemberCardId) where.id = BigInt(Number(query.userMemberCardId))
    if (query.userId) where.userId = BigInt(Number(query.userId))
    if (query.status) where.status = query.status
    if (query.source) where.source = query.source
    if (query.cardType) where.card = { cardType: query.cardType }
    if (page.keyword) {
      where.OR = [
        { user: { nickname: { contains: page.keyword } } },
        { user: { phone: { contains: page.keyword } } },
        { card: { name: { contains: page.keyword } } },
      ]
    }
    const createdAtRange = this.createdAtRange(query)
    if (createdAtRange) where.createdAt = createdAtRange

    const [total, cards] = await this.prisma.$transaction([
      this.prisma.userMemberCard.count({ where }),
      this.prisma.userMemberCard.findMany({
        where,
        include: {
          user: { select: { id: true, nickname: true, phone: true } },
          card: {
            include: {
              serviceRuleItems: {
                where: { status: 1 },
                include: { service: true },
                orderBy: [{ serviceId: 'asc' }, { id: 'asc' }],
              },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: this.skip(page),
        take: page.pageSize,
      }),
    ])

    const cardIds = cards.map(card => card.id)
    const purchaseOrders = cardIds.length
      ? await this.prisma.order.findMany({
          where: { grantedUserMemberCardId: { in: cardIds } },
          select: { id: true, orderNo: true, grantedUserMemberCardId: true },
        })
      : []
    const purchaseOrderMap = new Map(purchaseOrders.map(order => [String(order.grantedUserMemberCardId), order]))

    return this.pageResult(cards.map(card => {
      const usableUnits = Math.max(0, card.remainingUnits - card.frozenUnits)
      const purchaseOrder = purchaseOrderMap.get(String(card.id))
      return {
        id: String(card.id),
        userId: Number(card.userId),
        userName: card.user.nickname || `User ${Number(card.userId)}`,
        userPhone: card.user.phone || '',
        cardId: Number(card.cardId),
        cardName: card.card.name,
        cardType: card.card.cardType,
        unitName: card.card.unitName,
        serviceRuleCount: card.card.serviceRuleItems.length,
        effectiveRuleSummary: this.memberCardRuleSummary(card.card.serviceRuleItems),
        source: card.source,
        remainingUnits: card.remainingUnits,
        frozenUnits: card.frozenUnits,
        usableUnits,
        remainingTimes: card.remainingTimes,
        purchaseOrderId: purchaseOrder ? Number(purchaseOrder.id) : null,
        purchaseOrderNo: purchaseOrder?.orderNo || '',
        expireAt: this.formatDateTime(card.expireAt),
        status: card.status,
        createdAt: this.formatDateTime(card.createdAt),
        updatedAt: this.formatDateTime(card.updatedAt),
      }
    }), page, total)
  }

  async getUserMemberCard(id: number) {
    const card = await this.prisma.userMemberCard.findUnique({
      where: { id: BigInt(id) },
      include: {
        user: true,
        card: {
          include: {
            serviceRuleItems: {
              where: { status: 1 },
              include: { service: true },
              orderBy: [{ serviceId: 'asc' }, { id: 'asc' }],
            },
          },
        },
      },
    })
    if (!card) throw this.notFound('user member card not found')
    return {
      id: String(card.id),
      userId: Number(card.userId),
      userName: card.user.nickname || `User ${Number(card.userId)}`,
      userPhone: card.user.phone || '',
      cardId: Number(card.cardId),
      cardName: card.card.name,
      cardType: card.card.cardType,
      unitName: card.card.unitName,
      unitMinutes: card.card.unitMinutes || 0,
      serviceRuleList: this.presentMemberCardServiceRules(card.card.serviceRuleItems),
      serviceRuleCount: card.card.serviceRuleItems.length,
      effectiveRuleSummary: this.memberCardRuleSummary(card.card.serviceRuleItems),
      source: card.source,
      remainingUnits: card.remainingUnits,
      frozenUnits: card.frozenUnits,
      usableUnits: Math.max(0, card.remainingUnits - card.frozenUnits),
      remainingTimes: card.remainingTimes,
      expireAt: this.formatDateTime(card.expireAt),
      status: card.status,
      createdAt: this.formatDateTime(card.createdAt),
      updatedAt: this.formatDateTime(card.updatedAt),
    }
  }

  async updateUserMemberCardStatus(id: number, dto: AdminStatusDto, context: AdminWriteContext) {
    const current = await this.prisma.userMemberCard.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound('user member card not found')
    const status = this.normalizeUserMemberCardStatus(dto.status)
    await this.prisma.$transaction(async (tx) => {
      await tx.userMemberCard.update({ where: { id: BigInt(id) }, data: { status } })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'user-member-card:status:update',
        module: 'marketing',
        targetType: 'user_member_card',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: status },
      })
    })
    return { id, status }
  }

  async adjustUserMemberCardTime(id: number, body: JsonRecord, context: AdminWriteContext) {
    const mode = this.optionalString(body.mode) || 'delta'
    if (!['delta', 'target'].includes(mode)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid adjust mode', 400)
    }
    const reason = this.requiredString(body.reason || body.remark, 'adjust reason is required')
    if (reason.length > 200) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'adjust reason is too long', 400)
    }

    const updatedId = await this.prisma.$transaction(async (tx) => {
      const current = await tx.userMemberCard.findUnique({
        where: { id: BigInt(id) },
        include: { card: true },
      })
      if (!current) throw this.notFound('user member card not found')

      const deltaUnits = Number(body.deltaUnits)
      const targetRemainingUnits = Number(body.targetRemainingUnits)
      let nextRemainingUnits: number
      if (mode === 'delta') {
        if (!Number.isInteger(deltaUnits) || deltaUnits === 0) {
          throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'deltaUnits must be non-zero integer', 400)
        }
        nextRemainingUnits = current.remainingUnits + deltaUnits
      }
      else {
        if (!Number.isInteger(targetRemainingUnits)) {
          throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'targetRemainingUnits must be integer', 400)
        }
        nextRemainingUnits = targetRemainingUnits
      }

      if (!Number.isInteger(nextRemainingUnits) || nextRemainingUnits < 0) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'remainingUnits must be non-negative integer', 400)
      }
      if (nextRemainingUnits < current.frozenUnits) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'remainingUnits cannot be less than frozenUnits', 409, {
          remainingUnits: nextRemainingUnits,
          frozenUnits: current.frozenUnits,
        })
      }
      if (nextRemainingUnits === current.remainingUnits) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card balance is unchanged', 400)
      }

      const now = new Date()
      const nextStatus = this.nextUserMemberCardStatusAfterAdjust(current.status, current.expireAt, nextRemainingUnits, now)
      const updated = await tx.userMemberCard.update({
        where: { id: current.id },
        data: {
          remainingUnits: nextRemainingUnits,
          remainingTimes: this.unitsToLegacyTimes(current.card, nextRemainingUnits),
          status: nextStatus,
        },
      })

      await tx.memberCardRecord.create({
        data: {
          userMemberCardId: current.id,
          recordType: MEMBER_CARD_RECORD_TYPE.ADMIN_ADJUST,
          timesUsed: this.unitsToLegacyTimes(current.card, Math.abs(updated.remainingUnits - current.remainingUnits)),
          units: updated.remainingUnits - current.remainingUnits,
          beforeUnits: current.remainingUnits,
          afterUnits: updated.remainingUnits,
          operatorType: 'admin',
          operatorId: BigInt(context.adminId),
          remark: reason,
        },
      })

      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'user-member-card:time:adjust',
        module: 'marketing',
        targetType: 'user_member_card',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: {
          mode,
          beforeUnits: current.remainingUnits,
          afterUnits: updated.remainingUnits,
          frozenUnits: current.frozenUnits,
          statusBefore: current.status,
          statusAfter: nextStatus,
          reason,
        },
      })

      return Number(updated.id)
    })

    return this.getUserMemberCard(updatedId)
  }

  async listMemberCardRecords(query: AdminPageQueryDto) {
    const page = this.getPage(query)
    const where: Prisma.MemberCardRecordWhereInput = {}
    const recordType = query.recordType || query.type
    if (recordType && recordType !== 'all') where.recordType = recordType
    if (query.userMemberCardId) where.userMemberCardId = BigInt(Number(query.userMemberCardId))
    if (query.orderId) where.orderId = BigInt(Number(query.orderId))
    if (query.cardType) where.userMemberCard = { card: { cardType: query.cardType } }
    if (query.orderNo) where.order = { orderNo: { contains: query.orderNo } }
    if (page.keyword) {
      where.OR = [
        { userMemberCard: { user: { nickname: { contains: page.keyword } } } },
        { userMemberCard: { user: { phone: { contains: page.keyword } } } },
        { userMemberCard: { card: { name: { contains: page.keyword } } } },
        { order: { orderNo: { contains: page.keyword } } },
      ]
    }
    const createdAtRange = this.createdAtRange(query)
    if (createdAtRange) where.createdAt = createdAtRange

    const [total, records] = await this.prisma.$transaction([
      this.prisma.memberCardRecord.count({ where }),
      this.prisma.memberCardRecord.findMany({
        where,
        include: {
          userMemberCard: {
            include: {
              user: { select: { id: true, nickname: true, phone: true } },
              card: true,
            },
          },
          order: { select: { id: true, orderNo: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: this.skip(page),
        take: page.pageSize,
      }),
    ])

    return this.pageResult(records.map(record => ({
      id: String(record.id),
      userMemberCardId: Number(record.userMemberCardId),
      userId: Number(record.userMemberCard.userId),
      userName: record.userMemberCard.user.nickname || `User ${Number(record.userMemberCard.userId)}`,
      userPhone: record.userMemberCard.user.phone || '',
      cardId: Number(record.userMemberCard.cardId),
      cardName: record.userMemberCard.card.name,
      cardType: record.userMemberCard.card.cardType,
      unitName: record.userMemberCard.card.unitName,
      orderId: record.orderId ? Number(record.orderId) : null,
      orderNo: record.order?.orderNo || '',
      recordType: record.recordType,
      timesUsed: record.timesUsed,
      units: record.units,
      beforeUnits: record.beforeUnits ?? '',
      afterUnits: record.afterUnits ?? '',
      operatorType: record.operatorType || '',
      operatorId: record.operatorId ? Number(record.operatorId) : '',
      remark: record.remark || '',
      createdAt: this.formatDateTime(record.createdAt),
    })), page, total)
  }

  async listAuditItems(type: string | undefined, query: AdminPageQueryDto, allowedTypes?: string[]) {
    const page = this.getPage(query)
    const keyword = page.keyword
    const requestedType = type || query.type || 'all'
    const allowed = new Set(allowedTypes ?? ['staff', 'refund', 'withdraw', 'ticket'])
    const items: Array<{
      id: string
      type: string
      title: string
      applicant: string
      bizNo: string
      amount?: number
      status: string
      priority: 'normal' | 'high' | 'urgent'
      submittedAt: string
      reviewedAt?: string
      reviewer?: string
      reason: string
      detail: string
      rawTime: Date
    }> = []

    if ((requestedType === 'all' || requestedType === 'staff') && allowed.has('staff')) {
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
          detail: [
            `姓名：${item.name}`,
            `电话：${item.phone}`,
            item.cityCode ? `城市：${item.cityCode}` : '',
            item.applicationNote ? `说明：${item.applicationNote}` : '',
          ].filter(Boolean).join('，'),
          rawTime: item.createdAt,
        })
      }
    }

    if ((requestedType === 'all' || requestedType === 'refund') && allowed.has('refund')) {
      const refunds = await this.prisma.refund.findMany({
        where: { status: { in: ['pending', 'failed'] } },
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
          status: item.status,
          priority: 'urgent',
          submittedAt: this.formatDateTime(item.createdAt),
          reason: item.reason || '用户申请退款',
          detail: `订单号：${item.payment.order.orderNo}`,
          rawTime: item.createdAt,
        })
      }
    }

    if ((requestedType === 'all' || requestedType === 'withdraw') && allowed.has('withdraw')) {
      const withdraws = await this.prisma.withdrawRequest.findMany({
        where: { status: { in: [WITHDRAW_STATUS.LEGACY_PENDING, WITHDRAW_STATUS.PENDING_REVIEW] } },
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
          bizNo: item.withdrawNo || `WD${Number(item.id)}`,
          amount: this.decimalToNumber(item.amount),
          status: WITHDRAW_STATUS.PENDING_REVIEW,
          priority: 'normal',
          submittedAt: this.formatDateTime(item.createdAt),
          reason: '师傅申请提现',
          detail: `提现金额：${this.decimalToNumber(item.amount)}`,
          rawTime: item.createdAt,
        })
      }
    }

    if ((requestedType === 'all' || requestedType === 'ticket') && allowed.has('ticket')) {
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
    if (dto.action === 'approve') {
      return this.refunds.approveRefund(id, { remark: dto.remark }, context)
    }
    return this.refunds.rejectRefund(id, { remark: dto.remark, nextOrderStatus: ORDER_STATUS.AFTER_SALES }, context)
  }

  async reviewWithdraw(id: number, dto: AdminAuditReviewDto, context: AdminWriteContext) {
    return this.withdrawals.reviewWithdraw(id, dto, context)
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

  async addTicketMessage(id: number, content: string, images: string[] | undefined, context: AdminWriteContext) {
    const current = await this.prisma.ticket.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound('ticket not found')
    if (!content.trim()) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'content required', 400)
    }
    const imageUrls = this.parseImageUrlList(images)
    imageUrls.forEach(url => this.storage.assertPermanentOssUrl(url))

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticketMessage.create({
        data: {
          ticketId: BigInt(id),
          senderType: 'admin',
          senderId: BigInt(context.adminId),
          content: content.trim(),
          images: imageUrls.length ? imageUrls : undefined,
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
    await this.storage.bindFilesToBiz(imageUrls, IMAGE_BIZ_TYPE.AFTER_SALES_IMAGE, current.id)
    return {
      id: Number(message.id),
      ticketId: id,
      content: message.content,
      images: this.storage.signUrlList(imageUrls),
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
    idCard?: string | null
    skills: Prisma.JsonValue | null
    cityCode: string | null
    applicationNote?: string | null
    applicationImages?: Prisma.JsonValue | null
    rating: Prisma.Decimal
    totalOrders: number
    status: number
    workStatus: number
    createdAt: Date
    user?: { id: bigint, nickname: string | null, phone: string | null, status: number } | null
  }) {
    const avatarUrls = this.storage.resolveAvatarUrls(item.avatarUrl)
    return {
      id: String(item.id),
      userId: item.userId ? String(item.userId) : '',
      userName: item.user?.nickname || item.name,
      userPhone: item.user?.phone || item.phone,
      userStatus: item.user ? this.activeStatus(item.user.status) : '',
      name: item.name,
      phone: item.phone,
      idCard: item.idCard || '',
      avatarUrl: avatarUrls.avatar,
      avatarOssUrl: avatarUrls.avatarOssUrl,
      avatarDisplayUrl: avatarUrls.avatarDisplayUrl,
      skills: this.formatSkills(item.skills),
      city: item.cityCode || '',
      cityCode: item.cityCode || '',
      applicationNote: item.applicationNote || '',
      applicationImages: this.storage.signUrlList(this.jsonStringArray(item.applicationImages)),
      applicationImageOssUrls: this.jsonStringArray(item.applicationImages),
      applicationImageCount: this.jsonStringArray(item.applicationImages).length,
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

  private async createUserServiceAddress(
    tx: Prisma.TransactionClient,
    userId: bigint,
    body: JsonRecord,
  ) {
    const ownerId = Number(userId)
    const addressType = this.optionalString(body.addressType) || 'service'
    const shouldBeDefault = this.optionalBoolean(body.isDefault, true)
    if (shouldBeDefault) {
      await tx.address.updateMany({
        where: {
          ownerType: 'user',
          ownerId: userId,
          addressType,
          status: 1,
          deletedAt: null,
        },
        data: { isDefault: false },
      })
    }

    const contactName = this.requiredString(body.contactName || body.name, 'address contactName required')
    const contactPhone = this.requiredString(body.contactPhone || body.phone, 'address contactPhone required')
    const detailAddress = this.requiredString(body.detailAddress || body.address || body.detail, 'detailAddress required')
    const addressData = {
      provinceName: this.optionalString(body.provinceName || body.province),
      cityName: this.optionalString(body.cityName || body.city),
      districtName: this.optionalString(body.districtName || body.district),
      streetName: this.optionalString(body.streetName || body.street),
      addressTitle: this.optionalString(body.addressTitle || body.title),
      detailAddress,
      houseNumber: this.optionalString(body.houseNumber),
    }

    return tx.address.create({
      data: {
        ownerType: 'user',
        ownerId: BigInt(ownerId),
        addressType,
        contactName,
        contactPhone,
        country: this.optionalString(body.country) || '中国',
        province: addressData.provinceName || null,
        city: addressData.cityName || null,
        district: addressData.districtName || null,
        street: addressData.streetName || null,
        addressTitle: addressData.addressTitle || null,
        detailAddress,
        houseNumber: addressData.houseNumber || null,
        formattedAddress: this.composeAdminAddressText(addressData),
        latitude: this.optionalDecimal(body.latitude),
        longitude: this.optionalDecimal(body.longitude),
        coordinateType: this.optionalString(body.coordinateType) || 'gcj02',
        poiId: this.optionalString(body.poiId) || null,
        mapProvider: this.optionalString(body.mapProvider) || null,
        isDefault: shouldBeDefault,
        source: 'admin',
        status: 1,
      },
    })
  }

  private composeAdminAddressText(address: {
    provinceName?: string
    cityName?: string
    districtName?: string
    streetName?: string
    addressTitle?: string
    detailAddress: string
    houseNumber?: string
  }) {
    return [
      address.provinceName,
      address.cityName,
      address.districtName,
      address.streetName,
      address.addressTitle,
      address.detailAddress,
      address.houseNumber,
    ].map(value => value?.trim()).filter(Boolean).join('')
  }

  private userAuditSnapshot(user: {
    nickname: string | null
    phone: string | null
    gender: number
    cityCode: string | null
    source?: string | null
    adminRemark?: string | null
    status: number
    deletedAt: Date | null
  }) {
    return {
      nickname: user.nickname,
      phone: user.phone,
      gender: user.gender,
      cityCode: user.cityCode,
      source: user.source || null,
      adminRemark: user.adminRemark || null,
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

  private homeBannerAuditSnapshot(banner: {
    title: string
    subtitle: string | null
    imageUrl: string
    linkType: string
    linkValue: string | null
    sortOrder: number
    status: number
  }) {
    return {
      title: banner.title,
      subtitle: banner.subtitle,
      imageUrl: banner.imageUrl,
      linkType: banner.linkType,
      linkValue: banner.linkValue,
      sortOrder: banner.sortOrder,
      status: banner.status,
    }
  }

  private presentHomeBanner(banner: {
    id: bigint
    title: string
    subtitle: string | null
    imageUrl: string
    linkType: string
    linkValue: string | null
    sortOrder: number
    status: number
    updatedAt: Date
  }) {
    const displayUrl = this.storage.signNullableUrl(banner.imageUrl) || banner.imageUrl
    return {
      id: String(banner.id),
      title: banner.title,
      subtitle: banner.subtitle || '',
      imageUrl: displayUrl,
      imageOssUrl: banner.imageUrl,
      imageDisplayUrl: displayUrl,
      linkType: banner.linkType,
      linkValue: banner.linkValue || '',
      sortOrder: banner.sortOrder,
      status: this.activeStatus(banner.status),
      updatedAt: this.formatDateTime(banner.updatedAt),
    }
  }

  private homeBannerLinkType(value: unknown) {
    const linkType = this.optionalString(value) || 'none'
    if (['none', 'service', 'category', 'url'].includes(linkType)) return linkType
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid banner link type', 400)
  }

  private homeBannerLinkValue(linkType: string, value: unknown) {
    const linkValue = this.optionalString(value)
    if (linkType === 'none') return null
    if (!linkValue) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'linkValue required', 400)
    }
    if (linkType === 'service' && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(linkValue) && !/^\d+$/.test(linkValue)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid service link value', 400)
    }
    if (linkType === 'category' && !/^\d+$/.test(linkValue)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid category link value', 400)
    }
    if (linkType === 'url' && !/^https?:\/\//i.test(linkValue)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid url link value', 400)
    }
    return linkValue
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

  private normalizeUserSource(value: unknown) {
    const source = this.optionalString(value) || 'admin'
    return /^[a-zA-Z0-9_-]{1,16}$/.test(source) ? source : 'admin'
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

  private jsonStringArray(value: Prisma.JsonValue | null | undefined) {
    if (!Array.isArray(value)) return []
    return value.map(item => typeof item === 'string' ? item : '').filter(Boolean)
  }

  private parseImageUrlList(value: unknown) {
    if (value === undefined || value === null || value === '') return []
    if (Array.isArray(value)) {
      return value.map(item => String(item || '').trim()).filter(Boolean)
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return []
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (Array.isArray(parsed)) {
          return parsed.map(item => String(item || '').trim()).filter(Boolean)
        }
      }
      catch {
        return trimmed.split(/[\s,\uFF0C\u3001]+/).map(item => item.trim()).filter(Boolean)
      }
      return trimmed.split(/[\s,\uFF0C\u3001]+/).map(item => item.trim()).filter(Boolean)
    }
    return []
  }

  private async replaceServiceImages(tx: Prisma.TransactionClient, serviceId: bigint, urls: string[]) {
    await tx.serviceImage.deleteMany({ where: { serviceId } })
    if (!urls.length) return
    await tx.serviceImage.createMany({
      data: urls.map((url, index) => ({
        serviceId,
        url,
        sortOrder: index,
      })),
    })
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

  private optionalObject(value: unknown): JsonRecord | undefined {
    if (!value) return undefined
    if (typeof value === 'object' && !Array.isArray(value)) return value as JsonRecord
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return undefined
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as JsonRecord
        }
      }
      catch {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid object', 400)
      }
    }
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid object', 400)
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

  private optionalBoolean(value: unknown, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback
    if (typeof value === 'boolean') return value
    const text = String(value).trim().toLowerCase()
    return ['true', '1', 'yes', 'active', 'published'].includes(text)
  }

  private optionalPositiveInt(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined
    const number = Number(value)
    return Number.isInteger(number) && number > 0 ? number : undefined
  }

  private normalizeCardType(value: unknown, fallback: string) {
    const cardType = this.optionalString(value) || fallback
    if (['none', 'time', 'times', 'consultation'].includes(cardType)) return cardType
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid cardType', 400)
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

  private createdAtRange(query: AdminPageQueryDto): Prisma.DateTimeFilter | undefined {
    const start = this.optionalDate(query.dateStart)
    const end = this.optionalDate(query.dateEnd)
    if (!start && !end) return undefined
    return {
      ...(start ? { gte: start } : {}),
      ...(end ? { lte: end } : {}),
    }
  }

  private dateRangeFromQuery(query: AdminPageQueryDto): Prisma.DateTimeFilter | undefined {
    const startRaw = query.dateStart || query.startDate
    const endRaw = query.dateEnd || query.endDate
    const start = this.optionalDate(startRaw)
    const end = this.optionalDate(endRaw)
    if (end && this.isDateOnly(endRaw)) {
      end.setHours(23, 59, 59, 999)
    }
    if (!start && !end) return undefined
    return {
      ...(start ? { gte: start } : {}),
      ...(end ? { lte: end } : {}),
    }
  }

  private isDateOnly(value: unknown) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
  }

  private shouldSyncMemberCardServiceRules(body: JsonRecord) {
    return Object.prototype.hasOwnProperty.call(body, 'serviceRuleList')
      || Object.prototype.hasOwnProperty.call(body, 'rules')
      || Object.prototype.hasOwnProperty.call(body, 'serviceRulesV2')
      || Object.prototype.hasOwnProperty.call(body, 'applicableServices')
      || Object.prototype.hasOwnProperty.call(body, 'serviceRules')
  }

  private async syncMemberCardServiceRulesFromBody(
    tx: Prisma.TransactionClient,
    card: {
      id: bigint
      cardType: string
      totalUnits: number
      totalTimes: number
      unitMinutes: number | null
      minConsumeUnits: number
      applicableServices: Prisma.JsonValue
      serviceRules: Prisma.JsonValue | null
    },
    body: JsonRecord,
  ) {
    const structured = this.parseMemberCardServiceRuleInput(body.serviceRuleList ?? body.rules ?? body.serviceRulesV2)
    const rules = structured ?? await this.buildRulesFromLegacyMemberCardConfig(tx, card)
    if (rules === undefined) return
    await this.replaceMemberCardServiceRules(tx, card, rules)
  }

  private async replaceMemberCardServiceRules(
    tx: Prisma.TransactionClient,
    card: {
      id: bigint
      cardType: string
      totalUnits: number
      totalTimes: number
      unitMinutes: number | null
      minConsumeUnits: number
    },
    rules: Array<{ serviceId: number, consumeUnits: number, status?: number, remark?: string }>,
  ) {
    const normalizedInput = rules.map(rule => ({
      serviceId: Number(rule.serviceId),
      consumeUnits: Number(rule.consumeUnits),
      status: rule.status === 0 ? 0 : 1,
      remark: rule.remark || null,
    }))
    const deduped = new Map<number, (typeof normalizedInput)[number]>()
    for (const rule of normalizedInput) {
      deduped.set(rule.serviceId, rule)
    }
    const normalized = [...deduped.values()]

    const serviceIds = [...new Set(normalized.map(rule => rule.serviceId))]
    const services = serviceIds.length
      ? await tx.service.findMany({ where: { id: { in: serviceIds.map(id => BigInt(id)) } } })
      : []
    const serviceMap = new Map(services.map(service => [Number(service.id), service]))

    for (const rule of normalized) {
      if (!Number.isInteger(rule.serviceId) || rule.serviceId <= 0) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'serviceId required for member card service rule', 400)
      }
      if (!Number.isInteger(rule.consumeUnits) || rule.consumeUnits <= 0) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'consumeUnits must be a positive integer', 400)
      }
      const service = serviceMap.get(rule.serviceId)
      if (!service) {
        throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, `service not found: ${rule.serviceId}`, 404)
      }
      const serviceCardType = this.resolveServiceCardType(service)
      if (serviceCardType !== card.cardType) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card type does not match service card type', 400, {
          serviceId: rule.serviceId,
          serviceCardType,
          cardType: card.cardType,
        })
      }
    }

    await tx.memberCardServiceRule.deleteMany({ where: { memberCardId: card.id } })
    if (!normalized.length) return
    await tx.memberCardServiceRule.createMany({
      data: normalized.map(rule => ({
        memberCardId: card.id,
        serviceId: BigInt(rule.serviceId),
        consumeUnits: rule.consumeUnits,
        status: rule.status,
        remark: rule.remark,
      })),
    })
  }

  private parseMemberCardServiceRuleInput(value: unknown): Array<{ serviceId: number, consumeUnits: number, status?: number, remark?: string }> | undefined {
    if (value === undefined || value === null) return undefined
    let parsed: unknown = value
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return []
      try {
        parsed = JSON.parse(trimmed) as unknown
      }
      catch {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid serviceRuleList JSON', 400)
      }
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>
      if (Array.isArray(record.rules)) parsed = record.rules
      else if (Array.isArray(record.serviceRuleList)) parsed = record.serviceRuleList
    }
    if (!Array.isArray(parsed)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'serviceRuleList must be an array', 400)
    }
    return parsed.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid service rule item', 400)
      }
      const record = item as Record<string, unknown>
      const serviceId = Number(record.serviceId ?? record.id)
      const consumeUnits = Number(record.consumeUnits ?? record.consumeUnit ?? record.units)
      const rawStatus = record.status
      const status = rawStatus === undefined || rawStatus === null || rawStatus === ''
        ? 1
        : ['active', 'published', '1', 'true'].includes(String(rawStatus).trim().toLowerCase()) || rawStatus === 1
          ? 1
          : 0
      return {
        serviceId,
        consumeUnits,
        status,
        remark: this.optionalString(record.remark),
      }
    })
  }

  private async buildRulesFromLegacyMemberCardConfig(
    tx: Prisma.TransactionClient,
    card: {
      cardType: string
      totalUnits: number
      totalTimes: number
      unitMinutes: number | null
      minConsumeUnits: number
      applicableServices: Prisma.JsonValue
      serviceRules: Prisma.JsonValue | null
    },
  ) {
    const applicableServices = this.jsonStringArray(card.applicableServices)
    if (!applicableServices.length) return undefined
    const result: Array<{ serviceId: number, consumeUnits: number, status?: number, remark?: string }> = []
    const seen = new Set<string>()
    for (const key of applicableServices) {
      const service = await this.findServiceByLegacyMemberCardKey(tx, key)
      if (!service || seen.has(String(service.id))) continue
      seen.add(String(service.id))
      result.push({
        serviceId: Number(service.id),
        consumeUnits: this.legacyMemberCardConsumeUnits(card, service),
        status: 1,
        remark: 'migrated from legacy member card JSON',
      })
    }
    return result
  }

  private findServiceByLegacyMemberCardKey(tx: Prisma.TransactionClient, key: string) {
    const trimmed = key.trim()
    if (!trimmed) return null
    const numericId = /^\d+$/.test(trimmed) ? BigInt(trimmed) : undefined
    return tx.service.findFirst({
      where: {
        OR: [
          ...(numericId ? [{ id: numericId }] : []),
          { code: trimmed },
          { name: trimmed },
        ],
      },
      orderBy: { id: 'asc' },
    })
  }

  private legacyMemberCardConsumeUnits(
    card: {
      cardType: string
      unitMinutes: number | null
      minConsumeUnits: number
      serviceRules: Prisma.JsonValue | null
    },
    service: {
      id: bigint
      code: string
      name: string
      durationMinutes: number | null
      consumeUnit: number | null
    },
  ) {
    const ruleUnits = this.legacyRuleConsumeUnits(card.serviceRules, service)
    if (ruleUnits) return ruleUnits
    if (card.cardType === 'time') {
      return service.consumeUnit || service.durationMinutes || card.unitMinutes || card.minConsumeUnits || 1
    }
    return service.consumeUnit || card.minConsumeUnits || 1
  }

  private legacyRuleConsumeUnits(value: Prisma.JsonValue | null, service: { id: bigint, code: string, name: string }) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 0
    const record = value as Record<string, unknown>
    for (const key of [String(service.id), service.code, service.name]) {
      const rule = record[key]
      if (typeof rule === 'number' && Number.isInteger(rule) && rule > 0) return rule
      if (rule && typeof rule === 'object' && !Array.isArray(rule)) {
        const consumeUnits = Number((rule as Record<string, unknown>).consumeUnits)
        if (Number.isInteger(consumeUnits) && consumeUnits > 0) return consumeUnits
      }
    }
    return 0
  }

  private resolveServiceCardType(service: {
    priceUnit: string
    durationMinutes: number | null
    cardType: string
    consultationRequired?: boolean | null
  }) {
    if (service.consultationRequired || service.cardType === 'consultation') return 'consultation'
    if (service.cardType === 'time' || service.cardType === 'times' || service.cardType === 'none') return service.cardType
    if ((service.durationMinutes || 0) > 0) return 'time'
    if (['hour', 'minute'].includes(service.priceUnit.toLowerCase())) return 'time'
    if (['times', 'count', 'piece'].includes(service.priceUnit.toLowerCase())) return 'times'
    return 'none'
  }

  private presentMemberCardServiceRules(rules: Array<{
    id: bigint
    memberCardId: bigint
    serviceId: bigint
    consumeUnits: number
    status: number
    remark: string | null
    service: {
      id: bigint
      code: string
      name: string
      cardType: string
      consumeUnit: number | null
      durationMinutes: number | null
      status: number
      deletedAt: Date | null
    }
  }>) {
    return rules.map(rule => ({
      id: Number(rule.id),
      memberCardId: Number(rule.memberCardId),
      serviceId: Number(rule.serviceId),
      serviceCode: rule.service.code,
      serviceName: rule.service.name,
      serviceCardType: rule.service.cardType,
      serviceConsumeUnit: rule.service.consumeUnit || 0,
      serviceDurationMinutes: rule.service.durationMinutes || 0,
      serviceStatus: rule.service.deletedAt ? 'deleted' : this.activeStatus(rule.service.status),
      consumeUnits: rule.consumeUnits,
      effectiveConsumeUnits: rule.consumeUnits,
      status: this.activeStatus(rule.status),
      remark: rule.remark || '',
    }))
  }

  private memberCardRuleSummary(rules: Array<{ service: { name: string }, consumeUnits: number }>) {
    if (!rules.length) return 'all matching card-type services'
    return rules.slice(0, 3).map(rule => `${rule.service.name}:${rule.consumeUnits}`).join(', ')
      + (rules.length > 3 ? ` +${rules.length - 3}` : '')
  }

  private unitsToLegacyTimes(card: { cardType: string, unitMinutes: number | null }, units: number) {
    const normalizedUnits = Math.max(0, Math.abs(units))
    if (card.cardType === MEMBER_CARD_TYPE.TIME && card.unitMinutes && card.unitMinutes > 0) {
      return Math.ceil(normalizedUnits / card.unitMinutes)
    }
    return normalizedUnits
  }

  private nextUserMemberCardStatusAfterAdjust(status: string, expireAt: Date, remainingUnits: number, now = new Date()) {
    if (status === USER_MEMBER_CARD_STATUS.DISABLED || status === USER_MEMBER_CARD_STATUS.REFUNDED) return status
    if (expireAt <= now) return USER_MEMBER_CARD_STATUS.EXPIRED
    if (remainingUnits <= 0) return USER_MEMBER_CARD_STATUS.USED_UP
    if (status === USER_MEMBER_CARD_STATUS.USED_UP || status === USER_MEMBER_CARD_STATUS.EXPIRED) return USER_MEMBER_CARD_STATUS.ACTIVE
    return status
  }

  private normalizeUserMemberCardStatus(value: string) {
    if (['active', 'disabled', 'expired', 'used_up'].includes(value)) return value
    if (value === 'published') return 'active'
    if (value === 'draft') return 'disabled'
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid user member card status', 400)
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

  private parseJsonObject(value: unknown): Prisma.InputJsonValue {
    if (!value) return {}
    if (typeof value === 'object' && !Array.isArray(value)) return value as Prisma.InputJsonObject
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return {}
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Prisma.InputJsonObject
        }
      }
      catch {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid JSON object', 400)
      }
    }
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid JSON object', 400)
  }

  private notFound(message: string) {
    return new BusinessException(ErrorCode.COMMON_NOT_FOUND, message, 404)
  }
}
