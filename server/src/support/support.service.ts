import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AdminAuditService } from '../audit-log/admin-audit.service'
import { hashAdminPassword } from '../admin-auth/admin-password'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { PrismaService } from '../prisma/prisma.service'
import { IMAGE_BIZ_TYPE } from '../storage/image-biz-types'
import { ObjectStorageService } from '../storage/storage.service'
import { FEEDBACK_TYPE } from './constants/feedback-type'
import { SubmitFeedbackDto } from './dto/submit-feedback.dto'
import { SubmitStaffApplicationDto } from './dto/submit-staff-application.dto'

const STAFF_STATUS = {
  DISABLED: 0,
  ACTIVE: 1,
  PENDING: 2,
} as const

const MAX_APPLICATION_IMAGES = 6
const MAX_FEEDBACK_IMAGES = 6
const ADMIN_FEEDBACK_STATUSES = ['open', 'processing', 'closed'] as const
const SUPPORT_DEFAULT_CONFIG = {
  phone: '0469-8596888',
  consultContact: '15645777033 / 13384692200',
  serviceHours: '09:00-21:00',
  responseTime: '工作时间内通常 30 分钟内响应',
  onlineEnabled: true,
} as const

const LEGACY_SUPPORT_DEFAULT_CONFIG = {
  phone: '400-100-2026',
  wechatId: 'life-assistant-service',
} as const

const FEEDBACK_TYPE_LABELS: Record<string, string> = {
  [FEEDBACK_TYPE.BUG]: '功能异常',
  [FEEDBACK_TYPE.ORDER]: '订单问题',
  [FEEDBACK_TYPE.PAYMENT_REFUND]: '支付退款',
  [FEEDBACK_TYPE.SERVICE_EXPERIENCE]: '服务体验',
  [FEEDBACK_TYPE.SUGGESTION]: '产品建议',
  [FEEDBACK_TYPE.OTHER]: '其他',
}

const ADMIN_FEEDBACK_INCLUDE = Prisma.validator<Prisma.FeedbackInclude>()({
  user: { select: { id: true, nickname: true, phone: true } },
})

type AdminFeedbackRecord = Prisma.FeedbackGetPayload<{ include: typeof ADMIN_FEEDBACK_INCLUDE }>

interface AdminContext {
  adminId: number
  requestId?: string
  ip?: string
}

