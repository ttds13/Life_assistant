import { Body, Controller, Get, Inject, Put, Req, UseGuards } from '@nestjs/common'
import type { RequestWithContext } from '../common/utils/request-context'
import { AdminAuthGuard } from './admin-auth.guard'
import { AdminAuthService } from './admin-auth.service'

@Controller('v1/users')
@UseGuards(AdminAuthGuard)
export class AdminProfileController {
  constructor(@Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService) {}

  @Get('profile')
  getProfile(@Req() request: RequestWithContext) {
    return this.adminAuthService.getProfile(request.user!.adminId!)
  }

  @Put('profile')
  updateProfile(
    @Req() request: RequestWithContext,
    @Body() dto: { nickname?: string, avatar?: string, gender?: number },
  ) {
    return this.adminAuthService.updateProfile(request.user!.adminId!, dto)
  }
}
