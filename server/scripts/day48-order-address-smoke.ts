import { strict as assert } from 'node:assert'
import { NestFactory } from '@nestjs/core'
import { Prisma } from '@prisma/client'
import { AddressesService } from '../src/addresses/addresses.service'
import { AppModule } from '../src/app.module'
import { BusinessException } from '../src/common/errors/business-exception'
import { ORDER_STATUS } from '../src/orders/constants/order-status'
import { OrdersService } from '../src/orders/orders.service'
import { PrismaService } from '../src/prisma/prisma.service'

interface OrderAddressResult {
  id: number
  version: number
  sourceAddressId: number | null
  sourceAddressVersion: number | null
  formattedAddress: string
}

interface OrderResult {
  id: number
  version: number
  status: string
  orderAddress: OrderAddressResult
  orderAddressRevisions?: Array<{ version: number }>
}

function arg(name: string) {
  const prefix = `--${name}=`
  return process.argv.find(item => item.startsWith(prefix))?.slice(prefix.length)
}

function assertRunId(runId?: string): asserts runId is string {
  if (!runId || !/^DAY48_TEST_[A-Z0-9_]+$/.test(runId)) {
    throw new Error('required: --run-id must match DAY48_TEST_[A-Z0-9_]+')
  }
}

function appointmentRange() {
  const start = new Date()
  start.setDate(start.getDate() + 1)
  start.setHours(10, 0, 0, 0)
  const end = new Date(start)
  end.setHours(11, 0, 0, 0)
  return { start, end }
}

