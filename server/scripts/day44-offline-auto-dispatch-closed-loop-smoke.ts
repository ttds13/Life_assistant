import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import { AppModule } from '../src/app.module'
import { AdminBusinessService } from '../src/admin-business/admin-business.service'
import { ORDER_STATUS } from '../src/orders/constants/order-status'
import { OrdersService } from '../src/orders/orders.service'
import { PrismaService } from '../src/prisma/prisma.service'

type AdminContext = { adminId: number, requestId?: string, ip?: string }

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
  if (!runId || !runId.startsWith('DAY44_TEST_')) {
    throw new Error('required: --run-id must start with DAY44_TEST_')
  }
}

function requestId(runId: string, action: string) {
  return `${runId}:${action}`.slice(0, 64)
}

function adminContext(runId: string, action: string): AdminContext {
  return { adminId: 1, requestId: requestId(runId, action), ip: '127.0.0.1' }
}

function phoneFromRunId(runId: string, suffix: string) {
  const digits = `${Date.now()}${runId}${suffix}`.replace(/\D/g, '').slice(-8).padStart(8, '0')
  return `196${digits}`
}

function appointmentRange(offsetDays = 1, hour = 10) {
  const start = new Date()
  start.setDate(start.getDate() + offsetDays)
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

function dateText(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function testImageUrl(config: ConfigService, runId: string) {
  const baseUrl = config.get<string>('OSS_PUBLIC_BASE_URL', 'https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com').replace(/\/+$/, '')
  const prefix = config.get<string>('OSS_UPLOAD_PREFIX', 'life-assitant/dev').replace(/^\/+|\/+$/g, '')
  return `${baseUrl}/${prefix}/${runId}/offline-auto-dispatch-finish.jpg`
}

function assertClosed(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

function money(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) return 0
  if (value instanceof Prisma.Decimal) return Number(value.toFixed(2))
  return Number(new Prisma.Decimal(value).toFixed(2))
}

async function createBaseData(prisma: PrismaService, runId: string) {
  const category = await prisma.serviceCategory.create({
    data: {
      name: `${runId} offline auto category`,
      icon: 'offline',
      description: `${runId} offline auto dispatch closed loop category`,
      status: 1,
      sortOrder: 9999,
    },
  })

  const service = await prisma.service.create({
    data: {
      code: `${runId.toLowerCase()}_offline_auto_service`.slice(0, 64),
      categoryId: category.id,
      name: `${runId} offline auto service`,
      description: `${runId} offline auto dispatch closed loop service`,
      basePrice: new Prisma.Decimal(128),
      minPrice: new Prisma.Decimal(128),
      priceUnit: 'unit',
      durationMinutes: 60,
      cardType: 'none',
      consultationRequired: false,
      status: 1,
      sortOrder: 9999,
      cityCode: '330100',
    },
  })

  const staff = await prisma.staff.create({
    data: {
      name: `${runId} backup staff`,
      phone: phoneFromRunId(runId, '99'),
      passwordHash: `${runId}:not-for-login`,
      skills: [service.name],
      status: 1,
      workStatus: 1,
      cityCode: '330100',
    },
  })

  return { category, service, staff }
}

function addressPayload(runId: string, phone: string) {
  return {
    contactName: `${runId} contact`,
    contactPhone: phone,
    provinceName: 'Zhejiang',
    cityName: 'Hangzhou',
    districtName: 'Xihu',
    streetName: 'Day44 Street',
    addressTitle: `${runId} offline address`,
    detailAddress: `${runId} detail address`,
    houseNumber: '8-808',
    latitude: 30.27415,
    longitude: 120.15515,
    coordinateType: 'gcj02',
    mapProvider: 'day44',
    isDefault: true,
  }
}

async function collectRunData(prisma: PrismaService, runId: string) {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { nickname: { contains: runId } },
        { adminRemark: { contains: runId } },
      ],
    },
    select: { id: true, phone: true, nickname: true, source: true },
  })
  const userIds = users.map(item => item.id)

  const services = await prisma.service.findMany({
    where: {
      OR: [
        { name: { contains: runId } },
        { code: { contains: runId.toLowerCase() } },
        { description: { contains: runId } },
      ],
    },
    select: { id: true, categoryId: true, name: true },
  })
  const serviceIds = services.map(item => item.id)
  const categoryIds = Array.from(new Set(services.map(item => item.categoryId.toString()))).map(id => BigInt(id))

  const staff = await prisma.staff.findMany({
    where: { name: { contains: runId } },
    select: { id: true, name: true, workStatus: true },
  })
  const staffIds = staff.map(item => item.id)

  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { remark: { contains: runId } },
        { adminRemark: { contains: runId } },
        { userId: { in: userIds } },
        { serviceId: { in: serviceIds } },
      ],
    },
    select: {
      id: true,
      orderNo: true,
      status: true,
      source: true,
      userId: true,
      staffId: true,
      paidAmount: true,
      paidAt: true,
      completedAt: true,
    },
  })
  const orderIds = orders.map(item => item.id)

  const payments = await prisma.payment.findMany({
    where: {
      OR: [
        { orderId: { in: orderIds } },
        { callbackRaw: { contains: runId } },
      ],
    },
    select: { id: true, paymentNo: true, orderId: true, channel: true, amount: true, status: true, paidAt: true },
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
  const addressIds = addresses.map(item => item.id)

  const [
    paymentNotifyLogs,
    assignments,
    notifications,
    checkins,
    photos,
    incomeRecords,
    orderStatusLogs,
    pointLedgers,
    auditLogs,
  ] = await Promise.all([
    prisma.paymentNotifyLog.findMany({
      where: {
        OR: [
          { paymentId: { in: paymentIds } },
          { paymentNo: { in: paymentNos } },
          { rawBody: { contains: runId } },
        ],
      },
      select: { id: true, paymentNo: true, channel: true, processResult: true },
    }),
    prisma.orderAssignment.findMany({
      where: { orderId: { in: orderIds } },
      select: { id: true, orderId: true, staffId: true, assignType: true, assignStatus: true, notificationId: true },
    }),
    prisma.notification.findMany({
      where: {
        OR: [
          { bizType: 'order', bizId: { in: orderIds } },
          { title: { contains: runId } },
          { content: { contains: runId } },
        ],
      },
      select: { id: true, receiverType: true, receiverId: true, type: true, bizType: true, bizId: true, isRead: true, sendStatus: true },
    }),
    prisma.serviceCheckin.findMany({
      where: { orderId: { in: orderIds } },
      select: { id: true, orderId: true, staffId: true, checkinType: true },
    }),
    prisma.servicePhoto.findMany({
      where: { orderId: { in: orderIds } },
      select: { id: true, orderId: true, staffId: true, photoType: true, url: true },
    }),
    prisma.staffIncomeRecord.findMany({
      where: { orderId: { in: orderIds } },
      select: { id: true, orderId: true, staffId: true, amount: true, type: true, status: true, settlementStatus: true },
    }),
    prisma.orderStatusLog.findMany({
      where: {
        OR: [
          { orderId: { in: orderIds } },
          { requestId: { contains: runId } },
          { remark: { contains: runId } },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, orderId: true, action: true, fromStatus: true, toStatus: true, operatorType: true, requestId: true },
    }),
    prisma.pointLedger.findMany({
      where: {
        OR: [
          { orderId: { in: orderIds } },
          { userId: { in: userIds } },
          { remark: { contains: runId } },
        ],
      },
      select: { id: true, userId: true, orderId: true, type: true, points: true, amount: true },
    }),
    prisma.auditLog.findMany({
      where: { requestId: { contains: runId } },
      select: { id: true, action: true, module: true, targetType: true, targetId: true, requestId: true },
    }),
  ])

  return {
    ids: {
      userIds,
      serviceIds,
      categoryIds,
      staffIds,
      orderIds,
      paymentIds,
      paymentNos,
      addressIds,
      paymentNotifyLogIds: paymentNotifyLogs.map(item => item.id),
      assignmentIds: assignments.map(item => item.id),
      notificationIds: notifications.map(item => item.id),
      checkinIds: checkins.map(item => item.id),
      photoIds: photos.map(item => item.id),
      incomeRecordIds: incomeRecords.map(item => item.id),
      orderStatusLogIds: orderStatusLogs.map(item => item.id),
      pointLedgerIds: pointLedgers.map(item => item.id),
      auditLogIds: auditLogs.map(item => item.id),
    },
    counts: {
      users: users.length,
      services: services.length,
      serviceCategories: categoryIds.length,
      staff: staff.length,
      orders: orders.length,
      payments: payments.length,
      paymentNotifyLogs: paymentNotifyLogs.length,
      addresses: addresses.length,
      assignments: assignments.length,
      notifications: notifications.length,
      serviceCheckins: checkins.length,
      servicePhotos: photos.length,
      incomeRecords: incomeRecords.length,
      orderStatusLogs: orderStatusLogs.length,
      pointLedgers: pointLedgers.length,
      auditLogs: auditLogs.length,
    },
    users,
    services,
    staff,
    orders,
    payments: payments.map(item => ({ ...item, amount: money(item.amount) })),
    paymentNotifyLogs,
    assignments,
    notifications,
    checkins,
    photos,
    incomeRecords: incomeRecords.map(item => ({ ...item, amount: money(item.amount) })),
    orderStatusLogs,
    pointLedgers: pointLedgers.map(item => ({ ...item, amount: money(item.amount) })),
    auditLogs,
  }
}

async function cleanupRunData(prisma: PrismaService, runId: string) {
  const data = await collectRunData(prisma, runId)
  const ids = data.ids

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({ where: { id: { in: ids.auditLogIds } } })
    await tx.paymentNotifyLog.deleteMany({
      where: {
        OR: [
          { id: { in: ids.paymentNotifyLogIds } },
          { paymentId: { in: ids.paymentIds } },
          { paymentNo: { in: ids.paymentNos } },
          { rawBody: { contains: runId } },
        ],
      },
    })
    await tx.refund.deleteMany({ where: { orderId: { in: ids.orderIds } } })
    await tx.payment.deleteMany({ where: { id: { in: ids.paymentIds } } })
    await tx.servicePhoto.deleteMany({ where: { id: { in: ids.photoIds } } })
    await tx.serviceCheckin.deleteMany({ where: { id: { in: ids.checkinIds } } })
    await tx.orderAssignment.deleteMany({ where: { id: { in: ids.assignmentIds } } })
    await tx.notification.deleteMany({ where: { id: { in: ids.notificationIds } } })
    await tx.staffIncomeRecord.deleteMany({ where: { id: { in: ids.incomeRecordIds } } })
    await tx.memberCardRecord.deleteMany({ where: { orderId: { in: ids.orderIds } } })
    await tx.pointLedger.deleteMany({ where: { id: { in: ids.pointLedgerIds } } })
    await tx.orderStatusLog.deleteMany({ where: { id: { in: ids.orderStatusLogIds } } })
    await tx.order.deleteMany({ where: { id: { in: ids.orderIds } } })
    await tx.address.deleteMany({ where: { id: { in: ids.addressIds } } })
    await tx.staff.deleteMany({ where: { id: { in: ids.staffIds } } })
    await tx.servicePriceRule.deleteMany({ where: { serviceId: { in: ids.serviceIds } } })
    await tx.serviceImage.deleteMany({ where: { serviceId: { in: ids.serviceIds } } })
    await tx.memberCardServiceRule.deleteMany({ where: { serviceId: { in: ids.serviceIds } } })
    await tx.service.deleteMany({ where: { id: { in: ids.serviceIds } } })
    await tx.serviceCategory.deleteMany({ where: { id: { in: ids.categoryIds } } })
    await tx.user.deleteMany({ where: { id: { in: ids.userIds } } })
  })

  return data.counts
}

