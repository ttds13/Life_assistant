import type { PrismaClient } from '@prisma/client'
import { hashAdminPassword } from '../admin-auth/admin-password'
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
  await disableLegacySeedCatalog(prisma)

  const user = await ensureTestUser(prisma)
  await ensureTestUserAddress(prisma, user.id)
  await ensureSeedStaff(prisma)
  await ensureDefaultMemberCards(prisma)
  await ensureDefaultHomeBanners(prisma)

  const after = await getCounts(prisma)
  return {
    mode: options.reset ? 'reset' : 'upsert',
    expected: {
      categories: categorySeeds.length,
      services: serviceSeeds.length,
      users: 1,
      userAddresses: 1,
      staff: 1,
      memberCards: 2,
      homeBanners: 3,
    },
    before,
    after,
  }
}

async function ensureDefaultMemberCards(prisma: PrismaClient) {
  const cards = [
    {
      name: '日常保洁季卡',
      applicableServices: [
        '日常保洁 2 小时',
        'svc_jijie_daily_cleaning_3',
      ],
      totalTimes: 6,
      cardType: 'time',
      unitName: '分钟',
      unitMinutes: 120,
      totalUnits: 720,
      serviceRules: {},
      allowHalfDeduct: true,
      minConsumeUnits: 60,
      price: '399',
      validityDays: 90,
      status: 1,
    },
    {
      name: '日常保洁年卡',
      applicableServices: [
        '日常保洁 2 小时',
        'svc_jijie_daily_cleaning_3',
      ],
      totalTimes: 12,
      cardType: 'time',
      unitName: '分钟',
      unitMinutes: 120,
      totalUnits: 1440,
      serviceRules: {
        shareAcrossFamilies: true,
      },
      allowHalfDeduct: true,
      minConsumeUnits: 60,
      price: '699',
      validityDays: 365,
      status: 1,
    },
  ]

  const legacyCardNames = [
    '日常保洁 10 小时卡',
    '厨房深度清洁 10 次卡',
  ]

  for (const legacyName of legacyCardNames) {
    await prisma.memberCard.updateMany({
      where: { name: legacyName },
      data: { status: 0 },
    })
  }

  for (const card of cards) {
    const existing = await prisma.memberCard.findFirst({
      where: { name: card.name },
      orderBy: { id: 'asc' },
    })
    if (existing) {
      await prisma.memberCard.update({
        where: { id: existing.id },
        data: card,
      })
    }
    else {
      await prisma.memberCard.create({ data: card })
    }
  }
}

async function ensureDefaultHomeBanners(prisma: PrismaClient) {
  const banners = [
    {
      title: '吉喆家政',
      subtitle: '家居保洁、家电清洗、水电维修',
      imageUrl: 'https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com/life-assitant/brand.png',
      linkType: 'none',
      linkValue: '',
      sortOrder: 1,
      status: 1,
    },
    {
      title: '特惠体验活动',
      subtitle: '日常保洁 2 小时 67 元，热水器深度清洗 39 元',
      imageUrl: 'https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com/life-assitant/promo.png',
      linkType: 'service',
      linkValue: 'svc_jijie_campaign_1',
      sortOrder: 2,
      status: 1,
    },
    {
      title: '会员卡活动',
      subtitle: '季卡 399 元，年卡 699 元',
      imageUrl: 'https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com/life-assitant/member-card.png',
      linkType: 'none',
      linkValue: '',
      sortOrder: 3,
      status: 1,
    },
  ]

  for (const banner of banners) {
    const existing = await prisma.homeBanner.findFirst({
      where: { title: banner.title },
      orderBy: { id: 'asc' },
    })
    if (existing) {
      await prisma.homeBanner.update({
        where: { id: existing.id },
        data: banner,
      })
    }
    else {
      await prisma.homeBanner.create({ data: banner })
    }
  }
}

async function disableLegacySeedCatalog(prisma: PrismaClient) {
  const activeServiceCodes = serviceSeeds.map(seed => seedServiceCode(seed))
  const activeCategoryNames = categorySeeds.map(seed => seed.name)

  await prisma.service.updateMany({
    where: {
      code: {
        startsWith: 'svc_',
        notIn: activeServiceCodes,
      },
    },
    data: { status: 0 },
  })

  await prisma.serviceCategory.updateMany({
    where: {
      name: { notIn: activeCategoryNames },
      services: {
        some: {
          code: { startsWith: 'svc_' },
        },
      },
    },
    data: { status: 0 },
  })
}

