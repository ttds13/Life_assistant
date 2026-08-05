import { Inject, Injectable } from '@nestjs/common'
import { Order, Prisma } from '@prisma/client'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { PrismaService } from '../prisma/prisma.service'
import {
  DEFAULT_POINT_ECONOMY,
  POINT_LEDGER_TYPE,
  POINT_RULE_CODE,
  POINT_RULE_STATUS,
} from './points.constants'
import { calculatePointRefundReversal } from './points-refund-reversal'

type PointClient = PrismaService | Prisma.TransactionClient
type RuleVersion = Prisma.PointRewardRuleVersionGetPayload<{ include: { rule: true } }>

interface RuleDraft {
  status?: string
  earnPointsPerYuan?: number
  redemptionPointsPerYuan?: number
  calculationType?: string
  qualificationConfig?: Record<string, unknown>
  calculationConfig?: Record<string, unknown>
}

interface GrantInput {
  tx: Prisma.TransactionClient
  order: Pick<Order, 'id' | 'orderNo' | 'userId' | 'orderType' | 'paidAmount' | 'payableAmount'>
  ruleVersion: RuleVersion
  beneficiaryUserId: bigint
  sourceUserId?: bigint
  referralBindingId?: bigint
  eventKey: string
  points: number
  ledgerType: string
  remark: string
}

