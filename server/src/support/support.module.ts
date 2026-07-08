import { Module } from '@nestjs/common'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { StorageModule } from '../storage/storage.module'
import { SupportController } from './support.controller'
import { SupportService } from './support.service'

@Module({
  imports: [AuditLogModule, AuthModule, PrismaModule, StorageModule],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
