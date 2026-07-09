import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard'
import { RequireAdminPermissions } from '../admin-auth/admin-permission.decorator'
import { ADMIN_PERMISSION } from '../admin-auth/admin-permissions'
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
  @RequireAdminPermissions(ADMIN_PERMISSION.DASHBOARD_VIEW)
  getDashboard() {
    return this.service.getDashboard()
  }

  @Get('users')
  @RequireAdminPermissions(ADMIN_PERMISSION.USER_LIST)
  listUsers(@Query() query: AdminPageQueryDto) {
    return this.service.listUsers(query)
  }

  @Post('users')
  @RequireAdminPermissions(ADMIN_PERMISSION.USER_UPDATE)
  @HttpCode(200)
  createUser(@Req() request: RequestWithContext, @Body() body: Record<string, unknown>) {
    return this.service.createUser(body, this.context(request))
  }

  @Get('users/:id')
  @RequireAdminPermissions(ADMIN_PERMISSION.USER_DETAIL)
  getUser(@Param('id') idText: string) {
    return this.service.getUser(this.parseId(idText))
  }

  @Get('users/:id/points')
  @RequireAdminPermissions(ADMIN_PERMISSION.FINANCE_POINT_LIST)
  getUserPoints(@Param('id') idText: string) {
    return this.service.getAdminUserPoints(this.parseId(idText))
  }

  @Post('users/:id/points/adjust')
  @RequireAdminPermissions(ADMIN_PERMISSION.FINANCE_POINT_ADJUST)
  @HttpCode(200)
  adjustUserPoints(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: Record<string, unknown>) {
    return this.service.adjustUserPoints(this.parseId(idText), body, this.context(request))
  }

  @Put('users/:id')
  @RequireAdminPermissions(ADMIN_PERMISSION.USER_UPDATE)
  @HttpCode(200)
  updateUser(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: Record<string, unknown>) {
    return this.service.updateUser(this.parseId(idText), body, this.context(request))
  }

  @Put('users/:id/status')
  @RequireAdminPermissions(ADMIN_PERMISSION.USER_UPDATE)
  @HttpCode(200)
  updateUserStatus(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminStatusDto) {
    return this.service.updateUserStatus(this.parseId(idText), dto, this.context(request))
  }

  @Put('users/:id/role')
  @RequireAdminPermissions(ADMIN_PERMISSION.USER_ROLE_UPDATE)
  @HttpCode(200)
  updateUserRole(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminUserRoleDto) {
    return this.service.updateUserRole(this.parseId(idText), dto, this.context(request))
  }

  @Delete('users/:id')
  @RequireAdminPermissions(ADMIN_PERMISSION.USER_DELETE)
  @HttpCode(200)
  deleteUser(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.service.deleteUser(this.parseId(idText), this.context(request))
  }

  @Get('service-categories')
  @RequireAdminPermissions(ADMIN_PERMISSION.SERVICE_LIST)
  listServiceCategories(@Query() query: AdminPageQueryDto) {
    return this.service.listServiceCategories(query)
  }

  @Post('service-categories')
  @RequireAdminPermissions(ADMIN_PERMISSION.SERVICE_CREATE)
  @HttpCode(200)
  createServiceCategory(@Req() request: RequestWithContext, @Body() body: Record<string, unknown>) {
    return this.service.createServiceCategory(body, this.context(request))
  }

  @Put('service-categories/:id')
  @RequireAdminPermissions(ADMIN_PERMISSION.SERVICE_UPDATE)
  @HttpCode(200)
  updateServiceCategory(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: Record<string, unknown>) {
    return this.service.updateServiceCategory(this.parseId(idText), body, this.context(request))
  }

  @Put('service-categories/:id/status')
  @RequireAdminPermissions(ADMIN_PERMISSION.SERVICE_UPDATE)
  @HttpCode(200)
  updateServiceCategoryStatus(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminStatusDto) {
    return this.service.updateServiceCategoryStatus(this.parseId(idText), dto, this.context(request))
  }

  @Delete('service-categories/:id')
  @RequireAdminPermissions(ADMIN_PERMISSION.SERVICE_DELETE)
  @HttpCode(200)
  deleteServiceCategory(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.service.deleteServiceCategory(this.parseId(idText), this.context(request))
  }

  @Get('services')
  @RequireAdminPermissions(ADMIN_PERMISSION.SERVICE_LIST)
  listServices(@Query() query: AdminPageQueryDto) {
    return this.service.listServices(query)
  }

  @Post('services')
  @RequireAdminPermissions(ADMIN_PERMISSION.SERVICE_CREATE)
  @HttpCode(200)
  createService(@Req() request: RequestWithContext, @Body() body: Record<string, unknown>) {
    return this.service.createService(body, this.context(request))
  }

  @Put('services/:id')
  @RequireAdminPermissions(ADMIN_PERMISSION.SERVICE_UPDATE)
  @HttpCode(200)
  updateService(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: Record<string, unknown>) {
    return this.service.updateService(this.parseId(idText), body, this.context(request))
  }

  @Put('services/:id/status')
  @RequireAdminPermissions(ADMIN_PERMISSION.SERVICE_UPDATE)
  @HttpCode(200)
  updateServiceStatus(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminStatusDto) {
    return this.service.updateServiceStatus(this.parseId(idText), dto, this.context(request))
  }

  @Delete('services/:id')
  @RequireAdminPermissions(ADMIN_PERMISSION.SERVICE_DELETE)
  @HttpCode(200)
  deleteService(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.service.deleteService(this.parseId(idText), this.context(request))
  }

  @Get('home-banners')
  @RequireAdminPermissions(ADMIN_PERMISSION.MARKETING_PROMOTION_LIST)
  listHomeBanners(@Query() query: AdminPageQueryDto) {
    return this.service.listHomeBanners(query)
  }

  @Post('home-banners')
  @RequireAdminPermissions(ADMIN_PERMISSION.MARKETING_PROMOTION_CREATE)
  @HttpCode(200)
  createHomeBanner(@Req() request: RequestWithContext, @Body() body: Record<string, unknown>) {
    return this.service.createHomeBanner(body, this.context(request))
  }

  @Put('home-banners/:id')
  @RequireAdminPermissions(ADMIN_PERMISSION.MARKETING_PROMOTION_UPDATE)
  @HttpCode(200)
  updateHomeBanner(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: Record<string, unknown>) {
    return this.service.updateHomeBanner(this.parseId(idText), body, this.context(request))
  }

  @Put('home-banners/:id/status')
  @RequireAdminPermissions(ADMIN_PERMISSION.MARKETING_PROMOTION_UPDATE)
  @HttpCode(200)
  updateHomeBannerStatus(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminStatusDto) {
    return this.service.updateHomeBannerStatus(this.parseId(idText), dto, this.context(request))
  }

  @Delete('home-banners/:id')
  @RequireAdminPermissions(ADMIN_PERMISSION.MARKETING_PROMOTION_DELETE)
  @HttpCode(200)
  deleteHomeBanner(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.service.deleteHomeBanner(this.parseId(idText), this.context(request))
  }

  @Get('fulfillments')
  @RequireAdminPermissions(ADMIN_PERMISSION.ORDER_LIST)
  listFulfillments(@Query() query: AdminPageQueryDto) {
    return this.service.listFulfillments(query)
  }

  @Get('staff')
  @RequireAdminPermissions(ADMIN_PERMISSION.STAFF_LIST)
  listStaff(@Query() query: AdminPageQueryDto) {
    return this.service.listStaff(query)
  }

  @Post('staff')
  @RequireAdminPermissions(ADMIN_PERMISSION.STAFF_CREATE)
  @HttpCode(200)
  createStaff(@Req() request: RequestWithContext, @Body() body: Record<string, unknown>) {
    return this.service.createStaff(body, this.context(request))
  }

  @Put('staff/:id')
  @RequireAdminPermissions(ADMIN_PERMISSION.STAFF_UPDATE)
  @HttpCode(200)
  updateStaff(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: Record<string, unknown>) {
    return this.service.updateStaff(this.parseId(idText), body, this.context(request))
  }

  @Put('staff/:id/status')
  @RequireAdminPermissions(ADMIN_PERMISSION.STAFF_AUDIT)
  @HttpCode(200)
  updateStaffStatus(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminStatusDto) {
    return this.service.updateStaffStatus(this.parseId(idText), dto, this.context(request))
  }

  @Delete('staff/:id')
  @RequireAdminPermissions(ADMIN_PERMISSION.STAFF_DELETE)
  @HttpCode(200)
  deleteStaff(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.service.deleteStaff(this.parseId(idText), this.context(request))
  }

  @Get('staff/status')
  @RequireAdminPermissions(ADMIN_PERMISSION.STAFF_LIST)
  listStaffStatus(@Query() query: AdminPageQueryDto) {
    return this.service.listStaffStatus(query)
  }

  @Get('payments')
  @RequireAdminPermissions(ADMIN_PERMISSION.FINANCE_PAYMENT_LIST)
  listPayments(@Query() query: AdminPageQueryDto) {
    return this.service.listPayments(query)
  }

  @Get('finance/summary')
  @RequireAdminPermissions(ADMIN_PERMISSION.FINANCE_SUMMARY_VIEW)
  getFinanceSummary(@Query() query: AdminPageQueryDto) {
    return this.service.getFinanceSummary(query)
  }

  @Get('points/ledgers')
  @RequireAdminPermissions(ADMIN_PERMISSION.FINANCE_POINT_LIST)
  listPointLedgers(@Query() query: AdminPageQueryDto) {
    return this.service.listPointLedgers(query)
  }

  @Get('reviews')
  @RequireAdminPermissions(ADMIN_PERMISSION.REVIEW_LIST)
  listReviews(@Query() query: AdminPageQueryDto) {
    return this.service.listReviews(query)
  }

  @Put('reviews/:id/status')
  @RequireAdminPermissions(ADMIN_PERMISSION.REVIEW_UPDATE)
  @HttpCode(200)
  updateReviewStatus(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminStatusDto) {
    return this.service.updateReviewStatus(this.parseId(idText), dto, this.context(request))
  }

  @Get('coupons')
  @RequireAdminPermissions(ADMIN_PERMISSION.MARKETING_COUPON_LIST)
  listCoupons(@Query() query: AdminPageQueryDto) {
    return this.service.listCoupons(query)
  }

  @Get('user-coupons')
  @RequireAdminPermissions(ADMIN_PERMISSION.MARKETING_USER_COUPON_LIST)
  listUserCoupons(@Query() query: AdminPageQueryDto) {
    return this.service.listUserCouponsAdmin(query)
  }

  @Post('coupons')
  @RequireAdminPermissions(ADMIN_PERMISSION.MARKETING_COUPON_CREATE)
  @HttpCode(200)
  createCoupon(@Req() request: RequestWithContext, @Body() body: Record<string, unknown>) {
    return this.service.createCoupon(body, this.context(request))
  }

  @Put('coupons/:id')
  @RequireAdminPermissions(ADMIN_PERMISSION.MARKETING_COUPON_UPDATE)
  @HttpCode(200)
  updateCoupon(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: Record<string, unknown>) {
    return this.service.updateCoupon(this.parseId(idText), body, this.context(request))
  }

  @Put('coupons/:id/status')
  @RequireAdminPermissions(ADMIN_PERMISSION.MARKETING_COUPON_UPDATE)
  @HttpCode(200)
  updateCouponStatus(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminStatusDto) {
    return this.service.updateCouponStatus(this.parseId(idText), dto, this.context(request))
  }

  @Post('coupons/:id/grant')
  @RequireAdminPermissions(ADMIN_PERMISSION.MARKETING_COUPON_GRANT)
  @HttpCode(200)
  grantCoupon(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: Record<string, unknown>) {
    return this.service.grantCoupon(this.parseId(idText), body, this.context(request))
  }

  @Get('member-cards')
  @RequireAdminPermissions(ADMIN_PERMISSION.MEMBER_CARD_LIST)
  listMemberCards(@Query() query: AdminPageQueryDto) {
    return this.service.listMemberCards(query)
  }

  @Get('member-cards/rule-audit')
  @RequireAdminPermissions(ADMIN_PERMISSION.MEMBER_CARD_LIST)
  auditMemberCardRules(@Query() query: AdminPageQueryDto) {
    return this.service.auditMemberCardRules(query)
  }

  @Get('member-cards/:id/service-rules')
  @RequireAdminPermissions(ADMIN_PERMISSION.MEMBER_CARD_LIST)
  getMemberCardServiceRules(@Param('id') idText: string) {
    return this.service.getMemberCardServiceRules(this.parseId(idText))
  }

  @Put('member-cards/:id/service-rules')
  @RequireAdminPermissions(ADMIN_PERMISSION.MEMBER_CARD_UPDATE)
  @HttpCode(200)
  updateMemberCardServiceRules(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: Record<string, unknown>) {
    return this.service.updateMemberCardServiceRules(this.parseId(idText), body, this.context(request))
  }

  @Post('member-cards')
  @RequireAdminPermissions(ADMIN_PERMISSION.MEMBER_CARD_CREATE)
  @HttpCode(200)
  createMemberCard(@Req() request: RequestWithContext, @Body() body: Record<string, unknown>) {
    return this.service.createMemberCard(body, this.context(request))
  }

  @Put('member-cards/:id')
  @RequireAdminPermissions(ADMIN_PERMISSION.MEMBER_CARD_UPDATE)
  @HttpCode(200)
  updateMemberCard(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: Record<string, unknown>) {
    return this.service.updateMemberCard(this.parseId(idText), body, this.context(request))
  }

  @Put('member-cards/:id/status')
  @RequireAdminPermissions(ADMIN_PERMISSION.MEMBER_CARD_UPDATE)
  @HttpCode(200)
  updateMemberCardStatus(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminStatusDto) {
    return this.service.updateMemberCardStatus(this.parseId(idText), dto, this.context(request))
  }

  @Get('user-member-cards')
  @RequireAdminPermissions(ADMIN_PERMISSION.MEMBER_CARD_LIST)
  listUserMemberCards(@Query() query: AdminPageQueryDto) {
    return this.service.listUserMemberCards(query)
  }

  @Get('user-member-cards/:id')
  @RequireAdminPermissions(ADMIN_PERMISSION.MEMBER_CARD_LIST)
  getUserMemberCard(@Param('id') idText: string) {
    return this.service.getUserMemberCard(this.parseId(idText))
  }

  @Put('user-member-cards/:id/status')
  @RequireAdminPermissions(ADMIN_PERMISSION.MEMBER_CARD_UPDATE)
  @HttpCode(200)
  updateUserMemberCardStatus(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminStatusDto) {
    return this.service.updateUserMemberCardStatus(this.parseId(idText), dto, this.context(request))
  }

  @Get('member-card-records')
  @RequireAdminPermissions(ADMIN_PERMISSION.MEMBER_CARD_LIST)
  listMemberCardRecords(@Query() query: AdminPageQueryDto) {
    return this.service.listMemberCardRecords(query)
  }

  @Get('audits')
  @RequireAdminPermissions(ADMIN_PERMISSION.AUDIT_CENTER_LIST)
  listAudits(@Req() request: RequestWithContext, @Query() query: AdminPageQueryDto) {
    return this.service.listAuditItems(query.type, query, this.allowedAuditTypes(request))
  }

  @Post('audits/:id/review')
  @RequireAdminPermissions(ADMIN_PERMISSION.AUDIT_CENTER_REVIEW)
  @HttpCode(200)
  reviewAuditItem(@Req() request: RequestWithContext, @Param('id') id: string, @Body() dto: AdminAuditReviewDto) {
    this.assertAuditReviewPermission(request, id)
    return this.service.reviewAuditItem(id, dto, this.context(request))
  }

  @Post('refunds/:id/review')
  @RequireAdminPermissions(ADMIN_PERMISSION.FINANCE_REFUND_AUDIT)
  @HttpCode(200)
  reviewRefund(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminAuditReviewDto) {
    return this.service.reviewRefund(this.parseId(idText), dto, this.context(request))
  }

  @Post('tickets/:id/resolve')
  @RequireAdminPermissions(ADMIN_PERMISSION.AFTER_SALES_TICKET_RESOLVE)
  @HttpCode(200)
  resolveTicket(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminAuditReviewDto) {
    return this.service.reviewTicket(this.parseId(idText), { ...dto, action: 'approve' }, this.context(request))
  }

  @Post('tickets/:id/messages')
  @RequireAdminPermissions(ADMIN_PERMISSION.AFTER_SALES_TICKET_REPLY)
  @HttpCode(200)
  addTicketMessage(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminTicketMessageDto) {
    return this.service.addTicketMessage(this.parseId(idText), dto.content, dto.images, this.context(request))
  }

  @Get('audit-logs')
  @RequireAdminPermissions(ADMIN_PERMISSION.AUDIT_LOG_LIST)
  listAuditLogs(@Query() query: AdminPageQueryDto) {
    return this.service.listAuditLogs(query)
  }

  private allowedAuditTypes(request: RequestWithContext) {
    const perms = request.user?.perms || []
    if (perms.includes('*')) return ['staff', 'refund', 'withdraw', 'ticket']
    const types: string[] = []
    if (perms.includes(ADMIN_PERMISSION.STAFF_AUDIT)) types.push('staff')
    if (perms.includes(ADMIN_PERMISSION.FINANCE_REFUND_LIST)) types.push('refund')
    if (perms.includes(ADMIN_PERMISSION.FINANCE_WITHDRAW_LIST)) types.push('withdraw')
    if (perms.includes(ADMIN_PERMISSION.AFTER_SALES_TICKET_LIST)) types.push('ticket')
    return types
  }

  private assertAuditReviewPermission(request: RequestWithContext, rawId: string) {
    const type = rawId.split(':')[0]
    const permissionMap: Record<string, string> = {
      staff: ADMIN_PERMISSION.STAFF_AUDIT,
      refund: ADMIN_PERMISSION.FINANCE_REFUND_AUDIT,
      withdraw: ADMIN_PERMISSION.FINANCE_WITHDRAW_AUDIT,
      ticket: ADMIN_PERMISSION.AFTER_SALES_TICKET_RESOLVE,
    }
    const required = permissionMap[type]
    if (!required) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'unsupported audit type', 400)
    }
    this.assertAdminPermission(request, required)
  }

  private assertAdminPermission(request: RequestWithContext, permission: string) {
    const perms = request.user?.perms || []
    if (perms.includes('*') || perms.includes(permission)) return
    throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, 'admin permission denied', 403, { requiredPerms: [permission] })
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
