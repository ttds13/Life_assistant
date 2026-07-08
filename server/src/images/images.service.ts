import { Inject, Injectable } from '@nestjs/common'
import { File as FileRecord, Prisma } from '@prisma/client'
import { AdminAuditService } from '../audit-log/admin-audit.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { RequestContext } from '../common/utils/request-context'
import { PrismaService } from '../prisma/prisma.service'
import { ObjectStorageService } from '../storage/storage.service'
import type { QueryImagesDto } from './dto/query-images.dto'
import type { UpdateImageDto } from './dto/update-image.dto'

type AdminContext = NonNullable<RequestContext['user']> & {
  adminId: number
}

@Injectable()
export class ImagesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
  ) {}

  async listImages(query: QueryImagesDto) {
    const page = this.positiveInt(query.pageNum ?? query.page, 1)
    const pageSize = Math.min(this.positiveInt(query.pageSize, 20), 100)
    const where = this.buildWhere(query)

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.file.count({ where }),
      this.prisma.file.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    const items = await Promise.all(rows.map(async row => this.presentFile(row, false)))
    if (query.onlyOrphaned === true || query.onlyOrphaned === 'true') {
      return {
        items: items.filter(item => item.referenceCount === 0),
        total,
        page,
        pageSize,
      }
    }
    return { items, total, page, pageSize }
  }

  async getImage(id: number) {
    const file = await this.getFileOrThrow(id)
    return this.presentFile(file, true)
  }

  async getReferences(id: number) {
    const file = await this.getFileOrThrow(id)
    return {
      fileId: Number(file.id),
      references: await this.storage.findImageReferences(file.url),
    }
  }

  async updateImage(id: number, dto: UpdateImageDto, context: AdminContext) {
    const current = await this.getFileOrThrow(id)
    const data: Prisma.FileUpdateInput = {}
    if (dto.alt !== undefined) data.alt = this.optionalText(dto.alt, 128)
    if (dto.remark !== undefined) data.remark = this.optionalText(dto.remark, 512)
    if (dto.status !== undefined) {
      const status = String(dto.status || '').trim()
      if (!['active', 'orphaned'].includes(status)) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid image status', 400)
      }
      data.status = status
    }
    const updated = await this.prisma.file.update({ where: { id: current.id }, data })
    await this.audit.write({
      adminId: context.adminId,
      action: 'image:update',
      module: 'images',
      targetType: 'file',
      targetId: current.id,
      detail: { before: this.auditSnapshot(current), after: this.auditSnapshot(updated) },
    })
    return this.presentFile(updated, true)
  }

  async deleteImage(id: number, context: AdminContext) {
    const file = await this.getFileOrThrow(id)
    const references = await this.storage.findImageReferences(file.url)
    if (references.length) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'image is referenced and cannot be deleted', 409, { references })
    }
    const deleted = await this.storage.softDeleteFile(file.id, context.adminId)
    await this.audit.write({
      adminId: context.adminId,
      action: 'image:delete',
      module: 'images',
      targetType: 'file',
      targetId: file.id,
      detail: { file: this.auditSnapshot(file) },
    })
    return this.presentFile(deleted, true)
  }

  private async presentFile(file: FileRecord, includeReferences: boolean) {
    const references = includeReferences ? await this.storage.findImageReferences(file.url) : []
    const referenceCount = includeReferences ? references.length : (await this.storage.findImageReferences(file.url)).length
    const displayUrl = file.status === 'deleted' ? file.url : this.storage.signNullableUrl(file.url) || file.url
    return {
      id: String(file.id),
      uuid: file.uuid,
      filename: file.filename,
      url: file.url,
      displayUrl,
      signedUrl: displayUrl,
      storageKey: file.storageKey,
      bizType: file.bizType,
      bizId: file.bizId ? String(file.bizId) : '',
      uploaderType: file.uploaderType,
      uploaderId: String(file.uploaderId),
      source: file.source || '',
      visibility: file.visibility,
      alt: file.alt || '',
      remark: file.remark || '',
      mimeType: file.mimeType,
      size: Number(file.size),
      status: file.status,
      referenceCount,
      references,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
      deletedAt: file.deletedAt?.toISOString() || null,
      deletedBy: file.deletedBy ? String(file.deletedBy) : '',
    }
  }

  private buildWhere(query: QueryImagesDto): Prisma.FileWhereInput {
    const where: Prisma.FileWhereInput = {}
    const keyword = String(query.keyword || '').trim()
    if (keyword) {
      where.OR = [
        { filename: { contains: keyword } },
        { url: { contains: keyword } },
        { storageKey: { contains: keyword } },
        { bizType: { contains: keyword } },
        { remark: { contains: keyword } },
      ]
    }
    if (query.bizType) where.bizType = String(query.bizType)
    if (query.uploaderType) where.uploaderType = String(query.uploaderType)
    if (query.source) where.source = String(query.source)
    if (query.status) where.status = String(query.status)
    if (query.bizId) where.bizId = BigInt(query.bizId)
    if (query.uploaderId) where.uploaderId = BigInt(query.uploaderId)
    const createdAt: Prisma.DateTimeFilter = {}
    if (query.dateStart) createdAt.gte = this.parseDate(query.dateStart)
    if (query.dateEnd) createdAt.lte = this.parseDate(query.dateEnd)
    if (createdAt.gte || createdAt.lte) where.createdAt = createdAt
    return where
  }

  private async getFileOrThrow(id: number) {
    const file = await this.prisma.file.findUnique({ where: { id: BigInt(id) } })
    if (!file) throw new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'image not found', 404)
    return file
  }

  private positiveInt(value: unknown, fallback: number) {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
  }

  private parseDate(value: unknown) {
    const date = new Date(String(value))
    if (Number.isNaN(date.getTime())) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid date', 400)
    }
    return date
  }

  private optionalText(value: unknown, max: number) {
    const text = String(value || '').trim()
    return text ? text.slice(0, max) : null
  }

  private auditSnapshot(file: FileRecord) {
    return {
      id: Number(file.id),
      bizType: file.bizType,
      bizId: file.bizId ? Number(file.bizId) : null,
      url: file.url,
      status: file.status,
      alt: file.alt || '',
      remark: file.remark || '',
    }
  }
}
