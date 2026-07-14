import { NestFactory } from '@nestjs/core'
import { Prisma } from '@prisma/client'
import { AppModule } from '../src/app.module'
import { AdminBusinessService } from '../src/admin-business/admin-business.service'
import { COUPON_TYPE, USER_COUPON_STATUS } from '../src/coupons/coupon-status'
import { MemberCardsService } from '../src/member-cards/member-cards.service'
import { ORDER_STATUS } from '../src/orders/constants/order-status'
import { OrdersService } from '../src/orders/orders.service'
import { PrismaService } from '../src/prisma/prisma.service'

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
  if (!runId || !runId.startsWith('DAY45_TEST_')) {
    throw new Error('required: --run-id must start with DAY45_TEST_')
  }
}

function requestId(runId: string, action: string) {
  return `${runId}:${action}`.slice(0, 64)
}

function phoneFromRunId(runId: string, suffix: string) {
  const digits = `${Date.now()}${runId}${suffix}`.replace(/\D/g, '').slice(-8).padStart(8, '0')
  return `197${digits}`
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
  end.setHours(hour + 1, 0, 0, 0)
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

function assertClosed(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

function money(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) return 0
  const decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value)
  return Number(decimal.toFixed(2))
}

function pointsForAmount(amount: number) {
  return Math.floor(amount * 10)
}

function limitedName(runId: string, suffix: string, maxLength = 64) {
  return `${runId} ${suffix}`.slice(0, maxLength)
}

async function createBaseData(prisma: PrismaService, runId: string) {
  const category = await prisma.serviceCategory.create({
    data: {
      name: `${runId} category`,
      icon: 'day45',
      description: `${runId} offline coupon points category`,
      status: 1,
      sortOrder: 9999,
    },
  })

  const cashService = await prisma.service.create({
    data: {
      code: `${runId.toLowerCase()}_cash_service`.slice(0, 64),
      categoryId: category.id,
      name: `${runId} cash service`,
      description: `${runId} cash coupon points service`,
      basePrice: new Prisma.Decimal(120),
      minPrice: new Prisma.Decimal(120),
      priceUnit: 'unit',
      durationMinutes: 60,
      cardType: 'none',
      consultationRequired: false,
      status: 1,
      sortOrder: 9999,
      cityCode: '330100',
    },
  })

  const cardService = await prisma.service.create({
    data: {
      code: `${runId.toLowerCase()}_card_service`.slice(0, 64),
      categoryId: category.id,
      name: `${runId} card service`,
      description: `${runId} member card service`,
      basePrice: new Prisma.Decimal(80),
      minPrice: new Prisma.Decimal(80),
      priceUnit: 'times',
      durationMinutes: 0,
      cardType: 'times',
      consumeUnit: 1,
      consultationRequired: false,
      status: 1,
      sortOrder: 9999,
      cityCode: '330100',
    },
  })

  const user = await prisma.user.create({
    data: {
      nickname: `${runId} user`,
      phone: phoneFromRunId(runId, '01'),
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
      contactPhone: user.phone || phoneFromRunId(runId, '02'),
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
      mapProvider: 'day45',
      source: 'day45',
      status: 1,
    },
  })

  const memberCard = await prisma.memberCard.create({
    data: {
      name: `${runId} times card`,
      applicableServices: [String(cardService.id)],
      totalTimes: 5,
      cardType: 'times',
      unitName: 'times',
      totalUnits: 5,
      serviceRules: {},
      allowHalfDeduct: false,
      minConsumeUnits: 1,
      price: new Prisma.Decimal(300),
      validityDays: 365,
      status: 1,
    },
  })

  await prisma.memberCardServiceRule.create({
    data: {
      memberCardId: memberCard.id,
      serviceId: cardService.id,
      consumeUnits: 1,
      status: 1,
      remark: `${runId} rule`,
    },
  })

  return { category, cashService, cardService, user, address, memberCard }
}

