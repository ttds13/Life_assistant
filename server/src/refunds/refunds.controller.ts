import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard'
import { RequireAdminPermissions } from '../admin-auth/admin-permission.decorator'
import { ADMIN_PERMISSION } from '../admin-auth/admin-permissions'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { SkipResponseTransform } from '../common/decorators/skip-response-transform.decorator'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { getRequestId, RequestWithContext } from '../common/utils/request-context'
import { CreateRefundRequestDto } from './dto/create-refund-request.dto'
import { RejectRefundDto, ReviewRefundDto } from './dto/review-refund.dto'
import { RefundsService } from './refunds.service'

@Controller()
export class RefundsController {
  constructor(@Inject(RefundsService) private readonly refunds: RefundsService) {}

  @Post('orders/:id/refund-requests')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  createUserRefundRequest(
    @Req() request: RequestWithContext,
    @Param('id') idText: string,
    @Body() dto: CreateRefundRequestDto,
  ) {
    return this.refunds.createUserRefundRequest(request.user!.userId, this.parseId(idText), dto, getRequestId(request))
  }

  @Get('orders/:id/refunds')
  @UseGuards(JwtAuthGuard)
  listUserOrderRefunds(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.refunds.listUserOrderRefunds(request.user!.userId, this.parseId(idText))
  }

  @Get('admin/refunds')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.FINANCE_REFUND_LIST)
  listAdminRefunds(@Req() request: RequestWithContext, @Query() query: Record<string, unknown>) {
    this.parseAdminId(request)
    return this.refunds.listAdminRefunds({
      page: Number(query.page || query.pageNum || 1),
      pageSize: Number(query.pageSize || 20),
      status: typeof query.status === 'string' ? query.status : undefined,
      keyword: typeof query.keyword === 'string'
        ? query.keyword
        : typeof query.keywords === 'string' ? query.keywords : undefined,
    })
  }

  @Get('admin/refunds/:id')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.FINANCE_REFUND_LIST)
  getAdminRefund(@Req() request: RequestWithContext, @Param('id') idText: string) {
    this.parseAdminId(request)
    return this.refunds.getAdminRefund(this.parseId(idText))
  }

  @Post('admin/refunds/:id/approve')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.FINANCE_REFUND_AUDIT)
  @HttpCode(200)
  approveRefund(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: ReviewRefundDto) {
    return this.refunds.approveRefund(this.parseId(idText), dto, this.context(request))
  }

  @Post('admin/refunds/:id/reject')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.FINANCE_REFUND_AUDIT)
  @HttpCode(200)
  rejectRefund(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: RejectRefundDto) {
    return this.refunds.rejectRefund(this.parseId(idText), dto, this.context(request))
  }

  @Post('admin/refunds/:id/retry')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.FINANCE_REFUND_RETRY)
  @HttpCode(200)
  retryRefund(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: ReviewRefundDto) {
    return this.refunds.retryRefund(this.parseId(idText), dto, this.context(request))
  }

  @Post('payments/wechat/refund-notify')
  @HttpCode(200)
  @SkipResponseTransform()
  async wechatRefundNotify(
    @Req() request: RequestWithContext,
    @Res() response: Response,
    @Headers('wechatpay-signature') signature = '',
    @Headers('wechatpay-timestamp') timestamp = '',
    @Headers('wechatpay-nonce') nonce = '',
    @Headers('wechatpay-serial') serial = '',
  ) {
    const rawBody = request.rawBody?.toString('utf8')
    if (!rawBody) {
      response.status(200).json({ code: 'FAIL', message: 'raw body missing' })
      return
    }

    try {
      await this.refunds.handleWechatRefundNotify(rawBody, { signature, timestamp, nonce, serial }, getRequestId(request))
      response.status(200).json({ code: 'SUCCESS', message: '成功' })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'wechat refund notify failed'
      response.status(500).json({ code: 'FAIL', message })
    }
  }

  private parseId(value: string) {
    const id = Number(value)
    if (!Number.isInteger(id) || id < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid id', 400)
    }
    return id
  }

  private parseAdminId(request: RequestWithContext) {
    const adminId = request.user?.adminId || request.user?.userId
    if (!adminId) {
      throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, 'missing admin identity', 403)
    }
    return adminId
  }

  private context(request: RequestWithContext) {
    return {
      adminId: this.parseAdminId(request),
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
