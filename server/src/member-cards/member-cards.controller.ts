import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { getRequestId, RequestWithContext } from '../common/utils/request-context'
import { GrantMemberCardDto } from './dto/grant-member-card.dto'
import { PurchaseMemberCardDto } from './dto/purchase-member-card.dto'
import { MemberCardsService } from './member-cards.service'

@Controller()
export class MemberCardsController {
  constructor(@Inject(MemberCardsService) private readonly memberCards: MemberCardsService) {}

  @Get('member-cards/my')
  @UseGuards(JwtAuthGuard)
  listMyCards(@Req() request: RequestWithContext, @Query('serviceId') serviceIdText?: string) {
    const serviceId = serviceIdText ? this.parseOptionalId(serviceIdText) : undefined
    return this.memberCards.listUserCards(request.user!.userId, serviceId)
  }

  @Get('member-cards/shop')
  @UseGuards(JwtAuthGuard)
  listPurchasableCards() {
    return this.memberCards.listPurchasableCards()
  }

  @Get('member-cards/shop/:id')
  getPurchasableCardDetail(@Param('id') idText: string) {
    return this.memberCards.getPurchasableCardDetail(this.parseOptionalId(idText))
  }

  @Post('member-cards/purchase-orders')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  createPurchaseOrder(@Req() request: RequestWithContext, @Body() dto: PurchaseMemberCardDto) {
    return this.memberCards.createPurchaseOrder(request.user!.userId, dto, getRequestId(request))
  }

  @Post('admin/member-cards/grant')
  @UseGuards(AdminAuthGuard)
  @HttpCode(200)
  grantCard(@Req() request: RequestWithContext, @Body() dto: GrantMemberCardDto) {
    const adminId = request.user?.adminId || request.user?.userId
    if (!adminId) {
      throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, 'missing admin identity', 403)
    }
    return this.memberCards.grantCard(dto, {
      adminId,
      requestId: getRequestId(request),
      ip: this.getClientIp(request),
    })
  }

  private parseOptionalId(value: string) {
    const id = Number(value)
    if (!Number.isInteger(id) || id < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid id', 400)
    }
    return id
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
