import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import { AppModule } from '../src/app.module'
import { AdminBusinessService } from '../src/admin-business/admin-business.service'
import { CouponsService } from '../src/coupons/coupons.service'
import { OrdersService } from '../src/orders/orders.service'
import { PaymentsService } from '../src/payments/payments.service'
import { PrismaService } from '../src/prisma/prisma.service'
import { RefundsService } from '../src/refunds/refunds.service'

type AdminContext = { adminId: number, requestId?: string, ip?: string }

function arg(name: string) {
  const prefix = `--${name}=`
  const matched = process.argv.find(item => item.startsWith(prefix))
  if (matched) return matched.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function assertRunId(runId?: string): asserts runId is string {
  if (!runId || !runId.startsWith('DAY39_TEST_')) {
    throw new Error('required: --run-id must start with DAY39_TEST_')
  }
}

function dateText(offset = 1) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function appointmentRange(offset = 1, hour = 10) {
  const start = new Date()
  start.setDate(start.getDate() + offset)
  start.setHours(hour, 0, 0, 0)
  const end = new Date(start)
  end.setHours(hour + 1, 0, 0, 0)
  return { start, end }
}

function phoneFromRunId(runId: string, suffix: string) {
  const digits = `${Date.now()}${runId}${suffix}`.replace(/\D/g, '').slice(-8).padStart(8, '0')
  return `199${digits}`
}

function requestId(runId: string, action: string) {
  return `${runId}:${action}`.slice(0, 64)
}

function adminContext(runId: string, action: string): AdminContext {
  return { adminId: 1, requestId: requestId(runId, action), ip: '127.0.0.1' }
}

function testImageUrl(config: ConfigService, runId: string) {
  const baseUrl = config.get<string>('OSS_PUBLIC_BASE_URL', 'https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com').replace(/\/+$/, '')
  const prefix = config.get<string>('OSS_UPLOAD_PREFIX', 'life-assitant/dev').replace(/^\/+|\/+$/g, '')
  return `${baseUrl}/${prefix}/${runId}/day39-finish.jpg`
}

function pageHasItemById(page: { items?: Array<{ id?: string | number }> }, id: number | bigint) {
  return Boolean(page.items?.some(item => String(item.id) === String(id)))
}

function pageHasOrder(page: { items?: Array<{ orderNo?: string }> }, orderNo: string) {
  return Boolean(page.items?.some(item => item.orderNo === orderNo))
}

function money(value: Prisma.Decimal | number | null | undefined) {
  if (value instanceof Prisma.Decimal) return value.toNumber()
  return Number(value || 0)
}

function assertClosed(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

async function createBaseData(prisma: PrismaService, runId: string) {
  const category = await prisma.serviceCategory.create({
    data: {
      name: `${runId} category`,
      icon: 'tool',
      description: `${runId} admin closed loop category`,
      status: 1,
      sortOrder: 9999,
    },
  })
  const service = await prisma.service.create({
    data: {
      code: `${runId.toLowerCase()}_service`.slice(0, 64),
      categoryId: category.id,
      name: `${runId} cash service`,
      description: `${runId} admin closed loop service`,
      basePrice: new Prisma.Decimal(120),
      minPrice: new Prisma.Decimal(120),
      priceUnit: 'time',
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
      phone: phoneFromRunId(runId, '90'),
      passwordHash: `${runId}:not-for-login`,
      skills: [service.name],
      status: 1,
      workStatus: 1,
      cityCode: '330100',
    },
  })
  return { category, service, staff }
}

async function createUserWithAddress(prisma: PrismaService, runId: string, suffix: string) {
  const phone = phoneFromRunId(runId, suffix)
  const user = await prisma.user.create({
    data: {
      phone,
      nickname: `${runId} user ${suffix}`,
      source: 'day39',
      adminRemark: `${runId} smoke user ${suffix}`,
      cityCode: '330100',
    },
  })
  const address = await prisma.address.create({
    data: {
      ownerType: 'user',
      ownerId: user.id,
      addressType: 'service',
      contactName: `${runId} user ${suffix}`,
      contactPhone: phone,
      country: 'China',
      province: 'Zhejiang',
      city: 'Hangzhou',
      district: 'Xihu',
      addressTitle: `${runId} address ${suffix}`,
      detailAddress: `${runId} detail address ${suffix}`,
      formattedAddress: `Hangzhou Xihu ${runId} detail address ${suffix}`,
      latitude: new Prisma.Decimal('30.2741000'),
      longitude: new Prisma.Decimal('120.1551000'),
      coordinateType: 'gcj02',
      mapProvider: 'day39',
      isDefault: true,
      source: 'day39',
      status: 1,
    },
  })
  return { user, address }
}

async function createAdminCoupon(
  admin: AdminBusinessService,
  runId: string,
  nameSuffix: string,
  serviceId: bigint,
  amount: number,
) {
  const now = new Date()
  const endTime = new Date(now)
  endTime.setDate(endTime.getDate() + 7)
  return admin.createCoupon({
    name: `${runId} ${nameSuffix}`,
    type: 'amount',
    amount,
    minAmount: 50,
    applicableServices: [Number(serviceId)],
    totalCount: 100,
    startTime: now.toISOString(),
    endTime: endTime.toISOString(),
    status: 'published',
  }, adminContext(runId, `coupon-${nameSuffix}`))
}

async function completeOrderFlow(
  orders: OrdersService,
  staffId: number,
  orderId: number,
  runId: string,
  finishPhotoUrl: string,
) {
  await orders.assignOrder(1, orderId, { staffId, remark: `${runId} assign completed flow` }, requestId(runId, 'assign-complete'), '127.0.0.1')
  await orders.staffAccept(staffId, orderId, requestId(runId, 'staff-accept-complete'))
  await orders.staffOnTheWay(staffId, orderId, {}, requestId(runId, 'staff-way-complete'))
  await orders.staffStartService(staffId, orderId, {}, requestId(runId, 'staff-start-complete'))
  await orders.staffComplete(staffId, orderId, {
    photoUrls: [finishPhotoUrl],
    actualMinutes: 60,
    remark: `${runId} staff complete`,
  }, requestId(runId, 'staff-complete'))
}

async function main() {
  const runId = arg('run-id')
  assertRunId(runId)

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false })
  const prisma = app.get(PrismaService)
  const admin = app.get(AdminBusinessService)
  const coupons = app.get(CouponsService)
  const orders = app.get(OrdersService)
  const payments = app.get(PaymentsService)
  const refunds = app.get(RefundsService)
  const config = app.get(ConfigService)

  try {
    const { service, staff } = await createBaseData(prisma, runId)
    const finishPhotoUrl = testImageUrl(config, runId)

    const couponForComplete = await createAdminCoupon(admin, runId, 'complete coupon', service.id, 15)
    const couponForRefund = await createAdminCoupon(admin, runId, 'refund coupon', service.id, 20)
    const couponForGrant = await createAdminCoupon(admin, runId, 'admin grant coupon', service.id, 10)

    const completeUser = await createUserWithAddress(prisma, runId, '01')
    await coupons.receiveCoupon(Number(completeUser.user.id), Number(couponForComplete.id))
    const completePreview = await orders.getPricePreview(Number(completeUser.user.id), {
      serviceId: Number(service.id),
      couponId: Number(couponForComplete.id),
    })
    const completeOrder = await orders.createOrder(Number(completeUser.user.id), {
      serviceId: Number(service.id),
      appointmentDate: dateText(1),
      appointmentTimeSlot: '10:00-11:00',
      addressId: Number(completeUser.address.id),
      couponId: Number(couponForComplete.id),
      remark: `${runId} coupon completed order`,
      source: 'miniapp',
    }, requestId(runId, 'create-complete-order'))
    await payments.createMockPayment(Number(completeUser.user.id), Number(completeOrder.id), requestId(runId, 'pay-complete-order'))
    await completeOrderFlow(orders, Number(staff.id), Number(completeOrder.id), runId, finishPhotoUrl)
    await orders.confirmOrder(Number(completeUser.user.id), Number(completeOrder.id), {}, requestId(runId, 'user-confirm-complete'))
    const completeAccounting = await orders.getAdminOrderAccounting(Number(completeOrder.id))

    const range = appointmentRange(3, 11)
    const externalOrder = await orders.createAdminOrder(1, {
      customer: {
        nickname: `${runId} external customer`,
        phone: phoneFromRunId(runId, '03'),
        cityCode: '330100',
        adminRemark: `${runId} external customer`,
      },
      serviceId: Number(service.id),
      address: {
        contactName: `${runId} external customer`,
        contactPhone: phoneFromRunId(runId, '04'),
        provinceName: 'Zhejiang',
        cityName: 'Hangzhou',
        districtName: 'Xihu',
        addressTitle: `${runId} external address`,
        detailAddress: `${runId} external detail address`,
        latitude: 30.2741,
        longitude: 120.1551,
        coordinateType: 'gcj02',
        mapProvider: 'day39',
        isDefault: true,
      },
      appointmentStartTime: range.start.toISOString(),
      appointmentEndTime: range.end.toISOString(),
      source: 'offline',
      remark: `${runId} external offline order`,
      adminRemark: `${runId} external offline order`,
      payableAmount: service.basePrice.toNumber(),
    }, requestId(runId, 'admin-create-external'), '127.0.0.1')
    await orders.confirmOfflinePayment(1, Number(externalOrder.id), {
      amount: Number(externalOrder.payableAmount),
      remark: `${runId} offline paid`,
    }, requestId(runId, 'admin-offline-payment'), '127.0.0.1')
    const externalAccounting = await orders.getAdminOrderAccounting(Number(externalOrder.id))
    const externalOrderRow = await prisma.order.findUniqueOrThrow({
      where: { id: BigInt(externalOrder.id) },
      select: { userId: true },
    })
    const grantedCoupon = await admin.grantCoupon(Number(couponForGrant.id), {
      userId: Number(externalOrderRow.userId),
      remark: `${runId} admin grant coupon`,
    }, adminContext(runId, 'admin-grant-coupon'))

    const refundUser = await createUserWithAddress(prisma, runId, '05')
    await coupons.receiveCoupon(Number(refundUser.user.id), Number(couponForRefund.id))
    const refundPreview = await orders.getPricePreview(Number(refundUser.user.id), {
      serviceId: Number(service.id),
      couponId: Number(couponForRefund.id),
    })
    const refundOrder = await orders.createOrder(Number(refundUser.user.id), {
      serviceId: Number(service.id),
      appointmentDate: dateText(2),
      appointmentTimeSlot: '14:00-15:00',
      addressId: Number(refundUser.address.id),
      couponId: Number(couponForRefund.id),
      remark: `${runId} coupon refund order`,
      source: 'miniapp',
    }, requestId(runId, 'create-refund-order'))
    await payments.createMockPayment(Number(refundUser.user.id), Number(refundOrder.id), requestId(runId, 'pay-refund-order'))
    const refundRequest = await refunds.createUserRefundRequest(Number(refundUser.user.id), Number(refundOrder.id), {
      reason: `${runId} user refund request`,
      source: 'day39',
    }, requestId(runId, 'user-refund-request'))
    const refundAuditBeforeReview = await admin.listAuditItems('refund', {
      keyword: runId,
      page: 1,
      pageSize: 20,
    }, ['refund'])
    const reviewedRefund = await admin.reviewRefund(Number(refundRequest.id), {
      action: 'approve',
      remark: `${runId} approve refund`,
    }, adminContext(runId, 'admin-approve-refund'))
    const refundAccounting = await orders.getAdminOrderAccounting(Number(refundOrder.id))

    const adminPointAdjustment = await admin.adjustUserPoints(Number(completeUser.user.id), {
      points: 88,
      remark: `${runId} admin point adjust`,
    }, adminContext(runId, 'admin-point-adjust'))
    const completeUserPoints = await admin.getAdminUserPoints(Number(completeUser.user.id))
    const completeUserPointLedgers = await admin.listPointLedgers({
      userId: String(completeUser.user.id),
      page: 1,
      pageSize: 20,
    })
    const refundUserPointLedgers = await admin.listPointLedgers({
      userId: String(refundUser.user.id),
      page: 1,
      pageSize: 20,
    })
    const adjustedPointLedgers = await admin.listPointLedgers({
      keyword: runId,
      page: 1,
      pageSize: 20,
    })
    const userCouponDetails = await admin.listUserCouponsAdmin({
      keyword: runId,
      page: 1,
      pageSize: 20,
    })
    const grantedCouponDetails = await admin.listUserCouponsAdmin({
      couponId: String(couponForGrant.id),
      userId: String(externalOrderRow.userId),
      page: 1,
      pageSize: 20,
    })
    const financeSummary = await admin.getFinanceSummary({
      startDate: dateText(0),
      endDate: dateText(0),
      page: 1,
      pageSize: 20,
    })
    const offlineFinanceSummary = await admin.getFinanceSummary({
      startDate: dateText(0),
      endDate: dateText(0),
      source: 'offline',
      channel: 'offline',
      page: 1,
      pageSize: 20,
    })

    const adminCoupons = await admin.listCoupons({ keyword: runId, page: 1, pageSize: 20 })
    const completePayments = await admin.listPayments({ keyword: String(completeOrder.orderNo), page: 1, pageSize: 10 })
    const externalPayments = await admin.listPayments({ keyword: String(externalOrder.orderNo), page: 1, pageSize: 10 })
    const refundPayments = await admin.listPayments({ keyword: String(refundOrder.orderNo), page: 1, pageSize: 10 })
    const refundedList = await refunds.listAdminRefunds({ keyword: String(refundOrder.orderNo), page: 1, pageSize: 10 })
    const externalOrdersBySource = await orders.listAdminOrders({
      keyword: runId,
      source: 'offline',
      page: 1,
      pageSize: 10,
    })
    const dashboard = await admin.getDashboard()

    const orderIds = [completeOrder.id, externalOrder.id, refundOrder.id].map(id => BigInt(id))
    const [
      runOrders,
      paymentRows,
      refundRows,
      pointLedgers,
      incomeRows,
      userCoupons,
      notifications,
    ] = await Promise.all([
      prisma.order.findMany({ where: { id: { in: orderIds } } }),
      prisma.payment.findMany({ where: { orderId: { in: orderIds } } }),
      prisma.refund.findMany({ where: { orderId: { in: orderIds } } }),
      prisma.pointLedger.findMany({ where: { orderId: { in: orderIds } } }),
      prisma.staffIncomeRecord.findMany({ where: { orderId: { in: orderIds } } }),
      prisma.userCoupon.findMany({ where: { couponId: { in: [couponForComplete.id, couponForRefund.id] } } }),
      prisma.notification.findMany({
        where: {
          OR: [
            { bizType: 'order', bizId: { in: orderIds } },
            { title: { contains: runId } },
            { content: { contains: runId } },
          ],
        },
      }),
    ])

    const paymentByChannel = paymentRows.reduce<Record<string, number>>((acc, item) => {
      acc[item.channel] = (acc[item.channel] || 0) + money(item.amount)
      return acc
    }, {})
    const ordersBySource = runOrders.reduce<Record<string, number>>((acc, item) => {
      acc[item.source] = (acc[item.source] || 0) + 1
      return acc
    }, {})

    const result = {
      runId,
      created: {
        serviceId: Number(service.id),
        staffId: Number(staff.id),
        couponIds: [Number(couponForComplete.id), Number(couponForRefund.id), Number(couponForGrant.id)],
        orderIds: orderIds.map(Number),
      },
      couponCompletedOrder: {
        orderId: Number(completeOrder.id),
        orderNo: completeOrder.orderNo,
        previewDiscount: completePreview.discountAmount,
        accountingPassed: completeAccounting.passed,
        checks: completeAccounting.checks,
        incomeRecords: completeAccounting.incomeRecords.length,
      },
      externalOfflineOrder: {
        orderId: Number(externalOrder.id),
        orderNo: externalOrder.orderNo,
        source: externalOrder.source,
        accountingPassed: externalAccounting.passed,
        checks: externalAccounting.checks,
      },
      adminGrantedCoupon: {
        couponId: Number(couponForGrant.id),
        userCouponId: grantedCoupon.id,
        userId: Number(externalOrderRow.userId),
        visibleInAdmin: grantedCouponDetails.total > 0,
      },
      refundedOrder: {
        orderId: Number(refundOrder.id),
        orderNo: refundOrder.orderNo,
        previewDiscount: refundPreview.discountAmount,
        refundId: refundRequest.id,
        refundStatusAfterAdminReview: reviewedRefund.status,
        accountingPassedAfterRefund: refundAccounting.passed,
        checksAfterRefund: refundAccounting.checks,
      },
      adminEvidence: {
        dashboardMetricKeys: dashboard.metrics.map((item: { key: string }) => item.key),
        dashboardHasFinanceSummaryOnly: dashboard.metrics.some((item: { key: string }) => item.key === 'amount'),
        couponsVisibleInAdmin: [couponForComplete.id, couponForRefund.id].every(id => pageHasItemById(adminCoupons, id)),
        couponAdminRows: adminCoupons.items.map(item => ({
          id: item.id,
          name: item.name,
          issuedCount: item.issuedCount,
          receivedCount: item.receivedCount,
          status: item.status,
        })),
        completePaymentVisibleInAdmin: pageHasOrder(completePayments, String(completeOrder.orderNo)),
        externalPaymentVisibleInAdmin: pageHasOrder(externalPayments, String(externalOrder.orderNo)),
        refundPaymentVisibleInAdmin: pageHasOrder(refundPayments, String(refundOrder.orderNo)),
        refundAuditVisibleBeforeReview: refundAuditBeforeReview.total > 0,
        refundedRecordVisibleInAdminRefundList: refundedList.total > 0,
        externalOrderVisibleBySourceFilter: externalOrdersBySource.total > 0,
        financeSummary: {
          orderCount: financeSummary.summary.orderCount,
          paidAmount: financeSummary.summary.paidAmount,
          refundAmount: financeSummary.summary.refundAmount,
          netRevenue: financeSummary.summary.netRevenue,
          couponDiscount: financeSummary.summary.couponDiscount,
          pointsEarned: financeSummary.summary.pointsEarned,
          pointsDeducted: financeSummary.summary.pointsDeducted,
          pointsNet: financeSummary.summary.pointsNet,
          hasSourceBreakdown: financeSummary.breakdowns.ordersBySource.length > 0,
          hasChannelBreakdown: financeSummary.breakdowns.paymentsByChannel.length > 0,
        },
        offlineFinanceSummary: {
          orderCount: offlineFinanceSummary.summary.orderCount,
          paidAmount: offlineFinanceSummary.summary.paidAmount,
          netRevenue: offlineFinanceSummary.summary.netRevenue,
          hasOfflineSource: offlineFinanceSummary.breakdowns.ordersBySource.some(item => item.source === 'offline'),
          hasOfflineChannel: offlineFinanceSummary.breakdowns.paymentsByChannel.some(item => item.channel === 'offline'),
        },
        pointManagement: {
          adminPointAdjustmentId: adminPointAdjustment.id,
          completeUserTotalPoints: completeUserPoints.totalPoints,
          completeUserPointLedgerTotal: completeUserPointLedgers.total,
          refundUserPointLedgerTotal: refundUserPointLedgers.total,
          adjustedLedgerVisible: adjustedPointLedgers.total > 0,
          refundUserHasDeduct: refundUserPointLedgers.items.some(item => item.type === 'refund_deduct'),
        },
        userCouponManagement: {
          userCouponDetailTotal: userCouponDetails.total,
          grantVisible: grantedCouponDetails.total > 0,
          refundCouponReleasedVisible: userCouponDetails.items.some(item =>
            String(item.couponId) === String(couponForRefund.id)
            && item.status === 'available'
            && !item.usedOrderId
          ),
        },
      },
      dbEvidence: {
        paymentByChannel,
        ordersBySource,
        grossAmount: runOrders.reduce((sum, item) => sum + money(item.originalAmount), 0),
        discountAmount: runOrders.reduce((sum, item) => sum + money(item.discountAmount), 0),
        paidAmount: runOrders.reduce((sum, item) => sum + money(item.paidAmount), 0),
        refundedAmount: refundRows.reduce((sum, item) => sum + money(item.amount), 0),
        pointLedgerCount: pointLedgers.length,
        pointNet: pointLedgers.reduce((sum, item) => sum + item.points, 0),
        incomeRecordCount: incomeRows.length,
        incomeStatus: incomeRows.map(item => item.status),
        userCouponStatus: userCoupons.map(item => ({
          couponId: Number(item.couponId),
          status: item.status,
          usedOrderId: item.usedOrderId ? Number(item.usedOrderId) : null,
        })),
        adminNotificationCount: notifications.filter(item => item.receiverType === 'admin').length,
        staffNotificationCount: notifications.filter(item => item.receiverType === 'staff').length,
      },
      closedLoopJudgement: {
        completeFinanceStatistics: financeSummary.summary.paidAmount > 0
          && financeSummary.summary.refundAmount > 0
          && financeSummary.breakdowns.ordersBySource.length > 0
          && financeSummary.breakdowns.paymentsByChannel.length > 0
          ? 'closed'
          : 'partial',
        externalOrderLoadingAndSourceTrace: externalOrdersBySource.total > 0 && externalAccounting.passed ? 'basic_closed' : 'partial',
        couponManagement: pageHasItemById(adminCoupons, couponForComplete.id)
          && pageHasItemById(adminCoupons, couponForRefund.id)
          && pageHasItemById(adminCoupons, couponForGrant.id)
          && userCouponDetails.total >= 3
          && grantedCouponDetails.total > 0
          ? 'closed'
          : 'partial',
        pointsManagement: completeUserPointLedgers.total > 0
          && refundUserPointLedgers.items.some(item => item.type === 'refund_deduct')
          && adjustedPointLedgers.total > 0
          ? 'closed'
          : 'partial',
        refundManagement: reviewedRefund.status === 'refunded' && refundedList.total > 0 && refundAccounting.passed ? 'closed' : 'partial',
      },
    }

    assertClosed(completeAccounting.passed, 'completed coupon order accounting should pass')
    assertClosed(externalAccounting.passed, 'external offline order accounting should pass')
    assertClosed(refundAccounting.passed, 'refunded order accounting should pass')
    assertClosed(result.closedLoopJudgement.completeFinanceStatistics === 'closed', 'finance summary should be closed')
    assertClosed(result.closedLoopJudgement.couponManagement === 'closed', 'coupon admin management should be closed')
    assertClosed(result.closedLoopJudgement.pointsManagement === 'closed', 'points admin management should be closed')
    assertClosed(result.closedLoopJudgement.refundManagement === 'closed', 'refund management should be closed')

    console.log(JSON.stringify(result, null, 2))
  }
  finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
