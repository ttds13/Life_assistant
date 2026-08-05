import { Prisma, PrismaClient } from '@prisma/client'
import { sign } from 'jsonwebtoken'
import { getAdminPermissions } from '../src/admin-auth/admin-permissions'

const prisma = new PrismaClient()
const baseUrl = process.env.DAY56_SMOKE_BASE_URL || 'http://127.0.0.1:3100/api'
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-key-change-in-production'
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`

interface ApiResponse<T> {
  code: number
  message?: string
  data: T
}

interface OrderResult {
  id: string | number
  orderNo: string
  status: string
  version: number
  appointmentStartTime?: string
  serviceBooking?: { appointmentStartAt?: string }
}

interface UserCardResult {
  id: string | number
  version: number
  status: string
  availabilityState: string
  remainingMinutes: number
  activationDeadlineAt?: string | null
  allowedActions?: { revoke?: boolean, deleteDraft?: boolean }
}

let adminId: bigint | null = null
let financeAdminId: bigint | null = null
let userId: bigint | null = null
let addressId: bigint | null = null
const orderIds = new Set<bigint>()
const userCardIds = new Set<bigint>()

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function request<T>(path: string, token: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })
  const body = await response.json() as ApiResponse<T>
  return { status: response.status, body }
}

function unwrap<T>(result: { status: number, body: ApiResponse<T> }, label: string) {
  if (result.status !== 200 || result.body.code !== 0) {
    throw new Error(`${label}: ${result.status} ${result.body.message || 'unknown error'}`)
  }
  return result.body.data
}

function expectStatus(result: { status: number, body: ApiResponse<unknown> }, status: number, label: string) {
  if (result.status !== status) {
    throw new Error(`${label}: expected HTTP ${status}, got ${result.status} (${result.body.message || 'unknown error'})`)
  }
}

function appointment(dayOffset: number, startHour: number) {
  const start = new Date()
  start.setDate(start.getDate() + dayOffset)
  start.setHours(startHour, 0, 0, 0)
  const end = new Date(start)
  end.setHours(startHour + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

async function createDraftOrder(
  token: string,
  serviceId: bigint,
  dayOffset: number,
  startHour = 9,
) {
  const time = appointment(dayOffset, startHour)
  const order = unwrap(await request<OrderResult>('/admin/orders', token, {
    method: 'POST',
    body: JSON.stringify({
      userId: Number(userId),
      serviceId: Number(serviceId),
      addressId: Number(addressId),
      appointmentStartTime: time.start,
      appointmentEndTime: time.end,
      paymentMode: 'unpaid',
      source: 'admin',
      adminRemark: `Day56 smoke ${suffix}`,
    }),
  }), 'create draft order')
  orderIds.add(BigInt(order.id))
  assert(order.status === 'pending_payment', `expected pending_payment, got ${order.status}`)
  return order
}

async function grantCard(token: string, cardId: bigint, source = 'admin') {
  const card = unwrap(await request<UserCardResult>('/admin/member-cards/grant', token, {
    method: 'POST',
    body: JSON.stringify({
      userId: Number(userId),
      cardId: Number(cardId),
      source,
      offlinePaymentAmount: source === 'offline' ? 100 : undefined,
      paymentChannel: source === 'offline' ? 'offline' : 'admin',
      remark: `Day56 smoke ${suffix}`,
    }),
  }), `grant ${source} card`)
  userCardIds.add(BigInt(card.id))
  return card
}

async function main() {
  const operatorPermissions = getAdminPermissions('operator')
  const financePermissions = getAdminPermissions('finance')
  for (const permission of [
    'user-order:create',
    'user-order:update',
    'user-order:cancel',
    'user-booking:create',
    'user-booking:reschedule',
    'user-booking:address:update',
    'user-booking:assign',
    'user-member-card:suspend',
  ]) {
    assert(operatorPermissions.includes(permission), `operator permission missing: ${permission}`)
  }
  for (const permission of [
    'user-order:delete-draft',
    'user-booking:delete-draft',
    'user-member-card:grant',
    'user-member-card:adjust',
    'user-member-card:revoke',
    'user-member-card:delete-draft',
    'point-rule:publish',
  ]) {
    assert(!operatorPermissions.includes(permission), `operator must not have high-risk permission: ${permission}`)
  }
  assert(financePermissions.includes('user-commerce:list'), 'finance user commerce read permission missing')
  assert(!financePermissions.includes('user-booking:create'), 'finance unexpectedly has booking create permission')

  const [admin, financeAdmin, user, service, cardProduct] = await Promise.all([
    prisma.adminUser.create({
      data: {
        username: `day56_admin_${suffix}`,
        passwordHash: 'day56-smoke',
        name: 'Day56 Admin Smoke',
        role: 'super_admin',
        status: 1,
      },
    }),
    prisma.adminUser.create({
      data: {
        username: `day56_finance_${suffix}`,
        passwordHash: 'day56-smoke',
        name: 'Day56 Finance Smoke',
        role: 'finance',
        status: 1,
      },
    }),
    prisma.user.create({
      data: {
        openid: `day56_user_${suffix}`,
        phone: `134${String(suffix).slice(-8).padStart(8, '0')}`,
        nickname: 'Day56 Smoke User',
        source: 'admin',
        status: 1,
      },
    }),
    prisma.service.findFirst({ where: { status: 1, deletedAt: null }, orderBy: { id: 'asc' } }),
    prisma.memberCard.findFirst({
      where: {
        status: 1,
        deletedAt: null,
        publishedVersionId: { not: null },
        cardType: { not: 'consultation' },
      },
      orderBy: { id: 'asc' },
    }),
  ])
  if (!service) throw new Error('Day56 smoke requires one active service')
  if (!cardProduct) throw new Error('Day56 smoke requires one published non-consultation member card')
  adminId = admin.id
  financeAdminId = financeAdmin.id
  userId = user.id

  const address = await prisma.address.create({
    data: {
      ownerType: 'user',
      ownerId: user.id,
      addressType: 'service',
      contactName: 'Day56 Smoke User',
      contactPhone: user.phone || '13400000000',
      country: 'China',
      province: 'Guangdong',
      city: 'Shenzhen',
      district: 'Nanshan',
      street: 'Smoke Road',
      addressTitle: 'Day56 Smoke Address',
      detailAddress: 'Building 56 Room 101',
      formattedAddress: 'Day56 Smoke Address Building 56 Room 101',
      source: 'manual',
      status: 1,
      isDefault: false,
    },
  })
  addressId = address.id

  const adminToken = sign({
    userId: Number(admin.id),
    adminId: Number(admin.id),
    username: admin.username,
    role: admin.role,
    userType: 'admin',
  }, jwtSecret)
  const financeToken = sign({
    userId: Number(financeAdmin.id),
    adminId: Number(financeAdmin.id),
    username: financeAdmin.username,
    role: financeAdmin.role,
    userType: 'admin',
  }, jwtSecret)

  const deniedTime = appointment(3, 9)
  expectStatus(await request('/admin/orders', financeToken, {
    method: 'POST',
    body: JSON.stringify({
      userId: Number(user.id),
      serviceId: Number(service.id),
      addressId: Number(address.id),
      appointmentStartTime: deniedTime.start,
      appointmentEndTime: deniedTime.end,
      paymentMode: 'unpaid',
    }),
  }), 403, 'finance create booking permission')
  unwrap(await request('/admin/user-orders?page=1&pageSize=1', financeToken), 'finance read user orders')

  const cancellable = await createDraftOrder(adminToken, service.id, 3)
  const rescheduledTime = appointment(3, 10)
  expectStatus(await request(`/admin/user-service-bookings/${cancellable.id}/reschedule`, adminToken, {
    method: 'POST',
    body: JSON.stringify({
      appointmentStartTime: rescheduledTime.start,
      appointmentEndTime: rescheduledTime.end,
      reason: 'Day56 missing version check',
    }),
  }), 400, 'reschedule without expected version')
  const rescheduled = unwrap(await request<OrderResult>(`/admin/user-service-bookings/${cancellable.id}/reschedule`, adminToken, {
    method: 'POST',
    body: JSON.stringify({
      expectedVersion: cancellable.version,
      appointmentStartTime: rescheduledTime.start,
      appointmentEndTime: rescheduledTime.end,
      reason: 'Day56 smoke reschedule',
    }),
  }), 'reschedule draft order')
  assert(rescheduled.version === cancellable.version + 1, 'order version was not incremented')
  assert(rescheduled.appointmentStartTime === rescheduledTime.start, 'order appointment was not updated')
  const bookingAfterReschedule = await prisma.serviceBookingOrder.findUniqueOrThrow({ where: { orderId: BigInt(cancellable.id) } })
  assert(
    bookingAfterReschedule.appointmentStartAt.getTime() === new Date(rescheduledTime.start).getTime(),
    'service booking appointment was not synchronized',
  )

  expectStatus(await request(`/admin/orders/${cancellable.id}`, adminToken, {
    method: 'PUT',
    body: JSON.stringify({
      expectedVersion: cancellable.version,
      adminRemark: 'stale Day56 update',
    }),
  }), 403, 'generic order update must reject service booking')

  const cancelled = unwrap(await request<OrderResult>(`/admin/user-service-bookings/${cancellable.id}/cancel`, adminToken, {
    method: 'POST',
    body: JSON.stringify({ version: rescheduled.version, reason: 'Day56 smoke cancellation' }),
  }), 'cancel unpaid booking')
  assert(cancelled.status === 'cancelled', `expected cancelled order, got ${cancelled.status}`)

  const deletable = await createDraftOrder(adminToken, service.id, 4)
  expectStatus(await request(`/admin/user-service-bookings/${deletable.id}/draft`, adminToken, {
    method: 'DELETE',
    body: JSON.stringify({ version: deletable.version + 1, reason: 'Day56 stale delete check' }),
  }), 409, 'stale draft delete')
  assert(await prisma.order.findUnique({ where: { id: BigInt(deletable.id) } }), 'stale delete removed the order')
  const deleted = unwrap(await request<{ id: string, deleted: boolean }>(`/admin/user-service-bookings/${deletable.id}/draft`, adminToken, {
    method: 'DELETE',
    body: JSON.stringify({ version: deletable.version, reason: 'Day56 smoke draft cleanup' }),
  }), 'delete safe draft')
  assert(deleted.deleted, 'safe draft was not deleted')
  orderIds.delete(BigInt(deletable.id))
  assert(!await prisma.order.findUnique({ where: { id: BigInt(deletable.id) } }), 'deleted draft still exists')

  const protectedTime = appointment(5, 9)
  const protectedOrder = await prisma.order.create({
    data: {
      orderNo: `DAY56FACT${suffix}`.slice(0, 32),
      userId: user.id,
      serviceId: service.id,
      orderType: 'service_booking',
      status: 'pending_payment',
      serviceSnapshot: { id: Number(service.id), name: service.name },
      appointmentStartTime: new Date(protectedTime.start),
      appointmentEndTime: new Date(protectedTime.end),
      originalAmount: new Prisma.Decimal(100),
      discountAmount: new Prisma.Decimal(0),
      payableAmount: new Prisma.Decimal(100),
      paidAmount: new Prisma.Decimal(0),
      source: 'smoke',
    },
  })
  orderIds.add(protectedOrder.id)
  const protectedPayment = await prisma.payment.create({
    data: {
      paymentNo: `DAY56PAY${suffix}`.slice(0, 64),
      orderId: protectedOrder.id,
      userId: user.id,
      channel: 'offline',
      amount: new Prisma.Decimal(100),
      status: 'pending',
    },
  })
  expectStatus(await request(`/admin/orders/${protectedOrder.id}`, adminToken, {
    method: 'DELETE',
    body: JSON.stringify({ version: protectedOrder.version, reason: 'Day56 protected delete check' }),
  }), 409, 'delete order with payment fact')
  assert(await prisma.order.findUnique({ where: { id: protectedOrder.id } }), 'protected order was deleted')
  assert(await prisma.payment.findUnique({ where: { id: protectedPayment.id } }), 'protected payment fact was deleted')

  const actionCard = await grantCard(adminToken, cardProduct.id)
  const initialDeadline = actionCard.activationDeadlineAt
  const extendPayload = {
    days: 30,
    reason: 'Day56 smoke extension',
    expectedVersion: actionCard.version,
    idempotencyKey: `day56-extend-${suffix}`,
  }
  const extended = unwrap(await request<UserCardResult>(`/admin/user-member-cards/${actionCard.id}/extend`, adminToken, {
    method: 'POST',
    body: JSON.stringify(extendPayload),
  }), 'extend user card')
  assert(extended.activationDeadlineAt !== initialDeadline, 'member card deadline was not extended')
  const extendedReplay = unwrap(await request<UserCardResult>(`/admin/user-member-cards/${actionCard.id}/extend`, adminToken, {
    method: 'POST',
    body: JSON.stringify(extendPayload),
  }), 'repeat extend user card')
  assert(extendedReplay.version === extended.version, 'idempotent extend changed the member card twice')
  expectStatus(await request(`/admin/user-member-cards/${actionCard.id}/extend`, adminToken, {
    method: 'POST',
    body: JSON.stringify({ ...extendPayload, days: 31 }),
  }), 409, 'idempotency key with different request body')

  const adjusted = unwrap(await request<UserCardResult>(`/admin/user-member-cards/${actionCard.id}/adjust-time`, adminToken, {
    method: 'POST',
    body: JSON.stringify({ mode: 'delta', deltaMinutes: 10, reason: 'Day56 smoke adjustment', expectedVersion: extended.version, idempotencyKey: `day56-adjust-${suffix}` }),
  }), 'adjust user card')
  assert(adjusted.remainingMinutes === actionCard.remainingMinutes + 10, 'member card balance was not adjusted')
  assert(adjusted.allowedActions?.revoke === false, 'adjusted card incorrectly advertises revoke capability')
  assert(adjusted.allowedActions?.deleteDraft === false, 'adjusted card incorrectly advertises draft delete capability')

  const suspended = unwrap(await request<UserCardResult>(`/admin/user-member-cards/${actionCard.id}/suspend`, adminToken, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Day56 smoke suspend', expectedVersion: adjusted.version, idempotencyKey: `day56-suspend-${suffix}` }),
  }), 'suspend user card')
  assert(suspended.availabilityState === 'suspended', 'member card was not suspended')
  const resumed = unwrap(await request<UserCardResult>(`/admin/user-member-cards/${actionCard.id}/resume`, adminToken, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Day56 smoke resume', expectedVersion: suspended.version, idempotencyKey: `day56-resume-${suffix}` }),
  }), 'resume user card')
  assert(resumed.availabilityState === 'available', 'member card was not resumed')
  expectStatus(await request(`/admin/user-member-cards/${actionCard.id}/draft`, adminToken, {
    method: 'DELETE',
    body: JSON.stringify({ reason: 'Day56 adjusted card delete check', expectedVersion: resumed.version, idempotencyKey: `day56-delete-adjusted-${suffix}` }),
  }), 409, 'delete adjusted member card')

  const revocableCard = await grantCard(adminToken, cardProduct.id)
  const revoked = unwrap(await request<UserCardResult>(`/admin/user-member-cards/${revocableCard.id}/revoke`, adminToken, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Day56 smoke revoke', expectedVersion: revocableCard.version, idempotencyKey: `day56-revoke-${suffix}` }),
  }), 'revoke free card')
  assert(revoked.status === 'completed', 'revoked member card was not completed')

  const deletableCard = await grantCard(adminToken, cardProduct.id)
  const deletedCard = unwrap(await request<{ id: string, deleted: boolean }>(`/admin/user-member-cards/${deletableCard.id}/draft`, adminToken, {
    method: 'DELETE',
    body: JSON.stringify({ reason: 'Day56 smoke card cleanup', expectedVersion: deletableCard.version, idempotencyKey: `day56-delete-${suffix}` }),
  }), 'delete card draft')
  assert(deletedCard.deleted, 'member card draft was not deleted')
  userCardIds.delete(BigInt(deletableCard.id))

  const paidCard = await grantCard(adminToken, cardProduct.id, 'offline')
  expectStatus(await request(`/admin/user-member-cards/${paidCard.id}/revoke`, adminToken, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Day56 paid card revoke check', expectedVersion: paidCard.version, idempotencyKey: `day56-revoke-paid-${suffix}` }),
  }), 409, 'revoke paid card')
  assert(await prisma.userMemberCard.findUnique({ where: { id: BigInt(paidCard.id) } }), 'paid member card was removed')

  const assetRecordTypes = await prisma.memberCardRecord.findMany({
    where: { userMemberCardId: BigInt(actionCard.id) },
    select: { recordType: true },
  })
  const recordTypes = new Set(assetRecordTypes.map(item => item.recordType))
  for (const recordType of ['issued', 'extended', 'admin_adjust', 'suspended', 'resumed']) {
    assert(recordTypes.has(recordType), `member card asset record missing: ${recordType}`)
  }
  const auditActions = await prisma.auditLog.findMany({
    where: { operatorType: 'admin', operatorId: admin.id },
    select: { action: true },
  })
  const actions = new Set(auditActions.map(item => item.action))
  for (const action of [
    'order:create',
    'order:update',
    'order:cancel',
    'order:delete',
    'member-card:grant',
    'user-member-card:extend',
    'user-member-card:time:adjust',
    'user-member-card:status:update',
    'user-member-card:revoke',
    'user-member-card:draft:delete',
  ]) {
    assert(actions.has(action), `admin audit missing: ${action}`)
  }

  console.log(JSON.stringify({
    permissionMatrix: true,
    financeWriteDenied: true,
    orderCreateUpdateAndSync: true,
    optimisticLockConflict: true,
    unpaidCancel: true,
    safeDraftDelete: true,
    paymentFactDeleteProtected: true,
    memberCardExtendAdjustSuspendResume: true,
    memberCardRevokeAndDeleteRules: true,
    auditAndAssetRecords: true,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    const cards = [...userCardIds]
    const orders = [...orderIds]
    if (cards.length) {
      await prisma.memberCardRecord.deleteMany({ where: { userMemberCardId: { in: cards } } })
      await prisma.userMemberCard.deleteMany({ where: { id: { in: cards } } })
    }
    if (orders.length) {
      const payments = await prisma.payment.findMany({ where: { orderId: { in: orders } }, select: { id: true } })
      const paymentIds = payments.map(item => item.id)
      if (paymentIds.length) await prisma.paymentNotifyLog.deleteMany({ where: { paymentId: { in: paymentIds } } })
      await prisma.refund.deleteMany({ where: { orderId: { in: orders } } })
      await prisma.payment.deleteMany({ where: { orderId: { in: orders } } })
      await prisma.orderStatusLog.deleteMany({ where: { orderId: { in: orders } } })
      await prisma.order.deleteMany({ where: { id: { in: orders } } })
    }
    const operatorIds = [adminId, financeAdminId].filter((id): id is bigint => Boolean(id))
    if (operatorIds.length) await prisma.adminOperationRequest.deleteMany({ where: { adminId: { in: operatorIds } } })
    if (operatorIds.length) await prisma.auditLog.deleteMany({ where: { operatorType: 'admin', operatorId: { in: operatorIds } } })
    if (addressId) await prisma.address.deleteMany({ where: { id: addressId } })
    if (userId) await prisma.user.deleteMany({ where: { id: userId } })
    if (operatorIds.length) await prisma.adminUser.deleteMany({ where: { id: { in: operatorIds } } })
    await prisma.$disconnect()
  })
