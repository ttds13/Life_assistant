import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BusinessException } from '../../common/errors/business-exception'
import { ErrorCode } from '../../common/errors/error-code'
import type { MapGeocodeResult, MapPlaceSuggestion, MapProvider, MapReverseGeocodeResult } from './map-provider.interface'

@Injectable()
export class AmapProvider implements MapProvider {
  readonly name = 'amap'

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async geocode(address: string, city?: string): Promise<MapGeocodeResult> {
    const result = await this.request<{ geocodes?: Array<{
      location?: string
      province?: string
      city?: string | string[]
      district?: string
      formatted_address?: string
    }> }>('https://restapi.amap.com/v3/geocode/geo', { address, city })
    const item = result.geocodes?.[0]
    if (!item) throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'amap geocode returned no result', 400)
    const [longitude, latitude] = this.coordinates(item.location)
    return {
      provider: this.name,
      address,
      latitude,
      longitude,
      province: item.province || '',
      city: this.cityText(item.city) || city || '',
      district: item.district || '',
      formattedAddress: item.formatted_address || address,
    }
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<MapReverseGeocodeResult> {
    const result = await this.request<{ regeocode?: {
      formatted_address?: string
      addressComponent?: {
        province?: string
        city?: string | string[]
        district?: string
        township?: string
        streetNumber?: { street?: string, number?: string }
      }
      pois?: Array<{ id?: string, name?: string, address?: string, location?: string }>
    } }>('https://restapi.amap.com/v3/geocode/regeo', {
      location: `${longitude},${latitude}`,
      extensions: 'all',
      radius: '1000',
      roadlevel: '0',
    })
    const regeo = result.regeocode
    if (!regeo) throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'amap reverse geocode returned no result', 400)
    const component = regeo.addressComponent || {}
    const street = component.streetNumber?.street || component.township || ''
    const streetNumber = component.streetNumber?.number || ''
    const province = component.province || ''
    const city = this.cityText(component.city)
    const district = component.district || ''
    return {
      provider: this.name,
      latitude,
      longitude,
      province,
      city,
      district,
      street,
      streetNumber,
      address: [street, streetNumber].filter(Boolean).join('') || regeo.formatted_address || '',
      formattedAddress: regeo.formatted_address || '',
      pois: (regeo.pois || []).map(item => {
        const [poiLongitude, poiLatitude] = this.coordinates(item.location)
        return {
          title: item.name || '',
          address: item.address || '',
          province,
          city,
          district,
          latitude: poiLatitude,
          longitude: poiLongitude,
          poiId: item.id || '',
          provider: this.name,
        }
      }),
    }
  }

  async placeSuggestions(keyword: string, city?: string): Promise<MapPlaceSuggestion[]> {
    const result = await this.request<{ tips?: Array<{
      id?: string
      name?: string
      address?: string
      district?: string
      location?: string
    }> }>('https://restapi.amap.com/v3/assistant/inputtips', { keywords: keyword, city })
    return (result.tips || []).map(item => {
      const [longitude, latitude] = this.coordinates(item.location)
      return {
        title: item.name || '',
        address: item.address || '',
        province: '',
        city: city || '',
        district: item.district || '',
        latitude,
        longitude,
        poiId: item.id || '',
        provider: this.name,
      }
    })
  }

  private async request<T>(url: string, params: Record<string, string | number | undefined>): Promise<T> {
    const key = this.config.get<string>('AMAP_MAP_KEY')
    if (!key) throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'amap key is not configured', 400)
    const search = new URLSearchParams()
    for (const [name, value] of Object.entries({ ...params, key })) {
      if (value !== undefined && value !== '') search.set(name, String(value))
    }
    const timeoutMs = Number(this.config.get<string | number>('MAP_API_TIMEOUT_MS', 5000))
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(`${url}?${search.toString()}`, { signal: controller.signal })
      const payload = await response.json() as { status?: string, info?: string } & T
      if (!response.ok || payload.status !== '1') {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, payload.info || 'amap api failed', 400)
      }
      return payload
    }
    catch (error) {
      if (error instanceof BusinessException) throw error
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'amap api request failed', 400)
    }
    finally {
      clearTimeout(timer)
    }
  }

  private coordinates(value?: string) {
    const [longitudeText, latitudeText] = (value || '').split(',')
    const longitude = Number(longitudeText)
    const latitude = Number(latitudeText)
    return [
      Number.isFinite(longitude) ? longitude : null,
      Number.isFinite(latitude) ? latitude : null,
    ] as const
  }

  private cityText(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] || '' : value || ''
  }
}
