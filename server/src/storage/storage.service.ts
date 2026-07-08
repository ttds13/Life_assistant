import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import type { PutImageInput, PutImageResult } from './storage.types'
import { normalizeImageBizType } from './image-biz-types'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

type OssClient = {
  put: (name: string, file: Buffer, options?: Record<string, unknown>) => Promise<unknown>
  signatureUrl: (name: string, options?: Record<string, unknown>) => string
}

@Injectable()
export class ObjectStorageService {
  private ossClient: OssClient | null = null

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async putImage(input: PutImageInput): Promise<PutImageResult> {
    input.mimeType = this.normalizeImageMime(input.buffer, input.mimeType)

    if (this.isAliyunOssEnabled()) {
      return this.putImageToOss(input)
    }

    return this.putImageToLocal(input)
  }

  signUrl(urlOrKey: string, expiresSeconds = this.signedUrlExpiresSeconds()): string {
    if (!urlOrKey) return ''
    if (!this.isAliyunOssEnabled()) return urlOrKey
    const key = this.extractObjectKey(urlOrKey)
    if (!key) return urlOrKey
    try {
      return this.getOssClient().signatureUrl(key, {
        expires: expiresSeconds,
        method: 'GET',
      })
    }
    catch {
      return ''
    }
  }

  signNullableUrl(url?: string | null): string {
    return url ? this.signUrl(url) : ''
  }

  signUrlList(urls: string[]): string[] {
    return urls.map(url => this.signUrl(url) || url)
  }

  defaultAvatarUrl() {
    return this.config.get<string>('DEFAULT_AVATAR_URL', '').trim()
  }

  defaultAvatarDisplayUrl() {
    const url = this.defaultAvatarUrl()
    return this.signNullableUrl(url) || url
  }

  resolveAvatarUrls(url?: string | null) {
    const value = String(url || '').trim()
    const avatarOssUrl = this.isAliyunOssEnabled()
      ? (this.extractObjectKey(value) ? value : '')
      : (this.isManagedPermanentUrl(value) ? value : '')
    const avatarDisplayUrl = this.signNullableUrl(avatarOssUrl) || avatarOssUrl || this.defaultAvatarDisplayUrl()
    return {
      avatarOssUrl,
      avatarDisplayUrl,
      avatar: avatarDisplayUrl,
    }
  }

  isOssUploadEnabled() {
    return this.isAliyunOssEnabled()
  }

