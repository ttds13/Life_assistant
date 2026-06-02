import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { AuthModule } from '../auth/auth.module'
import { AdminAddressesController } from './admin-addresses.controller'
import { AdminOwnerAddressesController } from './admin-owner-addresses.controller'
import { UserAddressesController } from './addresses.controller'
import { AddressesRepository } from './addresses.repository'
import { AddressesService } from './addresses.service'
import { StaffAddressesController } from './staff-addresses.controller'

@Module({
  imports: [AuthModule, AdminAuthModule, AuditLogModule],
  controllers: [UserAddressesController, StaffAddressesController, AdminAddressesController, AdminOwnerAddressesController],
  providers: [AddressesService, AddressesRepository],
  exports: [AddressesService, AddressesRepository],
})
export class AddressesModule {}
