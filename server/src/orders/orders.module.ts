import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { AuthModule } from '../auth/auth.module'
import { OrdersController } from './orders.controller'
import { OrderTransitionService } from './order-transition.service'
import { OrdersRepository } from './orders.repository'
import { OrdersService } from './orders.service'

@Module({
  imports: [AuthModule, AdminAuthModule, AuditLogModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, OrderTransitionService],
  exports: [OrdersService, OrdersRepository, OrderTransitionService],
})
export class OrdersModule {}
