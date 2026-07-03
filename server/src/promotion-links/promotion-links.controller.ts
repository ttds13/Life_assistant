import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { getRequestId, RequestWithContext } from '../common/utils/request-context'
import { AdminPageQueryDto, AdminStatusDto } from '../admin-business/dto/admin-business.dto'
import { PromotionLinksService } from './promotion-links.service'

@Controller()
export class PromotionLinksController {
  constructor(@Inject(PromotionLinksService) private readonly service: PromotionLinksService) {}

  @Get('promotion-links/:key')
  resolvePublicLink(@Param('key') key: string) {
    return this.service.resolvePublicLink(key)
  }

  @Get('admin/promotion-links/target-options')
  @UseGuards(AdminAuthGuard)
  listTargetOptions(@Query('targetType') targetType?: string, @Query('keyword') keyword?: string) {
    return this.service.listTargetOptions(targetType, keyword)
  }

  @Get('admin/promotion-links')
  @UseGuards(AdminAuthGuard)
  listAdminLinks(@Query() query: AdminPageQueryDto) {
    return this.service.listAdminLinks(query)
  }

  @Post('admin/promotion-links')
  @UseGuards(AdminAuthGuard)
  @HttpCode(200)
  createAdminLink(@Req() request: RequestWithContext, @Body() body: Record<string, unknown>) {
    return this.service.createAdminLink(body, this.context(request))
  }

  @Put('admin/promotion-links/:id')
  @UseGuards(AdminAuthGuard)
  @HttpCode(200)
  updateAdminLink(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: Record<string, unknown>) {
    return this.service.updateAdminLink(this.parseId(idText), body, this.context(request))
  }

  @Put('admin/promotion-links/:id/status')
  @UseGuards(AdminAuthGuard)
  @HttpCode(200)
  updateAdminLinkStatus(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminStatusDto) {
    return this.service.updateAdminLinkStatus(this.parseId(idText), dto.status, this.context(request))
  }

  @Delete('admin/promotion-links/:id')
  @UseGuards(AdminAuthGuard)
  @HttpCode(200)
  deleteAdminLink(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.service.deleteAdminLink(this.parseId(idText), this.context(request))
  }

  private parseId(value: string) {
    const id = Number(value)
    if (!Number.isInteger(id) || id < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid id', 400)
    }
    return id
  }

  private context(request: RequestWithContext) {
    const adminId = request.user?.adminId || request.user?.userId
    if (!adminId) {
      throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, 'missing admin identity', 403)
    }
    return {
      adminId,
      requestId: getRequestId(request),
      ip: this.getClientIp(request),
    }
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
