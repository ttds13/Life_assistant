import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { AuthModule } from '../auth/auth.module'
import { CouponsModule } from '../coupons/coupons.module'
import { StorageModule } from '../storage/storage.module'
import { UsersModule } from '../users/users.module'
import { MemberCardsController } from './member-cards.controller'
import { MemberCardExpiryService } from './member-card-expiry.service'
import { MemberCardsService } from './member-cards.service'

@Module({
  imports: [AuthModule, AdminAuthModule, AuditLogModule, CouponsModule, StorageModule, UsersModule],
  controllers: [MemberCardsController],
  providers: [MemberCardsService, MemberCardExpiryService],
  exports: [MemberCardsService],
})
export class MemberCardsModule {}
