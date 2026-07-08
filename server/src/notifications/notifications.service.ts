import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { PrismaService } from '../prisma/prisma.service'

type NotificationClient = PrismaService | Prisma.TransactionClient

export interface CreateOrderAssignedNotificationParams {
  tx?: Prisma.TransactionClient
  staffId: bigint | number
  orderId: bigint | number
  orderNo: string
  serviceName?: string
  appointmentStartTime?: Date
}

export interface CreateAdminOrderNotificationParams {
  tx?: Prisma.TransactionClient
  orderId: bigint | number
  orderNo: string
  serviceName?: string
  appointmentStartTime?: Date
  type?: 'admin_order_created' | 'admin_pending_dispatch'
  runId?: string
}

export interface CreateStaffNotificationParams {
  tx?: Prisma.TransactionClient
  staffId: bigint | number
  type: string
  title: string
  content: string
  bizType?: string
  bizId?: bigint | number | null
}

@Injectable()
export class NotificationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createOrderAssignedNotification(params: CreateOrderAssignedNotificationParams) {
    const client = params.tx || this.prisma
    const appointmentText = params.appointmentStartTime
      ? `，预约时间 ${this.formatDateTime(params.appointmentStartTime)}`
      : ''
    const serviceText = params.serviceName ? `【${params.serviceName}】` : ''

