import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard'
import { RequireAdminPermissions } from '../admin-auth/admin-permission.decorator'
import { ADMIN_PERMISSION } from '../admin-auth/admin-permissions'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { StaffIdentityService } from '../auth/staff-identity.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { getRequestId, RequestWithContext } from '../common/utils/request-context'
import { ReviewStaffProfileChangeDto } from './dto/review-staff-profile-change.dto'
import { SubmitStaffProfileChangeDto } from './dto/submit-staff-profile-change.dto'
import { StaffProfileChangeService } from './staff-profile-change.service'

@Controller()
export class StaffProfileChangeController {
  constructor(
    @Inject(StaffProfileChangeService) private readonly service: StaffProfileChangeService,
    @Inject(StaffIdentityService) private readonly staffIdentity: StaffIdentityService,
  ) {}

  @Post('staff/profile/change-requests')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async submit(@Req() request: RequestWithContext, @Body() dto: SubmitStaffProfileChangeDto) {
    return this.service.submitStaffProfileChange(await this.staffIdentity.resolveStaffId(request), dto)
  }

  @Get('staff/profile/change-requests')
  @UseGuards(JwtAuthGuard)
  async listMine(@Req() request: RequestWithContext, @Query() query: { page?: number, pageSize?: number }) {
    return this.service.listStaffRequests(await this.staffIdentity.resolveStaffId(request), query)
  }

  @Get('staff/profile/change-requests/latest')
  @UseGuards(JwtAuthGuard)
  async latestMine(@Req() request: RequestWithContext) {
    return this.service.getStaffLatestRequest(await this.staffIdentity.resolveStaffId(request))
  }

  @Get('staff/profile/change-requests/:id')
  @UseGuards(JwtAuthGuard)
  async detailMine(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.service.getStaffRequest(await this.staffIdentity.resolveStaffId(request), this.parseId(idText))
  }

  @Post('staff/profile/change-requests/:id/cancel')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async cancelMine(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.service.cancelStaffRequest(await this.staffIdentity.resolveStaffId(request), this.parseId(idText))
  }

  @Get('admin/staff-profile-change-requests')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.STAFF_PROFILE_CHANGE_VIEW)
  listAdmin(@Query() query: {
    page?: number
    pageSize?: number
    keyword?: string
    staffId?: string
    status?: string
    changeType?: string
    startDate?: string
    endDate?: string
  }) {
    return this.service.listAdminRequests(query)
  }

  @Get('admin/staff-profile-change-requests/:id')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.STAFF_PROFILE_CHANGE_VIEW)
  detailAdmin(@Param('id') idText: string) {
    return this.service.getAdminRequestDetail(this.parseId(idText))
  }

  @Post('admin/staff-profile-change-requests/:id/review')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.STAFF_PROFILE_CHANGE_REVIEW)
  @HttpCode(200)
  reviewAdmin(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: ReviewStaffProfileChangeDto) {
    return this.service.reviewAdminRequest(
      this.parseId(idText),
      this.parseAdminId(request),
      dto,
      getRequestId(request),
      this.getClientIp(request),
    )
  }

  @Get('admin/staff/:id/profile-history')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.STAFF_PROFILE_CHANGE_VIEW)
  historyAdmin(@Param('id') idText: string) {
    return this.service.getAdminStaffProfileHistory(this.parseId(idText))
  }

  private parseId(value: string) {
    const id = Number(value)
    if (!Number.isInteger(id) || id < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid id', 400)
    }
    return id
  }

  private parseAdminId(request: RequestWithContext) {
    if (request.user?.userType === 'admin' || request.user?.adminId) {
      return request.user.adminId || request.user.userId
    }
    throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, 'admin required', 403)
  }

  private getClientIp(request: RequestWithContext) {
    const forwardedFor = request.headers['x-forwarded-for']
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
      return forwardedFor.split(',')[0].trim()
    }
    if (Array.isArray(forwardedFor) && forwardedFor[0]) {
      return forwardedFor[0].split(',')[0].trim()
    }
    return request.ip
  }
}
