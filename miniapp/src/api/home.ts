import type { HomeBanner } from './types/home'
import { http } from '@/http/http'

export function getHomeBanners() {
  return http.get<HomeBanner[]>('/home/banners', undefined, undefined, { hideErrorToast: true })
}
