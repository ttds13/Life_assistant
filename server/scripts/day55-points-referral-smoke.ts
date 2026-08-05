import { Prisma, PrismaClient } from '@prisma/client'
import { PointsService } from '../src/points/points.service'
import { POINT_LEDGER_TYPE, POINT_RULE_CODE } from '../src/points/points.constants'
import { ReferralsService } from '../src/referrals/referrals.service'

const prisma = new PrismaClient()
const points = new PointsService(prisma as any)
const referrals = new ReferralsService(prisma as any)
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`

let inviterId: bigint | null = null
let inviteeId: bigint | null = null
let shareCodeInviteeId: bigint | null = null
let orderId: bigint | null = null
let paymentId: bigint | null = null
const refundIds: bigint[] = []
let inviteId: bigint | null = null
let inviteCodeId: bigint | null = null
let bindingId: bigint | null = null
let referralRuleBefore: { status: string, currentVersion: number, calculationConfig: Prisma.JsonValue | null, qualificationConfig: Prisma.JsonValue | null } | null = null

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function main() {
  const service = await prisma.service.findFirst({ where: { status: 1, deletedAt: null }, orderBy: { id: 'asc' } })
  if (!service) throw new Error('Day55 smoke requires one active service')

  const [inviter, invitee, shareCodeInvitee] = await Promise.all([
    prisma.user.create({ data: { openid: `day55_inviter_${suffix}`, phone: `137${String(suffix).slice(-8).padStart(8, '0')}`, nickname: 'Day55 邀请人', status: 1 } }),
    prisma.user.create({ data: { openid: `day55_invitee_${suffix}`, phone: `136${String(suffix).slice(-8).padStart(8, '0')}`, nickname: 'Day55 新用户', status: 1 } }),
    prisma.user.create({ data: { openid: `day55_code_${suffix}`, phone: `135${String(suffix).slice(-8).padStart(8, '0')}`, nickname: 'Day55 分享码用户', status: 1 } }),
  ])
  inviterId = inviter.id
  inviteeId = invitee.id
  shareCodeInviteeId = shareCodeInvitee.id

  const invitation = await referrals.getMyInvitation(Number(inviter.id))
  const invite = await prisma.referralInvite.findUniqueOrThrow({ where: { token: invitation.inviteToken } })
  const inviteCode = await prisma.referralInviteCode.findUniqueOrThrow({ where: { userId: inviter.id } })
  inviteId = invite.id
  inviteCodeId = inviteCode.id

  const bound = await referrals.bind(Number(invitee.id), { source: 'link', inviteToken: invitation.inviteToken })
  bindingId = BigInt(bound.id)
  assert(bound.source === 'link', 'invitee was not bound through link')
  const shareCodeBound = await referrals.bind(Number(shareCodeInvitee.id), { source: 'share_code', shareCode: invitation.shareCode })
  assert(shareCodeBound.source === 'share_code', 'invitee was not bound through share code')

  const referralRule = await prisma.pointRewardRule.findUniqueOrThrow({ where: { code: POINT_RULE_CODE.REFERRAL_FIRST_CONSUMPTION } })
  const referralVersion = await prisma.pointRewardRuleVersion.findUniqueOrThrow({
    where: { ruleId_version: { ruleId: referralRule.id, version: referralRule.currentVersion } },
  })
  referralRuleBefore = {
    status: referralRule.status,
    currentVersion: referralRule.currentVersion,
    calculationConfig: referralVersion.calculationConfig,
    qualificationConfig: referralVersion.qualificationConfig,
  }
  await prisma.pointRewardRule.update({ where: { id: referralRule.id }, data: { status: 'active' } })
  await prisma.pointRewardRuleVersion.update({
    where: { id: referralVersion.id },
    data: {
      calculationType: 'fixed_points',
      calculationConfig: { fixedPoints: 200 },
      qualificationConfig: { firstOnly: true, orderTypes: ['service_booking'], minimumPaidAmount: 0 },
    },
  })

  const now = new Date()
  orderId = (await prisma.order.create({
    data: {
      orderNo: `DAY55${suffix}`.slice(0, 32),
      userId: invitee.id,
      serviceId: service.id,
      orderType: 'service_booking',
      status: 'pending_confirm',
      serviceSnapshot: { id: Number(service.id), name: service.name },
      appointmentStartTime: now,
      appointmentEndTime: new Date(now.getTime() + 60 * 60 * 1000),
      originalAmount: new Prisma.Decimal(100),
      discountAmount: new Prisma.Decimal(0),
      payableAmount: new Prisma.Decimal(100),
      paidAmount: new Prisma.Decimal(100),
      paidAt: now,
      source: 'smoke',
    },
  })).id

  paymentId = (await prisma.payment.create({
    data: {
      paymentNo: `DAY55PAY${suffix}`.slice(0, 64),
      orderId,
      userId: invitee.id,
      channel: 'offline',
      amount: new Prisma.Decimal(100),
      status: 'success',
      paidAt: now,
    },
  })).id
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.update({ where: { id: orderId! }, data: { status: 'completed', completedAt: new Date() } })
    await points.handleOrderCompleted(tx, order)
  })
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId! } })
    await points.handleOrderCompleted(tx, order)
  })

  const grants = await prisma.pointLedger.findMany({ where: { orderId }, orderBy: { id: 'asc' } })
  const consumerGrant = grants.find(item => item.type === POINT_LEDGER_TYPE.CONSUMER_SPEND_EARN)
  const referralGrant = grants.find(item => item.type === POINT_LEDGER_TYPE.REFERRAL_FIRST_CONSUMPTION_EARN)
  assert(consumerGrant?.points === 1000, `expected consumer grant 1000, got ${consumerGrant?.points}`)
  assert(referralGrant?.points === 200, `expected referral grant 200, got ${referralGrant?.points}`)
  assert(grants.filter(item => item.type === POINT_LEDGER_TYPE.CONSUMER_SPEND_EARN).length === 1, 'consumer grant is not idempotent')
  assert(grants.filter(item => item.type === POINT_LEDGER_TYPE.REFERRAL_FIRST_CONSUMPTION_EARN).length === 1, 'referral grant is not idempotent')

  const refundAmounts = ['0.01', '0.09', '99.90']
  for (const [index, amount] of refundAmounts.entries()) {
    const refund = await prisma.refund.create({
      data: {
        refundNo: `DAY55REF${suffix}${index}`.slice(0, 64),
        orderId: orderId!,
        paymentId: paymentId!,
        amount: new Prisma.Decimal(amount),
        status: 'refunded',
        operatedBy: inviter.id,
        refundedAt: new Date(),
      },
    })
    refundIds.push(refund.id)
    await prisma.$transaction(tx => points.reverseForRefund(tx, orderId!, refund.id, new Prisma.Decimal(amount), refund.refundNo))
  }
  const lastRefundId = refundIds[refundIds.length - 1]
  await prisma.$transaction(tx => points.reverseForRefund(tx, orderId!, lastRefundId, new Prisma.Decimal('99.90'), `DAY55REF${suffix}2`))
  const reversals = await prisma.pointLedger.findMany({ where: { orderId }, orderBy: { id: 'asc' } })
  assert(reversals.some(item => item.type === POINT_LEDGER_TYPE.CONSUMER_SPEND_REFUND_REVERSE && item.points === -1), 'small cumulative consumer refund reversal missing')
  assert(reversals.some(item => item.type === POINT_LEDGER_TYPE.CONSUMER_SPEND_REFUND_REVERSE && item.points === -999), 'final cumulative consumer refund reversal missing')
  assert(reversals.some(item => item.type === POINT_LEDGER_TYPE.REFERRAL_FIRST_CONSUMPTION_REFUND_REVERSE && item.points === -200), 'referral refund reversal missing')
  assert(reversals.filter(item => item.type === POINT_LEDGER_TYPE.CONSUMER_SPEND_REFUND_REVERSE).length === 2, 'consumer refund reversal is not idempotent')
  assert(reversals.filter(item => item.type === POINT_LEDGER_TYPE.REFERRAL_FIRST_CONSUMPTION_REFUND_REVERSE).length === 1, 'referral refund reversal is not idempotent')
  const reversalFacts = await prisma.pointRewardReversal.count({ where: { refundId: { in: refundIds } } })
  assert(reversalFacts === 6, `expected 6 refund reversal facts, got ${reversalFacts}`)

  console.log(JSON.stringify({
    linkBinding: true,
    shareCodeBinding: true,
    consumerPoints: consumerGrant.points,
    referralPoints: referralGrant.points,
    idempotent: true,
    refundReversal: true,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    if (referralRuleBefore) {
      const rule = await prisma.pointRewardRule.findUnique({ where: { code: POINT_RULE_CODE.REFERRAL_FIRST_CONSUMPTION } })
      if (rule) {
        const version = await prisma.pointRewardRuleVersion.findUnique({ where: { ruleId_version: { ruleId: rule.id, version: rule.currentVersion } } })
        if (version) {
          await prisma.pointRewardRuleVersion.update({
            where: { id: version.id },
            data: { calculationConfig: referralRuleBefore.calculationConfig ?? Prisma.JsonNull, qualificationConfig: referralRuleBefore.qualificationConfig ?? Prisma.JsonNull },
          })
        }
        await prisma.pointRewardRule.update({ where: { id: rule.id }, data: { status: referralRuleBefore.status } })
      }
    }
    if (orderId) await prisma.pointLedger.deleteMany({ where: { orderId } })
    if (refundIds.length) await prisma.refund.deleteMany({ where: { id: { in: refundIds } } })
    if (paymentId) await prisma.payment.deleteMany({ where: { id: paymentId } })
    if (orderId) await prisma.pointRewardEvent.deleteMany({ where: { orderId } })
    if (bindingId || shareCodeInviteeId) {
      await prisma.referralBinding.deleteMany({
        where: { inviteeUserId: { in: [inviteeId, shareCodeInviteeId].filter((id): id is bigint => Boolean(id)) } },
      })
    }
    if (inviteId) await prisma.referralInvite.deleteMany({ where: { id: inviteId } })
    if (inviteCodeId) await prisma.referralInviteCode.deleteMany({ where: { id: inviteCodeId } })
    if (orderId) await prisma.order.deleteMany({ where: { id: orderId } })
    if (inviteeId) await prisma.user.deleteMany({ where: { id: inviteeId } })
    if (shareCodeInviteeId) await prisma.user.deleteMany({ where: { id: shareCodeInviteeId } })
    if (inviterId) await prisma.user.deleteMany({ where: { id: inviterId } })
    await prisma.$disconnect()
  })
