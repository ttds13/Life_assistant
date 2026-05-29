import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { getRequestId, RequestWithContext } from '../common/utils/request-context'
import { AssignOrderDto } from './dto/assign-order.dto'
import { CompleteServiceDto } from './dto/complete-service.dto'
import { CreateOrderDto } from './dto/create-order.dto'
import { PricePreviewDto } from './dto/price-preview.dto'
import { QueryOrdersDto } from './dto/query-orders.dto'
import { RejectOrderDto } from './dto/reject-order.dto'
import { TransitionVersionDto } from './dto/transition-version.dto'
import { OrdersService } from './orders.service'

@Controller()
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    @Inject(OrdersService) private readonly ordersService: OrdersService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  @Get('orders/price-preview')
  getPricePreview(@Query() query: PricePreviewDto) {
    return this.ordersService.getPricePreview(query.serviceId)
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

  @Post('orders/:id/confirm')
  @HttpCode(200)
  confirmOrder(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: TransitionVersionDto) {
    return this.ordersService.confirmOrder(request.user!.userId, this.parseId(idText), dto, getRequestId(request))
  }

  @Get('admin/orders')
  listAdminOrders(@Req() request: RequestWithContext, @Query() query: QueryOrdersDto) {
    this.parseAdminId(request)
    return this.ordersService.listAdminOrders(query)
  }

  @Get('admin/orders/:id')
  getAdminOrderDetail(@Req() request: RequestWithContext, @Param('id') idText: string) {
    this.parseAdminId(request)
    return this.ordersService.getAdminOrderDetail(this.parseId(idText))
  }

  @Post('admin/orders/:id/assign')
  @HttpCode(200)
  assignOrder(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AssignOrderDto) {
    return this.ordersService.assignOrder(this.parseAdminId(request), this.parseId(idText), dto, getRequestId(request))
  }

  @Get('staff/orders')
  listStaffOrders(@Req() request: RequestWithContext, @Query() query: QueryOrdersDto) {
    return this.ordersService.listStaffOrders(this.parseStaffId(request), query)
  }

  @Get('staff/orders/:id')
  getStaffOrderDetail(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.ordersService.getStaffOrderDetail(this.parseStaffId(request), this.parseId(idText))
  }

  @Post('staff/orders/:id/accept')
  @HttpCode(200)
  staffAccept(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.ordersService.staffAccept(this.parseStaffId(request), this.parseId(idText), getRequestId(request))
  }

  @Post('staff/orders/:id/reject')
  @HttpCode(200)
  staffReject(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: RejectOrderDto) {
    return this.ordersService.staffReject(this.parseStaffId(request), this.parseId(idText), dto, getRequestId(request))
  }

  @Post('staff/orders/:id/on-the-way')
  @HttpCode(200)
  staffOnTheWay(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: TransitionVersionDto) {
    return this.ordersService.staffOnTheWay(this.parseStaffId(request), this.parseId(idText), dto, getRequestId(request))
  }

  @Post('staff/orders/:id/start-service')
  @HttpCode(200)
  staffStartService(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: TransitionVersionDto) {
    return this.ordersService.staffStartService(this.parseStaffId(request), this.parseId(idText), dto, getRequestId(request))
  }

  @Post('staff/orders/:id/complete')
  @HttpCode(200)
  staffComplete(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: CompleteServiceDto) {
    return this.ordersService.staffComplete(this.parseStaffId(request), this.parseId(idText), dto, getRequestId(request))
  }

  private parseId(value: string) {
    const id = Number(value)
    if (!Number.isInteger(id) || id < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid id', 400)
    }
    return id
  }

  private parseStaffId(request: RequestWithContext) {
    if (request.user?.role === 'staff') {
      return request.user.userId
    }
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new BusinessException(ErrorCode.STAFF_FORBIDDEN, 'staff auth is not configured', 403)
    }
    const header = request.headers['x-staff-id']
    const staffId = Number(Array.isArray(header) ? header[0] : header)
    if (!Number.isInteger(staffId) || staffId < 1) {
      throw new BusinessException(ErrorCode.STAFF_FORBIDDEN, 'missing staff identity', 403)
    }
    return staffId
  }

  private parseAdminId(request: RequestWithContext) {
    if (request.user?.role === 'admin') {
      return request.user.userId
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
}
