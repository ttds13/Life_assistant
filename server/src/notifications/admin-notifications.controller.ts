import { Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard'
import { RequireAdminPermissions } from '../admin-auth/admin-permission.decorator'
import { ADMIN_PERMISSION } from '../admin-auth/admin-permissions'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import type { RequestWithContext } from '../common/utils/request-context'
import { NotificationsService } from './notifications.service'

@Controller('admin/notifications')
@UseGuards(AdminAuthGuard)
export class AdminNotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get()
  @RequireAdminPermissions(ADMIN_PERMISSION.ORDER_LIST)
  list(@Req() request: RequestWithContext, @Query() query: { page?: number, pageSize?: number, isRead?: string }) {
    this.assertAdmin(request)
    return this.notifications.listAdminNotifications(query)
  }

  @Get('unread-count')
  @RequireAdminPermissions(ADMIN_PERMISSION.ORDER_LIST)
  unreadCount(@Req() request: RequestWithContext) {
    this.assertAdmin(request)
    return this.notifications.getAdminUnreadCount()
  }

  @Post(':id/read')
  @RequireAdminPermissions(ADMIN_PERMISSION.ORDER_LIST)
  @HttpCode(200)
  read(@Req() request: RequestWithContext, @Param('id') idText: string) {
    this.assertAdmin(request)
    return this.notifications.markAdminNotificationRead(this.parseId(idText))
  }

  private assertAdmin(request: RequestWithContext) {
    if (!request.user?.adminId) {
      throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, 'admin required', 403)
    }
  }

  private parseId(value: string) {
    const id = Number(value)
    if (!Number.isInteger(id) || id < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid id', 400)
    }
    return id
  }
}
