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
import { UsersService } from '../users/users.service'
import {
  MEMBER_CARD_RECORD_TYPE,
  MEMBER_CARD_TYPE,
  USER_MEMBER_CARD_STATUS,
} from './constants/member-card'
import type { AdminCreateMemberCardPurchaseDto, GrantMemberCardDto } from './dto/grant-member-card.dto'

type CardWithTemplate = Prisma.UserMemberCardGetPayload<{ include: { card: true } }>
type MemberCardClient = PrismaService | Prisma.TransactionClient
type CardServiceRuleWithService = Prisma.MemberCardServiceRuleGetPayload<{ include: { service: true } }>
type MemberCardTemplate = Prisma.MemberCardGetPayload<Record<string, never>> & {
  serviceRuleItems?: CardServiceRuleWithService[]
}
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

interface FreezeParams extends ConsumeParams {
  tx: Prisma.TransactionClient
  orderId: bigint
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
    @Inject(UsersService) private readonly users: UsersService,
  ) {}

  async listUserCards(userId: number, serviceId?: number) {
    const now = new Date()
    const cards = await this.prisma.userMemberCard.findMany({
      where: {
        userId: BigInt(userId),
        status: USER_MEMBER_CARD_STATUS.ACTIVE,
        expireAt: { gt: now },
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
      orderBy: [{ expireAt: 'asc' }, { id: 'desc' }],
    })

    let service: ServiceCardRule | null = null
    if (serviceId) {
      service = await this.findServiceForCard(this.prisma, BigInt(serviceId))
      if (!service) return []
    }

    return cards
      .map((item) => {
        const resolved = service ? this.resolveMemberCardRule(item, service) : null
        const available = service ? Boolean(resolved?.applicable) : item.remainingUnits > 0
        const consumeUnits = service && resolved?.applicable ? resolved.consumeUnits : 0
        return this.presentUserCard(item, {
          available,
          consumeUnits,
          serviceName: service?.name || '',
          ruleSource: resolved?.ruleSource || '',
        })
      })
      .filter(item => !serviceId || item.available)
  }

  async listPurchasableCards() {
    const cards = await this.prisma.memberCard.findMany({
      where: {
        status: 1,
        cardType: { not: MEMBER_CARD_TYPE.CONSULTATION },
      },
      include: {
        serviceRuleItems: {
          where: { status: 1 },
          include: { service: true },
          orderBy: [{ serviceId: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ price: 'asc' }, { id: 'asc' }],
    })

    return cards.map(card => this.presentCardTemplate(card))
  }

  async getPurchasableCardDetail(cardId: number) {
    const card = await this.prisma.memberCard.findFirst({
      where: {
        id: BigInt(cardId),
        status: 1,
        cardType: { not: MEMBER_CARD_TYPE.CONSULTATION },
      },
      include: {
        serviceRuleItems: {
          where: { status: 1 },
          include: { service: true },
          orderBy: [{ serviceId: 'asc' }, { id: 'asc' }],
        },
      },
    })
    if (!card) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'member card not found', 404)
    return this.presentCardTemplate(card)
  }

  async createPurchaseOrder(
    userId: number,
    dto: { cardId: number, remark?: string, source?: string, promotionKey?: string, campaignId?: string },
    requestId?: string,
  ) {
    const [user, card] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: BigInt(userId), deletedAt: null, status: 1 } }),
      this.prisma.memberCard.findFirst({ where: { id: BigInt(dto.cardId), status: 1 } }),
    ])
    if (!user) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'user not found', 404)
    if (!card) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'member card not found', 404)
    if (card.cardType === MEMBER_CARD_TYPE.CONSULTATION) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'consultation card cannot be purchased directly', 400)
    }

    const purchaseService = await this.ensurePurchaseService(this.prisma)
    const totalUnits = this.resolveCardTotalUnits(card)
    const now = new Date()
    const serviceSnapshot = this.buildPurchaseSnapshot(card, totalUnits)
    const addressSnapshot = {
      contactName: user.nickname || '',
      contactPhone: user.phone || '',
      formattedAddress: '会员卡在线购买',
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNo: this.createOrderNo(),
          userId: BigInt(userId),
          serviceId: purchaseService.id,
          orderType: ORDER_TYPE.MEMBER_CARD_PURCHASE,
          status: 'pending_payment',
          serviceSnapshot: serviceSnapshot as Prisma.InputJsonObject,
          addressSnapshot: addressSnapshot as Prisma.InputJsonObject,
          appointmentStartTime: now,
          appointmentEndTime: now,
          originalAmount: card.price,
          discountAmount: 0,
          payableAmount: card.price,
          paidAmount: 0,
          purchaseCardId: card.id,
          memberCardConsumeUnits: totalUnits,
          remark: dto.remark || null,
          source: this.normalizeSource(dto.source),
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

    return {
      id: Number(order.id),
      orderNo: order.orderNo,
      orderType: order.orderType,
      status: order.status,
      card: this.presentCardTemplate(card),
      totalAmount: card.price.toNumber(),
      payableAmount: card.price.toNumber(),
      createdAt: order.createdAt.toISOString(),
    }
  }

  async createAdminPurchaseOrder(dto: AdminCreateMemberCardPurchaseDto, context: AdminContext) {
    const [user, card] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: BigInt(dto.userId), deletedAt: null, status: 1 } }),
      this.prisma.memberCard.findFirst({ where: { id: BigInt(dto.cardId), status: 1 } }),
    ])
    if (!user) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'user not found', 404)
    if (!card) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'member card not found', 404)
    if (card.cardType === MEMBER_CARD_TYPE.CONSULTATION) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'consultation card cannot be purchased directly', 400)
    }

    const paymentMode = this.normalizeAdminPurchasePaymentMode(dto.paymentMode)
    const source = this.normalizeSource(dto.source || 'offline')
    let payableAmount = new Prisma.Decimal(dto.payableAmount ?? card.price.toNumber())
    if (payableAmount.lessThan(0)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'payable amount must be non-negative', 400)
    }
    const purchaseService = await this.ensurePurchaseService(this.prisma)
    let discountAmount = card.price.greaterThan(payableAmount)
      ? card.price.sub(payableAmount)
      : new Prisma.Decimal(0)
    if (dto.couponId) {
      const couponPreview = await this.coupons.previewDiscount({
        userId: user.id,
        couponId: dto.couponId,
        serviceId: purchaseService.id,
        amount: card.price,
      })
      discountAmount = couponPreview.discountAmount
      payableAmount = couponPreview.payableAmount
    }
    else if (!payableAmount.equals(card.price) && !dto.adminRemark) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'adminRemark is required when payable amount differs from card price', 400)
    }
    if (paymentMode === 'unpaid' && payableAmount.lessThanOrEqualTo(0)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'zero payable member card purchase cannot wait for offline payment', 400)
    }

    const totalUnits = this.resolveCardTotalUnits(card)
    const now = new Date()
    const serviceSnapshot = this.buildPurchaseSnapshot(card, totalUnits)
    const addressSnapshot = {
      contactName: user.nickname || '',
      contactPhone: user.phone || '',
      formattedAddress: source === 'offline' ? '线下会员卡购买' : '后台会员卡购买',
    }
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
          addressSnapshot: addressSnapshot as Prisma.InputJsonObject,
          appointmentStartTime: now,
          appointmentEndTime: now,
          originalAmount: card.price,
          discountAmount,
          payableAmount,
          paidAmount: 0,
          purchaseCardId: card.id,
          memberCardConsumeUnits: totalUnits,
          remark: dto.remark || null,
          adminRemark: dto.adminRemark || null,
          source,
        },
      })

      if (dto.couponId) {
        const couponPreview = await this.coupons.lockCouponForOrder({
          tx,
          userId: user.id,
          couponId: dto.couponId,
          serviceId: purchaseService.id,
          amount: card.price,
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
        await this.users.ensureEarnedPointsForPaidOrder(tx, { ...order, payableAmount }, payableAmount)

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
      serviceName: card.name,
      appointmentStartTime: created.appointmentStartTime.toISOString(),
      appointmentEndTime: created.appointmentEndTime.toISOString(),
      appointmentTime: created.appointmentStartTime.toISOString(),
      addressText: addressSnapshot.formattedAddress,
      totalAmount: card.price.toNumber(),
      originalAmount: card.price.toNumber(),
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
    if (order.grantedUserMemberCardId) {
      return tx.userMemberCard.findUnique({
        where: { id: order.grantedUserMemberCardId },
        include: { card: true },
      })
    }

    const cardId = order.purchaseCardId || order.memberCardId
    if (!cardId) return null

    const existingGrant = await tx.memberCardRecord.findFirst({
      where: {
        orderId: order.id,
        recordType: MEMBER_CARD_RECORD_TYPE.GRANT,
      },
      include: { userMemberCard: { include: { card: true } } },
    })
    if (existingGrant) {
      await tx.order.update({
        where: { id: order.id },
        data: {
          grantedUserMemberCardId: existingGrant.userMemberCard.id,
          purchaseCardId: existingGrant.userMemberCard.cardId,
        },
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

    const totalUnits = this.resolveCardTotalUnits(card, order.memberCardConsumeUnits)
    const userCard = await tx.userMemberCard.create({
      data: {
        cardId: card.id,
        userId: order.userId,
        remainingTimes: this.unitsToLegacyTimes(card, totalUnits),
        remainingUnits: totalUnits,
        frozenUnits: 0,
        status: USER_MEMBER_CARD_STATUS.ACTIVE,
        source: 'purchase',
        expireAt: this.addDays(new Date(), card.validityDays),
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
        operatorType,
        operatorId,
        remark: 'grant after member card purchase paid',
      },
    })

    await tx.order.update({
      where: { id: order.id },
      data: {
        grantedUserMemberCardId: userCard.id,
        purchaseCardId: card.id,
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

    const userCard = order.grantedUserMemberCardId
      ? await tx.userMemberCard.findUnique({
        where: { id: order.grantedUserMemberCardId },
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
    if (existingRevoke || card.status === USER_MEMBER_CARD_STATUS.REFUNDED) {
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
        memberCardId: card.id,
        id: { not: order.id },
        status: { notIn: [ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED] },
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
        status: USER_MEMBER_CARD_STATUS.REFUNDED,
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
      this.prisma.memberCard.findFirst({ where: { id: BigInt(dto.cardId), status: 1 } }),
    ])
    if (!user) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'user not found', 404)
    if (!card) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'member card not found', 404)
    if (card.cardType === MEMBER_CARD_TYPE.CONSULTATION) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'consultation card cannot be granted as countable benefit', 400)
    }

    const totalUnits = this.resolveCardTotalUnits(card, dto.totalUnits)
    const expireAt = this.addDays(new Date(), dto.validityDays || card.validityDays)
    const source = this.normalizeSource(dto.source || 'admin')
    const paymentChannel = this.normalizeSource(dto.paymentChannel || (source === 'offline' ? 'offline' : 'admin'))
    const grantRemark = this.buildGrantRemark(dto.remark, {
      source,
      offlinePaymentAmount: dto.offlinePaymentAmount,
      paymentChannel,
      paymentRemark: dto.paymentRemark,
    })

    const created = await this.prisma.$transaction(async (tx) => {
      const userCard = await tx.userMemberCard.create({
        data: {
          cardId: card.id,
          userId: user.id,
          remainingTimes: this.unitsToLegacyTimes(card, totalUnits),
          remainingUnits: totalUnits,
          frozenUnits: 0,
          status: USER_MEMBER_CARD_STATUS.ACTIVE,
          source,
          expireAt,
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
          expireAt: expireAt.toISOString(),
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
    const userCard = await this.findUserCardForUse(params.tx, params.userId, params.userMemberCardId)
    if (!userCard) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card is not available', 409)
    }
    const resolvedRule = this.resolveMemberCardRule(userCard, params.service)
    if (!resolvedRule.applicable) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card is not applicable to this service', 409)
    }

    const consumeUnits = resolvedRule.consumeUnits
    const availableUnits = userCard.remainingUnits - userCard.frozenUnits
    if (consumeUnits < 1 || availableUnits < consumeUnits) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card balance is insufficient', 409, {
        availableUnits,
        consumeUnits,
      })
    }

    const updated = await params.tx.userMemberCard.update({
      where: { id: userCard.id },
      data: {
        frozenUnits: { increment: consumeUnits },
      },
      include: { card: true },
    })

    await params.tx.memberCardRecord.create({
      data: {
        userMemberCardId: userCard.id,
        orderId: params.orderId,
        recordType: MEMBER_CARD_RECORD_TYPE.FREEZE,
        timesUsed: this.unitsToLegacyTimes(userCard.card, consumeUnits),
        units: consumeUnits,
        beforeUnits: userCard.remainingUnits - userCard.frozenUnits,
        afterUnits: updated.remainingUnits - updated.frozenUnits,
        operatorType: params.operatorType || 'user',
        operatorId: params.operatorId || BigInt(params.userId),
        remark: params.remark || 'freeze for appointment',
      },
    })

    return {
      userCard: updated,
      consumeUnits,
      ruleSnapshot: this.buildRuleSnapshot(userCard, params.service, resolvedRule, consumeUnits),
    }
  }

  async releaseFrozenForOrder(
    tx: Prisma.TransactionClient,
    order: { id: bigint, memberCardId: bigint | null, memberCardConsumeUnits: number, userId: bigint },
    remark = 'release frozen member card units',
    options?: { recordOrderId?: bigint | null, operatorType?: string, operatorId?: bigint },
  ) {
    if (!order.memberCardId || order.memberCardConsumeUnits <= 0) return
    const userCard = await tx.userMemberCard.findUnique({
      where: { id: order.memberCardId },
      include: { card: true },
    })
    if (!userCard) return

    const releaseUnits = Math.min(order.memberCardConsumeUnits, userCard.frozenUnits)
    if (releaseUnits <= 0) return

    const updated = await tx.userMemberCard.update({
      where: { id: userCard.id },
      data: {
        frozenUnits: { decrement: releaseUnits },
      },
      include: { card: true },
    })

    await tx.memberCardRecord.create({
      data: {
        userMemberCardId: userCard.id,
        orderId: options?.recordOrderId === undefined ? order.id : options.recordOrderId,
        recordType: MEMBER_CARD_RECORD_TYPE.RELEASE,
        timesUsed: this.unitsToLegacyTimes(userCard.card, releaseUnits),
        units: releaseUnits,
        beforeUnits: userCard.remainingUnits - userCard.frozenUnits,
        afterUnits: updated.remainingUnits - updated.frozenUnits,
        operatorType: options?.operatorType || 'system',
        operatorId: options?.operatorId ?? BigInt(0),
        remark,
      },
    })
  }

  async consumeForCompletedOrder(params: CompleteParams) {
    if (!params.order.memberCardId || params.order.memberCardConsumeUnits <= 0) return

    const userCard = await params.tx.userMemberCard.findUnique({
      where: { id: params.order.memberCardId },
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

    const snapshot = this.parseRuleSnapshot(params.order.memberCardRuleSnapshot)
    const service = await this.findServiceForCard(params.tx, params.order.serviceId)
    const snapshotService = snapshot ? this.serviceFromRuleSnapshot(snapshot) : null
    const serviceForConsume = service || snapshotService
    if (!serviceForConsume) {
      throw new BusinessException(ErrorCode.SERVICE_NOT_FOUND, 'service not found', 404)
    }

    const reservedUnits = params.order.memberCardConsumeUnits
    const plannedUnits = snapshot?.consumeUnits || this.resolveMemberCardRule(userCard, serviceForConsume).consumeUnits
    const actualUnits = this.calculateFinalConsumeUnits(userCard, serviceForConsume, params.order, params.actualMinutes, plannedUnits)
    if (actualUnits > reservedUnits) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'actual consume exceeds frozen member card units', 409, {
        reservedUnits,
        actualUnits,
      })
    }
    if (userCard.frozenUnits < reservedUnits || userCard.remainingUnits < actualUnits) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card balance is inconsistent', 409)
    }

    const returnUnits = reservedUnits - actualUnits
    const afterUnits = userCard.remainingUnits - actualUnits
    const nextStatus = afterUnits <= 0 ? USER_MEMBER_CARD_STATUS.USED_UP : userCard.status
    const updated = await params.tx.userMemberCard.update({
      where: { id: userCard.id },
      data: {
        remainingUnits: { decrement: actualUnits },
        frozenUnits: { decrement: reservedUnits },
        remainingTimes: this.unitsToLegacyTimes(userCard.card, afterUnits),
        status: nextStatus,
      },
      include: { card: true },
    })

    await params.tx.memberCardRecord.create({
      data: {
        userMemberCardId: userCard.id,
        orderId: params.order.id,
        recordType: MEMBER_CARD_RECORD_TYPE.CONSUME,
        timesUsed: this.unitsToLegacyTimes(userCard.card, actualUnits),
        units: actualUnits,
        beforeUnits: userCard.remainingUnits,
        afterUnits: updated.remainingUnits,
        operatorType: params.operatorType,
        operatorId: params.operatorId,
        remark: params.remark || 'consume after service completed',
      },
    })

    if (returnUnits > 0) {
      await params.tx.memberCardRecord.create({
        data: {
          userMemberCardId: userCard.id,
          orderId: params.order.id,
          recordType: MEMBER_CARD_RECORD_TYPE.RELEASE,
          timesUsed: this.unitsToLegacyTimes(userCard.card, returnUnits),
          units: returnUnits,
          beforeUnits: userCard.remainingUnits - reservedUnits,
          afterUnits: updated.remainingUnits - updated.frozenUnits,
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
    return client.userMemberCard.findFirst({
      where: {
        id: BigInt(userMemberCardId),
        userId: BigInt(userId),
        status: USER_MEMBER_CARD_STATUS.ACTIVE,
        expireAt: { gt: new Date() },
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
    const consumeUnits = Number(record.consumeUnits)
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
      frozenUnits: Number(record.frozenUnits) || consumeUnits,
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
    options?: { available?: boolean, consumeUnits?: number, serviceName?: string, ruleSource?: string },
  ) {
    const usableUnits = Math.max(0, item.remainingUnits - item.frozenUnits)
    return {
      id: Number(item.id),
      cardId: Number(item.cardId),
      userMemberCardId: Number(item.id),
      memberCardTemplateId: Number(item.cardId),
      name: item.card.name,
      cardType: item.card.cardType,
      unitName: item.card.unitName,
      unitMinutes: item.card.unitMinutes || 0,
      remainingUnits: item.remainingUnits,
      frozenUnits: item.frozenUnits,
      usableUnits,
      remainingTimes: item.remainingTimes,
      status: item.status,
      source: item.source,
      expireAt: item.expireAt.toISOString(),
      available: options?.available ?? usableUnits > 0,
      consumeUnits: options?.consumeUnits || 0,
      serviceName: options?.serviceName || '',
      effectiveRuleSource: options?.ruleSource || '',
      applicableServices: this.parseApplicableServices(item.card.applicableServices),
      serviceRules: item.card.serviceRules || {},
      serviceRuleList: this.presentServiceRuleList(item.card.serviceRuleItems || []),
    }
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
      validityDays: card.validityDays,
      allowHalfDeduct: card.allowHalfDeduct,
      minConsumeUnits: card.minConsumeUnits,
      applicableServices: this.parseApplicableServices(card.applicableServices),
      serviceRules: card.serviceRules || {},
      serviceRuleList: this.presentServiceRuleList(card.serviceRuleItems || []),
      status: card.status,
    }
  }

  private presentServiceRuleList(rules: CardServiceRuleWithService[]) {
    return rules.map(rule => ({
      id: Number(rule.id),
      memberCardId: Number(rule.memberCardId),
      serviceId: Number(rule.serviceId),
      serviceCode: rule.service.code,
      serviceName: rule.service.name,
      serviceCardType: rule.service.cardType,
      serviceConsumeUnit: rule.service.consumeUnit || 0,
      serviceStatus: rule.service.status,
      consumeUnits: rule.consumeUnits,
      status: rule.status,
      remark: rule.remark || '',
    }))
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
      validityDays: card.validityDays,
      consultationRequired: false,
      status: card.status,
      sortOrder: 0,
      orderType: ORDER_TYPE.MEMBER_CARD_PURCHASE,
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
