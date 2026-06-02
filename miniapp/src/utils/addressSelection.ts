import type { UserAddress } from '@/api/types/address'

const SELECTED_ADDRESS_KEY = 'life-assistant:selected-address'

export function getSelectedAddress(): UserAddress | null {
  const stored = uni.getStorageSync(SELECTED_ADDRESS_KEY)
  return stored && typeof stored === 'object' ? stored as UserAddress : null
}

export function setSelectedAddress(address: UserAddress) {
  uni.setStorageSync(SELECTED_ADDRESS_KEY, address)
}

export function clearSelectedAddress() {
  uni.removeStorageSync(SELECTED_ADDRESS_KEY)
}

export function formatAddress(address: UserAddress) {
  if (address.formattedAddress)
    return address.formattedAddress
  return [
    address.provinceName,
    address.cityName,
    address.districtName,
    address.streetName,
    address.addressTitle,
    address.detailAddress,
    address.houseNumber,
  ].filter(Boolean).join('')
}
