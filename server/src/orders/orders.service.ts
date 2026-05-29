import { Inject, Injectable } from '@nestjs/common'
import { Order, Prisma } from '@prisma/client'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { ORDER_ACTION } from './constants/order-action'
import { ORDER_STATUS } from './constants/order-status'
import type { AssignOrderDto } from './dto/assign-order.dto'
import type { CompleteServiceDto } from './dto/complete-service.dto'
import type { CreateOrderDto } from './dto/create-order.dto'
import type { QueryOrdersDto } from './dto/query-orders.dto'
import type { RejectOrderDto } from './dto/reject-order.dto'
import type { TransitionVersionDto } from './dto/transition-version.dto'
import { OrderTransitionService } from './order-transition.service'
import { presentOrderDetail, presentPricePreview, presentUserOrder } from './order-presenter'
import { OrderDetailRecord, OrdersRepository } from './orders.repository'

@Injectable()
export class OrdersService {
  constructor(
    @Inject(OrdersRepository) private readonly repository: OrdersRepository,
    @Inject(OrderTransitionService) private readonly transitions: OrderTransitionService,
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
      this.repository.findUserAddress(userId, dto.addressId),
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
      id: Number(address.id),
      contactName: address.contactName,
      contactPhone: address.contactPhone,
      province: address.province,
      city: address.city,
      district: address.district,
      address: address.address,
      latitude: address.latitude?.toNumber() ?? null,
      longitude: address.longitude?.toNumber() ?? null,
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

  async listAdminOrders(query: QueryOrdersDto) {
    const page = query.page || 1
    const pageSize = query.pageSize || 20
    const result = await this.repository.findAdminOrders({
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

  async getAdminOrderDetail(orderId: number) {
    const order = await this.getOrderDetailOrThrow(orderId)
    return presentOrderDetail(order)
  }

  async assignOrder(adminId: number, orderId: number, dto: AssignOrderDto, requestId?: string) {
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
      },
    })

    return this.getAdminOrderDetail(orderId)
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
