import { Inject, Injectable } from '@nestjs/common'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import type { RequestContext } from '../common/utils/request-context'
import { ObjectStorageService } from '../storage/storage.service'
import type { UploadActorType } from '../storage/storage.types'

@Injectable()
export class UploadService {
  constructor(@Inject(ObjectStorageService) private readonly storage: ObjectStorageService) {}

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

    const uploaderType: UploadActorType = options.user.userType === 'admin' ? 'admin' : 'user'
    return this.storage.putImage({
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
      bizType: options.bizType,
      bizId: options.bizId,
      actor: {
        uploaderType,
        uploaderId: options.user.userId,
      },
    })
  }
}
