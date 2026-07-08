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
        sendStatus: 'created',
      },
    })
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
      data: { isRead: true },
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
      data: { isRead: true },
    })
    return { orderId, isRead: true }
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
    createdAt: Date
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
      createdAt: notification.createdAt.toISOString(),
    }
  }

  private positiveInt(value: unknown, fallback: number, max: number) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) return fallback
    return Math.min(parsed, max)
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
