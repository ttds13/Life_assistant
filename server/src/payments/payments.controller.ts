import { Controller, Headers, HttpCode, Inject, Param, Post, Req, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { SkipResponseTransform } from '../common/decorators/skip-response-transform.decorator'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { getRequestId, RequestWithContext } from '../common/utils/request-context'
import { PaymentsService } from './payments.service'

@Controller()
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly paymentsService: PaymentsService) {}

  @Post('orders/:id/pay')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  payOrder(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.paymentsService.createPayment(request.user!.userId, this.parseId(idText), getRequestId(request))
  }

  @Post('payments/wechat/notify')
  @HttpCode(200)
  @SkipResponseTransform()
  async wechatNotify(
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
      await this.paymentsService.handleWechatNotify(rawBody, {
        signature,
        timestamp,
        nonce,
        serial,
      }, getRequestId(request))
      response.status(200).json({ code: 'SUCCESS', message: '成功' })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'wechat notify failed'
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
}