async function createUserCoupon(prisma: PrismaService, runId: string, userId: bigint, suffix: string, amount: number) {
  const now = new Date()
  const coupon = await prisma.coupon.create({
    data: {
      name: limitedName(runId, `${suffix} coupon`),
      type: COUPON_TYPE.AMOUNT,
      amount: new Prisma.Decimal(amount),
      minAmount: new Prisma.Decimal(0),
      applicableServices: [],
      totalCount: 0,
      issuedCount: 1,
      startTime: addDays(now, -1),
      endTime: addDays(now, 7),
      status: 1,
    },
  })
  const userCoupon = await prisma.userCoupon.create({
    data: {
      couponId: coupon.id,
      userId,
      status: USER_COUPON_STATUS.AVAILABLE,
      expireAt: coupon.endTime,
    },
  })
  return { coupon, userCoupon }
}

async function assertCouponStatus(
  prisma: PrismaService,
  userCouponId: bigint,
  status: string,
  orderId?: number,
) {
  const record = await prisma.userCoupon.findUnique({ where: { id: userCouponId } })
  assertClosed(record?.status === status, `coupon ${String(userCouponId)} should be ${status}`)
  if (orderId !== undefined) {
    assertClosed(Number(record?.usedOrderId || 0) === orderId, `coupon ${String(userCouponId)} should bind order ${orderId}`)
  }
}

async function assertEarnPoints(prisma: PrismaService, orderId: number, expectedPoints: number) {
  const ledger = await prisma.pointLedger.findFirst({
    where: { orderId: BigInt(orderId), type: 'earn' },
    orderBy: [{ id: 'desc' }],
  })
  assertClosed(Boolean(ledger), `order ${orderId} should have earn point ledger`)
  assertClosed(ledger?.points === expectedPoints, `order ${orderId} points should be ${expectedPoints}`)
}

async function assertNoEarnPoints(prisma: PrismaService, orderId: number) {
  const count = await prisma.pointLedger.count({ where: { orderId: BigInt(orderId), type: 'earn' } })
  assertClosed(count === 0, `order ${orderId} should not have earn point ledger`)
}

async function assertPayment(prisma: PrismaService, orderId: number, amount: number) {
  const payment = await prisma.payment.findFirst({
    where: { orderId: BigInt(orderId), status: 'success' },
    orderBy: [{ id: 'desc' }],
  })
  assertClosed(Boolean(payment), `order ${orderId} should have success payment`)
  assertClosed(payment?.channel === 'offline', `order ${orderId} should use offline payment`)
  assertClosed(money(payment?.amount) === amount, `order ${orderId} payment amount should be ${amount}`)
}

async function assertAccounting(orders: OrdersService, orderId: number) {
  const accounting = await orders.getAdminOrderAccounting(orderId)
  assertClosed(accounting.passed, `order ${orderId} accounting should pass`)
  return accounting
}

