import type { MemberCardPurchaseOrder, MemberCardPurchasePayload, PurchasableMemberCard, UserMemberCard } from './types/memberCards'
import type { CustomRequestOptions } from '@/http/types'
import { http } from '@/http/http'

export function getMyMemberCards(params?: { serviceId?: number }) {
  return http.get<UserMemberCard[]>('/member-cards/my', params)
}

export function getPurchasableMemberCards(options?: Partial<CustomRequestOptions>) {
  return http.get<PurchasableMemberCard[]>('/member-cards/shop', undefined, undefined, options)
}

export function getPurchasableMemberCardDetail(cardId: number) {
  return http.get<PurchasableMemberCard>(`/member-cards/shop/${encodeURIComponent(String(cardId))}`)
}

export function createMemberCardPurchaseOrder(data: MemberCardPurchasePayload) {
  return http.post<MemberCardPurchaseOrder>('/member-cards/purchase-orders', data)
}
