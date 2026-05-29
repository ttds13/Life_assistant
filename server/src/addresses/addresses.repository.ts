import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AddressesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findUserAddresses(userId: number) {
    return this.prisma.userAddress.findMany({
      where: { userId: BigInt(userId), deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { id: 'desc' }],
    })
  }

  findUserAddress(userId: number, addressId: number) {
    return this.prisma.userAddress.findFirst({
      where: { id: BigInt(addressId), userId: BigInt(userId), deletedAt: null },
    })
  }

  async createUserAddress(userId: number, data: Prisma.UserAddressUncheckedCreateInput) {
    return this.prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.userAddress.updateMany({
          where: { userId: BigInt(userId), deletedAt: null },
          data: { isDefault: false },
        })
      }
      return tx.userAddress.create({ data })
    })
  }

  async updateUserAddress(userId: number, addressId: number, data: Prisma.UserAddressUncheckedUpdateInput) {
    return this.prisma.$transaction(async (tx) => {
      const address = await tx.userAddress.findFirst({
        where: { id: BigInt(addressId), userId: BigInt(userId), deletedAt: null },
      })
      if (!address) return null

      if (data.isDefault === true) {
        await tx.userAddress.updateMany({
          where: { userId: BigInt(userId), deletedAt: null, id: { not: BigInt(addressId) } },
          data: { isDefault: false },
        })
      }

      return tx.userAddress.update({
        where: { id: BigInt(addressId) },
        data,
      })
    })
  }

  async deleteUserAddress(userId: number, addressId: number) {
    try {
      return await this.prisma.userAddress.updateMany({
        where: { id: BigInt(addressId), userId: BigInt(userId), deletedAt: null },
        data: { deletedAt: new Date(), isDefault: false },
      })
    }
    catch (error) {
      throw error
    }
  }
}
