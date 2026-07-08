import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import { AppModule } from '../src/app.module'
import { NotificationsService } from '../src/notifications/notifications.service'
import { ORDER_STATUS } from '../src/orders/constants/order-status'
import { ORDER_TYPE } from '../src/orders/constants/order-type'
import { OrdersService } from '../src/orders/orders.service'
import { PrismaService } from '../src/prisma/prisma.service'
import { StaffProfileChangeService } from '../src/staff-profile-change/staff-profile-change.service'

function arg(name: string) {
  const prefix = `--${name}=`
  const matched = process.argv.find(item => item.startsWith(prefix))
  if (matched) return matched.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function assertRunId(runId?: string): asserts runId is string {
  if (!runId || !runId.startsWith('DAY40_TEST_')) {
    throw new Error('required: --run-id must start with DAY40_TEST_')
  }
}

function requestId(runId: string, action: string) {
  return `${runId}:${action}`.slice(0, 64)
}

function phoneFromRunId(runId: string, suffix: string) {
  const digits = `${Date.now()}${runId}${suffix}`.replace(/\D/g, '').slice(-8).padStart(8, '0')
  return `198${digits}`
}

function appointmentRange(offset = 1, hour = 10) {
  const start = new Date()
  start.setDate(start.getDate() + offset)
  start.setHours(hour, 0, 0, 0)
  const end = new Date(start)
  end.setHours(hour + 1, 0, 0, 0)
  return { start, end }
}

function testImageUrl(config: ConfigService, runId: string, name: string) {
  const baseUrl = config.get<string>('OSS_PUBLIC_BASE_URL', 'https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com').replace(/\/+$/, '')
  const prefix = config.get<string>('OSS_UPLOAD_PREFIX', 'life-assitant/dev').replace(/^\/+|\/+$/g, '')
  return `${baseUrl}/${prefix}/${runId}/${name}.jpg`
}

function orderNo() {
  return `D40${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`.slice(0, 32)
}

function assertClosed(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

async function createBaseData(prisma: PrismaService, runId: string) {
  const category = await prisma.serviceCategory.create({
    data: {
      name: `${runId} category`,
      icon: 'tool',
      description: `${runId} day40 category`,
      status: 1,
      sortOrder: 9999,
    },
  })
  const service = await prisma.service.create({
    data: {
      code: `${runId.toLowerCase()}_service`.slice(0, 64),
      categoryId: category.id,
      name: `${runId} service`,
      description: `${runId} service`,
      basePrice: new Prisma.Decimal(120),
      minPrice: new Prisma.Decimal(120),
      priceUnit: '次',
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
      name: `${runId} staff`,
      phone: phoneFromRunId(runId, '10'),
      passwordHash: `${runId}:not-for-login`,
      skills: ['cleaning', runId],
      idCard: '330100199001010000',
      applicationNote: `${runId} initial application`,
      applicationImages: [],
      status: 1,
      workStatus: 1,
      cityCode: '330100',
    },
  })
  const userPhone = phoneFromRunId(runId, '20')
  const user = await prisma.user.create({
    data: {
      phone: userPhone,
      nickname: `${runId} user`,
      source: 'day40',
      adminRemark: `${runId} smoke user`,
      cityCode: '330100',
    },
  })
  const { start, end } = appointmentRange(1, 10)
  const order = await prisma.order.create({
    data: {
      orderNo: orderNo(),
      userId: user.id,
      serviceId: service.id,
      orderType: ORDER_TYPE.SERVICE_BOOKING,
      status: ORDER_STATUS.PENDING_DISPATCH,
      serviceSnapshot: {
        id: Number(service.id),
        code: service.code,
        name: service.name,
        priceUnit: service.priceUnit,
        cardType: service.cardType,
      },
      addressSnapshot: {
        contactName: `${runId} user`,
        contactPhone: userPhone,
        cityName: '杭州',
        districtName: '西湖',
        detailAddress: `${runId} address`,
        formattedAddress: `杭州西湖 ${runId} address`,
      },
      appointmentStartTime: start,
      appointmentEndTime: end,
      originalAmount: new Prisma.Decimal(120),
      payableAmount: new Prisma.Decimal(120),
      remark: `${runId} smoke order`,
      adminRemark: `${runId} smoke order`,
      source: 'day40',
      cityCode: '330100',
    },
  })
  await prisma.orderStatusLog.create({
    data: {
      orderId: order.id,
      fromStatus: null,
      toStatus: ORDER_STATUS.PENDING_DISPATCH,
      operatorType: 'system',
      operatorId: BigInt(0),
      action: 'create_order',
      requestId: requestId(runId, 'create-order'),
      remark: `${runId} create order`,
    },
  })
  return { category, service, staff, user, order }
}

async function main() {
  const runId = arg('run-id')
  assertRunId(runId)

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false })
  const prisma = app.get(PrismaService)
  const orders = app.get(OrdersService)
  const notifications = app.get(NotificationsService)
  const profileChanges = app.get(StaffProfileChangeService)
  const config = app.get(ConfigService)

  try {
    const { staff, order } = await createBaseData(prisma, runId)
    const staffId = Number(staff.id)
    const orderId = Number(order.id)

    await orders.assignOrder(1, orderId, {
      staffId,
      remark: `${runId} assign`,
    }, requestId(runId, 'assign'), '127.0.0.1')

    const notificationPage = await notifications.listAdminStaffNotifications({ staffId, orderId, page: 1, pageSize: 20 })
    const assignedNotification = notificationPage.items.find(item => item.type === 'order_assigned')
    assertClosed(assignedNotification, 'admin cannot see staff assigned notification')
    assertClosed(assignedNotification?.sendStatus === 'sent', 'assigned notification is not sent')

    await notifications.markStaffNotificationRead(staffId, assignedNotification!.id)
    const readDetail = await notifications.getAdminStaffNotificationDetail(assignedNotification!.id)
    assertClosed(readDetail.isRead === true, 'staff read status is not visible in admin')
    assertClosed(Boolean(readDetail.readAt), 'staff notification readAt is missing')

    const resentByNotification = await notifications.resendStaffNotification(
      assignedNotification!.id,
      1,
      requestId(runId, 'resend-notification'),
      '127.0.0.1',
    )
    assertClosed(resentByNotification.orderId === orderId, 'resend by notification did not keep order binding')

    const resentByOrder = await notifications.resendOrderStaffNotification(
      orderId,
      1,
      requestId(runId, 'resend-order-notification'),
      '127.0.0.1',
    )
    assertClosed(resentByOrder.staffId === staffId, 'resend by order did not keep staff binding')

    const orderDetail = await orders.getAdminOrderDetail(orderId) as {
      assignmentNotification?: { id: number } | null
      assignmentNotifications?: Array<{ id: number }>
    }
    assertClosed(Boolean(orderDetail.assignmentNotification?.id), 'order detail assignmentNotification is missing')
    assertClosed((orderDetail.assignmentNotifications || []).length >= 2, 'order detail notification history is incomplete')

    const avatarUrl = testImageUrl(config, runId, 'avatar-approved')
    const profileSubmit = await orders.updateStaffProfile(staffId, {
      staffName: `${runId} approved staff`,
      avatar: avatarUrl,
    })
    const approvedRequestId = profileSubmit.profileChangeRequest.id
    const staffBeforeApprove = await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })
    assertClosed(staffBeforeApprove.name === `${runId} staff`, 'staff profile changed before admin review')

    await profileChanges.reviewAdminRequest(
      approvedRequestId,
      1,
      { decision: 'approve', remark: `${runId} approve profile` },
      requestId(runId, 'approve-profile'),
      '127.0.0.1',
    )
    const staffAfterApprove = await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })
    assertClosed(staffAfterApprove.name === `${runId} approved staff`, 'approved profile change was not applied')
    assertClosed(staffAfterApprove.avatarUrl === avatarUrl, 'approved avatar change was not applied')

    const rejectedRequest = await profileChanges.submitStaffProfileChange(staffId, {
      staffName: `${runId} rejected staff`,
      applicationNote: `${runId} rejected certification note`,
      applicationImages: [testImageUrl(config, runId, 'cert-rejected')],
      submitNote: `${runId} submit rejected profile`,
    })
    await profileChanges.reviewAdminRequest(
      rejectedRequest.id,
      1,
      {
        decision: 'reject',
        rejectReason: `${runId} reject reason`,
        remark: `${runId} reject profile`,
      },
      requestId(runId, 'reject-profile'),
      '127.0.0.1',
    )
    const staffAfterReject = await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })
    assertClosed(staffAfterReject.name === `${runId} approved staff`, 'rejected profile change changed staff data')
    const latestRequest = await profileChanges.getStaffLatestRequest(staffId)
    assertClosed(latestRequest?.status === 'rejected', 'staff cannot see rejected request status')
    assertClosed(String(latestRequest?.rejectReason || '').includes(runId), 'staff cannot see reject reason')

    const adminRequests = await profileChanges.listAdminRequests({ staffId, page: 1, pageSize: 20 })
    assertClosed(adminRequests.items.length >= 2, 'admin cannot list profile change requests')

    const summary = {
      runId,
      orderId,
      orderNo: order.orderNo,
      staffId,
      notificationCount: (await notifications.listAdminStaffNotifications({ staffId, orderId, page: 1, pageSize: 50 })).total,
      profileRequestCount: adminRequests.total,
      latestRejectedVisible: latestRequest?.status === 'rejected',
    }
    console.log(JSON.stringify({ ok: true, summary }, null, 2))
  }
  finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
