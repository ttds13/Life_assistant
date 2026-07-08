import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { AuthModule } from '../auth/auth.module'
import { OrdersModule } from '../orders/orders.module'
import { PrismaModule } from '../prisma/prisma.module'
import { StorageModule } from '../storage/storage.module'
import { AfterSalesController } from './after-sales.controller'
import { AfterSalesService } from './after-sales.service'

@Module({
  imports: [PrismaModule, AuthModule, AdminAuthModule, AuditLogModule, OrdersModule, StorageModule],
  controllers: [AfterSalesController],
  providers: [AfterSalesService],
  exports: [AfterSalesService],
})
export class AfterSalesModule {}
