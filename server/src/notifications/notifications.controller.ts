import { Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { StaffIdentityService } from '../auth/staff-identity.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import type { RequestWithContext } from '../common/utils/request-context'
import { NotificationsService } from './notifications.service'

@Controller('staff/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(StaffIdentityService) private readonly staffIdentity: StaffIdentityService,
  ) {}

  @Get()
  async list(@Req() request: RequestWithContext, @Query() query: { page?: number, pageSize?: number }) {
    return this.notifications.listStaffNotifications(await this.staffIdentity.resolveStaffId(request), query)
  }

  @Get('unread-count')
  async unreadCount(@Req() request: RequestWithContext) {
    return this.notifications.getStaffUnreadCount(await this.staffIdentity.resolveStaffId(request))
  }

  @Post('read-by-order/:orderId')
  @HttpCode(200)
  async readByOrder(@Req() request: RequestWithContext, @Param('orderId') orderIdText: string) {
    return this.notifications.markStaffOrderNotificationsRead(
      await this.staffIdentity.resolveStaffId(request),
      this.parseId(orderIdText),
    )
  }

  @Post(':id/read')
  @HttpCode(200)
  async read(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.notifications.markStaffNotificationRead(
      await this.staffIdentity.resolveStaffId(request),
      this.parseId(idText),
    )
  }

  private parseId(value: string) {
    const id = Number(value)
    if (!Number.isInteger(id) || id < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid id', 400)
    }
    return id
  }
}