@Injectable()
export class PointsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getConsumerRule() {
    await this.ensureDefaultRules(this.prisma)
    const version = await this.getActiveVersion(this.prisma, POINT_RULE_CODE.CONSUMER_SPEND)
    if (!version) return this.defaultConsumerRule()
    return this.presentRuleVersion(version)
  }

  async listRules() {
    await this.ensureDefaultRules(this.prisma)
    const rules = await this.prisma.pointRewardRule.findMany({
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      orderBy: { id: 'asc' },
    })
    return rules.map((rule) => ({
      id: Number(rule.id),
      code: rule.code,
      name: rule.name,
      trigger: rule.trigger,
      status: rule.status,
      currentVersion: rule.currentVersion,
      version: rule.versions[0] ? this.presentRuleVersion({ ...rule.versions[0], rule }) : null,
    }))
  }

  async publishRule(code: string, draft: RuleDraft, adminId: number) {
    if (!Object.values(POINT_RULE_CODE).includes(code as any)) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'point reward rule not found', 404)
    }

    return this.prisma.$transaction(async (tx) => {
      await this.ensureDefaultRules(tx)
      const rule = await tx.pointRewardRule.findUnique({ where: { code } })
      if (!rule) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'point reward rule not found', 404)

      const current = await tx.pointRewardRuleVersion.findUnique({
        where: { ruleId_version: { ruleId: rule.id, version: rule.currentVersion } },
      })
      const earnPointsPerYuan = this.positiveInt(draft.earnPointsPerYuan, current?.earnPointsPerYuan || DEFAULT_POINT_ECONOMY.earnPointsPerYuan)
      const redemptionPointsPerYuan = this.positiveInt(
        draft.redemptionPointsPerYuan,
        current?.redemptionPointsPerYuan || DEFAULT_POINT_ECONOMY.redemptionPointsPerYuan,
      )
      const calculationType = this.ruleCalculationType(code, draft.calculationType || current?.calculationType)
      const qualificationConfig = this.objectOr(current?.qualificationConfig, draft.qualificationConfig)
      const calculationConfig = this.objectOr(current?.calculationConfig, draft.calculationConfig)
      this.assertRuleConfig(code, calculationType, calculationConfig)

      const version = rule.currentVersion + 1
      const snapshot = {
        code,
        calculationType,
        qualificationConfig,
        calculationConfig,
        earnPointsPerYuan,
        redemptionPointsPerYuan,
      }
      const created = await tx.pointRewardRuleVersion.create({
        data: {
          ruleId: rule.id,
          version,
          calculationType,
          qualificationConfig: qualificationConfig as Prisma.InputJsonObject,
          calculationConfig: calculationConfig as Prisma.InputJsonObject,
          earnPointsPerYuan,
          redemptionPointsPerYuan,
          publishedBy: BigInt(adminId),
          snapshot: snapshot as Prisma.InputJsonObject,
        },
        include: { rule: true },
      })
      await tx.pointRewardRule.update({
        where: { id: rule.id },
        data: {
          currentVersion: version,
          status: draft.status === POINT_RULE_STATUS.INACTIVE ? POINT_RULE_STATUS.INACTIVE : POINT_RULE_STATUS.ACTIVE,
        },
      })
      return this.presentRuleVersion(created)
    })
  }

  async setRuleStatus(code: string, status: string) {
    if (!Object.values(POINT_RULE_CODE).includes(code as any)) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'point reward rule not found', 404)
    }
    const nextStatus = status === POINT_RULE_STATUS.INACTIVE ? POINT_RULE_STATUS.INACTIVE : POINT_RULE_STATUS.ACTIVE
    return this.prisma.pointRewardRule.update({ where: { code }, data: { status: nextStatus } })
  }

  async handleOrderCompleted(tx: Prisma.TransactionClient, order: Pick<Order, 'id' | 'orderNo' | 'userId' | 'orderType' | 'paidAmount' | 'payableAmount'>) {
    if (order.orderType !== 'service_booking') return { consumer: null, referral: null }
    if (new Prisma.Decimal(order.paidAmount || 0).lessThanOrEqualTo(0)) return { consumer: null, referral: null }

    await this.ensureDefaultRules(tx)
    const legacy = await tx.pointLedger.findFirst({ where: { orderId: order.id, type: 'earn' } })
    if (legacy) return { consumer: null, referral: null }

    const consumerRule = await this.getActiveVersion(tx, POINT_RULE_CODE.CONSUMER_SPEND)
    if (!consumerRule || !this.orderQualifies(order, consumerRule)) return { consumer: null, referral: null }

    const baseAmount = this.pointableAmount(order)
    const consumerPoints = Math.floor(baseAmount.mul(consumerRule.earnPointsPerYuan).toNumber())
    if (consumerPoints <= 0) return { consumer: null, referral: null }

    const consumer = await this.grant({
      tx,
      order,
      ruleVersion: consumerRule,
      beneficiaryUserId: order.userId,
      eventKey: `order:${order.id}:rule:${POINT_RULE_CODE.CONSUMER_SPEND}:beneficiary:${order.userId}:grant`,
      points: consumerPoints,
      ledgerType: POINT_LEDGER_TYPE.CONSUMER_SPEND_EARN,
      remark: `订单 ${order.orderNo} 消费积分`,
    })

    if (!consumer || consumer.status !== 'granted') return { consumer, referral: null }
    const referral = await this.grantReferralReward(tx, order, consumerPoints)
    return { consumer, referral }
  }

  async reverseForRefund(
    tx: Prisma.TransactionClient,
    orderId: bigint,
    refundId: bigint,
    refundAmount: Prisma.Decimal,
    refundNo: string,
  ) {
    // Serialize refunds for the same reward event so concurrent callbacks
    // cannot both consume the same remaining points.
    const lockedIds = await tx.$queryRaw<Array<{ id: bigint }>>`
      SELECT id
      FROM point_reward_events
      WHERE order_id = ${orderId}
        AND status IN ('granted', 'partially_reversed', 'reversed')
      ORDER BY id ASC
      FOR UPDATE
    `
    const events = await tx.pointRewardEvent.findMany({
      where: { id: { in: lockedIds.map(item => item.id) } },
      include: { ruleVersion: { include: { rule: true } }, order: { select: { orderNo: true } } },
      orderBy: { id: 'asc' },
    })

    const results = []
    for (const event of events) {
      const eventKey = `refund:${refundId}:reward:${event.id}:reverse`
      const existingReversal = await tx.pointRewardReversal.findUnique({
        where: { rewardEventId_refundId: { rewardEventId: event.id, refundId } },
      })
      if (existingReversal) {
        const existingLedger = await tx.pointLedger.findUnique({ where: { eventKey } })
        if (existingLedger) results.push(existingLedger)
        continue
      }

      const remaining = event.points - event.reversedPoints
      const reversal = calculatePointRefundReversal({
        totalPoints: event.points,
        reversedPoints: event.reversedPoints,
        baseAmount: event.baseAmount,
        reversedBaseAmount: event.reversedBaseAmount,
        refundAmount,
      })
      const points = Math.min(Math.max(0, remaining), reversal.deltaPoints)

      const ruleCode = event.ruleVersion.rule.code
      const ledgerType = ruleCode === POINT_RULE_CODE.REFERRAL_FIRST_CONSUMPTION
        ? POINT_LEDGER_TYPE.REFERRAL_FIRST_CONSUMPTION_REFUND_REVERSE
        : POINT_LEDGER_TYPE.CONSUMER_SPEND_REFUND_REVERSE
      let ledger = null
      if (points > 0) {
        const rewardValue = new Prisma.Decimal(points).div(event.ruleVersion.redemptionPointsPerYuan)
        ledger = await this.writeLedger(tx, {
        userId: event.beneficiaryUserId,
        orderId,
        rewardEventId: event.id,
        ruleVersionId: event.ruleVersionId,
        sourceUserId: event.sourceUserId || undefined,
        referralBindingId: event.referralBindingId || undefined,
        eventKey,
        type: ledgerType,
        points: -points,
        amount: refundAmount,
        rewardValue: rewardValue.negated(),
        remark: `退款 ${refundNo} 冲正订单 ${event.order.orderNo} 积分`,
        metadata: { refundId: String(refundId), refundNo, sourceRewardEventId: String(event.id) },
        })
      }
      const reversedPoints = event.reversedPoints + points
      await tx.pointRewardReversal.create({
        data: {
          rewardEventId: event.id,
          refundId,
          refundAmount,
          reversedPoints: points,
          eventKey,
        },
      })
      await tx.pointRewardEvent.update({
        where: { id: event.id },
        data: {
          reversedPoints,
          reversedBaseAmount: reversal.nextReversedBaseAmount,
          reversedAt: new Date(),
          status: reversedPoints >= event.points ? 'reversed' : 'partially_reversed',
        },
      })
      if (ledger) results.push(ledger)
    }
    return results
  }

  async listRewardEvents(query: { page?: number, pageSize?: number, keyword?: string }) {
    const page = this.positiveInt(query.page, 1, 100000)
    const pageSize = this.positiveInt(query.pageSize, 20, 100)
    const keyword = String(query.keyword || '').trim()
    const where: Prisma.PointRewardEventWhereInput = keyword
      ? {
          OR: [
            { order: { orderNo: { contains: keyword } } },
            { beneficiaryUser: { phone: { contains: keyword } } },
            { sourceUser: { phone: { contains: keyword } } },
          ],
        }
      : {}
    const [total, items] = await this.prisma.$transaction([
      this.prisma.pointRewardEvent.count({ where }),
      this.prisma.pointRewardEvent.findMany({
        where,
        include: {
          order: { select: { orderNo: true } },
          ruleVersion: { include: { rule: true } },
          beneficiaryUser: { select: { id: true, nickname: true, phone: true } },
          sourceUser: { select: { id: true, nickname: true, phone: true } },
          referralBinding: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    return { items: items.map(item => this.presentEvent(item)), page, pageSize, total }
  }

  private async grantReferralReward(tx: Prisma.TransactionClient, order: Pick<Order, 'id' | 'orderNo' | 'userId' | 'orderType' | 'paidAmount' | 'payableAmount'>, inviteePoints: number) {
    const binding = await tx.referralBinding.findUnique({ where: { inviteeUserId: order.userId } })
    if (!binding || binding.status !== 'active') return null

    const rule = await this.getActiveVersion(tx, POINT_RULE_CODE.REFERRAL_FIRST_CONSUMPTION)
    if (!rule || !this.orderQualifies(order, rule)) return null
    const qualification = this.jsonObject(rule.qualificationConfig)
    const firstOnly = qualification.firstOnly !== false
    if (firstOnly) {
      const prior = await tx.pointRewardEvent.findFirst({
        where: {
          sourceUserId: order.userId,
          status: { in: ['granted', 'partially_reversed', 'reversed'] },
          ruleVersion: { rule: { code: POINT_RULE_CODE.REFERRAL_FIRST_CONSUMPTION } },
        },
      })
      if (prior) return null
    }

    const points = this.referralPoints(rule, order, inviteePoints)
    if (points <= 0) return null
    return this.grant({
      tx,
      order,
      ruleVersion: rule,
      beneficiaryUserId: binding.inviterUserId,
      sourceUserId: order.userId,
      referralBindingId: binding.id,
      eventKey: `order:${order.id}:rule:${POINT_RULE_CODE.REFERRAL_FIRST_CONSUMPTION}:beneficiary:${binding.inviterUserId}:grant`,
      points,
      ledgerType: POINT_LEDGER_TYPE.REFERRAL_FIRST_CONSUMPTION_EARN,
      remark: `邀请用户完成订单 ${order.orderNo} 获得积分`,
    })
  }

  private async grant(input: GrantInput) {
    const existing = await input.tx.pointRewardEvent.findUnique({ where: { eventKey: input.eventKey } })
    if (existing) return existing

    const baseAmount = this.pointableAmount(input.order)
    const rewardValue = new Prisma.Decimal(input.points).div(input.ruleVersion.redemptionPointsPerYuan)
    let event: Prisma.PointRewardEventGetPayload<Record<string, never>>
    try {
      event = await input.tx.pointRewardEvent.create({
        data: {
          eventKey: input.eventKey,
          orderId: input.order.id,
          ruleVersionId: input.ruleVersion.id,
          beneficiaryUserId: input.beneficiaryUserId,
          sourceUserId: input.sourceUserId,
          referralBindingId: input.referralBindingId,
          baseAmount,
          rewardValue,
          points: input.points,
          calculationSnapshot: {
            ruleCode: input.ruleVersion.rule.code,
            version: input.ruleVersion.version,
            earnPointsPerYuan: input.ruleVersion.earnPointsPerYuan,
            redemptionPointsPerYuan: input.ruleVersion.redemptionPointsPerYuan,
          },
        },
      })
    }
    catch (error) {
      if (this.isUniqueError(error)) return input.tx.pointRewardEvent.findUnique({ where: { eventKey: input.eventKey } })
      throw error
    }

    await this.writeLedger(input.tx, {
      userId: input.beneficiaryUserId,
      orderId: input.order.id,
      rewardEventId: event.id,
      ruleVersionId: input.ruleVersion.id,
      sourceUserId: input.sourceUserId,
      referralBindingId: input.referralBindingId,
      eventKey: `${input.eventKey}:ledger`,
      type: input.ledgerType,
      points: input.points,
      amount: baseAmount,
      rewardValue,
      remark: input.remark,
      metadata: { ruleCode: input.ruleVersion.rule.code, rewardEventId: String(event.id) },
    })
    return event
  }

  private async writeLedger(tx: Prisma.TransactionClient, input: {
    userId: bigint
    orderId?: bigint
    rewardEventId?: bigint
    ruleVersionId?: bigint
    sourceUserId?: bigint
    referralBindingId?: bigint
    eventKey: string
    type: string
    points: number
    amount?: Prisma.Decimal
    rewardValue?: Prisma.Decimal
    remark: string
    metadata?: Record<string, unknown>
  }) {
    const existing = await tx.pointLedger.findUnique({ where: { eventKey: input.eventKey } })
    if (existing) return existing
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.userId} FOR UPDATE`
    const summary = await tx.pointLedger.aggregate({ where: { userId: input.userId }, _sum: { points: true } })
    return tx.pointLedger.create({
      data: {
        userId: input.userId,
        orderId: input.orderId,
        rewardEventId: input.rewardEventId,
        ruleVersionId: input.ruleVersionId,
        sourceUserId: input.sourceUserId,
        referralBindingId: input.referralBindingId,
        eventKey: input.eventKey,
        type: input.type,
        points: input.points,
        amount: input.amount,
        rewardValue: input.rewardValue,
        balanceAfter: (summary._sum.points || 0) + input.points,
        remark: input.remark,
        metadata: input.metadata as Prisma.InputJsonObject | undefined,
      },
    })
  }

  private async getActiveVersion(client: PointClient, code: string): Promise<RuleVersion | null> {
    const rule = await client.pointRewardRule.findUnique({ where: { code } })
    if (!rule || rule.status !== POINT_RULE_STATUS.ACTIVE || rule.currentVersion <= 0) return null
    return client.pointRewardRuleVersion.findUnique({
      where: { ruleId_version: { ruleId: rule.id, version: rule.currentVersion } },
      include: { rule: true },
    })
  }

  private async ensureDefaultRules(client: PointClient) {
    const consumer = await client.pointRewardRule.upsert({
      where: { code: POINT_RULE_CODE.CONSUMER_SPEND },
      update: {},
      create: {
        code: POINT_RULE_CODE.CONSUMER_SPEND,
        name: '消费积分',
        trigger: 'order_completed',
        status: POINT_RULE_STATUS.ACTIVE,
        currentVersion: 1,
        versions: {
          create: {
            version: 1,
            calculationType: 'spend_rate',
            qualificationConfig: { orderTypes: ['service_booking'], minimumPaidAmount: 0 },
            calculationConfig: {},
            ...DEFAULT_POINT_ECONOMY,
            snapshot: DEFAULT_POINT_ECONOMY,
          },
        },
      },
    })
    await client.pointRewardRule.upsert({
      where: { code: POINT_RULE_CODE.REFERRAL_FIRST_CONSUMPTION },
      update: {},
      create: {
        code: POINT_RULE_CODE.REFERRAL_FIRST_CONSUMPTION,
        name: '拉新消费奖励',
        trigger: 'order_completed',
        status: POINT_RULE_STATUS.INACTIVE,
        currentVersion: 1,
        versions: {
          create: {
            version: 1,
            calculationType: 'fixed_points',
            qualificationConfig: { firstOnly: true, orderTypes: ['service_booking'], minimumPaidAmount: 0 },
            calculationConfig: { fixedPoints: 0 },
            ...DEFAULT_POINT_ECONOMY,
            snapshot: { ...DEFAULT_POINT_ECONOMY, fixedPoints: 0 },
          },
        },
      },
    })
    return consumer
  }

  private referralPoints(rule: RuleVersion, order: Pick<Order, 'paidAmount' | 'payableAmount'>, inviteePoints: number) {
    const config = this.jsonObject(rule.calculationConfig)
    if (rule.calculationType === 'fixed_points') return Math.floor(Number(config.fixedPoints || 0))
    if (rule.calculationType === 'invitee_points_percent') return Math.floor(inviteePoints * Number(config.percent || 0) / 100)
    if (rule.calculationType === 'invitee_points_multiplier') return Math.floor(inviteePoints * Number(config.multiplier || 0))
    if (rule.calculationType === 'amount_multiplier') {
      return Math.floor(this.pointableAmount(order).mul(rule.earnPointsPerYuan).mul(Number(config.multiplier || 0)).toNumber())
    }
    return 0
  }

  private orderQualifies(order: Pick<Order, 'orderType' | 'paidAmount' | 'payableAmount'>, rule: RuleVersion) {
    const config = this.jsonObject(rule.qualificationConfig)
    const orderTypes = Array.isArray(config.orderTypes) ? config.orderTypes.map(String) : ['service_booking']
    const minimum = new Prisma.Decimal(Number(config.minimumPaidAmount || 0))
    return orderTypes.includes(order.orderType) && this.pointableAmount(order).greaterThanOrEqualTo(minimum)
  }

  private pointableAmount(order: Pick<Order, 'paidAmount' | 'payableAmount'>) {
    const paid = new Prisma.Decimal(order.paidAmount || 0)
    return paid.greaterThan(0) ? paid : new Prisma.Decimal(order.payableAmount || 0)
  }

  private presentRuleVersion(version: RuleVersion) {
    return {
      id: Number(version.id),
      ruleId: Number(version.ruleId),
      code: version.rule.code,
      name: version.rule.name,
      status: version.rule.status,
      version: version.version,
      calculationType: version.calculationType,
      qualificationConfig: this.jsonObject(version.qualificationConfig),
      calculationConfig: this.jsonObject(version.calculationConfig),
      earnPointsPerYuan: version.earnPointsPerYuan,
      redemptionPointsPerYuan: version.redemptionPointsPerYuan,
      effectiveAt: version.effectiveAt.toISOString(),
      publishedBy: version.publishedBy ? Number(version.publishedBy) : null,
      description: `每消费 1 元积 ${version.earnPointsPerYuan} 分，${version.redemptionPointsPerYuan} 分兑换 1 元。`,
    }
  }

  private presentEvent(item: any) {
    return {
      id: Number(item.id),
      eventKey: item.eventKey,
      orderId: Number(item.orderId),
      orderNo: item.order.orderNo,
      ruleCode: item.ruleVersion.rule.code,
      ruleVersion: item.ruleVersion.version,
      status: item.status,
      baseAmount: item.baseAmount.toNumber(),
      rewardValue: item.rewardValue.toNumber(),
      points: item.points,
      reversedPoints: item.reversedPoints,
      beneficiary: this.presentUser(item.beneficiaryUser),
      sourceUser: this.presentUser(item.sourceUser),
      referralBindingId: item.referralBindingId ? Number(item.referralBindingId) : null,
      createdAt: item.createdAt.toISOString(),
    }
  }

  private presentUser(user?: { id: bigint, nickname: string | null, phone: string | null } | null) {
    if (!user) return null
    return { id: Number(user.id), nickname: user.nickname || '', phone: user.phone || '' }
  }

  private defaultConsumerRule() {
    return {
      code: POINT_RULE_CODE.CONSUMER_SPEND,
      name: '消费积分',
      status: POINT_RULE_STATUS.ACTIVE,
      version: 1,
      calculationType: 'spend_rate',
      qualificationConfig: { orderTypes: ['service_booking'], minimumPaidAmount: 0 },
      calculationConfig: {},
      ...DEFAULT_POINT_ECONOMY,
      description: '每消费 1 元积 10 分，200 分兑换 1 元。',
    }
  }

  private objectOr(current: Prisma.JsonValue | null | undefined, next: Record<string, unknown> | undefined) {
    return next && typeof next === 'object' && !Array.isArray(next) ? next : this.jsonObject(current)
  }

  private jsonObject(value: Prisma.JsonValue | null | undefined): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
  }

  private ruleCalculationType(code: string, value?: string | null) {
    if (code === POINT_RULE_CODE.CONSUMER_SPEND) return 'spend_rate'
    const allowed = ['fixed_points', 'invitee_points_percent', 'invitee_points_multiplier', 'amount_multiplier']
    return allowed.includes(String(value)) ? String(value) : 'fixed_points'
  }

  private assertRuleConfig(code: string, calculationType: string, config: Record<string, unknown>) {
    if (code !== POINT_RULE_CODE.REFERRAL_FIRST_CONSUMPTION) return
    const value = calculationType === 'fixed_points'
      ? Number(config.fixedPoints || 0)
      : calculationType === 'invitee_points_percent'
        ? Number(config.percent || 0)
        : Number(config.multiplier || 0)
    if (!Number.isFinite(value) || value < 0) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid referral point calculation config', 400)
    }
  }

  private positiveInt(value: unknown, fallback: number, max = 100000) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) return fallback
    return Math.min(parsed, max)
  }

  private isUniqueError(error: unknown) {
    return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002')
  }
}
