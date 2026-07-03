import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { PromotionLinksController } from './promotion-links.controller'
import { PromotionLinksService } from './promotion-links.service'

@Module({
  imports: [AdminAuthModule, AuditLogModule],
  controllers: [PromotionLinksController],
  providers: [PromotionLinksService],
  exports: [PromotionLinksService],
})
export class PromotionLinksModule {}
