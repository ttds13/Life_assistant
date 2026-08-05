import type { Address, Prisma } from '@prisma/client'

interface AddressRevisionActor {
  operatorType: string
  operatorId?: bigint
  changeType?: string
  reason?: string
}

export function addressRevisionSnapshot(address: Address) {
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

export async function setAddressDefault(
  tx: Prisma.TransactionClient,
  address: Address,
  isDefault: boolean,
  actor: AddressRevisionActor,
) {
  if (address.isDefault === isDefault) return address
  const updated = await tx.address.update({
    where: { id: address.id },
    data: { isDefault, version: { increment: 1 } },
  })
  await tx.addressRevision.create({
    data: {
      addressId: updated.id,
      version: updated.version,
      snapshot: addressRevisionSnapshot(updated),
      changeType: actor.changeType || 'default_change',
      operatorType: actor.operatorType,
      operatorId: actor.operatorId,
      reason: actor.reason || (isDefault ? 'address set as default' : 'address unset as default'),
    },
  })
  return updated
}

export async function clearDefaultAddresses(
  tx: Prisma.TransactionClient,
  where: Prisma.AddressWhereInput,
  excludeId: bigint | undefined,
  actor: AddressRevisionActor,
) {
  const defaults = await tx.address.findMany({
    where: {
      ...where,
      isDefault: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: { id: 'asc' },
  })
  for (const address of defaults) {
    await setAddressDefault(tx, address, false, actor)
  }
}
