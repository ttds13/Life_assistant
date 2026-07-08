import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import { AppModule } from '../src/app.module'
import { CouponsService } from '../src/coupons/coupons.service'
import { OrdersService } from '../src/orders/orders.service'
import { PaymentsService } from '../src/payments/payments.service'
import { PrismaService } from '../src/prisma/prisma.service'

function arg(name: string) {
  const prefix = `--${name}=`
  const matched = process.argv.find(item => item.startsWith(prefix))
  if (matched) return matched.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function assertRunId(runId?: string): asserts runId is string {
  if (!runId || !runId.startsWith('DAY38_TEST_')) {
    throw new Error('required: --run-id must start with DAY38_TEST_')
  }
}

function day(offset = 1) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return date.toISOString().slice(0, 10)
}

function appointmentRange(offset = 1) {
  const start = new Date()
  start.setDate(start.getDate() + offset)
  start.setHours(10, 0, 0, 0)
  const end = new Date(start)
  end.setHours(11, 0, 0, 0)
  return { start, end }
}

function phoneFromRunId(runId: string, suffix: string) {
  const digits = `${Date.now()}${runId}${suffix}`.replace(/\D/g, '').slice(-8).padStart(8, '0')
  return `199${digits}`
}

async function main() {
  const runId = arg('run-id')
  assertRunId(runId)

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false })
  const prisma = app.get(PrismaService)
  const coupons = app.get(CouponsService)
  const orders = app.get(OrdersService)
  const payments = app.get(PaymentsService)
  const config = app.get(ConfigService)

  try {
    let service = await prisma.service.findFirst({
      where: {
        status: 1,
        deletedAt: null,
        consultationRequired: false,
        cardType: 'none',
        basePrice: { gte: new Prisma.Decimal(60) },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    })
    if (!service) {
      const category = await prisma.serviceCategory.create({
        data: {
          name: `${runId} 测试分类`,
          icon: 'tool',
          description: `${runId} smoke category`,
          status: 1,
        },
      })
      service = await prisma.service.create({
        data: {
          code: `${runId.toLowerCase()}_service`,
          categoryId: category.id,
          name: `${runId} 测试现金服务`,
          description: `${runId} smoke service`,
          basePrice: new Prisma.Decimal(100),
          minPrice: new Prisma.Decimal(100),
          priceUnit: '次',
          durationMinutes: 60,
          cardType: 'none',
          consultationRequired: false,
          status: 1,
        },
      })
    }

    let staff = await prisma.staff.findFirst({
      where: { status: 1, deletedAt: null },
      orderBy: [{ id: 'asc' }],
    })
    if (!staff) {
      staff = await prisma.staff.create({
        data: {
          name: `${runId} 测试师傅`,
          phone: phoneFromRunId(runId, '09'),
          passwordHash: `${runId}:not-for-login`,
          skills: [service.name],
          status: 1,
          workStatus: 1,
        },
      })
    }

    const user = await prisma.user.create({
      data: {
        phone: phoneFromRunId(runId!, '01'),
        nickname: `${runId} 用户`,
        source: 'day38',
        adminRemark: `${runId} smoke user`,
      },
    })
    const address = await prisma.address.create({
      data: {
        ownerType: 'user',
        ownerId: user.id,
        addressType: 'service',
        contactName: `${runId} 用户`,
        contactPhone: user.phone || phoneFromRunId(runId!, '02'),
        city: '杭州',
        district: '西湖区',
        addressTitle: `${runId} 测试小区`,
        detailAddress: `${runId} 测试地址`,
        formattedAddress: `杭州市西湖区 ${runId} 测试地址`,
        isDefault: true,
        source: 'day38',
      },
    })

    const now = new Date()
    const endTime = new Date(now)
    endTime.setDate(endTime.getDate() + 7)
    const coupon = await prisma.coupon.create({
      data: {
        name: `${runId} 满50减10`,
        type: 'fixed',
        amount: new Prisma.Decimal(10),
        minAmount: new Prisma.Decimal(50),
        applicableServices: [Number(service.id)],
        totalCount: 100,
        issuedCount: 0,
        startTime: now,
        endTime,
        status: 1,
      },
    })
    const receivedCoupon = await coupons.receiveCoupon(Number(user.id), Number(coupon.id))

    const preview = await orders.getPricePreview(Number(user.id), {
      serviceId: Number(service.id),
      couponId: Number(coupon.id),
    })
    const order = await orders.createOrder(Number(user.id), {
      serviceId: Number(service.id),
      appointmentDate: day(1),
      appointmentTimeSlot: '10:00-11:00',
      addressId: Number(address.id),
      couponId: Number(coupon.id),
      remark: `${runId} DAY38-A coupon-cash-order`,
      source: 'miniapp',
    }, `${runId}:create-coupon-order`)
    const payResult = await payments.createMockPayment(Number(user.id), Number(order.id), `${runId}:mock-pay`)
    await orders.assignOrder(1, Number(order.id), {
      staffId: Number(staff.id),
      remark: `${runId} assign smoke`,
    }, `${runId}:assign`)
    await orders.staffAccept(Number(staff.id), Number(order.id), `${runId}:staff-accept`)
    await orders.staffOnTheWay(Number(staff.id), Number(order.id), {}, `${runId}:staff-way`)
    await orders.staffStartService(Number(staff.id), Number(order.id), {}, `${runId}:staff-start`)
    await orders.staffComplete(Number(staff.id), Number(order.id), {
      photoUrls: [testImageUrl(config, runId)],
      actualMinutes: 60,
      remark: `${runId} staff complete smoke`,
    }, `${runId}:staff-complete`)
    await orders.confirmOrder(Number(user.id), Number(order.id), {}, `${runId}:user-confirm`)
    const completedAccounting = await orders.getAdminOrderAccounting(Number(order.id))

    const range = appointmentRange(2)
    const external = await orders.createAdminOrder(1, {
      customer: {
        nickname: `${runId} 外来客户`,
        phone: phoneFromRunId(runId!, '03'),
        adminRemark: `${runId} external customer`,
      },
      serviceId: Number(service.id),
      address: {
        contactName: `${runId} 外来客户`,
        contactPhone: phoneFromRunId(runId!, '04'),
        cityName: '杭州',
        districtName: '西湖区',
        addressTitle: `${runId} 外来地址`,
        detailAddress: `${runId} 外来订单测试地址`,
        isDefault: true,
      },
      appointmentStartTime: range.start.toISOString(),
      appointmentEndTime: range.end.toISOString(),
      source: 'offline',
      remark: `${runId} DAY38-E external-offline-order`,
      adminRemark: `${runId} external offline smoke`,
      payableAmount: service.basePrice.toNumber(),
    }, `${runId}:admin-create`, '127.0.0.1')
    const offlinePaid = await orders.confirmOfflinePayment(1, Number(external.id), {
      amount: external.payableAmount,
      remark: `${runId} offline paid`,
    }, `${runId}:offline-pay`, '127.0.0.1')
    const offlineAccounting = await orders.getAdminOrderAccounting(Number(external.id))

    const adminUnread = await prisma.notification.count({
      where: { receiverType: 'admin', receiverId: BigInt(0), isRead: false, content: { contains: runId } },
    })
    const staffNotifications = await prisma.notification.count({
      where: { receiverType: 'staff', receiverId: staff.id, bizType: 'order', bizId: BigInt(order.id) },
    })

    const result = {
      runId,
      serviceId: Number(service.id),
      userId: Number(user.id),
      coupon: {
        couponId: Number(coupon.id),
        receivedUserCouponId: receivedCoupon.id,
        previewDiscount: preview.discountAmount,
      },
      order: {
        orderId: Number(order.id),
        paymentNo: payResult.paymentNo,
        accountingPassed: completedAccounting.passed,
        checks: completedAccounting.checks,
        incomeRecords: completedAccounting.incomeRecords.length,
        completed: true,
        assignedOrderId: Number(order.id),
        staffNotifications,
      },
      externalOrder: {
        orderId: Number(external.id),
        statusAfterOfflinePay: offlinePaid.status,
        accountingPassed: offlineAccounting.passed,
        checks: offlineAccounting.checks,
      },
      adminUnread,
    }

    console.log(JSON.stringify(result, null, 2))
  }
  finally {
    await app.close()
  }
}

function testImageUrl(config: ConfigService, runId: string) {
  const baseUrl = config.get<string>('OSS_PUBLIC_BASE_URL', 'https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com').replace(/\/+$/, '')
  const prefix = config.get<string>('OSS_UPLOAD_PREFIX', 'life-assitant/dev').replace(/^\/+|\/+$/g, '')
  return `${baseUrl}/${prefix}/${runId}/finish.jpg`
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
