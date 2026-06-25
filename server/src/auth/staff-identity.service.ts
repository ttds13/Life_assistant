import { Inject, Injectable } from '@nestjs/common'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import type { RequestWithContext } from '../common/utils/request-context'
import { AuthService } from './auth.service'

@Injectable()
export class StaffIdentityService {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  async resolveStaffId(request: RequestWithContext) {
    const userId = request.user?.userId
    if (!userId) {
      throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, 'user not found', 401)
    }

    const staff = await this.authService.findActiveStaffForUser(userId)
    if (!staff) {
      throw new BusinessException(ErrorCode.STAFF_FORBIDDEN, 'staff role is not enabled', 403)
    }

    return Number(staff.id)
  }
}
