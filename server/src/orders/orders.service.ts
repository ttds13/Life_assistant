import { Inject, Injectable } from '@nestjs/common'
import { Order, Prisma } from '@prisma/client'
import { AdminAuditService } from '../audit-log/admin-audit.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { MemberCardsService } from '../member-cards/member-cards.service'
import { MEMBER_CARD_TYPE } from '../member-cards/constants/member-card'
import { ORDER_ACTION } from './constants/order-action'
import { ORDER_STATUS } from './constants/order-status'
import { ORDER_TYPE, isStaffVisibleOrderType } from './constants/order-type'
import type { AutoAssignOrderDto } from './dto/auto-assign-order.dto'
import type { AdminOrderRemarkDto } from './dto/admin-order-remark.dto'
import type { AdminQueryOrdersDto } from './dto/admin-query-orders.dto'
import type { AdminUpdateOrderDto } from './dto/admin-update-order.dto'
import type { AssignOrderDto } from './dto/assign-order.dto'
import type { CompleteServiceDto } from './dto/complete-service.dto'
import type { CreateOrderDto } from './dto/create-order.dto'
import type { PricePreviewDto } from './dto/price-preview.dto'
import type { QueryOrdersDto } from './dto/query-orders.dto'
import type { RejectOrderDto } from './dto/reject-order.dto'
import type { RescheduleOrderDto } from './dto/reschedule-order.dto'
import type { TransitionVersionDto } from './dto/transition-version.dto'
import type { UpdateStaffProfileDto } from './dto/update-staff-profile.dto'
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
import { ObjectStorageService } from '../storage/storage.service'

type AutoAssignSource = 'admin_retry' | 'job_retry'
type AutoAssignSkipReason = 'order_not_pending_dispatch' | 'already_assigned' | 'no_available_staff'

export interface AutoAssignSystemOptions {
  requestId?: string
  source?: AutoAssignSource
  remark?: string
}

export interface AutoAssignSystemResult {
  assigned: boolean
  reason?: AutoAssignSkipReason
  staffId?: number
  orderStatus: string
}

@Injectable()
export class OrdersService {
  constructor(
    @Inject(OrdersRepository) private readonly repository: OrdersRepository,
    @Inject(OrderTransitionService) private readonly transitions: OrderTransitionService,
    @Inject(AdminAuditService) private readonly adminAudit: AdminAuditService,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
    @Inject(MemberCardsService) private readonly memberCards: MemberCardsService,
  ) {}

  async getPricePreview(query: PricePreviewDto) {
    const service = await this.resolveActiveService(query)
    const serviceCardType = this.memberCards.calculateServiceCardType(service)
    return presentPricePreview(service.basePrice.toNumber(), {
      consultationRequired: serviceCardType === MEMBER_CARD_TYPE.CONSULTATION,
      cardType: serviceCardType,
    })
  }

  async listUserOrders(userId: number, query: QueryOrdersDto) {
    const page = this.normalizePositiveInt(query.page, 1)
    const pageSize = this.normalizePositiveInt(query.pageSize, 20, 100)
    const result = await this.repository.findUserOrders({
      userId,
      status: query.status,
      page,
      pageSize,
    })
    return {
      items: result.items.map(order => this.withSignedOrderImages(presentUserOrder(order))),
      page,
      pageSize,
      total: result.total,
    }
  }

  async getUserOrderDetail(userId: number, orderId: number) {
    const order = await this.getOrderDetailOrThrow(orderId)
    this.assertUserOwnsOrder(order, userId)
    return this.withSignedOrderImages(presentOrderDetail(order))
  }

