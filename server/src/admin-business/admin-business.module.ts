import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { PrismaModule } from '../prisma/prisma.module'
import { RefundsModule } from '../refunds/refunds.module'
import { StorageModule } from '../storage/storage.module'
import { WithdrawalsModule } from '../withdrawals/withdrawals.module'
import { AdminBusinessController } from './admin-business.controller'
import { AdminBusinessService } from './admin-business.service'

@Module({
  imports: [PrismaModule, AdminAuthModule, AuditLogModule, StorageModule, RefundsModule, WithdrawalsModule],
  controllers: [AdminBusinessController],
  providers: [AdminBusinessService],
})
export class AdminBusinessModule {}

