import { Inject, Injectable } from '@nestjs/common'
import { Order, Prisma } from '@prisma/client'
import { AdminAuditService } from '../audit-log/admin-audit.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { ORDER_ACTION } from './constants/order-action'
import { ORDER_STATUS } from './constants/order-status'
import type { AdminOrderRemarkDto } from './dto/admin-order-remark.dto'
import type { AdminQueryOrdersDto } from './dto/admin-query-orders.dto'
import type { AssignOrderDto } from './dto/assign-order.dto'
import type { CompleteServiceDto } from './dto/complete-service.dto'
import type { CreateOrderDto } from './dto/create-order.dto'
import type { QueryOrdersDto } from './dto/query-orders.dto'
import type { RejectOrderDto } from './dto/reject-order.dto'
import type { TransitionVersionDto } from './dto/transition-version.dto'
import { OrderTransitionService } from './order-transition.service'
import {
  presentAdminOrderDetail,
  presentAdminOrderListItem,
  presentOrderDetail,
  presentPricePreview,
  presentStaffOption,
  presentUserOrder,
} from './order-presenter'
import { OrderDetailRecord, OrdersRepository } from './orders.repository'

@Injectable()
export class OrdersService {
  constructor(
    @Inject(OrdersRepository) private readonly repository: OrdersRepository,
    @Inject(OrderTransitionService) private readonly transitions: OrderTransitionService,
    @Inject(AdminAuditService) private readonly adminAudit: AdminAuditService,
  ) {}

  async getPricePreview(serviceId: number) {
    const service = await this.repository.findActiveService(serviceId)
    if (!service) {
      throw new BusinessException(ErrorCode.SERVICE_NOT_FOUND, 'service not found', 404)
    }
    return presentPricePreview(service.basePrice.toNumber())
  }

  async listUserOrders(userId: number, query: QueryOrdersDto) {
    const page = query.page || 1
    const pageSize = query.pageSize || 20
    const result = await this.repository.findUserOrders({
      userId,
      status: query.status,
      page,
      pageSize,
    })
    return {
      items: result.items.map(order => presentUserOrder(order)),
      page,
      pageSize,
      total: result.total,
    }
  }

  async getUserOrderDetail(userId: number, orderId: number) {
    const order = await this.getOrderDetailOrThrow(orderId)
    this.assertUserOwnsOrder(order, userId)
    return presentOrderDetail(order)
  }

