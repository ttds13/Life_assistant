import { Inject, Injectable } from '@nestjs/common'
import { Address, Order, Prisma } from '@prisma/client'
import { AppointmentTimeLocksService } from '../appointment-time-locks/appointment-time-locks.service'
import { AdminAuditService } from '../audit-log/admin-audit.service'
import { clearDefaultAddresses } from '../addresses/address-revision'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { USER_COUPON_STATUS } from '../coupons/coupon-status'
import { CouponsService } from '../coupons/coupons.service'
import { MemberCardsService } from '../member-cards/member-cards.service'
import { MEMBER_CARD_TYPE } from '../member-cards/constants/member-card'
import { NotificationsService } from '../notifications/notifications.service'
import { PointsService } from '../points/points.service'
import { ORDER_ACTION } from './constants/order-action'
import { ORDER_STATUS } from './constants/order-status'
import { ORDER_TYPE, isStaffVisibleOrderType } from './constants/order-type'
import { PAYMENT_CHANNEL } from '../payments/constants/payment-channel'
import { PAYMENT_STATUS } from '../payments/constants/payment-status'
import { REFUND_STATUS } from '../refunds/constants/refund-status'
import { RefundsService } from '../refunds/refunds.service'
import { UsersService } from '../users/users.service'
import { WithdrawalsService } from '../withdrawals/withdrawals.service'
import type { AutoAssignOrderDto } from './dto/auto-assign-order.dto'
import type { AdminCreateOrderDto, AdminOrderAddressDto } from './dto/admin-create-order.dto'
import type { AdminOrderActionDto } from './dto/admin-order-action.dto'
import type { AdminOrderRemarkDto } from './dto/admin-order-remark.dto'
import type { AdminQueryOrdersDto } from './dto/admin-query-orders.dto'
import type { AdminUpdateOrderDto } from './dto/admin-update-order.dto'
import type {
  AdminUserProductOrdersQueryDto,
  AdminUserServiceBookingsQueryDto,
} from './dto/admin-user-commerce-query.dto'
import type { AssignOrderDto } from './dto/assign-order.dto'
import type { CompleteServiceDto } from './dto/complete-service.dto'
import type { ConfirmOfflinePaymentDto } from './dto/confirm-offline-payment.dto'
import type { CreateOrderDto } from './dto/create-order.dto'
import type { PricePreviewDto } from './dto/price-preview.dto'
import type { QueryOrdersDto } from './dto/query-orders.dto'
import type { RejectOrderDto } from './dto/reject-order.dto'
import type { RescheduleOrderDto } from './dto/reschedule-order.dto'
import type { TransitionVersionDto } from './dto/transition-version.dto'
import type { UpdateStaffProfileDto } from './dto/update-staff-profile.dto'
import type { UpdateStaffWorkStatusDto } from './dto/update-staff-work-status.dto'
import type { UpdateOrderAddressDto } from './dto/update-order-address.dto'
import { OrderTransitionService } from './order-transition.service'
import {
  presentAdminOrderDetail,
  presentAdminOrderListItem,
  presentAdminUserProductOrder,
  presentAdminUserServiceBooking,
  presentOrderDetail,
  presentPricePreview,
  presentStaffOption,
  presentUserOrder,
} from './order-presenter'
import { OrderDetailRecord, OrdersRepository } from './orders.repository'
import { IMAGE_BIZ_TYPE } from '../storage/image-biz-types'
import { ObjectStorageService } from '../storage/storage.service'
import { StaffProfileChangeService } from '../staff-profile-change/staff-profile-change.service'

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

export interface DispatchCheckResult {
  canAssign: boolean
  blockingReasons: string[]
  warnings: string[]
  requiredFields: string[]
}

@Injectable()
export class OrdersService {
  constructor(
    @Inject(OrdersRepository) private readonly repository: OrdersRepository,
    @Inject(AppointmentTimeLocksService) private readonly appointmentTimeLocks: AppointmentTimeLocksService,
    @Inject(OrderTransitionService) private readonly transitions: OrderTransitionService,
    @Inject(AdminAuditService) private readonly adminAudit: AdminAuditService,
    @Inject(CouponsService) private readonly coupons: CouponsService,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
    @Inject(MemberCardsService) private readonly memberCards: MemberCardsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(StaffProfileChangeService) private readonly staffProfileChanges: StaffProfileChangeService,
    @Inject(RefundsService) private readonly refunds: RefundsService,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(PointsService) private readonly points: PointsService,
    @Inject(WithdrawalsService) private readonly withdrawals: WithdrawalsService,
  ) {}

