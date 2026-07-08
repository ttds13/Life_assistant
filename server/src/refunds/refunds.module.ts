import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { AuthModule } from '../auth/auth.module'
import { CouponsModule } from '../coupons/coupons.module'
import { MemberCardsModule } from '../member-cards/member-cards.module'
import { UsersModule } from '../users/users.module'
import { WechatPayClient } from '../payments/wechat-pay.client'
import { WechatPayConfig } from '../payments/wechat-pay.config'
import { RefundsController } from './refunds.controller'
import { RefundsService } from './refunds.service'

@Module({
  imports: [AuthModule, AdminAuthModule, AuditLogModule, CouponsModule, MemberCardsModule, UsersModule],
  controllers: [RefundsController],
  providers: [RefundsService, WechatPayConfig, WechatPayClient],
  exports: [RefundsService],
})
export class RefundsModule {}
