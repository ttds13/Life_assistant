import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AdminAuthModule } from './admin-auth/admin-auth.module'
import { AdminBusinessModule } from './admin-business/admin-business.module'
import { AfterSalesModule } from './after-sales/after-sales.module'
import { AuthModule } from './auth/auth.module'
import { AddressesModule } from './addresses/addresses.module'
import { CouponsModule } from './coupons/coupons.module'
import { AppLoggerService } from './common/logger/app-logger.service'
import { RequestIdMiddleware } from './common/middleware/request-id.middleware'
import { DevModule } from './dev/dev.module'
import { HealthModule } from './health/health.module'
import { MapsModule } from './maps/maps.module'
import { ImagesModule } from './images/images.module'
import { MemberCardsModule } from './member-cards/member-cards.module'
import { UploadModule } from './upload/upload.module'
import { OrdersModule } from './orders/orders.module'
import { NotificationsModule } from './notifications/notifications.module'
import { PaymentsModule } from './payments/payments.module'
import { PrismaModule } from './prisma/prisma.module'
import { PromotionLinksModule } from './promotion-links/promotion-links.module'
import { RefundsModule } from './refunds/refunds.module'
import { ServicesModule } from './services/services.module'
import { StorageModule } from './storage/storage.module'
import { StaffProfileChangeModule } from './staff-profile-change/staff-profile-change.module'
import { SupportModule } from './support/support.module'
import { UsersModule } from './users/users.module'
import { WithdrawalsModule } from './withdrawals/withdrawals.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
    }),
    PrismaModule,
    HealthModule,
    ServicesModule,
    UsersModule,
    AuthModule,
    AdminAuthModule,
    AdminBusinessModule,
    AfterSalesModule,
    AddressesModule,
    CouponsModule,
    MapsModule,
    ImagesModule,
    MemberCardsModule,
    NotificationsModule,
    OrdersModule,
    PaymentsModule,
    RefundsModule,
    WithdrawalsModule,
    PromotionLinksModule,
    DevModule,
    StorageModule,
    StaffProfileChangeModule,
    SupportModule,
    UploadModule,
  ],
  providers: [AppLoggerService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '*path', method: RequestMethod.ALL })
  }
}