  async createOrder(userId: number, dto: CreateOrderDto, requestId?: string) {
    const [service, address] = await Promise.all([
      this.resolveActiveService(dto),
      this.repository.findUserServiceAddress(userId, dto.addressId),
    ])

    if (!address) {
      throw new BusinessException(ErrorCode.USER_ADDRESS_NOT_FOUND, 'address not found', 404)
    }

    const appointment = this.parseAppointment(dto.appointmentDate, dto.appointmentTimeSlot)
    const serviceCardType = this.memberCards.calculateServiceCardType(service)
    const isConsultationOrder = serviceCardType === MEMBER_CARD_TYPE.CONSULTATION
    const isMemberCardOrder = Boolean(dto.memberCardId)
    if (isConsultationOrder && isMemberCardOrder) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'consultation service cannot use member card', 400)
    }
    const orderNo = this.createOrderNo()
    const serviceSnapshot = {
      id: Number(service.id),
      code: service.code,
      categoryId: Number(service.categoryId),
      name: service.name,
      description: service.description || '',
      coverImage: service.coverImage || '',
      basePrice: service.basePrice.toNumber(),
      priceUnit: service.priceUnit,
      durationMinutes: service.durationMinutes || 0,
      cardType: serviceCardType,
      consultationRequired: isConsultationOrder,
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

    const initialStatus = isMemberCardOrder || isConsultationOrder
      ? ORDER_STATUS.PENDING_DISPATCH
      : ORDER_STATUS.PENDING_PAYMENT
    const payableAmount = isMemberCardOrder || isConsultationOrder
      ? new Prisma.Decimal(0)
      : service.basePrice

    const created = await this.repository.client.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNo,
          userId: BigInt(userId),
          serviceId: service.id,
          orderType: isConsultationOrder ? ORDER_TYPE.CONSULTATION : ORDER_TYPE.SERVICE_BOOKING,
          status: initialStatus,
          serviceSnapshot: serviceSnapshot as Prisma.InputJsonObject,
          addressSnapshot: addressSnapshot as Prisma.InputJsonObject,
          appointmentStartTime: appointment.start,
          appointmentEndTime: appointment.end,
          originalAmount: service.basePrice,
          discountAmount: 0,
          payableAmount,
          paidAmount: 0,
          couponId: dto.couponId ? BigInt(dto.couponId) : null,
          memberCardId: dto.memberCardId ? BigInt(dto.memberCardId) : null,
          remark: dto.remark || null,
          source: this.normalizeOrderSource(dto.source),
          cityCode: service.cityCode,
        },
      })

      if (isMemberCardOrder && dto.memberCardId) {
        const freeze = await this.memberCards.freezeForOrder({
          tx,
          userId,
          userMemberCardId: dto.memberCardId,
          orderId: order.id,
          service,
        })
        await tx.order.update({
          where: { id: order.id },
          data: {
            memberCardConsumeUnits: freeze.consumeUnits,
            discountAmount: service.basePrice,
          },
        })
      }

      await this.transitions.createInitialStatusLog({
        tx,
        orderId: order.id,
        operatorType: 'user',
        operatorId: BigInt(userId),
        toStatus: initialStatus,
        requestId,
        remark: isMemberCardOrder
          ? 'member card appointment created'
          : isConsultationOrder
            ? 'consultation appointment created'
            : undefined,
        detail: {
          orderType: isConsultationOrder ? ORDER_TYPE.CONSULTATION : ORDER_TYPE.SERVICE_BOOKING,
          memberCardId: dto.memberCardId || null,
          cardType: serviceCardType,
          source: this.normalizeOrderSource(dto.source),
          promotionKey: dto.promotionKey || null,
          campaignId: dto.campaignId || null,
        },
      })

      return order
    })

    return this.getUserOrderDetail(userId, Number(created.id))
  }

  async cancelOrder(userId: number, orderId: number, dto: TransitionVersionDto, requestId?: string) {
    const current = await this.getOrderDetailOrThrow(orderId)
    this.assertUserOwnsOrder(current, userId)
    if ([ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUND_PENDING, ORDER_STATUS.REFUNDED].includes(current.status as any)) {
      return this.withSignedOrderImages(presentOrderDetail(current))
    }
    if (current.orderType === ORDER_TYPE.MEMBER_CARD_PURCHASE) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card purchase order cannot be cancelled here', 400)
    }
    if (![ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PENDING_DISPATCH].includes(current.status as any)) {
      throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order cannot be cancelled by user', 409)
    }

    const reason = dto.reason || 'user cancel appointment'

    if (current.status === ORDER_STATUS.PENDING_DISPATCH && this.isPaidCashBooking(current)) {
      await this.transitions.transition({
        orderId: BigInt(orderId),
        action: ORDER_ACTION.USER_CANCEL_PAID_REFUND,
        operatorType: 'user',
        operatorId: BigInt(userId),
        requestId,
        version: dto.version,
        remark: reason,
        orderData: {
          cancelledAt: new Date(),
          cancelReason: reason,
        },
        check: (order) => {
          this.assertOrderUserId(order, userId)
          if (order.orderType === ORDER_TYPE.MEMBER_CARD_PURCHASE || order.memberCardId) {
            throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order cannot enter refund pending here', 409)
          }
        },
        sideEffect: async (tx, order) => {
          await this.createPendingRefundForPaidOrder(tx, order, reason)
        },
      })

      return this.getUserOrderDetail(userId, orderId)
    }

    const action = current.status === ORDER_STATUS.PENDING_DISPATCH
      ? ORDER_ACTION.USER_CANCEL_BOOKING
      : ORDER_ACTION.USER_CANCEL_UNPAID

    await this.transitions.transition({
      orderId: BigInt(orderId),
      action,
      operatorType: 'user',
      operatorId: BigInt(userId),
      requestId,
      version: dto.version,
      remark: reason,
      orderData: {
        cancelledAt: new Date(),
        cancelReason: reason,
      },
      check: order => this.assertOrderUserId(order, userId),
      sideEffect: async (tx, order) => {
        await this.memberCards.releaseFrozenForOrder(tx, order, reason)
      },
    })

    return this.getUserOrderDetail(userId, orderId)
  }

  async rescheduleOrder(userId: number, orderId: number, dto: RescheduleOrderDto, requestId?: string) {
    const appointment = this.parseAppointment(dto.appointmentDate, dto.appointmentTimeSlot)
    const orderBigInt = BigInt(orderId)

    await this.repository.client.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderBigInt } })
      if (!order) {
        throw new BusinessException(ErrorCode.ORDER_NOT_FOUND, 'order not found', 404)
      }
      this.assertOrderUserId(order, userId)
      if (order.orderType === ORDER_TYPE.MEMBER_CARD_PURCHASE) {
        throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'member card purchase order cannot be rescheduled', 409)
      }
      if (![ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PENDING_DISPATCH].includes(order.status as any)) {
        throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order cannot be rescheduled by user', 409)
      }
      if (dto.version !== undefined && order.version !== dto.version) {
        throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order version changed, refresh and retry', 409)
      }

      const updated = await tx.order.updateMany({
        where: {
          id: order.id,
          status: order.status,
          version: order.version,
        },
        data: {
          appointmentStartTime: appointment.start,
          appointmentEndTime: appointment.end,
          version: { increment: 1 },
        },
      })
      if (updated.count !== 1) {
        throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order status changed, refresh and retry', 409)
      }

      await tx.orderStatusLog.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: order.status,
          operatorType: 'user',
          operatorId: BigInt(userId),
          action: 'user_reschedule',
          requestId,
          remark: dto.reason || 'user reschedule appointment',
          detail: {
            oldAppointmentStartTime: order.appointmentStartTime.toISOString(),
            oldAppointmentEndTime: order.appointmentEndTime.toISOString(),
            appointmentStartTime: appointment.start.toISOString(),
            appointmentEndTime: appointment.end.toISOString(),
            appointmentTimeSlot: dto.appointmentTimeSlot,
          } as Prisma.InputJsonObject,
        },
      })
    })

    return this.getUserOrderDetail(userId, orderId)
  }

  async confirmOrder(userId: number, orderId: number, dto: TransitionVersionDto, requestId?: string) {
    const current = await this.getOrderDetailOrThrow(orderId)
    this.assertUserOwnsOrder(current, userId)
    if (current.status === ORDER_STATUS.COMPLETED) {
      return this.withSignedOrderImages(presentOrderDetail(current))
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
        return this.withSignedOrderImages(presentOrderDetail(latest))
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
      orderType: query.orderType,
      source: query.source,
      dateStart: this.parseDateStart(query.dateStart || query.startDate),
      dateEnd: this.parseDateEnd(query.dateEnd || query.endDate),
      page,
      pageSize,
    })
    return {
      items: result.items.map(order => this.withSignedOrderImages(presentAdminOrderListItem(order))),
      page,
      pageSize,
      total: result.total,
    }
  }

  async getAdminOrderDetail(orderId: number) {
    const order = await this.getOrderDetailOrThrow(orderId)
    return this.withSignedOrderImages(presentAdminOrderDetail(order))
  }

  async updateAdminOrder(adminId: number, orderId: number, dto: AdminUpdateOrderDto, requestId?: string, ip?: string) {
    const current = await this.getOrderDetailOrThrow(orderId)
    const data: Prisma.OrderUncheckedUpdateInput = {}
    let nextAppointmentStart = current.appointmentStartTime
    let nextAppointmentEnd = current.appointmentEndTime

    if (dto.status !== undefined) data.status = dto.status
    if (dto.staffId !== undefined) {
      if (dto.staffId === null) {
        data.staffId = null
      }
      else {
        const staff = await this.repository.client.staff.findFirst({
          where: { id: BigInt(dto.staffId), deletedAt: null },
        })
        if (!staff) {
          throw new BusinessException(ErrorCode.STAFF_NOT_FOUND, 'staff not found', 404)
        }
        data.staffId = BigInt(dto.staffId)
      }
    }
    if (dto.appointmentStartTime !== undefined) {
      nextAppointmentStart = this.parseAdminDate(dto.appointmentStartTime, 'appointmentStartTime')
      data.appointmentStartTime = nextAppointmentStart
    }
    if (dto.appointmentEndTime !== undefined) {
      nextAppointmentEnd = this.parseAdminDate(dto.appointmentEndTime, 'appointmentEndTime')
      data.appointmentEndTime = nextAppointmentEnd
    }
    if (nextAppointmentStart >= nextAppointmentEnd) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'appointment start must be before end', 400)
    }
    if (dto.appointmentStartTime !== undefined || dto.appointmentEndTime !== undefined) {
      this.assertAppointmentWithinBusinessHours(nextAppointmentStart, nextAppointmentEnd)
    }
    if (dto.originalAmount !== undefined) data.originalAmount = new Prisma.Decimal(dto.originalAmount)
    if (dto.discountAmount !== undefined) data.discountAmount = new Prisma.Decimal(dto.discountAmount)
    if (dto.payableAmount !== undefined) data.payableAmount = new Prisma.Decimal(dto.payableAmount)
    if (dto.paidAmount !== undefined) data.paidAmount = new Prisma.Decimal(dto.paidAmount)
    if (dto.remark !== undefined) data.remark = dto.remark
    if (dto.adminRemark !== undefined) data.adminRemark = dto.adminRemark
    if (dto.cityCode !== undefined) data.cityCode = dto.cityCode
    if (dto.source !== undefined) data.source = dto.source
    if (dto.createdAt !== undefined) data.createdAt = this.parseAdminDate(dto.createdAt, 'createdAt')
    if (dto.paidAt !== undefined) data.paidAt = dto.paidAt === null ? null : this.parseAdminDate(dto.paidAt, 'paidAt')
    if (dto.completedAt !== undefined) {
      data.completedAt = dto.completedAt === null ? null : this.parseAdminDate(dto.completedAt, 'completedAt')
    }
    if (dto.cancelledAt !== undefined) {
      data.cancelledAt = dto.cancelledAt === null ? null : this.parseAdminDate(dto.cancelledAt, 'cancelledAt')
    }
    if (dto.cancelReason !== undefined) data.cancelReason = dto.cancelReason

    if (Object.keys(data).length === 0) {
      return this.withSignedOrderImages(presentAdminOrderDetail(current))
    }

    await this.repository.client.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: BigInt(orderId) },
        data,
      })
      if (current.status !== ORDER_STATUS.CANCELLED && data.status === ORDER_STATUS.CANCELLED) {
        await this.memberCards.releaseFrozenForOrder(
          tx,
          current,
          dto.cancelReason || 'admin cancel order',
          { operatorType: 'admin', operatorId: BigInt(adminId) },
        )
      }
      await this.adminAudit.writeWithClient(tx, {
        adminId,
        action: 'order:update',
        module: 'order',
        targetType: 'order',
        targetId: current.id,
        requestId,
        ip,
        detail: {
          before: this.adminOrderAuditSnapshot(current),
          after: dto,
        },
      })
    })

    return this.getAdminOrderDetail(orderId)
  }

  async deleteAdminOrder(adminId: number, orderId: number, requestId?: string, ip?: string) {
    const current = await this.getOrderDetailOrThrow(orderId)
    const orderBigInt = BigInt(orderId)

    await this.repository.client.$transaction(async (tx) => {
      await this.memberCards.releaseFrozenForOrder(
        tx,
        current,
        'admin delete order',
        { recordOrderId: null, operatorType: 'admin', operatorId: BigInt(adminId) },
      )
      const payments = await tx.payment.findMany({
        where: { orderId: orderBigInt },
        select: { id: true, paymentNo: true },
      })
      const paymentIds = payments.map(payment => payment.id)
      const paymentNos = payments.map(payment => payment.paymentNo)
      if (paymentIds.length) {
        await tx.refund.deleteMany({ where: { paymentId: { in: paymentIds } } })
        await tx.paymentNotifyLog.deleteMany({
          where: {
            OR: [
              { paymentId: { in: paymentIds } },
              { paymentNo: { in: paymentNos } },
            ],
          },
        })
      }
      await tx.refund.deleteMany({ where: { orderId: orderBigInt } })
      await tx.payment.deleteMany({ where: { orderId: orderBigInt } })

      const reviews = await tx.review.findMany({
        where: { orderId: orderBigInt },
        select: { id: true },
      })
      const reviewIds = reviews.map(review => review.id)
      if (reviewIds.length) {
        await tx.reviewImage.deleteMany({ where: { reviewId: { in: reviewIds } } })
      }
      await tx.review.deleteMany({ where: { orderId: orderBigInt } })

      const tickets = await tx.ticket.findMany({
        where: { orderId: orderBigInt },
        select: { id: true },
      })
      const ticketIds = tickets.map(ticket => ticket.id)
      if (ticketIds.length) {
        await tx.ticketMessage.deleteMany({ where: { ticketId: { in: ticketIds } } })
      }
      await tx.ticket.deleteMany({ where: { orderId: orderBigInt } })

      await tx.memberCardRecord.deleteMany({ where: { orderId: orderBigInt } })
      await tx.staffIncomeRecord.deleteMany({ where: { orderId: orderBigInt } })
      await tx.servicePhoto.deleteMany({ where: { orderId: orderBigInt } })
      await tx.serviceCheckin.deleteMany({ where: { orderId: orderBigInt } })
      await tx.orderAssignment.deleteMany({ where: { orderId: orderBigInt } })
      await tx.orderStatusLog.deleteMany({ where: { orderId: orderBigInt } })
      await tx.userCoupon.updateMany({
        where: { usedOrderId: orderBigInt },
        data: { usedOrderId: null, usedAt: null },
      })
      await tx.file.deleteMany({ where: { bizType: 'order', bizId: orderBigInt } })
      await tx.order.delete({ where: { id: orderBigInt } })

      await this.adminAudit.writeWithClient(tx, {
        adminId,
        action: 'order:delete',
        module: 'order',
        targetType: 'order',
        targetId: current.id,
        requestId,
        ip,
        detail: {
          orderNo: current.orderNo,
          status: current.status,
          userId: Number(current.userId),
          staffId: current.staffId ? Number(current.staffId) : null,
        },
      })
    })

    return {
      id: String(current.id),
      orderNo: current.orderNo,
      deleted: true,
    }
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

  async autoAssignOrderBySystem(orderId: number, options: AutoAssignSystemOptions = {}): Promise<AutoAssignSystemResult> {
    const current = await this.getOrderDetailOrThrow(orderId)
    if (current.status !== ORDER_STATUS.PENDING_DISPATCH) {
      return {
        assigned: false,
        reason: 'order_not_pending_dispatch',
        staffId: current.staffId ? Number(current.staffId) : undefined,
        orderStatus: current.status,
      }
    }
    if (!isStaffVisibleOrderType(current.orderType)) {
      return {
        assigned: false,
        reason: 'order_not_pending_dispatch',
        staffId: current.staffId ? Number(current.staffId) : undefined,
        orderStatus: current.status,
      }
    }
    if (current.staffId) {
      return {
        assigned: false,
        reason: 'already_assigned',
        staffId: Number(current.staffId),
        orderStatus: current.status,
      }
    }

    const staff = await this.repository.findAutoAssignableStaff(orderId)
    if (!staff) {
      return {
        assigned: false,
        reason: 'no_available_staff',
        orderStatus: current.status,
      }
    }

    try {
      await this.transitions.transition({
        orderId: BigInt(orderId),
        action: ORDER_ACTION.AUTO_ASSIGN,
        operatorType: 'system',
        operatorId: BigInt(0),
        requestId: options.requestId,
        remark: options.remark || 'auto assign by staff id asc',
        detail: {
          staffId: Number(staff.id),
          strategy: 'staff_id_asc',
          source: options.source || 'admin_retry',
        },
        orderData: { staffId: staff.id },
        check: (order) => {
          if (order.staffId) {
            throw new BusinessException(ErrorCode.ORDER_ASSIGNMENT_INVALID, 'order already assigned', 409)
          }
        },
        sideEffect: async (tx, order, now) => {
          await tx.orderAssignment.create({
            data: {
              orderId: order.id,
              staffId: staff.id,
              assignType: 'auto',
              assignStatus: 'pending',
              assignedBy: BigInt(0),
              assignedAt: now,
            },
          })
        },
      })
    }
    catch (error) {
      if (error instanceof BusinessException
        && (error.code === ErrorCode.ORDER_STATUS_INVALID || error.code === ErrorCode.ORDER_ASSIGNMENT_INVALID)) {
        const latest = await this.repository.findOrderDetail(orderId)
        if (latest?.staffId) {
          return {
            assigned: false,
            reason: 'already_assigned',
            staffId: Number(latest.staffId),
            orderStatus: latest.status,
          }
        }
        if (latest && latest.status !== ORDER_STATUS.PENDING_DISPATCH) {
          return {
            assigned: false,
            reason: 'order_not_pending_dispatch',
            orderStatus: latest.status,
          }
        }
      }
      throw error
    }

    return {
      assigned: true,
      staffId: Number(staff.id),
      orderStatus: ORDER_STATUS.DISPATCHED,
    }
  }

  async autoAssignOrder(adminId: number, orderId: number, dto: AutoAssignOrderDto, requestId?: string, ip?: string) {
    const result = await this.autoAssignOrderBySystem(orderId, {
      requestId,
      source: 'admin_retry',
      remark: dto.remark || 'admin retry auto assign by staff id asc',
    })

    if (!result.assigned) {
      if (result.reason === 'no_available_staff') {
        throw new BusinessException(ErrorCode.ORDER_ASSIGNMENT_INVALID, 'no available staff', 409)
      }
      throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order is not pending dispatch', 409, result)
    }

    await this.adminAudit.write({
      adminId,
      action: 'order:auto-assign',
      module: 'order',
      targetType: 'order',
      targetId: orderId,
      requestId,
      ip,
      detail: {
        staffId: result.staffId,
        strategy: 'staff_id_asc',
        remark: dto.remark || '',
        source: 'admin_retry',
        fromStatus: ORDER_STATUS.PENDING_DISPATCH,
        toStatus: ORDER_STATUS.DISPATCHED,
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
    const page = this.normalizePositiveInt(query.page, 1)
    const pageSize = this.normalizePositiveInt(query.pageSize, 20, 100)
    const result = await this.repository.findStaffOrders({
      staffId,
      status: query.status,
      page,
      pageSize,
    })
    return {
      items: result.items.map(order => this.withSignedOrderImages(presentUserOrder(order))),
      page,
      pageSize,
      total: result.total,
    }
  }

  async listAvailableStaffOrders(staffId: number, query: QueryOrdersDto) {
    await this.assertStaffAvailable(staffId)
    const busyCount = await this.repository.countStaffBusyOrders(staffId)

    const page = this.normalizePositiveInt(query.page, 1)
    const pageSize = this.normalizePositiveInt(query.pageSize, 20, 100)
    if (busyCount > 0) {
      return {
        items: [],
        page,
        pageSize,
        total: 0,
      }
    }

    const result = await this.repository.findAvailableStaffOrders({
      page,
      pageSize,
    })
    return {
      items: result.items.map(order => this.withSignedOrderImages(presentUserOrder(order))),
      page,
      pageSize,
      total: result.total,
    }
  }

  async getAvailableStaffOrderDetail(staffId: number, orderId: number) {
    await this.assertStaffCanTakeOrder(staffId)

    const order = await this.getOrderDetailOrThrow(orderId)
    if (order.status !== ORDER_STATUS.PENDING_DISPATCH
      || order.staffId
      || !isStaffVisibleOrderType(order.orderType)) {
      throw new BusinessException(ErrorCode.ORDER_ASSIGNMENT_INVALID, 'order is not available', 409)
    }

    return this.withSignedOrderImages(presentOrderDetail(order))
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

    const avatarOssUrl = staff.avatarUrl || ''
    const avatarDisplayUrl = this.storage.signNullableUrl(avatarOssUrl) || avatarOssUrl

    return {
      staffId: Number(staff.id),
      staffName: staff.name,
      staffPhone: staff.phone,
      avatar: avatarDisplayUrl,
      avatarOssUrl,
      avatarDisplayUrl,
      verified: true,
      regionText: staff.cityCode || staff.phone,
      rating: staff.rating.toNumber(),
      stats: { today, week, month, total },
    }
  }

  async updateStaffProfile(staffId: number, dto: UpdateStaffProfileDto) {
    const data: Prisma.StaffUpdateManyMutationInput = {}

    if (dto.staffName !== undefined) {
      const staffName = dto.staffName.trim()
      if (!staffName) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'staffName is required', 400)
      }
      data.name = staffName
    }

    if (dto.avatar !== undefined) {
      const avatar = dto.avatar.trim()
      this.storage.assertPermanentOssUrl(avatar, { force: true })
      data.avatarUrl = avatar
    }

    if (Object.keys(data).length) {
      const result = await this.repository.client.staff.updateMany({
        where: { id: BigInt(staffId), status: 1, deletedAt: null },
        data,
      })
      if (result.count !== 1) {
        throw new BusinessException(ErrorCode.STAFF_NOT_FOUND, 'staff not found', 404)
      }
    }

    return this.getStaffProfile(staffId)
  }

  async getStaffOrderDetail(staffId: number, orderId: number) {
    const order = await this.getOrderDetailOrThrow(orderId)
    this.assertStaffOwnsOrder(order, staffId)
    return this.withSignedOrderImages(presentOrderDetail(order))
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

  async staffClaim(staffId: number, orderId: number, dto: TransitionVersionDto, requestId?: string) {
    await this.assertStaffCanTakeOrder(staffId)

    await this.transitions.transition({
      orderId: BigInt(orderId),
      action: ORDER_ACTION.STAFF_CLAIM,
      operatorType: 'staff',
      operatorId: BigInt(staffId),
      requestId,
      version: dto.version,
      remark: dto.reason || 'staff claimed order',
      detail: { staffId },
      orderData: { staffId: BigInt(staffId) },
      check: (order) => {
        if (order.staffId) {
          throw new BusinessException(ErrorCode.ORDER_ASSIGNMENT_INVALID, 'order already assigned', 409)
        }
      },
      sideEffect: async (tx, order, now) => {
        await tx.orderAssignment.create({
          data: {
            orderId: order.id,
            staffId: BigInt(staffId),
            assignType: 'claim',
            assignStatus: 'accepted',
            assignedBy: BigInt(staffId),
            assignedAt: now,
            acceptedAt: now,
          },
        })
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

    return this.getOrderDetailOrThrow(orderId).then(order => this.withSignedOrderImages(presentOrderDetail(order)))
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
        await this.memberCards.consumeForCompletedOrder({
          tx,
          order,
          actualMinutes: dto.actualMinutes,
          operatorType: 'staff',
          operatorId: BigInt(staffId),
          remark: dto.remark,
        })
        await tx.serviceCheckin.create({
          data: {
            orderId: order.id,
            staffId: BigInt(staffId),
            checkinType: 'finish',
          },
        })
        if (dto.photoUrls?.length) {
          dto.photoUrls.forEach(url => this.storage.assertPermanentOssUrl(url))
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

  private async resolveActiveService(query: { serviceId?: number, serviceCode?: string }) {
    if (!query.serviceId && !query.serviceCode) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'serviceId or serviceCode is required', 400)
    }

    const service = query.serviceCode
      ? await this.repository.findActiveServiceByCode(query.serviceCode)
      : await this.repository.findActiveService(query.serviceId!)

    if (!service) {
      throw new BusinessException(ErrorCode.SERVICE_NOT_FOUND, 'service not found', 404)
    }
    if (query.serviceId && Number(service.id) !== query.serviceId) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'serviceId and serviceCode do not match', 400)
    }
    return service
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

  private async assertStaffCanTakeOrder(staffId: number) {
    await this.assertStaffAvailable(staffId)

    const busyCount = await this.repository.countStaffBusyOrders(staffId)
    if (busyCount > 0) {
      throw new BusinessException(ErrorCode.ORDER_ASSIGNMENT_INVALID, 'staff has unfinished order', 409)
    }
  }

  private async assertStaffAvailable(staffId: number) {
    const staff = await this.repository.findWorkingStaff(staffId)
    if (!staff) {
      throw new BusinessException(ErrorCode.STAFF_FORBIDDEN, 'staff is not available', 403)
    }
  }

  private parseAppointment(dateText: string, slotText: string) {
    const [startTime, endTime] = slotText.split('-')
    const start = new Date(`${dateText}T${startTime}:00`)
    const end = new Date(`${dateText}T${endTime}:00`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid appointment time', 400)
    }
    this.assertAppointmentWithinBusinessHours(start, end)
    if (start.getTime() <= Date.now()) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'appointment time must be later than current time', 400)
    }
    return { start, end }
  }

  private assertAppointmentWithinBusinessHours(start: Date, end: Date) {
    if (start.toDateString() !== end.toDateString()) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'appointment must be in the same day', 400)
    }
    const startMinutes = start.getHours() * 60 + start.getMinutes()
    const endMinutes = end.getHours() * 60 + end.getMinutes()
    const businessStart = 8 * 60
    const businessEnd = 17 * 60
    if (startMinutes < businessStart || endMinutes > businessEnd) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'appointment time must be between 08:00 and 17:00', 400)
    }
  }

  private isPaidCashBooking(order: OrderDetailRecord) {
    return !order.memberCardId
      && order.orderType !== ORDER_TYPE.MEMBER_CARD_PURCHASE
      && (Boolean(order.paidAt)
        || order.paidAmount.gt(0)
        || order.payableAmount.gt(0) && order.payments.some(payment => payment.status === 'success'))
  }

  private async createPendingRefundForPaidOrder(
    tx: Prisma.TransactionClient,
    order: Order,
    reason: string,
  ) {
    const existing = await tx.refund.findFirst({
      where: {
        orderId: order.id,
        status: 'pending',
      },
    })
    if (existing) return existing

    const payment = await tx.payment.findFirst({
      where: {
        orderId: order.id,
        status: 'success',
      },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    })
    if (!payment) {
      throw new BusinessException(ErrorCode.PAYMENT_NOT_FOUND, 'paid payment not found', 404)
    }

    return tx.refund.create({
      data: {
        refundNo: this.createRefundNo(),
        orderId: order.id,
        paymentId: payment.id,
        amount: payment.amount,
        reason,
        status: 'pending',
        operatedBy: BigInt(0),
      },
    })
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

  private parseAdminDate(value: string, field: string) {
    const normalized = value.includes('T') ? value : value.replace(' ', 'T')
    const date = new Date(normalized)
    if (Number.isNaN(date.getTime())) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, `invalid ${field}`, 400)
    }
    return date
  }

  private adminOrderAuditSnapshot(order: OrderDetailRecord) {
    return {
      status: order.status,
      staffId: order.staffId ? Number(order.staffId) : null,
      appointmentStartTime: order.appointmentStartTime.toISOString(),
      appointmentEndTime: order.appointmentEndTime.toISOString(),
      originalAmount: order.originalAmount.toNumber(),
      discountAmount: order.discountAmount.toNumber(),
      payableAmount: order.payableAmount.toNumber(),
      paidAmount: order.paidAmount.toNumber(),
      remark: order.remark || null,
      adminRemark: order.adminRemark || null,
      cityCode: order.cityCode || null,
      source: order.source,
      createdAt: order.createdAt.toISOString(),
      paidAt: order.paidAt?.toISOString() || null,
      completedAt: order.completedAt?.toISOString() || null,
      cancelledAt: order.cancelledAt?.toISOString() || null,
      cancelReason: order.cancelReason || null,
    }
  }

  private normalizePositiveInt(value: unknown, fallback: number, max?: number) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) return fallback
    return max ? Math.min(parsed, max) : parsed
  }

  private normalizeOrderSource(source?: string) {
    const value = (source || 'miniapp').trim()
    return /^[a-zA-Z0-9_-]{1,16}$/.test(value) ? value : 'miniapp'
  }

  private withSignedOrderImages<T extends Record<string, any>>(payload: T): T {
    const next: Record<string, any> = { ...payload }

    if (typeof next.serviceImage === 'string' && next.serviceImage) {
      next.serviceImageOssUrl = next.serviceImage
      next.serviceImage = this.storage.signNullableUrl(next.serviceImage) || next.serviceImage
    }

    if (next.service && typeof next.service === 'object') {
      const service = { ...next.service }
      if (typeof service.coverImage === 'string' && service.coverImage) {
        service.coverImageOssUrl = service.coverImage
        service.coverImageDisplayUrl = this.storage.signNullableUrl(service.coverImage) || service.coverImage
        service.coverImage = service.coverImageDisplayUrl
      }
      next.service = service
    }

    if (Array.isArray(next.servicePhotos)) {
      next.servicePhotoOssUrls = next.servicePhotos.slice()
      next.servicePhotoUrls = this.storage.signUrlList(next.servicePhotos)
      next.servicePhotos = next.servicePhotoUrls
    }

    if (Array.isArray(next.photos)) {
      next.photoOssUrls = next.photos.slice()
      next.photoUrls = this.storage.signUrlList(next.photos)
      next.photos = next.photoUrls
    }

    return next as T
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

  private createRefundNo() {
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
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0')
    return `RF${date}${time}${random}`
  }
}
