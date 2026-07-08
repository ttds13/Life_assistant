import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { AuthModule } from '../auth/auth.module'
import { StorageModule } from '../storage/storage.module'
import { MemberCardsModule } from '../member-cards/member-cards.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { RefundsModule } from '../refunds/refunds.module'
import { WithdrawalsModule } from '../withdrawals/withdrawals.module'
import { OrdersController } from './orders.controller'
import { OrderTransitionService } from './order-transition.service'
import { OrdersRepository } from './orders.repository'
import { OrdersService } from './orders.service'

@Module({
  imports: [AuthModule, AdminAuthModule, AuditLogModule, StorageModule, MemberCardsModule, NotificationsModule, RefundsModule, WithdrawalsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, OrderTransitionService],
  exports: [OrdersService, OrdersRepository, OrderTransitionService],
})
export class OrdersModule {}
