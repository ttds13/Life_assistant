import { Body, Controller, Get, HttpCode, Inject, Param, Put, Query, Req, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard'
import { RequireAdminPermissions } from '../admin-auth/admin-permission.decorator'
import { ADMIN_PERMISSION } from '../admin-auth/admin-permissions'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { AdminAuditService } from '../audit-log/admin-audit.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { getRequestId, RequestWithContext } from '../common/utils/request-context'
import { ReferralsService } from './referrals.service'

@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(@Inject(ReferralsService) private readonly referrals: ReferralsService) {}

  @Get('me/invitation')
  getMyInvitation(@Req() request: RequestWithContext) {
    return this.referrals.getMyInvitation(request.user!.userId)
  }

  @Get('me/summary')
  getMySummary(@Req() request: RequestWithContext) {
    return this.referrals.getMySummary(request.user!.userId)
  }

  @Get('me/rewards')
  listMyRewards(@Req() request: RequestWithContext, @Query() query: { page?: number, pageSize?: number }) {
    return this.referrals.listMyRewards(request.user!.userId, query)
  }

  @Put('bind')
  @HttpCode(200)
  bind(@Req() request: RequestWithContext, @Body() body: { source?: string, inviteToken?: string, shareCode?: string }) {
    return this.referrals.bind(request.user!.userId, body)
  }
}

@Controller('admin/referrals')
@UseGuards(AdminAuthGuard)
export class AdminReferralsController {
  constructor(
    @Inject(ReferralsService) private readonly referrals: ReferralsService,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
  ) {}

  @Get('bindings')
  @RequireAdminPermissions(ADMIN_PERMISSION.REFERRAL_LIST)
  listBindings(@Query() query: { page?: number, pageSize?: number, keyword?: string, status?: string }) {
    return this.referrals.listBindings(query)
  }

  @Put('bindings/:id/review')
  @RequireAdminPermissions(ADMIN_PERMISSION.REFERRAL_REVIEW)
  @HttpCode(200)
  async review(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: { status?: string, riskLevel?: string, riskReason?: string }) {
    const id = Number(idText)
    if (!Number.isInteger(id) || id < 1) throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid referral binding id', 400)
    const adminId = request.user?.adminId || request.user?.userId
    if (!adminId) throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, 'missing admin identity', 403)
    const binding = await this.referrals.reviewBinding(id, body, adminId)
    await this.audit.write({
      adminId,
      action: 'referral:binding:review',
      module: 'referral',
      targetType: 'referral_binding',
      targetId: id,
      requestId: getRequestId(request),
      ip: request.ip,
      detail: { status: binding.status, riskLevel: binding.riskLevel, riskReason: binding.riskReason },
    })
    return binding
  }
}
