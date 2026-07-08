import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard'
import { RequireAdminPermissions } from '../admin-auth/admin-permission.decorator'
import { ADMIN_PERMISSION } from '../admin-auth/admin-permissions'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { getRequestId, RequestWithContext } from '../common/utils/request-context'
import { AddTicketMessageDto } from './dto/add-ticket-message.dto'
import { CreateTicketDto } from './dto/create-ticket.dto'
import { AfterSalesService } from './after-sales.service'

@Controller()
export class AfterSalesController {
  constructor(@Inject(AfterSalesService) private readonly afterSales: AfterSalesService) {}

  @Post('orders/:id/after-sales')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  createOrderTicket(
    @Req() request: RequestWithContext,
    @Param('id') idText: string,
    @Body() dto: CreateTicketDto,
  ) {
    return this.afterSales.createOrderTicket(request.user!.userId, this.parseId(idText), dto, getRequestId(request))
  }

  @Get('orders/:id/after-sales')
  @UseGuards(JwtAuthGuard)
  listOrderTickets(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.afterSales.listUserOrderTickets(request.user!.userId, this.parseId(idText))
  }

  @Get('after-sales/tickets/:id')
  @UseGuards(JwtAuthGuard)
  getUserTicket(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.afterSales.getUserTicket(request.user!.userId, this.parseId(idText))
  }

  @Post('after-sales/tickets/:id/messages')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  addUserMessage(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AddTicketMessageDto) {
    return this.afterSales.addUserMessage(request.user!.userId, this.parseId(idText), dto)
  }

  @Post('after-sales/tickets/:id/close')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  closeUserTicket(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.afterSales.closeUserTicket(request.user!.userId, this.parseId(idText))
  }

  @Get('admin/after-sales/tickets')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.AFTER_SALES_TICKET_LIST)
  listAdminTickets(@Query() query: Record<string, unknown>) {
    return this.afterSales.listAdminTickets({
      page: Number(query.page || query.pageNum || 1),
      pageSize: Number(query.pageSize || 20),
      status: typeof query.status === 'string' ? query.status : undefined,
      keyword: typeof query.keyword === 'string'
        ? query.keyword
        : typeof query.keywords === 'string' ? query.keywords : undefined,
    })
  }

  @Get('admin/after-sales/tickets/:id')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.AFTER_SALES_TICKET_DETAIL)
  getAdminTicket(@Param('id') idText: string) {
    return this.afterSales.getAdminTicket(this.parseId(idText))
  }

  @Post('admin/after-sales/tickets/:id/messages')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.AFTER_SALES_TICKET_REPLY)
  @HttpCode(200)
  addAdminMessage(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AddTicketMessageDto) {
    return this.afterSales.addAdminMessage(this.parseId(idText), dto, this.context(request))
  }

  @Post('admin/after-sales/tickets/:id/resolve')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.AFTER_SALES_TICKET_RESOLVE)
  @HttpCode(200)
  resolveAdminTicket(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: { remark?: string }) {
    return this.afterSales.resolveAdminTicket(this.parseId(idText), 'resolved', body?.remark, this.context(request))
  }

  @Post('admin/after-sales/tickets/:id/reject')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.AFTER_SALES_TICKET_RESOLVE)
  @HttpCode(200)
  rejectAdminTicket(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: { remark?: string }) {
    return this.afterSales.resolveAdminTicket(this.parseId(idText), 'rejected', body?.remark, this.context(request))
  }

  @Post('admin/after-sales/tickets/:id/close')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.AFTER_SALES_TICKET_RESOLVE)
  @HttpCode(200)
  closeAdminTicket(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() body: { remark?: string }) {
    return this.afterSales.resolveAdminTicket(this.parseId(idText), 'closed', body?.remark, this.context(request))
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
