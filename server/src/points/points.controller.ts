import { Body, Controller, Get, HttpCode, Inject, Param, Put, Query, Req, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard'
import { RequireAdminPermissions } from '../admin-auth/admin-permission.decorator'
import { ADMIN_PERMISSION } from '../admin-auth/admin-permissions'
import { AdminAuditService } from '../audit-log/admin-audit.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { getRequestId, RequestWithContext } from '../common/utils/request-context'
import { PointsService } from './points.service'

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminPointsController {
  constructor(
    @Inject(PointsService) private readonly points: PointsService,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
  ) {}

  @Get('point-reward-rules')
  @RequireAdminPermissions(ADMIN_PERMISSION.POINT_RULE_LIST)
  listRules() {
    return this.points.listRules()
  }

  @Put('point-reward-rules/:code')
  @RequireAdminPermissions(ADMIN_PERMISSION.POINT_RULE_PUBLISH)
  @HttpCode(200)
  async publishRule(@Req() request: RequestWithContext, @Param('code') code: string, @Body() body: Record<string, unknown>) {
    const adminId = this.adminId(request)
    const rule = await this.points.publishRule(code, body, adminId)
    await this.audit.write({
      adminId,
      action: 'point-rule:publish',
      module: 'points',
      targetType: 'point_reward_rule',
      targetId: rule.ruleId,
      requestId: getRequestId(request),
      ip: request.ip,
      detail: { code, version: rule.version, status: rule.status, earnPointsPerYuan: rule.earnPointsPerYuan, redemptionPointsPerYuan: rule.redemptionPointsPerYuan },
    })
    return rule
  }

  @Put('point-reward-rules/:code/status')
  @RequireAdminPermissions(ADMIN_PERMISSION.POINT_RULE_UPDATE)
  @HttpCode(200)
  async updateRuleStatus(@Req() request: RequestWithContext, @Param('code') code: string, @Body() body: { status?: string }) {
    const rule = await this.points.setRuleStatus(code, String(body.status || 'inactive'))
    await this.audit.write({
      adminId: this.adminId(request),
      action: 'point-rule:status:update',
      module: 'points',
      targetType: 'point_reward_rule',
      targetId: rule.id,
      requestId: getRequestId(request),
      ip: request.ip,
      detail: { code, status: rule.status },
    })
    return { code: rule.code, status: rule.status }
  }

  @Get('point-reward-events')
  @RequireAdminPermissions(ADMIN_PERMISSION.FINANCE_POINT_LIST)
  listEvents(@Query() query: { page?: number, pageSize?: number, keyword?: string }) {
    return this.points.listRewardEvents(query)
  }

  private adminId(request: RequestWithContext) {
    const id = request.user?.adminId || request.user?.userId
    if (!id) throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, 'missing admin identity', 403)
    return id
  }
}