@Injectable()
export class SupportService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
  ) {}

  async getMyStaffApplication(userId: number) {
    const staff = await this.prisma.staff.findUnique({
      where: { userId: BigInt(userId) },
      include: { user: { select: { id: true, nickname: true, phone: true } } },
    })
    return staff ? this.presentStaffApplication(staff) : null
  }

  async submitStaffApplication(userId: number, dto: SubmitStaffApplicationDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { id: true, nickname: true, phone: true, status: true },
    })
    if (!user || user.status !== 1) {
      throw new BusinessException(ErrorCode.AUTH_USER_DISABLED, 'user is disabled', 403)
    }

    const skills = this.normalizeSkills(dto.skills)
    const images = this.normalizeImages(dto.images, MAX_APPLICATION_IMAGES)
    const phone = dto.phone.trim()
    const name = dto.name.trim()
    const cityCode = dto.cityCode.trim()
    const note = dto.note?.trim() || null
    const idCard = dto.idCard?.trim() || null

    const current = await this.prisma.staff.findUnique({
      where: { userId: user.id },
      include: { user: { select: { id: true, nickname: true, phone: true } } },
    })

    if (current?.status === STAFF_STATUS.ACTIVE) {
      return this.presentStaffApplication(current)
    }

    const staff = current
      ? await this.prisma.staff.update({
          where: { id: current.id },
          data: {
            name,
            phone,
            idCard,
            skills: skills as Prisma.InputJsonValue,
            cityCode,
            applicationNote: note,
            applicationImages: images.length ? images : Prisma.JsonNull,
            status: STAFF_STATUS.PENDING,
            deletedAt: null,
          },
          include: { user: { select: { id: true, nickname: true, phone: true } } },
        })
      : await this.prisma.staff.create({
          data: {
            userId: user.id,
            name,
            phone,
            passwordHash: await hashAdminPassword(`staff:${user.id}:${Date.now()}`),
            idCard,
            skills: skills as Prisma.InputJsonValue,
            cityCode,
            applicationNote: note,
            applicationImages: images.length ? images : undefined,
            status: STAFF_STATUS.PENDING,
            workStatus: 0,
          },
          include: { user: { select: { id: true, nickname: true, phone: true } } },
        })

    await this.storage.bindFilesToBiz(images, IMAGE_BIZ_TYPE.STAFF_APPLICATION, staff.id)
    return this.presentStaffApplication(staff)
  }

  async submitFeedback(userId: number, dto: SubmitFeedbackDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { id: true, phone: true, status: true },
    })
    if (!user || user.status !== 1) {
      throw new BusinessException(ErrorCode.AUTH_USER_DISABLED, 'user is disabled', 403)
    }

    const images = this.normalizeImages(dto.images, MAX_FEEDBACK_IMAGES)
    const feedback = await this.prisma.feedback.create({
      data: {
        feedbackNo: this.createFeedbackNo(),
        userId: user.id,
        type: dto.type,
        content: dto.content.trim(),
        contactPhone: dto.contactPhone?.trim() || user.phone || null,
        images: images.length ? images : undefined,
        status: 'open',
      },
    })
    await this.storage.bindFilesToBiz(images, IMAGE_BIZ_TYPE.FEEDBACK_IMAGE, feedback.id)
    return this.presentFeedback(feedback)
  }

  async listMyFeedback(userId: number) {
    const feedbacks = await this.prisma.feedback.findMany({
      where: { userId: BigInt(userId) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
    })
    return feedbacks.map(item => this.presentFeedback(item))
  }

  async getSupportConfig() {
    return this.presentSupportConfig(await this.ensureSupportConfig())
  }

  async listSupportFaqs() {
    const items = await this.prisma.supportFaq.findMany({
      where: { status: 1 },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    })
    const categories = ['全部', ...Array.from(new Set(items.map(item => item.category).filter(Boolean)))]
    return {
      categories,
      items: items.map(item => this.presentFaq(item)),
    }
  }

  async listAdminSupportConfig(query: { page?: number, pageSize?: number }) {
    const page = this.positiveInt(query.page, 1, 100000)
    const pageSize = this.positiveInt(query.pageSize, 20, 100)
    const config = await this.ensureSupportConfig()
    return { items: [this.presentSupportConfig(config)], page, pageSize, total: 1 }
  }

  async updateSupportConfig(id: number, body: Record<string, unknown>, context: AdminContext) {
    const current = await this.prisma.supportConfig.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'support config not found', 404)
    const payload = this.supportConfigPayload(body, current)
    const updated = await this.prisma.$transaction(async (tx) => {
      const config = await tx.supportConfig.update({
        where: { id: current.id },
        data: payload,
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'support:config:update',
        module: 'support',
        targetType: 'support_config',
        targetId: current.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: payload,
      })
      return config
    })
    return this.presentSupportConfig(updated)
  }

  async listAdminFaqs(query: { page?: number, pageSize?: number, status?: string, keyword?: string }) {
    const page = this.positiveInt(query.page, 1, 100000)
    const pageSize = this.positiveInt(query.pageSize, 20, 100)
    const where: Prisma.SupportFaqWhereInput = {}
    if (query.status) where.status = this.activeStatusToNumber(query.status)
    const keyword = query.keyword?.trim()
    if (keyword) {
      where.OR = [
        { category: { contains: keyword } },
        { question: { contains: keyword } },
        { answer: { contains: keyword } },
      ]
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.supportFaq.count({ where }),
      this.prisma.supportFaq.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    return { items: items.map(item => this.presentFaq(item)), page, pageSize, total }
  }

  async createFaq(body: Record<string, unknown>, context: AdminContext) {
    const payload = this.faqPayload(body)
    const created = await this.prisma.$transaction(async (tx) => {
      const faq = await tx.supportFaq.create({ data: payload })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'support:faq:create',
        module: 'support',
        targetType: 'support_faq',
        targetId: faq.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { question: faq.question },
      })
      return faq
    })
    return this.presentFaq(created)
  }

  async updateFaq(id: number, body: Record<string, unknown>, context: AdminContext) {
    const current = await this.getFaqRecord(id)
    const payload = this.faqPayload(body, current)
    const updated = await this.prisma.$transaction(async (tx) => {
      const faq = await tx.supportFaq.update({ where: { id: current.id }, data: payload })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'support:faq:update',
        module: 'support',
        targetType: 'support_faq',
        targetId: current.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.question, after: faq.question },
      })
      return faq
    })
    return this.presentFaq(updated)
  }

  async updateFaqStatus(id: number, statusText: string, context: AdminContext) {
    const current = await this.getFaqRecord(id)
    const status = this.activeStatusToNumber(statusText)
    await this.prisma.$transaction(async (tx) => {
      await tx.supportFaq.update({ where: { id: current.id }, data: { status } })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'support:faq:status:update',
        module: 'support',
        targetType: 'support_faq',
        targetId: current.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: status },
      })
    })
    return this.presentFaq(await this.getFaqRecord(id))
  }

  async deleteFaq(id: number, context: AdminContext) {
    const current = await this.getFaqRecord(id)
    await this.prisma.$transaction(async (tx) => {
      await tx.supportFaq.delete({ where: { id: current.id } })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'support:faq:delete',
        module: 'support',
        targetType: 'support_faq',
        targetId: current.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { question: current.question },
      })
    })
    return { id: String(current.id), deleted: true }
  }

  async listAdminFeedback(query: { page?: number, pageSize?: number, status?: string, keyword?: string }) {
    const page = this.positiveInt(query.page, 1, 100000)
    const pageSize = this.positiveInt(query.pageSize, 20, 100)
    const where: Prisma.FeedbackWhereInput = {}
    if (query.status && query.status !== 'all') {
      where.status = this.normalizeFeedbackStatus(query.status)
    }
    const keyword = query.keyword?.trim()
    if (keyword) {
      where.OR = [
        { feedbackNo: { contains: keyword } },
        { type: { contains: keyword } },
        { content: { contains: keyword } },
        { contactPhone: { contains: keyword } },
        { user: { nickname: { contains: keyword } } },
        { user: { phone: { contains: keyword } } },
      ]
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.feedback.count({ where }),
      this.prisma.feedback.findMany({
        where,
        include: ADMIN_FEEDBACK_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return { items: items.map(item => this.presentAdminFeedback(item)), page, pageSize, total }
  }

  async getAdminFeedback(id: number) {
    return this.presentAdminFeedback(await this.getAdminFeedbackRecord(id))
  }

  async updateFeedbackStatus(id: number, statusText: string, context: AdminContext) {
    const current = await this.getAdminFeedbackRecord(id)
    const status = this.normalizeFeedbackStatus(statusText)
    const handledAt = status === 'open' ? null : new Date()
    await this.prisma.$transaction(async (tx) => {
      await tx.feedback.update({
        where: { id: current.id },
        data: {
          status,
          handledBy: status === 'open' ? null : BigInt(context.adminId),
          handledAt,
        },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'feedback:status:update',
        module: 'after-sales',
        targetType: 'feedback',
        targetId: current.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { before: current.status, after: status },
      })
    })
    return this.getAdminFeedback(id)
  }

  async replyFeedback(id: number, replyText: string, statusText: string | undefined, context: AdminContext) {
    const current = await this.getAdminFeedbackRecord(id)
    const reply = replyText.trim()
    if (!reply) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'reply is required', 400)
    }
    const status = statusText ? this.normalizeFeedbackStatus(statusText) : 'closed'
    await this.prisma.$transaction(async (tx) => {
      await tx.feedback.update({
        where: { id: current.id },
        data: {
          reply,
          status,
          handledBy: BigInt(context.adminId),
          handledAt: new Date(),
        },
      })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'feedback:reply',
        module: 'after-sales',
        targetType: 'feedback',
        targetId: current.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: { status, reply },
      })
    })
    return this.getAdminFeedback(id)
  }

  private normalizeSkills(value: string[]) {
    const skills = value.map(item => item.trim()).filter(Boolean)
    const unique = Array.from(new Set(skills)).slice(0, 12)
    if (!unique.length) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'skill is required', 400)
    }
    return unique
  }

  private normalizeImages(images: string[] | undefined, max: number) {
    const normalized = (images || []).map(item => String(item || '').trim()).filter(Boolean)
    if (normalized.length > max) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'too many images', 400)
    }
    for (const url of normalized) {
      this.storage.assertPermanentOssUrl(url)
    }
    return normalized
  }

  private presentStaffApplication(staff: Prisma.StaffGetPayload<{
    include: { user: { select: { id: true, nickname: true, phone: true } } }
  }>) {
    return {
      id: Number(staff.id),
      name: staff.name,
      phone: staff.phone,
      cityCode: staff.cityCode || '',
      skills: Array.isArray(staff.skills) ? staff.skills.map(item => String(item)) : [],
      idCard: staff.idCard || '',
      note: staff.applicationNote || '',
      images: this.signImages(staff.applicationImages),
      imageOssUrls: this.jsonStringArray(staff.applicationImages),
      status: this.staffStatus(staff.status),
      userRole: staff.status === STAFF_STATUS.ACTIVE ? 'staff' : 'user',
      createdAt: staff.createdAt.toISOString(),
      updatedAt: staff.updatedAt.toISOString(),
    }
  }

  private presentSupportConfig(config: Prisma.SupportConfigGetPayload<Record<string, never>>) {
    return {
      id: String(config.id),
      phone: config.phone,
      wechatId: config.wechatId,
      serviceHours: config.serviceHours,
      responseTime: config.responseTime,
      onlineEnabled: config.onlineEnabled,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString(),
    }
  }

  private presentFaq(faq: Prisma.SupportFaqGetPayload<Record<string, never>>) {
    return {
      id: String(faq.id),
      category: faq.category,
      question: faq.question,
      answer: faq.answer,
      sortOrder: faq.sortOrder,
      status: this.activeStatus(faq.status),
      createdAt: faq.createdAt.toISOString(),
      updatedAt: faq.updatedAt.toISOString(),
    }
  }

  private presentFeedback(feedback: Prisma.FeedbackGetPayload<Record<string, never>>) {
    return {
      id: Number(feedback.id),
      feedbackNo: feedback.feedbackNo,
      type: feedback.type,
      content: feedback.content,
      contactPhone: feedback.contactPhone || '',
      images: this.signImages(feedback.images),
      imageOssUrls: this.jsonStringArray(feedback.images),
      status: feedback.status,
      reply: feedback.reply || '',
      handledAt: feedback.handledAt?.toISOString() || null,
      createdAt: feedback.createdAt.toISOString(),
      updatedAt: feedback.updatedAt.toISOString(),
    }
  }

  private presentAdminFeedback(feedback: AdminFeedbackRecord) {
    const images = this.signImages(feedback.images)
    return {
      id: String(feedback.id),
      feedbackNo: feedback.feedbackNo,
      type: feedback.type,
      typeLabel: FEEDBACK_TYPE_LABELS[feedback.type] || feedback.type,
      userId: String(feedback.userId),
      userName: feedback.user.nickname || `User ${Number(feedback.userId)}`,
      userPhone: feedback.user.phone || '',
      contactPhone: feedback.contactPhone || feedback.user.phone || '',
      content: feedback.content,
      images,
      imageOssUrls: this.jsonStringArray(feedback.images),
      imageCount: images.length,
      status: feedback.status,
      reply: feedback.reply || '',
      handledBy: feedback.handledBy ? Number(feedback.handledBy) : null,
      handledAt: feedback.handledAt?.toISOString() || null,
      createdAt: feedback.createdAt.toISOString(),
      updatedAt: feedback.updatedAt.toISOString(),
    }
  }

  private async getAdminFeedbackRecord(id: number) {
    const feedback = await this.prisma.feedback.findUnique({
      where: { id: BigInt(id) },
      include: ADMIN_FEEDBACK_INCLUDE,
    })
    if (!feedback) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'feedback not found', 404)
    return feedback
  }

  private async ensureSupportConfig() {
    const current = await this.prisma.supportConfig.findFirst({ orderBy: { id: 'asc' } })
    if (current) {
      const data: Prisma.SupportConfigUpdateInput = {}
      if (current.phone === LEGACY_SUPPORT_DEFAULT_CONFIG.phone)
        data.phone = SUPPORT_DEFAULT_CONFIG.phone
      if (current.wechatId === LEGACY_SUPPORT_DEFAULT_CONFIG.wechatId)
        data.wechatId = SUPPORT_DEFAULT_CONFIG.consultContact

      if (Object.keys(data).length > 0) {
        return this.prisma.supportConfig.update({
          where: { id: current.id },
          data,
        })
      }

      return current
    }

    return this.prisma.supportConfig.create({
      data: {
        phone: SUPPORT_DEFAULT_CONFIG.phone,
        wechatId: SUPPORT_DEFAULT_CONFIG.consultContact,
        serviceHours: SUPPORT_DEFAULT_CONFIG.serviceHours,
        responseTime: SUPPORT_DEFAULT_CONFIG.responseTime,
        onlineEnabled: SUPPORT_DEFAULT_CONFIG.onlineEnabled,
      },
    })
  }

  private async getFaqRecord(id: number) {
    const faq = await this.prisma.supportFaq.findUnique({ where: { id: BigInt(id) } })
    if (!faq) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'faq not found', 404)
    return faq
  }

  private supportConfigPayload(body: Record<string, unknown>, current: Prisma.SupportConfigGetPayload<Record<string, never>>) {
    return {
      phone: body.phone === undefined ? current.phone : this.requiredString(body.phone, 'phone is required'),
      wechatId: body.wechatId === undefined ? current.wechatId : this.requiredString(body.wechatId, 'wechatId is required'),
      serviceHours: body.serviceHours === undefined ? current.serviceHours : this.requiredString(body.serviceHours, 'serviceHours is required'),
      responseTime: body.responseTime === undefined ? current.responseTime : this.requiredString(body.responseTime, 'responseTime is required'),
      onlineEnabled: body.onlineEnabled === undefined ? current.onlineEnabled : this.optionalBoolean(body.onlineEnabled),
    }
  }

  private faqPayload(body: Record<string, unknown>, current?: Prisma.SupportFaqGetPayload<Record<string, never>>) {
    return {
      category: body.category === undefined && current ? current.category : this.requiredString(body.category, 'category is required'),
      question: body.question === undefined && current ? current.question : this.requiredString(body.question, 'question is required'),
      answer: body.answer === undefined && current ? current.answer : this.requiredString(body.answer, 'answer is required'),
      sortOrder: body.sortOrder === undefined && current ? current.sortOrder : this.optionalNumber(body.sortOrder, 0),
      status: body.status === undefined && current ? current.status : this.activeStatusToNumber(this.optionalString(body.status) || 'active'),
    }
  }

  private activeStatus(value: number) {
    return value === 1 ? 'active' : 'disabled'
  }

  private activeStatusToNumber(value: string) {
    if (value === 'active' || value === 'published' || value === 'true') return 1
    if (value === 'disabled' || value === 'draft' || value === 'false') return 0
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid status', 400)
  }

  private normalizeFeedbackStatus(value: string) {
    const status = value.trim()
    if ((ADMIN_FEEDBACK_STATUSES as readonly string[]).includes(status)) return status
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid feedback status', 400)
  }

  private positiveInt(value: unknown, fallback: number, max: number) {
    const numberValue = Number(value)
    if (!Number.isInteger(numberValue) || numberValue < 1) return fallback
    return Math.min(numberValue, max)
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

  private optionalNumber(value: unknown, fallback = 0) {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : fallback
  }

  private optionalBoolean(value: unknown) {
    if (value === true || value === 'true' || value === 1 || value === '1') return true
    if (value === false || value === 'false' || value === 0 || value === '0') return false
    return Boolean(value)
  }

  private staffStatus(value: number) {
    if (value === STAFF_STATUS.ACTIVE) return 'approved'
    if (value === STAFF_STATUS.PENDING) return 'pending'
    return 'rejected'
  }

  private signImages(value: Prisma.JsonValue | null | undefined) {
    return this.storage.signUrlList(this.jsonStringArray(value))
  }

  private jsonStringArray(value: Prisma.JsonValue | null | undefined) {
    if (!Array.isArray(value)) return []
    return value.map(item => typeof item === 'string' ? item : '').filter(Boolean)
  }

  private createFeedbackNo() {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const random = Math.random().toString(36).slice(2, 8).toUpperCase()
    return `FB${yyyy}${mm}${dd}${random}`
  }
}
