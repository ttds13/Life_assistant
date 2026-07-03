import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export type AddressOwnerType = 'user' | 'staff'

interface OwnerParams {
  ownerType: AddressOwnerType
  ownerId: number
  addressType?: string
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

  async createAddress(params: OwnerParams, data: Prisma.AddressUncheckedCreateInput) {
    return this.prisma.$transaction(async (tx) => {
      const scope = this.ownerWhere(params)
      const count = await tx.address.count({ where: scope })
      const isDefault = count === 0 || data.isDefault === true
      if (isDefault) {
        await tx.address.updateMany({
          where: scope,
          data: { isDefault: false },
        })
      }
      return tx.address.create({
        data: { ...data, isDefault },
      })
    })
  }

  async updateAddress(
    params: OwnerParams & { addressId: number },
    data: Prisma.AddressUncheckedUpdateInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const scope = this.ownerWhere(params)
      const address = await tx.address.findFirst({
        where: { ...scope, id: BigInt(params.addressId) },
      })
      if (!address) return null
      const targetAddressType = typeof data.addressType === 'string' ? data.addressType : address.addressType
      const targetScope = {
        ownerType: params.ownerType,
        ownerId: BigInt(params.ownerId),
        addressType: targetAddressType,
        status: 1,
        deletedAt: null,
      }

      if (data.isDefault === true) {
        await tx.address.updateMany({
          where: { ...targetScope, id: { not: address.id } },
          data: { isDefault: false },
        })
      }

      const updated = await tx.address.update({
        where: { id: address.id },
        data,
      })

      if (address.addressType !== targetAddressType && address.isDefault) {
        const replacement = await tx.address.findFirst({
          where: scope,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        })
        if (replacement) {
          await tx.address.update({
            where: { id: replacement.id },
            data: { isDefault: true },
          })
        }
      }

      return updated
    })
  }

  async deleteAddress(params: OwnerParams & { addressId: number }) {
    return this.prisma.$transaction(async (tx) => {
      const scope = this.ownerWhere(params)
      const address = await tx.address.findFirst({
        where: { ...scope, id: BigInt(params.addressId) },
      })
      if (!address) return null

      await tx.address.update({
        where: { id: address.id },
        data: { deletedAt: new Date(), isDefault: false },
      })

      if (address.isDefault) {
        const replacement = await tx.address.findFirst({
          where: scope,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        })
        if (replacement) {
          await tx.address.update({
            where: { id: replacement.id },
            data: { isDefault: true },
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
}
