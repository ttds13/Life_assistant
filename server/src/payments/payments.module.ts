import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { OrdersModule } from '../orders/orders.module'
import { PaymentsController } from './payments.controller'
import { PaymentsRepository } from './payments.repository'
import { PaymentsService } from './payments.service'
import { WechatPayClient } from './wechat-pay.client'
import { WechatPayConfig } from './wechat-pay.config'

@Module({
  imports: [AuthModule, OrdersModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentsRepository,
    WechatPayConfig,
    WechatPayClient,
  ],
  exports: [PaymentsService, PaymentsRepository],
})
export class PaymentsModule {}