async function collectRunData(prisma: PrismaService, runId: string) {
  const coupons = await prisma.coupon.findMany({
    where: { name: { contains: runId } },
    select: { id: true },
  })
  const couponIds = coupons.map(item => item.id)
  const services = await prisma.service.findMany({
    where: {
      OR: [
        { name: { contains: runId } },
        { code: { contains: runId.toLowerCase() } },
        { description: { contains: runId } },
      ],
    },
    select: { id: true, categoryId: true },
  })
  const serviceIds = services.map(item => item.id)
  const categoryIds = Array.from(new Set(services.map(item => item.categoryId.toString()))).map(id => BigInt(id))
  const memberCards = await prisma.memberCard.findMany({
    where: { name: { contains: runId } },
    select: { id: true },
  })
  const memberCardIds = memberCards.map(item => item.id)
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { nickname: { contains: runId } },
        { adminRemark: { contains: runId } },
      ],
    },
    select: { id: true },
  })
  const userIds = users.map(item => item.id)
  const userMemberCards = await prisma.userMemberCard.findMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        { cardId: { in: memberCardIds } },
      ],
    },
    select: { id: true },
  })
  const userMemberCardIds = userMemberCards.map(item => item.id)
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { remark: { contains: runId } },
        { adminRemark: { contains: runId } },
        { userId: { in: userIds } },
        { serviceId: { in: serviceIds } },
        { purchaseCardId: { in: memberCardIds } },
        { memberCardId: { in: userMemberCardIds } },
        { grantedUserMemberCardId: { in: userMemberCardIds } },
      ],
    },
    select: { id: true, orderNo: true },
  })
  const orderIds = orders.map(item => item.id)
  const payments = await prisma.payment.findMany({
    where: { OR: [{ orderId: { in: orderIds } }, { callbackRaw: { contains: runId } }] },
    select: { id: true, paymentNo: true },
  })
  const paymentIds = payments.map(item => item.id)
  const paymentNos = payments.map(item => item.paymentNo)
  const addresses = await prisma.address.findMany({
    where: {
      OR: [
        { ownerType: 'user', ownerId: { in: userIds } },
        { detailAddress: { contains: runId } },
        { formattedAddress: { contains: runId } },
      ],
    },
    select: { id: true },
  })
  const userCoupons = await prisma.userCoupon.findMany({
    where: {
      OR: [
        { couponId: { in: couponIds } },
        { userId: { in: userIds } },
        { usedOrderId: { in: orderIds } },
      ],
    },
    select: { id: true },
  })
  const auditLogs = await prisma.auditLog.findMany({
    where: { requestId: { contains: runId } },
    select: { id: true },
  })
  const [
    paymentNotifyLogs,
    refunds,
    servicePhotos,
    serviceCheckins,
    assignments,
    notifications,
    incomeRecords,
    orderStatusLogs,
    memberCardRecords,
    pointLedgers,
  ] = await Promise.all([
    prisma.paymentNotifyLog.findMany({
      where: { OR: [{ paymentId: { in: paymentIds } }, { paymentNo: { in: paymentNos } }, { rawBody: { contains: runId } }] },
      select: { id: true },
    }),
    prisma.refund.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } }),
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
      where: { OR: [{ orderId: { in: orderIds } }, { userMemberCardId: { in: userMemberCardIds } }, { remark: { contains: runId } }] },
      select: { id: true },
    }),
    prisma.pointLedger.findMany({
      where: { OR: [{ orderId: { in: orderIds } }, { userId: { in: userIds } }, { remark: { contains: runId } }] },
      select: { id: true },
    }),
  ])

  return {
    ids: {
      couponIds,
      userCouponIds: userCoupons.map(item => item.id),
      serviceIds,
      categoryIds,
      memberCardIds,
      userIds,
      userMemberCardIds,
      orderIds,
      paymentIds,
      paymentNos,
      addressIds: addresses.map(item => item.id),
      auditLogIds: auditLogs.map(item => item.id),
      paymentNotifyLogIds: paymentNotifyLogs.map(item => item.id),
      refundIds: refunds.map(item => item.id),
      servicePhotoIds: servicePhotos.map(item => item.id),
      serviceCheckinIds: serviceCheckins.map(item => item.id),
      assignmentIds: assignments.map(item => item.id),
      notificationIds: notifications.map(item => item.id),
      incomeRecordIds: incomeRecords.map(item => item.id),
      orderStatusLogIds: orderStatusLogs.map(item => item.id),
      memberCardRecordIds: memberCardRecords.map(item => item.id),
      pointLedgerIds: pointLedgers.map(item => item.id),
    },
    counts: {
      coupons: coupons.length,
      userCoupons: userCoupons.length,
      services: services.length,
      serviceCategories: categoryIds.length,
      memberCards: memberCards.length,
      users: users.length,
      userMemberCards: userMemberCards.length,
      orders: orders.length,
      payments: payments.length,
      addresses: addresses.length,
      paymentNotifyLogs: paymentNotifyLogs.length,
      refunds: refunds.length,
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
    await tx.paymentNotifyLog.deleteMany({
      where: { OR: [{ id: { in: ids.paymentNotifyLogIds } }, { paymentId: { in: ids.paymentIds } }, { paymentNo: { in: ids.paymentNos } }, { rawBody: { contains: runId } }] },
    })
    await tx.refund.deleteMany({ where: { id: { in: ids.refundIds } } })
    await tx.payment.deleteMany({ where: { id: { in: ids.paymentIds } } })
    await tx.servicePhoto.deleteMany({ where: { id: { in: ids.servicePhotoIds } } })
    await tx.serviceCheckin.deleteMany({ where: { id: { in: ids.serviceCheckinIds } } })
    await tx.orderAssignment.deleteMany({ where: { id: { in: ids.assignmentIds } } })
    await tx.notification.deleteMany({ where: { id: { in: ids.notificationIds } } })
    await tx.staffIncomeRecord.deleteMany({ where: { id: { in: ids.incomeRecordIds } } })
    await tx.orderStatusLog.deleteMany({ where: { id: { in: ids.orderStatusLogIds } } })
    await tx.memberCardRecord.deleteMany({ where: { id: { in: ids.memberCardRecordIds } } })
    await tx.pointLedger.deleteMany({ where: { id: { in: ids.pointLedgerIds } } })
    await tx.userCoupon.deleteMany({ where: { id: { in: ids.userCouponIds } } })
    await tx.order.deleteMany({ where: { id: { in: ids.orderIds } } })
    await tx.address.deleteMany({ where: { id: { in: ids.addressIds } } })
    await tx.userMemberCard.deleteMany({ where: { id: { in: ids.userMemberCardIds } } })
    await tx.memberCardServiceRule.deleteMany({ where: { OR: [{ memberCardId: { in: ids.memberCardIds } }, { serviceId: { in: ids.serviceIds } }] } })
    await tx.memberCard.deleteMany({ where: { id: { in: ids.memberCardIds } } })
    await tx.servicePriceRule.deleteMany({ where: { serviceId: { in: ids.serviceIds } } })
    await tx.serviceImage.deleteMany({ where: { serviceId: { in: ids.serviceIds } } })
    await tx.service.deleteMany({ where: { id: { in: ids.serviceIds } } })
    await tx.serviceCategory.deleteMany({ where: { id: { in: ids.categoryIds } } })
    await tx.coupon.deleteMany({ where: { id: { in: ids.couponIds } } })
    await tx.user.deleteMany({ where: { id: { in: ids.userIds } } })
  })
  return data.counts
}

