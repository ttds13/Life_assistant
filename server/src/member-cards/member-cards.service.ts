import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AdminAuditService } from '../audit-log/admin-audit.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { CouponsService } from '../coupons/coupons.service'
import { PrismaService } from '../prisma/prisma.service'
import { ORDER_ACTION } from '../orders/constants/order-action'
import { ORDER_STATUS } from '../orders/constants/order-status'
import { ORDER_TYPE } from '../orders/constants/order-type'
import { PAYMENT_CHANNEL } from '../payments/constants/payment-channel'
import { PAYMENT_STATUS } from '../payments/constants/payment-status'
import { ObjectStorageService } from '../storage/storage.service'
import { UsersService } from '../users/users.service'
import {
  MEMBER_CARD_RECORD_TYPE,
  MEMBER_CARD_TYPE,
  USER_MEMBER_CARD_AVAILABILITY,
  USER_MEMBER_CARD_COMPLETED_REASON,
  USER_MEMBER_CARD_STATUS,
} from './constants/member-card'
import type { AdminCreateMemberCardPurchaseDto, GrantMemberCardDto } from './dto/grant-member-card.dto'

type CardWithTemplate = Prisma.UserMemberCardGetPayload<{ include: { card: true } }>
type MemberCardClient = PrismaService | Prisma.TransactionClient
type CardServiceRuleWithService = Prisma.MemberCardServiceRuleGetPayload<{ include: { service: true } }>
type MemberCardTemplate = Prisma.MemberCardGetPayload<Record<string, never>> & {
  serviceRuleItems?: CardServiceRuleWithService[]
}
type PublishedMemberCardProduct = Prisma.MemberCardGetPayload<{ include: { publishedVersion: true } }>
type PublicMemberCardService = Prisma.ServiceGetPayload<Record<string, never>>
type CardWithRules = Prisma.UserMemberCardGetPayload<{ include: { card: true } }> & {
  card: MemberCardTemplate
}
type ServiceCardRule = {
  id: bigint
  code: string
  name: string
  priceUnit: string
  durationMinutes: number | null
  cardType?: string | null
  consumeUnit?: number | null
  consultationRequired?: boolean | null
}

interface AdminContext {
  adminId: number
  requestId?: string
  ip?: string
}

interface ConsumeParams {
  userId: number
  userMemberCardId: number
  service: ServiceCardRule
}

interface PreviewParams extends ConsumeParams {
  requestedConsumeMinutes?: number
}

interface FreezeParams extends ConsumeParams {
  tx: Prisma.TransactionClient
  orderId: bigint
  requestedConsumeMinutes?: number
  operatorType?: string
  operatorId?: bigint
  remark?: string
}

interface CompleteParams {
  tx: Prisma.TransactionClient
  order: {
    id: bigint
    userId: bigint
    memberCardId: bigint | null
    memberCardConsumeUnits: number
    memberCardRuleSnapshot?: Prisma.JsonValue | null
    appointmentStartTime: Date
    appointmentEndTime: Date
    serviceId: bigint
  }
  actualMinutes?: number
  operatorType: string
  operatorId: bigint
  remark?: string
}

interface ResolvedMemberCardRule {
  applicable: boolean
  consumeUnits: number
  ruleSource: string
  ruleId: bigint | null
  reason?: string
}

const MEMBER_CARD_PURCHASE_SERVICE_CODE = 'member_card_purchase'
const NON_MEMBER_CARD_TYPE = 'none'
const CONSULTATION_PRICE_UNITS = new Set(['\u54a8\u8be2'])
const TIME_PRICE_UNITS = new Set(['\u5c0f\u65f6', '\u5206\u949f'])
const TIMES_PRICE_UNITS = new Set(['\u6b21', '\u53f0', '\u5f20', '\u5355', '\u4ef6'])
const MEMBER_CARD_SERVICE_TYPES = new Set<string>([
  MEMBER_CARD_TYPE.TIME,
  MEMBER_CARD_TYPE.TIMES,
])

