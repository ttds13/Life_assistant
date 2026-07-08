import { Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard'
import { RequireAdminPermissions } from '../admin-auth/admin-permission.decorator'
import { ADMIN_PERMISSION } from '../admin-auth/admin-permissions'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { getRequestId, RequestWithContext } from '../common/utils/request-context'
import { NotificationsService } from './notifications.service'

@Controller()
@UseGuards(AdminAuthGuard)
export class AdminStaffNotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get('admin/staff-notifications')
  @RequireAdminPermissions(ADMIN_PERMISSION.STAFF_NOTIFICATION_VIEW)
  list(@Query() query: {
    page?: number
    pageSize?: number
    keyword?: string
    staffId?: string
    orderId?: string
    orderNo?: string
    type?: string
    bizType?: string
    sendStatus?: string
    isRead?: string
    startDate?: string
    endDate?: string
  }) {
    return this.notifications.listAdminStaffNotifications(query)
  }

  @Get('admin/staff/:id/notifications')
  @RequireAdminPermissions(ADMIN_PERMISSION.STAFF_NOTIFICATION_VIEW)
  listByStaff(@Param('id') idText: string, @Query() query: { page?: number, pageSize?: number }) {
    return this.notifications.listAdminStaffNotificationsByStaff(this.parseId(idText), query)
  }

  @Get('admin/staff-notifications/:id')
  @RequireAdminPermissions(ADMIN_PERMISSION.STAFF_NOTIFICATION_VIEW)
  detail(@Param('id') idText: string) {
    return this.notifications.getAdminStaffNotificationDetail(this.parseId(idText))
  }

  @Post('admin/staff-notifications/:id/resend')
  @RequireAdminPermissions(ADMIN_PERMISSION.STAFF_NOTIFICATION_RESEND)
  @HttpCode(200)
  resend(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.notifications.resendStaffNotification(
      this.parseId(idText),
      this.parseAdminId(request),
      getRequestId(request),
      this.getClientIp(request),
    )
  }

  @Post('admin/orders/:id/resend-staff-notification')
  @RequireAdminPermissions(ADMIN_PERMISSION.STAFF_NOTIFICATION_RESEND)
  @HttpCode(200)
  resendByOrder(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.notifications.resendOrderStaffNotification(
      this.parseId(idText),
      this.parseAdminId(request),
      getRequestId(request),
      this.getClientIp(request),
    )
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
