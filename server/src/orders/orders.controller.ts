import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard'
import { RequireAdminPermissions } from '../admin-auth/admin-permission.decorator'
import { ADMIN_PERMISSION } from '../admin-auth/admin-permissions'
import { ConfigService } from '@nestjs/config'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { StaffIdentityService } from '../auth/staff-identity.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { getRequestId, RequestWithContext } from '../common/utils/request-context'
import { AutoAssignOrderDto } from './dto/auto-assign-order.dto'
import { AdminOrderRemarkDto } from './dto/admin-order-remark.dto'
import { AdminCreateOrderDto } from './dto/admin-create-order.dto'
import { AdminQueryOrdersDto } from './dto/admin-query-orders.dto'
import { AdminUpdateOrderDto } from './dto/admin-update-order.dto'
import { AssignOrderDto } from './dto/assign-order.dto'
import { CompleteServiceDto } from './dto/complete-service.dto'
import { ConfirmOfflinePaymentDto } from './dto/confirm-offline-payment.dto'
import { CreateOrderDto } from './dto/create-order.dto'
import { PricePreviewDto } from './dto/price-preview.dto'
import { QueryOrdersDto } from './dto/query-orders.dto'
import { RejectOrderDto } from './dto/reject-order.dto'
import { RescheduleOrderDto } from './dto/reschedule-order.dto'
import { TransitionVersionDto } from './dto/transition-version.dto'
import { UpdateStaffProfileDto } from './dto/update-staff-profile.dto'
import { UpdateStaffWorkStatusDto } from './dto/update-staff-work-status.dto'
import { OrdersService } from './orders.service'

