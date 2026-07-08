import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { PrismaModule } from '../prisma/prisma.module'
import { StorageModule } from '../storage/storage.module'
import { ImagesController } from './images.controller'
import { ImagesService } from './images.service'

@Module({
  imports: [PrismaModule, AdminAuthModule, AuditLogModule, StorageModule],
  controllers: [ImagesController],
  providers: [ImagesService],
})
export class ImagesModule {}
