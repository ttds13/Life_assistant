import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { AuthModule } from '../auth/auth.module'
import { MemberCardsController } from './member-cards.controller'
import { MemberCardsService } from './member-cards.service'

@Module({
  imports: [AuthModule, AdminAuthModule, AuditLogModule],
  controllers: [MemberCardsController],
  providers: [MemberCardsService],
  exports: [MemberCardsService],
})
export class MemberCardsModule {}
