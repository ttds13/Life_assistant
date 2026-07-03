import { Injectable } from '@nestjs/common'
import { BusinessException } from '../../common/errors/business-exception'
import { ErrorCode } from '../../common/errors/error-code'
import type { MapGeocodeResult, MapPlaceSuggestion, MapProvider, MapReverseGeocodeResult } from './map-provider.interface'

@Injectable()
export class AmapProvider implements MapProvider {
  readonly name = 'amap'

  geocode(): Promise<MapGeocodeResult> {
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'amap provider is not enabled', 400)
  }

  reverseGeocode(): Promise<MapReverseGeocodeResult> {
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'amap provider is not enabled', 400)
  }

  placeSuggestions(): Promise<MapPlaceSuggestion[]> {
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'amap provider is not enabled', 400)
  }
}
