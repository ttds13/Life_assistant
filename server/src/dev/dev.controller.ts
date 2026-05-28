import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { DevService } from './dev.service'

@Controller('dev')
export class DevController {
  constructor(@Inject(DevService) private readonly devService: DevService) {}

  @Post('seed')
  @HttpCode(200)
  seed(@Body() body: { reset?: boolean } = {}) {
    if (process.env.NODE_ENV === 'production') {
      throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, '生产环境禁用 seed 接口', 403)
    }
    return this.devService.seed({ reset: body.reset === true })
  }
}
