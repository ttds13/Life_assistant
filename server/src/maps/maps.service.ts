import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { AmapProvider } from './providers/amap.provider'
import type { MapProvider } from './providers/map-provider.interface'
import { TencentMapProvider } from './providers/tencent-map.provider'

@Injectable()
export class MapsService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(TencentMapProvider) private readonly tencent: TencentMapProvider,
    @Inject(AmapProvider) private readonly amap: AmapProvider,
  ) {}

  geocode(address: string, city?: string) {
    return this.provider().geocode(address, city)
  }

  reverseGeocode(latitude: number, longitude: number) {
    return this.provider().reverseGeocode(latitude, longitude)
  }

  async placeSuggestions(keyword: string, city?: string) {
    const items = await this.provider().placeSuggestions(keyword, city)
    return { items }
  }

  private provider(): MapProvider {
    const provider = this.config.get<string>('MAP_PROVIDER', 'tencent')
    if (provider === 'tencent') return this.tencent
    if (provider === 'amap') return this.amap
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'unsupported map provider', 400)
  }
}
