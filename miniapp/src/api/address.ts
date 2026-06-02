import type { SaveAddressPayload, UserAddress } from './types/address'
import { http } from '@/http/http'

export function getUserAddresses() {
  return http.get<UserAddress[]>('/user/addresses')
}

export function getUserAddress(id: number) {
  return http.get<UserAddress>(`/user/addresses/${id}`)
}

export function createUserAddress(data: SaveAddressPayload) {
  return http.post<UserAddress>('/user/addresses', data)
}

export function updateUserAddress(id: number, data: SaveAddressPayload) {
  return http.put<UserAddress>(`/user/addresses/${id}`, data)
}

export function deleteUserAddress(id: number) {
  return http.delete<void>(`/user/addresses/${id}`)
}

export function getStaffAddresses(params?: { addressType?: string }) {
  return http.get<UserAddress[]>('/staff/addresses', params)
}

export function getStaffAddress(id: number, params?: { addressType?: string }) {
  return http.get<UserAddress>(`/staff/addresses/${id}`, params)
}

export function createStaffAddress(data: SaveAddressPayload) {
  return http.post<UserAddress>('/staff/addresses', data)
}

export function updateStaffAddress(id: number, data: SaveAddressPayload) {
  return http.put<UserAddress>(`/staff/addresses/${id}`, data)
}

export function deleteStaffAddress(id: number, params?: { addressType?: string }) {
  return http.delete<void>(`/staff/addresses/${id}`, params)
}