function toAdminDate(date: Date) {
  const datePart = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
  const timePart = [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join(':')
  return `${datePart} ${timePart}`
}

async function main() {
  const runId = arg('run-id')
  assertRunId(runId)
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false })
  const prisma = app.get(PrismaService)
  const addresses = app.get(AddressesService)
  const orders = app.get(OrdersService)

  try {
    const suffix = Date.now().toString().slice(-8)
    const user = await prisma.user.create({
      data: {
        phone: `139${suffix}`,
        nickname: `${runId} user`,
        source: 'test',
        status: 1,
      },
    })
    const staff = await prisma.staff.create({
      data: {
        name: `${runId} staff`,
        phone: `138${suffix}`,
        passwordHash: 'day48-test-password-hash',
        status: 1,
        workStatus: 1,
      },
    })
    const category = await prisma.serviceCategory.create({
      data: {
        name: `${runId} category`,
        description: 'Day48 order-address runtime smoke',
        status: 1,
        sortOrder: 9999,
      },
    })
    const service = await prisma.service.create({
      data: {
        code: `${runId.toLowerCase()}_service`.slice(0, 64),
        categoryId: category.id,
        name: `${runId} service`,
        basePrice: new Prisma.Decimal(100),
        minPrice: new Prisma.Decimal(100),
        priceUnit: '次',
        durationMinutes: 60,
        cardType: 'none',
        status: 1,
        sortOrder: 9999,
      },
    })

    const firstAddress = await addresses.createAddress({
      ownerType: 'user',
      ownerId: Number(user.id),
      addressType: 'service',
      dto: {
        contactName: '测试用户',
        contactPhone: `139${suffix}`,
        provinceName: '广东省',
        cityName: '深圳市',
        districtName: '南山区',
        addressTitle: 'Day48 地图点位 A',
        detailAddress: `${runId} 测试路 1 号`,
        latitude: 22.5400000,
        longitude: 113.9300000,
        coordinateType: 'gcj02',
        mapProvider: 'tencent',
        source: 'map',
        isDefault: true,
      },
    })
    const secondAddress = await addresses.createAddress({
      ownerType: 'user',
      ownerId: Number(user.id),
      addressType: 'service',
      dto: {
        contactName: '测试用户',
        contactPhone: `139${suffix}`,
        provinceName: '广东省',
        cityName: '深圳市',
        districtName: '福田区',
        detailAddress: `${runId} 手动地址 2 号`,
        latitude: null,
        longitude: null,
        source: 'manual',
      },
    })

    const appointment = appointmentRange()
    const created = await orders.createAdminOrder(1, {
      userId: Number(user.id),
      serviceId: Number(service.id),
      addressId: firstAddress.id,
      appointmentStartTime: toAdminDate(appointment.start),
      appointmentEndTime: toAdminDate(appointment.end),
      paymentMode: 'unpaid',
      originalAmount: 100,
      payableAmount: 100,
      adminRemark: `${runId} create order`,
    }, `${runId}:create`, '127.0.0.1') as unknown as OrderResult

    assert.equal(created.orderAddress.version, 1)
    assert.equal(created.orderAddress.sourceAddressId, firstAddress.id)
    assert.equal(created.orderAddress.sourceAddressVersion, firstAddress.version)

    const userUpdated = await orders.updateUserOrderAddress(Number(user.id), created.id, {
      sourceAddressId: secondAddress.id,
      expectedOrderVersion: created.version,
      expectedOrderAddressVersion: created.orderAddress.version,
      expectedSourceAddressVersion: secondAddress.version,
      reason: 'Day48 smoke user changed address',
    }, `${runId}:user-update`) as unknown as OrderResult
    assert.equal(userUpdated.orderAddress.version, 2)
    assert.equal(userUpdated.orderAddress.sourceAddressId, secondAddress.id)

    await prisma.order.update({
      where: { id: BigInt(created.id) },
      data: { staffId: staff.id, status: ORDER_STATUS.ACCEPTED },
    })
    const adminUpdated = await orders.updateAdminOrderAddress(1, created.id, {
      sourceAddressId: firstAddress.id,
      expectedOrderVersion: userUpdated.version,
      expectedOrderAddressVersion: userUpdated.orderAddress.version,
      expectedSourceAddressVersion: firstAddress.version,
      reason: 'Day48 smoke admin changed accepted order address',
    }, `${runId}:admin-update`, '127.0.0.1') as unknown as OrderResult
    assert.equal(adminUpdated.orderAddress.version, 3)
    assert.equal(adminUpdated.orderAddress.sourceAddressId, firstAddress.id)
    assert.equal(adminUpdated.orderAddressRevisions?.length, 3)

    const notification = await prisma.notification.findFirst({
      where: {
        receiverType: 'staff',
        receiverId: staff.id,
        type: 'order_address_updated',
        bizType: 'order',
        bizId: BigInt(created.id),
      },
      orderBy: { id: 'desc' },
    })
    assert.ok(notification, 'assigned staff should receive an order-address update notification')

    const staffDetail = await orders.getStaffOrderDetail(Number(staff.id), created.id) as unknown as OrderResult
    assert.equal(staffDetail.orderAddress.id, adminUpdated.orderAddress.id)
    assert.equal(staffDetail.orderAddress.version, adminUpdated.orderAddress.version)
    assert.equal(staffDetail.orderAddress.formattedAddress, adminUpdated.orderAddress.formattedAddress)

    const orderAddressBeforeBookEdit = adminUpdated.orderAddress.formattedAddress
    await addresses.updateAddress({
      ownerType: 'user',
      ownerId: Number(user.id),
      addressType: 'service',
      addressId: firstAddress.id,
      dto: {
        expectedVersion: firstAddress.version,
        contactName: '测试用户',
        contactPhone: `139${suffix}`,
        provinceName: '广东省',
        cityName: '深圳市',
        districtName: '南山区',
        detailAddress: `${runId} 地址簿后续修改 99 号`,
        latitude: null,
        longitude: null,
        source: 'manual',
        isDefault: true,
      },
    })
    const afterBookEdit = await orders.getAdminOrderDetail(created.id) as unknown as OrderResult
    assert.equal(afterBookEdit.orderAddress.formattedAddress, orderAddressBeforeBookEdit)
    assert.equal(afterBookEdit.orderAddress.sourceAddressVersion, firstAddress.version)

    let userStatusRejected = false
    try {
      await orders.updateUserOrderAddress(Number(user.id), created.id, {
        sourceAddressId: secondAddress.id,
        expectedOrderVersion: afterBookEdit.version,
        expectedOrderAddressVersion: afterBookEdit.orderAddress.version,
        expectedSourceAddressVersion: secondAddress.version,
        reason: 'Day48 smoke should be rejected after acceptance',
      }, `${runId}:rejected-user-update`)
    }
    catch (error) {
      userStatusRejected = error instanceof BusinessException && error.httpStatus === 409
    }
    assert.ok(userStatusRejected, 'user address change must be rejected after staff acceptance')

    const revisions = await orders.getAdminOrderAddressRevisions(created.id)
    assert.deepEqual(revisions.items.map(item => item.version), [3, 2, 1])

    console.log(JSON.stringify({
      status: 'passed',
      runId,
      orderId: created.id,
      orderAddressId: adminUpdated.orderAddress.id,
      orderAddressVersion: adminUpdated.orderAddress.version,
      revisionVersions: revisions.items.map(item => item.version),
      staffNotificationId: Number(notification.id),
      addressBookIsolation: 'passed',
      userStatusRestriction: 'passed',
    }, null, 2))
  }
  finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
