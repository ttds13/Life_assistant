import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard'
import { RequireAdminPermissions } from '../admin-auth/admin-permission.decorator'
import { ADMIN_PERMISSION } from '../admin-auth/admin-permissions'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { StaffIdentityService } from '../auth/staff-identity.service'
import { SkipResponseTransform } from '../common/decorators/skip-response-transform.decorator'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { getRequestId, RequestWithContext } from '../common/utils/request-context'
import { CreateWithdrawRequestDto } from './dto/create-withdraw-request.dto'
import { QueryWithdrawDto } from './dto/query-withdraw.dto'
import { ExecuteWithdrawDto, ManualHandleWithdrawDto, RetryWithdrawDto } from './dto/retry-withdraw.dto'
import { ReviewWithdrawDto } from './dto/review-withdraw.dto'
import { WithdrawalsService } from './withdrawals.service'

@Controller()
export class WithdrawalsController {
  constructor(
    @Inject(WithdrawalsService) private readonly withdrawals: WithdrawalsService,
    @Inject(StaffIdentityService) private readonly staffIdentity: StaffIdentityService,
  ) {}

  @Get('staff/withdrawals/summary')
  @UseGuards(JwtAuthGuard)
  async getStaffSummary(@Req() request: RequestWithContext) {
    const staffId = await this.staffIdentity.resolveStaffId(request)
    return this.withdrawals.getStaffWithdrawSummary(staffId)
  }

  @Get('staff/withdrawals')
  @UseGuards(JwtAuthGuard)
  async listStaffWithdrawals(@Req() request: RequestWithContext, @Query() query: QueryWithdrawDto) {
    const staffId = await this.staffIdentity.resolveStaffId(request)
    return this.withdrawals.listStaffWithdrawRequests(staffId, query)
  }

  @Post('staff/withdrawals')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async createStaffWithdrawal(@Req() request: RequestWithContext, @Body() dto: CreateWithdrawRequestDto) {
    const staffId = await this.staffIdentity.resolveStaffId(request)
    return this.withdrawals.createWithdrawRequest(staffId, dto, getRequestId(request))
  }

  @Get('staff/withdrawals/:id')
  @UseGuards(JwtAuthGuard)
  async getStaffWithdrawal(@Req() request: RequestWithContext, @Param('id') idText: string) {
    const staffId = await this.staffIdentity.resolveStaffId(request)
    return this.withdrawals.getStaffWithdrawDetail(staffId, this.parseId(idText))
  }

  @Post('staff/withdrawals/:id/cancel')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async cancelStaffWithdrawal(@Req() request: RequestWithContext, @Param('id') idText: string) {
    const staffId = await this.staffIdentity.resolveStaffId(request)
    return this.withdrawals.cancelWithdrawRequest(staffId, this.parseId(idText), getRequestId(request))
  }

  @Post('staff/withdrawals/:id/confirm-package')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async getStaffConfirmPackage(@Req() request: RequestWithContext, @Param('id') idText: string) {
    const staffId = await this.staffIdentity.resolveStaffId(request)
    return this.withdrawals.getStaffConfirmPackage(staffId, this.parseId(idText))
  }

  @Get('admin/withdraw-requests')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.FINANCE_WITHDRAW_LIST)
  listAdminWithdrawals(@Query() query: QueryWithdrawDto) {
    return this.withdrawals.listAdminWithdrawRequests(query)
  }

  @Get('admin/withdraw-requests/:id')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.FINANCE_WITHDRAW_DETAIL)
  getAdminWithdrawal(@Param('id') idText: string) {
    return this.withdrawals.getAdminWithdrawDetail(this.parseId(idText))
  }

  @Post('admin/withdraw-requests/:id/review')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.FINANCE_WITHDRAW_AUDIT)
  @HttpCode(200)
  reviewAdminWithdrawal(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: ReviewWithdrawDto) {
    return this.withdrawals.reviewWithdraw(this.parseId(idText), dto, this.context(request))
  }

  @Post('admin/withdraw-requests/:id/execute')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.FINANCE_WITHDRAW_EXECUTE)
  @HttpCode(200)
  executeAdminWithdrawal(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: ExecuteWithdrawDto) {
    return this.withdrawals.executeWithdraw(this.parseId(idText), dto || {}, this.context(request))
  }

  @Post('admin/withdraw-requests/:id/retry')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.FINANCE_WITHDRAW_RETRY)
  @HttpCode(200)
  retryAdminWithdrawal(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: RetryWithdrawDto) {
    return this.withdrawals.retryWithdraw(this.parseId(idText), dto || {}, this.context(request))
  }

  @Post('admin/withdraw-requests/:id/cancel-transfer')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.FINANCE_WITHDRAW_EXECUTE)
  @HttpCode(200)
  cancelAdminWithdrawal(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.withdrawals.cancelWechatTransfer(this.parseId(idText), this.context(request))
  }

  @Post('admin/withdraw-requests/:id/query-transfer')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.FINANCE_WITHDRAW_RECONCILE)
  @HttpCode(200)
  queryAdminWithdrawal(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.withdrawals.queryWechatTransfer(this.parseId(idText), this.context(request))
  }

  @Post('admin/withdraw-requests/:id/manual-handle')
  @UseGuards(AdminAuthGuard)
  @RequireAdminPermissions(ADMIN_PERMISSION.FINANCE_WITHDRAW_RECONCILE)
  @HttpCode(200)
  manualHandleAdminWithdrawal(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: ManualHandleWithdrawDto) {
    return this.withdrawals.manualHandle(this.parseId(idText), dto, this.context(request))
  }

  @Post('payments/wechat/transfer-notify')
  @HttpCode(200)
  @SkipResponseTransform()
  async wechatTransferNotify(
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
      await this.withdrawals.handleWechatTransferNotify(rawBody, { signature, timestamp, nonce, serial }, getRequestId(request))
      response.status(200).json({ code: 'SUCCESS', message: 'success' })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'wechat transfer notify failed'
      response.status(500).json({ code: 'FAIL', message })
    }
  }

  private context(request: RequestWithContext) {
    return {
      adminId: request.user!.adminId || request.user!.userId,
      requestId: getRequestId(request),
      ip: request.ip,
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