  assertPermanentOssUrl(url?: string | null, options?: { force?: boolean }) {
    if (!url) return
    if (this.isTemporaryImageUrl(url)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'temporary image url cannot be saved', 400)
    }
    if (!this.isAliyunOssEnabled() && this.isLocalUploadUrl(url)) return
    if (!options?.force && !this.isAliyunOssEnabled()) return
    let parsed: URL
    try {
      parsed = new URL(url)
    }
    catch {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, '图片链接格式不正确', 400)
    }

    const publicBase = new URL(this.publicBaseUrl())
    if (parsed.host !== publicBase.host) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, '图片链接必须使用配置的 OSS 域名', 400)
    }
    const objectKey = decodeURIComponent(parsed.pathname).replace(/^\/+/, '')
    if (!this.isAllowedObjectKey(objectKey)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, '图片链接必须位于允许的 OSS 目录', 400)
    }
    const signatureParams = [
      'Expires',
      'Signature',
      'OSSAccessKeyId',
      'x-oss-signature',
      'x-oss-expires',
      'x-oss-credential',
      'x-oss-date',
      'x-oss-security-token',
    ]
    if (signatureParams.some(name => parsed.searchParams.has(name))) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, '不能保存临时签名图片链接', 400)
    }
    if (objectKey.includes('..') || objectKey.includes('\\') || objectKey.includes('\0')) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, '图片链接路径不合法', 400)
    }
  }

  assertPermanentImageUrl(url?: string | null, options?: { force?: boolean }) {
    return this.assertPermanentOssUrl(url, options)
  }

  isManagedPermanentUrl(url?: string | null) {
    if (!url || this.isTemporaryImageUrl(url)) return false
    return this.isLocalUploadUrl(url) || Boolean(this.extractObjectKey(url))
  }

  async bindFilesToBiz(urls: Array<string | null | undefined>, bizType: string, bizId: number | bigint | string) {
    const normalizedUrls = [...new Set(urls.map(url => String(url || '').trim()).filter(Boolean))]
    if (!normalizedUrls.length) return { count: 0 }
    const result = await this.prisma.file.updateMany({
      where: { url: { in: normalizedUrls } },
      data: {
        bizType: normalizeImageBizType(bizType),
        bizId: BigInt(bizId),
        status: 'active',
      },
    })
    return { count: result.count }
  }

  async softDeleteFile(fileId: number | bigint, adminId: number | bigint) {
    return this.prisma.file.update({
      where: { id: BigInt(fileId) },
      data: {
        status: 'deleted',
        deletedAt: new Date(),
        deletedBy: BigInt(adminId),
      },
    })
  }

  async findImageReferences(url: string) {
    const value = String(url || '').trim()
    const references: Array<{
      type: string
      table: string
      field: string
      recordId: number
      title: string
      adminPath?: string
    }> = []
    if (!value) return references

    const [
      users,
      staffAvatars,
      staffApplications,
      services,
      serviceImages,
      banners,
      servicePhotos,
      checkins,
      reviewImages,
      feedbacks,
      ticketMessages,
    ] = await Promise.all([
      this.prisma.user.findMany({ where: { avatarUrl: value }, select: { id: true, nickname: true, phone: true } }),
      this.prisma.staff.findMany({ where: { avatarUrl: value }, select: { id: true, name: true, phone: true } }),
      this.prisma.staff.findMany({ select: { id: true, name: true, applicationImages: true } }),
      this.prisma.service.findMany({ where: { coverImage: value }, select: { id: true, name: true, code: true } }),
      this.prisma.serviceImage.findMany({ where: { url: value }, select: { id: true, serviceId: true, service: { select: { name: true, code: true } } } }),
      this.prisma.homeBanner.findMany({ where: { imageUrl: value }, select: { id: true, title: true } }),
      this.prisma.servicePhoto.findMany({ where: { url: value }, select: { id: true, orderId: true, order: { select: { orderNo: true } } } }),
      this.prisma.serviceCheckin.findMany({ where: { photoUrl: value }, select: { id: true, orderId: true, order: { select: { orderNo: true } } } }),
      this.prisma.reviewImage.findMany({ where: { url: value }, select: { id: true, reviewId: true } }),
      this.prisma.feedback.findMany({ select: { id: true, feedbackNo: true, images: true } }),
      this.prisma.ticketMessage.findMany({ select: { id: true, ticketId: true, images: true, ticket: { select: { ticketNo: true, title: true } } } }),
    ])

    users.forEach(item => references.push({
      type: 'user_avatar',
      table: 'users',
      field: 'avatar_url',
      recordId: Number(item.id),
      title: item.nickname || item.phone || `User ${Number(item.id)}`,
      adminPath: '/users/list',
    }))
    staffAvatars.forEach(item => references.push({
      type: 'staff_avatar',
      table: 'staff',
      field: 'avatar_url',
      recordId: Number(item.id),
      title: item.name || item.phone || `Staff ${Number(item.id)}`,
      adminPath: '/staff/list',
    }))
    staffApplications
      .filter(item => this.jsonStringArray(item.applicationImages).includes(value))
      .forEach(item => references.push({
        type: 'staff_application',
        table: 'staff',
        field: 'application_images',
        recordId: Number(item.id),
        title: item.name || `Staff ${Number(item.id)}`,
        adminPath: '/staff/audit',
      }))
    services.forEach(item => references.push({
      type: 'service_cover',
      table: 'services',
      field: 'cover_image',
      recordId: Number(item.id),
      title: item.name || item.code,
      adminPath: '/services/items',
    }))
    serviceImages.forEach(item => references.push({
      type: 'service_image',
      table: 'service_images',
      field: 'url',
      recordId: Number(item.id),
      title: item.service?.name || item.service?.code || `Service ${Number(item.serviceId)}`,
      adminPath: '/services/items',
    }))
    banners.forEach(item => references.push({
      type: 'home_banner',
      table: 'home_banners',
      field: 'image_url',
      recordId: Number(item.id),
      title: item.title,
      adminPath: '/images/home-banners',
    }))
    servicePhotos.forEach(item => references.push({
      type: 'service_finish_photo',
      table: 'service_photos',
      field: 'url',
      recordId: Number(item.id),
      title: item.order?.orderNo || `Order ${Number(item.orderId)}`,
      adminPath: `/orders/detail/${Number(item.orderId)}`,
    }))
    checkins.forEach(item => references.push({
      type: 'service_checkin_photo',
      table: 'service_checkins',
      field: 'photo_url',
      recordId: Number(item.id),
      title: item.order?.orderNo || `Order ${Number(item.orderId)}`,
      adminPath: `/orders/detail/${Number(item.orderId)}`,
    }))
    reviewImages.forEach(item => references.push({
      type: 'review_image',
      table: 'review_images',
      field: 'url',
      recordId: Number(item.id),
      title: `Review ${Number(item.reviewId)}`,
      adminPath: '/after-sales/reviews',
    }))
    feedbacks
      .filter(item => this.jsonStringArray(item.images).includes(value))
      .forEach(item => references.push({
        type: 'feedback_image',
        table: 'feedbacks',
        field: 'images',
        recordId: Number(item.id),
        title: item.feedbackNo,
        adminPath: '/after-sales/feedbacks',
      }))
    ticketMessages
      .filter(item => this.jsonStringArray(item.images).includes(value))
      .forEach(item => references.push({
        type: 'after_sales_image',
        table: 'ticket_messages',
        field: 'images',
        recordId: Number(item.id),
        title: item.ticket?.ticketNo || item.ticket?.title || `Ticket ${Number(item.ticketId)}`,
        adminPath: '/after-sales/tickets',
      }))

    return references
  }

  extractObjectKey(urlOrKey: string): string {
    if (!urlOrKey) return ''
    if (!/^https?:\/\//i.test(urlOrKey)) {
      const key = urlOrKey.replace(/^\/+/, '')
      return this.isAllowedObjectKey(key) ? key : ''
    }
    try {
      const parsed = new URL(urlOrKey)
      const publicBase = new URL(this.publicBaseUrl())
      if (parsed.host !== publicBase.host) return ''
      const key = decodeURIComponent(parsed.pathname).replace(/^\/+/, '')
      return this.isAllowedObjectKey(key) ? key : ''
    }
    catch {
      return ''
    }
  }

  private async putImageToOss(input: PutImageInput): Promise<PutImageResult> {
    const storageKey = this.createObjectKey(input)
    const client = this.getOssClient()
    await client.put(storageKey, input.buffer, {
      headers: {
        'Content-Type': input.mimeType,
        'x-oss-forbid-overwrite': 'true',
      },
    })

    const url = `${this.publicBaseUrl()}/${encodeURI(storageKey).replace(/%2F/g, '/')}`
    const expiresIn = this.signedUrlExpiresSeconds()
    const signedUrl = this.signUrl(storageKey, expiresIn)
    const fileRecord = await this.createFileRecord(input, { url, storageKey })

    return {
      id: fileRecord?.id ? Number(fileRecord.id) : undefined,
      uuid: fileRecord?.uuid,
      url,
      signedUrl,
      displayUrl: signedUrl || url,
      storageKey,
      bizType: normalizeImageBizType(input.bizType),
      bizId: input.bizId === undefined || input.bizId === null || input.bizId === '' ? null : Number(input.bizId),
      mimeType: input.mimeType,
      size: input.buffer.length,
      expiresIn,
    }
  }

  private async putImageToLocal(input: PutImageInput): Promise<PutImageResult> {
    const uploadDir = this.config.get<string>('UPLOAD_DIR', 'uploads')
    const absoluteDir = path.isAbsolute(uploadDir)
      ? uploadDir
      : path.join(process.cwd(), uploadDir)
    if (!fs.existsSync(absoluteDir)) {
      fs.mkdirSync(absoluteDir, { recursive: true })
    }

    const ext = this.extensionForMime(input.mimeType)
    const filename = `${crypto.randomUUID()}${ext}`
    const filepath = path.join(absoluteDir, filename)
    fs.writeFileSync(filepath, input.buffer)

    const baseUrl = this.config.get<string>('SERVER_BASE_URL', '')
    const apiPrefix = this.config.get<string>('API_PREFIX', '/api').replace(/^\/?/, '/').replace(/\/$/, '')
    const url = baseUrl
      ? `${baseUrl}${apiPrefix}/upload/files/${filename}`
      : `${apiPrefix}/upload/files/${filename}`
    const fileRecord = await this.createFileRecord(input, { url, storageKey: filename })

    return {
      id: fileRecord?.id ? Number(fileRecord.id) : undefined,
      uuid: fileRecord?.uuid,
      url,
      signedUrl: url,
      displayUrl: url,
      storageKey: filename,
      bizType: normalizeImageBizType(input.bizType),
      bizId: input.bizId === undefined || input.bizId === null || input.bizId === '' ? null : Number(input.bizId),
      mimeType: input.mimeType,
      size: input.buffer.length,
      expiresIn: 0,
    }
  }

  private async createFileRecord(input: PutImageInput, file: { url: string, storageKey: string }) {
    try {
      return await this.prisma.file.create({
        data: {
          uploaderType: input.actor.uploaderType,
          uploaderId: BigInt(input.actor.uploaderId),
          bizType: normalizeImageBizType(input.bizType),
          bizId: input.bizId === undefined || input.bizId === null || input.bizId === ''
            ? null
            : BigInt(input.bizId),
          filename: input.originalName || path.basename(file.storageKey),
          url: file.url,
          storageKey: file.storageKey,
          mimeType: input.mimeType,
          size: BigInt(input.buffer.length),
          source: input.source,
          status: 'active',
        },
      })
    }
    catch {
      // Upload should not fail only because the audit record failed.
      return null
    }
  }

  private getOssClient(): OssClient {
    if (this.ossClient) return this.ossClient
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const OSS = require('ali-oss')
    this.ossClient = new OSS({
      region: this.config.get<string>('OSS_REGION', 'oss-cn-shenzhen'),
      endpoint: this.config.get<string>('OSS_ENDPOINT', 'https://oss-cn-shenzhen.aliyuncs.com'),
      bucket: this.config.get<string>('OSS_BUCKET', 'gym-face-bucket'),
      accessKeyId: this.config.get<string>('OSS_ACCESS_KEY_ID', ''),
      accessKeySecret: this.config.get<string>('OSS_ACCESS_KEY_SECRET', ''),
      authorizationV4: this.config.get<string>('OSS_SIGNATURE_VERSION', 'v4') === 'v4',
    })
    return this.ossClient!
  }

  private isAliyunOssEnabled() {
    const provider = this.config.get<string>('STORAGE_PROVIDER', '').trim()
    return provider === 'aliyun-oss' && !!this.config.get<string>('OSS_ACCESS_KEY_ID', '') && !!this.config.get<string>('OSS_ACCESS_KEY_SECRET', '')
  }

  private isTemporaryImageUrl(url: string) {
    return /^(wxfile:\/\/|blob:|http:\/\/tmp|https:\/\/tmp|file:\/\/)/i.test(url)
      || /^[a-zA-Z]:[\\/]/.test(url)
  }

  private isLocalUploadUrl(url: string) {
    const apiPrefix = this.config.get<string>('API_PREFIX', '/api').replace(/^\/?/, '/').replace(/\/$/, '')
    const uploadPrefix = `${apiPrefix}/upload/files/`
    if (url.startsWith(uploadPrefix)) return true
    try {
      const parsed = new URL(url)
      const serverBase = this.config.get<string>('SERVER_BASE_URL', '')
      if (serverBase) {
        const base = new URL(serverBase)
        return parsed.host === base.host && parsed.pathname.startsWith(uploadPrefix)
      }
      return ['localhost', '127.0.0.1'].includes(parsed.hostname) && parsed.pathname.startsWith(uploadPrefix)
    }
    catch {
      return false
    }
  }

  private jsonStringArray(value: unknown) {
    return Array.isArray(value) ? value.map(item => typeof item === 'string' ? item : '').filter(Boolean) : []
  }

  private publicBaseUrl() {
    return this.config.get<string>('OSS_PUBLIC_BASE_URL', 'https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com').replace(/\/+$/, '')
  }

  private uploadPrefix() {
    return this.config.get<string>('OSS_UPLOAD_PREFIX', 'life-assitant/prod').replace(/^\/+|\/+$/g, '')
  }

  private allowedObjectPrefixes() {
    return [...new Set([this.uploadPrefix(), 'life-assitant'].filter(Boolean))]
  }

  private isAllowedObjectKey(key: string) {
    return this.allowedObjectPrefixes().some(prefix => key === prefix || key.startsWith(`${prefix}/`))
  }

  private signedUrlExpiresSeconds() {
    const value = Number(this.config.get<string | number>('OSS_SIGNED_URL_EXPIRES_SECONDS', 900))
    if (!Number.isFinite(value) || value <= 0) return 900
    return Math.min(Math.max(Math.floor(value), 60), 1800)
  }

  private createObjectKey(input: PutImageInput) {
    const now = new Date()
    const yyyy = String(now.getFullYear())
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const ext = this.extensionForMime(input.mimeType)
    const safeBizType = this.safePathSegment(normalizeImageBizType(input.bizType))
    const actorType = this.safePathSegment(input.actor.uploaderType)
    const actorId = this.safePathSegment(String(input.actor.uploaderId))
    return `${this.uploadPrefix()}/${safeBizType}/${actorType}/${actorId}/${yyyy}/${mm}/${crypto.randomUUID()}${ext}`
  }

  private safePathSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_') || 'unknown'
  }

  private extensionForMime(mimeType: string) {
    if (mimeType === 'image/png') return '.png'
    if (mimeType === 'image/webp') return '.webp'
    return '.jpg'
  }

  private normalizeImageMime(buffer: Buffer, mimeType: string) {
    if (buffer.length > 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF)
      return 'image/jpeg'

    if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])))
      return 'image/png'

    if (buffer.length > 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP')
      return 'image/webp'

    if (['image/jpeg', 'image/png', 'image/webp'].includes(mimeType))
      return mimeType

    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, '仅支持 jpeg/png/webp 图片', 400)
  }
}
