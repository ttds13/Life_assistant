import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PrismaModule } from '../prisma/prisma.module'
import { StorageModule } from '../storage/storage.module'
import { AdminAuthController } from './admin-auth.controller'
import { AdminAuthGuard } from './admin-auth.guard'
import { AdminAuthService } from './admin-auth.service'
import { AdminProfileController } from './admin-profile.controller'

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'dev-secret-key-change-in-production'),
      }),
    }),
  ],
  controllers: [AdminAuthController, AdminProfileController],
  providers: [AdminAuthService, AdminAuthGuard],
  exports: [AdminAuthService, AdminAuthGuard, JwtModule],
})
export class AdminAuthModule {}
