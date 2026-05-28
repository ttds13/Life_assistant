import type { PrismaClient } from '@prisma/client'
import { categorySeeds, serviceSeeds } from './service-seeds'

export interface SeedOptions {
  reset?: boolean
  allowReset?: boolean
}

export async function seedServiceData(prisma: PrismaClient, options: SeedOptions = {}) {
  const before = await getCounts(prisma)

  if (options.reset) {
    await assertCanReset(prisma, options)
    await resetServiceData(prisma)
  }

  await assertNoDuplicateSeedTargets(prisma)

  const categoryMap = new Map<string, bigint>()
  for (const seed of categorySeeds) {
    const category = await upsertSingleCategory(prisma, seed)
    categoryMap.set(seed.key, category.id)
  }

  for (const seed of serviceSeeds) {
    const categoryId = categoryMap.get(seed.categoryKey)
    if (!categoryId) throw new Error(`missing category seed: ${seed.categoryKey}`)
    await upsertSingleService(prisma, categoryId, seed)
  }

  await ensureTestUser(prisma)

  const after = await getCounts(prisma)
  return {
    mode: options.reset ? 'reset' : 'upsert',
    expected: {
      categories: categorySeeds.length,
      services: serviceSeeds.length,
    },
    before,
    after,
  }
}

async function getCounts(prisma: PrismaClient) {
  const [
    categories,
    services,
    users,
    orders,
    payments,
  ] = await Promise.all([
    prisma.serviceCategory.count(),
    prisma.service.count(),
    prisma.user.count(),
    prisma.order.count(),
    prisma.payment.count(),
  ])
  return { categories, services, users, orders, payments }
}

async function assertCanReset(prisma: PrismaClient, options: SeedOptions) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('production seed reset is forbidden')
  }
  if (!options.allowReset) {
    throw new Error('seed reset requires SEED_ALLOW_SERVICE_RESET=true')
  }

  const [orders, payments] = await Promise.all([
    prisma.order.count(),
    prisma.payment.count(),
  ])
  if (orders > 0 || payments > 0) {
    throw new Error('seed reset is forbidden while orders or payments exist')
  }
}

async function resetServiceData(prisma: PrismaClient) {
  await prisma.serviceFavorite.deleteMany()
  await prisma.serviceImage.deleteMany()
  await prisma.servicePriceRule.deleteMany()
  await prisma.service.deleteMany()
  await prisma.serviceCategory.deleteMany()
}

async function assertNoDuplicateSeedTargets(prisma: PrismaClient) {
  for (const category of categorySeeds) {
    const count = await prisma.serviceCategory.count({ where: { name: category.name } })
    if (count > 1) throw new Error(`duplicate category name: ${category.name}`)
  }
}

async function upsertSingleCategory(
  prisma: PrismaClient,
  seed: typeof categorySeeds[number],
) {
  const existing = await prisma.serviceCategory.findFirst({
    where: { name: seed.name },
    orderBy: { id: 'asc' },
  })

  const data = {
    name: seed.name,
    icon: seed.icon,
    sortOrder: seed.sortOrder,
    status: 1,
  }

  if (existing) {
    return prisma.serviceCategory.update({
      where: { id: existing.id },
      data,
    })
  }
  return prisma.serviceCategory.create({ data })
}

async function upsertSingleService(
  prisma: PrismaClient,
  categoryId: bigint,
  seed: typeof serviceSeeds[number],
) {
  const existingItems = await prisma.service.findMany({
    where: { name: seed.name, categoryId, deletedAt: null },
    orderBy: { id: 'asc' },
    take: 2,
  })
  if (existingItems.length > 1) throw new Error(`duplicate service seed target: ${seed.name}`)

  const data = {
    categoryId,
    name: seed.name,
    description: seed.description,
    basePrice: seed.basePrice,
    priceUnit: seed.priceUnit,
    sortOrder: seed.sortOrder,
    status: 1,
  }

  if (existingItems[0]) {
    return prisma.service.update({
      where: { id: existingItems[0].id },
      data,
    })
  }
  return prisma.service.create({ data })
}

async function ensureTestUser(prisma: PrismaClient) {
  const existingUser = await prisma.user.findFirst({
    where: { phone: '13800138000', deletedAt: null },
  })
  if (existingUser) return existingUser

  return prisma.user.create({
    data: {
      phone: '13800138000',
      nickname: '测试用户',
      status: 1,
    },
  })
}
