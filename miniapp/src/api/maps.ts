import { http } from '@/http/http'

export interface MapPlaceSuggestion {
  title: string
  address: string
  province: string
  city: string
  district: string
  latitude: number | null
  longitude: number | null
  poiId: string
  provider: string
}

export interface ReverseGeocodeResult {
  provider: string
  latitude: number
  longitude: number
  province: string
  city: string
  district: string
  address: string
  formattedAddress: string
  pois: MapPlaceSuggestion[]
}

export function reverseGeocode(params: { latitude: number, longitude: number }) {
  return http.get<ReverseGeocodeResult>('/maps/reverse-geocode', params)
}

export function getPlaceSuggestions(params: { keyword: string, city?: string }) {
  return http.get<{ items: MapPlaceSuggestion[] }>('/maps/place-suggestions', params)
}
