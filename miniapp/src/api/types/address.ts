export interface UserAddress {
  id: number
  contactName: string
  contactPhone: string
  cityName?: string
  districtName?: string
  detailAddress: string
  houseNumber?: string
  isDefault: boolean
  latitude?: number | null
  longitude?: number | null
}

export interface SaveAddressPayload {
  contactName: string
  contactPhone: string
  cityName?: string
  districtName?: string
  detailAddress: string
  houseNumber?: string
  isDefault?: boolean
  latitude?: number | null
  longitude?: number | null
}
