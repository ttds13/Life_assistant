import { randomBytes } from 'crypto'
import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { PrismaService } from '../prisma/prisma.service'
import { POINT_RULE_CODE } from '../points/points.constants'

const BIND_WINDOW_DAYS = 7
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

type ReferralClient = PrismaService | Prisma.TransactionClient

@Injectable()
export class ReferralsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getMyInvitation(userId: number) {
    const code = await this.ensureInviteCode(this.prisma, BigInt(userId))
    let invite = await this.prisma.referralInvite.findFirst({
      where: { inviterUserId: BigInt(userId), status: 'active', expiresAt: null },
      orderBy: { id: 'desc' },
    })
    if (!invite) {
      invite = await this.createInvite(this.prisma, BigInt(userId), code.id)
    }
    return {
      shareCode: code.code,
      inviteToken: invite.token,
      sharePath: `/pages/referral/landing?token=${encodeURIComponent(invite.token)}`,
      expiresAt: invite.expiresAt?.toISOString() || null,
    }
  }

  async bind(userId: number, input: { source?: string, inviteToken?: string, shareCode?: string }) {
    const source = String(input.source || '').trim()
    if (source !== 'link' && source !== 'share_code') {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid referral source', 400)
    }
    return this.prisma.$transaction(async (tx) => {
      const invitee = await tx.user.findUnique({ where: { id: BigInt(userId) } })
      if (!invitee || invitee.status !== 1 || invitee.deletedAt) {
        throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'user not available', 404)
      }
      const existing = await tx.referralBinding.findUnique({ where: { inviteeUserId: invitee.id } })
      if (existing) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'referral inviter is already bound', 409)
      }
      const bindDeadline = new Date(invitee.createdAt)
      bindDeadline.setDate(bindDeadline.getDate() + BIND_WINDOW_DAYS)
      if (bindDeadline < new Date()) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'referral binding window has expired', 409)
      }
      const existingPaidOrder = await tx.order.findFirst({ where: { userId: invitee.id, paidAt: { not: null } }, select: { id: true } })
      if (existingPaidOrder) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'referral binding is unavailable after payment', 409)
      }

      const resolved = await this.resolveReferralSource(tx, source, input)
      if (resolved.inviterUserId === invitee.id) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'cannot bind your own referral', 409)
      }
      const inviter = await tx.user.findUnique({ where: { id: resolved.inviterUserId }, select: { id: true, status: true, deletedAt: true } })
      if (!inviter || inviter.status !== 1 || inviter.deletedAt) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'referral inviter is unavailable', 409)
      }

      const binding = await tx.referralBinding.create({
        data: {
          inviterUserId: resolved.inviterUserId,
          inviteeUserId: invitee.id,
          inviteId: resolved.inviteId,
          inviteCodeId: resolved.inviteCodeId,
          source,
          status: 'active',
        },
        include: { inviter: { select: { id: true, nickname: true, phone: true } } },
      })
      return this.presentBinding(binding)
    })
  }

  async getMySummary(userId: number) {
    const id = BigInt(userId)
    const [bindingCount, activeBindingCount, rewards] = await Promise.all([
      this.prisma.referralBinding.count({ where: { inviterUserId: id } }),
      this.prisma.referralBinding.count({ where: { inviterUserId: id, status: 'active' } }),
      this.prisma.pointRewardEvent.aggregate({
        where: {
          beneficiaryUserId: id,
          ruleVersion: { rule: { code: POINT_RULE_CODE.REFERRAL_FIRST_CONSUMPTION } },
          status: { in: ['granted', 'partially_reversed'] },
        },
        _sum: { points: true, rewardValue: true },
        _count: { id: true },
      }),
    ])
    return {
      invitedCount: bindingCount,
      activeInvitedCount: activeBindingCount,
      rewardCount: rewards._count.id,
      rewardPoints: rewards._sum.points || 0,
      rewardValue: rewards._sum.rewardValue?.toNumber() || 0,
    }
  }

  async listMyRewards(userId: number, query: { page?: number, pageSize?: number }) {
    const page = this.positiveInt(query.page, 1, 100000)
    const pageSize = this.positiveInt(query.pageSize, 20, 100)
    const where: Prisma.PointRewardEventWhereInput = {
      beneficiaryUserId: BigInt(userId),
      ruleVersion: { rule: { code: POINT_RULE_CODE.REFERRAL_FIRST_CONSUMPTION } },
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.pointRewardEvent.count({ where }),
      this.prisma.pointRewardEvent.findMany({
        where,
        include: {
          order: { select: { id: true, orderNo: true } },
          sourceUser: { select: { id: true, nickname: true, phone: true } },
          ruleVersion: { include: { rule: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    return {
      items: items.map(item => ({
        id: Number(item.id),
        orderId: Number(item.orderId),
        orderNo: item.order.orderNo,
        sourceUser: this.presentUser(item.sourceUser),
        points: item.points,
        rewardValue: item.rewardValue.toNumber(),
        status: item.status,
        ruleVersion: item.ruleVersion.version,
        createdAt: item.createdAt.toISOString(),
      })),
      page,
      pageSize,
      total,
    }
  }

  async listBindings(query: { page?: number, pageSize?: number, keyword?: string, status?: string }) {
    const page = this.positiveInt(query.page, 1, 100000)
    const pageSize = this.positiveInt(query.pageSize, 20, 100)
    const keyword = String(query.keyword || '').trim()
    const where: Prisma.ReferralBindingWhereInput = {
      ...(query.status ? { status: String(query.status) } : {}),
      ...(keyword
        ? {
            OR: [
              { inviter: { phone: { contains: keyword } } },
              { invitee: { phone: { contains: keyword } } },
              { inviteCode: { code: { contains: keyword } } },
            ],
          }
        : {}),
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.referralBinding.count({ where }),
      this.prisma.referralBinding.findMany({
        where,
        include: {
          inviter: { select: { id: true, nickname: true, phone: true } },
          invitee: { select: { id: true, nickname: true, phone: true } },
          inviteCode: { select: { code: true } },
          invite: { select: { token: true } },
        },
        orderBy: [{ boundAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    return { items: items.map(item => this.presentBinding(item)), page, pageSize, total }
  }

  async reviewBinding(id: number, body: { status?: string, riskLevel?: string, riskReason?: string }, adminId: number) {
    const status = ['active', 'held', 'invalid', 'revoked'].includes(String(body.status)) ? String(body.status) : 'held'
    const binding = await this.prisma.referralBinding.update({
      where: { id: BigInt(id) },
      data: {
        status,
        riskLevel: this.optionalString(body.riskLevel),
        riskReason: this.optionalString(body.riskReason),
        reviewedBy: BigInt(adminId),
        reviewedAt: new Date(),
      },
      include: {
        inviter: { select: { id: true, nickname: true, phone: true } },
        invitee: { select: { id: true, nickname: true, phone: true } },
        inviteCode: { select: { code: true } },
        invite: { select: { token: true } },
      },
    })
    return this.presentBinding(binding)
  }

  private async resolveReferralSource(client: ReferralClient, source: string, input: { inviteToken?: string, shareCode?: string }) {
    if (source === 'link') {
      const token = String(input.inviteToken || '').trim()
      if (!token) throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invite token is required', 400)
      const invite = await client.referralInvite.findUnique({ where: { token } })
      if (!invite || invite.status !== 'active' || (invite.expiresAt && invite.expiresAt <= new Date())) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invite link is invalid or expired', 409)
      }
      return { inviterUserId: invite.inviterUserId, inviteId: invite.id, inviteCodeId: invite.inviteCodeId }
    }
    const code = this.normalizeCode(input.shareCode)
    const inviteCode = await client.referralInviteCode.findUnique({ where: { code } })
    if (!inviteCode || inviteCode.status !== 'active') {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'share code is invalid', 409)
    }
    return { inviterUserId: inviteCode.userId, inviteCodeId: inviteCode.id, inviteId: undefined }
  }

  private async ensureInviteCode(client: ReferralClient, userId: bigint) {
    const existing = await client.referralInviteCode.findUnique({ where: { userId } })
    if (existing) return existing
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        return await client.referralInviteCode.create({ data: { userId, code: this.createShareCode() } })
      }
      catch (error) {
        if (!this.isUniqueError(error) || attempt === 7) throw error
      }
    }
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'unable to generate share code', 500)
  }

  private async createInvite(client: ReferralClient, userId: bigint, inviteCodeId: bigint) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        return await client.referralInvite.create({
          data: { inviterUserId: userId, inviteCodeId, token: randomBytes(24).toString('base64url') },
        })
      }
      catch (error) {
        if (!this.isUniqueError(error) || attempt === 7) throw error
      }
    }
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'unable to generate invite link', 500)
  }

  private createShareCode() {
    const bytes = randomBytes(6)
    let value = 'LIFE-'
    for (const item of bytes) value += ALPHABET[item % ALPHABET.length]
    return value
  }

  private normalizeCode(value: unknown) {
    const code = String(value || '').trim().toUpperCase().replace(/\s+/g, '')
    if (!/^LIFE-[A-Z0-9]{6,18}$/.test(code)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid share code format', 400)
    }
    return code
  }

  private presentBinding(item: any) {
    return {
      id: Number(item.id),
      inviter: this.presentUser(item.inviter),
      invitee: item.invitee ? this.presentUser(item.invitee) : null,
      source: item.source,
      status: item.status,
      shareCode: item.inviteCode?.code || '',
      riskLevel: item.riskLevel || '',
      riskReason: item.riskReason || '',
      boundAt: item.boundAt.toISOString(),
      reviewedAt: item.reviewedAt?.toISOString() || null,
    }
  }

  private presentUser(user?: { id: bigint, nickname: string | null, phone: string | null } | null) {
    if (!user) return null
    return { id: Number(user.id), nickname: user.nickname || '', phone: user.phone || '' }
  }

  private positiveInt(value: unknown, fallback: number, max: number) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) return fallback
    return Math.min(parsed, max)
  }

  private optionalString(value: unknown) {
    const text = String(value || '').trim()
    return text || null
  }

  private isUniqueError(error: unknown) {
    return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002')
  }
}
