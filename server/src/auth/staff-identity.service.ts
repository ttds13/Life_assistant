import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import type { RequestWithContext } from '../common/utils/request-context'
import { AuthService } from './auth.service'

@Injectable()
export class StaffIdentityService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  async resolveStaffId(request: RequestWithContext) {
    const userId = request.user?.userId
    if (!userId) {
      throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, 'user not found', 401)
    }

    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new BusinessException(ErrorCode.STAFF_FORBIDDEN, 'staff auth is not configured', 403)
    }

    const session = await this.authService.createDevStaffSession(userId)
    const headerStaffId = this.parseHeaderStaffId(request)
    if (headerStaffId && headerStaffId !== session.staffId) {
      throw new BusinessException(ErrorCode.STAFF_FORBIDDEN, 'staff identity does not belong to current user', 403)
    }

    return session.staffId
  }

  private parseHeaderStaffId(request: RequestWithContext) {
    const header = request.headers['x-staff-id']
    const raw = Array.isArray(header) ? header[0] : header
    if (raw === undefined || raw === '') {
      return null
    }

    const staffId = Number(raw)
    if (!Number.isInteger(staffId) || staffId < 1) {
      throw new BusinessException(ErrorCode.STAFF_FORBIDDEN, 'invalid staff identity', 403)
    }
    return staffId
  }
}