    return client.notification.create({
      data: {
        receiverType: 'staff',
        receiverId: BigInt(params.staffId),
        type: 'order_assigned',
        title: '新的派单任务',
        content: `订单 ${params.orderNo} ${serviceText}已派给你${appointmentText}，请及时处理。`,
        bizType: 'order',
        bizId: BigInt(params.orderId),
        channel: 'in_app',
        sendStatus: 'sent',
        sentAt: new Date(),
      },
    })
  }

  async createAdminOrderNotification(params: CreateAdminOrderNotificationParams) {
    const client = params.tx || this.prisma
    const appointmentText = params.appointmentStartTime
      ? `，预约时间 ${this.formatDateTime(params.appointmentStartTime)}`
      : ''
    const serviceText = params.serviceName ? `【${params.serviceName}】` : ''
    const type = params.type || 'admin_pending_dispatch'
    const title = type === 'admin_order_created' ? '新的预约订单' : '新的待派单订单'
    const runText = params.runId ? ` ${params.runId}` : ''

    const existing = await client.notification.findFirst({
      where: {
        receiverType: 'admin',
        receiverId: BigInt(0),
        type,
        bizType: 'order',
        bizId: BigInt(params.orderId),
      },
    })
    if (existing) return existing

    return client.notification.create({
      data: {
        receiverType: 'admin',
        receiverId: BigInt(0),
        type,
        title,
        content: `${runText}订单 ${params.orderNo} ${serviceText}需要处理${appointmentText}。`.trim(),
        bizType: 'order',
        bizId: BigInt(params.orderId),
        channel: 'in_app',
        sendStatus: 'sent',
        sentAt: new Date(),
      },
    })
  }

  async createStaffNotification(params: CreateStaffNotificationParams) {
    const client = params.tx || this.prisma
    return client.notification.create({
      data: {
        receiverType: 'staff',
        receiverId: BigInt(params.staffId),
        type: params.type,
        title: params.title,
        content: params.content,
        bizType: params.bizType,
        bizId: params.bizId === undefined || params.bizId === null ? undefined : BigInt(params.bizId),
        channel: 'in_app',
        sendStatus: 'sent',
        sentAt: new Date(),
      },
    })
  }

  async listAdminNotifications(query: { page?: number, pageSize?: number, isRead?: string }) {
    const page = this.positiveInt(query.page, 1, 100000)
    const pageSize = this.positiveInt(query.pageSize, 20, 100)
    const where: Prisma.NotificationWhereInput = {
      receiverType: 'admin',
      receiverId: BigInt(0),
    }
    const isRead = this.parseOptionalBoolean(query.isRead)
    if (isRead !== undefined) where.isRead = isRead
    const [total, items] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return {
      items: items.map(item => this.present(item)),
      page,
      pageSize,
      total,
    }
  }

  async getAdminUnreadCount() {
    const count = await this.prisma.notification.count({
      where: {
        receiverType: 'admin',
        receiverId: BigInt(0),
        isRead: false,
      },
    })
    return { count, unreadCount: count }
  }

  async markAdminNotificationRead(notificationId: number) {
    const result = await this.prisma.notification.updateMany({
      where: {
        id: BigInt(notificationId),
        receiverType: 'admin',
        receiverId: BigInt(0),
      },
      data: { isRead: true, readAt: new Date() },
    })
    if (result.count !== 1) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'notification not found', 404)
    }
    return { id: notificationId, isRead: true }
  }

  async listStaffNotifications(staffId: number, query: { page?: number, pageSize?: number }) {
    const page = this.positiveInt(query.page, 1, 100000)
    const pageSize = this.positiveInt(query.pageSize, 20, 100)
    const where: Prisma.NotificationWhereInput = {
      receiverType: 'staff',
      receiverId: BigInt(staffId),
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return {
      items: items.map(item => this.present(item)),
      page,
      pageSize,
      total,
    }
  }

  async getStaffUnreadCount(staffId: number) {
    const count = await this.prisma.notification.count({
      where: {
        receiverType: 'staff',
        receiverId: BigInt(staffId),
        isRead: false,
      },
    })
    return { count, unreadCount: count }
  }

  async markStaffNotificationRead(staffId: number, notificationId: number) {
    const result = await this.prisma.notification.updateMany({
      where: {
        id: BigInt(notificationId),
        receiverType: 'staff',
        receiverId: BigInt(staffId),
      },
      data: { isRead: true, readAt: new Date() },
    })
    if (result.count !== 1) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'notification not found', 404)
    }
    return { id: notificationId, isRead: true }
  }

  async markStaffOrderNotificationsRead(staffId: number, orderId: number) {
    await this.prisma.notification.updateMany({
      where: {
        receiverType: 'staff',
        receiverId: BigInt(staffId),
        bizType: 'order',
        bizId: BigInt(orderId),
      },
      data: { isRead: true, readAt: new Date() },
    })
    return { orderId, isRead: true }
  }

  async listAdminStaffNotifications(query: {
    page?: number
    pageSize?: number
    keyword?: string
    staffId?: number | string
    orderId?: number | string
    orderNo?: string
    type?: string
    bizType?: string
    sendStatus?: string
    isRead?: string
    startDate?: string
    endDate?: string
  }) {
    const page = this.positiveInt(query.page, 1, 100000)
    const pageSize = this.positiveInt(query.pageSize, 20, 100)
    const where = await this.buildAdminStaffNotificationWhere(query)

    const [total, items] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return {
      items: await this.presentAdminStaffNotifications(items),
      page,
      pageSize,
      total,
    }
  }

  async listAdminStaffNotificationsByStaff(staffId: number, query: { page?: number, pageSize?: number }) {
    return this.listAdminStaffNotifications({ ...query, staffId })
  }

  async getAdminStaffNotificationDetail(notificationId: number) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: BigInt(notificationId),
        receiverType: 'staff',
      },
    })
    if (!notification) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'notification not found', 404)
    }
    const [presented] = await this.presentAdminStaffNotifications([notification])
    return presented
  }

  async resendStaffNotification(notificationId: number, adminId: number, requestId?: string, ip?: string) {
    const created = await this.prisma.$transaction(async (tx) => {
      const source = await tx.notification.findFirst({
        where: {
          id: BigInt(notificationId),
          receiverType: 'staff',
        },
      })
      if (!source) {
        throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'notification not found', 404)
      }
      if (source.bizType !== 'order' || !source.bizId) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'only order staff notifications can be resent', 400)
      }

      const order = await tx.order.findUnique({
        where: { id: source.bizId },
        select: {
          id: true,
          orderNo: true,
          staffId: true,
          serviceSnapshot: true,
          appointmentStartTime: true,
        },
      })
      if (!order) {
        throw new BusinessException(ErrorCode.ORDER_NOT_FOUND, 'order not found', 404)
      }
      if (!order.staffId) {
        throw new BusinessException(ErrorCode.ORDER_ASSIGNMENT_INVALID, 'order has no assigned staff', 409)
      }
      if (order.staffId !== source.receiverId) {
        throw new BusinessException(ErrorCode.ORDER_ASSIGNMENT_INVALID, 'notification staff is no longer assigned to order', 409)
      }

      const staff = await tx.staff.findFirst({
        where: { id: order.staffId, status: 1, deletedAt: null },
        select: { id: true },
      })
      if (!staff) {
        throw new BusinessException(ErrorCode.STAFF_NOT_FOUND, 'staff not found', 404)
      }

      const now = new Date()
      await tx.notification.update({
        where: { id: source.id },
        data: {
          retryCount: { increment: 1 },
          lastRetriedAt: now,
          failureReason: null,
          sendStatus: 'sent',
        },
      })
      const notification = await this.createOrderAssignedNotification({
        tx,
        staffId: staff.id,
        orderId: order.id,
        orderNo: order.orderNo,
        serviceName: this.serviceNameFromSnapshot(order.serviceSnapshot),
        appointmentStartTime: order.appointmentStartTime,
      })
      await tx.orderAssignment.updateMany({
        where: {
          orderId: order.id,
          staffId: staff.id,
        },
        data: {
          notificationId: notification.id,
          notificationStatus: notification.sendStatus,
        },
      })
      await this.writeAdminAudit(tx, {
        adminId,
        action: 'staff-notification:resend',
        targetId: notification.id,
        requestId,
        ip,
        detail: {
          sourceNotificationId: Number(source.id),
          notificationId: Number(notification.id),
          orderId: Number(order.id),
          orderNo: order.orderNo,
          staffId: Number(staff.id),
        },
      })
      return notification
    })

    return this.getAdminStaffNotificationDetail(Number(created.id))
  }

  async resendOrderStaffNotification(orderId: number, adminId: number, requestId?: string, ip?: string) {
    const created = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: BigInt(orderId) },
        select: {
          id: true,
          orderNo: true,
          staffId: true,
          serviceSnapshot: true,
          appointmentStartTime: true,
        },
      })
      if (!order) {
        throw new BusinessException(ErrorCode.ORDER_NOT_FOUND, 'order not found', 404)
      }
      if (!order.staffId) {
        throw new BusinessException(ErrorCode.ORDER_ASSIGNMENT_INVALID, 'order has no assigned staff', 409)
      }
      const staff = await tx.staff.findFirst({
        where: { id: order.staffId, status: 1, deletedAt: null },
        select: { id: true },
      })
      if (!staff) {
        throw new BusinessException(ErrorCode.STAFF_NOT_FOUND, 'staff not found', 404)
      }

      const notification = await this.createOrderAssignedNotification({
        tx,
        staffId: staff.id,
        orderId: order.id,
        orderNo: order.orderNo,
        serviceName: this.serviceNameFromSnapshot(order.serviceSnapshot),
        appointmentStartTime: order.appointmentStartTime,
      })
      await tx.orderAssignment.updateMany({
        where: {
          orderId: order.id,
          staffId: staff.id,
        },
        data: {
          notificationId: notification.id,
          notificationStatus: notification.sendStatus,
        },
      })
      await this.writeAdminAudit(tx, {
        adminId,
        action: 'order:staff-notification:resend',
        targetId: order.id,
        requestId,
        ip,
        detail: {
          notificationId: Number(notification.id),
          orderId: Number(order.id),
          orderNo: order.orderNo,
          staffId: Number(staff.id),
        },
      })
      return notification
    })

    return this.getAdminStaffNotificationDetail(Number(created.id))
  }

  private present(notification: {
    id: bigint
    receiverType: string
    receiverId: bigint
    type: string
    title: string
    content: string
    bizType: string | null
    bizId: bigint | null
    isRead: boolean
    channel: string
    sendStatus: string
    sentAt?: Date | null
    readAt?: Date | null
    retryCount?: number
    lastRetriedAt?: Date | null
    failureReason?: string | null
    createdByType?: string | null
    createdById?: bigint | null
    createdAt: Date
    updatedAt?: Date
  }) {
    return {
      id: Number(notification.id),
      receiverType: notification.receiverType,
      receiverId: Number(notification.receiverId),
      type: notification.type,
      title: notification.title,
      content: notification.content,
      bizType: notification.bizType || '',
      bizId: notification.bizId ? Number(notification.bizId) : null,
      isRead: notification.isRead,
      channel: notification.channel,
      sendStatus: notification.sendStatus,
      sentAt: notification.sentAt?.toISOString() || null,
      readAt: notification.readAt?.toISOString() || null,
      retryCount: notification.retryCount || 0,
      lastRetriedAt: notification.lastRetriedAt?.toISOString() || null,
      failureReason: notification.failureReason || '',
      createdByType: notification.createdByType || '',
      createdById: notification.createdById ? Number(notification.createdById) : null,
      createdAt: notification.createdAt.toISOString(),
      updatedAt: notification.updatedAt?.toISOString() || notification.createdAt.toISOString(),
    }
  }

  private async buildAdminStaffNotificationWhere(query: {
    keyword?: string
    staffId?: number | string
    orderId?: number | string
    orderNo?: string
    type?: string
    bizType?: string
    sendStatus?: string
    isRead?: string
    startDate?: string
    endDate?: string
  }): Promise<Prisma.NotificationWhereInput> {
    const and: Prisma.NotificationWhereInput[] = [{ receiverType: 'staff' }]
    const staffId = this.optionalPositiveBigInt(query.staffId)
    if (staffId) and.push({ receiverId: staffId })
    const orderId = this.optionalPositiveBigInt(query.orderId)
    if (orderId) and.push({ bizType: 'order', bizId: orderId })
    if (query.type) and.push({ type: query.type })
    if (query.bizType) and.push({ bizType: query.bizType })
    if (query.sendStatus) and.push({ sendStatus: query.sendStatus })
    const isRead = this.parseOptionalBoolean(query.isRead)
    if (isRead !== undefined) and.push({ isRead })
    const startDate = this.optionalDate(query.startDate)
    const endDate = this.optionalDate(query.endDate)
    if (startDate || endDate) {
      and.push({
        createdAt: {
          ...(startDate ? { gte: startDate } : {}),
          ...(endDate ? { lte: endDate } : {}),
        },
      })
    }
    if (query.orderNo) {
      const orders = await this.prisma.order.findMany({
        where: { orderNo: { contains: query.orderNo.trim() } },
        select: { id: true },
        take: 100,
      })
      and.push({ bizType: 'order', bizId: { in: orders.map(item => item.id) } })
    }
    if (query.keyword?.trim()) {
      const keyword = query.keyword.trim()
      const [staff, orders] = await Promise.all([
        this.prisma.staff.findMany({
          where: {
            OR: [
              { name: { contains: keyword } },
              { phone: { contains: keyword } },
            ],
          },
          select: { id: true },
          take: 100,
        }),
        this.prisma.order.findMany({
          where: { orderNo: { contains: keyword } },
          select: { id: true },
          take: 100,
        }),
      ])
      const or: Prisma.NotificationWhereInput[] = [
        { title: { contains: keyword } },
        { content: { contains: keyword } },
      ]
      if (staff.length) or.push({ receiverId: { in: staff.map(item => item.id) } })
      if (orders.length) or.push({ bizType: 'order', bizId: { in: orders.map(item => item.id) } })
      and.push({ OR: or })
    }
    return { AND: and }
  }

  private async presentAdminStaffNotifications(items: Array<Prisma.NotificationGetPayload<{}>>) {
    const staffIds = [...new Set(items.map(item => item.receiverId.toString()))].map(id => BigInt(id))
    const orderIds = [...new Set(items
      .filter(item => item.bizType === 'order' && item.bizId)
      .map(item => String(item.bizId)))]
      .map(id => BigInt(id))

    const [staff, orders] = await Promise.all([
      staffIds.length
        ? this.prisma.staff.findMany({
            where: { id: { in: staffIds } },
            select: { id: true, name: true, phone: true, status: true, workStatus: true },
          })
        : Promise.resolve([]),
      orderIds.length
        ? this.prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderNo: true, status: true, staffId: true },
          })
        : Promise.resolve([]),
    ])
    const staffMap = new Map(staff.map(item => [item.id.toString(), item]))
    const orderMap = new Map(orders.map(item => [item.id.toString(), item]))

    return items.map((item) => {
      const base = this.present(item)
      const staffItem = staffMap.get(item.receiverId.toString())
      const order = item.bizType === 'order' && item.bizId ? orderMap.get(item.bizId.toString()) : undefined
      return {
        ...base,
        staffId: Number(item.receiverId),
        staffName: staffItem?.name || '',
        staffPhone: staffItem?.phone || '',
        staffStatus: staffItem?.status ?? null,
        staffWorkStatus: staffItem?.workStatus ?? null,
        orderId: item.bizType === 'order' && item.bizId ? Number(item.bizId) : null,
        orderNo: order?.orderNo || '',
        orderStatus: order?.status || '',
        orderStaffId: order?.staffId ? Number(order.staffId) : null,
      }
    })
  }

  private optionalPositiveBigInt(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) return undefined
    return BigInt(parsed)
  }

  private optionalDate(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return undefined
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  }

  private serviceNameFromSnapshot(value: Prisma.JsonValue | null | undefined) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>
      if (typeof record.name === 'string') return record.name
    }
    return ''
  }

  private writeAdminAudit(tx: Prisma.TransactionClient, params: {
    adminId: number | bigint
    action: string
    targetId?: number | bigint | null
    requestId?: string
    ip?: string
    detail?: Record<string, unknown>
  }) {
    return tx.auditLog.create({
      data: {
        operatorType: 'admin',
        operatorId: BigInt(params.adminId),
        action: params.action,
        module: 'notification',
        targetType: 'notification',
        targetId: params.targetId === undefined || params.targetId === null ? undefined : BigInt(params.targetId),
        requestId: params.requestId,
        ip: params.ip,
        detail: params.detail as Prisma.InputJsonObject,
      },
    })
  }

  private positiveInt(value: unknown, fallback: number, max: number) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) return fallback
    return Math.min(parsed, max)
  }

  private parseOptionalBoolean(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined
    if (value === true || value === 'true' || value === '1' || value === 1) return true
    if (value === false || value === 'false' || value === '0' || value === 0) return false
    return undefined
  }

  private formatDateTime(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}`
  }
}
