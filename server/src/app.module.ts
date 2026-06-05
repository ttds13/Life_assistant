import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AdminAuthModule } from './admin-auth/admin-auth.module'
import { AdminBusinessModule } from './admin-business/admin-business.module'
import { AuthModule } from './auth/auth.module'
import { AddressesModule } from './addresses/addresses.module'
import { AppLoggerService } from './common/logger/app-logger.service'
import { RequestIdMiddleware } from './common/middleware/request-id.middleware'
import { DevModule } from './dev/dev.module'
import { HealthModule } from './health/health.module'
import { MapsModule } from './maps/maps.module'
import { UploadModule } from './upload/upload.module'
import { OrdersModule } from './orders/orders.module'
import { PaymentsModule } from './payments/payments.module'
import { PrismaModule } from './prisma/prisma.module'
import { ServicesModule } from './services/services.module'
import { UsersModule } from './users/users.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    ServicesModule,
    UsersModule,
    AuthModule,
    AdminAuthModule,
    AdminBusinessModule,
    AddressesModule,
    MapsModule,
    OrdersModule,
    PaymentsModule,
    DevModule,
    UploadModule,
  ],
  providers: [AppLoggerService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '*path', method: RequestMethod.ALL })
  }
}
