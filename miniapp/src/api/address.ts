import type { SaveAddressPayload, UserAddress } from './types/address'
import { http } from '@/http/http'

export function getUserAddresses() {
  return http.get<UserAddress[]>('/user/addresses')
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
