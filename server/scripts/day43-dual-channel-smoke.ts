import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import { AppModule } from '../src/app.module'
import { AdminBusinessService } from '../src/admin-business/admin-business.service'
import { MemberCardsService } from '../src/member-cards/member-cards.service'
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

function assertRunId(runId?: string): asserts runId is string {
  if (!runId || !runId.startsWith('DAY43_TEST_')) {
    throw new Error('required: --run-id must start with DAY43_TEST_')
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
  return `197${digits}`
}

function appointmentRange(offset = 1, hour = 10) {
  const start = new Date()
  start.setDate(start.getDate() + offset)
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

function testImageUrl(config: ConfigService, runId: string, name: string) {
  const baseUrl = config.get<string>('OSS_PUBLIC_BASE_URL', 'https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com').replace(/\/+$/, '')
  const prefix = config.get<string>('OSS_UPLOAD_PREFIX', 'life-assitant/dev').replace(/^\/+|\/+$/g, '')
  return `${baseUrl}/${prefix}/${runId}/${name}.jpg`
}

function assertClosed(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

async function createBaseData(prisma: PrismaService, runId: string) {
  const category = await prisma.serviceCategory.create({
    data: {
      name: `${runId} category`,
      icon: 'channel',
      description: `${runId} dual channel category`,
      status: 1,
      sortOrder: 9999,
    },
  })
  const cashService = await prisma.service.create({
    data: {
      code: `${runId.toLowerCase()}_cash_service`.slice(0, 64),
      categoryId: category.id,
      name: `${runId} cash service`,
      description: `${runId} offline cash service`,
      basePrice: new Prisma.Decimal(120),
      minPrice: new Prisma.Decimal(120),
      priceUnit: '次',
      durationMinutes: 60,
      cardType: 'none',
      consultationRequired: false,
      status: 1,
      sortOrder: 9998,
      cityCode: '330100',
    },
  })
  const memberService = await prisma.service.create({
    data: {
      code: `${runId.toLowerCase()}_member_service`.slice(0, 64),
      categoryId: category.id,
      name: `${runId} member service`,
      description: `${runId} offline member card service`,
      basePrice: new Prisma.Decimal(180),
      minPrice: new Prisma.Decimal(180),
      priceUnit: '小时',
      durationMinutes: 60,
      cardType: 'time',
      consumeUnit: 60,
      consultationRequired: false,
      status: 1,
      sortOrder: 9999,
      cityCode: '330100',
    },
  })
  const staff = await prisma.staff.create({
    data: {
      name: `${runId} staff`,
      phone: phoneFromRunId(runId, '90'),
      passwordHash: `${runId}:not-for-login`,
      skills: [cashService.name, memberService.name],
      status: 1,
      workStatus: 1,
      cityCode: '330100',
    },
  })
  return { category, cashService, memberService, staff }
}

function addressPayload(runId: string, phone: string, suffix: string) {
  return {
    contactName: `${runId} contact ${suffix}`,
    contactPhone: phone,
    provinceName: 'Zhejiang',
    cityName: 'Hangzhou',
    districtName: 'Xihu',
    streetName: 'Day43 Street',
    addressTitle: `${runId} address ${suffix}`,
    detailAddress: `${runId} detail address ${suffix}`,
    houseNumber: suffix,
    latitude: 30.27415,
    longitude: 120.15515,
    coordinateType: 'gcj02',
    mapProvider: 'day43',
    isDefault: true,
  }
}

async function completeOrderFlow(
  orders: OrdersService,
  staffId: number,
  userId: number,
  orderId: number,
  runId: string,
  imageUrl: string,
  suffix: string,
) {
  await orders.assignOrder(1, orderId, { staffId, remark: `${runId} assign ${suffix}` }, requestId(runId, `assign-${suffix}`), '127.0.0.1')
  await orders.staffAccept(staffId, orderId, requestId(runId, `accept-${suffix}`))
  await orders.staffOnTheWay(staffId, orderId, {}, requestId(runId, `on-way-${suffix}`))
  await orders.staffStartService(staffId, orderId, {}, requestId(runId, `start-${suffix}`))
  await orders.staffComplete(staffId, orderId, {
    photoUrls: [imageUrl],
    actualMinutes: 60,
    remark: `${runId} staff complete ${suffix}`,
  }, requestId(runId, `complete-${suffix}`))
  await orders.confirmOrder(userId, orderId, {}, requestId(runId, `confirm-${suffix}`))
}

async function main() {
  const runId = arg('run-id')
  assertRunId(runId)

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false })
  const prisma = app.get(PrismaService)
  const admin = app.get(AdminBusinessService)
  const memberCards = app.get(MemberCardsService)
  const orders = app.get(OrdersService)
  const config = app.get(ConfigService)

  try {
    const base = await createBaseData(prisma, runId)
    const phone = phoneFromRunId(runId, '01')

    const createdCustomer = await admin.createUser({
      phone,
      nickname: `${runId} offline customer`,
      source: 'offline',
      cityCode: '330100',
      adminRemark: `${runId} offline customer`,
      address: addressPayload(runId, phone, 'customer'),
    }, adminContext(runId, 'create-customer')) as { id: bigint | number | string }
    const reusedCustomer = await admin.createUser({
      phone,
      nickname: `${runId} duplicate customer`,
      source: 'wechat_private',
      adminRemark: `${runId} reuse customer`,
    }, adminContext(runId, 'reuse-customer')) as { id: bigint | number | string }
    const userId = Number(createdCustomer.id)
    assertClosed(userId === Number(reusedCustomer.id), 'admin create customer should reuse existing phone')

    const { start: paidStart, end: paidEnd } = appointmentRange(1, 10)
    const offlinePaidOrder = await orders.createAdminOrder(1, {
      customer: { phone, nickname: `${runId} offline customer`, cityCode: '330100' },
      serviceId: Number(base.cashService.id),
      address: addressPayload(runId, phone, 'paid'),
      appointmentStartTime: toAdminDate(paidStart),
      appointmentEndTime: toAdminDate(paidEnd),
      source: 'offline',
      paymentMode: 'offline_paid',
      payableAmount: 120,
      offlinePaymentRemark: `${runId} offline paid`,
      adminRemark: `${runId} offline paid order`,
    }, requestId(runId, 'offline-paid-order'), '127.0.0.1') as { id: number, status: string }
    assertClosed(offlinePaidOrder.status === ORDER_STATUS.PENDING_DISPATCH, 'offline paid order should be pending dispatch')

    const offlinePayment = await prisma.payment.findFirst({
      where: { orderId: BigInt(offlinePaidOrder.id), channel: 'offline', status: 'success' },
    })
    assertClosed(offlinePayment, 'offline paid order should create offline payment')

    const { start: unpaidStart, end: unpaidEnd } = appointmentRange(2, 11)
    const unpaidOrder = await orders.createAdminOrder(1, {
      customer: { phone, nickname: `${runId} phone customer`, cityCode: '330100' },
      serviceId: Number(base.cashService.id),
      address: addressPayload(runId, phone, 'unpaid'),
      appointmentStartTime: toAdminDate(unpaidStart),
      appointmentEndTime: toAdminDate(unpaidEnd),
      source: 'phone',
      paymentMode: 'unpaid',
      payableAmount: 120,
      adminRemark: `${runId} unpaid order`,
    }, requestId(runId, 'unpaid-order'), '127.0.0.1') as { id: number, status: string }
    assertClosed(unpaidOrder.status === ORDER_STATUS.PENDING_PAYMENT, 'unpaid admin order should be pending payment')
    await orders.confirmOfflinePayment(1, unpaidOrder.id, {
      amount: 120,
      remark: `${runId} confirm unpaid offline payment`,
    }, requestId(runId, 'confirm-unpaid'), '127.0.0.1')
    const paidUnpaidOrder = await prisma.order.findUniqueOrThrow({ where: { id: BigInt(unpaidOrder.id) } })
    assertClosed(paidUnpaidOrder.status === ORDER_STATUS.PENDING_DISPATCH, 'confirmed unpaid order should be pending dispatch')

    const card = await admin.createMemberCard({
      name: `${runId} offline time card`,
      cardType: 'time',
      unitName: 'minute',
      unitMinutes: 60,
      totalUnits: 180,
      totalTimes: 3,
      allowHalfDeduct: false,
      minConsumeUnits: 60,
      applicableServices: '',
      serviceRules: '{}',
      serviceRuleList: JSON.stringify([{ serviceId: Number(base.memberService.id), consumeUnits: 60 }]),
      price: 300,
      validityDays: 365,
      status: 'published',
    }, adminContext(runId, 'create-card'))
    const grantedCard = await memberCards.grantCard({
      userId,
      cardId: Number(card.id),
      source: 'offline',
      offlinePaymentAmount: 300,
      paymentChannel: 'offline',
      paymentRemark: `${runId} offline member card payment`,
      remark: `${runId} offline grant`,
    }, adminContext(runId, 'grant-card')) as { id: number }
    const userCard = await prisma.userMemberCard.findUniqueOrThrow({ where: { id: BigInt(grantedCard.id) } })
    assertClosed(userCard.source === 'offline', 'offline granted member card should keep source=offline')

    const { start: cardStart, end: cardEnd } = appointmentRange(3, 10)
    const memberCardOrder = await orders.createAdminOrder(1, {
      userId,
      serviceId: Number(base.memberService.id),
      address: addressPayload(runId, phone, 'member-card'),
      appointmentStartTime: toAdminDate(cardStart),
      appointmentEndTime: toAdminDate(cardEnd),
      source: 'wechat_private',
      paymentMode: 'member_card',
      memberCardId: Number(grantedCard.id),
      adminRemark: `${runId} member card order`,
    }, requestId(runId, 'member-card-order'), '127.0.0.1') as { id: number, status: string, memberCardRuleSnapshot?: unknown }
    assertClosed(memberCardOrder.status === ORDER_STATUS.PENDING_DISPATCH, 'member card admin order should be pending dispatch')

    const freezeRecord = await prisma.memberCardRecord.findFirst({
      where: { orderId: BigInt(memberCardOrder.id), recordType: 'freeze', operatorType: 'admin' },
    })
    assertClosed(freezeRecord?.units === 60, 'member card admin order should freeze 60 units by admin')

    const imageUrl = testImageUrl(config, runId, 'finish')
    await completeOrderFlow(orders, Number(base.staff.id), userId, offlinePaidOrder.id, runId, imageUrl, 'offline-paid')
    await completeOrderFlow(orders, Number(base.staff.id), userId, memberCardOrder.id, runId, imageUrl, 'member-card')

    const consumeRecord = await prisma.memberCardRecord.findFirst({
      where: { orderId: BigInt(memberCardOrder.id), recordType: 'consume' },
      orderBy: [{ id: 'desc' }],
    })
    assertClosed(consumeRecord?.units === 60, 'completed member card order should consume frozen units')

    const accounting = await orders.getAdminOrderAccounting(offlinePaidOrder.id)
    assertClosed(accounting.passed, 'offline paid accounting should pass')
    const memberAccounting = await orders.getAdminOrderAccounting(memberCardOrder.id)
    assertClosed(memberAccounting.passed, 'member card accounting should pass')

    const finance = await admin.getFinanceSummary({
      source: 'offline',
      channel: 'offline',
      pageNum: 1,
      pageSize: 20,
    } as any)
    assertClosed(finance.summary.paymentCount >= 1, 'finance summary should count offline payments')

    console.log(JSON.stringify({
      status: 'passed',
      runId,
      userId,
      offlinePaidOrderId: offlinePaidOrder.id,
      unpaidOrderId: unpaidOrder.id,
      memberCardId: Number(card.id),
      userMemberCardId: Number(grantedCard.id),
      memberCardOrderId: memberCardOrder.id,
      offlinePaymentNo: offlinePayment?.paymentNo,
      financeOfflinePaymentCount: finance.summary.paymentCount,
    }, null, 2))
  }
  finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
