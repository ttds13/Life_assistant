import { Inject, Injectable } from '@nestjs/common'
import type { Address, Prisma } from '@prisma/client'
import { AdminAuditService } from '../audit-log/admin-audit.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { clearDefaultAddresses, setAddressDefault } from './address-revision'
import type { AdminSaveAddressDto, SaveAddressDto } from './dto/save-address.dto'
import { AddressOwnerType, AddressesRepository } from './addresses.repository'

interface OwnerAddressParams {
  ownerType: AddressOwnerType
  ownerId: number
  addressType?: string
}

interface AdminContext {
  adminId: number
  requestId?: string
  ip?: string
}

@Injectable()
export class AddressesService {
  constructor(
    @Inject(AddressesRepository) private readonly repository: AddressesRepository,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
  ) {}

  async listAddresses(params: OwnerAddressParams) {
    const addresses = await this.repository.findAddresses({
      ...params,
      addressType: params.addressType,
    })
    return addresses.map(address => this.presentAddress(address))
  }

  async getAddress(params: OwnerAddressParams & { addressId: number }) {
    const address = await this.repository.findAddress({
      ...params,
      addressType: params.addressType,
    })
    if (!address) throw this.addressNotFound()
    return this.presentAddress(address)
  }

  async createAddress(params: OwnerAddressParams & { dto: SaveAddressDto, source?: string }) {
    this.assertCoordinatePair(params.dto.latitude, params.dto.longitude)
    const addressType = params.addressType || params.dto.addressType || this.defaultAddressType(params.ownerType)
    const data = this.toAddressCreateInput(params.ownerType, params.ownerId, addressType, params.dto, params.dto.source || params.source || 'manual')
    const address = await this.repository.createAddress({ ...params, addressType }, data, {
      operatorType: params.ownerType,
      operatorId: BigInt(params.ownerId),
    })
    return this.presentAddress(address)
  }

