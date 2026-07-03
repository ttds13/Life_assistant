import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { getRequestId, RequestWithContext } from '../common/utils/request-context'
import { AdminBusinessService } from './admin-business.service'
import { AdminAuditReviewDto, AdminPageQueryDto, AdminStatusDto, AdminTicketMessageDto, AdminUserRoleDto } from './dto/admin-business.dto'

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminBusinessController {
  constructor(@Inject(AdminBusinessService) private readonly service: AdminBusinessService) {}

  @Get('dashboard')
  getDashboard() {
    return this.service.getDashboard()
  }

  @Get('users')
  listUsers(@Query() query: AdminPageQueryDto) {
    return this.service.listUsers(query)
  }

  @Get('users/:id')
  getUser(@Param('id') idText: string) {
    return this.service.getUser(this.parseId(idText))
  }

  @Put('users/:id')
  @HttpCode(200)
  updateUser(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: Record<string, unknown>) {
    return this.service.updateUser(this.parseId(idText), body, this.context(request))
  }

  @Put('users/:id/status')
  @HttpCode(200)
  updateUserStatus(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminStatusDto) {
    return this.service.updateUserStatus(this.parseId(idText), dto, this.context(request))
  }

  @Put('users/:id/role')
  @HttpCode(200)
  updateUserRole(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminUserRoleDto) {
    return this.service.updateUserRole(this.parseId(idText), dto, this.context(request))
  }

  @Delete('users/:id')
  @HttpCode(200)
  deleteUser(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.service.deleteUser(this.parseId(idText), this.context(request))
  }

  @Get('service-categories')
  listServiceCategories(@Query() query: AdminPageQueryDto) {
    return this.service.listServiceCategories(query)
  }

  @Post('service-categories')
  @HttpCode(200)
  createServiceCategory(@Req() request: RequestWithContext, @Body() body: Record<string, unknown>) {
    return this.service.createServiceCategory(body, this.context(request))
  }

  @Put('service-categories/:id')
  @HttpCode(200)
  updateServiceCategory(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: Record<string, unknown>) {
    return this.service.updateServiceCategory(this.parseId(idText), body, this.context(request))
  }

  @Put('service-categories/:id/status')
  @HttpCode(200)
  updateServiceCategoryStatus(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminStatusDto) {
    return this.service.updateServiceCategoryStatus(this.parseId(idText), dto, this.context(request))
  }

  @Delete('service-categories/:id')
  @HttpCode(200)
  deleteServiceCategory(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.service.deleteServiceCategory(this.parseId(idText), this.context(request))
  }

  @Get('services')
  listServices(@Query() query: AdminPageQueryDto) {
    return this.service.listServices(query)
  }

  @Post('services')
  @HttpCode(200)
  createService(@Req() request: RequestWithContext, @Body() body: Record<string, unknown>) {
    return this.service.createService(body, this.context(request))
  }

  @Put('services/:id')
  @HttpCode(200)
  updateService(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: Record<string, unknown>) {
    return this.service.updateService(this.parseId(idText), body, this.context(request))
  }

  @Put('services/:id/status')
  @HttpCode(200)
  updateServiceStatus(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminStatusDto) {
    return this.service.updateServiceStatus(this.parseId(idText), dto, this.context(request))
  }

  @Delete('services/:id')
  @HttpCode(200)
  deleteService(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.service.deleteService(this.parseId(idText), this.context(request))
  }

  @Get('home-banners')
  listHomeBanners(@Query() query: AdminPageQueryDto) {
    return this.service.listHomeBanners(query)
  }

  @Post('home-banners')
  @HttpCode(200)
  createHomeBanner(@Req() request: RequestWithContext, @Body() body: Record<string, unknown>) {
    return this.service.createHomeBanner(body, this.context(request))
  }

  @Put('home-banners/:id')
  @HttpCode(200)
  updateHomeBanner(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: Record<string, unknown>) {
    return this.service.updateHomeBanner(this.parseId(idText), body, this.context(request))
  }

  @Put('home-banners/:id/status')
  @HttpCode(200)
  updateHomeBannerStatus(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminStatusDto) {
    return this.service.updateHomeBannerStatus(this.parseId(idText), dto, this.context(request))
  }

  @Delete('home-banners/:id')
  @HttpCode(200)
  deleteHomeBanner(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.service.deleteHomeBanner(this.parseId(idText), this.context(request))
  }

  @Get('fulfillments')
  listFulfillments(@Query() query: AdminPageQueryDto) {
    return this.service.listFulfillments(query)
  }

  @Get('staff')
  listStaff(@Query() query: AdminPageQueryDto) {
    return this.service.listStaff(query)
  }

  @Post('staff')
  @HttpCode(200)
  createStaff(@Req() request: RequestWithContext, @Body() body: Record<string, unknown>) {
    return this.service.createStaff(body, this.context(request))
  }

  @Put('staff/:id')
  @HttpCode(200)
  updateStaff(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: Record<string, unknown>) {
    return this.service.updateStaff(this.parseId(idText), body, this.context(request))
  }

  @Put('staff/:id/status')
  @HttpCode(200)
  updateStaffStatus(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminStatusDto) {
    return this.service.updateStaffStatus(this.parseId(idText), dto, this.context(request))
  }

  @Delete('staff/:id')
  @HttpCode(200)
  deleteStaff(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.service.deleteStaff(this.parseId(idText), this.context(request))
  }

  @Get('staff/status')
  listStaffStatus(@Query() query: AdminPageQueryDto) {
    return this.service.listStaffStatus(query)
  }

  @Get('payments')
  listPayments(@Query() query: AdminPageQueryDto) {
    return this.service.listPayments(query)
  }

  @Get('reviews')
  listReviews(@Query() query: AdminPageQueryDto) {
    return this.service.listReviews(query)
  }

  @Put('reviews/:id/status')
  @HttpCode(200)
  updateReviewStatus(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminStatusDto) {
    return this.service.updateReviewStatus(this.parseId(idText), dto, this.context(request))
  }

  @Get('coupons')
  listCoupons(@Query() query: AdminPageQueryDto) {
    return this.service.listCoupons(query)
  }

  @Post('coupons')
  @HttpCode(200)
  createCoupon(@Req() request: RequestWithContext, @Body() body: Record<string, unknown>) {
    return this.service.createCoupon(body, this.context(request))
  }

  @Put('coupons/:id')
  @HttpCode(200)
  updateCoupon(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: Record<string, unknown>) {
    return this.service.updateCoupon(this.parseId(idText), body, this.context(request))
  }

  @Put('coupons/:id/status')
  @HttpCode(200)
  updateCouponStatus(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminStatusDto) {
    return this.service.updateCouponStatus(this.parseId(idText), dto, this.context(request))
  }

  @Get('member-cards')
  listMemberCards(@Query() query: AdminPageQueryDto) {
    return this.service.listMemberCards(query)
  }

  @Post('member-cards')
  @HttpCode(200)
  createMemberCard(@Req() request: RequestWithContext, @Body() body: Record<string, unknown>) {
    return this.service.createMemberCard(body, this.context(request))
  }

  @Put('member-cards/:id')
  @HttpCode(200)
  updateMemberCard(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: Record<string, unknown>) {
    return this.service.updateMemberCard(this.parseId(idText), body, this.context(request))
  }

  @Put('member-cards/:id/status')
  @HttpCode(200)
  updateMemberCardStatus(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminStatusDto) {
    return this.service.updateMemberCardStatus(this.parseId(idText), dto, this.context(request))
  }

  @Get('user-member-cards')
  listUserMemberCards(@Query() query: AdminPageQueryDto) {
    return this.service.listUserMemberCards(query)
  }

  @Get('user-member-cards/:id')
  getUserMemberCard(@Param('id') idText: string) {
    return this.service.getUserMemberCard(this.parseId(idText))
  }

  @Put('user-member-cards/:id/status')
  @HttpCode(200)
  updateUserMemberCardStatus(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminStatusDto) {
    return this.service.updateUserMemberCardStatus(this.parseId(idText), dto, this.context(request))
  }

  @Get('member-card-records')
  listMemberCardRecords(@Query() query: AdminPageQueryDto) {
    return this.service.listMemberCardRecords(query)
  }

  @Get('audits')
  listAudits(@Query() query: AdminPageQueryDto) {
    return this.service.listAuditItems(query.type, query)
  }

  @Post('audits/:id/review')
  @HttpCode(200)
  reviewAuditItem(@Req() request: RequestWithContext, @Param('id') id: string, @Body() dto: AdminAuditReviewDto) {
    return this.service.reviewAuditItem(id, dto, this.context(request))
  }

  @Post('refunds/:id/review')
  @HttpCode(200)
  reviewRefund(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminAuditReviewDto) {
    return this.service.reviewRefund(this.parseId(idText), dto, this.context(request))
  }

  @Post('withdraw-requests/:id/review')
  @HttpCode(200)
  reviewWithdraw(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminAuditReviewDto) {
    return this.service.reviewWithdraw(this.parseId(idText), dto, this.context(request))
  }

  @Post('tickets/:id/resolve')
  @HttpCode(200)
  resolveTicket(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminAuditReviewDto) {
    return this.service.reviewTicket(this.parseId(idText), { ...dto, action: 'approve' }, this.context(request))
  }

  @Post('tickets/:id/messages')
  @HttpCode(200)
  addTicketMessage(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminTicketMessageDto) {
    return this.service.addTicketMessage(this.parseId(idText), dto.content, this.context(request))
  }

  @Get('audit-logs')
  listAuditLogs(@Query() query: AdminPageQueryDto) {
    return this.service.listAuditLogs(query)
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
