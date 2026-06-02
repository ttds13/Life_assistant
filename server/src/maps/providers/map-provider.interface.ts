export interface MapGeocodeResult {
  provider: string
  address: string
  latitude: number | null
  longitude: number | null
  province: string
  city: string
  district: string
  formattedAddress: string
}

export interface MapReverseGeocodeResult {
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

export interface MapProvider {
  readonly name: string
  geocode(address: string, city?: string): Promise<MapGeocodeResult>
  reverseGeocode(latitude: number, longitude: number): Promise<MapReverseGeocodeResult>
  placeSuggestions(keyword: string, city?: string): Promise<MapPlaceSuggestion[]>
}
