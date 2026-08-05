import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { PrismaModule } from '../prisma/prisma.module'
import { AdminPointsController } from './points.controller'
import { PointsService } from './points.service'

@Module({
  imports: [PrismaModule, AdminAuthModule, AuditLogModule],
  controllers: [AdminPointsController],
  providers: [PointsService],
  exports: [PointsService],
})
export class PointsModule {}
