import { Body, Controller, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { getRequestId, RequestWithContext } from '../common/utils/request-context'
import { MockSuccessDto } from './dto/mock-success.dto'
import { PaymentsService } from './payments.service'

@Controller()
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly paymentsService: PaymentsService) {}

  @Post('orders/:id/pay')
  @HttpCode(200)
  payOrder(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.paymentsService.createMockPayment(request.user!.userId, this.parseId(idText), getRequestId(request))
  }

  @Post('payments/mock-success')
  @HttpCode(200)
  mockSuccess(@Req() request: RequestWithContext, @Body() dto: MockSuccessDto) {
    return this.paymentsService.mockSuccess(dto, getRequestId(request))
  }

  private parseId(value: string) {
    const id = Number(value)
    if (!Number.isInteger(id) || id < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid id', 400)
    }
    return id
  }
}
