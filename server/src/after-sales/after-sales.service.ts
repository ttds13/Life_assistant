import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AdminAuditService } from '../audit-log/admin-audit.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { ORDER_ACTION } from '../orders/constants/order-action'
import { ORDER_STATUS } from '../orders/constants/order-status'
import { OrderTransitionService } from '../orders/order-transition.service'
import { PrismaService } from '../prisma/prisma.service'
import { IMAGE_BIZ_TYPE } from '../storage/image-biz-types'
import { ObjectStorageService } from '../storage/storage.service'
import { ACTIVE_TICKET_STATUSES, TICKET_STATUS } from './constants/ticket-status'
import { CreateTicketDto } from './dto/create-ticket.dto'
import { AddTicketMessageDto } from './dto/add-ticket-message.dto'

interface AdminContext {
  adminId: number
  requestId?: string
  ip?: string
}

const USER_AFTER_SALES_ORDER_STATUSES = [
  ORDER_STATUS.ACCEPTED,
  ORDER_STATUS.ON_THE_WAY,
  ORDER_STATUS.IN_SERVICE,
  ORDER_STATUS.PENDING_CONFIRM,
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.AFTER_SALES,
]

const MESSAGE_OPEN_STATUSES: readonly string[] = [
  TICKET_STATUS.OPEN,
  TICKET_STATUS.PENDING,
]

const TICKET_INCLUDE = Prisma.validator<Prisma.TicketInclude>()({
  user: { select: { id: true, nickname: true, phone: true } },
  order: { select: { id: true, orderNo: true, status: true, staffId: true } },
  messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
})

type TicketRecord = Prisma.TicketGetPayload<{ include: typeof TICKET_INCLUDE }>