  async updateAddress(params: OwnerAddressParams & { addressId: number, dto: SaveAddressDto }) {
    if (params.dto.expectedVersion === undefined) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'expectedVersion is required', 400)
    }
    this.assertCoordinatePair(params.dto.latitude, params.dto.longitude)
    const addressType = params.addressType || params.dto.addressType
    const data = this.toAddressUpdateInput(params.dto)
    if (!params.addressType && params.dto.addressType) {
      data.addressType = params.dto.addressType
    }
    const address = await this.repository.updateAddress({
      ownerType: params.ownerType,
      ownerId: params.ownerId,
      addressId: params.addressId,
      addressType,
    }, data, {
      operatorType: params.ownerType,
      operatorId: BigInt(params.ownerId),
      expectedVersion: params.dto.expectedVersion,
    })
    if (!address) throw this.addressNotFound()
    return this.presentAddress(address)
  }

  async deleteAddress(params: OwnerAddressParams & { addressId: number }) {
    const address = await this.repository.deleteAddress({
      ...params,
      addressType: params.addressType,
    }, {
      operatorType: params.ownerType,
      operatorId: BigInt(params.ownerId),
    })
    if (!address) throw this.addressNotFound()
    return null
  }

  async listAdminAddresses(query: {
    ownerType?: string
    ownerId?: number
    addressType?: string
    keyword?: string
    city?: string
    district?: string
    page: number
    pageSize: number
  }) {
    const where: Prisma.AddressWhereInput = { deletedAt: null }
    if (query.ownerType) where.ownerType = query.ownerType
    if (query.ownerId) where.ownerId = BigInt(query.ownerId)
    if (query.addressType) where.addressType = query.addressType
    if (query.city) where.city = { contains: query.city }
    if (query.district) where.district = { contains: query.district }
    if (query.keyword) {
      where.OR = [
        { contactName: { contains: query.keyword } },
        { contactPhone: { contains: query.keyword } },
        { city: { contains: query.keyword } },
        { district: { contains: query.keyword } },
        { detailAddress: { contains: query.keyword } },
        { formattedAddress: { contains: query.keyword } },
      ]
    }

    const [total, addresses] = await this.repository.client.$transaction([
      this.repository.client.address.count({ where }),
      this.repository.client.address.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ])
    const ownerMap = await this.getOwnerMap(addresses)

    return {
      items: addresses.map(address => this.presentAddress(address, {
        includeOwner: true,
        owner: ownerMap.get(this.ownerKey(address.ownerType, address.ownerId)),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    }
  }

  async getAdminAddress(addressId: number) {
    const address = await this.repository.client.address.findFirst({
      where: { id: BigInt(addressId), deletedAt: null },
    })
    if (!address) throw this.addressNotFound()
    const ownerMap = await this.getOwnerMap([address])
    return this.presentAddress(address, {
      includeOwner: true,
      owner: ownerMap.get(this.ownerKey(address.ownerType, address.ownerId)),
    })
  }

  async getAdminOwnerAddress(ownerType: AddressOwnerType, ownerId: number, addressId: number) {
    const address = await this.repository.client.address.findFirst({
      where: {
        id: BigInt(addressId),
        ownerType,
        ownerId: BigInt(ownerId),
        deletedAt: null,
      },
    })
    if (!address) throw this.addressNotFound()
    const ownerMap = await this.getOwnerMap([address])
    return this.presentAddress(address, {
      includeOwner: true,
      owner: ownerMap.get(this.ownerKey(address.ownerType, address.ownerId)),
    })
  }

  async createAdminAddress(dto: AdminSaveAddressDto, context: AdminContext) {
    this.assertCoordinatePair(dto.latitude, dto.longitude)
    const ownerType = this.parseOwnerType(dto.ownerType)
    const addressType = dto.addressType || this.defaultAddressType(ownerType)
    const data = this.toAddressCreateInput(ownerType, dto.ownerId, addressType, dto, 'admin')
    const address = await this.repository.createAddress({ ownerType, ownerId: dto.ownerId, addressType }, data, {
      operatorType: 'admin',
      operatorId: BigInt(context.adminId),
      requestId: context.requestId,
    })
    await this.audit.write({
      adminId: context.adminId,
      action: `${ownerType}-address:create`,
      module: 'address',
      targetType: 'address',
      targetId: address.id,
      requestId: context.requestId,
      ip: context.ip,
      detail: { ownerType, ownerId: dto.ownerId, addressType },
    })
    return this.getAdminAddress(Number(address.id))
  }

  async updateAdminAddress(addressId: number, dto: AdminSaveAddressDto, context: AdminContext) {
    if (dto.expectedVersion === undefined) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'expectedVersion is required', 400)
    }
    this.assertCoordinatePair(dto.latitude, dto.longitude)
    const current = await this.repository.client.address.findFirst({
      where: { id: BigInt(addressId), deletedAt: null },
    })
    if (!current) throw this.addressNotFound()

    const ownerType = this.parseOwnerType(dto.ownerType || current.ownerType)
    const ownerId = dto.ownerId || Number(current.ownerId)
    const addressType = dto.addressType || current.addressType
    const address = await this.repository.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM addresses WHERE id = ${current.id} FOR UPDATE`
      const lockedCurrent = await tx.address.findFirst({
        where: { id: current.id, deletedAt: null },
      })
      if (!lockedCurrent) throw this.addressNotFound()
      if (lockedCurrent.version !== dto.expectedVersion) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'address version conflict', 409)
      }
      const ownerIdBigInt = BigInt(ownerId)
      const scopeChanged = lockedCurrent.ownerType !== ownerType
        || lockedCurrent.ownerId !== ownerIdBigInt
        || lockedCurrent.addressType !== addressType
      const targetScope = {
        ownerType,
        ownerId: ownerIdBigInt,
        addressType,
        deletedAt: null,
        status: 1,
      }
      const targetExistingCount = scopeChanged
        ? await tx.address.count({ where: { ...targetScope, id: { not: lockedCurrent.id } } })
        : 1
      const shouldBeDefault = dto.isDefault === true
        || (scopeChanged && lockedCurrent.isDefault)
        || (scopeChanged && targetExistingCount === 0)

      if (shouldBeDefault) {
        await clearDefaultAddresses(tx, targetScope, lockedCurrent.id, {
          operatorType: 'admin',
          operatorId: BigInt(context.adminId),
          reason: 'admin changed default address while updating address',
        })
      }
      const address = await tx.address.update({
        where: { id: lockedCurrent.id },
        data: {
          ...this.toAddressUpdateInput(dto),
          ownerType,
          ownerId: ownerIdBigInt,
          addressType,
          ...(shouldBeDefault ? { isDefault: true } : {}),
          version: { increment: 1 },
        },
      })
      await tx.addressRevision.create({
        data: {
          addressId: address.id,
          version: address.version,
          snapshot: this.addressRevisionSnapshot(address),
          changeType: 'admin_update',
          operatorType: 'admin',
          operatorId: BigInt(context.adminId),
          reason: 'admin updated address',
        },
      })

      if (scopeChanged && lockedCurrent.isDefault) {
        const replacement = await tx.address.findFirst({
          where: {
            ownerType: lockedCurrent.ownerType,
            ownerId: lockedCurrent.ownerId,
            addressType: lockedCurrent.addressType,
            deletedAt: null,
            status: 1,
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        })
        if (replacement) {
          await setAddressDefault(tx, replacement, true, {
            operatorType: 'admin',
            operatorId: BigInt(context.adminId),
            reason: 'admin selected replacement default after address scope change',
          })
        }
      }

      return address
    })

    await this.audit.write({
      adminId: context.adminId,
      action: `${ownerType}-address:update`,
      module: 'address',
      targetType: 'address',
      targetId: address.id,
      requestId: context.requestId,
      ip: context.ip,
      detail: {
        before: this.addressAuditSnapshot(current),
        after: this.addressAuditSnapshot(address),
      },
    })
    return this.getAdminAddress(addressId)
  }

  async updateAdminOwnerAddress(
    ownerType: AddressOwnerType,
    ownerId: number,
    addressId: number,
    dto: SaveAddressDto,
    context: AdminContext,
  ) {
    await this.ensureAddressOwner(ownerType, ownerId, addressId)
    await this.updateAdminAddress(addressId, {
      ...dto,
      ownerType,
      ownerId,
      addressType: dto.addressType || this.defaultAddressType(ownerType),
    }, context)
    return this.getAdminOwnerAddress(ownerType, ownerId, addressId)
  }

  async deleteAdminAddress(addressId: number, context: AdminContext) {
    const current = await this.repository.client.address.findFirst({
      where: { id: BigInt(addressId), deletedAt: null },
    })
    if (!current) throw this.addressNotFound()
    const address = await this.repository.deleteAddress({
      ownerType: this.parseOwnerType(current.ownerType),
      ownerId: Number(current.ownerId),
      addressType: current.addressType,
      addressId,
    }, {
      operatorType: 'admin',
      operatorId: BigInt(context.adminId),
      requestId: context.requestId,
    })
    if (!address) throw this.addressNotFound()
    await this.audit.write({
      adminId: context.adminId,
      action: `${current.ownerType}-address:delete`,
      module: 'address',
      targetType: 'address',
      targetId: addressId,
      requestId: context.requestId,
      ip: context.ip,
      detail: { before: this.addressAuditSnapshot(current) },
    })
    return { id: addressId, deleted: true }
  }

  async deleteAdminOwnerAddress(ownerType: AddressOwnerType, ownerId: number, addressId: number, context: AdminContext) {
    await this.ensureAddressOwner(ownerType, ownerId, addressId)
    return this.deleteAdminAddress(addressId, context)
  }

  presentAddress(address: Address, options?: {
    includeOwner?: boolean
    owner?: { name: string, phone: string }
  }) {
    return {
      id: Number(address.id),
      ...(options?.includeOwner
        ? {
            ownerType: address.ownerType,
            ownerId: Number(address.ownerId),
            ownerName: options.owner?.name || '',
            ownerPhone: options.owner?.phone || '',
          }
        : {}),
      addressType: address.addressType,
      contactName: address.contactName,
      contactPhone: address.contactPhone,
      country: address.country || '',
      provinceName: address.province || '',
      cityName: address.city || '',
      districtName: address.district || '',
      streetName: address.street || '',
      addressTitle: address.addressTitle || '',
      detailAddress: address.detailAddress,
      houseNumber: address.houseNumber || '',
      formattedAddress: address.formattedAddress,
      latitude: address.latitude?.toNumber() ?? null,
      longitude: address.longitude?.toNumber() ?? null,
      coordinateType: address.coordinateType || '',
      poiId: address.poiId || '',
      mapProvider: address.mapProvider || '',
      isDefault: address.isDefault,
      source: address.source,
      status: address.status,
      version: address.version,
      city: address.city || '',
      district: address.district || '',
      address: address.formattedAddress,
      updatedAt: address.updatedAt.toISOString(),
    }
  }

  private toAddressCreateInput(
    ownerType: AddressOwnerType,
    ownerId: number,
    addressType: string,
    dto: SaveAddressDto,
    source: string,
  ): Prisma.AddressUncheckedCreateInput {
    return {
      ownerType,
      ownerId: BigInt(ownerId),
      addressType,
      ...this.toAddressBaseInput(dto),
      source,
      status: 1,
    }
  }

  private toAddressUpdateInput(dto: SaveAddressDto): Prisma.AddressUncheckedUpdateInput {
    const data: Prisma.AddressUncheckedUpdateInput = this.toAddressBaseInput(dto)
    if (dto.isDefault === undefined) {
      delete data.isDefault
    }
    if (dto.source) data.source = dto.source
    return data
  }

  private toAddressBaseInput(dto: SaveAddressDto) {
    const formattedAddress = this.composeFormattedAddress(dto)
    const hasCoordinates = dto.latitude !== undefined && dto.latitude !== null
    return {
      contactName: dto.contactName,
      contactPhone: dto.contactPhone,
      country: dto.country || null,
      province: dto.provinceName || null,
      city: dto.cityName || null,
      district: dto.districtName || null,
      street: dto.streetName || null,
      addressTitle: dto.addressTitle || null,
      detailAddress: dto.detailAddress,
      houseNumber: dto.houseNumber || null,
      formattedAddress,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      coordinateType: hasCoordinates ? dto.coordinateType || 'gcj02' : null,
      poiId: hasCoordinates ? dto.poiId || null : null,
      mapProvider: hasCoordinates ? dto.mapProvider || null : null,
      isDefault: dto.isDefault ?? false,
    }
  }

  private composeFormattedAddress(dto: SaveAddressDto) {
    return [
      dto.provinceName,
      dto.cityName,
      dto.districtName,
      dto.streetName,
      dto.addressTitle,
      dto.detailAddress,
      dto.houseNumber,
    ].map(value => value?.trim()).filter(Boolean).join('')
  }

  private assertCoordinatePair(latitude?: number | null, longitude?: number | null) {
    const hasLatitude = latitude !== undefined && latitude !== null
    const hasLongitude = longitude !== undefined && longitude !== null
    if (hasLatitude !== hasLongitude) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'latitude and longitude must be provided together', 400)
    }
  }

  private defaultAddressType(ownerType: AddressOwnerType) {
    return ownerType === 'staff' ? 'home' : 'service'
  }

  private parseOwnerType(value: string): AddressOwnerType {
    if (value === 'user' || value === 'staff') return value
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid ownerType', 400)
  }

  private addressNotFound() {
    return new BusinessException(ErrorCode.USER_ADDRESS_NOT_FOUND, 'address not found', 404)
  }

  private addressAuditSnapshot(address: Address) {
    return {
      ownerType: address.ownerType,
      ownerId: Number(address.ownerId),
      addressType: address.addressType,
      contactName: address.contactName,
      contactPhone: address.contactPhone,
      formattedAddress: address.formattedAddress,
      isDefault: address.isDefault,
      deletedAt: address.deletedAt?.toISOString() || null,
    }
  }

  private addressRevisionSnapshot(address: Address) {
    return {
      id: Number(address.id),
      ownerType: address.ownerType,
      ownerId: Number(address.ownerId),
      addressType: address.addressType,
      contactName: address.contactName,
      contactPhone: address.contactPhone,
      country: address.country,
      provinceName: address.province,
      cityName: address.city,
      districtName: address.district,
      streetName: address.street,
      addressTitle: address.addressTitle,
      detailAddress: address.detailAddress,
      houseNumber: address.houseNumber,
      formattedAddress: address.formattedAddress,
      latitude: address.latitude?.toNumber() ?? null,
      longitude: address.longitude?.toNumber() ?? null,
      coordinateType: address.coordinateType,
      poiId: address.poiId,
      mapProvider: address.mapProvider,
      isDefault: address.isDefault,
      source: address.source,
      status: address.status,
      version: address.version,
      deletedAt: address.deletedAt?.toISOString() || null,
    } as Prisma.InputJsonObject
  }

  private async ensureAddressOwner(ownerType: AddressOwnerType, ownerId: number, addressId: number) {
    const address = await this.repository.client.address.findFirst({
      where: {
        id: BigInt(addressId),
        ownerType,
        ownerId: BigInt(ownerId),
        deletedAt: null,
      },
      select: { id: true },
    })
    if (!address) throw this.addressNotFound()
  }

  private async getOwnerMap(addresses: Pick<Address, 'ownerType' | 'ownerId'>[]) {
    const userIds = addresses.filter(item => item.ownerType === 'user').map(item => item.ownerId)
    const staffIds = addresses.filter(item => item.ownerType === 'staff').map(item => item.ownerId)
    const [users, staff] = await Promise.all([
      userIds.length
        ? this.repository.client.user.findMany({
            where: { id: { in: this.uniqueBigInts(userIds) } },
            select: { id: true, nickname: true, phone: true },
          })
        : [],
      staffIds.length
        ? this.repository.client.staff.findMany({
            where: { id: { in: this.uniqueBigInts(staffIds) } },
            select: { id: true, name: true, phone: true },
          })
        : [],
    ])
    const map = new Map<string, { name: string, phone: string }>()
    for (const user of users) {
      map.set(this.ownerKey('user', user.id), {
        name: user.nickname || `user#${Number(user.id)}`,
        phone: user.phone || '',
      })
    }
    for (const item of staff) {
      map.set(this.ownerKey('staff', item.id), {
        name: item.name,
        phone: item.phone,
      })
    }
    return map
  }

  private uniqueBigInts(ids: bigint[]) {
    return [...new Set(ids.map(id => id.toString()))].map(id => BigInt(id))
  }

  private ownerKey(ownerType: string, ownerId: bigint) {
    return `${ownerType}:${ownerId.toString()}`
  }
}
