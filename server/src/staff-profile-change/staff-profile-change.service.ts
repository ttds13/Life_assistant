import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { NotificationsService } from '../notifications/notifications.service'
import { PrismaService } from '../prisma/prisma.service'
import { IMAGE_BIZ_TYPE } from '../storage/image-biz-types'
import { ObjectStorageService } from '../storage/storage.service'
import type { ReviewStaffProfileChangeDto } from './dto/review-staff-profile-change.dto'
import type { SubmitStaffProfileChangeDto } from './dto/submit-staff-profile-change.dto'

type StaffSnapshot = {
  name: string
  avatarUrl: string | null
  cityCode: string | null
  skills: unknown[]
  idCard: string | null
  applicationNote: string | null
  applicationImages: string[]
}

type StaffProfileChangeQuery = {
  page?: number | string
  pageSize?: number | string
  keyword?: string
  staffId?: number | string
  status?: string
  changeType?: string
  startDate?: string
  endDate?: string
}

const REVIEWED_FIELDS: Array<keyof StaffSnapshot> = [
  'name',
  'avatarUrl',
  'cityCode',
  'skills',
  'idCard',
  'applicationNote',
  'applicationImages',
]

@Injectable()
export class StaffProfileChangeService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async submitStaffProfileChange(staffId: number, dto: SubmitStaffProfileChangeDto) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: BigInt(staffId), status: 1, deletedAt: null },
      select: {
        id: true,
        userId: true,
        name: true,
        avatarUrl: true,
        cityCode: true,
        skills: true,
        idCard: true,
        applicationNote: true,
        applicationImages: true,
      },
    })
    if (!staff) {
      throw new BusinessException(ErrorCode.STAFF_NOT_FOUND, 'staff not found', 404)
    }

    const existingPending = await this.prisma.staffProfileChangeRequest.findFirst({
      where: { staffId: staff.id, status: 'pending' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    if (existingPending) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'staff has pending profile change request', 409, {
        requestId: Number(existingPending.id),
        requestNo: existingPending.requestNo,
      })
    }

    const beforeSnapshot = this.staffSnapshot(staff)
    const afterSnapshot = this.nextSnapshot(beforeSnapshot, dto)
    const changedFields = REVIEWED_FIELDS.filter(field => !this.sameJson(beforeSnapshot[field], afterSnapshot[field]))
    if (!changedFields.length) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'profile change has no effective changes', 400)
    }

    this.assertSnapshotImages(afterSnapshot, changedFields)
    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.staffProfileChangeRequest.create({
        data: {
          requestNo: this.createRequestNo(),
          staffId: staff.id,
          userId: staff.userId,
          changeType: this.changeType(changedFields),
          status: 'pending',
          beforeSnapshot: beforeSnapshot as Prisma.InputJsonObject,
          afterSnapshot: afterSnapshot as Prisma.InputJsonObject,
          changedFields: changedFields as Prisma.InputJsonArray,
          submitNote: this.optionalText(dto.submitNote),
          submittedBy: staff.id,
        },
      })
      await this.writeAudit(tx, {
        operatorType: 'staff',
        operatorId: staff.id,
        action: 'staff-profile-change:submit',
        module: 'staff_profile',
        targetType: 'staff_profile_change_request',
        targetId: created.id,
        detail: {
          staffId: Number(staff.id),
          requestNo: created.requestNo,
          changedFields,
        },
      })
      return created
    })

    return this.presentRequest(request)
  }

  async listStaffRequests(staffId: number, query: { page?: number | string, pageSize?: number | string }) {
    const page = this.positiveInt(query.page, 1, 100000)
    const pageSize = this.positiveInt(query.pageSize, 20, 100)
    const where: Prisma.StaffProfileChangeRequestWhereInput = { staffId: BigInt(staffId) }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.staffProfileChangeRequest.count({ where }),
      this.prisma.staffProfileChangeRequest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    return {
      items: items.map(item => this.presentRequest(item)),
      page,
      pageSize,
      total,
    }
  }

  async getStaffLatestRequest(staffId: number) {
    const request = await this.prisma.staffProfileChangeRequest.findFirst({
      where: { staffId: BigInt(staffId) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    return request ? this.presentRequest(request) : null
  }

  async getStaffRequest(staffId: number, requestId: number) {
    const request = await this.prisma.staffProfileChangeRequest.findFirst({
      where: { id: BigInt(requestId), staffId: BigInt(staffId) },
    })
    if (!request) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'profile change request not found', 404)
    }
    return this.presentRequest(request)
  }

  async cancelStaffRequest(staffId: number, requestId: number) {
    const updated = await this.prisma.staffProfileChangeRequest.updateMany({
      where: { id: BigInt(requestId), staffId: BigInt(staffId), status: 'pending' },
      data: { status: 'cancelled' },
    })
    if (updated.count !== 1) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'pending profile change request not found', 404)
    }
    return this.getStaffRequest(staffId, requestId)
  }

  async listAdminRequests(query: StaffProfileChangeQuery) {
    const page = this.positiveInt(query.page, 1, 100000)
    const pageSize = this.positiveInt(query.pageSize, 20, 100)
    const where = await this.buildAdminWhere(query)
    const [total, items] = await this.prisma.$transaction([
      this.prisma.staffProfileChangeRequest.count({ where }),
      this.prisma.staffProfileChangeRequest.findMany({
        where,
        include: { staff: { select: { id: true, name: true, phone: true, status: true, workStatus: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    return {
      items: items.map(item => this.presentRequest(item)),
      page,
      pageSize,
      total,
    }
  }

  async getAdminRequestDetail(requestId: number) {
    const request = await this.prisma.staffProfileChangeRequest.findUnique({
      where: { id: BigInt(requestId) },
      include: { staff: { select: { id: true, name: true, phone: true, avatarUrl: true, cityCode: true, status: true, workStatus: true } } },
    })
    if (!request) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'profile change request not found', 404)
    }
    return this.presentRequest(request)
  }

  async reviewAdminRequest(requestId: number, adminId: number, dto: ReviewStaffProfileChangeDto, requestIdText?: string, ip?: string) {
    if (dto.decision === 'reject') {
      const reason = this.optionalText(dto.rejectReason)
      if (!reason) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'rejectReason is required', 400)
      }
      await this.prisma.$transaction(async (tx) => {
        const request = await tx.staffProfileChangeRequest.findUnique({ where: { id: BigInt(requestId) } })
        if (!request || request.status !== 'pending') {
          throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'profile change request is not pending', 409)
        }
        await tx.staffProfileChangeRequest.update({
          where: { id: request.id },
          data: {
            status: 'rejected',
            rejectReason: reason,
            reviewedBy: BigInt(adminId),
            reviewedAt: new Date(),
          },
        })
        await this.notifications.createStaffNotification({
          tx,
          staffId: request.staffId,
          type: 'staff_profile_change_rejected',
          title: '资料变更未通过',
          content: `资料变更申请 ${request.requestNo} 未通过：${reason}`,
          bizType: 'staff_profile_change',
          bizId: request.id,
        })
        await this.writeAudit(tx, {
          operatorType: 'admin',
          operatorId: BigInt(adminId),
          action: 'staff-profile-change:reject',
          module: 'staff_profile',
          targetType: 'staff_profile_change_request',
          targetId: request.id,
          requestId: requestIdText,
          ip,
          detail: {
            staffId: Number(request.staffId),
            requestNo: request.requestNo,
            rejectReason: reason,
            remark: dto.remark || '',
          },
        })
      })
      return this.getAdminRequestDetail(requestId)
    }

    const bindImages: { staffId?: bigint, avatarUrl?: string | null, applicationImages?: string[] } = {}
    await this.prisma.$transaction(async (tx) => {
      const request = await tx.staffProfileChangeRequest.findUnique({ where: { id: BigInt(requestId) } })
      if (!request || request.status !== 'pending') {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'profile change request is not pending', 409)
      }
      const staff = await tx.staff.findFirst({
        where: { id: request.staffId, deletedAt: null },
        select: {
          id: true,
          userId: true,
          name: true,
          avatarUrl: true,
          cityCode: true,
          skills: true,
          idCard: true,
          applicationNote: true,
          applicationImages: true,
        },
      })
      if (!staff) {
        throw new BusinessException(ErrorCode.STAFF_NOT_FOUND, 'staff not found', 404)
      }
      const beforeSnapshot = this.snapshotFromJson(request.beforeSnapshot)
      const afterSnapshot = this.snapshotFromJson(request.afterSnapshot)
      const changedFields = this.changedFieldsFromJson(request.changedFields)
      const currentSnapshot = this.staffSnapshot(staff)
      const conflictFields = changedFields.filter(field => !this.sameJson(currentSnapshot[field], beforeSnapshot[field]))
      if (conflictFields.length) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'staff profile changed after request submitted', 409, {
          conflictFields,
        })
      }

      const data = this.buildStaffUpdateData(afterSnapshot, changedFields)
      await tx.staff.update({
        where: { id: staff.id },
        data,
      })
      await tx.staffProfileChangeRequest.update({
        where: { id: request.id },
        data: {
          status: 'approved',
          reviewedBy: BigInt(adminId),
          reviewedAt: new Date(),
          appliedAt: new Date(),
        },
      })
      await this.notifications.createStaffNotification({
        tx,
        staffId: request.staffId,
        type: 'staff_profile_change_approved',
        title: '资料变更已通过',
        content: `资料变更申请 ${request.requestNo} 已审核通过。`,
        bizType: 'staff_profile_change',
        bizId: request.id,
      })
      await this.writeAudit(tx, {
        operatorType: 'admin',
        operatorId: BigInt(adminId),
        action: 'staff-profile-change:approve',
        module: 'staff_profile',
        targetType: 'staff_profile_change_request',
        targetId: request.id,
        requestId: requestIdText,
        ip,
        detail: {
          staffId: Number(request.staffId),
          requestNo: request.requestNo,
          changedFields,
          remark: dto.remark || '',
        },
      })
      bindImages.staffId = request.staffId
      bindImages.avatarUrl = changedFields.includes('avatarUrl') ? afterSnapshot.avatarUrl : undefined
      bindImages.applicationImages = changedFields.includes('applicationImages') ? afterSnapshot.applicationImages : undefined
    })

    if (bindImages.staffId && bindImages.avatarUrl) {
      await this.storage.bindFilesToBiz([bindImages.avatarUrl], IMAGE_BIZ_TYPE.STAFF_AVATAR, bindImages.staffId)
    }
    if (bindImages.staffId && bindImages.applicationImages?.length) {
      await this.storage.bindFilesToBiz(bindImages.applicationImages, IMAGE_BIZ_TYPE.STAFF_APPLICATION, bindImages.staffId)
    }
    return this.getAdminRequestDetail(requestId)
  }

  async getAdminStaffProfileHistory(staffId: number) {
    const [staff, requests, auditLogs] = await Promise.all([
      this.prisma.staff.findFirst({
        where: { id: BigInt(staffId), deletedAt: null },
        select: { id: true, name: true, phone: true, avatarUrl: true, cityCode: true, status: true, workStatus: true },
      }),
      this.prisma.staffProfileChangeRequest.findMany({
        where: { staffId: BigInt(staffId) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
      this.prisma.auditLog.findMany({
        where: {
          OR: [
            { module: 'staff', targetType: 'staff', targetId: BigInt(staffId) },
            { module: 'staff_profile', detail: { path: '$.staffId', equals: staffId } },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
    ])
    if (!staff) {
      throw new BusinessException(ErrorCode.STAFF_NOT_FOUND, 'staff not found', 404)
    }
    return {
      staff: {
        id: Number(staff.id),
        name: staff.name,
        phone: staff.phone,
        avatarUrl: staff.avatarUrl || '',
        avatarDisplayUrl: this.storage.signNullableUrl(staff.avatarUrl) || staff.avatarUrl || '',
        cityCode: staff.cityCode || '',
        status: staff.status,
        workStatus: staff.workStatus,
      },
      requests: requests.map(item => this.presentRequest(item)),
      auditLogs: auditLogs.map(item => ({
        id: Number(item.id),
        action: item.action,
        module: item.module,
        operatorType: item.operatorType,
        operatorId: Number(item.operatorId),
        detail: item.detail,
        createdAt: item.createdAt.toISOString(),
      })),
    }
  }

  async writeStaffWorkStatusLog(staffId: number, before: number, after: number) {
    await this.prisma.auditLog.create({
      data: {
        operatorType: 'staff',
        operatorId: BigInt(staffId),
        action: 'staff:work-status:update',
        module: 'staff',
        targetType: 'staff',
        targetId: BigInt(staffId),
        detail: { staffId, before, after },
      },
    })
  }

  private async buildAdminWhere(query: StaffProfileChangeQuery): Promise<Prisma.StaffProfileChangeRequestWhereInput> {
    const and: Prisma.StaffProfileChangeRequestWhereInput[] = []
    const staffId = this.optionalPositiveBigInt(query.staffId)
    if (staffId) and.push({ staffId })
    if (query.status) and.push({ status: query.status })
    if (query.changeType) and.push({ changeType: query.changeType })
    const startDate = this.optionalDate(query.startDate)
    const endDate = this.optionalDate(query.endDate)
    if (startDate || endDate) {
      and.push({
        createdAt: {
          ...(startDate ? { gte: startDate } : {}),
          ...(endDate ? { lte: endDate } : {}),
        },
      })
    }
    if (query.keyword?.trim()) {
      const keyword = query.keyword.trim()
      const staff = await this.prisma.staff.findMany({
        where: {
          OR: [
            { name: { contains: keyword } },
            { phone: { contains: keyword } },
          ],
        },
        select: { id: true },
        take: 100,
      })
      and.push({
        OR: [
          { requestNo: { contains: keyword } },
          ...(staff.length ? [{ staffId: { in: staff.map(item => item.id) } }] : []),
        ],
      })
    }
    return and.length ? { AND: and } : {}
  }

  private staffSnapshot(staff: {
    name: string
    avatarUrl: string | null
    cityCode: string | null
    skills: Prisma.JsonValue | null
    idCard: string | null
    applicationNote: string | null
    applicationImages: Prisma.JsonValue | null
  }): StaffSnapshot {
    return {
      name: staff.name,
      avatarUrl: staff.avatarUrl || null,
      cityCode: staff.cityCode || null,
      skills: this.stringArray(staff.skills),
      idCard: staff.idCard || null,
      applicationNote: staff.applicationNote || null,
      applicationImages: this.stringArray(staff.applicationImages),
    }
  }

  private nextSnapshot(before: StaffSnapshot, dto: SubmitStaffProfileChangeDto): StaffSnapshot {
    const after: StaffSnapshot = { ...before, skills: before.skills.slice(), applicationImages: before.applicationImages.slice() }
    if (dto.staffName !== undefined) {
      const name = dto.staffName.trim()
      if (!name) throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'staffName is required', 400)
      after.name = name
    }
    if (dto.avatar !== undefined) {
      const avatarUrl = dto.avatar.trim()
      this.storage.assertPermanentOssUrl(avatarUrl, { force: true })
      after.avatarUrl = avatarUrl || null
    }
    if (dto.cityCode !== undefined) after.cityCode = this.optionalText(dto.cityCode) || null
    if (dto.skills !== undefined) after.skills = dto.skills.map(item => String(item).trim()).filter(Boolean)
    if (dto.idCard !== undefined) after.idCard = this.optionalText(dto.idCard) || null
    if (dto.applicationNote !== undefined) after.applicationNote = this.optionalText(dto.applicationNote) || null
    if (dto.applicationImages !== undefined) {
      after.applicationImages = dto.applicationImages.map(item => String(item).trim()).filter(Boolean)
      after.applicationImages.forEach(url => this.storage.assertPermanentOssUrl(url))
    }
    return after
  }

  private assertSnapshotImages(snapshot: StaffSnapshot, changedFields: Array<keyof StaffSnapshot>) {
    if (changedFields.includes('avatarUrl') && snapshot.avatarUrl) {
      this.storage.assertPermanentOssUrl(snapshot.avatarUrl, { force: true })
    }
    if (changedFields.includes('applicationImages')) {
      snapshot.applicationImages.forEach(url => this.storage.assertPermanentOssUrl(url))
    }
  }

  private buildStaffUpdateData(after: StaffSnapshot, changedFields: Array<keyof StaffSnapshot>): Prisma.StaffUpdateInput {
    const data: Prisma.StaffUpdateInput = {}
    if (changedFields.includes('name')) data.name = after.name
    if (changedFields.includes('avatarUrl')) data.avatarUrl = after.avatarUrl
    if (changedFields.includes('cityCode')) data.cityCode = after.cityCode
    if (changedFields.includes('idCard')) data.idCard = after.idCard
    if (changedFields.includes('applicationNote')) data.applicationNote = after.applicationNote
    if (changedFields.includes('skills')) data.skills = after.skills as Prisma.InputJsonArray
    if (changedFields.includes('applicationImages')) data.applicationImages = after.applicationImages as Prisma.InputJsonArray
    return data
  }

  private snapshotFromJson(value: Prisma.JsonValue): StaffSnapshot {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid profile snapshot', 409)
    }
    const record = value as Record<string, unknown>
    return {
      name: String(record.name || ''),
      avatarUrl: this.optionalText(record.avatarUrl) || null,
      cityCode: this.optionalText(record.cityCode) || null,
      skills: this.stringArray(record.skills),
      idCard: this.optionalText(record.idCard) || null,
      applicationNote: this.optionalText(record.applicationNote) || null,
      applicationImages: this.stringArray(record.applicationImages),
    }
  }

  private changedFieldsFromJson(value: Prisma.JsonValue | null): Array<keyof StaffSnapshot> {
    const fields = this.stringArray(value)
    return fields.filter((field): field is keyof StaffSnapshot => (REVIEWED_FIELDS as string[]).includes(field))
  }

  private presentRequest(request: {
    id: bigint
    requestNo: string
    staffId: bigint
    userId: bigint | null
    changeType: string
    status: string
    beforeSnapshot: Prisma.JsonValue
    afterSnapshot: Prisma.JsonValue
    changedFields: Prisma.JsonValue | null
    submitNote: string | null
    rejectReason: string | null
    submittedBy: bigint | null
    reviewedBy: bigint | null
    reviewedAt: Date | null
    appliedAt: Date | null
    createdAt: Date
    updatedAt: Date
    staff?: {
      id: bigint
      name: string
      phone: string
      avatarUrl?: string | null
      cityCode?: string | null
      status: number
      workStatus: number
    } | null
  }) {
    const beforeSnapshot = this.snapshotFromJson(request.beforeSnapshot)
    const afterSnapshot = this.snapshotFromJson(request.afterSnapshot)
    return {
      id: Number(request.id),
      requestNo: request.requestNo,
      staffId: Number(request.staffId),
      userId: request.userId ? Number(request.userId) : null,
      staffName: request.staff?.name || '',
      staffPhone: request.staff?.phone || '',
      staffStatus: request.staff?.status ?? null,
      staffWorkStatus: request.staff?.workStatus ?? null,
      changeType: request.changeType,
      status: request.status,
      beforeSnapshot,
      afterSnapshot,
      changedFields: this.changedFieldsFromJson(request.changedFields),
      submitNote: request.submitNote || '',
      rejectReason: request.rejectReason || '',
      submittedBy: request.submittedBy ? Number(request.submittedBy) : null,
      reviewedBy: request.reviewedBy ? Number(request.reviewedBy) : null,
      reviewedAt: request.reviewedAt?.toISOString() || null,
      appliedAt: request.appliedAt?.toISOString() || null,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      beforeAvatarDisplayUrl: this.storage.signNullableUrl(beforeSnapshot.avatarUrl) || beforeSnapshot.avatarUrl || '',
      afterAvatarDisplayUrl: this.storage.signNullableUrl(afterSnapshot.avatarUrl) || afterSnapshot.avatarUrl || '',
      beforeApplicationImageUrls: this.storage.signUrlList(beforeSnapshot.applicationImages),
      afterApplicationImageUrls: this.storage.signUrlList(afterSnapshot.applicationImages),
    }
  }

  private changeType(changedFields: Array<keyof StaffSnapshot>) {
    const certificationFields = new Set<keyof StaffSnapshot>(['idCard', 'applicationNote', 'applicationImages'])
    const hasCertification = changedFields.some(field => certificationFields.has(field))
    const hasBasic = changedFields.some(field => !certificationFields.has(field))
    if (hasCertification && hasBasic) return 'mixed'
    if (hasCertification) return 'certification'
    return 'basic'
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.map(item => String(item)).filter(Boolean) : []
  }

  private sameJson(left: unknown, right: unknown) {
    return JSON.stringify(left) === JSON.stringify(right)
  }

  private optionalText(value: unknown) {
    if (value === undefined || value === null) return undefined
    const text = String(value).trim()
    return text || undefined
  }

  private positiveInt(value: unknown, fallback: number, max: number) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) return fallback
    return Math.min(parsed, max)
  }

  private optionalPositiveBigInt(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) return undefined
    return BigInt(parsed)
  }

  private optionalDate(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return undefined
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  }

  private createRequestNo() {
    return `SPC${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`
  }

  private writeAudit(tx: Prisma.TransactionClient, params: {
    operatorType: string
    operatorId: bigint | number
    action: string
    module: string
    targetType?: string
    targetId?: bigint | number | null
    requestId?: string
    ip?: string
    detail?: Record<string, unknown>
  }) {
    return tx.auditLog.create({
      data: {
        operatorType: params.operatorType,
        operatorId: BigInt(params.operatorId),
        action: params.action,
        module: params.module,
        targetType: params.targetType,
        targetId: params.targetId === undefined || params.targetId === null ? undefined : BigInt(params.targetId),
        requestId: params.requestId,
        ip: params.ip,
        detail: params.detail as Prisma.InputJsonObject,
      },
    })
  }
}
