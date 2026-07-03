import { Module } from '@nestjs/common'
import { StorageModule } from '../storage/storage.module'
import { ServicesController } from './services.controller'
import { ServicesRepository } from './services.repository'
import { ServicesService } from './services.service'

@Module({
  imports: [StorageModule],
  controllers: [ServicesController],
  providers: [ServicesService, ServicesRepository],
  exports: [ServicesService, ServicesRepository],
})
export class ServicesModule {}