@Injectable()
export class MemberCardsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
    @Inject(CouponsService) private readonly coupons: CouponsService,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
    @Inject(UsersService) private readonly users: UsersService,
  ) {}

  async listUserCards(userId: number, serviceId?: number) {
    const now = new Date()
    const where: Prisma.UserMemberCardWhereInput = {
      userId: BigInt(userId),
      card: { status: 1 },
    }
    if (serviceId) {
      where.status = { in: [USER_MEMBER_CARD_STATUS.PENDING_ACTIVATION, USER_MEMBER_CARD_STATUS.ACTIVE] }
      where.availabilityState = USER_MEMBER_CARD_AVAILABILITY.AVAILABLE
      where.OR = [
        {
          status: USER_MEMBER_CARD_STATUS.PENDING_ACTIVATION,
          activationDeadlineAt: { gt: now },
        },
        {
          status: USER_MEMBER_CARD_STATUS.ACTIVE,
          expireAt: { gt: now },
        },
      ]
    }
    const cards = await this.prisma.userMemberCard.findMany({
      where,
      include: {
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
      orderBy: [{ activationDeadlineAt: 'asc' }, { expireAt: 'asc' }, { id: 'desc' }],
    })

    let service: ServiceCardRule | null = null
    if (serviceId) {
      service = await this.findServiceForCard(this.prisma, BigInt(serviceId))
      if (!service) return []
    }

    return cards
      .map((item) => {
        const resolved = service ? this.resolveDay49Rule(item, service) : null
        const usableMinutes = Math.max(0, item.remainingMinutes - item.frozenMinutes)
        const allowedMinutes = resolved?.applicable
          ? this.reservationOptions(resolved).filter(minutes => minutes <= usableMinutes)
          : []
        const available = service ? allowedMinutes.length > 0 : usableMinutes > 0
        const consumeUnits = resolved?.applicable
          ? (allowedMinutes.includes(resolved.consumeMinutes) ? resolved.consumeMinutes : allowedMinutes[0] || 0)
          : 0
        return this.presentUserCard(item, {
          available,
          consumeUnits,
          serviceName: service?.name || '',
          ruleSource: resolved?.ruleSource || '',
          consumeMode: resolved?.consumeMode || '',
          minConsumeMinutes: resolved?.minConsumeMinutes || 0,
          allowedMinutes,
        })
      })
      .filter(item => !serviceId || item.available)
  }

  async listPurchasableCards() {
    const cards = await this.prisma.memberCard.findMany({
      where: {
        status: 1,
        deletedAt: null,
        publishedVersionId: { not: null },
        cardType: { not: MEMBER_CARD_TYPE.CONSULTATION },
      },
      include: { publishedVersion: true },
      orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }, { id: 'asc' }],
    })
    return this.presentPublishedCardProducts(cards)
  }

  async getPurchasableCardDetail(cardId: number) {
    const card = await this.prisma.memberCard.findFirst({
      where: {
        id: BigInt(cardId),
        status: 1,
        deletedAt: null,
        publishedVersionId: { not: null },
        cardType: { not: MEMBER_CARD_TYPE.CONSULTATION },
      },
      include: { publishedVersion: true },
    })
    if (!card) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'member card not found', 404)
    const [presented] = await this.presentPublishedCardProducts([card])
    if (!presented) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'published member card version not found', 404)
    return presented
  }

  async createPurchaseOrder(
    userId: number,
    dto: { cardId: number, remark?: string, source?: string, promotionKey?: string, campaignId?: string },
    requestId?: string,
  ) {
    const [user, card] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: BigInt(userId), deletedAt: null, status: 1 } }),
      this.prisma.memberCard.findFirst({
        where: { id: BigInt(dto.cardId), status: 1, deletedAt: null, publishedVersionId: { not: null } },
        include: { publishedVersion: true },
      }),
    ])
    if (!user) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'user not found', 404)
    if (!card) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'member card not found', 404)
    if (card.cardType === MEMBER_CARD_TYPE.CONSULTATION) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'consultation card cannot be purchased directly', 400)
    }

    const planVersion = card.publishedVersion
    if (!planVersion) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'published member card version not found', 404)
    const purchaseService = await this.ensurePurchaseService(this.prisma)
    const totalUnits = planVersion.totalMinutes
    const publishedPrice = planVersion.price
    const now = new Date()
    const serviceSnapshot = this.buildPublishedPurchaseSnapshot(card, planVersion)
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNo: this.createOrderNo(),
          userId: BigInt(userId),
          serviceId: purchaseService.id,
          orderType: ORDER_TYPE.MEMBER_CARD_PURCHASE,
          status: 'pending_payment',
          serviceSnapshot: serviceSnapshot as Prisma.InputJsonObject,
          appointmentStartTime: now,
          appointmentEndTime: now,
          originalAmount: publishedPrice,
          discountAmount: 0,
          payableAmount: publishedPrice,
          paidAmount: 0,
          remark: dto.remark || null,
          source: this.normalizeSource(dto.source),
        },
      })

      await tx.memberCardPurchaseOrder.create({
        data: {
          orderId: created.id,
          memberCardPlanId: card.id,
          memberCardPlanVersion: planVersion.version,
          planSnapshot: planVersion.snapshot as Prisma.InputJsonObject,
        },
      })

      await tx.orderStatusLog.create({
        data: {
          orderId: created.id,
          fromStatus: null,
          toStatus: 'pending_payment',
          operatorType: 'user',
          operatorId: BigInt(userId),
          action: 'create_order',
          requestId,
          remark: 'member card purchase order created',
          detail: {
            orderType: ORDER_TYPE.MEMBER_CARD_PURCHASE,
            cardId: Number(card.id),
            totalUnits,
            source: this.normalizeSource(dto.source),
            promotionKey: dto.promotionKey || null,
            campaignId: dto.campaignId || null,
          } as Prisma.InputJsonObject,
        },
      })

      return created
    })

    const [presentedCard] = await this.presentPublishedCardProducts([card])
    return {
      id: Number(order.id),
      orderNo: order.orderNo,
      orderType: order.orderType,
      status: order.status,
      card: presentedCard,
      totalAmount: publishedPrice.toNumber(),
      payableAmount: publishedPrice.toNumber(),
      createdAt: order.createdAt.toISOString(),
    }
  }

  async expireDueCards(now = new Date()) {
    const candidates = await this.prisma.userMemberCard.findMany({
      where: {
        status: { in: [USER_MEMBER_CARD_STATUS.PENDING_ACTIVATION, USER_MEMBER_CARD_STATUS.ACTIVE] },
        redemptions: { none: { state: 'reserved' } },
        OR: [
          {
            status: USER_MEMBER_CARD_STATUS.PENDING_ACTIVATION,
            activationDeadlineAt: { lte: now },
          },
          {
            status: USER_MEMBER_CARD_STATUS.ACTIVE,
            expireAt: { lte: now },
          },
        ],
      },
      select: { id: true },
      take: 500,
    })

    let expired = 0
    for (const candidate of candidates) {
      const completed = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM user_member_cards WHERE id = ${candidate.id} FOR UPDATE`
        const card = await tx.userMemberCard.findUnique({ where: { id: candidate.id } })
        if (!card || card.status === USER_MEMBER_CARD_STATUS.COMPLETED) return false
        const hasReservation = await tx.orderRedemption.count({
          where: { userMemberCardId: card.id, state: 'reserved' },
        })
        if (hasReservation) return false
        const due = card.status === USER_MEMBER_CARD_STATUS.PENDING_ACTIVATION
          ? Boolean(card.activationDeadlineAt && card.activationDeadlineAt <= now)
          : Boolean(card.expireAt && card.expireAt <= now)
        if (!due) return false

        await tx.userMemberCard.update({
          where: { id: card.id },
          data: {
            status: USER_MEMBER_CARD_STATUS.COMPLETED,
            completedReason: USER_MEMBER_CARD_COMPLETED_REASON.EXPIRED,
            completedAt: now,
          },
        })
        await tx.memberCardRecord.create({
          data: {
            userMemberCardId: card.id,
            recordType: MEMBER_CARD_RECORD_TYPE.COMPLETED,
            timesUsed: 0,
            units: 0,
            beforeUnits: card.remainingUnits,
            afterUnits: card.remainingUnits,
            beforeRemainingMinutes: card.remainingMinutes,
            afterRemainingMinutes: card.remainingMinutes,
            beforeFrozenMinutes: card.frozenMinutes,
            afterFrozenMinutes: card.frozenMinutes,
            operatorType: 'system',
            operatorId: BigInt(0),
            remark: card.status === USER_MEMBER_CARD_STATUS.PENDING_ACTIVATION
              ? 'activation_deadline_expired'
              : 'validity_expired',
          },
        })
        return true
      })
      if (completed) expired += 1
    }
    return { scanned: candidates.length, expired }
  }

  async createAdminPurchaseOrder(dto: AdminCreateMemberCardPurchaseDto, context: AdminContext) {
    const [user, card] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: BigInt(dto.userId), deletedAt: null, status: 1 } }),
      this.prisma.memberCard.findFirst({
        where: { id: BigInt(dto.cardId), status: 1, deletedAt: null, publishedVersionId: { not: null } },
        include: { publishedVersion: true },
      }),
    ])
    if (!user) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'user not found', 404)
    if (!card) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'member card not found', 404)
    if (card.cardType === MEMBER_CARD_TYPE.CONSULTATION) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'consultation card cannot be purchased directly', 400)
    }
    const planVersion = card.publishedVersion
    if (!planVersion) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'published member card version not found', 404)
    const publishedPrice = planVersion.price

    const paymentMode = this.normalizeAdminPurchasePaymentMode(dto.paymentMode)
    const source = this.normalizeSource(dto.source || 'offline')
    let payableAmount = new Prisma.Decimal(dto.payableAmount ?? publishedPrice.toNumber())
    if (payableAmount.lessThan(0)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'payable amount must be non-negative', 400)
    }
    const purchaseService = await this.ensurePurchaseService(this.prisma)
    let discountAmount = publishedPrice.greaterThan(payableAmount)
      ? publishedPrice.sub(payableAmount)
      : new Prisma.Decimal(0)
    if (dto.couponId) {
      const couponPreview = await this.coupons.previewDiscount({
        userId: user.id,
        couponId: dto.couponId,
        serviceId: purchaseService.id,
        amount: publishedPrice,
      })
      discountAmount = couponPreview.discountAmount
      payableAmount = couponPreview.payableAmount
    }
    else if (!payableAmount.equals(publishedPrice) && !dto.adminRemark) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'adminRemark is required when payable amount differs from card price', 400)
    }
    if (paymentMode === 'unpaid' && payableAmount.lessThanOrEqualTo(0)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'zero payable member card purchase cannot wait for offline payment', 400)
    }

    const totalUnits = planVersion.totalMinutes
    const now = new Date()
    const serviceSnapshot = this.buildPublishedPurchaseSnapshot(card, planVersion)
    const paidAt = paymentMode === 'offline_paid'
      ? this.parseAdminPurchaseDate(dto.offlinePaidAt, 'offlinePaidAt')
      : null

    const created = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNo: this.createOrderNo(),
          userId: user.id,
          serviceId: purchaseService.id,
          orderType: ORDER_TYPE.MEMBER_CARD_PURCHASE,
          status: ORDER_STATUS.PENDING_PAYMENT,
          serviceSnapshot: serviceSnapshot as Prisma.InputJsonObject,
          appointmentStartTime: now,
          appointmentEndTime: now,
          originalAmount: publishedPrice,
          discountAmount,
          payableAmount,
          paidAmount: 0,
          remark: dto.remark || null,
          adminRemark: dto.adminRemark || null,
          source,
        },
      })

      await tx.memberCardPurchaseOrder.create({
        data: {
          orderId: order.id,
          memberCardPlanId: card.id,
          memberCardPlanVersion: planVersion.version,
          planSnapshot: planVersion.snapshot as Prisma.InputJsonObject,
        },
      })

      if (dto.couponId) {
        const couponPreview = await this.coupons.lockCouponForOrder({
          tx,
          userId: user.id,
          couponId: dto.couponId,
          serviceId: purchaseService.id,
          amount: publishedPrice,
          orderId: order.id,
        })
        discountAmount = couponPreview.discountAmount
        payableAmount = couponPreview.payableAmount
        await tx.order.update({
          where: { id: order.id },
          data: {
            couponId: couponPreview.couponId,
            discountAmount,
            payableAmount,
          },
        })
      }

      await tx.orderStatusLog.create({
        data: {
          orderId: order.id,
          fromStatus: null,
          toStatus: ORDER_STATUS.PENDING_PAYMENT,
          operatorType: 'admin',
          operatorId: BigInt(context.adminId),
          action: ORDER_ACTION.ADMIN_CREATE_ORDER,
          requestId: context.requestId,
          remark: dto.adminRemark || 'admin created offline member card purchase order',
          detail: {
            orderType: ORDER_TYPE.MEMBER_CARD_PURCHASE,
            cardId: Number(card.id),
            totalUnits,
            source,
            paymentMode,
            couponId: dto.couponId || null,
            discountAmount: discountAmount.toNumber(),
            payableAmount: payableAmount.toNumber(),
          } as Prisma.InputJsonObject,
        },
      })

      let paymentNo: string | null = null
      let grantedCardId: number | null = null
      if (paymentMode === 'offline_paid') {
        const paymentPaidAt = paidAt || new Date()
        paymentNo = this.createOfflinePaymentNo(order.orderNo)
        const payment = await tx.payment.create({
          data: {
            paymentNo,
            orderId: order.id,
            userId: order.userId,
            channel: PAYMENT_CHANNEL.OFFLINE,
            amount: payableAmount,
            status: PAYMENT_STATUS.SUCCESS,
            transactionNo: `OFFLINE_${order.orderNo}`,
            paidAt: paymentPaidAt,
            callbackRaw: JSON.stringify({
              channel: PAYMENT_CHANNEL.OFFLINE,
              source,
              paymentMode,
              requestId: context.requestId,
              adminId: context.adminId,
              remark: dto.paymentRemark || dto.adminRemark || dto.remark || '',
            }),
          },
        })

        const granted = await this.grantForPaidPurchaseOrder(tx, order, 'admin', BigInt(context.adminId))
        grantedCardId = granted ? Number(granted.id) : null
        await this.coupons.markCouponUsedForOrder(tx, order.id, paymentPaidAt)

        await tx.order.update({
          where: { id: order.id },
          data: {
            status: ORDER_STATUS.COMPLETED,
            paidAmount: payableAmount,
            paidAt: paymentPaidAt,
            completedAt: paymentPaidAt,
            version: { increment: 1 },
          },
        })
        await tx.orderStatusLog.create({
          data: {
            orderId: order.id,
            fromStatus: ORDER_STATUS.PENDING_PAYMENT,
            toStatus: ORDER_STATUS.COMPLETED,
            operatorType: 'admin',
            operatorId: BigInt(context.adminId),
            action: ORDER_ACTION.PAY_SUCCESS,
            requestId: context.requestId,
            remark: dto.paymentRemark || 'admin confirmed offline member card purchase payment',
            detail: {
              paymentNo,
              amount: payableAmount.toNumber(),
              orderType: ORDER_TYPE.MEMBER_CARD_PURCHASE,
              purchaseCardId: Number(card.id),
              grantedUserMemberCardId: grantedCardId,
              totalUnits,
              paidAt: paymentPaidAt.toISOString(),
            } as Prisma.InputJsonObject,
          },
        })
        await tx.paymentNotifyLog.create({
          data: {
            paymentId: payment.id,
            paymentNo,
            channel: PAYMENT_CHANNEL.OFFLINE,
            rawBody: JSON.stringify({
              orderId: Number(order.id),
              requestId: context.requestId,
              adminId: context.adminId,
              remark: dto.paymentRemark || '',
            }),
            processResult: 'success',
          },
        })
      }

      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'member-card:purchase-order:create',
        module: 'marketing',
        targetType: 'order',
        targetId: order.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: {
          orderNo: order.orderNo,
          userId: dto.userId,
          cardId: dto.cardId,
          source,
          paymentMode,
          couponId: dto.couponId || null,
          discountAmount: discountAmount.toNumber(),
          payableAmount: payableAmount.toNumber(),
          paymentNo,
          grantedUserMemberCardId: grantedCardId,
          remark: dto.remark || '',
          adminRemark: dto.adminRemark || '',
        },
      })

      return order
    })

    return {
      id: String(created.id),
      orderNo: created.orderNo,
      orderType: created.orderType,
      status: paymentMode === 'offline_paid' ? ORDER_STATUS.COMPLETED : created.status,
      userId: Number(created.userId),
      userName: user.nickname || '',
      userPhone: user.phone || '',
      serviceName: planVersion.productName || card.name,
      appointmentStartTime: created.appointmentStartTime.toISOString(),
      appointmentEndTime: created.appointmentEndTime.toISOString(),
      appointmentTime: created.appointmentStartTime.toISOString(),
      addressText: '',
      totalAmount: publishedPrice.toNumber(),
      originalAmount: publishedPrice.toNumber(),
      discountAmount: discountAmount.toNumber(),
      payableAmount: payableAmount.toNumber(),
      paidAmount: paymentMode === 'offline_paid' ? payableAmount.toNumber() : 0,
      couponId: dto.couponId || null,
      source,
      remark: dto.remark || '',
      adminRemark: dto.adminRemark || '',
      purchaseCardId: Number(card.id),
      memberCardConsumeUnits: totalUnits,
      paidAt: paidAt?.toISOString() || null,
      completedAt: paymentMode === 'offline_paid' ? paidAt?.toISOString() || null : null,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    }
  }

  async grantForPaidPurchaseOrder(
    tx: Prisma.TransactionClient,
    order: {
      id: bigint
      userId: bigint
      orderType: string
      memberCardId: bigint | null
      purchaseCardId?: bigint | null
      grantedUserMemberCardId?: bigint | null
      memberCardConsumeUnits: number
    },
    operatorType = 'system',
    operatorId: bigint = BigInt(0),
  ) {
    if (order.orderType !== ORDER_TYPE.MEMBER_CARD_PURCHASE) return null
    const purchase = await tx.memberCardPurchaseOrder.findUnique({ where: { orderId: order.id } })
    const grantedUserCardId = purchase?.grantedUserMemberCardId || order.grantedUserMemberCardId
    if (grantedUserCardId) {
      return tx.userMemberCard.findUnique({
        where: { id: grantedUserCardId },
        include: { card: true },
      })
    }

    const cardId = purchase?.memberCardPlanId || order.purchaseCardId || order.memberCardId
    if (!cardId) return null

    const existingGrant = await tx.memberCardRecord.findFirst({
      where: {
        orderId: order.id,
        recordType: MEMBER_CARD_RECORD_TYPE.GRANT,
      },
      include: { userMemberCard: { include: { card: true } } },
    })
    if (existingGrant) {
      await tx.memberCardPurchaseOrder.updateMany({
        where: { orderId: order.id, grantedUserMemberCardId: null },
        data: { grantedUserMemberCardId: existingGrant.userMemberCard.id },
      })
      return existingGrant.userMemberCard
    }

    const card = await tx.memberCard.findFirst({ where: { id: cardId, status: 1 } })
    if (!card) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'member card not found', 404)
    }
    if (card.cardType === MEMBER_CARD_TYPE.CONSULTATION) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'consultation card cannot be granted as countable benefit', 400)
    }

    const totalUnits = purchase
      ? this.planTotalMinutes(purchase.planSnapshot, this.resolveCardTotalUnits(card))
      : this.resolveCardTotalUnits(card, order.memberCardConsumeUnits)
    const createdPlanVersion = purchase ? null : await this.ensureCurrentPlanVersion(tx, card.id)
    const planVersionNumber = purchase?.memberCardPlanVersion || createdPlanVersion!.version
    const planSnapshot = purchase?.planSnapshot || createdPlanVersion!.snapshot
    const activationDeadlineDays = purchase
      ? this.planActivationDeadlineDays(purchase.planSnapshot, card.activationDeadlineDays)
      : createdPlanVersion!.activationDeadlineDays
    const issuedAt = new Date()
    const userCard = await tx.userMemberCard.create({
      data: {
        cardId: card.id,
        userId: order.userId,
        purchaseOrderId: order.id,
        planVersion: planVersionNumber,
        planSnapshot: planSnapshot as Prisma.InputJsonObject,
        remainingTimes: this.unitsToLegacyTimes(card, totalUnits),
        remainingUnits: totalUnits,
        frozenUnits: 0,
        status: USER_MEMBER_CARD_STATUS.PENDING_ACTIVATION,
        source: 'purchase',
        issuedAt,
        activationDeadlineAt: this.addDays(issuedAt, activationDeadlineDays),
        expireAt: null,
        totalMinutes: totalUnits,
        remainingMinutes: totalUnits,
        frozenMinutes: 0,
        availabilityState: USER_MEMBER_CARD_AVAILABILITY.AVAILABLE,
      },
      include: { card: true },
    })

    await tx.memberCardRecord.create({
      data: {
        userMemberCardId: userCard.id,
        orderId: order.id,
        recordType: MEMBER_CARD_RECORD_TYPE.GRANT,
        timesUsed: 0,
        units: totalUnits,
        beforeUnits: 0,
        afterUnits: totalUnits,
        beforeRemainingMinutes: 0,
        afterRemainingMinutes: totalUnits,
        beforeFrozenMinutes: 0,
        afterFrozenMinutes: 0,
        operatorType,
        operatorId,
        remark: 'grant after member card purchase paid',
      },
    })

    await tx.memberCardPurchaseOrder.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        memberCardPlanId: card.id,
        memberCardPlanVersion: planVersionNumber,
        planSnapshot: planSnapshot as Prisma.InputJsonObject,
        grantedUserMemberCardId: userCard.id,
        grantedAt: issuedAt,
      },
      update: {
        grantedUserMemberCardId: userCard.id,
        grantedAt: issuedAt,
      },
    })

    return userCard
  }

  async revokePurchaseGrantForRefund(
    tx: Prisma.TransactionClient,
    order: {
      id: bigint
      userId: bigint
      orderType: string
      purchaseCardId?: bigint | null
      memberCardId?: bigint | null
      grantedUserMemberCardId?: bigint | null
    },
    operatorType = 'system',
    operatorId: bigint = BigInt(0),
    remark = 'revoke member card after purchase refund',
  ) {
    if (order.orderType !== ORDER_TYPE.MEMBER_CARD_PURCHASE) return null

    const purchase = await tx.memberCardPurchaseOrder.findUnique({ where: { orderId: order.id } })
    const grantedUserCardId = purchase?.grantedUserMemberCardId || order.grantedUserMemberCardId
    const userCard = grantedUserCardId
      ? await tx.userMemberCard.findUnique({
        where: { id: grantedUserCardId },
        include: { card: true },
      })
      : null

    const grantRecord = await tx.memberCardRecord.findFirst({
      where: {
        orderId: order.id,
        recordType: MEMBER_CARD_RECORD_TYPE.GRANT,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })

    const card = userCard || (grantRecord
      ? await tx.userMemberCard.findUnique({
        where: { id: grantRecord.userMemberCardId },
        include: { card: true },
      })
      : null)

    if (!card) return null

    const existingRevoke = await tx.memberCardRecord.findFirst({
      where: {
        userMemberCardId: card.id,
        orderId: order.id,
        recordType: MEMBER_CARD_RECORD_TYPE.REFUND_REVOKE,
      },
    })
    if (existingRevoke || (card.status === USER_MEMBER_CARD_STATUS.COMPLETED
      && card.completedReason === USER_MEMBER_CARD_COMPLETED_REASON.REFUNDED)) {
      return card
    }

    const nonGrantRecords = await tx.memberCardRecord.count({
      where: {
        userMemberCardId: card.id,
        recordType: { notIn: [MEMBER_CARD_RECORD_TYPE.GRANT] },
      },
    })
    if (nonGrantRecords > 0) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card has usage records, refund requires after-sales review', 409)
    }

    const activeBookings = await tx.order.count({
      where: {
        id: { not: order.id },
        status: { notIn: [ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED] },
        OR: [
          { memberCardId: card.id },
          { serviceBooking: { redemption: { userMemberCardId: card.id } } },
        ],
      },
    })
    if (activeBookings > 0) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card is linked to active bookings, refund requires after-sales review', 409)
    }

    const grantedUnits = grantRecord?.units || card.card.totalUnits || card.remainingUnits
    if (card.frozenUnits > 0 || card.remainingUnits !== grantedUnits) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card has been used or frozen, refund requires after-sales review', 409)
    }

    const updated = await tx.userMemberCard.update({
      where: { id: card.id },
      data: {
        remainingUnits: 0,
        frozenUnits: 0,
        remainingTimes: 0,
        remainingMinutes: 0,
        frozenMinutes: 0,
        status: USER_MEMBER_CARD_STATUS.COMPLETED,
        completedReason: USER_MEMBER_CARD_COMPLETED_REASON.REFUNDED,
        completedAt: new Date(),
      },
      include: { card: true },
    })

    await tx.memberCardRecord.create({
      data: {
        userMemberCardId: card.id,
        orderId: order.id,
        recordType: MEMBER_CARD_RECORD_TYPE.REFUND_REVOKE,
        timesUsed: this.unitsToLegacyTimes(card.card, grantedUnits),
        units: grantedUnits,
        beforeUnits: card.remainingUnits,
        afterUnits: updated.remainingUnits,
        beforeRemainingMinutes: card.remainingMinutes,
        afterRemainingMinutes: updated.remainingMinutes,
        beforeFrozenMinutes: card.frozenMinutes,
        afterFrozenMinutes: updated.frozenMinutes,
        operatorType,
        operatorId,
        remark,
      },
    })

    return updated
  }

  async grantCard(dto: GrantMemberCardDto, context: AdminContext) {
    const [user, card] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: BigInt(dto.userId), deletedAt: null, status: 1 } }),
      this.prisma.memberCard.findFirst({
        where: { id: BigInt(dto.cardId), status: 1, deletedAt: null, publishedVersionId: { not: null } },
      }),
    ])
    if (!user) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'user not found', 404)
    if (!card) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'member card not found', 404)
    if (card.cardType === MEMBER_CARD_TYPE.CONSULTATION) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'consultation card cannot be granted as countable benefit', 400)
    }

    const totalUnits = this.resolveCardTotalUnits(card, dto.totalUnits)
    const source = this.normalizeSource(dto.source || 'admin')
    const paymentChannel = this.normalizeSource(dto.paymentChannel || (source === 'offline' ? 'offline' : 'admin'))
    const grantRemark = this.buildGrantRemark(dto.remark, {
      source,
      offlinePaymentAmount: dto.offlinePaymentAmount,
      paymentChannel,
      paymentRemark: dto.paymentRemark,
    })

    const created = await this.prisma.$transaction(async (tx) => {
      const planVersion = await this.ensureCurrentPlanVersion(tx, card.id)
      const issuedAt = new Date()
      const activationDeadlineAt = this.addDays(issuedAt, planVersion.activationDeadlineDays)
      const userCard = await tx.userMemberCard.create({
        data: {
          cardId: card.id,
          userId: user.id,
          planVersion: planVersion.version,
          planSnapshot: planVersion.snapshot as Prisma.InputJsonObject,
          remainingTimes: this.unitsToLegacyTimes(card, totalUnits),
          remainingUnits: totalUnits,
          frozenUnits: 0,
          status: USER_MEMBER_CARD_STATUS.PENDING_ACTIVATION,
          source,
          issuedAt,
          activationDeadlineAt,
          expireAt: null,
          totalMinutes: totalUnits,
          remainingMinutes: totalUnits,
          frozenMinutes: 0,
          availabilityState: USER_MEMBER_CARD_AVAILABILITY.AVAILABLE,
        },
        include: { card: true },
      })

      await tx.memberCardRecord.create({
        data: {
          userMemberCardId: userCard.id,
          orderId: null,
          recordType: MEMBER_CARD_RECORD_TYPE.GRANT,
          timesUsed: 0,
          units: totalUnits,
          beforeUnits: 0,
          afterUnits: totalUnits,
          beforeRemainingMinutes: 0,
          afterRemainingMinutes: totalUnits,
          beforeFrozenMinutes: 0,
          afterFrozenMinutes: 0,
          operatorType: 'admin',
          operatorId: BigInt(context.adminId),
          remark: grantRemark,
        },
      })

      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'member-card:grant',
        module: 'marketing',
        targetType: 'user_member_card',
        targetId: userCard.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: {
          userId: dto.userId,
          cardId: dto.cardId,
          totalUnits,
          activationDeadlineAt: activationDeadlineAt.toISOString(),
          source,
          offlinePaymentAmount: dto.offlinePaymentAmount ?? null,
          paymentChannel,
          paymentRemark: dto.paymentRemark || '',
          remark: dto.remark || '',
        },
      })

      return userCard
    })

    return this.presentUserCard(created)
  }

  async freezeForOrder(params: FreezeParams) {
    await params.tx.$queryRaw`SELECT id FROM user_member_cards WHERE id = ${BigInt(params.userMemberCardId)} FOR UPDATE`
    const userCard = await this.findUserCardForUse(params.tx, params.userId, params.userMemberCardId)
    if (!userCard) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card is not available', 409)
    }
    const existing = await params.tx.orderRedemption.findUnique({ where: { orderId: params.orderId } })
    if (existing) {
      if (existing.state !== 'reserved') {
        throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, 'member card reservation has already been settled', 409)
      }
      return {
        userCard,
        consumeUnits: existing.reservedMinutes,
        consumeMinutes: existing.reservedMinutes,
        ruleSnapshot: existing.ruleSnapshot,
      }
    }

    const resolvedRule = this.resolveDay49Rule(userCard, params.service)
    if (!resolvedRule.applicable) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card is not applicable to this service', 409)
    }

    const consumeMinutes = this.resolveReservationMinutes(resolvedRule, params.requestedConsumeMinutes)
    const availableMinutes = userCard.remainingMinutes - userCard.frozenMinutes
    if (consumeMinutes < 1 || availableMinutes < consumeMinutes) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card balance is insufficient', 409, {
        availableMinutes,
        consumeMinutes,
      })
    }

    const now = new Date()
    const activatesCard = userCard.status === USER_MEMBER_CARD_STATUS.PENDING_ACTIVATION
    const expireAt = activatesCard ? this.addDays(now, this.planValidityDays(userCard)) : userCard.expireAt
    const ruleSnapshot = this.buildDay49RuleSnapshot(userCard, params.service, resolvedRule, consumeMinutes)
    const updated = await params.tx.userMemberCard.update({
      where: { id: userCard.id },
      data: {
        frozenMinutes: { increment: consumeMinutes },
        // Keep legacy numeric fields synchronized until the Day49 cleanup migration.
        frozenUnits: { increment: consumeMinutes },
        ...(activatesCard
          ? {
              status: USER_MEMBER_CARD_STATUS.ACTIVE,
              activatedAt: now,
              expireAt,
            }
          : {}),
      },
      include: { card: true },
    })

    const redemption = await params.tx.orderRedemption.create({
      data: {
        orderId: params.orderId,
        userMemberCardId: userCard.id,
        state: 'reserved',
        reservedMinutes: consumeMinutes,
        ruleSnapshot: ruleSnapshot as Prisma.InputJsonObject,
        activatedCard: activatesCard,
        reservedAt: now,
      },
    })

    if (activatesCard) {
      await params.tx.memberCardRecord.create({
        data: {
          userMemberCardId: userCard.id,
          orderId: params.orderId,
          redemptionId: redemption.id,
          recordType: MEMBER_CARD_RECORD_TYPE.ACTIVATED,
          timesUsed: 0,
          units: 0,
          beforeUnits: userCard.remainingUnits,
          afterUnits: userCard.remainingUnits,
          beforeRemainingMinutes: userCard.remainingMinutes,
          afterRemainingMinutes: userCard.remainingMinutes,
          beforeFrozenMinutes: userCard.frozenMinutes,
          afterFrozenMinutes: userCard.frozenMinutes,
          operatorType: params.operatorType || 'user',
          operatorId: params.operatorId || BigInt(params.userId),
          remark: 'activate member card on first reservation',
        },
      })
    }

    await params.tx.memberCardRecord.create({
      data: {
        userMemberCardId: userCard.id,
        orderId: params.orderId,
        redemptionId: redemption.id,
        recordType: MEMBER_CARD_RECORD_TYPE.FREEZE,
        timesUsed: this.unitsToLegacyTimes(userCard.card, consumeMinutes),
        units: consumeMinutes,
        beforeUnits: userCard.remainingUnits - userCard.frozenUnits,
        afterUnits: updated.remainingUnits - updated.frozenUnits,
        beforeRemainingMinutes: userCard.remainingMinutes,
        afterRemainingMinutes: updated.remainingMinutes,
        beforeFrozenMinutes: userCard.frozenMinutes,
        afterFrozenMinutes: updated.frozenMinutes,
        operatorType: params.operatorType || 'user',
        operatorId: params.operatorId || BigInt(params.userId),
        remark: params.remark || 'freeze for appointment',
      },
    })

    return {
      userCard: updated,
      consumeUnits: consumeMinutes,
      consumeMinutes,
      ruleSnapshot,
    }
  }

  async previewForOrder(params: PreviewParams) {
    const userCard = await this.findUserCardForUse(this.prisma, params.userId, params.userMemberCardId)
    if (!userCard) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card is not available', 409)
    }

    const resolvedRule = this.resolveDay49Rule(userCard, params.service)
    if (!resolvedRule.applicable) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card is not applicable to this service', 409)
    }

    const consumeMinutes = this.resolveReservationMinutes(resolvedRule, params.requestedConsumeMinutes)
    const usableMinutes = Math.max(0, userCard.remainingMinutes - userCard.frozenMinutes)
    if (usableMinutes < consumeMinutes) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card balance is insufficient', 409, {
        usableMinutes,
        consumeMinutes,
      })
    }

    return {
      memberCardId: Number(userCard.id),
      memberCardName: userCard.card.name,
      memberCardUsableMinutes: usableMinutes,
      memberCardConsumeMinutes: consumeMinutes,
    }
  }

  async releaseFrozenForOrder(
    tx: Prisma.TransactionClient,
    order: { id: bigint, memberCardId: bigint | null, memberCardConsumeUnits: number, userId: bigint },
    remark = 'release frozen member card units',
    options?: { recordOrderId?: bigint | null, operatorType?: string, operatorId?: bigint },
  ) {
    const redemption = await tx.orderRedemption.findUnique({ where: { orderId: order.id } })
    if (!redemption || redemption.state !== 'reserved') return
    await tx.$queryRaw`SELECT id FROM user_member_cards WHERE id = ${redemption.userMemberCardId} FOR UPDATE`
    const userCard = await tx.userMemberCard.findUnique({
      where: { id: redemption.userMemberCardId },
      include: { card: true },
    })
    if (!userCard) return

    const releaseMinutes = Math.min(redemption.reservedMinutes, userCard.frozenMinutes)
    if (releaseMinutes <= 0) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card frozen balance is inconsistent', 409)
    }
    const now = new Date()

    const updated = await tx.userMemberCard.update({
      where: { id: userCard.id },
      data: {
        frozenMinutes: { decrement: releaseMinutes },
        frozenUnits: { decrement: releaseMinutes },
      },
      include: { card: true },
    })

    await tx.orderRedemption.update({
      where: { id: redemption.id },
      data: {
        state: 'released',
        releasedMinutes: releaseMinutes,
        settledAt: now,
      },
    })

    await tx.memberCardRecord.create({
      data: {
        userMemberCardId: userCard.id,
        orderId: options?.recordOrderId === undefined ? order.id : options.recordOrderId,
        redemptionId: redemption.id,
        recordType: MEMBER_CARD_RECORD_TYPE.RELEASE,
        timesUsed: this.unitsToLegacyTimes(userCard.card, releaseMinutes),
        units: releaseMinutes,
        beforeUnits: userCard.remainingUnits - userCard.frozenUnits,
        afterUnits: updated.remainingUnits - updated.frozenUnits,
        beforeRemainingMinutes: userCard.remainingMinutes,
        afterRemainingMinutes: updated.remainingMinutes,
        beforeFrozenMinutes: userCard.frozenMinutes,
        afterFrozenMinutes: updated.frozenMinutes,
        operatorType: options?.operatorType || 'system',
        operatorId: options?.operatorId ?? BigInt(0),
        remark,
      },
    })
  }

  async consumeForCompletedOrder(params: CompleteParams) {
    const redemption = await params.tx.orderRedemption.findUnique({ where: { orderId: params.order.id } })
    if (!redemption || redemption.state !== 'reserved') return
    await params.tx.$queryRaw`SELECT id FROM user_member_cards WHERE id = ${redemption.userMemberCardId} FOR UPDATE`

    const userCard = await params.tx.userMemberCard.findUnique({
      where: { id: redemption.userMemberCardId },
      include: {
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
    if (!userCard) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card not found', 409)
    }

    const snapshot = this.parseRuleSnapshot(redemption.ruleSnapshot)
    const service = await this.findServiceForCard(params.tx, params.order.serviceId)
    const snapshotService = snapshot ? this.serviceFromRuleSnapshot(snapshot) : null
    const serviceForConsume = service || snapshotService
    if (!serviceForConsume) {
      throw new BusinessException(ErrorCode.SERVICE_NOT_FOUND, 'service not found', 404)
    }

    const reservedMinutes = redemption.reservedMinutes
    const plannedMinutes = snapshot?.consumeUnits || this.resolveDay49Rule(userCard, serviceForConsume).consumeMinutes
    const actualMinutes = this.resolveActualRedemptionMinutes(
      redemption.ruleSnapshot,
      params.actualMinutes,
      plannedMinutes,
    )
    if (actualMinutes > reservedMinutes) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'actual consume exceeds frozen member card units', 409, {
        reservedMinutes,
        actualMinutes,
      })
    }
    if (userCard.frozenMinutes < reservedMinutes || userCard.remainingMinutes < actualMinutes) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card balance is inconsistent', 409)
    }

    const releaseMinutes = reservedMinutes - actualMinutes
    const afterMinutes = userCard.remainingMinutes - actualMinutes
    const completesCard = afterMinutes <= 0
    const now = new Date()
    const updated = await params.tx.userMemberCard.update({
      where: { id: userCard.id },
      data: {
        remainingMinutes: { decrement: actualMinutes },
        frozenMinutes: { decrement: reservedMinutes },
        remainingUnits: { decrement: actualMinutes },
        frozenUnits: { decrement: reservedMinutes },
        remainingTimes: this.unitsToLegacyTimes(userCard.card, afterMinutes),
        ...(completesCard
          ? {
              status: USER_MEMBER_CARD_STATUS.COMPLETED,
              completedReason: USER_MEMBER_CARD_COMPLETED_REASON.USED_UP,
              completedAt: now,
            }
          : {}),
      },
      include: { card: true },
    })

    await params.tx.orderRedemption.update({
      where: { id: redemption.id },
      data: {
        state: 'consumed',
        consumedMinutes: actualMinutes,
        releasedMinutes: releaseMinutes,
        actualServiceMinutes: params.actualMinutes || null,
        settledAt: now,
      },
    })

    await params.tx.memberCardRecord.create({
      data: {
        userMemberCardId: userCard.id,
        orderId: params.order.id,
        redemptionId: redemption.id,
        recordType: MEMBER_CARD_RECORD_TYPE.CONSUME,
        timesUsed: this.unitsToLegacyTimes(userCard.card, actualMinutes),
        units: actualMinutes,
        beforeUnits: userCard.remainingUnits,
        afterUnits: updated.remainingUnits,
        beforeRemainingMinutes: userCard.remainingMinutes,
        afterRemainingMinutes: updated.remainingMinutes,
        beforeFrozenMinutes: userCard.frozenMinutes,
        afterFrozenMinutes: updated.frozenMinutes,
        operatorType: params.operatorType,
        operatorId: params.operatorId,
        remark: params.remark || 'consume after service completed',
      },
    })

    if (releaseMinutes > 0) {
      await params.tx.memberCardRecord.create({
        data: {
          userMemberCardId: userCard.id,
          orderId: params.order.id,
          redemptionId: redemption.id,
          recordType: MEMBER_CARD_RECORD_TYPE.RELEASE,
          timesUsed: this.unitsToLegacyTimes(userCard.card, releaseMinutes),
          units: releaseMinutes,
          beforeUnits: userCard.remainingUnits - reservedMinutes,
          afterUnits: updated.remainingUnits - updated.frozenUnits,
          beforeRemainingMinutes: updated.remainingMinutes,
          afterRemainingMinutes: updated.remainingMinutes,
          beforeFrozenMinutes: userCard.frozenMinutes - actualMinutes,
          afterFrozenMinutes: updated.frozenMinutes,
          operatorType: 'system',
          operatorId: BigInt(0),
          remark: 'release unused frozen units after half-duration deduction',
        },
      })
    }
  }

  calculateServiceCardType(service: {
    priceUnit: string
    durationMinutes: number | null
    cardType?: string | null
    consultationRequired?: boolean | null
  }) {
    const explicitType = service.cardType || ''
    if (service.consultationRequired || explicitType === MEMBER_CARD_TYPE.CONSULTATION || CONSULTATION_PRICE_UNITS.has(service.priceUnit)) {
      return MEMBER_CARD_TYPE.CONSULTATION
    }
    if (explicitType === NON_MEMBER_CARD_TYPE) {
      return NON_MEMBER_CARD_TYPE
    }
    if (explicitType === MEMBER_CARD_TYPE.TIME || TIME_PRICE_UNITS.has(service.priceUnit) || (service.durationMinutes || 0) > 0) {
      return MEMBER_CARD_TYPE.TIME
    }
    if (explicitType === MEMBER_CARD_TYPE.TIMES || TIMES_PRICE_UNITS.has(service.priceUnit)) {
      return MEMBER_CARD_TYPE.TIMES
    }
    return NON_MEMBER_CARD_TYPE
  }

  private async findUserCardForUse(client: MemberCardClient, userId: number, userMemberCardId: number) {
    const now = new Date()
    return client.userMemberCard.findFirst({
      where: {
        id: BigInt(userMemberCardId),
        userId: BigInt(userId),
        status: { in: [USER_MEMBER_CARD_STATUS.PENDING_ACTIVATION, USER_MEMBER_CARD_STATUS.ACTIVE] },
        availabilityState: USER_MEMBER_CARD_AVAILABILITY.AVAILABLE,
        OR: [
          {
            status: USER_MEMBER_CARD_STATUS.PENDING_ACTIVATION,
            activationDeadlineAt: { gt: now },
          },
          {
            status: USER_MEMBER_CARD_STATUS.ACTIVE,
            expireAt: { gt: now },
          },
        ],
        card: { status: 1 },
      },
      include: {
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
  }

  private findServiceForCard(client: MemberCardClient, serviceId: bigint) {
    return client.service.findFirst({
      where: { id: serviceId, status: 1, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        priceUnit: true,
        durationMinutes: true,
        cardType: true,
        consumeUnit: true,
        consultationRequired: true,
      },
    })
  }

  private resolveMemberCardRule(userCard: CardWithRules, service: ConsumeParams['service']): ResolvedMemberCardRule {
    const serviceCardType = this.calculateServiceCardType(service)
    if (!MEMBER_CARD_SERVICE_TYPES.has(serviceCardType)) {
      return { applicable: false, consumeUnits: 0, ruleSource: 'service_card_type', ruleId: null, reason: 'service does not support member card' }
    }
    if (userCard.card.cardType !== serviceCardType) {
      return { applicable: false, consumeUnits: 0, ruleSource: 'card_type_mismatch', ruleId: null, reason: 'card type mismatch' }
    }
    if (userCard.remainingUnits - userCard.frozenUnits <= 0) {
      return { applicable: false, consumeUnits: 0, ruleSource: 'balance', ruleId: null, reason: 'no available balance' }
    }

    const structuredRule = this.findStructuredServiceRule(userCard.card, service)
    if (structuredRule) {
      return {
        applicable: true,
        consumeUnits: structuredRule.consumeUnits,
        ruleSource: 'member_card_service_rule',
        ruleId: structuredRule.id,
      }
    }
    if (this.hasStructuredServiceRules(userCard.card)) {
      return { applicable: false, consumeUnits: 0, ruleSource: 'member_card_service_rule', ruleId: null, reason: 'service not in structured card rules' }
    }

    const applicableServices = this.parseApplicableServices(userCard.card.applicableServices)
    if (applicableServices.length) {
      const serviceId = String(service.id)
      const matched = applicableServices.includes(serviceId)
        || applicableServices.includes(service.code)
        || applicableServices.includes(service.name)
      if (!matched) {
        return { applicable: false, consumeUnits: 0, ruleSource: 'legacy_applicable_services', ruleId: null, reason: 'service not in legacy card rules' }
      }
    }

    const legacyRuleUnits = this.getRuleConsumeUnits(userCard.card.serviceRules, service)
    if (legacyRuleUnits) {
      return { applicable: true, consumeUnits: legacyRuleUnits, ruleSource: 'legacy_service_rules', ruleId: null }
    }

    if (userCard.card.cardType === MEMBER_CARD_TYPE.TIME) {
      return {
        applicable: true,
        consumeUnits: service.consumeUnit || service.durationMinutes || userCard.card.unitMinutes || userCard.card.minConsumeUnits || 1,
        ruleSource: service.consumeUnit ? 'service_default' : service.durationMinutes ? 'service_duration' : 'card_minimum',
        ruleId: null,
      }
    }
    if (userCard.card.cardType === MEMBER_CARD_TYPE.TIMES) {
      return {
        applicable: true,
        consumeUnits: service.consumeUnit || userCard.card.minConsumeUnits || 1,
        ruleSource: service.consumeUnit ? 'service_default' : 'card_minimum',
        ruleId: null,
      }
    }
    return { applicable: false, consumeUnits: 0, ruleSource: 'unsupported_card_type', ruleId: null }
  }

  private resolveDay49Rule(userCard: CardWithRules, service: ConsumeParams['service']) {
    const snapshot = this.asJsonRecord(userCard.planSnapshot)
    const snapshotRules = Array.isArray(snapshot?.redemptionRules) ? snapshot.redemptionRules : []
    const matched = snapshotRules.find((value) => {
      const rule = this.asJsonRecord(value)
      return rule && Number(rule.serviceId) === Number(service.id) && Number(rule.consumeMinutes) > 0
    })
    const rule = this.asJsonRecord(matched)
    if (rule) {
      const consumeMinutes = Number(rule.consumeMinutes)
      const minConsumeMinutes = Number(rule.minConsumeMinutes) || consumeMinutes
      const allowedMinutes = Array.isArray(rule.allowedMinutes)
        ? rule.allowedMinutes.map(item => Number(item)).filter(item => Number.isInteger(item) && item > 0)
        : []
      return {
        applicable: true,
        consumeMinutes,
        minConsumeMinutes,
        allowedMinutes,
        consumeMode: typeof rule.consumeMode === 'string' ? rule.consumeMode : 'fixed_minutes',
        ruleSource: 'plan_snapshot',
        ruleId: Number(rule.serviceRuleId) || null,
      }
    }

    const legacy = this.resolveMemberCardRule(userCard, service)
    return {
      applicable: legacy.applicable,
      consumeMinutes: legacy.consumeUnits,
      minConsumeMinutes: legacy.consumeUnits,
      allowedMinutes: [],
      consumeMode: 'fixed_minutes',
      ruleSource: legacy.ruleSource,
      ruleId: legacy.ruleId,
      reason: legacy.reason,
    }
  }

  private planValidityDays(userCard: CardWithRules) {
    const snapshot = this.asJsonRecord(userCard.planSnapshot)
    const value = Number(snapshot?.validityDays)
    return Number.isInteger(value) && value > 0 ? value : userCard.card.validityDays
  }

  private planActivationDeadlineDays(snapshot: Prisma.JsonValue, fallback: number) {
    const value = Number(this.asJsonRecord(snapshot)?.activationDeadlineDays)
    return Number.isInteger(value) && value > 0 ? value : fallback
  }

  private planTotalMinutes(snapshot: Prisma.JsonValue, fallback: number) {
    const value = Number(this.asJsonRecord(snapshot)?.totalMinutes)
    return Number.isInteger(value) && value > 0 ? value : fallback
  }

  private buildDay49RuleSnapshot(
    userCard: CardWithRules,
    service: ConsumeParams['service'],
    resolvedRule: {
      consumeMinutes: number
      minConsumeMinutes: number
      allowedMinutes: number[]
      consumeMode: string
      ruleSource: string
      ruleId: bigint | number | null
    },
    reservedMinutes: number,
  ) {
    return {
      userMemberCardId: Number(userCard.id),
      memberCardTemplateId: Number(userCard.cardId),
      planVersion: userCard.planVersion,
      serviceId: Number(service.id),
      serviceCode: service.code,
      serviceName: service.name,
      servicePriceUnit: service.priceUnit,
      serviceDurationMinutes: service.durationMinutes || 0,
      cardType: userCard.card.cardType,
      serviceDefaultConsumeUnit: service.consumeUnit || 0,
      consumeMode: resolvedRule.consumeMode,
      configuredConsumeMinutes: resolvedRule.consumeMinutes,
      consumeMinutes: reservedMinutes,
      minConsumeMinutes: resolvedRule.minConsumeMinutes,
      allowedMinutes: resolvedRule.allowedMinutes,
      reservedMinutes,
      ruleSource: resolvedRule.ruleSource,
      ruleId: resolvedRule.ruleId ? Number(resolvedRule.ruleId) : null,
      createdAt: new Date().toISOString(),
    }
  }

  private asJsonRecord(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, Prisma.JsonValue>
      : null
  }

  private isCardApplicable(userCard: CardWithRules, service: ConsumeParams['service']) {
    return this.resolveMemberCardRule(userCard, service).applicable
  }

  private calculateConsumeUnits(userCard: CardWithRules, service: ConsumeParams['service']) {
    return this.resolveMemberCardRule(userCard, service).consumeUnits
  }

  private hasStructuredServiceRules(card: MemberCardTemplate) {
    return Array.isArray(card.serviceRuleItems) && card.serviceRuleItems.length > 0
  }

  private findStructuredServiceRule(card: MemberCardTemplate, service: ConsumeParams['service']) {
    const rules = Array.isArray(card.serviceRuleItems) ? card.serviceRuleItems : []
    return rules.find(rule => rule.status === 1 && rule.serviceId === service.id && rule.consumeUnits > 0) || null
  }

  private buildRuleSnapshot(
    userCard: CardWithRules,
    service: ConsumeParams['service'],
    resolvedRule: ResolvedMemberCardRule,
    frozenUnits: number,
  ) {
    return {
      userMemberCardId: Number(userCard.id),
      memberCardTemplateId: Number(userCard.cardId),
      memberCardName: userCard.card.name,
      cardType: userCard.card.cardType,
      serviceId: Number(service.id),
      serviceCode: service.code,
      serviceName: service.name,
      servicePriceUnit: service.priceUnit,
      serviceDurationMinutes: service.durationMinutes || 0,
      serviceDefaultConsumeUnit: service.consumeUnit || 0,
      ruleSource: resolvedRule.ruleSource,
      ruleId: resolvedRule.ruleId ? Number(resolvedRule.ruleId) : null,
      consumeUnits: resolvedRule.consumeUnits,
      frozenUnits,
      createdAt: new Date().toISOString(),
    }
  }

  private parseRuleSnapshot(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    const consumeUnits = Number(record.consumeMinutes ?? record.consumeUnits)
    if (!Number.isInteger(consumeUnits) || consumeUnits <= 0) return null
    return {
      userMemberCardId: Number(record.userMemberCardId) || 0,
      memberCardTemplateId: Number(record.memberCardTemplateId) || 0,
      memberCardName: typeof record.memberCardName === 'string' ? record.memberCardName : '',
      cardType: typeof record.cardType === 'string' ? record.cardType : '',
      serviceId: Number(record.serviceId) || 0,
      serviceCode: typeof record.serviceCode === 'string' ? record.serviceCode : '',
      serviceName: typeof record.serviceName === 'string' ? record.serviceName : '',
      servicePriceUnit: typeof record.servicePriceUnit === 'string' ? record.servicePriceUnit : '',
      serviceDurationMinutes: Number(record.serviceDurationMinutes) || 0,
      serviceDefaultConsumeUnit: Number(record.serviceDefaultConsumeUnit) || 0,
      ruleSource: typeof record.ruleSource === 'string' ? record.ruleSource : 'snapshot',
      ruleId: Number(record.ruleId) || null,
      consumeUnits,
      frozenUnits: Number(record.reservedMinutes ?? record.frozenUnits) || consumeUnits,
    }
  }

  private serviceFromRuleSnapshot(snapshot: NonNullable<ReturnType<MemberCardsService['parseRuleSnapshot']>>): ServiceCardRule | null {
    if (!snapshot.serviceId) return null
    return {
      id: BigInt(snapshot.serviceId),
      code: snapshot.serviceCode,
      name: snapshot.serviceName,
      priceUnit: snapshot.servicePriceUnit,
      durationMinutes: snapshot.serviceDurationMinutes || null,
      cardType: snapshot.cardType,
      consumeUnit: snapshot.serviceDefaultConsumeUnit || null,
      consultationRequired: false,
    }
  }

  private calculateFinalConsumeUnits(
    userCard: CardWithRules,
    service: ConsumeParams['service'],
    order: { appointmentStartTime: Date, appointmentEndTime: Date },
    actualMinutes?: number,
    plannedUnits?: number,
  ) {
    const planned = plannedUnits || this.calculateConsumeUnits(userCard, service)
    if (userCard.card.cardType !== MEMBER_CARD_TYPE.TIME) {
      return planned
    }
    if (!Number.isInteger(actualMinutes) || !actualMinutes || actualMinutes <= 0) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'actualMinutes is required for time member card order', 400)
    }
    return actualMinutes
  }

  private resolveActualRedemptionMinutes(
    ruleSnapshot: Prisma.JsonValue,
    actualMinutes: number | undefined,
    plannedMinutes: number,
  ) {
    const snapshot = this.asJsonRecord(ruleSnapshot)
    const consumeMode = typeof snapshot?.consumeMode === 'string' ? snapshot.consumeMode : 'fixed_minutes'
    const minConsumeMinutes = Number(snapshot?.minConsumeMinutes) || plannedMinutes
    const allowedMinutes = Array.isArray(snapshot?.allowedMinutes)
      ? snapshot.allowedMinutes.map(value => Number(value)).filter(value => Number.isInteger(value) && value > 0)
      : []
    const actual = actualMinutes ?? plannedMinutes
    if (!Number.isInteger(actual) || actual <= 0) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'actualMinutes must be a positive integer', 400)
    }
    if (consumeMode === 'fixed_minutes' || consumeMode === 'half_service') {
      if (actual !== plannedMinutes) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'actualMinutes must match the fixed redemption rule', 409)
      }
      return actual
    }
    if (consumeMode === 'custom_minutes' && !allowedMinutes.includes(actual)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'actualMinutes is not an allowed custom redemption amount', 409, {
        allowedMinutes,
      })
    }
    if (actual % minConsumeMinutes !== 0) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'actualMinutes must match the configured minimum redemption unit', 409, {
        minConsumeMinutes,
      })
    }
    return actual
  }

  private reservationOptions(rule: {
    consumeMode: string
    consumeMinutes: number
    minConsumeMinutes: number
    allowedMinutes: number[]
  }) {
    if (rule.consumeMode !== 'custom_minutes') return [rule.consumeMinutes]
    const options = rule.allowedMinutes.length ? rule.allowedMinutes : [rule.consumeMinutes]
    return [...new Set(options)]
      .filter(minutes => Number.isInteger(minutes) && minutes > 0 && minutes % rule.minConsumeMinutes === 0)
      .sort((left, right) => left - right)
  }

  private resolveReservationMinutes(
    rule: {
      consumeMode: string
      consumeMinutes: number
      minConsumeMinutes: number
      allowedMinutes: number[]
    },
    requested?: number,
  ) {
    const options = this.reservationOptions(rule)
    const defaultMinutes = rule.consumeMode === 'custom_minutes' && !options.includes(rule.consumeMinutes)
      ? options[0]
      : rule.consumeMinutes
    const minutes = requested ?? defaultMinutes
    if (!Number.isInteger(minutes) || minutes <= 0) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'memberCardConsumeMinutes must be a positive integer', 400)
    }
    if (rule.consumeMode !== 'custom_minutes' && minutes !== rule.consumeMinutes) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'memberCardConsumeMinutes must match the fixed redemption rule', 409)
    }
    if (rule.consumeMode === 'custom_minutes' && !options.includes(minutes)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'memberCardConsumeMinutes is not an allowed redemption amount', 409, {
        allowedMinutes: options,
      })
    }
    return minutes
  }

  private getRuleConsumeUnits(value: Prisma.JsonValue | null, service: ConsumeParams['service']) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 0
    const record = value as Record<string, unknown>
    const candidates = [String(service.id), service.code, service.name]
    for (const key of candidates) {
      const rule = record[key]
      if (typeof rule === 'number' && Number.isInteger(rule) && rule > 0) return rule
      if (rule && typeof rule === 'object' && !Array.isArray(rule)) {
        const consumeUnits = Number((rule as Record<string, unknown>).consumeUnits)
        if (Number.isInteger(consumeUnits) && consumeUnits > 0) return consumeUnits
      }
    }
    return 0
  }

  private parseApplicableServices(value: Prisma.JsonValue) {
    if (!Array.isArray(value)) return []
    return value.map(item => String(item)).filter(Boolean)
  }

  private resolveCardTotalUnits(card: { totalUnits: number, totalTimes: number }, override?: number) {
    if (override && override > 0) return override
    if (card.totalUnits > 0) return card.totalUnits
    return Math.max(0, card.totalTimes)
  }

  private unitsToLegacyTimes(card: { cardType: string, unitMinutes: number | null }, units: number) {
    if (units <= 0) return 0
    if (card.cardType === MEMBER_CARD_TYPE.TIME && card.unitMinutes && card.unitMinutes > 0) {
      return Math.ceil(units / card.unitMinutes)
    }
    return units
  }

  private presentUserCard(
    item: CardWithRules,
    options?: {
      available?: boolean
      consumeUnits?: number
      serviceName?: string
      ruleSource?: string
      consumeMode?: string
      minConsumeMinutes?: number
      allowedMinutes?: number[]
    },
  ) {
    const usableUnits = Math.max(0, item.remainingMinutes - item.frozenMinutes)
    const planSnapshot = this.asJsonRecord(item.planSnapshot)
    const snapshotName = this.stringFromJson(planSnapshot?.name)
    const snapshotCardType = this.stringFromJson(planSnapshot?.cardType)
    const snapshotUnitName = this.stringFromJson(planSnapshot?.unitName)
    const serviceRuleList = this.presentUserCardServiceRules(item, planSnapshot)
    return {
      id: Number(item.id),
      version: item.version,
      cardId: Number(item.cardId),
      userMemberCardId: Number(item.id),
      memberCardTemplateId: Number(item.cardId),
      name: snapshotName || item.card.name,
      cardType: snapshotCardType || item.card.cardType,
      unitName: snapshotUnitName || item.card.unitName,
      unitMinutes: Number(planSnapshot?.unitMinutes) || item.card.unitMinutes || 0,
      remainingUnits: item.remainingMinutes,
      frozenUnits: item.frozenMinutes,
      usableUnits,
      remainingMinutes: item.remainingMinutes,
      frozenMinutes: item.frozenMinutes,
      usableMinutes: usableUnits,
      remainingTimes: item.remainingTimes,
      status: item.status,
      completedReason: item.completedReason || '',
      source: item.source,
      issuedAt: item.issuedAt.toISOString(),
      activationDeadlineAt: item.activationDeadlineAt?.toISOString() || null,
      activatedAt: item.activatedAt?.toISOString() || null,
      expireAt: item.expireAt?.toISOString() || null,
      availabilityState: item.availabilityState,
      available: options?.available ?? usableUnits > 0,
      consumeUnits: options?.consumeUnits || 0,
      consumeMinutes: options?.consumeUnits || 0,
      consumeMode: options?.consumeMode || '',
      minConsumeMinutes: options?.minConsumeMinutes || 0,
      allowedMinutes: options?.allowedMinutes || [],
      serviceName: options?.serviceName || '',
      effectiveRuleSource: options?.ruleSource || '',
      applicableServices: serviceRuleList.map(rule => rule.serviceCode).filter(Boolean),
      serviceRules: item.card.serviceRules || {},
      serviceRuleList,
    }
  }

  private presentUserCardServiceRules(item: CardWithRules, snapshot: Record<string, Prisma.JsonValue> | null) {
    const snapshotRules = this.publishedRedemptionRules(snapshot?.redemptionRules)
    if (!snapshotRules.length) return this.presentServiceRuleList(item.card.serviceRuleItems || [])
    const currentMap = new Map((item.card.serviceRuleItems || []).map(rule => [Number(rule.serviceId), rule]))
    return snapshotRules.map((snapshotRule, index) => {
      const serviceId = Number(snapshotRule.serviceId)
      const current = currentMap.get(serviceId)
      const base = current ? this.presentServiceRuleList([current])[0] : null
      const consumeUnits = Number(snapshotRule.consumeMinutes ?? snapshotRule.consumeUnits) || 0
      return {
        id: Number(snapshotRule.serviceRuleId) || base?.id || index + 1,
        memberCardId: Number(item.cardId),
        serviceId,
        serviceCode: this.stringFromJson(snapshotRule.serviceCode) || base?.serviceCode || '',
        serviceName: this.stringFromJson(snapshotRule.serviceName) || base?.serviceName || `服务 ${serviceId}`,
        serviceDescription: base?.serviceDescription || '',
        serviceCoverImage: base?.serviceCoverImage || '',
        serviceCoverImageDisplayUrl: base?.serviceCoverImageDisplayUrl || '',
        serviceCardType: base?.serviceCardType || 'time',
        serviceConsumeUnit: base?.serviceConsumeUnit || 0,
        serviceStatus: base?.serviceStatus || 1,
        consumeUnits,
        consumeMode: this.stringFromJson(snapshotRule.consumeMode) || 'fixed_minutes',
        minConsumeMinutes: Number(snapshotRule.minConsumeMinutes) || consumeUnits,
        allowedMinutes: this.numberArrayFromJson(snapshotRule.allowedMinutes),
        status: base?.status || 1,
        remark: this.stringFromJson(snapshotRule.remark),
      }
    })
  }

  private presentCardTemplate(card: MemberCardTemplate) {
    const totalUnits = this.resolveCardTotalUnits(card)
    return {
      id: Number(card.id),
      name: card.name,
      cardType: card.cardType,
      unitName: card.unitName,
      unitMinutes: card.unitMinutes || 0,
      totalTimes: card.totalTimes,
      totalUnits,
      price: card.price.toNumber(),
      activationDeadlineDays: card.activationDeadlineDays,
      validityDays: card.validityDays,
      currentVersion: card.currentVersion,
      allowHalfDeduct: card.allowHalfDeduct,
      minConsumeUnits: card.minConsumeUnits,
      applicableServices: this.parseApplicableServices(card.applicableServices),
      serviceRules: card.serviceRules || {},
      serviceRuleList: this.presentServiceRuleList(card.serviceRuleItems || []),
      serviceSummary: this.presentServiceSummary(card.serviceRuleItems || []),
      status: card.status,
    }
  }

  private async presentPublishedCardProducts(cards: PublishedMemberCardProduct[]) {
    const ruleRecords = cards.flatMap(card => this.publishedRedemptionRules(card.publishedVersion?.redemptionRules))
    const serviceIds = Array.from(new Set(ruleRecords.map(rule => Number(rule.serviceId)).filter(id => Number.isInteger(id) && id > 0)))
    const services = serviceIds.length
      ? await this.prisma.service.findMany({ where: { id: { in: serviceIds.map(id => BigInt(id)) } } })
      : []
    const serviceMap = new Map(services.map(service => [Number(service.id), service]))
    return cards
      .filter(card => Boolean(card.publishedVersion))
      .map(card => this.presentPublishedCardProduct(card, serviceMap))
  }

  private presentPublishedCardProduct(
    card: PublishedMemberCardProduct,
    serviceMap: Map<number, PublicMemberCardService>,
  ) {
    const version = card.publishedVersion!
    const snapshot = this.asJsonRecord(version.snapshot)
    const rules = this.publishedRedemptionRules(version.redemptionRules)
    const serviceRuleList = rules.map((rule, index) => {
      const serviceId = Number(rule.serviceId)
      const service = serviceMap.get(serviceId)
      return {
        id: Number(rule.serviceRuleId) || index + 1,
        memberCardId: Number(card.id),
        serviceId,
        serviceCode: service?.code || this.stringFromJson(rule.serviceCode),
        serviceName: service?.name || this.stringFromJson(rule.serviceName) || `服务 ${serviceId}`,
        serviceDescription: service?.description || '',
        serviceCoverImage: service?.coverImage || '',
        serviceCoverImageDisplayUrl: this.storage.signNullableUrl(service?.coverImage) || service?.coverImage || '',
        serviceCardType: service?.cardType || 'time',
        serviceConsumeUnit: service?.consumeUnit || 0,
        serviceDurationMinutes: service?.durationMinutes || Number(rule.serviceDurationMinutes) || 0,
        serviceStatus: service?.status || 0,
        consumeUnits: Number(rule.consumeMinutes ?? rule.consumeUnits) || 0,
        consumeMode: this.stringFromJson(rule.consumeMode) || 'fixed_minutes',
        minConsumeMinutes: Number(rule.minConsumeMinutes) || Number(rule.consumeMinutes ?? rule.consumeUnits) || 0,
        allowedMinutes: this.numberArrayFromJson(rule.allowedMinutes),
        status: service?.status === 1 ? 1 : 0,
        remark: this.stringFromJson(rule.remark),
      }
    })
    const names = serviceRuleList.filter(rule => rule.status === 1).map(rule => rule.serviceName)
    const description = version.description || this.stringFromJson(snapshot?.description)
    const detail = version.detail || this.stringFromJson(snapshot?.detail)
    const coverImage = version.coverImage || this.stringFromJson(snapshot?.coverImage)
    const totalMinutes = version.totalMinutes || Number(snapshot?.totalMinutes) || card.totalUnits
    return {
      id: Number(card.id),
      code: version.productCode || this.stringFromJson(snapshot?.code) || card.code,
      name: version.productName || this.stringFromJson(snapshot?.name) || card.name,
      description,
      detail,
      coverImage,
      coverImageDisplayUrl: this.storage.signNullableUrl(coverImage) || coverImage,
      purchaseNotice: version.purchaseNotice || this.stringFromJson(snapshot?.purchaseNotice),
      cardType: this.stringFromJson(snapshot?.cardType) || MEMBER_CARD_TYPE.TIME,
      unitName: this.stringFromJson(snapshot?.unitName) || '分钟',
      unitMinutes: Number(snapshot?.unitMinutes) || 1,
      totalTimes: totalMinutes,
      totalUnits: totalMinutes,
      price: version.price.toNumber(),
      activationDeadlineDays: version.activationDeadlineDays,
      validityDays: version.validityDays,
      currentVersion: version.version,
      publishedVersionId: Number(version.id),
      allowHalfDeduct: serviceRuleList.some(rule => rule.consumeMode === 'half_service'),
      minConsumeUnits: Math.min(...serviceRuleList.map(rule => rule.minConsumeMinutes).filter(Boolean), totalMinutes),
      applicableServices: serviceRuleList.map(rule => rule.serviceCode).filter(Boolean),
      serviceRules: {},
      serviceRuleList,
      serviceSummary: names.length > 2 ? `${names.slice(0, 2).join('、')}等 ${names.length} 项服务` : names.join('、'),
      sortOrder: card.sortOrder,
      status: card.status,
    }
  }

  private publishedRedemptionRules(value: Prisma.JsonValue | null | undefined) {
    return Array.isArray(value)
      ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as Array<Record<string, Prisma.JsonValue>>
      : []
  }

  private numberArrayFromJson(value: Prisma.JsonValue | undefined) {
    return Array.isArray(value)
      ? value.map(item => Number(item)).filter(item => Number.isInteger(item) && item > 0)
      : []
  }

  private stringFromJson(value: Prisma.JsonValue | undefined) {
    return typeof value === 'string' ? value : ''
  }

  private presentServiceRuleList(rules: CardServiceRuleWithService[]) {
    return rules.map(rule => ({
      id: Number(rule.id),
      memberCardId: Number(rule.memberCardId),
      serviceId: Number(rule.serviceId),
      serviceCode: rule.service.code,
      serviceName: rule.service.name,
      serviceDescription: rule.service.description || '',
      serviceCoverImage: rule.service.coverImage || '',
      serviceCoverImageDisplayUrl: this.storage.signNullableUrl(rule.service.coverImage) || rule.service.coverImage || '',
      serviceCardType: rule.service.cardType,
      serviceConsumeUnit: rule.service.consumeUnit || 0,
      serviceStatus: rule.service.status,
      consumeUnits: rule.consumeUnits,
      consumeMode: rule.consumeMode,
      minConsumeMinutes: rule.minConsumeMinutes,
      allowedMinutes: rule.allowedMinutes || [],
      status: rule.status,
      remark: rule.remark || '',
    }))
  }

  private presentServiceSummary(rules: CardServiceRuleWithService[]) {
    const names = [...new Set(rules
      .filter(rule => rule.status === 1 && rule.service.status === 1)
      .map(rule => rule.service.name.trim())
      .filter(Boolean))]
    if (!names.length) return '适用服务以下单时可选项目为准'
    return names.length > 2 ? `${names.slice(0, 2).join('、')}等 ${names.length} 项服务` : names.join('、')
  }

  private async ensureCurrentPlanVersion(client: MemberCardClient, cardId: bigint) {
    const card = await client.memberCard.findUnique({
      where: { id: cardId },
      include: {
        publishedVersion: true,
      },
    })
    if (!card) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'member card not found', 404)
    }
    if (card.publishedVersion) return card.publishedVersion
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card product must be published first', 409)
  }

  private buildPurchaseSnapshot(card: Prisma.MemberCardGetPayload<Record<string, never>>, totalUnits: number) {
    return {
      id: Number(card.id),
      code: `member_card_${Number(card.id)}`,
      categoryId: 0,
      name: card.name,
      description: '会员卡购买',
      coverImage: '',
      basePrice: card.price.toNumber(),
      priceUnit: '张',
      durationMinutes: 0,
      cardType: card.cardType,
      unitName: card.unitName,
      unitMinutes: card.unitMinutes || 0,
      totalUnits,
      totalTimes: card.totalTimes,
      activationDeadlineDays: card.activationDeadlineDays,
      validityDays: card.validityDays,
      consultationRequired: false,
      status: card.status,
      sortOrder: 0,
      orderType: ORDER_TYPE.MEMBER_CARD_PURCHASE,
    }
  }

  private buildPublishedPurchaseSnapshot(
    card: Prisma.MemberCardGetPayload<Record<string, never>>,
    version: Prisma.MemberCardPlanVersionGetPayload<Record<string, never>>,
  ) {
    const snapshot = this.asJsonRecord(version.snapshot)
    return {
      ...(snapshot || {}),
      id: Number(card.id),
      code: version.productCode || card.code,
      categoryId: 0,
      name: version.productName || card.name,
      description: version.description || '',
      coverImage: version.coverImage || '',
      basePrice: version.price.toNumber(),
      priceUnit: '张',
      durationMinutes: 0,
      cardType: this.stringFromJson(snapshot?.cardType) || MEMBER_CARD_TYPE.TIME,
      unitName: this.stringFromJson(snapshot?.unitName) || '分钟',
      unitMinutes: Number(snapshot?.unitMinutes) || 1,
      totalUnits: version.totalMinutes,
      totalTimes: version.totalMinutes,
      activationDeadlineDays: version.activationDeadlineDays,
      validityDays: version.validityDays,
      consultationRequired: false,
      status: card.status,
      sortOrder: card.sortOrder,
      orderType: ORDER_TYPE.MEMBER_CARD_PURCHASE,
      memberCardPlanVersion: version.version,
      memberCardPlanVersionId: Number(version.id),
    }
  }

  private async ensurePurchaseService(client: MemberCardClient) {
    const existing = await client.service.findFirst({
      where: { code: MEMBER_CARD_PURCHASE_SERVICE_CODE },
    })
    if (existing) return existing

    let category = await client.serviceCategory.findFirst({
      where: { name: '会员卡' },
      orderBy: { id: 'asc' },
    })
    if (!category) {
      category = await client.serviceCategory.create({
        data: {
          name: '会员卡',
          icon: 'card',
          sortOrder: 999,
          status: 1,
        },
      })
    }

    return client.service.create({
      data: {
        code: MEMBER_CARD_PURCHASE_SERVICE_CODE,
        categoryId: category.id,
        name: '会员卡购买',
        description: '系统占位服务，用于会员卡购买订单支付',
        basePrice: new Prisma.Decimal(0),
        minPrice: new Prisma.Decimal(0),
        priceUnit: '张',
        cardType: 'none',
        consultationRequired: false,
        sortOrder: 9999,
        status: 1,
      },
    })
  }

  private createOrderNo() {
    const now = new Date()
    const timestamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('')
    return `MC${timestamp}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`
  }

  private buildGrantRemark(
    remark: string | undefined,
    meta: { source: string, offlinePaymentAmount?: number, paymentChannel?: string, paymentRemark?: string },
  ) {
    const parts = [remark || 'admin grant member card', `source=${meta.source}`]
    if (meta.offlinePaymentAmount !== undefined) parts.push(`offlineAmount=${meta.offlinePaymentAmount}`)
    if (meta.paymentChannel) parts.push(`paymentChannel=${meta.paymentChannel}`)
    if (meta.paymentRemark) parts.push(`paymentRemark=${meta.paymentRemark}`)
    return parts.join('; ').slice(0, 256)
  }

  private normalizeSource(source?: string) {
    const value = (source || 'miniapp').trim()
    return /^[a-zA-Z0-9_-]{1,16}$/.test(value) ? value : 'miniapp'
  }

  private normalizeAdminPurchasePaymentMode(paymentMode?: string) {
    const value = (paymentMode || 'offline_paid').trim()
    if (value === 'offline_paid' || value === 'unpaid') return value
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'paymentMode must be offline_paid or unpaid', 400)
  }

  private parseAdminPurchaseDate(value: string | undefined, field: string) {
    if (!value) return new Date()
    const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'))
    if (Number.isNaN(date.getTime())) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, `invalid ${field}`, 400)
    }
    return date
  }

  private createOfflinePaymentNo(orderNo: string) {
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0')
    return `OF${Date.now()}${random}`.slice(0, 64) || `OF${orderNo}`
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date)
    result.setDate(result.getDate() + days)
    return result
  }
}
