import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AdminAuditService } from '../audit-log/admin-audit.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { PrismaService } from '../prisma/prisma.service'
import { ORDER_STATUS } from '../orders/constants/order-status'
import { ORDER_TYPE } from '../orders/constants/order-type'
import {
  MEMBER_CARD_RECORD_TYPE,
  MEMBER_CARD_TYPE,
  USER_MEMBER_CARD_STATUS,
} from './constants/member-card'
import type { GrantMemberCardDto } from './dto/grant-member-card.dto'

type CardWithTemplate = Prisma.UserMemberCardGetPayload<{ include: { card: true } }>
type MemberCardClient = PrismaService | Prisma.TransactionClient
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
}

interface CompleteParams {
  tx: Prisma.TransactionClient
  order: {
    id: bigint
    userId: bigint
    memberCardId: bigint | null
    memberCardConsumeUnits: number
    appointmentStartTime: Date
    appointmentEndTime: Date
    serviceId: bigint
  }
  actualMinutes?: number
  operatorType: string
  operatorId: bigint
  remark?: string
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
      include: { card: true },
      orderBy: [{ expireAt: 'asc' }, { id: 'desc' }],
    })

    let service: ServiceCardRule | null = null
    if (serviceId) {
      service = await this.findServiceForCard(this.prisma, BigInt(serviceId))
      if (!service) return []
    }

    return cards
      .map((item) => {
        const available = service ? this.isCardApplicable(item, service) : item.remainingUnits > 0
        const consumeUnits = service && available ? this.calculateConsumeUnits(item, service) : 0
        return this.presentUserCard(item, {
          available,
          consumeUnits,
          serviceName: service?.name || '',
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

    const created = await this.prisma.$transaction(async (tx) => {
      const userCard = await tx.userMemberCard.create({
        data: {
          cardId: card.id,
          userId: user.id,
          remainingTimes: this.unitsToLegacyTimes(card, totalUnits),
          remainingUnits: totalUnits,
          frozenUnits: 0,
          status: USER_MEMBER_CARD_STATUS.ACTIVE,
          source: 'admin',
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
          remark: dto.remark || 'admin grant member card',
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
    if (!this.isCardApplicable(userCard, params.service)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card is not applicable to this service', 409)
    }

    const consumeUnits = this.calculateConsumeUnits(userCard, params.service)
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
        operatorType: 'user',
        operatorId: BigInt(params.userId),
        remark: 'freeze for appointment',
      },
    })

    return {
      userCard: updated,
      consumeUnits,
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
      include: { card: true },
    })
    if (!userCard) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card not found', 409)
    }

    const service = await this.findServiceForCard(params.tx, params.order.serviceId)
    if (!service) {
      throw new BusinessException(ErrorCode.SERVICE_NOT_FOUND, 'service not found', 404)
    }

    const reservedUnits = params.order.memberCardConsumeUnits
    const actualUnits = this.calculateFinalConsumeUnits(userCard, service, params.order, params.actualMinutes)
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
      include: { card: true },
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

  private isCardApplicable(userCard: CardWithTemplate, service: ConsumeParams['service']) {
    const serviceCardType = this.calculateServiceCardType(service)
    if (!MEMBER_CARD_SERVICE_TYPES.has(serviceCardType)) return false
    if (userCard.card.cardType !== serviceCardType) return false
    if (userCard.remainingUnits - userCard.frozenUnits <= 0) return false

    const applicableServices = this.parseApplicableServices(userCard.card.applicableServices)
    if (!applicableServices.length) return true
    const serviceId = String(service.id)
    return applicableServices.includes(serviceId)
      || applicableServices.includes(service.code)
      || applicableServices.includes(service.name)
  }

  private calculateConsumeUnits(userCard: CardWithTemplate, service: ConsumeParams['service']) {
    const ruleUnits = this.getRuleConsumeUnits(userCard.card.serviceRules, service)
    if (ruleUnits) return ruleUnits

    if (userCard.card.cardType === MEMBER_CARD_TYPE.TIME) {
      return service.consumeUnit || service.durationMinutes || userCard.card.unitMinutes || userCard.card.minConsumeUnits || 1
    }
    if (userCard.card.cardType === MEMBER_CARD_TYPE.TIMES) {
      return service.consumeUnit || userCard.card.minConsumeUnits || 1
    }
    return 0
  }

  private calculateFinalConsumeUnits(
    userCard: CardWithTemplate,
    service: ConsumeParams['service'],
    order: { appointmentStartTime: Date, appointmentEndTime: Date },
    actualMinutes?: number,
  ) {
    const plannedUnits = this.calculateConsumeUnits(userCard, service)
    if (userCard.card.cardType !== MEMBER_CARD_TYPE.TIME || !userCard.card.allowHalfDeduct) {
      return plannedUnits
    }

    const plannedMinutes = service.durationMinutes
      || Math.max(1, Math.round((order.appointmentEndTime.getTime() - order.appointmentStartTime.getTime()) / 60000))
    const usedMinutes = actualMinutes && actualMinutes > 0 ? actualMinutes : plannedMinutes
    return usedMinutes <= plannedMinutes / 2 ? Math.ceil(plannedUnits / 2) : plannedUnits
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
    item: CardWithTemplate,
    options?: { available?: boolean, consumeUnits?: number, serviceName?: string },
  ) {
    const usableUnits = Math.max(0, item.remainingUnits - item.frozenUnits)
    return {
      id: Number(item.id),
      cardId: Number(item.cardId),
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
      applicableServices: this.parseApplicableServices(item.card.applicableServices),
      serviceRules: item.card.serviceRules || {},
    }
  }

  private presentCardTemplate(card: Prisma.MemberCardGetPayload<Record<string, never>>) {
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
      status: card.status,
    }
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

  private normalizeSource(source?: string) {
    const value = (source || 'miniapp').trim()
    return /^[a-zA-Z0-9_-]{1,16}$/.test(value) ? value : 'miniapp'
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date)
    result.setDate(result.getDate() + days)
    return result
  }
}
