import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { PrismaService } from '../prisma/prisma.service'
import { clearDefaultAddresses, setAddressDefault } from './address-revision'

export type AddressOwnerType = 'user' | 'staff'

interface OwnerParams {
  ownerType: AddressOwnerType
  ownerId: number
  addressType?: string
}

interface AddressRevisionContext {
  operatorType: string
  operatorId?: bigint
  requestId?: string
  reason?: string
  changeType?: string
  expectedVersion?: number
}

@Injectable()
export class AddressesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  get client() {
    return this.prisma
  }

  findAddresses(params: OwnerParams) {
    return this.prisma.address.findMany({
      where: this.ownerWhere(params),
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
    })
  }

  findAddress(params: OwnerParams & { addressId: number }) {
    return this.prisma.address.findFirst({
      where: { ...this.ownerWhere(params), id: BigInt(params.addressId) },
    })
  }

  async createAddress(params: OwnerParams, data: Prisma.AddressUncheckedCreateInput, revision?: AddressRevisionContext) {
    return this.prisma.$transaction(async (tx) => {
      const scope = this.ownerWhere(params)
      const count = await tx.address.count({ where: scope })
      const isDefault = count === 0 || data.isDefault === true
      if (isDefault) {
        await clearDefaultAddresses(tx, scope, undefined, {
          operatorType: revision?.operatorType || params.ownerType,
          operatorId: revision?.operatorId ?? BigInt(params.ownerId),
          reason: 'default address changed while creating address',
        })
      }
      const created = await tx.address.create({
        data: { ...data, isDefault },
      })
      await tx.addressRevision.create({
        data: {
          addressId: created.id,
          version: created.version,
          snapshot: this.revisionSnapshot(created),
          changeType: revision?.changeType || 'create',
          operatorType: revision?.operatorType || params.ownerType,
          operatorId: revision?.operatorId || BigInt(params.ownerId),
          reason: revision?.reason || 'address created',
        },
      })
      return created
    })
  }

  async updateAddress(
    params: OwnerParams & { addressId: number },
    data: Prisma.AddressUncheckedUpdateInput,
    revision?: AddressRevisionContext,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM addresses WHERE id = ${BigInt(params.addressId)} FOR UPDATE`
      const scope = this.ownerWhere(params)
      const address = await tx.address.findFirst({
        where: { ...scope, id: BigInt(params.addressId) },
      })
      if (!address) return null
      if (revision?.expectedVersion && address.version !== revision.expectedVersion) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'address version conflict', 409)
      }
      const targetAddressType = typeof data.addressType === 'string' ? data.addressType : address.addressType
      const targetScope = {
        ownerType: params.ownerType,
        ownerId: BigInt(params.ownerId),
        addressType: targetAddressType,
        status: 1,
        deletedAt: null,
      }

      if (data.isDefault === true) {
        await clearDefaultAddresses(tx, targetScope, address.id, {
          operatorType: revision?.operatorType || params.ownerType,
          operatorId: revision?.operatorId ?? BigInt(params.ownerId),
          reason: 'default address changed while updating address',
        })
      }

      const updated = await tx.address.update({
        where: { id: address.id },
        data: { ...data, version: { increment: 1 } },
      })
      await tx.addressRevision.create({
        data: {
          addressId: updated.id,
          version: updated.version,
          snapshot: this.revisionSnapshot(updated),
          changeType: revision?.changeType || 'update',
          operatorType: revision?.operatorType || params.ownerType,
          operatorId: revision?.operatorId || BigInt(params.ownerId),
          reason: revision?.reason || 'address updated',
        },
      })

      if (address.addressType !== targetAddressType && address.isDefault) {
        const replacement = await tx.address.findFirst({
          where: scope,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        })
        if (replacement) {
          await setAddressDefault(tx, replacement, true, {
            operatorType: revision?.operatorType || params.ownerType,
            operatorId: revision?.operatorId ?? BigInt(params.ownerId),
            reason: 'replacement default selected after address scope change',
          })
        }
      }

      return updated
    })
  }

  async deleteAddress(params: OwnerParams & { addressId: number }, revision?: AddressRevisionContext) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM addresses WHERE id = ${BigInt(params.addressId)} FOR UPDATE`
      const scope = this.ownerWhere(params)
      const address = await tx.address.findFirst({
        where: { ...scope, id: BigInt(params.addressId) },
      })
      if (!address) return null
      if (revision?.expectedVersion && address.version !== revision.expectedVersion) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'address version conflict', 409)
      }

      const deleted = await tx.address.update({
        where: { id: address.id },
        data: { deletedAt: new Date(), isDefault: false, version: { increment: 1 } },
      })
      await tx.addressRevision.create({
        data: {
          addressId: deleted.id,
          version: deleted.version,
          snapshot: this.revisionSnapshot(deleted),
          changeType: revision?.changeType || 'delete',
          operatorType: revision?.operatorType || params.ownerType,
          operatorId: revision?.operatorId || BigInt(params.ownerId),
          reason: revision?.reason || 'address deleted',
        },
      })

      if (address.isDefault) {
        const replacement = await tx.address.findFirst({
          where: scope,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        })
        if (replacement) {
          await setAddressDefault(tx, replacement, true, {
            operatorType: revision?.operatorType || params.ownerType,
            operatorId: revision?.operatorId ?? BigInt(params.ownerId),
            reason: 'replacement default selected after address deletion',
          })
        }
      }

      return address
    })
  }

  private ownerWhere(params: OwnerParams): Prisma.AddressWhereInput {
    return {
      ownerType: params.ownerType,
      ownerId: BigInt(params.ownerId),
      addressType: params.addressType,
      status: 1,
      deletedAt: null,
    }
  }

  private revisionSnapshot(address: {
    id: bigint
    ownerType: string
    ownerId: bigint
    addressType: string
    contactName: string
    contactPhone: string
    country: string | null
    province: string | null
    city: string | null
    district: string | null
    street: string | null
    addressTitle: string | null
    detailAddress: string
    houseNumber: string | null
    formattedAddress: string
    latitude: Prisma.Decimal | null
    longitude: Prisma.Decimal | null
    coordinateType: string | null
    poiId: string | null
    mapProvider: string | null
    isDefault: boolean
    source: string
    status: number
    version: number
    deletedAt: Date | null
  }) {
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
}
