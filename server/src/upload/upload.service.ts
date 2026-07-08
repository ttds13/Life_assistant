import { Inject, Injectable } from '@nestjs/common'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import type { RequestContext } from '../common/utils/request-context'
import { ObjectStorageService } from '../storage/storage.service'
import { isAllowedImageBizType, normalizeImageBizType } from '../storage/image-biz-types'
import type { UploadActorType } from '../storage/storage.types'

@Injectable()
export class UploadService {
  constructor(@Inject(ObjectStorageService) private readonly storage: ObjectStorageService) {}

  saveImageBase64(options: {
    imageBase64?: string
    mimeType?: string
    fileName?: string
    bizType?: string
    bizId?: string
    user?: RequestContext['user']
  }) {
    if (!options.user) {
      throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, 'not logged in', 401)
    }
    const bizType = this.normalizeBizType(options.bizType)
    this.assertOssReadyForPersistentImage(bizType)

    const rawBase64 = (options.imageBase64 || '').trim()
    if (!rawBase64) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'imageBase64 is required', 400)
    }

    const match = rawBase64.match(/^data:([^;]+);base64,(.+)$/)
    const mimeType = (match?.[1] || options.mimeType || 'image/jpeg').trim()
    const payload = match?.[2] || rawBase64
    let buffer: Buffer
    try {
      buffer = Buffer.from(payload, 'base64')
    }
    catch {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid imageBase64', 400)
    }

    if (!buffer.length) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'imageBase64 is empty', 400)
    }
    if (buffer.length > 5 * 1024 * 1024) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'file too large', 400)
    }

    const uploaderType: UploadActorType = options.user.userType === 'admin' ? 'admin' : 'user'
    return this.storage.putImage({
      buffer,
      mimeType,
      originalName: options.fileName || 'avatar',
      bizType,
      bizId: options.bizId,
      source: this.sourceForUser(options.user),
      actor: {
        uploaderType,
        uploaderId: options.user.userId,
      },
    })
  }

  saveImage(file: Express.Multer.File | undefined, options: {
    bizType?: string
    bizId?: string
    user?: RequestContext['user']
  }) {
    if (!file) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'file is required', 400)
    }
    if (!options.user) {
      throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, 'not logged in', 401)
    }
    const bizType = this.normalizeBizType(options.bizType)
    this.assertOssReadyForPersistentImage(bizType)

    const uploaderType: UploadActorType = options.user.userType === 'admin' ? 'admin' : 'user'
    return this.storage.putImage({
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
      bizType,
      bizId: options.bizId,
      source: this.sourceForUser(options.user),
      actor: {
        uploaderType,
        uploaderId: options.user.userId,
      },
    })
  }

  private normalizeBizType(bizType?: string) {
    if (bizType && !isAllowedImageBizType(bizType)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid image bizType', 400)
    }
    return normalizeImageBizType(bizType)
  }

  private sourceForUser(user?: RequestContext['user']) {
    if (user?.userType === 'admin') return 'admin'
    if (user?.userType === 'staff') return 'miniapp_staff'
    return 'miniapp_user'
  }

  private assertOssReadyForPersistentImage(bizType?: string) {
    const labels: Record<string, string> = {
      home_banner: '首页轮播图',
      user_avatar: '用户头像',
      staff_avatar: '师傅头像',
    }
    const label = bizType ? labels[bizType] : ''
    if (!label) return
    if (this.storage.isOssUploadEnabled()) return
    throw new BusinessException(
      ErrorCode.COMMON_BAD_REQUEST,
      `${label}上传必须先配置 OSS 存储`,
      400,
    )
  }
}
