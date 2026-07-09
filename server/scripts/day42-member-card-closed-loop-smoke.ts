import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import { AppModule } from '../src/app.module'
import { AdminBusinessService } from '../src/admin-business/admin-business.service'
import { MemberCardsService } from '../src/member-cards/member-cards.service'
import { OrdersService } from '../src/orders/orders.service'
import { PaymentsService } from '../src/payments/payments.service'
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
  if (!runId || !runId.startsWith('DAY42_TEST_')) {
    throw new Error('required: --run-id must start with DAY42_TEST_')
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
  return `198${digits}`
}

function dateText(offset = 1) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function testImageUrl(config: ConfigService, runId: string) {
  const baseUrl = config.get<string>('OSS_PUBLIC_BASE_URL', 'https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com').replace(/\/+$/, '')
  const prefix = config.get<string>('OSS_UPLOAD_PREFIX', 'life-assitant/dev').replace(/^\/+|\/+$/g, '')
  return `${baseUrl}/${prefix}/${runId}/day42-finish.jpg`
}

function assertClosed(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

async function createBaseData(prisma: PrismaService, runId: string) {
  const category = await prisma.serviceCategory.create({
    data: {
      name: `${runId} category`,
      icon: 'member-card',
      description: `${runId} member card rule category`,
      status: 1,
      sortOrder: 9999,
    },
  })
  const service = await prisma.service.create({
    data: {
      code: `${runId.toLowerCase()}_time_service`.slice(0, 64),
      categoryId: category.id,
      name: `${runId} time service`,
      description: `${runId} member card rule service`,
      basePrice: new Prisma.Decimal(180),
      minPrice: new Prisma.Decimal(180),
      priceUnit: 'hour',
      durationMinutes: 120,
      cardType: 'time',
      consumeUnit: 120,
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
      skills: [service.name],
      status: 1,
      workStatus: 1,
      cityCode: '330100',
    },
  })
  const user = await prisma.user.create({
    data: {
      nickname: `${runId} user`,
      phone: phoneFromRunId(runId, '01'),
      status: 1,
      source: 'day42',
      adminRemark: runId,
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
      detailAddress: `${runId} detail address`,
      formattedAddress: `${runId} formatted address`,
      latitude: new Prisma.Decimal('30.2741500'),
      longitude: new Prisma.Decimal('120.1551500'),
      coordinateType: 'gcj02',
      mapProvider: 'day42',
      source: 'day42',
      status: 1,
    },
  })
  return { category, service, staff, user, address }
}

async function main() {
  const runId = arg('run-id')
  assertRunId(runId)

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false })
  const prisma = app.get(PrismaService)
  const admin = app.get(AdminBusinessService)
  const memberCards = app.get(MemberCardsService)
  const orders = app.get(OrdersService)
  const payments = app.get(PaymentsService)
  const config = app.get(ConfigService)

  try {
    const base = await createBaseData(prisma, runId)
    const card = await admin.createMemberCard({
      name: `${runId} time card`,
      cardType: 'time',
      unitName: 'minute',
      unitMinutes: 60,
      totalUnits: 360,
      totalTimes: 6,
      allowHalfDeduct: false,
      minConsumeUnits: 60,
      applicableServices: '',
      serviceRules: '{}',
      serviceRuleList: JSON.stringify([{ serviceId: Number(base.service.id), consumeUnits: 120 }]),
      price: 360,
      validityDays: 365,
      status: 'published',
    }, adminContext(runId, 'create-card'))

    const serviceRules = await admin.getMemberCardServiceRules(Number(card.id))
    assertClosed(serviceRules.serviceRuleCount === 1, 'structured service rule should be created')

    const purchaseOrder = await memberCards.createPurchaseOrder(Number(base.user.id), {
      cardId: Number(card.id),
      remark: `${runId} purchase`,
      source: 'day42',
    }, requestId(runId, 'purchase'))
    await payments.createMockPayment(Number(base.user.id), Number(purchaseOrder.id), requestId(runId, 'mock-pay'))

    const userCard = await prisma.userMemberCard.findFirst({
      where: { userId: base.user.id, cardId: card.id, status: 'active' },
      orderBy: [{ id: 'desc' }],
    })
    assertClosed(userCard, 'paid purchase should grant user member card')

    const booking = await orders.createOrder(Number(base.user.id), {
      serviceId: Number(base.service.id),
      addressId: Number(base.address.id),
      appointmentDate: dateText(1),
      appointmentTimeSlot: '10:00-12:00',
      memberCardId: Number(userCard!.id),
      remark: `${runId} snapshot booking`,
      source: 'day42',
    }, requestId(runId, 'booking'))

    const bookingRow = await prisma.order.findUniqueOrThrow({ where: { id: BigInt(booking.id) } })
    const snapshot = bookingRow.memberCardRuleSnapshot as Record<string, unknown> | null
    assertClosed(snapshot && Number(snapshot.consumeUnits) === 120, 'booking should store 120-unit member card rule snapshot')
    assertClosed(bookingRow.memberCardConsumeUnits === 120, 'booking should freeze 120 units')

    await admin.updateMemberCardServiceRules(Number(card.id), {
      serviceRuleList: [{ serviceId: Number(base.service.id), consumeUnits: 60 }],
    }, adminContext(runId, 'change-rule'))

    await orders.assignOrder(1, Number(booking.id), { staffId: Number(base.staff.id), remark: `${runId} assign` }, requestId(runId, 'assign'))
    await orders.staffAccept(Number(base.staff.id), Number(booking.id), requestId(runId, 'accept'))
    await orders.staffOnTheWay(Number(base.staff.id), Number(booking.id), {}, requestId(runId, 'on-way'))
    await orders.staffStartService(Number(base.staff.id), Number(booking.id), {}, requestId(runId, 'start'))
    await orders.staffComplete(Number(base.staff.id), Number(booking.id), {
      photoUrls: [testImageUrl(config, runId)],
      actualMinutes: 120,
      remark: `${runId} complete`,
    }, requestId(runId, 'complete'))
    await orders.confirmOrder(Number(base.user.id), Number(booking.id), {}, requestId(runId, 'confirm'))

    const consumeRecord = await prisma.memberCardRecord.findFirst({
      where: { orderId: BigInt(booking.id), recordType: 'consume' },
      orderBy: [{ id: 'desc' }],
    })
    assertClosed(consumeRecord?.units === 120, 'completed order should consume snapshot units after rule changed')

    const cancelBooking = await orders.createOrder(Number(base.user.id), {
      serviceId: Number(base.service.id),
      addressId: Number(base.address.id),
      appointmentDate: dateText(2),
      appointmentTimeSlot: '10:00-12:00',
      memberCardId: Number(userCard!.id),
      remark: `${runId} cancel booking`,
      source: 'day42',
    }, requestId(runId, 'cancel-booking'))
    const cancelRow = await prisma.order.findUniqueOrThrow({ where: { id: BigInt(cancelBooking.id) } })
    assertClosed(cancelRow.memberCardConsumeUnits === 60, 'new booking should use changed 60-unit rule')
    await orders.cancelOrder(Number(base.user.id), Number(cancelBooking.id), { reason: `${runId} cancel release` }, requestId(runId, 'cancel'))
    const releaseRecord = await prisma.memberCardRecord.findFirst({
      where: { orderId: BigInt(cancelBooking.id), recordType: 'release' },
      orderBy: [{ id: 'desc' }],
    })
    assertClosed(releaseRecord?.units === 60, 'cancelled order should release frozen units')

    const adminDetail = await orders.getAdminOrderDetail(Number(booking.id))
    assertClosed(adminDetail.userMemberCardId === Number(userCard!.id), 'admin order detail should expose userMemberCardId')
    assertClosed(adminDetail.memberCardRuleSnapshot, 'admin order detail should expose member card rule snapshot')

    const audit = await admin.auditMemberCardRules({ page: 1, pageSize: 20, keyword: runId })
    assertClosed(Array.isArray(audit.items), 'rule audit should return a page result')

    console.log(JSON.stringify({
      status: 'passed',
      runId,
      memberCardId: Number(card.id),
      userMemberCardId: Number(userCard!.id),
      completedOrderId: Number(booking.id),
      completedConsumeUnits: consumeRecord?.units,
      cancelledOrderId: Number(cancelBooking.id),
      releasedUnits: releaseRecord?.units,
      ruleAuditItems: audit.total,
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