@Controller()
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    @Inject(OrdersService) private readonly ordersService: OrdersService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(StaffIdentityService) private readonly staffIdentity: StaffIdentityService,
  ) {}

  @Get('orders/price-preview')
  getPricePreview(@Req() request: RequestWithContext, @Query() query: PricePreviewDto) {
    return this.ordersService.getPricePreview(request.user!.userId, query)
  }

  @Get('orders')
  listUserOrders(@Req() request: RequestWithContext, @Query() query: QueryOrdersDto) {
    return this.ordersService.listUserOrders(request.user!.userId, query)
  }

  @Post('orders')
  @HttpCode(200)
  createOrder(@Req() request: RequestWithContext, @Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(request.user!.userId, dto, getRequestId(request))
  }

  @Get('orders/:id')
  getUserOrderDetail(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.ordersService.getUserOrderDetail(request.user!.userId, this.parseId(idText))
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  cancelOrder(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: TransitionVersionDto) {
    return this.ordersService.cancelOrder(request.user!.userId, this.parseId(idText), dto, getRequestId(request))
  }

  @Post('orders/:id/reschedule')
  @HttpCode(200)
  rescheduleOrder(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: RescheduleOrderDto) {
    return this.ordersService.rescheduleOrder(request.user!.userId, this.parseId(idText), dto, getRequestId(request))
  }

  @Post('orders/:id/confirm')
  @HttpCode(200)
  confirmOrder(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: TransitionVersionDto) {
    return this.ordersService.confirmOrder(request.user!.userId, this.parseId(idText), dto, getRequestId(request))
  }

  @Get('admin/orders')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.ORDER_LIST)
  listAdminOrders(@Req() request: RequestWithContext, @Query() query: AdminQueryOrdersDto) {
    this.parseAdminId(request)
    return this.ordersService.listAdminOrders(query)
  }

  @Post('admin/orders')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.ORDER_UPDATE)
  @HttpCode(200)
  createAdminOrder(@Req() request: RequestWithContext, @Body() dto: AdminCreateOrderDto) {
    return this.ordersService.createAdminOrder(
      this.parseAdminId(request),
      dto,
      getRequestId(request),
      this.getClientIp(request),
    )
  }

  @Get('admin/orders/:id/dispatch-check')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.ORDER_ASSIGN)
  getAdminOrderDispatchCheck(@Req() request: RequestWithContext, @Param('id') idText: string) {
    this.parseAdminId(request)
    return this.ordersService.getAdminOrderDispatchCheck(this.parseId(idText))
  }

  @Get('admin/orders/:id/accounting')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.ORDER_DETAIL)
  getAdminOrderAccounting(@Req() request: RequestWithContext, @Param('id') idText: string) {
    this.parseAdminId(request)
    return this.ordersService.getAdminOrderAccounting(this.parseId(idText))
  }

  @Post('admin/orders/:id/confirm-offline-payment')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.ORDER_UPDATE)
  @HttpCode(200)
  confirmOfflinePayment(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: ConfirmOfflinePaymentDto) {
    return this.ordersService.confirmOfflinePayment(
      this.parseAdminId(request),
      this.parseId(idText),
      dto,
      getRequestId(request),
      this.getClientIp(request),
    )
  }

  @Get('admin/orders/:id')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.ORDER_DETAIL)
  getAdminOrderDetail(@Req() request: RequestWithContext, @Param('id') idText: string) {
    this.parseAdminId(request)
    return this.ordersService.getAdminOrderDetail(this.parseId(idText))
  }

  @Put('admin/orders/:id')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.ORDER_UPDATE)
  @HttpCode(200)
  updateAdminOrder(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminUpdateOrderDto) {
    return this.ordersService.updateAdminOrder(
      this.parseAdminId(request),
      this.parseId(idText),
      dto,
      getRequestId(request),
      this.getClientIp(request),
    )
  }

  @Delete('admin/orders/:id')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.ORDER_DELETE)
  @HttpCode(200)
  deleteAdminOrder(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.ordersService.deleteAdminOrder(
      this.parseAdminId(request),
      this.parseId(idText),
      getRequestId(request),
      this.getClientIp(request),
    )
  }

  @Post('admin/orders/:id/assign')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.ORDER_ASSIGN)
  @HttpCode(200)
  assignOrder(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AssignOrderDto) {
    return this.ordersService.assignOrder(
      this.parseAdminId(request),
      this.parseId(idText),
      dto,
      getRequestId(request),
      this.getClientIp(request),
    )
  }

  @Post('admin/orders/:id/auto-assign')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.ORDER_ASSIGN)
  @HttpCode(200)
  autoAssignOrder(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AutoAssignOrderDto) {
    return this.ordersService.autoAssignOrder(
      this.parseAdminId(request),
      this.parseId(idText),
      dto,
      getRequestId(request),
      this.getClientIp(request),
    )
  }

  @Put('admin/orders/:id/remark')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.ORDER_UPDATE)
  @HttpCode(200)
  updateAdminOrderRemark(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminOrderRemarkDto) {
    return this.ordersService.updateAdminOrderRemark(
      this.parseAdminId(request),
      this.parseId(idText),
      dto,
      getRequestId(request),
      this.getClientIp(request),
    )
  }

  @Get('admin/staff/options')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.STAFF_LIST)
  listAssignableStaffOptions(@Req() request: RequestWithContext) {
    this.parseAdminId(request)
    return this.ordersService.listAssignableStaffOptions()
  }

  @Get('staff/orders')
  async listStaffOrders(@Req() request: RequestWithContext, @Query() query: QueryOrdersDto) {
    return this.ordersService.listStaffOrders(await this.parseStaffId(request), query)
  }

  @Get('staff/profile')
  async getStaffProfile(@Req() request: RequestWithContext, @Query('period') period?: string) {
    return this.ordersService.getStaffProfile(await this.parseStaffId(request), period)
  }

  @Put('staff/profile')
  async updateStaffProfile(@Req() request: RequestWithContext, @Body() dto: UpdateStaffProfileDto) {
    return this.ordersService.updateStaffProfile(await this.parseStaffId(request), dto)
  }

  @Get('staff/work-status')
  async getStaffWorkStatus(@Req() request: RequestWithContext) {
    return this.ordersService.getStaffWorkStatus(await this.parseStaffId(request))
  }

  @Put('staff/work-status')
  async updateStaffWorkStatus(@Req() request: RequestWithContext, @Body() dto: UpdateStaffWorkStatusDto) {
    return this.ordersService.updateStaffWorkStatus(await this.parseStaffId(request), dto)
  }

  @Get('staff/orders/:id')
  async getStaffOrderDetail(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.ordersService.getStaffOrderDetail(await this.parseStaffId(request), this.parseId(idText))
  }

  @Post('staff/orders/:id/accept')
  @HttpCode(200)
  async staffAccept(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.ordersService.staffAccept(await this.parseStaffId(request), this.parseId(idText), getRequestId(request))
  }

  @Post('staff/orders/:id/reject')
  @HttpCode(200)
  async staffReject(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: RejectOrderDto) {
    return this.ordersService.staffReject(await this.parseStaffId(request), this.parseId(idText), dto, getRequestId(request))
  }

  @Post('staff/orders/:id/on-the-way')
  @HttpCode(200)
  async staffOnTheWay(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: TransitionVersionDto) {
    return this.ordersService.staffOnTheWay(await this.parseStaffId(request), this.parseId(idText), dto, getRequestId(request))
  }

  @Post('staff/orders/:id/start-service')
  @HttpCode(200)
  async staffStartService(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: TransitionVersionDto) {
    return this.ordersService.staffStartService(await this.parseStaffId(request), this.parseId(idText), dto, getRequestId(request))
  }

  @Post('staff/orders/:id/complete')
  @HttpCode(200)
  async staffComplete(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: CompleteServiceDto) {
    return this.ordersService.staffComplete(await this.parseStaffId(request), this.parseId(idText), dto, getRequestId(request))
  }

  private parseId(value: string) {
    const id = Number(value)
    if (!Number.isInteger(id) || id < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid id', 400)
    }
    return id
  }

  private parseStaffId(request: RequestWithContext) {
    return this.staffIdentity.resolveStaffId(request)
  }

  private parseAdminId(request: RequestWithContext) {
    if (request.user?.userType === 'admin' || request.user?.adminId) {
      return request.user.adminId || request.user.userId
    }
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, 'admin auth is not configured', 403)
    }
    const header = request.headers['x-admin-id']
    const adminId = Number(Array.isArray(header) ? header[0] : header)
    if (!Number.isInteger(adminId) || adminId < 1) {
      throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, 'missing admin identity', 403)
    }
    return adminId
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