  async getPricePreview(userId: number, query: PricePreviewDto) {
    await this.appointmentTimeLocks.assertSlotAvailable(query.appointmentDate, query.appointmentTimeSlot)
    const service = await this.resolveActiveService(query)
    const serviceCardType = this.memberCards.calculateServiceCardType(service)
    const isConsultationOrder = serviceCardType === MEMBER_CARD_TYPE.CONSULTATION
    if (query.memberCardConsumeMinutes && !query.memberCardId) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'memberCardId is required when memberCardConsumeMinutes is provided', 400)
    }
    if (query.memberCardId) {
      if (query.couponId) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'coupon cannot be used with member card', 400)
      }
      const memberCardPreview = await this.memberCards.previewForOrder({
        userId,
        userMemberCardId: query.memberCardId,
        service,
        requestedConsumeMinutes: query.memberCardConsumeMinutes,
      })
      return presentPricePreview(service.basePrice.toNumber(), {
        pricingMode: 'member_card',
        cardType: serviceCardType,
        discountAmount: service.basePrice.toNumber(),
        memberCardDiscountAmount: service.basePrice.toNumber(),
        payableAmount: 0,
        ...memberCardPreview,
      })
    }
    const preview = !isConsultationOrder && query.couponId
      ? await this.coupons.previewDiscount({
          userId,
          couponId: query.couponId,
          serviceId: service.id,
          amount: service.basePrice,
        })
      : {
          couponId: null,
          discountAmount: new Prisma.Decimal(0),
          payableAmount: service.basePrice,
        }
    return presentPricePreview(service.basePrice.toNumber(), {
      pricingMode: isConsultationOrder ? 'consultation' : 'cash',
      consultationRequired: serviceCardType === MEMBER_CARD_TYPE.CONSULTATION,
      cardType: serviceCardType,
      discountAmount: isConsultationOrder ? service.basePrice.toNumber() : preview.discountAmount.toNumber(),
      payableAmount: isConsultationOrder ? 0 : preview.payableAmount.toNumber(),
      couponId: preview.couponId ? Number(preview.couponId) : null,
    })
  }

  async listUserOrders(userId: number, query: QueryOrdersDto) {
    const page = this.normalizePositiveInt(query.page, 1)
    const pageSize = this.normalizePositiveInt(query.pageSize, 20, 100)
    const result = await this.repository.findUserOrders({
      userId,
      status: query.status,
      orderType: query.orderType,
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
    const supportsMemberCard = serviceCardType === MEMBER_CARD_TYPE.TIME || serviceCardType === MEMBER_CARD_TYPE.TIMES
    if (isConsultationOrder && isMemberCardOrder) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'consultation service cannot use member card', 400)
    }
    if (isMemberCardOrder && !supportsMemberCard) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'service does not support member card', 400)
    }
    if (dto.couponId && (isConsultationOrder || isMemberCardOrder)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'coupon cannot be used for this order type', 400)
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
      consumeUnit: service.consumeUnit || 0,
      consultationRequired: isConsultationOrder,
      status: service.status,
      sortOrder: service.sortOrder,
    }
    const initialStatus = isMemberCardOrder || isConsultationOrder
      ? ORDER_STATUS.PENDING_DISPATCH
      : ORDER_STATUS.PENDING_PAYMENT
    const payableAmount = isMemberCardOrder || isConsultationOrder
      ? new Prisma.Decimal(0)
      : service.basePrice

    const created = await this.repository.client.$transaction(async (tx) => {
      await this.appointmentTimeLocks.assertSlotAvailable(dto.appointmentDate, dto.appointmentTimeSlot, tx)
      const order = await tx.order.create({
        data: {
          orderNo,
          userId: BigInt(userId),
          serviceId: service.id,
          orderType: isConsultationOrder ? ORDER_TYPE.CONSULTATION : ORDER_TYPE.SERVICE_BOOKING,
          status: initialStatus,
          serviceSnapshot: serviceSnapshot as Prisma.InputJsonObject,
          appointmentStartTime: appointment.start,
          appointmentEndTime: appointment.end,
          originalAmount: service.basePrice,
          discountAmount: 0,
          payableAmount,
          paidAmount: 0,
          couponId: null,
          remark: dto.remark || null,
          source: this.normalizeOrderSource(dto.source),
          cityCode: service.cityCode,
        },
      })

      await tx.serviceBookingOrder.create({
        data: {
          orderId: order.id,
          serviceId: service.id,
          serviceSnapshot: serviceSnapshot as Prisma.InputJsonObject,
          appointmentStartAt: appointment.start,
          appointmentEndAt: appointment.end,
        },
      })

      await this.createOrderAddress(tx, order.id, address, {
        operatorType: 'user',
        operatorId: BigInt(userId),
        requestId,
      })

      if (isMemberCardOrder && dto.memberCardId) {
        const freeze = await this.memberCards.freezeForOrder({
          tx,
          userId,
          userMemberCardId: dto.memberCardId,
          orderId: order.id,
          service,
          requestedConsumeMinutes: dto.memberCardConsumeMinutes,
        })
        await tx.order.update({
          where: { id: order.id },
          data: {
            memberCardConsumeUnits: freeze.consumeUnits,
            memberCardRuleSnapshot: freeze.ruleSnapshot as Prisma.InputJsonObject,
            discountAmount: service.basePrice,
          },
        })
      }

      if (!isMemberCardOrder && !isConsultationOrder && dto.couponId) {
        const couponPreview = await this.coupons.lockCouponForOrder({
          tx,
          userId,
          couponId: dto.couponId,
          serviceId: service.id,
          amount: service.basePrice,
          orderId: order.id,
        })
        await tx.order.update({
          where: { id: order.id },
          data: {
            couponId: couponPreview.couponId,
            discountAmount: couponPreview.discountAmount,
            payableAmount: couponPreview.payableAmount,
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
          userMemberCardId: dto.memberCardId || null,
          cardType: serviceCardType,
          source: this.normalizeOrderSource(dto.source),
          promotionKey: dto.promotionKey || null,
          campaignId: dto.campaignId || null,
        },
      })

      if (initialStatus === ORDER_STATUS.PENDING_DISPATCH) {
        await this.notifications.createAdminOrderNotification({
          tx,
          orderId: order.id,
          orderNo: order.orderNo,
          serviceName: this.serviceNameFromSnapshot(order.serviceSnapshot),
          appointmentStartTime: order.appointmentStartTime,
          type: isConsultationOrder ? 'admin_order_created' : 'admin_pending_dispatch',
          runId: this.extractDay38RunId(order.remark || ''),
        })
      }

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
          if (order.orderType === ORDER_TYPE.MEMBER_CARD_PURCHASE) {
            throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order cannot enter refund pending here', 409)
          }
        },
        sideEffect: async (tx, order) => {
          await this.refunds.createRefundRequestForOrder({
            tx,
            order,
            reason,
            source: 'user_cancel',
            operatedBy: BigInt(userId),
          })
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
        await this.coupons.releaseCouponForOrder(tx, order.id, reason)
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
      await this.appointmentTimeLocks.assertSlotAvailable(dto.appointmentDate, dto.appointmentTimeSlot, tx)

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
        sideEffect: async (tx, order, now) => {
          await this.withdrawals.createIncomeForCompletedOrder(tx, order, now)
          await this.points.handleOrderCompleted(tx, order)
        },
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
    const detail = this.withSignedOrderImages(presentAdminOrderDetail(order))
    const [result, orderAddressRevisions] = await Promise.all([
      this.withAdminAssignmentNotifications(detail, order),
      this.listOrderAddressRevisions(order.orderAddress?.id),
    ])
    return { ...result, orderAddressRevisions }
  }

  async getAdminOrderAddressRevisions(orderId: number) {
    const order = await this.getOrderDetailOrThrow(orderId)
    return {
      orderId,
      orderAddressId: order.orderAddress ? Number(order.orderAddress.id) : null,
      currentVersion: order.orderAddress?.version || null,
      items: await this.listOrderAddressRevisions(order.orderAddress?.id),
    }
  }

  async listAdminUserProductOrders(query: AdminUserProductOrdersQueryDto) {
    const page = this.normalizePositiveInt(query.page, 1)
    const pageSize = this.normalizePositiveInt(query.pageSize, 20, 100)
    const result = await this.repository.findAdminUserProductOrders({
      userId: query.userId,
      productType: query.productType,
      status: query.status,
      keyword: query.keyword,
      source: query.source,
      dateStart: this.parseDateStart(query.dateStart),
      dateEnd: this.parseDateEnd(query.dateEnd),
      page,
      pageSize,
    })
    return {
      items: result.items.map(order => this.withSignedOrderImages(presentAdminUserProductOrder(order))),
      page,
      pageSize,
      total: result.total,
    }
  }

  async listAdminUserServiceBookings(query: AdminUserServiceBookingsQueryDto) {
    const page = this.normalizePositiveInt(query.page, 1)
    const pageSize = this.normalizePositiveInt(query.pageSize, 20, 100)
    const result = await this.repository.findAdminUserServiceBookings({
      userId: query.userId,
      entitlementType: query.entitlementType,
      serviceId: query.serviceId,
      staffId: query.staffId,
      status: query.status,
      keyword: query.keyword,
      source: query.source,
      dateStart: this.parseDateStart(query.dateStart),
      dateEnd: this.parseDateEnd(query.dateEnd),
      page,
      pageSize,
    })
    return {
      items: result.items.map(order => this.withSignedOrderImages(presentAdminUserServiceBooking(order))),
      page,
      pageSize,
      total: result.total,
    }
  }

  async getAdminUserCommerceOverview(userId: number, recentLimit?: number) {
    const user = await this.repository.client.user.findFirst({
      where: { id: BigInt(userId), deletedAt: null },
      select: { id: true, nickname: true, phone: true, source: true, createdAt: true },
    })
    if (!user) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'user not found', 404)

    const take = this.normalizePositiveInt(recentLimit, 5, 10)
    const userIdValue = BigInt(userId)
    const serviceProductWhere: Prisma.OrderWhereInput = {
      userId: userIdValue,
      serviceBooking: { is: { redemption: { is: null } } },
    }
    const memberCardProductWhere: Prisma.OrderWhereInput = {
      userId: userIdValue,
      memberCardPurchase: { isNot: null },
    }
    const productWhere: Prisma.OrderWhereInput = {
      userId: userIdValue,
      OR: [
        { serviceBooking: { is: { redemption: { is: null } } } },
        { memberCardPurchase: { isNot: null } },
      ],
    }
    const serviceEntitlementWhere: Prisma.OrderWhereInput = serviceProductWhere
    const memberCardEntitlementWhere: Prisma.OrderWhereInput = {
      userId: userIdValue,
      serviceBooking: { is: { redemption: { isNot: null } } },
    }
    const nextThirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    const [
      recentProductOrders,
      recentServiceBookings,
      recentCards,
      serviceProductCount,
      memberCardProductCount,
      productAmounts,
      refunds,
      cardStatusGroups,
      cardBalances,
      expiringCardCount,
      serviceEntitlementCount,
      memberCardEntitlementCount,
      bookingStatusGroups,
    ] = await Promise.all([
      this.repository.findAdminUserProductOrders({ userId, page: 1, pageSize: take }),
      this.repository.findAdminUserServiceBookings({ userId, page: 1, pageSize: take }),
      this.repository.client.userMemberCard.findMany({
        where: { userId: userIdValue },
        include: { card: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
      }),
      this.repository.client.order.count({ where: serviceProductWhere }),
      this.repository.client.order.count({ where: memberCardProductWhere }),
      this.repository.client.order.aggregate({
        where: productWhere,
        _sum: { paidAmount: true },
      }),
      this.repository.client.refund.findMany({
        where: { order: { is: productWhere } },
        select: { amount: true, status: true },
      }),
      this.repository.client.userMemberCard.groupBy({
        by: ['status'],
        where: { userId: userIdValue },
        _count: { _all: true },
      }),
      this.repository.client.userMemberCard.aggregate({
        where: { userId: userIdValue },
        _sum: { remainingMinutes: true, frozenMinutes: true },
      }),
      this.repository.client.userMemberCard.count({
        where: {
          userId: userIdValue,
          status: 'active',
          expireAt: { gt: new Date(), lte: nextThirtyDays },
        },
      }),
      this.repository.client.order.count({ where: serviceEntitlementWhere }),
      this.repository.client.order.count({ where: memberCardEntitlementWhere }),
      this.repository.client.order.groupBy({
        by: ['status'],
        where: { userId: userIdValue, serviceBooking: { isNot: null } },
        _count: { _all: true },
      }),
    ])

    const cardStatusCounts = Object.fromEntries(cardStatusGroups.map(item => [item.status, item._count._all]))
    const bookingStatusCounts = Object.fromEntries(bookingStatusGroups.map(item => [item.status, item._count._all]))
    const remainingMinutes = cardBalances._sum.remainingMinutes || 0
    const frozenMinutes = cardBalances._sum.frozenMinutes || 0
    const refundAmount = refunds
      .filter(item => item.status === REFUND_STATUS.REFUNDED)
      .reduce((sum, item) => sum + item.amount.toNumber(), 0)

    return {
      user: {
        id: Number(user.id),
        nickname: user.nickname || `User ${userId}`,
        phone: user.phone || '',
        source: user.source || 'miniapp',
        createdAt: user.createdAt.toISOString(),
      },
      purchaseSummary: {
        serviceProductCount,
        memberCardProductCount,
        totalOrderCount: serviceProductCount + memberCardProductCount,
        totalPaidAmount: productAmounts._sum.paidAmount?.toNumber() || 0,
        refundedAmount: refundAmount,
      },
      userMemberCardSummary: {
        pendingActivationCount: cardStatusCounts.pending_activation || 0,
        activeCount: cardStatusCounts.active || 0,
        completedCount: cardStatusCounts.completed || 0,
        totalCount: cardStatusGroups.reduce((sum, item) => sum + item._count._all, 0),
        remainingMinutes,
        frozenMinutes,
        usableMinutes: Math.max(0, remainingMinutes - frozenMinutes),
        expiringWithinThirtyDaysCount: expiringCardCount,
      },
      serviceBookingSummary: {
        serviceEntitlementCount,
        memberCardEntitlementCount,
        totalCount: serviceEntitlementCount + memberCardEntitlementCount,
        statusCounts: bookingStatusCounts,
      },
      recentProductOrders: recentProductOrders.items.map(presentAdminUserProductOrder),
      recentServiceBookings: recentServiceBookings.items.map(presentAdminUserServiceBooking),
      recentUserMemberCards: recentCards.map(card => ({
        id: Number(card.id),
        cardId: Number(card.cardId),
        cardName: card.card.name,
        planVersion: card.planVersion,
        status: card.status,
        completedReason: card.completedReason || '',
        availabilityState: card.availabilityState,
        remainingMinutes: card.remainingMinutes,
        frozenMinutes: card.frozenMinutes,
        usableMinutes: Math.max(0, card.remainingMinutes - card.frozenMinutes),
        activationDeadlineAt: card.activationDeadlineAt?.toISOString() || null,
        activatedAt: card.activatedAt?.toISOString() || null,
        expireAt: card.expireAt?.toISOString() || null,
        createdAt: card.createdAt.toISOString(),
      })),
    }
  }

  private async listOrderAddressRevisions(orderAddressId?: bigint) {
    if (!orderAddressId) return []
    const items = await this.repository.client.orderAddressRevision.findMany({
      where: { orderAddressId },
      orderBy: [{ version: 'desc' }, { id: 'desc' }],
    })
    return items.map(item => ({
      id: Number(item.id),
      version: item.version,
      snapshot: item.snapshot,
      changeType: item.changeType,
      operatorType: item.operatorType,
      operatorId: item.operatorId ? Number(item.operatorId) : null,
      reason: item.reason || '',
      requestId: item.requestId || '',
      createdAt: item.createdAt.toISOString(),
    }))
  }

  async updateUserOrderAddress(userId: number, orderId: number, dto: UpdateOrderAddressDto, requestId?: string) {
    await this.updateOrderAddress({
      operatorType: 'user',
      operatorId: userId,
      orderId,
      dto,
      requestId,
    })
    return this.getUserOrderDetail(userId, orderId)
  }

  async updateAdminOrderAddress(
    adminId: number,
    orderId: number,
    dto: UpdateOrderAddressDto,
    requestId?: string,
    ip?: string,
  ) {
    await this.updateOrderAddress({
      operatorType: 'admin',
      operatorId: adminId,
      orderId,
      dto,
      requestId,
      ip,
    })
    return this.getAdminOrderDetail(orderId)
  }

  private async updateOrderAddress(params: {
    operatorType: 'user' | 'admin'
    operatorId: number
    orderId: number
    dto: UpdateOrderAddressDto
    requestId?: string
    ip?: string
  }) {
    const { dto } = params
    if (Boolean(dto.sourceAddressId) === Boolean(dto.address)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'provide exactly one of sourceAddressId or address', 400)
    }
    if (params.operatorType === 'user' && dto.address) {
      throw new BusinessException(ErrorCode.ORDER_FORBIDDEN, 'user order address must reference an address-book entry', 403)
    }

    return this.repository.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${BigInt(params.orderId)} FOR UPDATE`
      const order = await tx.order.findUnique({
        where: { id: BigInt(params.orderId) },
        include: { orderAddress: true },
      })
      if (!order) throw new BusinessException(ErrorCode.ORDER_NOT_FOUND, 'order not found', 404)
      if (!order.orderAddress) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'order address is missing', 409)
      }
      if (params.operatorType === 'user' && Number(order.userId) !== params.operatorId) {
        throw new BusinessException(ErrorCode.ORDER_FORBIDDEN, 'order does not belong to user', 403)
      }

      const allowedStatuses = params.operatorType === 'user'
        ? [ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PENDING_DISPATCH]
        : [
            ORDER_STATUS.PENDING_PAYMENT,
            ORDER_STATUS.PENDING_DISPATCH,
            ORDER_STATUS.DISPATCHED,
            ORDER_STATUS.ACCEPTED,
            ORDER_STATUS.ON_THE_WAY,
          ]
      if (!allowedStatuses.includes(order.status as any)) {
        throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order address cannot be changed in current status', 409)
      }
      if (order.version !== dto.expectedOrderVersion || order.orderAddress.version !== dto.expectedOrderAddressVersion) {
        throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order or address version conflict', 409)
      }

      let sourceAddress: Address | null = null
      let updateData: Prisma.OrderAddressUncheckedUpdateInput
      if (dto.sourceAddressId) {
        if (dto.expectedSourceAddressVersion === undefined) {
          throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'expectedSourceAddressVersion is required', 400)
        }
        sourceAddress = await tx.address.findFirst({
          where: {
            id: BigInt(dto.sourceAddressId),
            ownerType: 'user',
            ownerId: order.userId,
            addressType: 'service',
            status: 1,
            deletedAt: null,
          },
        })
        if (!sourceAddress) throw new BusinessException(ErrorCode.USER_ADDRESS_NOT_FOUND, 'address not found', 404)
        if (sourceAddress.version !== dto.expectedSourceAddressVersion) {
          throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'source address version conflict', 409)
        }
        updateData = this.orderAddressUpdateFromAddress(sourceAddress)
      }
      else {
        updateData = this.orderAddressUpdateFromInput(dto.address!)
      }

      const updated = await tx.orderAddress.update({
        where: { id: order.orderAddress.id },
        data: {
          ...updateData,
          version: { increment: 1 },
        },
      })
      await tx.orderAddressRevision.create({
        data: {
          orderAddressId: updated.id,
          version: updated.version,
          snapshot: this.orderAddressRevisionSnapshot(updated),
          changeType: params.operatorType === 'admin' ? 'admin_update' : 'user_update',
          operatorType: params.operatorType,
          operatorId: BigInt(params.operatorId),
          reason: dto.reason,
          requestId: params.requestId,
        },
      })
      await tx.order.update({
        where: { id: order.id },
        data: { version: { increment: 1 } },
      })
      await tx.orderStatusLog.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: order.status,
          operatorType: params.operatorType,
          operatorId: BigInt(params.operatorId),
          action: 'order_address_update',
          requestId: params.requestId,
          remark: dto.reason,
          detail: {
            orderAddressId: Number(updated.id),
            beforeVersion: order.orderAddress.version,
            afterVersion: updated.version,
            sourceAddressId: sourceAddress ? Number(sourceAddress.id) : null,
          },
        },
      })
      if (params.operatorType === 'admin') {
        await this.adminAudit.writeWithClient(tx, {
          adminId: params.operatorId,
          action: 'order:address:update',
          module: 'order',
          targetType: 'order',
          targetId: order.id,
          requestId: params.requestId,
          ip: params.ip,
          detail: {
            orderAddressId: Number(updated.id),
            beforeVersion: order.orderAddress.version,
            afterVersion: updated.version,
            sourceAddressId: sourceAddress ? Number(sourceAddress.id) : null,
            reason: dto.reason,
          },
        })
      }
      if (order.staffId) {
        await this.notifications.createStaffNotification({
          tx,
          staffId: order.staffId,
          type: 'order_address_updated',
          title: '订单服务地址已更新',
          content: `订单 ${order.orderNo} 的服务地址已更新为 v${updated.version}，请重新确认后再前往。`,
          bizType: 'order',
          bizId: order.id,
        })
      }
      return updated
    })
  }

  async getAdminOrderDispatchCheck(orderId: number) {
    const order = await this.getOrderDetailOrThrow(orderId)
    return this.buildDispatchCheck(order)
  }

  async createAdminOrder(adminId: number, dto: AdminCreateOrderDto, requestId?: string, ip?: string) {
    const service = await this.resolveActiveService({ serviceId: dto.serviceId })
    const appointmentStart = this.parseAdminDate(dto.appointmentStartTime, 'appointmentStartTime')
    const appointmentEnd = this.parseAdminDate(dto.appointmentEndTime, 'appointmentEndTime')
    if (appointmentStart >= appointmentEnd) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'appointment start must be before end', 400)
    }
    this.assertAppointmentWithinBusinessHours(appointmentStart, appointmentEnd)

    const source = this.normalizeOrderSource(dto.source || 'admin')
    const paymentMode = this.normalizeAdminPaymentMode(dto.paymentMode, dto.memberCardId)
    const orderNo = this.createOrderNo()
    const serviceSnapshot = this.createServiceSnapshot(service)
    const originalAmount = new Prisma.Decimal(dto.originalAmount ?? service.basePrice.toNumber())
    const serviceCardType = this.memberCards.calculateServiceCardType(service)
    const isMemberCardOrder = paymentMode === 'member_card'
    const isConsultationOrder = serviceCardType === MEMBER_CARD_TYPE.CONSULTATION
    if (paymentMode === 'member_card' && !dto.memberCardId) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'memberCardId is required for member card payment mode', 400)
    }
    if (dto.couponId && (isMemberCardOrder || isConsultationOrder)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'coupon can only be used for cash service orders', 400)
    }
    const baseDiscountAmount = isMemberCardOrder
      ? originalAmount
      : new Prisma.Decimal(dto.discountAmount ?? 0)
    const basePayableAmount = isMemberCardOrder || isConsultationOrder
      ? new Prisma.Decimal(0)
      : new Prisma.Decimal(dto.payableAmount ?? Math.max(0, originalAmount.sub(baseDiscountAmount).toNumber()))
    const initialStatus = isMemberCardOrder || isConsultationOrder || paymentMode === 'offline_paid'
      ? ORDER_STATUS.PENDING_DISPATCH
      : ORDER_STATUS.PENDING_PAYMENT
    const offlinePaidAt = paymentMode === 'offline_paid'
      ? (dto.offlinePaidAt ? this.parseAdminDate(dto.offlinePaidAt, 'offlinePaidAt') : new Date())
      : null

    const created = await this.repository.client.$transaction(async (tx) => {
      const user = await this.resolveAdminOrderUser(tx, dto, source)
      const address = await this.resolveAdminOrderAddress(tx, Number(user.id), dto, adminId)
      let offlinePaymentNo: string | null = null

      const order = await tx.order.create({
        data: {
          orderNo,
          userId: user.id,
          serviceId: service.id,
          orderType: ORDER_TYPE.SERVICE_BOOKING,
          status: initialStatus,
          serviceSnapshot: serviceSnapshot as Prisma.InputJsonObject,
          appointmentStartTime: appointmentStart,
          appointmentEndTime: appointmentEnd,
          originalAmount,
          discountAmount: baseDiscountAmount,
          payableAmount: basePayableAmount,
          paidAmount: paymentMode === 'offline_paid' ? basePayableAmount : 0,
          paidAt: paymentMode === 'offline_paid' && basePayableAmount.greaterThan(0) ? offlinePaidAt : null,
          remark: dto.remark || null,
          adminRemark: dto.adminRemark || null,
          source,
          cityCode: dto.customer?.cityCode || service.cityCode || address.city || null,
        },
      })

      await tx.serviceBookingOrder.create({
        data: {
          orderId: order.id,
          serviceId: service.id,
          serviceSnapshot: serviceSnapshot as Prisma.InputJsonObject,
          appointmentStartAt: appointmentStart,
          appointmentEndAt: appointmentEnd,
        },
      })

      await this.createOrderAddress(tx, order.id, address, {
        operatorType: 'admin',
        operatorId: BigInt(adminId),
        requestId,
      })

      let discountAmount = baseDiscountAmount
      let payableAmount = basePayableAmount
      if (dto.couponId) {
        const couponPreview = await this.coupons.lockCouponForOrder({
          tx,
          userId: user.id,
          couponId: dto.couponId,
          serviceId: service.id,
          amount: originalAmount,
          orderId: order.id,
        })
        discountAmount = couponPreview.discountAmount
        payableAmount = couponPreview.payableAmount
        if (paymentMode === 'unpaid' && payableAmount.lessThanOrEqualTo(0)) {
          throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'zero payable coupon order cannot wait for offline payment', 400)
        }
        await tx.order.update({
          where: { id: order.id },
          data: {
            couponId: couponPreview.couponId,
            discountAmount,
            payableAmount,
            paidAmount: paymentMode === 'offline_paid' ? payableAmount : 0,
            paidAt: paymentMode === 'offline_paid' ? (offlinePaidAt || new Date()) : null,
          },
        })
      }

      if (isMemberCardOrder && dto.memberCardId) {
        const freeze = await this.memberCards.freezeForOrder({
          tx,
          userId: Number(user.id),
          userMemberCardId: dto.memberCardId,
          orderId: order.id,
          service,
          requestedConsumeMinutes: dto.memberCardConsumeMinutes,
          operatorType: 'admin',
          operatorId: BigInt(adminId),
          remark: 'admin freeze for offline appointment',
        })
        await tx.order.update({
          where: { id: order.id },
          data: {
            memberCardConsumeUnits: freeze.consumeUnits,
            memberCardRuleSnapshot: freeze.ruleSnapshot as Prisma.InputJsonObject,
            discountAmount: originalAmount,
            payableAmount: 0,
            paidAmount: 0,
            paidAt: null,
          },
        })
      }

      if (paymentMode === 'offline_paid' && (payableAmount.greaterThan(0) || dto.couponId)) {
        offlinePaymentNo = this.createOfflinePaymentNo(order.orderNo)
        const payment = await tx.payment.create({
          data: {
            paymentNo: offlinePaymentNo,
            orderId: order.id,
            userId: order.userId,
            channel: PAYMENT_CHANNEL.OFFLINE,
            amount: payableAmount,
            status: PAYMENT_STATUS.SUCCESS,
            transactionNo: `OFFLINE_${order.orderNo}`,
            paidAt: offlinePaidAt || new Date(),
            callbackRaw: JSON.stringify({
              channel: PAYMENT_CHANNEL.OFFLINE,
              source,
              paymentMode,
              requestId,
              adminId,
              remark: dto.offlinePaymentRemark || dto.adminRemark || dto.remark || '',
            }),
          },
        })
        await tx.paymentNotifyLog.create({
          data: {
            paymentId: payment.id,
            paymentNo: offlinePaymentNo,
            channel: PAYMENT_CHANNEL.OFFLINE,
            rawBody: JSON.stringify({
              orderId: Number(order.id),
              source,
              paymentMode,
              requestId,
              adminId,
              remark: dto.offlinePaymentRemark || '',
            }),
            processResult: 'success',
          },
        })
        await this.coupons.markCouponUsedForOrder(tx, order.id, offlinePaidAt || new Date())
      }

      await tx.orderStatusLog.create({
        data: {
          orderId: order.id,
          fromStatus: null,
          toStatus: initialStatus,
          operatorType: 'admin',
          operatorId: BigInt(adminId),
          action: ORDER_ACTION.ADMIN_CREATE_ORDER,
          requestId,
          remark: dto.adminRemark || 'admin created offline channel order',
          detail: {
            userId: Number(user.id),
            addressId: Number(address.id),
            source,
            paymentMode,
            memberCardId: dto.memberCardId || null,
            couponId: dto.couponId || null,
            discountAmount: discountAmount.toNumber(),
            payableAmount: payableAmount.toNumber(),
            offlinePaymentNo,
          } as Prisma.InputJsonObject,
        },
      })

      if (initialStatus === ORDER_STATUS.PENDING_DISPATCH) {
        await this.notifications.createAdminOrderNotification({
          tx,
          orderId: order.id,
          orderNo: order.orderNo,
          serviceName: this.serviceNameFromSnapshot(order.serviceSnapshot),
          appointmentStartTime: order.appointmentStartTime,
          type: 'admin_pending_dispatch',
          runId: this.extractDay38RunId(order.adminRemark || order.remark || ''),
        })
      }

      await this.adminAudit.writeWithClient(tx, {
        adminId,
        action: 'order:create',
        module: 'order',
        targetType: 'order',
        targetId: order.id,
        requestId,
        ip,
        detail: {
          orderNo,
          userId: Number(user.id),
          addressId: Number(address.id),
          serviceId: Number(service.id),
          source,
          paymentMode,
          memberCardId: dto.memberCardId || null,
          couponId: dto.couponId || null,
          discountAmount: discountAmount.toNumber(),
          payableAmount: payableAmount.toNumber(),
          offlinePaymentNo,
        },
      })

      return order
    })

    return this.getAdminOrderDetail(Number(created.id))
  }

  async confirmOfflinePayment(adminId: number, orderId: number, dto: ConfirmOfflinePaymentDto, requestId?: string, ip?: string) {
    const paidAt = dto.paidAt ? this.parseAdminDate(dto.paidAt, 'paidAt') : new Date()
    await this.repository.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${BigInt(orderId)} FOR UPDATE`
      const order = await tx.order.findUnique({ where: { id: BigInt(orderId) } })
      if (!order) throw new BusinessException(ErrorCode.ORDER_NOT_FOUND, 'order not found', 404)
      const redemption = await tx.orderRedemption.findUnique({ where: { orderId: order.id }, select: { id: true } })
      if (redemption) {
        throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'offline payment only supports cash service orders and member card purchase orders', 409)
      }
      if (![ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PENDING_DISPATCH].includes(order.status as any)) {
        throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order cannot confirm offline payment here', 409)
      }

      const existing = await tx.payment.findFirst({
        where: { orderId: order.id, status: PAYMENT_STATUS.SUCCESS },
        orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      })
      if (existing) return

      const amount = new Prisma.Decimal(dto.amount ?? order.payableAmount.toNumber())
      if (!amount.equals(order.payableAmount) || amount.lessThanOrEqualTo(0)) {
        throw new BusinessException(ErrorCode.ORDER_PRICE_CHANGED, 'offline payment amount must equal order payable amount', 409)
      }

      const paymentNo = this.createOfflinePaymentNo(order.orderNo)
      const payment = await tx.payment.create({
        data: {
          paymentNo,
          orderId: order.id,
          userId: order.userId,
          channel: PAYMENT_CHANNEL.OFFLINE,
          amount,
          status: PAYMENT_STATUS.SUCCESS,
          transactionNo: `OFFLINE_${order.orderNo}`,
          paidAt,
          callbackRaw: JSON.stringify({ channel: PAYMENT_CHANNEL.OFFLINE, requestId, adminId, remark: dto.remark || '' }),
        },
      })
      await tx.paymentNotifyLog.create({
        data: {
          paymentId: payment.id,
          paymentNo,
          channel: PAYMENT_CHANNEL.OFFLINE,
          rawBody: JSON.stringify({ orderId, requestId, adminId, remark: dto.remark || '' }),
          processResult: 'success',
        },
      })
      if (order.orderType === ORDER_TYPE.MEMBER_CARD_PURCHASE) {
        if (order.status !== ORDER_STATUS.PENDING_PAYMENT) {
          throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'member card purchase order is not waiting for payment', 409)
        }
        const grantedCard = await this.memberCards.grantForPaidPurchaseOrder(tx, order, 'admin', BigInt(adminId))
        await this.coupons.markCouponUsedForOrder(tx, order.id, paidAt)
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: ORDER_STATUS.COMPLETED,
            paidAmount: amount,
            paidAt,
            completedAt: paidAt,
            version: { increment: 1 },
          },
        })
        await tx.orderStatusLog.create({
          data: {
            orderId: order.id,
            fromStatus: ORDER_STATUS.PENDING_PAYMENT,
            toStatus: ORDER_STATUS.COMPLETED,
            operatorType: 'admin',
            operatorId: BigInt(adminId),
            action: 'admin_confirm_offline_payment',
            requestId,
            remark: dto.remark || 'admin confirmed offline member card purchase payment',
            detail: {
              paymentNo,
              amount: amount.toNumber(),
              orderType: order.orderType,
              purchaseCardId: grantedCard ? Number(grantedCard.cardId) : order.purchaseCardId ? Number(order.purchaseCardId) : null,
              grantedUserMemberCardId: grantedCard ? Number(grantedCard.id) : order.grantedUserMemberCardId ? Number(order.grantedUserMemberCardId) : null,
              totalUnits: grantedCard?.totalMinutes || order.memberCardConsumeUnits,
            },
          },
        })
        await this.adminAudit.writeWithClient(tx, {
          adminId,
          action: 'order:offline-payment:confirm',
          module: 'order',
          targetType: 'order',
          targetId: order.id,
          requestId,
          ip,
          detail: {
            paymentNo,
            amount: amount.toNumber(),
            paidAt: paidAt.toISOString(),
            remark: dto.remark || '',
            orderType: order.orderType,
            grantedUserMemberCardId: grantedCard ? Number(grantedCard.id) : null,
          },
        })
        return
      }
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: ORDER_STATUS.PENDING_DISPATCH,
          paidAmount: amount,
          paidAt,
          version: { increment: 1 },
        },
      })
      await tx.orderStatusLog.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: ORDER_STATUS.PENDING_DISPATCH,
          operatorType: 'admin',
          operatorId: BigInt(adminId),
          action: 'admin_confirm_offline_payment',
          requestId,
          remark: dto.remark || 'admin confirmed offline payment',
          detail: { paymentNo, amount: amount.toNumber() },
        },
      })
      await this.coupons.markCouponUsedForOrder(tx, order.id, paidAt)
      await this.notifications.createAdminOrderNotification({
        tx,
        orderId: order.id,
        orderNo: order.orderNo,
        serviceName: this.serviceNameFromSnapshot(order.serviceSnapshot),
        appointmentStartTime: order.appointmentStartTime,
        type: 'admin_pending_dispatch',
        runId: this.extractDay38RunId(`${order.adminRemark || ''} ${order.remark || ''}`),
      })
      await this.adminAudit.writeWithClient(tx, {
        adminId,
        action: 'order:offline-payment:confirm',
        module: 'order',
        targetType: 'order',
        targetId: order.id,
        requestId,
        ip,
        detail: { paymentNo, amount: amount.toNumber(), paidAt: paidAt.toISOString(), remark: dto.remark || '' },
      })
    })

    return this.getAdminOrderDetail(orderId)
  }

  async getAdminOrderAccounting(orderId: number) {
    const order = await this.repository.client.order.findUnique({
      where: { id: BigInt(orderId) },
      include: {
        payments: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
        refunds: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
        pointLedgers: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        incomeRecords: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        serviceBooking: { include: { redemption: true } },
      },
    })
    if (!order) throw new BusinessException(ErrorCode.ORDER_NOT_FOUND, 'order not found', 404)

    const paidPayments = order.payments.filter(payment => [
      PAYMENT_STATUS.SUCCESS,
      PAYMENT_STATUS.PARTIAL_REFUNDED,
      PAYMENT_STATUS.REFUNDED,
    ].includes(payment.status as any))
    const historicalPaidAmount = paidPayments.reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0))
    const refundedAmount = order.refunds
      .filter(refund => refund.status === REFUND_STATUS.REFUNDED)
      .reduce((sum, refund) => sum.add(refund.amount), new Prisma.Decimal(0))
    const paymentRefundedAmount = paidPayments.reduce((sum, payment) => sum.add(payment.refundedAmount), new Prisma.Decimal(0))
    const netPaidAmount = historicalPaidAmount.sub(refundedAmount)
    const isRefunded = order.status === ORDER_STATUS.REFUNDED || refundedAmount.greaterThan(0)
    const consumerEarnTypes = ['earn', 'consumer_spend_earn']
    const consumerReverseTypes = ['refund_deduct', 'consumer_spend_refund_reverse']
    const hasEarnPoints = order.pointLedgers.some(item => consumerEarnTypes.includes(item.type))
    const earnPoints = order.pointLedgers
      .filter(item => consumerEarnTypes.includes(item.type))
      .reduce((sum, item) => sum + item.points, 0)
    const refundDeductPoints = order.pointLedgers
      .filter(item => consumerReverseTypes.includes(item.type))
      .reduce((sum, item) => sum + item.points, 0)
    const isMemberCardBooking = Boolean(order.serviceBooking?.redemption)
    const isManualCashSource = order.source !== 'miniapp'
      && order.orderType !== ORDER_TYPE.MEMBER_CARD_PURCHASE
      && !isMemberCardBooking
    const shouldHaveEarnPoints = Boolean(
      order.paidAt
      && order.orderType === ORDER_TYPE.SERVICE_BOOKING
      && !isMemberCardBooking
      && order.paidAmount.greaterThan(0)
      && (order.status === ORDER_STATUS.COMPLETED || isRefunded),
    )
    const couponRecord = order.couponId
      ? await this.repository.client.userCoupon.findFirst({
          where: {
            couponId: order.couponId,
            userId: order.userId,
            OR: [
              { usedOrderId: order.id },
              ...(isRefunded
                ? [{
                    usedOrderId: null,
                    status: { in: [USER_COUPON_STATUS.AVAILABLE, USER_COUPON_STATUS.EXPIRED, USER_COUPON_STATUS.RELEASED] },
                  }]
                : []),
            ],
          },
          orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        })
      : null
    const couponStatusExpected = !order.couponId
      ? true
      : !couponRecord
        ? false
        : order.paidAt && !isRefunded
          ? couponRecord.status === USER_COUPON_STATUS.USED
          : order.status === ORDER_STATUS.PENDING_PAYMENT
            ? couponRecord.status === USER_COUPON_STATUS.LOCKED
            : true
    const checks = [
      {
        key: 'payment',
        passed: !order.paidAt || paidPayments.length > 0,
        message: order.paidAt && paidPayments.length === 0 ? '订单已支付但缺少历史支付流水' : '支付流水正常',
      },
      {
        key: 'paid_amount',
        passed: !order.paidAt || historicalPaidAmount.equals(order.paidAmount),
        message: order.paidAt && !historicalPaidAmount.equals(order.paidAmount) ? '历史支付金额与订单已付金额不一致' : '历史支付金额正常',
      },
      {
        key: 'net_paid_amount',
        passed: !isRefunded || netPaidAmount.greaterThanOrEqualTo(0),
        message: isRefunded && netPaidAmount.lessThan(0) ? '退款金额大于历史支付金额' : '退款后净收入口径正常',
      },
      {
        key: 'points',
        passed: !shouldHaveEarnPoints || hasEarnPoints,
        message: shouldHaveEarnPoints && !hasEarnPoints ? '订单完成后缺少积分流水' : '积分发放流水正常',
      },
      {
        key: 'refund_points',
        passed: !isRefunded || earnPoints <= 0 || refundDeductPoints < 0,
        message: isRefunded && earnPoints > 0 && refundDeductPoints >= 0 ? '退款后缺少积分扣回流水' : '退款积分扣回正常',
      },
      {
        key: 'coupon',
        passed: couponStatusExpected,
        message: !couponStatusExpected ? '订单优惠券锁定/核销状态不正确' : '优惠券锁定/核销/释放记录正常',
      },
      {
        key: 'refund',
        passed: !isRefunded || (
          order.refunds.some(refund => refund.status === REFUND_STATUS.REFUNDED)
          && paymentRefundedAmount.greaterThanOrEqualTo(refundedAmount)
        ),
        message: isRefunded && !(
          order.refunds.some(refund => refund.status === REFUND_STATUS.REFUNDED)
          && paymentRefundedAmount.greaterThanOrEqualTo(refundedAmount)
        ) ? '退款订单缺少已退款记录或 payment.refundedAmount 不一致' : '退款流水正常',
      },
      {
        key: 'income',
        passed: isRefunded
          ? order.incomeRecords.length === 0 || order.incomeRecords.every(item => item.status === 'reversed' || item.settlementStatus === 'reversed' || item.withdrawStatus !== 'none')
          : order.status !== ORDER_STATUS.COMPLETED || !order.staffId || order.incomeRecords.length > 0,
        message: isRefunded
          ? '退款后师傅收入冲正/人工复核口径正常'
          : (order.status === ORDER_STATUS.COMPLETED && order.staffId && order.incomeRecords.length === 0 ? '订单已完成但缺少师傅收入记录' : '师傅收入正常'),
      },
      {
        key: 'offline_payment',
        passed: !isManualCashSource || !order.paidAt || paidPayments.some(payment => payment.channel === PAYMENT_CHANNEL.OFFLINE),
        message: isManualCashSource && order.paidAt && !paidPayments.some(payment => payment.channel === PAYMENT_CHANNEL.OFFLINE)
          ? '外来订单已收款但缺少 offline payment'
          : '外来订单支付口径正常',
      },
    ]

    return {
      orderId,
      orderNo: order.orderNo,
      status: order.status,
      historicalPaidAmount: historicalPaidAmount.toNumber(),
      refundedAmount: refundedAmount.toNumber(),
      netPaidAmount: netPaidAmount.toNumber(),
      couponRecord: couponRecord
        ? {
            id: Number(couponRecord.id),
            status: couponRecord.status,
            usedOrderId: couponRecord.usedOrderId ? Number(couponRecord.usedOrderId) : null,
            receivedAt: couponRecord.receivedAt.toISOString(),
            usedAt: couponRecord.usedAt?.toISOString() || null,
            expireAt: couponRecord.expireAt.toISOString(),
          }
        : null,
      passed: checks.every(item => item.passed),
      checks,
      payments: order.payments.map(payment => ({
        id: Number(payment.id),
        paymentNo: payment.paymentNo,
        channel: payment.channel,
        status: payment.status,
        amount: payment.amount.toNumber(),
        refundedAmount: payment.refundedAmount.toNumber(),
        paidAt: payment.paidAt?.toISOString() || null,
      })),
      pointLedgers: order.pointLedgers.map(item => ({
        id: Number(item.id),
        type: item.type,
        points: item.points,
        amount: item.amount?.toNumber() || 0,
        balanceAfter: item.balanceAfter,
        createdAt: item.createdAt.toISOString(),
      })),
      incomeRecords: order.incomeRecords.map(item => ({
        id: Number(item.id),
        staffId: Number(item.staffId),
        amount: item.amount.toNumber(),
        type: item.type,
        status: item.status,
        settlementStatus: item.settlementStatus,
        withdrawStatus: item.withdrawStatus,
      })),
      refunds: order.refunds.map(item => ({
        id: Number(item.id),
        refundNo: item.refundNo,
        amount: item.amount.toNumber(),
        status: item.status,
        refundedAt: item.refundedAt?.toISOString() || null,
      })),
    }
  }

  async updateAdminOrder(adminId: number, orderId: number, dto: AdminUpdateOrderDto, requestId?: string, ip?: string, allowServiceBooking = false) {
    const current = await this.getOrderDetailOrThrow(orderId)
    if (current.orderType === ORDER_TYPE.SERVICE_BOOKING && !allowServiceBooking) {
      throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, 'service booking orders must use booking-specific admin actions', 403)
    }
    this.assertAdminUpdateDoesNotBypassAccounting(current, dto, allowServiceBooking)
    const data: Prisma.OrderUncheckedUpdateInput = {}
    let nextAppointmentStart = current.appointmentStartTime
    let nextAppointmentEnd = current.appointmentEndTime
    const appointmentChanged = dto.appointmentStartTime !== undefined || dto.appointmentEndTime !== undefined
    const amountChanged = dto.originalAmount !== undefined || dto.discountAmount !== undefined || dto.payableAmount !== undefined
    const changeReason = (dto.reason || dto.adminRemark || '').trim()

    if ((appointmentChanged || amountChanged) && !changeReason) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'reason is required for reschedule or amount change', 400)
    }
    if (appointmentChanged) {
      if (!current.serviceBooking || ![
        ORDER_STATUS.PENDING_PAYMENT,
        ORDER_STATUS.PENDING_DISPATCH,
        ORDER_STATUS.DISPATCHED,
        ORDER_STATUS.ACCEPTED,
      ].includes(current.status as any)) {
        throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'current order cannot be rescheduled by admin', 409)
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

    if (Object.keys(data).length === 0) {
      return this.withSignedOrderImages(presentAdminOrderDetail(current))
    }

    await this.repository.client.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: BigInt(orderId), status: current.status, version: dto.expectedVersion },
        data: { ...data, version: { increment: 1 } },
      })
      if (updated.count !== 1) {
        throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order version changed, refresh and retry', 409)
      }
      if (appointmentChanged) {
        await tx.serviceBookingOrder.update({
          where: { orderId: BigInt(orderId) },
          data: {
            appointmentStartAt: nextAppointmentStart,
            appointmentEndAt: nextAppointmentEnd,
          },
        })
        await tx.orderStatusLog.create({
          data: {
            orderId: BigInt(orderId),
            fromStatus: current.status,
            toStatus: current.status,
            operatorType: 'admin',
            operatorId: BigInt(adminId),
            action: 'admin_reschedule',
            requestId,
            remark: changeReason,
            detail: {
              oldAppointmentStartTime: current.appointmentStartTime.toISOString(),
              oldAppointmentEndTime: current.appointmentEndTime.toISOString(),
              appointmentStartTime: nextAppointmentStart.toISOString(),
              appointmentEndTime: nextAppointmentEnd.toISOString(),
            } as Prisma.InputJsonObject,
          },
        })
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
          reason: changeReason,
        },
      })
    })

    return this.getAdminOrderDetail(orderId)
  }

  async rescheduleAdminBooking(adminId: number, orderId: number, dto: AdminUpdateOrderDto, requestId?: string, ip?: string) {
    await this.assertServiceBookingOrder(orderId)
    return this.updateAdminOrder(adminId, orderId, dto, requestId, ip, true)
  }

  async cancelAdminOrder(adminId: number, orderId: number, dto: AdminOrderActionDto, requestId?: string, ip?: string) {
    const current = await this.getOrderDetailOrThrow(orderId)
    if ([ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUND_PENDING, ORDER_STATUS.REFUNDED].includes(current.status as any)) {
      return this.getAdminOrderDetail(orderId)
    }
    if (current.orderType === ORDER_TYPE.MEMBER_CARD_PURCHASE) {
      throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'member card purchase must use the refund workflow', 409)
    }
    if (![ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PENDING_DISPATCH].includes(current.status as any)) {
      throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'current order cannot be cancelled by admin', 409)
    }

    const paidCashBooking = current.status === ORDER_STATUS.PENDING_DISPATCH && this.isPaidCashBooking(current)
    const action = paidCashBooking
      ? ORDER_ACTION.ADMIN_CANCEL_PAID_REFUND
      : current.status === ORDER_STATUS.PENDING_DISPATCH
        ? ORDER_ACTION.ADMIN_CANCEL_BOOKING
        : ORDER_ACTION.ADMIN_CANCEL_UNPAID

    await this.transitions.transition({
      orderId: BigInt(orderId),
      action,
      operatorType: 'admin',
      operatorId: BigInt(adminId),
      requestId,
      version: dto.version,
      remark: dto.reason,
      orderData: {
        cancelledAt: new Date(),
        cancelReason: dto.reason,
      },
      sideEffect: async (tx, order) => {
        if (paidCashBooking) {
          await this.refunds.createRefundRequestForOrder({
            tx,
            order,
            reason: dto.reason,
            source: 'admin_cancel',
            operatedBy: BigInt(adminId),
          })
        }
        else {
          await this.memberCards.releaseFrozenForOrder(
            tx,
            current,
            dto.reason,
            { operatorType: 'admin', operatorId: BigInt(adminId) },
          )
          await this.coupons.releaseCouponForOrder(tx, order.id, dto.reason)
        }
        await this.adminAudit.writeWithClient(tx, {
          adminId,
          action: 'order:cancel',
          module: 'order',
          targetType: 'order',
          targetId: order.id,
          requestId,
          ip,
          detail: {
            orderNo: order.orderNo,
            fromStatus: order.status,
            toStatus: paidCashBooking ? ORDER_STATUS.REFUND_PENDING : ORDER_STATUS.CANCELLED,
            reason: dto.reason,
          },
        })
      },
    })

    return this.getAdminOrderDetail(orderId)
  }

  async cancelAdminBooking(adminId: number, orderId: number, dto: AdminOrderActionDto, requestId?: string, ip?: string) {
    await this.assertServiceBookingOrder(orderId)
    return this.cancelAdminOrder(adminId, orderId, dto, requestId, ip)
  }

  async deleteAdminOrder(adminId: number, orderId: number, dto: AdminOrderActionDto, requestId?: string, ip?: string) {
    const current = await this.getOrderDetailOrThrow(orderId)
    const orderBigInt = BigInt(orderId)

    await this.repository.client.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ version: number, status: string }>>`
        SELECT version, status FROM orders WHERE id = ${orderBigInt} FOR UPDATE
      `
      if (!locked[0]) {
        throw new BusinessException(ErrorCode.ORDER_NOT_FOUND, 'order not found', 404)
      }
      if (locked[0].version !== dto.version || locked[0].status !== current.status) {
        throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order version changed, refresh and retry', 409)
      }
      await this.assertAdminDraftDeletable(current, tx)
      await this.coupons.releaseCouponForOrder(tx, orderBigInt, dto.reason)
      await tx.orderStatusLog.deleteMany({ where: { orderId: orderBigInt } })
      await tx.userCoupon.updateMany({
        where: { usedOrderId: orderBigInt },
        data: { status: 'available', usedOrderId: null, usedAt: null },
      })
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
          reason: dto.reason,
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
    await this.assertDispatchCheckPassed(orderId, dto.staffId)

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
        await tx.serviceBookingOrder.update({
          where: { orderId: order.id },
          data: { staffId: BigInt(dto.staffId) },
        })
        const notification = await this.notifications.createOrderAssignedNotification({
          tx,
          staffId: dto.staffId,
          orderId: order.id,
          orderNo: order.orderNo,
          serviceName: this.serviceNameFromSnapshot(order.serviceSnapshot),
          appointmentStartTime: order.appointmentStartTime,
        })
        await tx.orderAssignment.create({
          data: {
            orderId: order.id,
            staffId: BigInt(dto.staffId),
            assignType: 'manual',
            assignStatus: 'pending',
            assignedBy: BigInt(adminId),
            notificationId: notification.id,
            notificationStatus: notification.sendStatus,
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
          await tx.serviceBookingOrder.update({
            where: { orderId: order.id },
            data: { staffId: staff.id },
          })
          const notification = await this.notifications.createOrderAssignedNotification({
            tx,
            staffId: staff.id,
            orderId: order.id,
            orderNo: order.orderNo,
            serviceName: this.serviceNameFromSnapshot(order.serviceSnapshot),
            appointmentStartTime: order.appointmentStartTime,
          })
          await tx.orderAssignment.create({
            data: {
              orderId: order.id,
              staffId: staff.id,
              assignType: 'auto',
              assignStatus: 'pending',
              assignedBy: BigInt(0),
              notificationId: notification.id,
              notificationStatus: notification.sendStatus,
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
      items: result.items.map(order => this.withSignedOrderImages(this.presentStaffTaskOrder(order, staffId))),
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
        workStatus: true,
        rating: true,
      },
    })
    if (!staff) {
      throw new BusinessException(ErrorCode.STAFF_NOT_FOUND, 'staff not found', 404)
    }

    const [today, week, month, total, latestProfileChangeRequest] = await Promise.all([
      this.getStaffProfileStats(staffId, 'today'),
      this.getStaffProfileStats(staffId, 'week'),
      this.getStaffProfileStats(staffId, 'month'),
      this.getStaffProfileStats(staffId, 'total'),
      this.staffProfileChanges.getStaffLatestRequest(staffId),
    ])

    const avatarUrls = this.storage.resolveAvatarUrls(staff.avatarUrl)

    return {
      staffId: Number(staff.id),
      staffName: staff.name,
      staffPhone: staff.phone,
      avatar: avatarUrls.avatar,
      avatarOssUrl: avatarUrls.avatarOssUrl,
      avatarDisplayUrl: avatarUrls.avatarDisplayUrl,
      verified: true,
      regionText: staff.cityCode || staff.phone,
      workStatus: staff.workStatus,
      workStatusText: this.workStatusText(staff.workStatus),
      rating: staff.rating.toNumber(),
      stats: { today, week, month, total },
      profileChangeRequest: latestProfileChangeRequest,
    }
  }

  async updateStaffProfile(staffId: number, dto: UpdateStaffProfileDto) {
    const request = await this.staffProfileChanges.submitStaffProfileChange(staffId, {
      staffName: dto.staffName,
      avatar: dto.avatar,
    })
    const profile = await this.getStaffProfile(staffId)
    return {
      ...profile,
      pendingProfileChange: true,
      profileChangeRequest: request,
    }
  }

  async deleteAdminBookingDraft(adminId: number, orderId: number, dto: AdminOrderActionDto, requestId?: string, ip?: string) {
    await this.assertServiceBookingOrder(orderId)
    return this.deleteAdminOrder(adminId, orderId, dto, requestId, ip)
  }

  async getStaffWorkStatus(staffId: number) {
    const staff = await this.repository.client.staff.findFirst({
      where: { id: BigInt(staffId), status: 1, deletedAt: null },
      select: { id: true, workStatus: true },
    })
    if (!staff) {
      throw new BusinessException(ErrorCode.STAFF_NOT_FOUND, 'staff not found', 404)
    }
    return this.presentStaffWorkStatus(Number(staff.id), staff.workStatus)
  }

  async updateStaffWorkStatus(staffId: number, dto: UpdateStaffWorkStatusDto) {
    const current = await this.repository.client.staff.findFirst({
      where: { id: BigInt(staffId), status: 1, deletedAt: null },
      select: { id: true, workStatus: true },
    })
    if (!current) throw new BusinessException(ErrorCode.STAFF_NOT_FOUND, 'staff not found', 404)
    if (current.workStatus !== dto.workStatus) {
      await this.repository.client.staff.update({
        where: { id: current.id },
        data: { workStatus: dto.workStatus },
      })
      await this.staffProfileChanges.writeStaffWorkStatusLog(staffId, current.workStatus, dto.workStatus)
    }
    return this.presentStaffWorkStatus(staffId, dto.workStatus)
  }

  async getStaffOrderDetail(staffId: number, orderId: number) {
    const order = await this.getOrderDetailOrThrow(orderId)
    this.assertStaffOwnsOrder(order, staffId)
    return this.withSignedOrderImages({
      ...presentOrderDetail(order),
      ...this.staffIncomeSummary(order, staffId),
    })
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
        await tx.serviceBookingOrder.update({
          where: { orderId: order.id },
          data: { staffId: null },
        })
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
    const photoUrls = (dto.photoUrls || []).map(url => url.trim()).filter(Boolean)
    if (!photoUrls.length) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'service photos are required', 400)
    }
    if (photoUrls.length > 6) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'service photos cannot exceed 6', 400)
    }

    await this.transitions.transition({
      orderId: BigInt(orderId),
      action: ORDER_ACTION.STAFF_COMPLETE,
      operatorType: 'staff',
      operatorId: BigInt(staffId),
      requestId,
      version: dto.version,
      remark: dto.remark,
      detail: { photoCount: photoUrls.length, actualMinutes: dto.actualMinutes || null },
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
        await tx.serviceBookingOrder.update({
          where: { orderId: order.id },
          data: { fulfilledAt: new Date() },
        })
        await tx.serviceCheckin.create({
          data: {
            orderId: order.id,
            staffId: BigInt(staffId),
            checkinType: 'finish',
          },
        })
        photoUrls.forEach(url => this.storage.assertPermanentOssUrl(url))
        await tx.servicePhoto.createMany({
          data: photoUrls.map((url, index) => ({
            orderId: order.id,
            staffId: BigInt(staffId),
            photoType: index === 0 ? 'finish' : 'extra',
            url,
            remark: dto.remark || null,
          })),
        })
      },
    })
    await this.storage.bindFilesToBiz(photoUrls, IMAGE_BIZ_TYPE.SERVICE_FINISH_PHOTO, orderId)

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
        sideEffect: async (tx, order, now) => {
          await this.withdrawals.createIncomeForCompletedOrder(tx, order, now)
          await this.points.handleOrderCompleted(tx, order)
        },
    })
  }

  private async assertDispatchCheckPassed(orderId: number, staffId?: number) {
    const order = await this.getOrderDetailOrThrow(orderId)
    const check = await this.buildDispatchCheck(order, staffId)
    if (!check.canAssign) {
      throw new BusinessException(ErrorCode.ORDER_ASSIGNMENT_INVALID, 'order cannot be assigned', 409, check)
    }
  }

  private async buildDispatchCheck(order: OrderDetailRecord, staffId?: number): Promise<DispatchCheckResult> {
    const blockingReasons: string[] = []
    const warnings: string[] = []
    const requiredFields: string[] = []

    if (!isStaffVisibleOrderType(order.orderType)) {
      blockingReasons.push('订单类型不支持派单')
    }
    if (order.status !== ORDER_STATUS.PENDING_DISPATCH) {
      blockingReasons.push('订单还未进入待派单状态')
    }
    if (!order.userId) {
      blockingReasons.push('订单缺少客户信息')
      requiredFields.push('userId')
    }
    if (!this.isJsonObject(order.serviceSnapshot)) {
      blockingReasons.push('订单缺少服务快照')
      requiredFields.push('serviceSnapshot')
    }
    if (!order.orderAddress) {
      blockingReasons.push('订单缺少服务地址')
      requiredFields.push('orderAddress')
    }
    if (!order.appointmentStartTime || !order.appointmentEndTime) {
      blockingReasons.push('订单缺少预约时间')
      requiredFields.push('appointmentStartTime', 'appointmentEndTime')
    }
    if (order.staffId) {
      warnings.push('订单已有师傅，将被重新派单给新的师傅')
    }

    const staffOptions = await this.repository.findAssignableStaffOptions()
    if (!staffOptions.length) {
      blockingReasons.push('当前没有可选师傅')
    }
    if (staffId) {
      const selected = staffOptions.find(staff => Number(staff.id) === staffId)
      if (!selected) {
        blockingReasons.push('选择的师傅不存在或已禁用')
      }
      else if (selected.workStatus !== 1) {
        warnings.push('选择的师傅当前不在线，派单后可能无法及时处理')
      }
    }

    return {
      canAssign: blockingReasons.length === 0,
      blockingReasons,
      warnings,
      requiredFields: [...new Set(requiredFields)],
    }
  }

  private async resolveAdminOrderUser(
    tx: Prisma.TransactionClient,
    dto: AdminCreateOrderDto,
    source: string,
  ) {
    if (dto.userId) {
      const user = await tx.user.findFirst({
        where: { id: BigInt(dto.userId), deletedAt: null },
      })
      if (!user) {
        throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'user not found', 404)
      }
      return user
    }

    const customer = dto.customer
    const phone = this.optionalText(customer?.phone)
    if (!phone) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'customer phone is required', 400)
    }

    const existing = await tx.user.findFirst({
      where: { phone, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    if (existing) return existing

    return tx.user.create({
      data: {
        phone,
        nickname: this.optionalText(customer?.nickname) || phone,
        gender: customer?.gender ?? 0,
        cityCode: this.optionalText(customer?.cityCode) || null,
        source,
        adminRemark: this.optionalText(customer?.adminRemark) || null,
        status: 1,
      },
    })
  }

  private async resolveAdminOrderAddress(
    tx: Prisma.TransactionClient,
    userId: number,
    dto: AdminCreateOrderDto,
    adminId: number,
  ) {
    if (dto.addressId) {
      const address = await tx.address.findFirst({
        where: {
          id: BigInt(dto.addressId),
          ownerType: 'user',
          ownerId: BigInt(userId),
          addressType: 'service',
          status: 1,
          deletedAt: null,
        },
      })
      if (!address) {
        throw new BusinessException(ErrorCode.USER_ADDRESS_NOT_FOUND, 'address not found', 404)
      }
      return address
    }

    if (!dto.address) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'addressId or address is required', 400)
    }

    const address = dto.address
    this.assertCoordinatePair(address.latitude, address.longitude)
    const existingCount = await tx.address.count({
      where: {
        ownerType: 'user',
        ownerId: BigInt(userId),
        addressType: 'service',
        status: 1,
        deletedAt: null,
      },
    })
    const isDefault = address.isDefault === true || existingCount === 0
    if (isDefault) {
      await clearDefaultAddresses(tx, {
        ownerType: 'user',
        ownerId: BigInt(userId),
        addressType: 'service',
        status: 1,
        deletedAt: null,
      }, undefined, {
        operatorType: 'admin',
        operatorId: BigInt(adminId),
        reason: 'admin changed default address while creating order address',
      })
    }

    const created = await tx.address.create({
      data: {
        ownerType: 'user',
        ownerId: BigInt(userId),
        addressType: 'service',
        contactName: address.contactName,
        contactPhone: address.contactPhone,
        country: '中国',
        province: this.optionalText(address.provinceName) || null,
        city: this.optionalText(address.cityName) || null,
        district: this.optionalText(address.districtName) || null,
        street: this.optionalText(address.streetName) || null,
        addressTitle: this.optionalText(address.addressTitle) || null,
        detailAddress: address.detailAddress,
        houseNumber: this.optionalText(address.houseNumber) || null,
        formattedAddress: this.composeAddressText(address),
        latitude: address.latitude ?? null,
        longitude: address.longitude ?? null,
        coordinateType: address.latitude !== undefined ? this.optionalText(address.coordinateType) || 'gcj02' : null,
        poiId: address.latitude !== undefined ? this.optionalText(address.poiId) || null : null,
        mapProvider: address.latitude !== undefined ? this.optionalText(address.mapProvider) || null : null,
        isDefault,
        source: 'admin',
        status: 1,
      },
    })
    await tx.addressRevision.create({
      data: {
        addressId: created.id,
        version: created.version,
        snapshot: this.addressBookRevisionSnapshot(created),
        changeType: 'admin_create',
        operatorType: 'admin',
        operatorId: BigInt(adminId),
        reason: 'admin created address for order',
      },
    })
    return created
  }

  private createServiceSnapshot(service: Awaited<ReturnType<OrdersRepository['findActiveService']>>) {
    if (!service) {
      throw new BusinessException(ErrorCode.SERVICE_NOT_FOUND, 'service not found', 404)
    }
    const serviceCardType = this.memberCards.calculateServiceCardType(service)
    return {
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
      consumeUnit: service.consumeUnit || 0,
      consultationRequired: serviceCardType === MEMBER_CARD_TYPE.CONSULTATION,
      status: service.status,
      sortOrder: service.sortOrder,
    }
  }

  private async createOrderAddress(
    tx: Prisma.TransactionClient,
    orderId: bigint,
    address: Address,
    context: { operatorType: string, operatorId?: bigint, requestId?: string },
  ) {
    const created = await tx.orderAddress.create({
      data: {
        orderId,
        sourceAddressId: address.id,
        sourceAddressVersion: address.version,
        contactName: address.contactName,
        contactPhone: address.contactPhone,
        country: address.country,
        province: address.province,
        city: address.city,
        district: address.district,
        street: address.street,
        addressTitle: address.addressTitle,
        detailAddress: address.detailAddress,
        houseNumber: address.houseNumber,
        formattedAddress: address.formattedAddress,
        latitude: address.latitude,
        longitude: address.longitude,
        coordinateType: address.coordinateType,
        poiId: address.poiId,
        mapProvider: address.mapProvider,
        source: address.source || 'manual',
        version: 1,
      },
    })
    await tx.orderAddressRevision.create({
      data: {
        orderAddressId: created.id,
        version: created.version,
        snapshot: this.orderAddressRevisionSnapshot(created),
        changeType: 'create',
        operatorType: context.operatorType,
        operatorId: context.operatorId,
        requestId: context.requestId,
        reason: 'order address created',
      },
    })
    return created
  }

  private orderAddressUpdateFromAddress(address: Address): Prisma.OrderAddressUncheckedUpdateInput {
    return {
      sourceAddressId: address.id,
      sourceAddressVersion: address.version,
      contactName: address.contactName,
      contactPhone: address.contactPhone,
      country: address.country,
      province: address.province,
      city: address.city,
      district: address.district,
      street: address.street,
      addressTitle: address.addressTitle,
      detailAddress: address.detailAddress,
      houseNumber: address.houseNumber,
      formattedAddress: address.formattedAddress,
      latitude: address.latitude,
      longitude: address.longitude,
      coordinateType: address.coordinateType,
      poiId: address.poiId,
      mapProvider: address.mapProvider,
      source: address.source || 'manual',
    }
  }

  private orderAddressUpdateFromInput(address: AdminOrderAddressDto): Prisma.OrderAddressUncheckedUpdateInput {
    this.assertCoordinatePair(address.latitude, address.longitude)
    return {
      sourceAddressId: null,
      sourceAddressVersion: null,
      contactName: address.contactName.trim(),
      contactPhone: address.contactPhone.trim(),
      country: '中国',
      province: this.optionalText(address.provinceName) || null,
      city: this.optionalText(address.cityName) || null,
      district: this.optionalText(address.districtName) || null,
      street: this.optionalText(address.streetName) || null,
      addressTitle: this.optionalText(address.addressTitle) || null,
      detailAddress: address.detailAddress.trim(),
      houseNumber: this.optionalText(address.houseNumber) || null,
      formattedAddress: this.composeAddressText(address),
      latitude: address.latitude ?? null,
      longitude: address.longitude ?? null,
      coordinateType: address.latitude !== undefined ? this.optionalText(address.coordinateType) || 'gcj02' : null,
      poiId: this.optionalText(address.poiId) || null,
      mapProvider: this.optionalText(address.mapProvider) || null,
      source: address.latitude !== undefined ? 'admin' : 'manual',
    }
  }

  private assertCoordinatePair(latitude?: number, longitude?: number) {
    const hasLatitude = latitude !== undefined && latitude !== null
    const hasLongitude = longitude !== undefined && longitude !== null
    if (hasLatitude !== hasLongitude) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'latitude and longitude must be provided together', 400)
    }
    if (hasLatitude && (latitude! < -90 || latitude! > 90 || longitude! < -180 || longitude! > 180)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid coordinates', 400)
    }
  }

  private orderAddressRevisionSnapshot(address: {
    id: bigint
    orderId: bigint
    sourceAddressId: bigint | null
    sourceAddressVersion: number | null
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
    source: string
    version: number
  }) {
    return {
      id: Number(address.id),
      orderId: Number(address.orderId),
      sourceAddressId: address.sourceAddressId ? Number(address.sourceAddressId) : null,
      sourceAddressVersion: address.sourceAddressVersion,
      contactName: address.contactName,
      contactPhone: address.contactPhone,
      country: address.country,
      provinceName: address.province,
      cityName: address.city,
      districtName: address.district,
      streetName: address.street,
      addressTitle: address.addressTitle,
      detailAddress: address.detailAddress,
      houseNumber: address.houseNumber,
      formattedAddress: address.formattedAddress,
      latitude: address.latitude?.toNumber() ?? null,
      longitude: address.longitude?.toNumber() ?? null,
      coordinateType: address.coordinateType,
      poiId: address.poiId,
      mapProvider: address.mapProvider,
      source: address.source,
      version: address.version,
    } as Prisma.InputJsonObject
  }

  private addressBookRevisionSnapshot(address: Address) {
    return {
      id: Number(address.id),
      ownerType: address.ownerType,
      ownerId: Number(address.ownerId),
      addressType: address.addressType,
      contactName: address.contactName,
      contactPhone: address.contactPhone,
      country: address.country,
      provinceName: address.province,
      cityName: address.city,
      districtName: address.district,
      streetName: address.street,
      addressTitle: address.addressTitle,
      detailAddress: address.detailAddress,
      houseNumber: address.houseNumber,
      formattedAddress: address.formattedAddress,
      latitude: address.latitude?.toNumber() ?? null,
      longitude: address.longitude?.toNumber() ?? null,
      coordinateType: address.coordinateType,
      poiId: address.poiId,
      mapProvider: address.mapProvider,
      source: address.source,
      version: address.version,
    } as Prisma.InputJsonObject
  }

  private composeAddressText(address: NonNullable<AdminCreateOrderDto['address']>) {
    return [
      address.provinceName,
      address.cityName,
      address.districtName,
      address.streetName,
      address.addressTitle,
      address.detailAddress,
      address.houseNumber,
    ].map(value => this.optionalText(value)).filter(Boolean).join('')
  }

  private serviceNameFromSnapshot(value: Prisma.JsonValue) {
    if (!this.isJsonObject(value)) return ''
    const name = value.name
    return typeof name === 'string' ? name : ''
  }

  private isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value))
  }

  private optionalText(value: unknown) {
    if (value === undefined || value === null) return undefined
    const text = String(value).trim()
    return text || undefined
  }

  private presentStaffTaskOrder(order: OrderDetailRecord, staffId: number) {
    return {
      ...presentUserOrder(order),
      ...this.staffIncomeSummary(order, staffId),
    }
  }

  private staffIncomeSummary(order: OrderDetailRecord, staffId: number) {
    const income = order.incomeRecords.find(item => item.staffId === BigInt(staffId))
    return {
      staffIncomeAmount: income ? income.amount.toNumber() : 0,
      staffIncomeSettlementStatus: income?.settlementStatus || 'pending',
      staffIncomeWithdrawStatus: income?.withdrawStatus || 'none',
    }
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
    return !order.serviceBooking?.redemption
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

  private normalizeAdminPaymentMode(paymentMode?: string, memberCardId?: number) {
    if (memberCardId) return 'member_card'
    const value = (paymentMode || 'offline_paid').trim()
    if (['offline_paid', 'paid', 'offline'].includes(value)) return 'offline_paid'
    if (['unpaid', 'pending_payment', 'offline_unpaid'].includes(value)) return 'unpaid'
    if (['member_card', 'card'].includes(value)) return 'member_card'
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid paymentMode', 400)
  }

  private assertAdminUpdateDoesNotBypassAccounting(order: OrderDetailRecord, dto: AdminUpdateOrderDto, allowBookingFields = false) {
    const blockedFields = [
      dto.status !== undefined ? 'status' : '',
      dto.staffId !== undefined ? 'staffId' : '',
      dto.paidAmount !== undefined ? 'paidAmount' : '',
      dto.paidAt !== undefined ? 'paidAt' : '',
      dto.completedAt !== undefined ? 'completedAt' : '',
      dto.cancelledAt !== undefined ? 'cancelledAt' : '',
      dto.cancelReason !== undefined ? 'cancelReason' : '',
      dto.createdAt !== undefined ? 'createdAt' : '',
      !allowBookingFields && dto.appointmentStartTime !== undefined ? 'appointmentStartTime' : '',
      !allowBookingFields && dto.appointmentEndTime !== undefined ? 'appointmentEndTime' : '',
    ].filter(Boolean)
    if (blockedFields.length) {
      throw new BusinessException(
        ErrorCode.COMMON_BAD_REQUEST,
        `accounting fields must use dedicated actions: ${blockedFields.join(', ')}`,
        400,
      )
    }

    const amountFields = [
      dto.originalAmount !== undefined ? 'originalAmount' : '',
      dto.discountAmount !== undefined ? 'discountAmount' : '',
      dto.payableAmount !== undefined ? 'payableAmount' : '',
    ].filter(Boolean)
    const hasSuccessPayment = order.payments.some(payment => payment.status === PAYMENT_STATUS.SUCCESS)
    if (amountFields.length && (order.paidAt || hasSuccessPayment || order.status !== ORDER_STATUS.PENDING_PAYMENT)) {
      throw new BusinessException(
        ErrorCode.COMMON_BAD_REQUEST,
        `paid or dispatchable orders cannot edit amount fields directly: ${amountFields.join(', ')}`,
        400,
      )
    }
  }

  private async assertAdminDraftDeletable(
    order: OrderDetailRecord,
    client: Prisma.TransactionClient = this.repository.client,
  ) {
    const orderId = order.id
    const [
      paymentCount,
      refundCount,
      assignmentCount,
      checkinCount,
      photoCount,
      reviewCount,
      ticketCount,
      incomeCount,
      cardRecordCount,
      pointLedgerCount,
      pointRewardCount,
      fileCount,
    ] = await Promise.all([
      client.payment.count({ where: { orderId } }),
      client.refund.count({ where: { orderId } }),
      client.orderAssignment.count({ where: { orderId } }),
      client.serviceCheckin.count({ where: { orderId } }),
      client.servicePhoto.count({ where: { orderId } }),
      client.review.count({ where: { orderId } }),
      client.ticket.count({ where: { orderId } }),
      client.staffIncomeRecord.count({ where: { orderId } }),
      client.memberCardRecord.count({ where: { orderId } }),
      client.pointLedger.count({ where: { orderId } }),
      client.pointRewardEvent.count({ where: { orderId } }),
      client.file.count({ where: { bizType: 'order', bizId: orderId } }),
    ])

    const blockingReasons: string[] = []
    if (order.status !== ORDER_STATUS.PENDING_PAYMENT) blockingReasons.push('only pending payment drafts can be deleted')
    if (order.paidAt || order.paidAmount.gt(0)) blockingReasons.push('order has payment facts')
    if (paymentCount) blockingReasons.push('payment records exist')
    if (refundCount) blockingReasons.push('refund records exist')
    if (assignmentCount) blockingReasons.push('assignment records exist')
    if (checkinCount || photoCount) blockingReasons.push('fulfillment records exist')
    if (reviewCount || ticketCount) blockingReasons.push('review or after-sales records exist')
    if (incomeCount) blockingReasons.push('staff income records exist')
    if (cardRecordCount || order.serviceBooking?.redemption) blockingReasons.push('member card records exist')
    if (pointLedgerCount || pointRewardCount) blockingReasons.push('point reward records exist')
    if (order.grantedUserMemberCardId || order.memberCardPurchase?.grantedUserMemberCardId) blockingReasons.push('granted member card exists')
    if (fileCount) blockingReasons.push('order files exist')

    if (blockingReasons.length) {
      throw new BusinessException(
        ErrorCode.ORDER_STATUS_INVALID,
        'order contains business facts and cannot be deleted',
        409,
        { blockingReasons },
      )
    }
  }

  private async assertServiceBookingOrder(orderId: number) {
    const booking = await this.repository.client.serviceBookingOrder.findUnique({
      where: { orderId: BigInt(orderId) },
      select: { orderId: true },
    })
    if (!booking) {
      throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'order is not a service booking', 409)
    }
  }

  private async withAdminAssignmentNotifications<T extends Record<string, any>>(payload: T, order: OrderDetailRecord): Promise<T> {
    if (!order.staffId) {
      return {
        ...payload,
        assignmentNotification: null,
        assignmentNotifications: [],
      } as T
    }

    const notifications = await this.repository.client.notification.findMany({
      where: {
        receiverType: 'staff',
        receiverId: order.staffId,
        bizType: 'order',
        bizId: order.id,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
    })
    const latestAssignment = order.assignments[0]
    const current = latestAssignment?.notificationId
      ? notifications.find(item => item.id === latestAssignment.notificationId) || notifications[0]
      : notifications[0]
    const presented = notifications.map(item => ({
      id: Number(item.id),
      type: item.type,
      title: item.title,
      sendStatus: item.sendStatus,
      isRead: item.isRead,
      sentAt: item.sentAt?.toISOString() || null,
      readAt: item.readAt?.toISOString() || null,
      retryCount: item.retryCount || 0,
      lastRetriedAt: item.lastRetriedAt?.toISOString() || null,
      failureReason: item.failureReason || '',
      createdAt: item.createdAt.toISOString(),
    }))

    return {
      ...payload,
      assignmentNotification: current
        ? {
            id: Number(current.id),
            type: current.type,
            title: current.title,
            sendStatus: current.sendStatus,
            isRead: current.isRead,
            sentAt: current.sentAt?.toISOString() || null,
            readAt: current.readAt?.toISOString() || null,
            retryCount: current.retryCount || 0,
            lastRetriedAt: current.lastRetriedAt?.toISOString() || null,
            failureReason: current.failureReason || '',
            createdAt: current.createdAt.toISOString(),
          }
        : null,
      assignmentNotifications: presented,
    } as T
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

    if (Array.isArray(next.tickets)) {
      next.tickets = next.tickets.map((ticket: Record<string, any>) => {
        const copy = { ...ticket }
        if (Array.isArray(copy.latestImages)) {
          copy.latestImageOssUrls = copy.latestImages.slice()
          copy.latestImages = this.storage.signUrlList(copy.latestImages)
        }
        return copy
      })
    }

    if (next.latestTicket && typeof next.latestTicket === 'object' && Array.isArray(next.latestTicket.latestImages)) {
      next.latestTicket = {
        ...next.latestTicket,
        latestImageOssUrls: next.latestTicket.latestImages.slice(),
        latestImages: this.storage.signUrlList(next.latestTicket.latestImages),
      }
    }

    return next as T
  }

  private presentStaffWorkStatus(staffId: number, workStatus: number) {
    return {
      staffId,
      workStatus,
      workStatusText: this.workStatusText(workStatus),
    }
  }

  private workStatusText(workStatus: number) {
    if (workStatus === 1) return 'online'
    if (workStatus === 2) return 'busy'
    return 'offline'
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
    const activeWhere: Prisma.OrderWhereInput = {
      staffId: BigInt(staffId),
      status: {
        in: [
          ORDER_STATUS.DISPATCHED,
          ORDER_STATUS.ACCEPTED,
          ORDER_STATUS.ON_THE_WAY,
          ORDER_STATUS.IN_SERVICE,
          ORDER_STATUS.PENDING_CONFIRM,
        ],
      },
      ...(range ? { appointmentStartTime: { gte: range.start, lt: range.end } } : {}),
    }

    const [newOrderCount, activeOrderCount, completedOrderCount, completedAmount] = await Promise.all([
      this.repository.client.order.count({ where: createdWhere }),
      this.repository.client.order.count({ where: activeWhere }),
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
      writeOrderCount: activeOrderCount,
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

  private createOfflinePaymentNo(orderNo: string) {
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0')
    return `OF${Date.now()}${random}`.slice(0, 64) || `OF${orderNo}`
  }

  private extractDay38RunId(text: string) {
    const matched = text.match(/DAY(?:38|39|40|41|42|43)_TEST_[A-Za-z0-9_-]+/)
    return matched?.[0]
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
