import type { PromotionLinkResolveResult } from './types/promotionLinks'
import { http } from '@/http/http'

export function resolvePromotionLink(key: string) {
  return http.get<PromotionLinkResolveResult>(`/promotion-links/${encodeURIComponent(key)}`, undefined, undefined, {
    hideErrorToast: true,
  })
}
