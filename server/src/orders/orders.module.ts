import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { OrdersController } from './orders.controller'
import { OrderTransitionService } from './order-transition.service'
import { OrdersRepository } from './orders.repository'
import { OrdersService } from './orders.service'

@Module({
  imports: [AuthModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, OrderTransitionService],
  exports: [OrdersService, OrdersRepository, OrderTransitionService],
})
export class OrdersModule {}
