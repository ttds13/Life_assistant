import type { LoginResult, MockLoginParams, UpdateProfileParams, UserProfile, WechatLoginParams } from './types/auth'
import { http } from '@/http/http'

export function wechatLogin(params: WechatLoginParams) {
  return http.post<LoginResult>('/auth/wechat-login', params)
}

export function mockLogin(params: MockLoginParams) {
  return http.post<LoginResult>('/auth/mock-login', params)
}

export function refreshLogin(refreshToken: string) {
  return http.post<LoginResult>('/auth/refresh', { refreshToken }, undefined, undefined, {
    hideErrorToast: true,
    skipAuthRefresh: true,
  })
}

export function logoutSession(refreshToken: string) {
  return http.delete<{ success: boolean }>('/auth/logout', undefined, undefined, {
    data: { refreshToken },
    hideErrorToast: true,
    skipAuthRefresh: true,
  })
}

export function getMe() {
  return http.get<UserProfile>('/auth/me')
}

export function updateProfile(params: UpdateProfileParams) {
  return http.put<UserProfile>('/auth/profile', params)
}
