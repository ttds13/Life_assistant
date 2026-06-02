import type { SaveAddressPayload } from '@/api/types/address'
import { reverseGeocode } from '@/api/maps'

export async function chooseAddressLocation(): Promise<Partial<SaveAddressPayload> | null> {
  return new Promise((resolve) => {
    uni.chooseLocation({
      success: (res) => {
        resolve({
          addressTitle: res.name || '',
          detailAddress: res.address || res.name || '',
          latitude: res.latitude,
          longitude: res.longitude,
          coordinateType: 'gcj02',
          mapProvider: 'tencent',
        })
      },
      fail: () => resolve(null),
    })
  })
}

export async function locateCurrentAddress(): Promise<Partial<SaveAddressPayload> | null> {
  const location = await new Promise<UniApp.GetLocationSuccess | null>((resolve) => {
    uni.getLocation({
      type: 'gcj02',
      success: resolve,
      fail: () => resolve(null),
    })
  })
  if (!location) return null

  const detail = await reverseGeocode({
    latitude: location.latitude,
    longitude: location.longitude,
  })
  return {
    provinceName: detail.province,
    cityName: detail.city,
    districtName: detail.district,
    detailAddress: detail.address || detail.formattedAddress,
    addressTitle: detail.pois[0]?.title || '',
    latitude: detail.latitude,
    longitude: detail.longitude,
    coordinateType: 'gcj02',
    poiId: detail.pois[0]?.poiId || undefined,
    mapProvider: detail.provider,
  }
}
