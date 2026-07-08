import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { AuthModule } from '../auth/auth.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { StorageModule } from '../storage/storage.module'
import { StaffProfileChangeController } from './staff-profile-change.controller'
import { StaffProfileChangeService } from './staff-profile-change.service'

@Module({
  imports: [AuthModule, AdminAuthModule, NotificationsModule, StorageModule],
  controllers: [StaffProfileChangeController],
  providers: [StaffProfileChangeService],
  exports: [StaffProfileChangeService],
})
export class StaffProfileChangeModule {}
