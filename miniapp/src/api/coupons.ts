import type { AvailableCoupon, CouponStatus, UserCoupon } from './types/coupons'
import { http } from '@/http/http'

export function getAvailableCoupons() {
  return http.get<AvailableCoupon[]>('/coupons/available')
}

export function receiveCoupon(couponId: number) {
  return http.post<UserCoupon>(`/coupons/${couponId}/receive`)
}

export function getUserCoupons(params?: { status?: CouponStatus | 'all' }) {
  return http.get<UserCoupon[]>('/user/coupons', params)
}

export function getUsableCoupons(params?: { serviceId?: number, amount?: number }) {
  return http.get<UserCoupon[]>('/user/coupons/usable', params)
}
