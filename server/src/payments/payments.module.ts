import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { OrdersModule } from '../orders/orders.module'
import { PaymentsController } from './payments.controller'
import { PaymentsRepository } from './payments.repository'
import { PaymentsService } from './payments.service'

@Module({
  imports: [AuthModule, OrdersModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentsRepository,
  ],
  exports: [PaymentsService, PaymentsRepository],
})
export class PaymentsModule {}
