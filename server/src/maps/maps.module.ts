import { Module } from '@nestjs/common'
import { MapsController } from './maps.controller'
import { MapsService } from './maps.service'
import { AmapProvider } from './providers/amap.provider'
import { TencentMapProvider } from './providers/tencent-map.provider'

@Module({
  controllers: [MapsController],
  providers: [MapsService, TencentMapProvider, AmapProvider],
  exports: [MapsService],
})
export class MapsModule {}
