import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard'
import { RequireAdminPermissions } from '../admin-auth/admin-permission.decorator'
import { ADMIN_PERMISSION } from '../admin-auth/admin-permissions'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { getRequestId, RequestWithContext } from '../common/utils/request-context'
import { SubmitFeedbackDto } from './dto/submit-feedback.dto'
import { SubmitStaffApplicationDto } from './dto/submit-staff-application.dto'
import { SupportService } from './support.service'

@Controller()
export class SupportController {
  constructor(@Inject(SupportService) private readonly support: SupportService) {}

  @Get('staff/applications/me')
  @UseGuards(JwtAuthGuard)
  getMyStaffApplication(@Req() request: RequestWithContext) {
    return this.support.getMyStaffApplication(request.user!.userId)
  }

  @Post('staff/applications')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  submitStaffApplication(@Req() request: RequestWithContext, @Body() dto: SubmitStaffApplicationDto) {
    return this.support.submitStaffApplication(request.user!.userId, dto)
  }

  @Post('feedback')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  submitFeedback(@Req() request: RequestWithContext, @Body() dto: SubmitFeedbackDto) {
    return this.support.submitFeedback(request.user!.userId, dto)
  }

  @Get('feedback/my')
  @UseGuards(JwtAuthGuard)
  listMyFeedback(@Req() request: RequestWithContext) {
    return this.support.listMyFeedback(request.user!.userId)
  }

  @Get('support/config')
  getSupportConfig() {
    return this.support.getSupportConfig()
  }

  @Get('support/faqs')
  listSupportFaqs() {
    return this.support.listSupportFaqs()
  }

  @Get('admin/support-config')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.SUPPORT_CONTENT_LIST)
  listAdminSupportConfig(@Query() query: Record<string, unknown>) {
    return this.support.listAdminSupportConfig({
      page: Number(query.page || query.pageNum || 1),
      pageSize: Number(query.pageSize || 20),
    })
  }

  @Put('admin/support-config/:id')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.SUPPORT_CONTENT_UPDATE)
  @HttpCode(200)
  updateSupportConfig(
    @Req() request: RequestWithContext,
    @Param('id') idText: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.support.updateSupportConfig(this.parseId(idText), body, this.context(request))
  }

  @Get('admin/faqs')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.SUPPORT_CONTENT_LIST)
  listAdminFaqs(@Query() query: Record<string, unknown>) {
    return this.support.listAdminFaqs({
      page: Number(query.page || query.pageNum || 1),
      pageSize: Number(query.pageSize || 20),
      status: typeof query.status === 'string' ? query.status : undefined,
      keyword: typeof query.keyword === 'string'
        ? query.keyword
        : typeof query.keywords === 'string' ? query.keywords : undefined,
    })
  }

  @Post('admin/faqs')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.SUPPORT_CONTENT_CREATE)
  @HttpCode(200)
  createFaq(@Req() request: RequestWithContext, @Body() body: Record<string, unknown>) {
    return this.support.createFaq(body, this.context(request))
  }

  @Put('admin/faqs/:id')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.SUPPORT_CONTENT_UPDATE)
  @HttpCode(200)
  updateFaq(
    @Req() request: RequestWithContext,
    @Param('id') idText: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.support.updateFaq(this.parseId(idText), body, this.context(request))
  }

  @Put('admin/faqs/:id/status')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.SUPPORT_CONTENT_UPDATE)
  @HttpCode(200)
  updateFaqStatus(
    @Req() request: RequestWithContext,
    @Param('id') idText: string,
    @Body() body: { status?: string },
  ) {
    return this.support.updateFaqStatus(this.parseId(idText), String(body?.status || ''), this.context(request))
  }

  @Delete('admin/faqs/:id')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.SUPPORT_CONTENT_DELETE)
  @HttpCode(200)
  deleteFaq(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.support.deleteFaq(this.parseId(idText), this.context(request))
  }

  @Get('admin/feedbacks')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.AFTER_SALES_FEEDBACK_LIST)
  listAdminFeedback(@Query() query: Record<string, unknown>) {
    return this.support.listAdminFeedback({
      page: Number(query.page || query.pageNum || 1),
      pageSize: Number(query.pageSize || 20),
      status: typeof query.status === 'string' ? query.status : undefined,
      keyword: typeof query.keyword === 'string'
        ? query.keyword
        : typeof query.keywords === 'string' ? query.keywords : undefined,
    })
  }

  @Get('admin/feedbacks/:id')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.AFTER_SALES_FEEDBACK_LIST)
  getAdminFeedback(@Param('id') idText: string) {
    return this.support.getAdminFeedback(this.parseId(idText))
  }

  @Put('admin/feedbacks/:id/status')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.AFTER_SALES_FEEDBACK_RESOLVE)
  @HttpCode(200)
  updateFeedbackStatus(
    @Req() request: RequestWithContext,
    @Param('id') idText: string,
    @Body() body: { status?: string },
  ) {
    return this.support.updateFeedbackStatus(this.parseId(idText), String(body?.status || ''), this.context(request))
  }

  @Post('admin/feedbacks/:id/reply')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.AFTER_SALES_FEEDBACK_REPLY)
  @HttpCode(200)
  replyFeedback(
    @Req() request: RequestWithContext,
    @Param('id') idText: string,
    @Body() body: { reply?: string, content?: string, status?: string },
  ) {
    return this.support.replyFeedback(
      this.parseId(idText),
      String(body?.reply || body?.content || ''),
      body?.status,
      this.context(request),
    )
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