@Injectable()
export class AfterSalesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OrderTransitionService) private readonly transitions: OrderTransitionService,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
  ) {}

  async createOrderTicket(userId: number, orderId: number, dto: CreateTicketDto, requestId?: string) {
    const active = await this.findActiveTicket(userId, orderId)
    if (active) return this.presentTicket(active)

    const order = await this.prisma.order.findUnique({
      where: { id: BigInt(orderId) },
      select: { id: true, userId: true, staffId: true, status: true, orderNo: true },
    })
    if (!order) throw new BusinessException(ErrorCode.ORDER_NOT_FOUND, 'order not found', 404)
    if (order.userId !== BigInt(userId)) {
      throw new BusinessException(ErrorCode.ORDER_FORBIDDEN, 'order forbidden', 403)
    }
    this.assertOrderAllowsAfterSales(order.status)

    const images = this.normalizeImages(dto.images)
    let createdTicketId: bigint | null = null

    await this.transitions.transition({
      orderId: order.id,
      action: ORDER_ACTION.AFTER_SALES_REQUEST,
      operatorType: 'user',
      operatorId: BigInt(userId),
      requestId,
      remark: dto.title,
      detail: {
        type: dto.type,
        title: dto.title,
        contactPhone: dto.contactPhone || '',
      },
      sideEffect: async (tx, lockedOrder) => {
        const existing = await tx.ticket.findFirst({
          where: {
            orderId: lockedOrder.id,
            userId: BigInt(userId),
            status: { in: [...ACTIVE_TICKET_STATUSES] },
          },
          select: { id: true },
        })
        if (existing) {
          createdTicketId = existing.id
          return
        }

        const ticket = await tx.ticket.create({
          data: {
            ticketNo: this.createTicketNo(),
            orderId: lockedOrder.id,
            userId: BigInt(userId),
            staffId: lockedOrder.staffId,
            type: dto.type,
            title: dto.title,
            description: dto.description,
            status: TICKET_STATUS.OPEN,
            priority: this.priorityForType(dto.type),
          },
        })
        createdTicketId = ticket.id
        await tx.ticketMessage.create({
          data: {
            ticketId: ticket.id,
            senderType: 'user',
            senderId: BigInt(userId),
            content: dto.description,
            images: images.length ? images : undefined,
          },
        })
      },
    })

    const ticket = await this.getTicketRecord(createdTicketId)
    await this.storage.bindFilesToBiz(images, IMAGE_BIZ_TYPE.AFTER_SALES_IMAGE, ticket.id)
    return this.presentTicket(ticket)
  }

  async listUserOrderTickets(userId: number, orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: BigInt(orderId) },
      select: { id: true, userId: true },
    })
    if (!order) throw new BusinessException(ErrorCode.ORDER_NOT_FOUND, 'order not found', 404)
    if (order.userId !== BigInt(userId)) {
      throw new BusinessException(ErrorCode.ORDER_FORBIDDEN, 'order forbidden', 403)
    }

    const tickets = await this.prisma.ticket.findMany({
      where: { orderId: BigInt(orderId), userId: BigInt(userId) },
      include: TICKET_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    return tickets.map(ticket => this.presentTicket(ticket))
  }

  async getUserTicket(userId: number, ticketId: number) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: BigInt(ticketId) },
      include: TICKET_INCLUDE,
    })
    if (!ticket || ticket.userId !== BigInt(userId)) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'ticket not found', 404)
    }
    return this.presentTicket(ticket)
  }

  async addUserMessage(userId: number, ticketId: number, dto: AddTicketMessageDto) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: BigInt(ticketId) } })
    if (!ticket || ticket.userId !== BigInt(userId)) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'ticket not found', 404)
    }
    this.assertTicketAllowsMessage(ticket.status)
    const images = this.normalizeImages(dto.images)

    await this.prisma.$transaction(async (tx) => {
      await tx.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          senderType: 'user',
          senderId: BigInt(userId),
          content: dto.content,
          images: images.length ? images : undefined,
        },
      })
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { status: TICKET_STATUS.OPEN },
      })
    })
    await this.storage.bindFilesToBiz(images, IMAGE_BIZ_TYPE.AFTER_SALES_IMAGE, ticket.id)

    return this.getUserTicket(userId, ticketId)
  }

  async closeUserTicket(userId: number, ticketId: number) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: BigInt(ticketId) } })
    if (!ticket || ticket.userId !== BigInt(userId)) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'ticket not found', 404)
    }
    if (!MESSAGE_OPEN_STATUSES.includes(ticket.status)) {
      return this.getUserTicket(userId, ticketId)
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { status: TICKET_STATUS.CLOSED, resolvedAt: new Date() },
      })
      await this.restoreCompletedAfterSalesOrder(tx, {
        orderId: ticket.orderId,
        operatorType: 'user',
        operatorId: BigInt(userId),
        detail: {
          ticketId: Number(ticket.id),
          ticketStatus: TICKET_STATUS.CLOSED,
          closedBy: 'user',
        },
      })
    })
    return this.getUserTicket(userId, ticketId)
  }

  async listAdminTickets(query: { page?: number, pageSize?: number, status?: string, keyword?: string }) {
    const page = this.positiveInt(query.page, 1, 100000)
    const pageSize = this.positiveInt(query.pageSize, 20, 100)
    const where: Prisma.TicketWhereInput = {}
    if (query.status && query.status !== 'all') where.status = query.status
    if (query.keyword) {
      where.OR = [
        { ticketNo: { contains: query.keyword } },
        { title: { contains: query.keyword } },
        { description: { contains: query.keyword } },
        { order: { orderNo: { contains: query.keyword } } },
        { user: { nickname: { contains: query.keyword } } },
        { user: { phone: { contains: query.keyword } } },
      ]
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.findMany({
        where,
        include: TICKET_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return { items: items.map(ticket => this.presentTicket(ticket)), page, pageSize, total }
  }

  async getAdminTicket(id: number) {
    return this.presentTicket(await this.getTicketRecord(BigInt(id)))
  }

  async addAdminMessage(id: number, dto: AddTicketMessageDto, context: AdminContext) {
    const ticket = await this.getTicketRecord(BigInt(id))
    this.assertTicketAllowsMessage(ticket.status)
    const images = this.normalizeImages(dto.images)

    await this.prisma.$transaction(async (tx) => {
      await tx.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          senderType: 'admin',
          senderId: BigInt(context.adminId),
          content: dto.content,
          images: images.length ? images : undefined,
        },
      })
      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          status: TICKET_STATUS.PENDING,
          handledBy: BigInt(context.adminId),
        },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'ticket:message:create',
        module: 'after-sales',
        targetType: 'ticket',
        targetId: ticket.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { content: dto.content },
      })
    })
    await this.storage.bindFilesToBiz(images, IMAGE_BIZ_TYPE.AFTER_SALES_IMAGE, ticket.id)

    return this.getAdminTicket(id)
  }

  async resolveAdminTicket(id: number, status: 'resolved' | 'rejected' | 'closed', remark: string | undefined, context: AdminContext) {
    const ticket = await this.getTicketRecord(BigInt(id))
    const nextStatus = status === 'resolved'
      ? TICKET_STATUS.RESOLVED
      : status === 'rejected'
        ? TICKET_STATUS.REJECTED
        : TICKET_STATUS.CLOSED

    await this.prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          status: nextStatus,
          handledBy: BigInt(context.adminId),
          resolvedAt: new Date(),
        },
      })
      if (remark?.trim()) {
        await tx.ticketMessage.create({
          data: {
            ticketId: ticket.id,
            senderType: 'admin',
            senderId: BigInt(context.adminId),
            content: remark.trim(),
          },
        })
      }
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: `ticket:${nextStatus}`,
        module: 'after-sales',
        targetType: 'ticket',
        targetId: ticket.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: ticket.status, after: nextStatus, remark: remark || '' },
      })
      await this.restoreCompletedAfterSalesOrder(tx, {
        orderId: ticket.orderId,
        operatorType: 'admin',
        operatorId: BigInt(context.adminId),
        requestId: context.requestId,
        detail: {
          ticketId: Number(ticket.id),
          beforeTicketStatus: ticket.status,
          ticketStatus: nextStatus,
        },
      })
    })

    return this.getAdminTicket(id)
  }

  private async findActiveTicket(userId: number, orderId: number) {
    return this.prisma.ticket.findFirst({
      where: {
        orderId: BigInt(orderId),
        userId: BigInt(userId),
        status: { in: [...ACTIVE_TICKET_STATUSES] },
      },
      include: TICKET_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
  }

  private async getTicketRecord(id: bigint | null) {
    if (!id) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'ticket not found', 404)
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: TICKET_INCLUDE,
    })
    if (!ticket) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'ticket not found', 404)
    return ticket
  }

  private assertOrderAllowsAfterSales(status: string) {
    if (USER_AFTER_SALES_ORDER_STATUSES.includes(status as any)) return
    if (status === ORDER_STATUS.PENDING_PAYMENT || status === ORDER_STATUS.PENDING_DISPATCH) {
      throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order should be cancelled before after-sales', 409)
    }
    if (status === ORDER_STATUS.REFUND_PENDING) {
      throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'refund is already in progress', 409)
    }
    throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order does not allow after-sales', 409)
  }

  private assertTicketAllowsMessage(status: string) {
    if (MESSAGE_OPEN_STATUSES.includes(status)) return
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'ticket is closed', 409)
  }

  private async restoreCompletedAfterSalesOrder(
    tx: Prisma.TransactionClient,
    params: {
      orderId: bigint
      operatorType: 'user' | 'admin'
      operatorId: bigint
      requestId?: string
      detail?: Record<string, unknown>
    },
  ) {
    const sourceLog = await tx.orderStatusLog.findFirst({
      where: {
        orderId: params.orderId,
        action: ORDER_ACTION.AFTER_SALES_REQUEST,
        fromStatus: { in: [ORDER_STATUS.PENDING_CONFIRM, ORDER_STATUS.COMPLETED] },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { fromStatus: true },
    })
    if (!sourceLog) return

    const order = await tx.order.findUnique({
      where: { id: params.orderId },
      select: { id: true, status: true, completedAt: true },
    })
    if (!order || order.status !== ORDER_STATUS.AFTER_SALES) return

    const now = new Date()
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: ORDER_STATUS.COMPLETED,
        completedAt: order.completedAt || now,
        version: { increment: 1 },
      },
    })
    await tx.orderStatusLog.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: ORDER_STATUS.COMPLETED,
        operatorType: params.operatorType,
        operatorId: params.operatorId,
        action: ORDER_ACTION.AFTER_SALES_CLOSE,
        requestId: params.requestId,
        remark: 'after-sales ticket closed',
        detail: params.detail ? params.detail as Prisma.InputJsonObject : undefined,
      },
    })
  }

  private normalizeImages(images?: string[]) {
    const normalized = (images || []).map(url => String(url || '').trim()).filter(Boolean)
    for (const url of normalized) {
      this.storage.assertPermanentOssUrl(url)
    }
    return normalized
  }

  private presentTicket(ticket: TicketRecord) {
    const messages = ticket.messages.map(message => ({
      id: Number(message.id),
      senderType: message.senderType,
      senderId: Number(message.senderId),
      content: message.content,
      images: this.signImages(message.images),
      createdAt: message.createdAt.toISOString(),
    }))
    const latestMessage = messages[messages.length - 1] || null
    return {
      id: Number(ticket.id),
      ticketNo: ticket.ticketNo,
      orderId: Number(ticket.orderId),
      orderNo: ticket.order.orderNo,
      orderStatus: ticket.order.status,
      userId: Number(ticket.userId),
      userName: ticket.user.nickname || '',
      userPhone: ticket.user.phone || '',
      staffId: ticket.staffId ? Number(ticket.staffId) : null,
      type: ticket.type,
      title: ticket.title,
      description: ticket.description || '',
      status: ticket.status,
      priority: ticket.priority,
      handledBy: ticket.handledBy ? Number(ticket.handledBy) : null,
      resolvedAt: ticket.resolvedAt?.toISOString() || null,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      latestMessage: latestMessage?.content || '',
      messages,
    }
  }

  private signImages(value: Prisma.JsonValue) {
    if (!Array.isArray(value)) return []
    const urls = value.map(item => typeof item === 'string' ? item : '').filter(Boolean)
    return this.storage.signUrlList(urls)
  }

  private priorityForType(type: string) {
    if (type === 'refund' || type === 'complaint') return 2
    if (type === 'service_quality') return 1
    return 0
  }

  private createTicketNo() {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const random = Math.random().toString(36).slice(2, 8).toUpperCase()
    return `AS${yyyy}${mm}${dd}${random}`
  }

  private positiveInt(value: unknown, fallback: number, max: number) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) return fallback
    return Math.min(parsed, max)
  }
}
