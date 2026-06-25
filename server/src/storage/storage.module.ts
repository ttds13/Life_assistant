import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { ObjectStorageService } from './storage.service'

@Module({
  imports: [PrismaModule],
  providers: [ObjectStorageService],
  exports: [ObjectStorageService],
})
export class StorageModule {}
