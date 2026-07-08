import type { SaveAddressPayload } from '@/api/types/address'
import { reverseGeocode } from '@/api/maps'

export type LocationFailureReason =
  | 'user_cancel'
  | 'permission_denied'
  | 'map_service_failed'
  | 'network_failed'
  | 'unknown'

export interface AddressLocationResult {
  ok: boolean
  data?: Partial<SaveAddressPayload>
  reason?: LocationFailureReason
  message: string
}

export async function chooseAddressLocation(): Promise<AddressLocationResult> {
  return new Promise((resolve) => {
    uni.chooseLocation({
      success: (res) => {
        resolve({
          ok: true,
          message: '已选择地图位置',
          data: {
            addressTitle: res.name || '',
            detailAddress: res.address || res.name || '',
            latitude: res.latitude,
            longitude: res.longitude,
            coordinateType: 'gcj02',
            mapProvider: 'tencent',
          },
        })
      },
      fail: error => resolve(failedResult(error, '地图选点失败，可手动填写地址')),
    })
  })
}

export async function locateCurrentAddress(): Promise<AddressLocationResult> {
  const location = await new Promise<UniApp.GetLocationSuccess | { error: unknown }>((resolve) => {
    uni.getLocation({
      type: 'gcj02',
      success: resolve,
      fail: error => resolve({ error }),
    })
  })
  if ('error' in location)
    return failedResult(location.error, '定位失败，可手动填写地址')

  try {
    const detail = await reverseGeocode({
      latitude: location.latitude,
      longitude: location.longitude,
    })
    return {
      ok: true,
      message: '已定位当前位置',
      data: {
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
      },
    }
  }
  catch {
    return {
      ok: false,
      reason: 'map_service_failed',
      message: '已获取坐标，但地址解析失败，可手动填写后保存',
      data: {
        latitude: location.latitude,
        longitude: location.longitude,
        coordinateType: 'gcj02',
        mapProvider: 'tencent',
      },
    }
  }
}

function failedResult(error: unknown, fallbackMessage: string): AddressLocationResult {
  const reason = classifyLocationError(error)
  const messageMap: Record<LocationFailureReason, string> = {
    user_cancel: '已取消位置选择，可手动填写地址',
    permission_denied: '定位权限未开启，可打开设置授权或手动填写地址',
    map_service_failed: '地图服务暂不可用，可手动填写地址',
    network_failed: '网络异常，无法获取位置，可手动填写地址',
    unknown: fallbackMessage,
  }
  return {
    ok: false,
    reason,
    message: messageMap[reason],
  }
}

function classifyLocationError(error: unknown): LocationFailureReason {
  const message = typeof error === 'object' && error && 'errMsg' in error
    ? String((error as { errMsg?: string }).errMsg || '').toLowerCase()
    : String(error || '').toLowerCase()

  if (message.includes('cancel')) return 'user_cancel'
  if (message.includes('auth') || message.includes('deny') || message.includes('denied') || message.includes('permission')) return 'permission_denied'
  if (message.includes('network') || message.includes('timeout')) return 'network_failed'
  if (message.includes('map')) return 'map_service_failed'
  return 'unknown'
}
