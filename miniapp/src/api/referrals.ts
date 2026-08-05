import type { PageData } from './types/common'
import type { ReferralBindingResult, ReferralInvitation, ReferralReward, ReferralSummary } from './types/referrals'
import { http } from '@/http/http'

export function getMyReferralInvitation() {
  return http.get<ReferralInvitation>('/referrals/me/invitation')
}

export function getMyReferralSummary() {
  return http.get<ReferralSummary>('/referrals/me/summary')
}

export function getMyReferralRewards(params?: { page?: number, pageSize?: number }) {
  return http.get<PageData<ReferralReward>>('/referrals/me/rewards', { page: params?.page || 1, pageSize: params?.pageSize || 20 })
}

export function bindReferral(input: { source: 'link', inviteToken: string } | { source: 'share_code', shareCode: string }) {
  return http.put<ReferralBindingResult>('/referrals/bind', input)
}