  async createOrder(userId: number, dto: CreateOrderDto, requestId?: string) {
    const [service, address] = await Promise.all([
      this.repository.findActiveService(dto.serviceId),
      this.repository.findUserServiceAddress(userId, dto.addressId),
    ])

    if (!service) {
      throw new BusinessException(ErrorCode.SERVICE_NOT_FOUND, 'service not found', 404)
    }
    if (!address) {
      throw new BusinessException(ErrorCode.USER_ADDRESS_NOT_FOUND, 'address not found', 404)
    }

    const appointment = this.parseAppointment(dto.appointmentDate, dto.appointmentTimeSlot)
    const orderNo = this.createOrderNo()
    const serviceSnapshot = {
      id: Number(service.id),
      categoryId: Number(service.categoryId),
      name: service.name,
      description: service.description || '',
      coverImage: service.coverImage || '',
      basePrice: service.basePrice.toNumber(),
      priceUnit: service.priceUnit,
      status: service.status,
      sortOrder: service.sortOrder,
    }
    const addressSnapshot = {
      addressId: Number(address.id),
      id: Number(address.id),
      ownerType: address.ownerType,
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
      latitude: address.latitude?.toNumber() ?? null,
      longitude: address.longitude?.toNumber() ?? null,
      coordinateType: address.coordinateType || '',
      poiId: address.poiId || '',
      mapProvider: address.mapProvider || '',
    }

    const created = await this.repository.client.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNo,
          userId: BigInt(userId),
          serviceId: BigInt(dto.serviceId),
          status: ORDER_STATUS.PENDING_PAYMENT,
          serviceSnapshot: serviceSnapshot as Prisma.InputJsonObject,
          addressSnapshot: addressSnapshot as Prisma.InputJsonObject,
          appointmentStartTime: appointment.start,
          appointmentEndTime: appointment.end,
          originalAmount: service.basePrice,
          discountAmount: 0,
          payableAmount: service.basePrice,
          paidAmount: 0,
          couponId: dto.couponId ? BigInt(dto.couponId) : null,
          memberCardId: dto.memberCardId ? BigInt(dto.memberCardId) : null,
          remark: dto.remark || null,
          cityCode: service.cityCode,
        },
      })

      await this.transitions.createInitialStatusLog({
        tx,
        orderId: order.id,
        operatorType: 'user',
        operatorId: BigInt(userId),
        requestId,
      })

      return order
    })

    return this.getUserOrderDetail(userId, Number(created.id))
  }

  async cancelOrder(userId: number, orderId: number, dto: TransitionVersionDto, requestId?: string) {
    const current = await this.getOrderDetailOrThrow(orderId)
    this.assertUserOwnsOrder(current, userId)
    if (current.status === ORDER_STATUS.CANCELLED) {
      return presentOrderDetail(current)
    }

    await this.transitions.transition({
      orderId: BigInt(orderId),
      action: ORDER_ACTION.USER_CANCEL_UNPAID,
      operatorType: 'user',
      operatorId: BigInt(userId),
      requestId,
      version: dto.version,
      remark: dto.reason || 'user cancel before payment',
      orderData: {
        cancelledAt: new Date(),
        cancelReason: dto.reason || 'user cancel before payment',
      },
      check: order => this.assertOrderUserId(order, userId),
    })

    return this.getUserOrderDetail(userId, orderId)
  }

  async confirmOrder(userId: number, orderId: number, dto: TransitionVersionDto, requestId?: string) {
    const current = await this.getOrderDetailOrThrow(orderId)
    this.assertUserOwnsOrder(current, userId)
    if (current.status === ORDER_STATUS.COMPLETED) {
      return presentOrderDetail(current)
    }

    try {
      await this.transitions.transition({
        orderId: BigInt(orderId),
        action: ORDER_ACTION.USER_CONFIRM,
        operatorType: 'user',
        operatorId: BigInt(userId),
        requestId,
        version: dto.version,
        orderData: { completedAt: new Date() },
        check: order => this.assertOrderUserId(order, userId),
      })
    }
    catch (error) {
      const latest = await this.repository.findOrderDetail(orderId)
      if (error instanceof BusinessException
        && error.code === ErrorCode.ORDER_STATUS_INVALID
        && latest?.status === ORDER_STATUS.COMPLETED
        && Number(latest.userId) === userId) {
        return presentOrderDetail(latest)
      }
      throw error
    }

    return this.getUserOrderDetail(userId, orderId)
  }

  async listAdminOrders(query: AdminQueryOrdersDto) {
    const page = this.normalizePositiveInt(query.page || query.pageNum, 1)
    const pageSize = this.normalizePositiveInt(query.pageSize, 20, 100)
    const result = await this.repository.findAdminOrders({
      status: query.status,
      keyword: query.keyword || query.keywords,
      dateStart: this.parseDateStart(query.dateStart || query.startDate),
      dateEnd: this.parseDateEnd(query.dateEnd || query.endDate),
      page,
      pageSize,
    })
    return {
      items: result.items.map(order => presentAdminOrderListItem(order)),
      page,
      pageSize,
      total: result.total,
    }
  }

  async getAdminOrderDetail(orderId: number) {
    const order = await this.getOrderDetailOrThrow(orderId)
    return presentAdminOrderDetail(order)
  }

  async assignOrder(adminId: number, orderId: number, dto: AssignOrderDto, requestId?: string, ip?: string) {
    const staff = await this.repository.client.staff.findFirst({
      where: { id: BigInt(dto.staffId), status: 1, deletedAt: null },
    })
    if (!staff) {
      throw new BusinessException(ErrorCode.STAFF_NOT_FOUND, 'staff not found', 404)
    }

    await this.transitions.transition({
      orderId: BigInt(orderId),
      action: ORDER_ACTION.ADMIN_ASSIGN,
      operatorType: 'admin',
      operatorId: BigInt(adminId),
      requestId,
      remark: dto.remark,
      detail: { staffId: dto.staffId },
      orderData: { staffId: BigInt(dto.staffId) },
      sideEffect: async (tx, order, now) => {
        await tx.orderAssignment.create({
          data: {
            orderId: order.id,
            staffId: BigInt(dto.staffId),
            assignType: 'manual',
            assignStatus: 'pending',
            assignedBy: BigInt(adminId),
            assignedAt: now,
          },
        })
        await this.adminAudit.writeWithClient(tx, {
          adminId,
          action: 'order:assign',
          module: 'order',
          targetType: 'order',
          targetId: order.id,
          requestId,
          ip,
          detail: {
            staffId: dto.staffId,
            remark: dto.remark || '',
            fromStatus: order.status,
            toStatus: ORDER_STATUS.DISPATCHED,
          },
        })
      },
    })

    return this.getAdminOrderDetail(orderId)
  }

  async updateAdminOrderRemark(adminId: number, orderId: number, dto: AdminOrderRemarkDto, requestId?: string, ip?: string) {
    const current = await this.getOrderDetailOrThrow(orderId)
    const nextRemark = dto.remark.trim()

    await this.repository.client.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: BigInt(orderId) },
        data: { adminRemark: nextRemark },
      })
      await this.adminAudit.writeWithClient(tx, {
        adminId,
        action: 'order:remark:update',
        module: 'order',
        targetType: 'order',
        targetId: current.id,
        requestId,
        ip,
        detail: {
          before: { adminRemark: current.adminRemark || '' },
          after: { adminRemark: nextRemark },
        },
      })
    })

    return this.getAdminOrderDetail(orderId)
  }

  async listAssignableStaffOptions() {
    const staff = await this.repository.findAssignableStaffOptions()
    return staff.map(item => presentStaffOption(item))
  }

  async listStaffOrders(staffId: number, query: QueryOrdersDto) {
    const page = query.page || 1
    const pageSize = query.pageSize || 20
    const result = await this.repository.findStaffOrders({
      staffId,
      status: query.status,
      page,
      pageSize,
    })
    return {
      items: result.items.map(order => presentUserOrder(order)),
      page,
      pageSize,
      total: result.total,
    }
  }

  async getStaffProfile(staffId: number, _period?: string) {
    const staff = await this.repository.client.staff.findFirst({
      where: { id: BigInt(staffId), status: 1, deletedAt: null },
      select: {
        id: true,
        name: true,
        phone: true,
        avatarUrl: true,
        cityCode: true,
        rating: true,
      },
    })
    if (!staff) {
      throw new BusinessException(ErrorCode.STAFF_NOT_FOUND, 'staff not found', 404)
    }

    const [today, week, month, total] = await Promise.all([
      this.getStaffProfileStats(staffId, 'today'),
      this.getStaffProfileStats(staffId, 'week'),
      this.getStaffProfileStats(staffId, 'month'),
      this.getStaffProfileStats(staffId, 'total'),
    ])

    return {
      staffId: Number(staff.id),
      staffName: staff.name,
      staffPhone: staff.phone,
      avatar: staff.avatarUrl || '',
      verified: true,
      regionText: staff.cityCode || staff.phone,
      rating: staff.rating.toNumber(),
      stats: { today, week, month, total },
    }
  }

  async getStaffOrderDetail(staffId: number, orderId: number) {
    const order = await this.getOrderDetailOrThrow(orderId)
    this.assertStaffOwnsOrder(order, staffId)
    return presentOrderDetail(order)
  }

  async staffAccept(staffId: number, orderId: number, requestId?: string) {
    await this.transitions.transition({
      orderId: BigInt(orderId),
      action: ORDER_ACTION.STAFF_ACCEPT,
      operatorType: 'staff',
      operatorId: BigInt(staffId),
      requestId,
      check: order => this.assertOrderStaffId(order, staffId),
      sideEffect: async (tx, order, now) => {
        const result = await tx.orderAssignment.updateMany({
          where: {
            orderId: order.id,
            staffId: BigInt(staffId),
            assignStatus: 'pending',
          },
          data: {
            assignStatus: 'accepted',
            acceptedAt: now,
          },
        })
        if (result.count !== 1) {
          throw new BusinessException(ErrorCode.ORDER_ASSIGNMENT_INVALID, 'assignment is not pending', 409)
        }
      },
    })

    return this.getStaffOrderDetail(staffId, orderId)
  }

  async staffReject(staffId: number, orderId: number, dto: RejectOrderDto, requestId?: string) {
    await this.transitions.transition({
      orderId: BigInt(orderId),
      action: ORDER_ACTION.STAFF_REJECT,
      operatorType: 'staff',
      operatorId: BigInt(staffId),
      requestId,
      version: dto.version,
      remark: dto.reason || 'staff rejected',
      detail: { reason: dto.reason || '' },
      orderData: { staffId: null },
      check: order => this.assertOrderStaffId(order, staffId),
      sideEffect: async (tx, order, now) => {
        const result = await tx.orderAssignment.updateMany({
          where: {
            orderId: order.id,
            staffId: BigInt(staffId),
            assignStatus: 'pending',
          },
          data: {
            assignStatus: 'rejected',
            rejectReason: dto.reason || null,
            rejectedAt: now,
          },
        })
        if (result.count !== 1) {
          throw new BusinessException(ErrorCode.ORDER_ASSIGNMENT_INVALID, 'assignment is not pending', 409)
        }
      },
    })

    return this.getOrderDetailOrThrow(orderId).then(order => presentOrderDetail(order))
  }

  async staffOnTheWay(staffId: number, orderId: number, dto: TransitionVersionDto, requestId?: string) {
    await this.transitions.transition({
      orderId: BigInt(orderId),
      action: ORDER_ACTION.STAFF_ON_THE_WAY,
      operatorType: 'staff',
      operatorId: BigInt(staffId),
      requestId,
      version: dto.version,
      check: order => this.assertOrderStaffId(order, staffId),
      sideEffect: async (tx, order) => {
        await tx.serviceCheckin.create({
          data: {
            orderId: order.id,
            staffId: BigInt(staffId),
            checkinType: 'on_the_way',
          },
        })
      },
    })

    return this.getStaffOrderDetail(staffId, orderId)
  }

  async staffStartService(staffId: number, orderId: number, dto: TransitionVersionDto, requestId?: string) {
    await this.transitions.transition({
      orderId: BigInt(orderId),
      action: ORDER_ACTION.STAFF_START,
      operatorType: 'staff',
      operatorId: BigInt(staffId),
      requestId,
      version: dto.version,
      check: order => this.assertOrderStaffId(order, staffId),
      sideEffect: async (tx, order) => {
        await tx.serviceCheckin.create({
          data: {
            orderId: order.id,
            staffId: BigInt(staffId),
            checkinType: 'start',
          },
        })
      },
    })

    return this.getStaffOrderDetail(staffId, orderId)
  }

  async staffComplete(staffId: number, orderId: number, dto: CompleteServiceDto, requestId?: string) {
    await this.transitions.transition({
      orderId: BigInt(orderId),
      action: ORDER_ACTION.STAFF_COMPLETE,
      operatorType: 'staff',
      operatorId: BigInt(staffId),
      requestId,
      version: dto.version,
      remark: dto.remark,
      detail: { photoCount: dto.photoUrls?.length || 0 },
      check: order => this.assertOrderStaffId(order, staffId),
      sideEffect: async (tx, order) => {
        await tx.serviceCheckin.create({
          data: {
            orderId: order.id,
            staffId: BigInt(staffId),
            checkinType: 'finish',
          },
        })
        if (dto.photoUrls?.length) {
          await tx.servicePhoto.createMany({
            data: dto.photoUrls.map((url, index) => ({
              orderId: order.id,
              staffId: BigInt(staffId),
              photoType: index === 0 ? 'finish' : 'extra',
              url,
              remark: dto.remark || null,
            })),
          })
        }
      },
    })

    return this.getStaffOrderDetail(staffId, orderId)
  }

  async timeoutUnpaid(orderId: number, requestId?: string) {
    await this.transitions.transition({
      orderId: BigInt(orderId),
      action: ORDER_ACTION.TIMEOUT_UNPAID,
      operatorType: 'system',
      operatorId: BigInt(0),
      requestId,
      remark: 'unpaid timeout',
      orderData: {
        cancelledAt: new Date(),
        cancelReason: 'unpaid timeout',
      },
    })
  }

  async autoConfirm(orderId: number, requestId?: string) {
    await this.transitions.transition({
      orderId: BigInt(orderId),
      action: ORDER_ACTION.AUTO_CONFIRM,
      operatorType: 'system',
      operatorId: BigInt(0),
      requestId,
      orderData: { completedAt: new Date() },
    })
  }

  private async getOrderDetailOrThrow(orderId: number): Promise<OrderDetailRecord> {
    const order = await this.repository.findOrderDetail(orderId)
    if (!order) {
      throw new BusinessException(ErrorCode.ORDER_NOT_FOUND, 'order not found', 404)
    }
    return order
  }

  private assertUserOwnsOrder(order: OrderDetailRecord, userId: number) {
    if (Number(order.userId) !== userId) {
      throw new BusinessException(ErrorCode.ORDER_FORBIDDEN, 'order forbidden', 403)
    }
  }

  private assertStaffOwnsOrder(order: OrderDetailRecord, staffId: number) {
    if (Number(order.staffId || 0) !== staffId) {
      throw new BusinessException(ErrorCode.STAFF_FORBIDDEN, 'staff order forbidden', 403)
    }
  }

  private assertOrderUserId(order: Order, userId: number) {
    if (Number(order.userId) !== userId) {
      throw new BusinessException(ErrorCode.ORDER_FORBIDDEN, 'order forbidden', 403)
    }
  }

  private assertOrderStaffId(order: Order, staffId: number) {
    if (Number(order.staffId || 0) !== staffId) {
      throw new BusinessException(ErrorCode.STAFF_FORBIDDEN, 'staff order forbidden', 403)
    }
  }

  private parseAppointment(dateText: string, slotText: string) {
    const [startTime, endTime] = slotText.split('-')
    const start = new Date(`${dateText}T${startTime}:00`)
    const end = new Date(`${dateText}T${endTime}:00`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid appointment time', 400)
    }
    return { start, end }
  }

  private parseDateStart(value?: string) {
    if (!value) return undefined
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid dateStart', 400)
    }
    return date
  }

  private parseDateEnd(value?: string) {
    if (!value) return undefined
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid dateEnd', 400)
    }
    return date
  }

  private normalizePositiveInt(value: unknown, fallback: number, max?: number) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) return fallback
    return max ? Math.min(parsed, max) : parsed
  }

  private async getStaffProfileStats(staffId: number, period: 'today' | 'week' | 'month' | 'total') {
    const range = this.getPeriodDateRange(period)
    const createdWhere: Prisma.OrderWhereInput = {
      staffId: BigInt(staffId),
      ...(range ? { createdAt: { gte: range.start, lt: range.end } } : {}),
    }
    const completedWhere: Prisma.OrderWhereInput = {
      staffId: BigInt(staffId),
      status: ORDER_STATUS.COMPLETED,
      ...(range ? { completedAt: { gte: range.start, lt: range.end } } : {}),
    }

    const [newOrderCount, completedOrderCount, completedAmount] = await Promise.all([
      this.repository.client.order.count({ where: createdWhere }),
      this.repository.client.order.count({ where: completedWhere }),
      this.repository.client.order.aggregate({
        where: completedWhere,
        _sum: { payableAmount: true },
      }),
    ])

    return {
      period,
      newStaffCount: 0,
      newOrderCount,
      writeOrderCount: 0,
      completedOrderCount,
      commissionAmount: completedAmount._sum.payableAmount?.toNumber() || 0,
      bonusAmount: 0,
    }
  }

  private getPeriodDateRange(period: 'today' | 'week' | 'month' | 'total') {
    if (period === 'total') return null
    const now = new Date()
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)

    if (period === 'week') {
      const day = start.getDay() || 7
      start.setDate(start.getDate() - day + 1)
    }
    if (period === 'month') {
      start.setDate(1)
    }

    const end = new Date(start)
    if (period === 'today') end.setDate(end.getDate() + 1)
    if (period === 'week') end.setDate(end.getDate() + 7)
    if (period === 'month') end.setMonth(end.getMonth() + 1)

    return { start, end }
  }

  private createOrderNo() {
    const now = new Date()
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('')
    const time = [
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('')
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
    return `LA${date}${time}${random}`
  }
}
