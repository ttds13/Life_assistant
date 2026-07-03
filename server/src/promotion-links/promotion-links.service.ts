import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AdminAuditService } from '../audit-log/admin-audit.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { PrismaService } from '../prisma/prisma.service'

type PromotionTargetType = 'service' | 'member_card' | 'category' | 'home'
type JsonRecord = Record<string, unknown>
type PromotionLinkRecord = Prisma.PromotionLinkGetPayload<Record<string, never>>

interface AdminWriteContext {
  adminId: number
  requestId?: string
  ip?: string
}

interface PromotionLinkQuery {
  page?: number
  pageNum?: number
  pageSize?: number
  keyword?: string
  keywords?: string
  status?: string
  targetType?: string
}

interface PageMeta {
  page: number
  pageSize: number
  keyword?: string
}

export interface ResolvedPromotionPayload {
  key: string
  title: string
  description: string
  targetType: string
  targetId: number | null
  targetCode: string
  targetName: string
  source: string
  campaignId: number | null
  miniappPath: string
  resolvedPath: string
  fallbackPath: string
  targetAvailable: boolean
}

export interface TargetOption {
  label: string
  value: string
  code?: string
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const TARGET_TYPES = new Set<PromotionTargetType>(['service', 'member_card', 'category', 'home'])
const MINIAPP_LANDING_PATH = '/pages/promo/landing'
const MINIAPP_HOME_PATH = '/pages/home/index'

@Injectable()
export class PromotionLinksService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
  ) {}

  async resolvePublicLink(key: string) {
    const linkKey = this.normalizeLinkKey(key)
    const link = await this.prisma.promotionLink.findUnique({ where: { linkKey } })
    if (!link) throw this.notFound('promotion link not found')

    this.assertLinkEnabled(link)
    return this.resolveLinkPayload(link, true)
  }

  async listAdminLinks(query: PromotionLinkQuery) {
    const page = this.getPage(query)
    const where: Prisma.PromotionLinkWhereInput = {}

    if (query.status) where.status = this.activeStatusToNumber(query.status)
    if (query.targetType && TARGET_TYPES.has(query.targetType as PromotionTargetType)) {
      where.targetType = query.targetType
    }
    if (page.keyword) {
      where.OR = [
        { linkKey: { contains: page.keyword } },
        { title: { contains: page.keyword } },
        { description: { contains: page.keyword } },
        { targetCode: { contains: page.keyword } },
      ]
    }

    const [total, links] = await this.prisma.$transaction([
      this.prisma.promotionLink.count({ where }),
      this.prisma.promotionLink.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        skip: this.skip(page),
        take: page.pageSize,
      }),
    ])
    const targetNames = await this.resolveAdminTargetNames(links)

    return this.pageResult(links.map(link => this.presentAdminLink(link, targetNames.get(String(link.id)) || '')), page, total)
  }

  async createAdminLink(body: JsonRecord, context: AdminWriteContext) {
    const data = await this.buildLinkData(body)
    const created = await this.prisma.$transaction(async (tx) => {
      const link = await tx.promotionLink.create({ data })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'promotion-link:create',
        module: 'marketing',
        targetType: 'promotion_link',
        targetId: link.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: this.auditSnapshot(link),
      })
      return link
    })
    return this.presentAdminLink(created, await this.resolveSingleTargetName(created))
  }

  async updateAdminLink(id: number, body: JsonRecord, context: AdminWriteContext) {
    const current = await this.prisma.promotionLink.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound('promotion link not found')

    const data = await this.buildLinkData(body, current)
    const updated = await this.prisma.$transaction(async (tx) => {
      const link = await tx.promotionLink.update({
        where: { id: BigInt(id) },
        data,
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'promotion-link:update',
        module: 'marketing',
        targetType: 'promotion_link',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: {
          before: this.auditSnapshot(current),
          after: this.auditSnapshot(link),
        },
      })
      return link
    })
    return this.presentAdminLink(updated, await this.resolveSingleTargetName(updated))
  }

  async updateAdminLinkStatus(id: number, statusText: string, context: AdminWriteContext) {
    const current = await this.prisma.promotionLink.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound('promotion link not found')

    const status = this.activeStatusToNumber(statusText)
    await this.prisma.$transaction(async (tx) => {
      await tx.promotionLink.update({
        where: { id: BigInt(id) },
        data: { status },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'promotion-link:status:update',
        module: 'marketing',
        targetType: 'promotion_link',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: status },
      })
    })

    return { id, status: this.activeStatus(status) }
  }

  async deleteAdminLink(id: number, context: AdminWriteContext) {
    const current = await this.prisma.promotionLink.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound('promotion link not found')

    await this.prisma.$transaction(async (tx) => {
      await tx.promotionLink.delete({ where: { id: BigInt(id) } })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'promotion-link:delete',
        module: 'marketing',
        targetType: 'promotion_link',
        targetId: id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: this.auditSnapshot(current) },
      })
    })

    return { id, deleted: true }
  }

  async listTargetOptions(targetTypeText: string | undefined, keywordText?: string): Promise<TargetOption[]> {
    const targetType = this.normalizeTargetType(targetTypeText || 'service')
    const keyword = this.optionalString(keywordText)

    if (targetType === 'home') return []

    if (targetType === 'service') {
      const services = await this.prisma.service.findMany({
        where: {
          deletedAt: null,
          status: 1,
          ...(keyword
            ? {
                OR: [
                  { name: { contains: keyword } },
                  { code: { contains: keyword } },
                  { category: { name: { contains: keyword } } },
                ],
              }
            : {}),
        },
        select: { id: true, code: true, name: true, priceUnit: true, basePrice: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        take: 50,
      })
      return services.map(item => ({
        value: String(item.id),
        label: `${item.name} (${item.code}) - ￥${item.basePrice.toNumber()}/${item.priceUnit}`,
        code: item.code,
      }))
    }

    if (targetType === 'member_card') {
      const cards = await this.prisma.memberCard.findMany({
        where: {
          status: 1,
          ...(keyword ? { name: { contains: keyword } } : {}),
        },
        select: { id: true, name: true, cardType: true, price: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      })
      return cards.map(item => ({
        value: String(item.id),
        label: `${item.name} (${this.targetTypeLabel(item.cardType)}) - ￥${item.price.toNumber()}`,
      }))
    }

    const categories = await this.prisma.serviceCategory.findMany({
      where: {
        status: 1,
        ...(keyword ? { name: { contains: keyword } } : {}),
      },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      take: 50,
    })
    return categories.map(item => ({
      value: String(item.id),
      label: item.name,
    }))
  }

  private async buildLinkData(body: JsonRecord, current?: PromotionLinkRecord) {
    const targetType = this.normalizeTargetType(
      this.has(body, 'targetType') ? this.requiredString(body.targetType, 'targetType required') : current?.targetType,
    )
    const target = await this.resolveTarget(targetType, body, current)

    const linkKey = this.has(body, 'linkKey')
      ? this.normalizeLinkKey(this.requiredString(body.linkKey, 'linkKey required'))
      : current?.linkKey
    if (!linkKey) throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'linkKey required', 400)

    const title = this.has(body, 'title')
      ? this.requiredString(body.title, 'title required')
      : current?.title
    if (!title) throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'title required', 400)

    const startAt = this.has(body, 'startAt') ? this.optionalDateOrNull(body.startAt, 'startAt') : current?.startAt ?? null
    const endAt = this.has(body, 'endAt') ? this.optionalDateOrNull(body.endAt, 'endAt') : current?.endAt ?? null
    if (startAt && endAt && startAt >= endAt) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'startAt must be before endAt', 400)
    }

    return {
      linkKey,
      title,
      description: this.has(body, 'description') ? this.optionalString(body.description) || null : current?.description ?? null,
      targetType,
      targetId: target.targetId,
      targetCode: target.targetCode,
      source: this.has(body, 'source') ? this.normalizeSource(body.source) : current?.source ?? 'channels',
      campaignId: this.has(body, 'campaignId') ? this.optionalPositiveBigInt(body.campaignId) : current?.campaignId ?? null,
      sortOrder: this.has(body, 'sortOrder') ? this.optionalNumber(body.sortOrder, 0) : current?.sortOrder ?? 0,
      status: this.has(body, 'status')
        ? this.activeStatusToNumber(this.requiredString(body.status, 'status required'))
        : current?.status ?? 1,
      startAt,
      endAt,
    }
  }

  private async resolveTarget(targetType: PromotionTargetType, body: JsonRecord, current?: PromotionLinkRecord) {
    if (targetType === 'home') return { targetId: null, targetCode: null }

    const rawTargetId = this.has(body, 'targetId')
      ? this.optionalPositiveBigInt(body.targetId)
      : current?.targetId ?? null
    const rawTargetCode = this.has(body, 'targetCode')
      ? this.optionalString(body.targetCode) || null
      : current?.targetCode ?? null

    if (targetType === 'service') {
      let service: { id: bigint, code: string } | null = null
      if (rawTargetId) {
        service = await this.prisma.service.findFirst({
          where: { id: rawTargetId, deletedAt: null },
          select: { id: true, code: true },
        })
        if (service && rawTargetCode && service.code !== rawTargetCode) {
          throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'targetId and targetCode do not match', 400)
        }
      }
      else if (rawTargetCode) {
        service = await this.prisma.service.findFirst({
          where: { code: rawTargetCode, deletedAt: null },
          select: { id: true, code: true },
        })
      }
      if (!service) throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'service target required', 400)
      return { targetId: service.id, targetCode: service.code }
    }

    if (!rawTargetId) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, `${targetType} targetId required`, 400)
    }

    if (targetType === 'member_card') {
      const card = await this.prisma.memberCard.findUnique({
        where: { id: rawTargetId },
        select: { id: true },
      })
      if (!card) throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'member card target not found', 400)
      return { targetId: card.id, targetCode: null }
    }

    const category = await this.prisma.serviceCategory.findUnique({
      where: { id: rawTargetId },
      select: { id: true },
    })
    if (!category) throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'category target not found', 400)
    return { targetId: category.id, targetCode: null }
  }

  private async resolveLinkPayload(link: PromotionLinkRecord, requireActiveTarget: boolean): Promise<ResolvedPromotionPayload> {
    const source = link.source || 'channels'
    const fallbackPath = this.homePath(link)
    let targetId = link.targetId ? Number(link.targetId) : null
    let targetCode = link.targetCode || ''
    let targetName = ''
    let targetAvailable = true
    let resolvedPath = fallbackPath

    if (link.targetType === 'service') {
      const service = await this.findServiceTarget(link, requireActiveTarget)
      if (service) {
        targetId = Number(service.id)
        targetCode = service.code
        targetName = service.name
        resolvedPath = this.withQuery('/pages/service/detail', {
          code: service.code,
          source,
          promotionKey: link.linkKey,
          campaignId: link.campaignId ? Number(link.campaignId) : undefined,
        })
      }
      else {
        targetAvailable = false
      }
    }
    else if (link.targetType === 'member_card') {
      const card = await this.findMemberCardTarget(link, requireActiveTarget)
      if (card) {
        targetId = Number(card.id)
        targetName = card.name
        resolvedPath = this.withQuery('/pages/member-card/detail', {
          cardId: Number(card.id),
          source,
          promotionKey: link.linkKey,
          campaignId: link.campaignId ? Number(link.campaignId) : undefined,
        })
      }
      else {
        targetAvailable = false
      }
    }
    else if (link.targetType === 'category') {
      const category = await this.findCategoryTarget(link, requireActiveTarget)
      if (category) {
        targetId = Number(category.id)
        targetName = category.name
        resolvedPath = this.withQuery('/pages/service/list', {
          categoryId: Number(category.id),
          categoryName: category.name,
          source,
          promotionKey: link.linkKey,
          campaignId: link.campaignId ? Number(link.campaignId) : undefined,
        })
      }
      else {
        targetAvailable = false
      }
    }

    if (link.targetType === 'home') {
      targetAvailable = true
      resolvedPath = fallbackPath
    }

    if (!targetAvailable) {
      resolvedPath = fallbackPath
    }

    return {
      key: link.linkKey,
      title: link.title,
      description: link.description || '',
      targetType: link.targetType,
      targetId,
      targetCode,
      targetName,
      source,
      campaignId: link.campaignId ? Number(link.campaignId) : null,
      miniappPath: this.miniappPath(link),
      resolvedPath,
      fallbackPath,
      targetAvailable,
    }
  }

  private findServiceTarget(link: PromotionLinkRecord, requireActive: boolean) {
    const where: Prisma.ServiceWhereInput = {
      deletedAt: null,
      ...(requireActive ? { status: 1 } : {}),
      ...(link.targetId
        ? { id: link.targetId }
        : link.targetCode
          ? { code: link.targetCode }
          : { id: BigInt(0) }),
    }
    return this.prisma.service.findFirst({
      where,
      select: { id: true, code: true, name: true },
    })
  }

  private findMemberCardTarget(link: PromotionLinkRecord, requireActive: boolean) {
    if (!link.targetId) return null
    return this.prisma.memberCard.findFirst({
      where: {
        id: link.targetId,
        ...(requireActive ? { status: 1 } : {}),
      },
      select: { id: true, name: true },
    })
  }

  private findCategoryTarget(link: PromotionLinkRecord, requireActive: boolean) {
    if (!link.targetId) return null
    return this.prisma.serviceCategory.findFirst({
      where: {
        id: link.targetId,
        ...(requireActive ? { status: 1 } : {}),
      },
      select: { id: true, name: true },
    })
  }

  private async resolveAdminTargetNames(links: PromotionLinkRecord[]) {
    const result = new Map<string, string>()
    const serviceIds = links.filter(item => item.targetType === 'service' && item.targetId).map(item => item.targetId!)
    const serviceCodes = links.filter(item => item.targetType === 'service' && item.targetCode).map(item => item.targetCode!)
    const cardIds = links.filter(item => item.targetType === 'member_card' && item.targetId).map(item => item.targetId!)
    const categoryIds = links.filter(item => item.targetType === 'category' && item.targetId).map(item => item.targetId!)

    const [services, cards, categories] = await Promise.all([
      serviceIds.length || serviceCodes.length
        ? this.prisma.service.findMany({
            where: {
              OR: [
                ...(serviceIds.length ? [{ id: { in: this.uniqueBigInts(serviceIds) } }] : []),
                ...(serviceCodes.length ? [{ code: { in: [...new Set(serviceCodes)] } }] : []),
              ],
            },
            select: { id: true, code: true, name: true },
          })
        : [],
      cardIds.length
        ? this.prisma.memberCard.findMany({
            where: { id: { in: this.uniqueBigInts(cardIds) } },
            select: { id: true, name: true },
          })
        : [],
      categoryIds.length
        ? this.prisma.serviceCategory.findMany({
            where: { id: { in: this.uniqueBigInts(categoryIds) } },
            select: { id: true, name: true },
          })
        : [],
    ])

    const serviceById = new Map(services.map(item => [String(item.id), item.name]))
    const serviceByCode = new Map(services.map(item => [item.code, item.name]))
    const cardById = new Map(cards.map(item => [String(item.id), item.name]))
    const categoryById = new Map(categories.map(item => [String(item.id), item.name]))

    for (const link of links) {
      if (link.targetType === 'service') {
        result.set(String(link.id), (link.targetId && serviceById.get(String(link.targetId))) || (link.targetCode && serviceByCode.get(link.targetCode)) || '')
      }
      else if (link.targetType === 'member_card') {
        result.set(String(link.id), (link.targetId && cardById.get(String(link.targetId))) || '')
      }
      else if (link.targetType === 'category') {
        result.set(String(link.id), (link.targetId && categoryById.get(String(link.targetId))) || '')
      }
      else {
        result.set(String(link.id), '首页')
      }
    }

    return result
  }

  private async resolveSingleTargetName(link: PromotionLinkRecord) {
    const names = await this.resolveAdminTargetNames([link])
    return names.get(String(link.id)) || ''
  }

  private presentAdminLink(link: PromotionLinkRecord, targetName: string) {
    const resolvedPath = this.adminResolvedPath(link)
    return {
      id: String(link.id),
      linkKey: link.linkKey,
      title: link.title,
      description: link.description || '',
      targetType: link.targetType,
      targetTypeLabel: this.targetTypeLabel(link.targetType),
      targetId: link.targetId ? String(link.targetId) : '',
      targetCode: link.targetCode || '',
      targetName,
      source: link.source,
      campaignId: link.campaignId ? String(link.campaignId) : '',
      miniappPath: this.miniappPath(link),
      resolvedPath,
      sortOrder: link.sortOrder,
      status: this.activeStatus(link.status),
      startAt: link.startAt ? this.formatDateTime(link.startAt) : '',
      endAt: link.endAt ? this.formatDateTime(link.endAt) : '',
      updatedAt: this.formatDateTime(link.updatedAt),
    }
  }

  private adminResolvedPath(link: PromotionLinkRecord) {
    const source = link.source || 'channels'
    if (link.targetType === 'service') {
      const params: Record<string, string | number | undefined> = {
        source,
        promotionKey: link.linkKey,
        campaignId: link.campaignId ? Number(link.campaignId) : undefined,
      }
      if (link.targetCode) params.code = link.targetCode
      else if (link.targetId) params.id = Number(link.targetId)
      return this.withQuery('/pages/service/detail', params)
    }
    if (link.targetType === 'member_card') {
      return this.withQuery('/pages/member-card/detail', {
        cardId: link.targetId ? Number(link.targetId) : undefined,
        source,
        promotionKey: link.linkKey,
        campaignId: link.campaignId ? Number(link.campaignId) : undefined,
      })
    }
    if (link.targetType === 'category') {
      return this.withQuery('/pages/service/list', {
        categoryId: link.targetId ? Number(link.targetId) : undefined,
        source,
        promotionKey: link.linkKey,
        campaignId: link.campaignId ? Number(link.campaignId) : undefined,
      })
    }
    return this.homePath(link)
  }

  private miniappPath(link: Pick<PromotionLinkRecord, 'linkKey'>) {
    return this.withQuery(MINIAPP_LANDING_PATH, { key: link.linkKey })
  }

  private homePath(link: Pick<PromotionLinkRecord, 'linkKey' | 'source' | 'campaignId'>) {
    return this.withQuery(MINIAPP_HOME_PATH, {
      source: link.source || 'channels',
      promotionKey: link.linkKey,
      campaignId: link.campaignId ? Number(link.campaignId) : undefined,
    })
  }

  private withQuery(path: string, params: Record<string, string | number | undefined | null>) {
    const query = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&')
    return query ? `${path}?${query}` : path
  }

  private assertLinkEnabled(link: PromotionLinkRecord) {
    if (link.status !== 1) throw this.notFound('promotion link disabled')
    const now = new Date()
    if (link.startAt && link.startAt > now) throw this.notFound('promotion link not started')
    if (link.endAt && link.endAt <= now) throw this.notFound('promotion link expired')
  }

  private auditSnapshot(link: PromotionLinkRecord) {
    return {
      linkKey: link.linkKey,
      title: link.title,
      targetType: link.targetType,
      targetId: link.targetId ? Number(link.targetId) : null,
      targetCode: link.targetCode || null,
      source: link.source,
      campaignId: link.campaignId ? Number(link.campaignId) : null,
      sortOrder: link.sortOrder,
      status: link.status,
      startAt: link.startAt?.toISOString() || null,
      endAt: link.endAt?.toISOString() || null,
    }
  }

  private getPage(query: PromotionLinkQuery): PageMeta {
    return {
      page: this.positiveInt(query.page || query.pageNum, 1, 100000),
      pageSize: this.positiveInt(query.pageSize, 20, 100),
      keyword: query.keyword || query.keywords,
    }
  }

  private pageResult<T>(items: T[], page: PageMeta, total: number) {
    return { items, page: page.page, pageSize: page.pageSize, total }
  }

  private skip(page: PageMeta) {
    return (page.page - 1) * page.pageSize
  }

  private positiveInt(value: unknown, fallback: number, max: number) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) return fallback
    return Math.min(parsed, max)
  }

  private normalizeTargetType(value: unknown): PromotionTargetType {
    const targetType = this.optionalString(value) as PromotionTargetType | undefined
    if (targetType && TARGET_TYPES.has(targetType)) return targetType
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid targetType', 400)
  }

  private normalizeLinkKey(value: string) {
    const key = value.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(key)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid linkKey', 400)
    }
    return key
  }

  private normalizeSource(value: unknown) {
    const source = this.optionalString(value) || 'channels'
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(source)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid source', 400)
    }
    return source
  }

  private activeStatus(value: number) {
    return value === 1 ? 'active' : 'disabled'
  }

  private activeStatusToNumber(value: string) {
    if (value === 'active' || value === 'published') return 1
    if (value === 'disabled' || value === 'draft') return 0
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid status', 400)
  }

  private targetTypeLabel(value: string) {
    const map: Record<string, string> = {
      service: '服务商品',
      member_card: '会员卡商品',
      category: '服务分类',
      home: '首页',
      time: '时长卡',
      times: '次卡',
      consultation: '需咨询',
      none: '不计卡',
    }
    return map[value] || value
  }

  private requiredString(value: unknown, message: string) {
    const text = this.optionalString(value)
    if (!text) throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, message, 400)
    return text
  }

  private optionalString(value: unknown) {
    if (value === undefined || value === null) return undefined
    const text = String(value).trim()
    return text || undefined
  }

  private optionalNumber(value: unknown, fallback: number) {
    if (value === undefined || value === null || value === '') return fallback
    const number = Number(value)
    return Number.isFinite(number) ? number : fallback
  }

  private optionalPositiveBigInt(value: unknown) {
    if (value === undefined || value === null || value === '') return null
    const number = Number(value)
    if (!Number.isInteger(number) || number < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid target id', 400)
    }
    return BigInt(number)
  }

  private optionalDateOrNull(value: unknown, field: string) {
    if (!value) return null
    const normalized = String(value).includes('T') ? String(value) : String(value).replace(' ', 'T')
    const date = new Date(normalized)
    if (Number.isNaN(date.getTime())) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, `invalid ${field}`, 400)
    }
    return date
  }

  private uniqueBigInts(ids: bigint[]) {
    return [...new Set(ids.map(id => id.toString()))].map(id => BigInt(id))
  }

  private has(body: JsonRecord, key: string) {
    return Object.prototype.hasOwnProperty.call(body, key)
  }

  private formatDateTime(date: Date) {
    return DATE_TIME_FORMAT.format(date).replace(/\//g, '-')
  }

  private notFound(message: string) {
    return new BusinessException(ErrorCode.COMMON_NOT_FOUND, message, 404)
  }
}
