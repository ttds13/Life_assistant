import { NestFactory } from '@nestjs/core'
import { Prisma } from '@prisma/client'
import { AdminBusinessService } from '../src/admin-business/admin-business.service'
import { AppModule } from '../src/app.module'
import { MemberCardsService } from '../src/member-cards/member-cards.service'
import { ORDER_STATUS } from '../src/orders/constants/order-status'
import { OrdersService } from '../src/orders/orders.service'
import { PrismaService } from '../src/prisma/prisma.service'

const RUN_PREFIX = 'DAY46_MEMBER_CARD_TIME_BALANCE_TEST'

function arg(name: string) {
  const prefix = `--${name}=`
  const matched = process.argv.find(item => item.startsWith(prefix))
  if (matched) return matched.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`)
}

function assertRunId(runId?: string): asserts runId is string {
  if (!runId || !runId.startsWith(RUN_PREFIX)) {
    throw new Error(`required: --run-id must start with ${RUN_PREFIX}`)
  }
}

function assertClosed(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function requestId(runId: string, action: string) {
  return `${runId}:${action}`.slice(0, 64)
}

function phoneFromRunId(runId: string, suffix: string) {
  const digits = `${Date.now()}${runId}${suffix}`.replace(/\D/g, '').slice(-8).padStart(8, '0')
  return `198${digits}`
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function appointmentRange(offsetDays: number, hour: number) {
  const start = addDays(new Date(), offsetDays)
  start.setHours(hour, 0, 0, 0)
  const end = new Date(start)
  end.setHours(hour + 2, 0, 0, 0)
  return { start, end }
}

function toAdminDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-') + ' ' + [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join(':')
}

function money(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) return 0
  const decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value)
  return Number(decimal.toFixed(2))
}

async function createBaseData(prisma: PrismaService, runId: string) {
  const category = await prisma.serviceCategory.create({
    data: {
      name: `${runId} category`,
      icon: 'day46',
      description: `${runId} member card time balance category`,
      status: 1,
      sortOrder: 9999,
    },
  })

  const service = await prisma.service.create({
    data: {
      code: `${runId.toLowerCase()}_time_service`.slice(0, 64),
      categoryId: category.id,
      name: `${runId} time service`,
      description: `${runId} time member card service`,
      basePrice: new Prisma.Decimal(120),
      minPrice: new Prisma.Decimal(120),
      priceUnit: '分钟',
      durationMinutes: 120,
      cardType: 'time',
      consumeUnit: 120,
      consultationRequired: false,
      status: 1,
      sortOrder: 9999,
      cityCode: '330100',
    },
  })

  const cardTemplate = await prisma.memberCard.create({
    data: {
      name: `${runId} 120分钟卡`,
      applicableServices: [String(service.id)],
      totalTimes: 2,
      cardType: 'time',
      unitName: '分钟',
      unitMinutes: 60,
      totalUnits: 120,
      serviceRules: {},
      allowHalfDeduct: true,
      minConsumeUnits: 1,
      price: new Prisma.Decimal(300),
      validityDays: 365,
      status: 1,
    },
  })

  await prisma.memberCardServiceRule.create({
    data: {
      memberCardId: cardTemplate.id,
      serviceId: service.id,
      consumeUnits: 120,
      status: 1,
      remark: `${runId} consume 120 minutes`,
    },
  })

  const user = await prisma.user.create({
    data: {
      nickname: `${runId} user`,
      phone: phoneFromRunId(runId, 'user'),
      status: 1,
      source: 'offline',
      adminRemark: `${runId} user`,
    },
  })

  const address = await prisma.address.create({
    data: {
      ownerType: 'user',
      ownerId: user.id,
      addressType: 'service',
      contactName: `${runId} contact`,
      contactPhone: user.phone || phoneFromRunId(runId, 'addr'),
      country: 'China',
      province: 'Zhejiang',
      city: 'Hangzhou',
      district: 'Xihu',
      addressTitle: `${runId} address`,
      detailAddress: `${runId} detail address`,
      formattedAddress: `${runId} formatted address`,
      latitude: new Prisma.Decimal('30.2741500'),
      longitude: new Prisma.Decimal('120.1551500'),
      coordinateType: 'gcj02',
      mapProvider: 'day46',
      source: 'day46',
      status: 1,
    },
  })

  const staffUser = await prisma.user.create({
    data: {
      nickname: `${runId} staff user`,
      phone: phoneFromRunId(runId, 'staff-user'),
      status: 1,
      source: 'offline',
      adminRemark: `${runId} staff user`,
    },
  })

  const staff = await prisma.staff.create({
    data: {
      userId: staffUser.id,
      name: `${runId} staff`,
      phone: phoneFromRunId(runId, 'staff'),
      passwordHash: 'DAY46_TEST_PASSWORD_HASH',
      skills: [],
      status: 1,
      workStatus: 1,
      cityCode: '330100',
      applicationNote: `${runId} staff`,
    },
  })

  return { category, service, cardTemplate, user, address, staffUser, staff }
}

async function collectRunData(prisma: PrismaService, runId: string) {
  const [users, staff, services, categories, cards] = await Promise.all([
    prisma.user.findMany({
      where: { OR: [{ nickname: { contains: runId } }, { adminRemark: { contains: runId } }] },
      select: { id: true },
    }),
    prisma.staff.findMany({
      where: { OR: [{ name: { contains: runId } }, { applicationNote: { contains: runId } }] },
      select: { id: true, userId: true },
    }),
    prisma.service.findMany({
      where: { OR: [{ name: { contains: runId } }, { code: { contains: runId.toLowerCase() } }] },
      select: { id: true, categoryId: true },
    }),
    prisma.serviceCategory.findMany({
      where: { OR: [{ name: { contains: runId } }, { description: { contains: runId } }] },
      select: { id: true },
    }),
    prisma.memberCard.findMany({
      where: { name: { contains: runId } },
      select: { id: true },
    }),
  ])
  const userIds = users.map(item => item.id)
  const staffIds = staff.map(item => item.id)
  const serviceIds = services.map(item => item.id)
  const categoryIds = Array.from(new Set([...categories.map(item => item.id), ...services.map(item => item.categoryId)]))
  const cardIds = cards.map(item => item.id)

  const userCards = await prisma.userMemberCard.findMany({
    where: { OR: [{ userId: { in: userIds } }, { cardId: { in: cardIds } }] },
    select: { id: true },
  })
  const userCardIds = userCards.map(item => item.id)

  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        { staffId: { in: staffIds } },
        { serviceId: { in: serviceIds } },
        { purchaseCardId: { in: cardIds } },
        { memberCardId: { in: userCardIds } },
        { grantedUserMemberCardId: { in: userCardIds } },
        { remark: { contains: runId } },
        { adminRemark: { contains: runId } },
      ],
    },
    select: { id: true },
  })
  const orderIds = orders.map(item => item.id)

  const payments = await prisma.payment.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true, paymentNo: true },
  })
  const paymentIds = payments.map(item => item.id)
  const paymentNos = payments.map(item => item.paymentNo)

  const [
    addresses,
    servicePhotos,
    serviceCheckins,
    assignments,
    notifications,
    incomeRecords,
    orderStatusLogs,
    memberCardRecords,
    pointLedgers,
    auditLogs,
    paymentNotifyLogs,
  ] = await Promise.all([
    prisma.address.findMany({
      where: { OR: [{ ownerType: 'user', ownerId: { in: userIds } }, { detailAddress: { contains: runId } }] },
      select: { id: true },
    }),
    prisma.servicePhoto.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } }),
    prisma.serviceCheckin.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } }),
    prisma.orderAssignment.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } }),
    prisma.notification.findMany({
      where: { OR: [{ bizType: 'order', bizId: { in: orderIds } }, { content: { contains: runId } }, { title: { contains: runId } }] },
      select: { id: true },
    }),
    prisma.staffIncomeRecord.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } }),
    prisma.orderStatusLog.findMany({
      where: { OR: [{ orderId: { in: orderIds } }, { requestId: { contains: runId } }, { remark: { contains: runId } }] },
      select: { id: true },
    }),
    prisma.memberCardRecord.findMany({
      where: { OR: [{ orderId: { in: orderIds } }, { userMemberCardId: { in: userCardIds } }, { remark: { contains: runId } }] },
      select: { id: true },
    }),
    prisma.pointLedger.findMany({
      where: { OR: [{ orderId: { in: orderIds } }, { userId: { in: userIds } }, { remark: { contains: runId } }] },
      select: { id: true },
    }),
    prisma.auditLog.findMany({ where: { requestId: { contains: runId } }, select: { id: true } }),
    prisma.paymentNotifyLog.findMany({
      where: { OR: [{ paymentId: { in: paymentIds } }, { paymentNo: { in: paymentNos } }, { rawBody: { contains: runId } }] },
      select: { id: true },
    }),
  ])

  return {
    ids: {
      userIds,
      staffIds,
      serviceIds,
      categoryIds,
      cardIds,
      userCardIds,
      orderIds,
      paymentIds,
      paymentNos,
      addressIds: addresses.map(item => item.id),
      servicePhotoIds: servicePhotos.map(item => item.id),
      serviceCheckinIds: serviceCheckins.map(item => item.id),
      assignmentIds: assignments.map(item => item.id),
      notificationIds: notifications.map(item => item.id),
      incomeRecordIds: incomeRecords.map(item => item.id),
      orderStatusLogIds: orderStatusLogs.map(item => item.id),
      memberCardRecordIds: memberCardRecords.map(item => item.id),
      pointLedgerIds: pointLedgers.map(item => item.id),
      auditLogIds: auditLogs.map(item => item.id),
      paymentNotifyLogIds: paymentNotifyLogs.map(item => item.id),
    },
    counts: {
      users: userIds.length,
      staff: staffIds.length,
      services: serviceIds.length,
      categories: categoryIds.length,
      memberCards: cardIds.length,
      userMemberCards: userCardIds.length,
      orders: orderIds.length,
      payments: paymentIds.length,
      memberCardRecords: memberCardRecords.length,
      pointLedgers: pointLedgers.length,
      auditLogs: auditLogs.length,
    },
  }
}

async function cleanupRunData(prisma: PrismaService, runId: string) {
  const data = await collectRunData(prisma, runId)
  const ids = data.ids
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({ where: { id: { in: ids.auditLogIds } } })
    await tx.paymentNotifyLog.deleteMany({ where: { id: { in: ids.paymentNotifyLogIds } } })
    await tx.servicePhoto.deleteMany({ where: { id: { in: ids.servicePhotoIds } } })
    await tx.serviceCheckin.deleteMany({ where: { id: { in: ids.serviceCheckinIds } } })
    await tx.orderAssignment.deleteMany({ where: { id: { in: ids.assignmentIds } } })
    await tx.notification.deleteMany({ where: { id: { in: ids.notificationIds } } })
    await tx.staffIncomeRecord.deleteMany({ where: { id: { in: ids.incomeRecordIds } } })
    await tx.orderStatusLog.deleteMany({ where: { id: { in: ids.orderStatusLogIds } } })
    await tx.memberCardRecord.deleteMany({ where: { id: { in: ids.memberCardRecordIds } } })
    await tx.pointLedger.deleteMany({ where: { id: { in: ids.pointLedgerIds } } })
    await tx.payment.deleteMany({ where: { id: { in: ids.paymentIds } } })
    await tx.order.deleteMany({ where: { id: { in: ids.orderIds } } })
    await tx.address.deleteMany({ where: { id: { in: ids.addressIds } } })
    await tx.userMemberCard.deleteMany({ where: { id: { in: ids.userCardIds } } })
    await tx.memberCardServiceRule.deleteMany({ where: { OR: [{ memberCardId: { in: ids.cardIds } }, { serviceId: { in: ids.serviceIds } }] } })
    await tx.memberCard.deleteMany({ where: { id: { in: ids.cardIds } } })
    await tx.serviceImage.deleteMany({ where: { serviceId: { in: ids.serviceIds } } })
    await tx.servicePriceRule.deleteMany({ where: { serviceId: { in: ids.serviceIds } } })
    await tx.service.deleteMany({ where: { id: { in: ids.serviceIds } } })
    await tx.staff.deleteMany({ where: { id: { in: ids.staffIds } } })
    await tx.serviceCategory.deleteMany({ where: { id: { in: ids.categoryIds } } })
    await tx.user.deleteMany({ where: { id: { in: ids.userIds } } })
  })
  return data.counts
}

async function assertCardBalance(prisma: PrismaService, userCardId: bigint, expected: { remaining: number, frozen: number, usable: number }) {
  const card = await prisma.userMemberCard.findUnique({ where: { id: userCardId } })
  assertClosed(card, `user member card ${String(userCardId)} should exist`)
  assertClosed(card.remainingUnits === expected.remaining, `remainingUnits should be ${expected.remaining}, got ${card.remainingUnits}`)
  assertClosed(card.frozenUnits === expected.frozen, `frozenUnits should be ${expected.frozen}, got ${card.frozenUnits}`)
  assertClosed(card.remainingUnits - card.frozenUnits === expected.usable, `usableUnits should be ${expected.usable}, got ${card.remainingUnits - card.frozenUnits}`)
  return card
}

async function runSmoke(runId: string) {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false })
  const prisma = app.get(PrismaService)
  const memberCards = app.get(MemberCardsService)
  const orders = app.get(OrdersService)
  const admin = app.get(AdminBusinessService)
  const keepData = hasFlag('keep-data')

  try {
    await cleanupRunData(prisma, runId)
    const base = await createBaseData(prisma, runId)
    const userId = Number(base.user.id)
    const staffId = Number(base.staff.id)

    const purchase = await memberCards.createAdminPurchaseOrder({
      userId,
      cardId: Number(base.cardTemplate.id),
      source: 'offline',
      paymentMode: 'offline_paid',
      paymentRemark: `${runId} purchase paid`,
      adminRemark: `${runId} purchase paid`,
    }, { adminId: 1, requestId: requestId(runId, 'purchase'), ip: '127.0.0.1' }) as { id: string | number, status: string, grantedUserMemberCardId?: number | null }
    assertClosed(purchase.status === ORDER_STATUS.COMPLETED, 'member card purchase should complete after offline payment')

    const userCard = await prisma.userMemberCard.findFirst({
      where: { userId: base.user.id, cardId: base.cardTemplate.id },
      orderBy: [{ id: 'desc' }],
    })
    assertClosed(userCard, 'paid purchase should grant user member card')
    await assertCardBalance(prisma, userCard.id, { remaining: 120, frozen: 0, usable: 120 })

    const range = appointmentRange(1, 10)
    const booking = await orders.createAdminOrder(1, {
      userId,
      serviceId: Number(base.service.id),
      addressId: Number(base.address.id),
      appointmentStartTime: toAdminDate(range.start),
      appointmentEndTime: toAdminDate(range.end),
      source: 'offline',
      paymentMode: 'member_card',
      memberCardId: Number(userCard.id),
      remark: `${runId} member card booking`,
      adminRemark: `${runId} member card booking`,
    }, requestId(runId, 'booking'), '127.0.0.1') as { id: string | number, status: string }
    const orderId = Number(booking.id)
    assertClosed(booking.status === ORDER_STATUS.PENDING_DISPATCH, 'member card booking should be pending dispatch')
    await assertCardBalance(prisma, userCard.id, { remaining: 120, frozen: 120, usable: 0 })

    await orders.assignOrder(1, orderId, { staffId, remark: `${runId} assign staff` }, requestId(runId, 'assign'), '127.0.0.1')
    const accepted = await orders.staffAccept(staffId, orderId, requestId(runId, 'staff-accept')) as { version: number }
    const onTheWay = await orders.staffOnTheWay(staffId, orderId, { version: accepted.version }, requestId(runId, 'staff-on-way')) as { version: number }
    const started = await orders.staffStartService(staffId, orderId, { version: onTheWay.version }, requestId(runId, 'staff-start')) as { version: number }
    const staffCompleted = await orders.staffComplete(staffId, orderId, {
      version: started.version,
      actualMinutes: 60,
      photoUrls: ['https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com/life-assitant/prod/day46/service-finish.jpg'],
      remark: `${runId} actual 60 minutes`,
    }, requestId(runId, 'staff-complete')) as { version: number, status: string, actualConsumeUnits?: number, releasedUnits?: number, memberCard?: { remainingUnits: number, frozenUnits: number, usableUnits?: number } | null }
    assertClosed(staffCompleted.status === ORDER_STATUS.PENDING_CONFIRM, 'staff complete should move order to pending confirm')
    assertClosed(staffCompleted.actualConsumeUnits === 60, 'staff detail should show actual consume 60')
    assertClosed(staffCompleted.releasedUnits === 60, 'staff detail should show released 60')
    await assertCardBalance(prisma, userCard.id, { remaining: 60, frozen: 0, usable: 60 })

    const confirmed = await orders.confirmOrder(userId, orderId, { version: staffCompleted.version }, requestId(runId, 'user-confirm')) as { status: string, memberCard?: { remainingUnits: number, frozenUnits: number, usableUnits?: number } | null }
    assertClosed(confirmed.status === ORDER_STATUS.COMPLETED, 'user confirm should complete booking')
    assertClosed(confirmed.memberCard?.remainingUnits === 60, 'user order detail should show remaining 60')
    assertClosed((confirmed.memberCard.usableUnits ?? confirmed.memberCard.remainingUnits - confirmed.memberCard.frozenUnits) === 60, 'user order detail should show usable 60')

    const recordsAfterConsume = await prisma.memberCardRecord.findMany({
      where: { userMemberCardId: userCard.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    assertClosed(recordsAfterConsume.some(item => item.recordType === 'grant' && item.units === 120), 'records should contain grant 120')
    assertClosed(recordsAfterConsume.some(item => item.recordType === 'freeze' && item.units === 120), 'records should contain freeze 120')
    assertClosed(recordsAfterConsume.some(item => item.recordType === 'consume' && item.units === 60), 'records should contain consume 60')
    assertClosed(recordsAfterConsume.some(item => item.recordType === 'release' && item.units === 60), 'records should contain release 60')

    const adjusted = await admin.adjustUserMemberCardTime(Number(userCard.id), {
      mode: 'delta',
      deltaUnits: 30,
      reason: `${runId} admin add 30 minutes`,
    }, { adminId: 1, requestId: requestId(runId, 'admin-adjust'), ip: '127.0.0.1' }) as { remainingUnits: number, frozenUnits: number, usableUnits: number }
    assertClosed(adjusted.remainingUnits === 90, 'admin detail should show remaining 90 after adjust')
    assertClosed(adjusted.usableUnits === 90, 'admin detail should show usable 90 after adjust')
    await assertCardBalance(prisma, userCard.id, { remaining: 90, frozen: 0, usable: 90 })

    const userCards = await memberCards.listUserCards(userId)
    const userSideCard = userCards.find(item => item.id === Number(userCard.id))
    assertClosed(userSideCard?.remainingUnits === 90, 'user card list should show remaining 90')
    assertClosed(userSideCard.usableUnits === 90, 'user card list should show usable 90')

    const staffDetail = await orders.getStaffOrderDetail(staffId, orderId) as { memberCard?: { remainingUnits: number, frozenUnits: number, usableUnits?: number } | null }
    assertClosed(staffDetail.memberCard?.remainingUnits === 90, 'staff order detail should show remaining 90')
    assertClosed((staffDetail.memberCard.usableUnits ?? staffDetail.memberCard.remainingUnits - staffDetail.memberCard.frozenUnits) === 90, 'staff order detail should show usable 90')

    const adminRecords = await admin.listMemberCardRecords({ page: 1, pageSize: 20, keyword: runId } as any)
    assertClosed(adminRecords.items.some((item: any) => item.recordType === 'admin_adjust' && item.units === 30), 'admin records should show admin_adjust +30')

    const beforeCleanup = await collectRunData(prisma, runId)
    let cleanupBeforeCounts: Record<string, number> | null = null
    let cleanupAfterCounts: Record<string, number> | null = null
    if (!keepData) {
      cleanupBeforeCounts = await cleanupRunData(prisma, runId)
      cleanupAfterCounts = (await collectRunData(prisma, runId)).counts
    }

    return {
      status: 'passed',
      runId,
      cleaned: !keepData,
      purchaseOrderId: Number(purchase.id),
      bookingOrderId: orderId,
      userMemberCardId: Number(userCard.id),
      assertions: {
        purchaseGranted120: true,
        bookingFrozen120: true,
        staffConsumed60Released60: true,
        adminAdjustedTo90: true,
        userStaffAdminBalanceConsistent: true,
      },
      records: beforeCleanup.counts,
      cleanup: {
        before: cleanupBeforeCounts,
        after: cleanupAfterCounts,
      },
    }
  }
  catch (error) {
    if (!keepData) {
      await cleanupRunData(prisma, runId).catch(cleanupError => console.error(cleanupError))
    }
    throw error
  }
  finally {
    await app.close()
  }
}

function jsonReplacer(_key: string, value: unknown) {
  return typeof value === 'bigint' ? Number(value) : value
}

async function main() {
  const runId = arg('run-id')
  assertRunId(runId)
  const result = await runSmoke(runId)
  console.log(JSON.stringify(result, jsonReplacer, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
