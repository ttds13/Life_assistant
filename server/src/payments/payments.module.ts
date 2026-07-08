import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CouponsModule } from '../coupons/coupons.module'
import { MemberCardsModule } from '../member-cards/member-cards.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { OrdersModule } from '../orders/orders.module'
import { UsersModule } from '../users/users.module'
import { PaymentsController } from './payments.controller'
import { PaymentsRepository } from './payments.repository'
import { PaymentsService } from './payments.service'
import { WechatPayClient } from './wechat-pay.client'
import { WechatPayConfig } from './wechat-pay.config'

@Module({
  imports: [AuthModule, OrdersModule, MemberCardsModule, UsersModule, CouponsModule, NotificationsModule],
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
