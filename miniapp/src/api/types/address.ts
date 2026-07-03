export interface AddressView {
  id: number
  ownerType?: 'user' | 'staff'
  ownerId?: number
  ownerName?: string
  ownerPhone?: string
  addressType: 'service' | 'home' | 'work' | 'billing' | string
  contactName: string
  contactPhone: string
  country?: string
  provinceName?: string
  cityName?: string
  districtName?: string
  streetName?: string
  addressTitle?: string
  detailAddress: string
  houseNumber?: string
  formattedAddress?: string
  isDefault: boolean
  latitude?: number | null
  longitude?: number | null
  coordinateType?: 'gcj02' | 'wgs84' | 'bd09' | string
  poiId?: string
  mapProvider?: 'tencent' | 'amap' | string
  source?: string
  status?: number
  updatedAt?: string
}

export interface SaveAddressPayload {
  contactName: string
  contactPhone: string
  country?: string
  provinceName?: string
  cityName?: string
  districtName?: string
  streetName?: string
  addressTitle?: string
  detailAddress: string
  houseNumber?: string
  addressType?: 'service' | 'home' | 'work' | 'billing' | string
  isDefault?: boolean
  latitude?: number | null
  longitude?: number | null
  coordinateType?: 'gcj02' | 'wgs84' | 'bd09' | string
  poiId?: string
  mapProvider?: 'tencent' | 'amap' | string
}

export type UserAddress = AddressView
