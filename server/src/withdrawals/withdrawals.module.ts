import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { AuthModule } from '../auth/auth.module'
import { WechatPayClient } from '../payments/wechat-pay.client'
import { WechatPayConfig } from '../payments/wechat-pay.config'
import { WithdrawalsController } from './withdrawals.controller'
import { WithdrawalsService } from './withdrawals.service'

@Module({
  imports: [AuthModule, AdminAuthModule, AuditLogModule],
  controllers: [WithdrawalsController],
  providers: [WithdrawalsService, WechatPayConfig, WechatPayClient],
  exports: [WithdrawalsService],
})
export class WithdrawalsModule {}