async function getCounts(prisma: PrismaClient) {
  const [
    categories,
    services,
    users,
    addresses,
    staff,
    orders,
    payments,
  ] = await Promise.all([
    prisma.serviceCategory.count(),
    prisma.service.count(),
    prisma.user.count(),
    prisma.address.count(),
    prisma.staff.count(),
    prisma.order.count(),
    prisma.payment.count(),
  ])
  return { categories, services, users, addresses, staff, orders, payments }
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
    where: { name: seed.name, categoryId },
    orderBy: { id: 'asc' },
    take: 2,
  })
  if (existingItems.length > 1) throw new Error(`duplicate service seed target: ${seed.name}`)

  const data = {
    code: seedServiceCode(seed),
    categoryId,
    name: seed.name,
    description: seed.description,
    basePrice: seed.basePrice,
    minPrice: seed.basePrice,
    priceUnit: seed.priceUnit,
    durationMinutes: seedDurationMinutes(seed),
    cardType: seedCardType(seed),
    consumeUnit: seedConsumeUnit(seed),
    consultationRequired: seed.consultationRequired ?? seedCardType(seed) === 'consultation',
    ...(seed.coverImage ? { coverImage: seed.coverImage } : {}),
    sortOrder: seed.sortOrder,
    status: 1,
    deletedAt: null,
  }

  if (existingItems[0]) {
    return prisma.service.update({
      where: { id: existingItems[0].id },
      data,
    })
  }
  return prisma.service.create({ data })
}

function seedServiceCode(seed: typeof serviceSeeds[number]) {
  return `svc_jijie_${seed.categoryKey}_${seed.sortOrder}`
}

function seedDurationMinutes(seed: typeof serviceSeeds[number]) {
  return seed.durationMinutes ?? null
}

function seedCardType(seed: typeof serviceSeeds[number]) {
  if (seed.cardType) return seed.cardType
  if (seed.priceUnit === '咨询' || Number(seed.basePrice) <= 0) return 'consultation'
  if (seed.durationMinutes) return 'time'
  if (['次', '台', '张'].includes(seed.priceUnit)) return 'times'
  return 'none'
}

function seedConsumeUnit(seed: typeof serviceSeeds[number]) {
  if (seed.consumeUnit !== undefined) return seed.consumeUnit
  const duration = seedDurationMinutes(seed)
  if (duration) return duration
  return seedCardType(seed) === 'times' ? 1 : null
}

async function ensureTestUser(prisma: PrismaClient) {
  const phone = process.env.SEED_USER_PHONE?.trim() || process.env.MOCK_LOGIN_PHONE?.trim() || '13800001111'
  const nickname = process.env.SEED_USER_NICKNAME?.trim() || '测试用户'
  const mockOpenid = `mock_${phone}`

  const [phoneUser, openidUser] = await Promise.all([
    prisma.user.findFirst({
      where: { phone },
      orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.user.findFirst({
      where: { openid: mockOpenid },
      orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
    }),
  ])

  const existingUser = phoneUser || openidUser
  if (existingUser) {
    const openidInUse = openidUser && openidUser.id !== existingUser.id

    return prisma.user.update({
      where: { id: existingUser.id },
      data: {
        phone,
        nickname: existingUser.nickname || nickname,
        openid: existingUser.openid || (openidInUse ? undefined : mockOpenid),
        unionid: existingUser.unionid || '',
        status: 1,
        deletedAt: null,
      },
    })
  }

  return prisma.user.create({
    data: {
      phone,
      nickname,
      openid: mockOpenid,
      unionid: '',
      status: 1,
    },
  })
}

async function ensureTestUserAddress(prisma: PrismaClient, userId: bigint) {
  const existing = await prisma.address.findFirst({
    where: {
      ownerType: 'user',
      ownerId: userId,
      addressType: 'service',
      deletedAt: null,
    },
    orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
  })

  const data = {
    ownerType: 'user',
    ownerId: userId,
    addressType: 'service',
    contactName: process.env.SEED_USER_CONTACT_NAME?.trim() || '测试用户',
    contactPhone: process.env.SEED_USER_PHONE?.trim() || process.env.MOCK_LOGIN_PHONE?.trim() || '13800001111',
    country: '中国',
    province: '广东省',
    city: '深圳市',
    district: '南山区',
    street: '粤海街道',
    addressTitle: '默认测试地址',
    detailAddress: '科技园测试小区 1 栋 101',
    houseNumber: '1栋101',
    formattedAddress: '广东省深圳市南山区粤海街道科技园测试小区 1 栋 101',
    coordinateType: 'gcj02',
    mapProvider: 'seed',
    isDefault: true,
    source: 'seed',
    status: 1,
    deletedAt: null,
  }

  if (existing) {
    return prisma.address.update({
      where: { id: existing.id },
      data,
    })
  }

  return prisma.address.create({ data })
}

async function ensureSeedStaff(prisma: PrismaClient) {
  const phone = process.env.SEED_STAFF_PHONE?.trim() || '13800001112'
  const name = process.env.SEED_STAFF_NAME?.trim() || '测试师傅'
  const existing = await prisma.staff.findFirst({
    where: { phone },
    orderBy: { id: 'asc' },
  })

  const data = {
    name,
    phone,
    skills: ['日常保洁', '深度清洁'],
    status: 1,
    workStatus: 1,
    cityCode: '440300',
    deletedAt: null,
  }

  if (existing) {
    return prisma.staff.update({
      where: { id: existing.id },
      data,
    })
  }

  return prisma.staff.create({
    data: {
      ...data,
      passwordHash: await hashAdminPassword(process.env.SEED_STAFF_PASSWORD || 'SeedStaff123456'),
    },
  })
}