async function runClosedLoop(runId: string) {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false })
  const prisma = app.get(PrismaService)
  const admin = app.get(AdminBusinessService)
  const orders = app.get(OrdersService)
  const config = app.get(ConfigService)
  const keepData = hasFlag('keep-data')

  try {
    await cleanupRunData(prisma, runId)

    const base = await createBaseData(prisma, runId)
    const phone = phoneFromRunId(runId, '01')
    const address = addressPayload(runId, phone)

    const createdCustomer = await admin.createUser({
      phone,
      nickname: `${runId} offline customer`,
      source: 'offline',
      cityCode: '330100',
      adminRemark: `${runId} offline registration`,
      address,
    }, adminContext(runId, 'offline-register')) as { id: bigint | number | string }
    const userId = Number(createdCustomer.id)
    assertClosed(userId > 0, 'offline customer should be created')

    const range = appointmentRange(1, 10)
    const order = await orders.createAdminOrder(1, {
      userId,
      serviceId: Number(base.service.id),
      address,
      appointmentStartTime: toAdminDate(range.start),
      appointmentEndTime: toAdminDate(range.end),
      source: 'offline',
      paymentMode: 'unpaid',
      payableAmount: 128,
      remark: `${runId} offline unpaid auto dispatch order`,
      adminRemark: `${runId} offline unpaid auto dispatch order`,
    }, requestId(runId, 'admin-create-unpaid-order'), '127.0.0.1') as { id: bigint | number | string, orderNo: string, status: string, payableAmount: number }
    const orderId = Number(order.id)
    const orderNo = String(order.orderNo)
    assertClosed(order.status === ORDER_STATUS.PENDING_PAYMENT, 'new offline unpaid order should be pending payment')

    let blockedBeforePayment = false
    let blockedBeforePaymentMessage = ''
    try {
      await orders.autoAssignOrder(1, orderId, { remark: `${runId} should block before payment` }, requestId(runId, 'auto-assign-before-payment'), '127.0.0.1')
    }
    catch (error) {
      blockedBeforePayment = true
      blockedBeforePaymentMessage = error instanceof Error ? error.message : String(error)
    }
    assertClosed(blockedBeforePayment, 'auto assign must be blocked before offline payment is confirmed')

    const paidOrder = await orders.confirmOfflinePayment(1, orderId, {
      amount: 128,
      remark: `${runId} offline cash collected`,
    }, requestId(runId, 'confirm-offline-payment'), '127.0.0.1') as { status: string, paidAmount: number, paidAt?: string | null }
    assertClosed(paidOrder.status === ORDER_STATUS.PENDING_DISPATCH, 'paid offline order should become pending dispatch')

    const assignedOrder = await orders.autoAssignOrder(1, orderId, {
      remark: `${runId} auto assign after offline payment`,
    }, requestId(runId, 'auto-assign-after-payment'), '127.0.0.1') as { status: string, staffId?: number | null }
    assertClosed(assignedOrder.status === ORDER_STATUS.DISPATCHED, 'auto assigned order should become dispatched')
    assertClosed(assignedOrder.staffId, 'auto assigned order should have staffId')
    const staffId = Number(assignedOrder.staffId)

    await orders.staffAccept(staffId, orderId, requestId(runId, 'staff-accept'))
    await orders.staffOnTheWay(staffId, orderId, {}, requestId(runId, 'staff-on-the-way'))
    await orders.staffStartService(staffId, orderId, {}, requestId(runId, 'staff-start'))
    await orders.staffComplete(staffId, orderId, {
      photoUrls: [testImageUrl(config, runId)],
      actualMinutes: 60,
      remark: `${runId} staff complete offline service`,
    }, requestId(runId, 'staff-complete'))
    const confirmedOrder = await orders.confirmOrder(userId, orderId, {}, requestId(runId, 'user-confirm')) as { status: string, completedAt?: string | null }
    assertClosed(confirmedOrder.status === ORDER_STATUS.COMPLETED, 'confirmed order should be completed')

    const accounting = await orders.getAdminOrderAccounting(orderId)
    assertClosed(accounting.passed, 'admin order accounting should pass')

    const finance = await admin.getFinanceSummary({
      startDate: dateText(),
      endDate: dateText(),
      source: 'offline',
      channel: 'offline',
      pageNum: 1,
      pageSize: 20,
    } as any)
    assertClosed(finance.summary.paymentCount >= 1, 'finance summary should include offline payment')

    const beforeCleanup = await collectRunData(prisma, runId)
    const assignment = beforeCleanup.assignments.find(item => Number(item.orderId) === orderId)
    assertClosed(assignment?.assignType === 'auto', 'assignment should be recorded as auto')
    assertClosed(assignment?.assignStatus === 'accepted', 'assignment should be accepted after staff accepts order')
    assertClosed(beforeCleanup.payments.some(item => item.channel === 'offline' && item.status === 'success'), 'offline success payment should be recorded')
    assertClosed(beforeCleanup.paymentNotifyLogs.length >= 1, 'offline payment notify log should be recorded')
    assertClosed(beforeCleanup.notifications.some(item => item.receiverType === 'staff'), 'staff notification should be recorded')
    assertClosed(beforeCleanup.checkins.length >= 3, 'service checkins should include on_the_way/start/finish')
    assertClosed(beforeCleanup.photos.length >= 1, 'finish service photo should be recorded')
    assertClosed(beforeCleanup.incomeRecords.length >= 1, 'staff income record should be generated after completion')
    assertClosed(beforeCleanup.pointLedgers.some(item => item.type === 'earn'), 'earned points should be generated after offline payment')

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
      chain: {
        offlineUserId: userId,
        orderId,
        orderNo,
        orderInitialStatus: order.status,
        blockedBeforePayment,
        blockedBeforePaymentMessage,
        statusAfterPayment: paidOrder.status,
        statusAfterAutoAssign: assignedOrder.status,
        assignedStaffId: staffId,
        finalStatus: confirmedOrder.status,
      },
      accounting: {
        passed: accounting.passed,
        checks: accounting.checks,
        payments: accounting.payments.length,
        pointLedgers: accounting.pointLedgers.length,
        incomeRecords: accounting.incomeRecords.length,
      },
      finance: {
        offlinePaymentCount: finance.summary.paymentCount,
        offlinePaidAmount: finance.summary.paidAmount,
        offlineNetRevenue: finance.summary.netRevenue,
      },
      records: {
        counts: beforeCleanup.counts,
        users: beforeCleanup.users.map(item => ({
          id: Number(item.id),
          phone: item.phone,
          nickname: item.nickname,
          source: item.source,
        })),
        orders: beforeCleanup.orders.map(item => ({
          id: Number(item.id),
          orderNo: item.orderNo,
          status: item.status,
          source: item.source,
          userId: Number(item.userId),
          staffId: item.staffId ? Number(item.staffId) : null,
          paidAmount: money(item.paidAmount),
          paidAt: item.paidAt?.toISOString() || null,
          completedAt: item.completedAt?.toISOString() || null,
        })),
        payments: beforeCleanup.payments.map(item => ({
          id: Number(item.id),
          paymentNo: item.paymentNo,
          orderId: Number(item.orderId),
          channel: item.channel,
          amount: item.amount,
          status: item.status,
          paidAt: item.paidAt?.toISOString() || null,
        })),
        assignments: beforeCleanup.assignments.map(item => ({
          id: Number(item.id),
          orderId: Number(item.orderId),
          staffId: Number(item.staffId),
          assignType: item.assignType,
          assignStatus: item.assignStatus,
          notificationId: item.notificationId ? Number(item.notificationId) : null,
        })),
        notifications: beforeCleanup.notifications.map(item => ({
          id: Number(item.id),
          receiverType: item.receiverType,
          receiverId: Number(item.receiverId),
          type: item.type,
          bizType: item.bizType,
          bizId: item.bizId ? Number(item.bizId) : null,
          isRead: item.isRead,
          sendStatus: item.sendStatus,
        })),
        checkins: beforeCleanup.checkins.map(item => ({
          id: Number(item.id),
          orderId: Number(item.orderId),
          staffId: Number(item.staffId),
          checkinType: item.checkinType,
        })),
        incomeRecords: beforeCleanup.incomeRecords.map(item => ({
          id: Number(item.id),
          orderId: Number(item.orderId),
          staffId: Number(item.staffId),
          amount: item.amount,
          type: item.type,
          status: item.status,
          settlementStatus: item.settlementStatus,
        })),
        pointLedgers: beforeCleanup.pointLedgers.map(item => ({
          id: Number(item.id),
          userId: Number(item.userId),
          orderId: item.orderId ? Number(item.orderId) : null,
          type: item.type,
          points: item.points,
          amount: item.amount,
        })),
        statusLogActions: beforeCleanup.orderStatusLogs.map(item => ({
          id: Number(item.id),
          action: item.action,
          fromStatus: item.fromStatus,
          toStatus: item.toStatus,
          operatorType: item.operatorType,
        })),
      },
      cleanup: {
        before: cleanupBeforeCounts,
        after: cleanupAfterCounts,
      },
    }
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
  const result = await runClosedLoop(runId)
  console.log(JSON.stringify(result, jsonReplacer, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
