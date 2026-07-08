import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { AdminNotificationsController } from './admin-notifications.controller'
import { AdminStaffNotificationsController } from './admin-staff-notifications.controller'
import { NotificationsController } from './notifications.controller'
import { NotificationsService } from './notifications.service'

@Module({
  imports: [AuthModule, AdminAuthModule],
  controllers: [NotificationsController, AdminNotificationsController, AdminStaffNotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
