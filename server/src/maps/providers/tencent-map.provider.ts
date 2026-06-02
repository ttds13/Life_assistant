import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BusinessException } from '../../common/errors/business-exception'
import { ErrorCode } from '../../common/errors/error-code'
import type { MapGeocodeResult, MapPlaceSuggestion, MapProvider, MapReverseGeocodeResult } from './map-provider.interface'

interface TencentResponse<T> {
  status: number
  message: string
  result?: T
  data?: T
}

interface TencentLocation {
  lat: number
  lng: number
}

@Injectable()
export class TencentMapProvider implements MapProvider {
  readonly name = 'tencent'

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async geocode(address: string, city?: string): Promise<MapGeocodeResult> {
    const result = await this.request<{
      location?: TencentLocation
      address_components?: {
        province?: string
        city?: string
        district?: string
      }
      title?: string
    }>('https://apis.map.qq.com/ws/geocoder/v1/', {
      address,
      region: city,
    })
    const components = result.address_components || {}
    return {
      provider: this.name,
      address,
      latitude: result.location?.lat ?? null,
      longitude: result.location?.lng ?? null,
      province: components.province || '',
      city: components.city || city || '',
      district: components.district || '',
      formattedAddress: result.title || address,
    }
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<MapReverseGeocodeResult> {
    const result = await this.request<{
      address?: string
      formatted_addresses?: { recommend?: string, rough?: string }
      address_component?: {
        province?: string
        city?: string
        district?: string
        street?: string
        street_number?: string
      }
      pois?: Array<{
        id?: string
        title?: string
        address?: string
        location?: TencentLocation
      }>
    }>('https://apis.map.qq.com/ws/geocoder/v1/', {
      location: `${latitude},${longitude}`,
      get_poi: '1',
    })
    const component = result.address_component || {}
    return {
      provider: this.name,
      latitude,
      longitude,
      province: component.province || '',
      city: component.city || '',
      district: component.district || '',
      address: [component.street, component.street_number].filter(Boolean).join('') || result.address || '',
      formattedAddress: result.formatted_addresses?.recommend || result.address || '',
      pois: (result.pois || []).map(item => ({
        title: item.title || '',
        address: item.address || '',
        province: component.province || '',
        city: component.city || '',
        district: component.district || '',
        latitude: item.location?.lat ?? null,
        longitude: item.location?.lng ?? null,
        poiId: item.id || '',
        provider: this.name,
      })),
    }
  }

  async placeSuggestions(keyword: string, city?: string): Promise<MapPlaceSuggestion[]> {
    const result = await this.request<Array<{
      id?: string
      title?: string
      address?: string
      province?: string
      city?: string
      district?: string
      location?: TencentLocation
    }>>('https://apis.map.qq.com/ws/place/v1/suggestion', {
      keyword,
      region: city,
      page_size: '10',
    }, true)
    return (result || []).map(item => ({
      title: item.title || '',
      address: item.address || '',
      province: item.province || '',
      city: item.city || city || '',
      district: item.district || '',
      latitude: item.location?.lat ?? null,
      longitude: item.location?.lng ?? null,
      poiId: item.id || '',
      provider: this.name,
    }))
  }

  private async request<T>(url: string, params: Record<string, string | number | undefined>, useData = false): Promise<T> {
    const key = this.config.get<string>('TENCENT_MAP_KEY')
    if (!key) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'map key is not configured', 400)
    }
    const search = new URLSearchParams()
    for (const [name, value] of Object.entries({ ...params, key })) {
      if (value !== undefined && value !== '') search.set(name, String(value))
    }
    const timeoutMs = Number(this.config.get<string | number>('MAP_API_TIMEOUT_MS', 5000))
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(`${url}?${search.toString()}`, { signal: controller.signal })
      const payload = await response.json() as TencentResponse<T>
      if (!response.ok || payload.status !== 0) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, payload.message || 'map api failed', 400)
      }
      const data = useData ? payload.data : payload.result
      if (data === undefined) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'map api empty result', 400)
      }
      return data
    }
    catch (error) {
      if (error instanceof BusinessException) throw error
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'map api request failed', 400)
    }
    finally {
      clearTimeout(timer)
    }
  }
}
