import { Inject, Injectable } from '@nestjs/common'
import type { UserAddress } from '@prisma/client'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import type { SaveAddressDto } from './dto/save-address.dto'
import { AddressesRepository } from './addresses.repository'

@Injectable()
export class AddressesService {
  constructor(@Inject(AddressesRepository) private readonly repository: AddressesRepository) {}

  async listUserAddresses(userId: number) {
    const addresses = await this.repository.findUserAddresses(userId)
    return addresses.map(address => this.presentAddress(address))
  }

  async createUserAddress(userId: number, dto: SaveAddressDto) {
    const address = await this.repository.createUserAddress(userId, {
      userId: BigInt(userId),
      contactName: dto.contactName,
      contactPhone: dto.contactPhone,
      province: dto.cityName || '',
      city: dto.cityName || '',
      district: dto.districtName || '',
      address: this.composeAddress(dto),
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      isDefault: dto.isDefault ?? false,
    })
    return this.presentAddress(address)
  }

  async updateUserAddress(userId: number, addressId: number, dto: SaveAddressDto) {
    const address = await this.repository.updateUserAddress(userId, addressId, {
      contactName: dto.contactName,
      contactPhone: dto.contactPhone,
      province: dto.cityName || '',
      city: dto.cityName || '',
      district: dto.districtName || '',
      address: this.composeAddress(dto),
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      isDefault: dto.isDefault ?? false,
    })
    if (!address) {
      throw new BusinessException(ErrorCode.USER_ADDRESS_NOT_FOUND, 'address not found', 404)
    }
    return this.presentAddress(address)
  }

  async deleteUserAddress(userId: number, addressId: number) {
    const result = await this.repository.deleteUserAddress(userId, addressId)
    if (result.count !== 1) {
      throw new BusinessException(ErrorCode.USER_ADDRESS_NOT_FOUND, 'address not found', 404)
    }
    return null
  }

  private composeAddress(dto: SaveAddressDto) {
    return [dto.detailAddress, dto.houseNumber].filter(Boolean).join(' ')
  }

  private presentAddress(address: UserAddress) {
    return {
      id: Number(address.id),
      contactName: address.contactName,
      contactPhone: address.contactPhone,
      cityName: address.city,
      districtName: address.district,
      detailAddress: address.address,
      houseNumber: '',
      isDefault: address.isDefault,
      latitude: address.latitude?.toNumber() ?? null,
      longitude: address.longitude?.toNumber() ?? null,
    }
  }
}
