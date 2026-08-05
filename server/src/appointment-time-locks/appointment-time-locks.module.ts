import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { AppointmentSlotsController, AdminAppointmentTimeLocksController } from './appointment-time-locks.controller'
import { AppointmentTimeLocksService } from './appointment-time-locks.service'

@Module({
  imports: [AdminAuthModule, AuditLogModule],
  controllers: [AppointmentSlotsController, AdminAppointmentTimeLocksController],
  providers: [AppointmentTimeLocksService],
  exports: [AppointmentTimeLocksService],
})
export class AppointmentTimeLocksModule {}
