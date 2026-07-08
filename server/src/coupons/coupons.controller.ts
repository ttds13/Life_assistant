import { Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import type { RequestWithContext } from '../common/utils/request-context'
import { CouponsService } from './coupons.service'

@Controller()
@UseGuards(JwtAuthGuard)
export class CouponsController {
  constructor(@Inject(CouponsService) private readonly coupons: CouponsService) {}

  @Get('coupons/available')
  listAvailable(@Req() request: RequestWithContext) {
    return this.coupons.listAvailableCoupons(request.user!.userId)
  }

  @Post('coupons/:id/receive')
  @HttpCode(200)
  receive(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.coupons.receiveCoupon(request.user!.userId, this.parseId(idText))
  }

  @Get('user/coupons')
  listMine(@Req() request: RequestWithContext, @Query() query: { status?: string }) {
    return this.coupons.listUserCoupons(request.user!.userId, query)
  }

  @Get('user/coupons/usable')
  listUsable(@Req() request: RequestWithContext, @Query() query: { serviceId?: string, amount?: string }) {
    return this.coupons.listUsableUserCoupons(request.user!.userId, {
      serviceId: query.serviceId ? this.parseId(query.serviceId) : undefined,
      amount: query.amount === undefined ? undefined : Number(query.amount),
    })
  }

  private parseId(value: string) {
    const id = Number(value)
    if (!Number.isInteger(id) || id < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid id', 400)
    }
    return id
  }
}