async function runSmoke(runId: string) {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false })
  const prisma = app.get(PrismaService)
  const admin = app.get(AdminBusinessService)
  const orders = app.get(OrdersService)
  const memberCards = app.get(MemberCardsService)
  const keepData = hasFlag('keep-data')

  try {
    await cleanupRunData(prisma, runId)
    const base = await createBaseData(prisma, runId)
    const userId = Number(base.user.id)
    const addressId = Number(base.address.id)

    const servicePaidCoupon = await createUserCoupon(prisma, runId, base.user.id, 'service paid', 20)
    const usableForService = await admin.listUsableUserCouponsForOrderEntry(userId, {
      serviceId: Number(base.cashService.id),
      amount: 120,
    })
    assertClosed(
      usableForService.some(item => Number(item.couponId) === Number(servicePaidCoupon.coupon.id)),
      'admin usable coupon API should return service coupon',
    )

    const paidRange = appointmentRange(1, 10)
    const paidServiceOrder = await orders.createAdminOrder(1, {
      userId,
      serviceId: Number(base.cashService.id),
      addressId,
      appointmentStartTime: toAdminDate(paidRange.start),
      appointmentEndTime: toAdminDate(paidRange.end),
      source: 'offline',
      paymentMode: 'offline_paid',
      couponId: Number(servicePaidCoupon.coupon.id),
      remark: `${runId} service offline paid`,
      adminRemark: `${runId} service offline paid`,
    }, requestId(runId, 'service-offline-paid'), '127.0.0.1') as { id: string | number, status: string }
    const paidServiceOrderId = Number(paidServiceOrder.id)
    const paidServiceRow = await prisma.order.findUniqueOrThrow({ where: { id: BigInt(paidServiceOrderId) } })
    assertClosed(paidServiceRow.status === ORDER_STATUS.PENDING_DISPATCH, 'offline paid service order should be pending dispatch')
    assertClosed(money(paidServiceRow.discountAmount) === 20, 'offline paid service discount should be 20')
    assertClosed(money(paidServiceRow.payableAmount) === 100, 'offline paid service payable should be 100')
    await assertCouponStatus(prisma, servicePaidCoupon.userCoupon.id, USER_COUPON_STATUS.USED, paidServiceOrderId)
    await assertPayment(prisma, paidServiceOrderId, 100)
    await assertEarnPoints(prisma, paidServiceOrderId, pointsForAmount(100))
    await assertAccounting(orders, paidServiceOrderId)

    const serviceUnpaidCoupon = await createUserCoupon(prisma, runId, base.user.id, 'service unpaid', 30)
    const unpaidRange = appointmentRange(2, 10)
    const unpaidServiceOrder = await orders.createAdminOrder(1, {
      userId,
      serviceId: Number(base.cashService.id),
      addressId,
      appointmentStartTime: toAdminDate(unpaidRange.start),
      appointmentEndTime: toAdminDate(unpaidRange.end),
      source: 'offline',
      paymentMode: 'unpaid',
      couponId: Number(serviceUnpaidCoupon.coupon.id),
      remark: `${runId} service unpaid`,
      adminRemark: `${runId} service unpaid`,
    }, requestId(runId, 'service-unpaid'), '127.0.0.1') as { id: string | number, status: string }
    const unpaidServiceOrderId = Number(unpaidServiceOrder.id)
    assertClosed(unpaidServiceOrder.status === ORDER_STATUS.PENDING_PAYMENT, 'unpaid service order should be pending payment')
    await assertCouponStatus(prisma, serviceUnpaidCoupon.userCoupon.id, USER_COUPON_STATUS.LOCKED, unpaidServiceOrderId)
    await assertNoEarnPoints(prisma, unpaidServiceOrderId)
    await assertAccounting(orders, unpaidServiceOrderId)
    await orders.confirmOfflinePayment(1, unpaidServiceOrderId, {
      amount: 90,
      remark: `${runId} service unpaid confirm`,
    }, requestId(runId, 'service-unpaid-confirm'), '127.0.0.1')
    await assertCouponStatus(prisma, serviceUnpaidCoupon.userCoupon.id, USER_COUPON_STATUS.USED, unpaidServiceOrderId)
    await assertPayment(prisma, unpaidServiceOrderId, 90)
    await assertEarnPoints(prisma, unpaidServiceOrderId, pointsForAmount(90))
    await assertAccounting(orders, unpaidServiceOrderId)

    const purchasePaidCoupon = await createUserCoupon(prisma, runId, base.user.id, 'purchase paid', 40)
    const usableForPurchase = await admin.listUsableUserCouponsForOrderEntry(userId, {
      target: 'member_card_purchase',
      amount: 300,
    })
    assertClosed(
      usableForPurchase.some(item => Number(item.couponId) === Number(purchasePaidCoupon.coupon.id)),
      'admin usable coupon API should return member card purchase coupon',
    )
    const paidPurchaseOrder = await memberCards.createAdminPurchaseOrder({
      userId,
      cardId: Number(base.memberCard.id),
      couponId: Number(purchasePaidCoupon.coupon.id),
      source: 'offline',
      paymentMode: 'offline_paid',
      payableAmount: 300,
      paymentRemark: `${runId} purchase paid`,
      adminRemark: `${runId} purchase paid`,
    }, { adminId: 1, requestId: requestId(runId, 'purchase-paid'), ip: '127.0.0.1' }) as { id: string | number, status: string }
    const paidPurchaseOrderId = Number(paidPurchaseOrder.id)
    assertClosed(paidPurchaseOrder.status === ORDER_STATUS.COMPLETED, 'offline paid purchase order should be completed')
    await assertCouponStatus(prisma, purchasePaidCoupon.userCoupon.id, USER_COUPON_STATUS.USED, paidPurchaseOrderId)
    await assertPayment(prisma, paidPurchaseOrderId, 260)
    await assertEarnPoints(prisma, paidPurchaseOrderId, pointsForAmount(260))
    await assertAccounting(orders, paidPurchaseOrderId)
    const grantedCard = await prisma.userMemberCard.findFirst({
      where: { userId: base.user.id, cardId: base.memberCard.id, status: 'active' },
      orderBy: [{ id: 'desc' }],
    })
    assertClosed(grantedCard, 'offline paid member card purchase should grant a user member card')

    const purchaseUnpaidCoupon = await createUserCoupon(prisma, runId, base.user.id, 'purchase unpaid', 50)
    const unpaidPurchaseOrder = await memberCards.createAdminPurchaseOrder({
      userId,
      cardId: Number(base.memberCard.id),
      couponId: Number(purchaseUnpaidCoupon.coupon.id),
      source: 'offline',
      paymentMode: 'unpaid',
      payableAmount: 300,
      adminRemark: `${runId} purchase unpaid`,
    }, { adminId: 1, requestId: requestId(runId, 'purchase-unpaid'), ip: '127.0.0.1' }) as { id: string | number, status: string }
    const unpaidPurchaseOrderId = Number(unpaidPurchaseOrder.id)
    assertClosed(unpaidPurchaseOrder.status === ORDER_STATUS.PENDING_PAYMENT, 'unpaid purchase order should be pending payment')
    await assertCouponStatus(prisma, purchaseUnpaidCoupon.userCoupon.id, USER_COUPON_STATUS.LOCKED, unpaidPurchaseOrderId)
    await assertNoEarnPoints(prisma, unpaidPurchaseOrderId)
    await assertAccounting(orders, unpaidPurchaseOrderId)
    await orders.confirmOfflinePayment(1, unpaidPurchaseOrderId, {
      amount: 250,
      remark: `${runId} purchase unpaid confirm`,
    }, requestId(runId, 'purchase-unpaid-confirm'), '127.0.0.1')
    await assertCouponStatus(prisma, purchaseUnpaidCoupon.userCoupon.id, USER_COUPON_STATUS.USED, unpaidPurchaseOrderId)
    await assertPayment(prisma, unpaidPurchaseOrderId, 250)
    await assertEarnPoints(prisma, unpaidPurchaseOrderId, pointsForAmount(250))
    await assertAccounting(orders, unpaidPurchaseOrderId)

    const cardBookingRange = appointmentRange(3, 10)
    const cardBooking = await orders.createAdminOrder(1, {
      userId,
      serviceId: Number(base.cardService.id),
      addressId,
      appointmentStartTime: toAdminDate(cardBookingRange.start),
      appointmentEndTime: toAdminDate(cardBookingRange.end),
      source: 'offline',
      paymentMode: 'member_card',
      memberCardId: Number(grantedCard!.id),
      remark: `${runId} member card booking`,
      adminRemark: `${runId} member card booking`,
    }, requestId(runId, 'member-card-booking'), '127.0.0.1') as { id: string | number, status: string }
    const cardBookingOrderId = Number(cardBooking.id)
    assertClosed(cardBooking.status === ORDER_STATUS.PENDING_DISPATCH, 'member card booking should be pending dispatch')
    await assertNoEarnPoints(prisma, cardBookingOrderId)

    const forbiddenCoupon = await createUserCoupon(prisma, runId, base.user.id, 'member card forbidden', 10)
    let memberCardCouponRejected = false
    try {
      await orders.createAdminOrder(1, {
        userId,
        serviceId: Number(base.cardService.id),
        addressId,
        appointmentStartTime: toAdminDate(appointmentRange(4, 10).start),
        appointmentEndTime: toAdminDate(appointmentRange(4, 10).end),
        source: 'offline',
        paymentMode: 'member_card',
        memberCardId: Number(grantedCard!.id),
        couponId: Number(forbiddenCoupon.coupon.id),
        remark: `${runId} forbidden member card coupon`,
        adminRemark: `${runId} forbidden member card coupon`,
      }, requestId(runId, 'member-card-coupon-forbidden'), '127.0.0.1')
    }
    catch {
      memberCardCouponRejected = true
    }
    assertClosed(memberCardCouponRejected, 'member card booking should reject coupon')

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
      orders: {
        paidServiceOrderId,
        unpaidServiceOrderId,
        paidPurchaseOrderId,
        unpaidPurchaseOrderId,
        cardBookingOrderId,
      },
      assertions: {
        servicePaidCouponUsed: true,
        serviceUnpaidCouponLockedThenUsed: true,
        purchasePaidCouponUsed: true,
        purchaseUnpaidCouponLockedThenUsed: true,
        purchaseOrdersEarnPoints: true,
        memberCardBookingNoEarnPoints: true,
        memberCardCouponRejected,
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
