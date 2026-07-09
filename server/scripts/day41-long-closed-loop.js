#!/usr/bin/env node
'use strict'

require('reflect-metadata')

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { setTimeout: sleep } = require('node:timers/promises')
const { Prisma, PrismaClient } = require('@prisma/client')

function arg(name, fallback) {
  const prefix = `--${name}=`
  const matched = process.argv.find(item => item.startsWith(prefix))
  if (matched) return matched.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  if (index >= 0) return process.argv[index + 1]
  return fallback
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:3100/api'
const runId = arg('run-id') || `DAY41_TEST_${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`
const durationMinutes = Math.max(1, Number(arg('duration-minutes', '245')))
const intervalSeconds = Math.max(5, Number(arg('interval-seconds', '60')))
const baseUrl = String(arg('base-url', process.env.DAY41_BASE_URL || DEFAULT_BASE_URL)).replace(/\/+$/, '')
const reportPath = arg('report', path.resolve(process.cwd(), '..', 'docs', 'plan', 'day41-long-closed-loop-detection.md'))
const noCleanup = hasFlag('no-cleanup')
const runOnce = hasFlag('once')
const cleanupMarker = arg('cleanup-marker', '')

if (!runId.startsWith('DAY41_TEST_')) {
  throw new Error('required: --run-id must start with DAY41_TEST_')
}

const startedAt = new Date()
const until = new Date(startedAt.getTime() + durationMinutes * 60 * 1000)
const evidence = {
  runId,
  baseUrl,
  startedAt: startedAt.toISOString(),
  requestedDurationMinutes: durationMinutes,
  intervalSeconds,
  noCleanup,
  cleanupMarker,
  rounds: [],
  errors: [],
}

function nowIso() {
  return new Date().toISOString()
}

function requestId(label) {
  return `${runId}:${label}`.slice(0, 64)
}

function rid(roundId, action) {
  const value = `${roundId}:${action}`
  if (value.length <= 64) return value
  const hash = crypto.createHash('sha1').update(value).digest('hex').slice(0, 8)
  return `${roundId.slice(0, 55)}:${hash}`.slice(0, 64)
}

function phoneFromSeed(seed) {
  const digits = `${Date.now()}${runId}${seed}`.replace(/\D/g, '').slice(-8).padStart(8, '0')
  return `198${digits}`
}

function dateText(offset) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function appointmentRange(offset, hour) {
  const start = new Date()
  start.setDate(start.getDate() + offset)
  start.setHours(hour, 0, 0, 0)
  const end = new Date(start)
  end.setHours(hour + 1, 0, 0, 0)
  return { start, end }
}

function money(value) {
  if (value instanceof Prisma.Decimal) return value.toNumber()
  return Number(value || 0)
}

function assertClosed(condition, message, detail) {
  if (!condition) {
    const error = new Error(message)
    if (detail !== undefined) error.detail = detail
    throw error
  }
}

function compactError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : 'Error',
    detail: error && typeof error === 'object' ? error.detail : undefined,
    stack: error instanceof Error ? error.stack?.split('\n').slice(0, 8).join('\n') : undefined,
    at: nowIso(),
  }
}

function resolveDistRequire(modulePath) {
  const candidates = [
    path.resolve(process.cwd(), 'dist', modulePath),
    path.resolve(process.cwd(), modulePath),
    path.resolve(__dirname, '..', 'dist', modulePath),
    path.resolve('/app/dist', modulePath),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return require(candidate)
  }
  throw new Error(`cannot resolve dist module: ${modulePath}`)
}

function getClassModule(modulePath, exportName) {
  const mod = resolveDistRequire(modulePath)
  const value = mod[exportName]
  if (!value) throw new Error(`missing export ${exportName} from ${modulePath}`)
  return value
}

function testImageUrl(config, roundId, name) {
  const base = String(config.get('OSS_PUBLIC_BASE_URL', 'https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com')).replace(/\/+$/, '')
  const prefix = String(config.get('OSS_UPLOAD_PREFIX', 'life-assitant/prod')).replace(/^\/+|\/+$/g, '')
  return `${base}/${prefix}/${roundId}/${name}.jpg`
}

async function httpRequest(method, urlPath, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Request-Source': options.source || 'day41-long-check',
    'X-Client-Version': 'day41',
    'X-Request-Id': options.requestId || requestId(`http-${method}-${urlPath}`),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.headers || {}),
  }
  const response = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const text = await response.text()
  let payload
  try {
    payload = text ? JSON.parse(text) : null
  }
  catch {
    payload = { raw: text }
  }
  if (!response.ok || (payload && typeof payload === 'object' && payload.code && payload.code !== 0)) {
    const error = new Error(`HTTP ${method} ${urlPath} failed: ${response.status}`)
    error.detail = payload
    throw error
  }
  return payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'data')
    ? payload.data
    : payload
}

async function ensureDay41Admin(prisma, adminAuth, roundId) {
  const username = `day41_${roundId.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`.slice(0, 60)
  const password = `Day41${crypto.randomBytes(10).toString('hex')}Aa1`
  const { hashAdminPassword } = resolveDistRequire('admin-auth/admin-password.js')
  const passwordHash = await hashAdminPassword(password)
  const admin = await prisma.adminUser.create({
    data: {
      username,
      passwordHash,
      name: `${roundId} admin`,
      role: 'super_admin',
      status: 1,
    },
  })
  const login = await adminAuth.login({ username, password })
  assertClosed(login.accessToken, 'admin login did not return accessToken')
  return { adminId: Number(admin.id), username, password, token: login.accessToken }
}

async function createBaseData(prisma, admin, roundId) {
  const category = await prisma.serviceCategory.create({
    data: {
      name: `${roundId} category`,
      icon: 'tool',
      description: `${roundId} long check category`,
      status: 1,
      sortOrder: 9999,
    },
  })
  const service = await prisma.service.create({
    data: {
      code: `${roundId.toLowerCase()}_service`.slice(0, 64),
      categoryId: category.id,
      name: `${roundId} cash service`,
      description: `${roundId} long check service`,
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
  const userPhone = phoneFromSeed(`${roundId}-user`)
  const user = await prisma.user.create({
    data: {
      phone: userPhone,
      nickname: `${roundId} user`,
      source: 'day41',
      adminRemark: `${roundId} long check user`,
      cityCode: '330100',
      openid: `day41_${roundId.toLowerCase()}_user`.slice(0, 64),
    },
  })
  const staffUserPhone = phoneFromSeed(`${roundId}-staff-user`)
  const staffUser = await prisma.user.create({
    data: {
      phone: staffUserPhone,
      nickname: `${roundId} staff user`,
      source: 'day41',
      adminRemark: `${roundId} long check staff user`,
      cityCode: '330100',
      openid: `day41_${roundId.toLowerCase()}_staff`.slice(0, 64),
    },
  })
  const staff = await prisma.staff.create({
    data: {
      userId: staffUser.id,
      name: `${roundId} staff`,
      phone: staffUserPhone,
      passwordHash: `${roundId}:not-for-login`,
      skills: [service.name, roundId],
      idCard: '330100199001010000',
      applicationNote: `${roundId} initial application`,
      applicationImages: [],
      status: 1,
      workStatus: 1,
      cityCode: '330100',
    },
  })
  const address = await prisma.address.create({
    data: {
      ownerType: 'user',
      ownerId: user.id,
      addressType: 'service',
      contactName: `${roundId} user`,
      contactPhone: userPhone,
      country: 'China',
      province: 'Zhejiang',
      city: 'Hangzhou',
      district: 'Xihu',
      addressTitle: `${roundId} address`,
      detailAddress: `${roundId} detail address`,
      formattedAddress: `Hangzhou Xihu ${roundId} detail address`,
      latitude: new Prisma.Decimal('30.2741000'),
      longitude: new Prisma.Decimal('120.1551000'),
      coordinateType: 'gcj02',
      mapProvider: 'day41',
      isDefault: true,
      source: 'day41',
      status: 1,
    },
  })
  const coupon = await admin.createCoupon({
    name: `${roundId} coupon`,
    type: 'amount',
    amount: 12,
    minAmount: 50,
    applicableServices: [Number(service.id)],
    totalCount: 100,
    startTime: new Date(Date.now() - 60 * 1000).toISOString(),
    endTime: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
    status: 'published',
  }, adminContext(roundId, 'create-coupon'))
  return { category, service, user, staffUser, staff, address, coupon }
}

function adminContext(roundId, action) {
  return { adminId: 1, requestId: rid(roundId, action), ip: '127.0.0.1' }
}

async function createUserWithAddress(prisma, roundId, suffix) {
  const phone = phoneFromSeed(`${roundId}-${suffix}`)
  const user = await prisma.user.create({
    data: {
      phone,
      nickname: `${roundId} user ${suffix}`,
      source: 'day41',
      adminRemark: `${roundId} long check user ${suffix}`,
      cityCode: '330100',
      openid: `day41_${roundId.toLowerCase()}_${suffix}`.slice(0, 64),
    },
  })
  const address = await prisma.address.create({
    data: {
      ownerType: 'user',
      ownerId: user.id,
      addressType: 'service',
      contactName: `${roundId} user ${suffix}`,
      contactPhone: phone,
      country: 'China',
      province: 'Zhejiang',
      city: 'Hangzhou',
      district: 'Xihu',
      addressTitle: `${roundId} address ${suffix}`,
      detailAddress: `${roundId} detail address ${suffix}`,
      formattedAddress: `Hangzhou Xihu ${roundId} detail address ${suffix}`,
      latitude: new Prisma.Decimal('30.2741000'),
      longitude: new Prisma.Decimal('120.1551000'),
      coordinateType: 'gcj02',
      mapProvider: 'day41',
      isDefault: true,
      source: 'day41',
      status: 1,
    },
  })
  return { user, address }
}

async function completeOrderFlow({ orders, payments, prisma, user, address, service, staff, roundId, config, hour = 10 }) {
  const order = await orders.createOrder(Number(user.id), {
    serviceId: Number(service.id),
    appointmentDate: dateText(1),
    appointmentTimeSlot: `${String(hour).padStart(2, '0')}:00-${String(hour + 1).padStart(2, '0')}:00`,
    addressId: Number(address.id),
    remark: `${roundId} complete cash order`,
    source: 'miniapp',
  }, rid(roundId, 'create-complete-order'))
  const payment = await payments.createMockPayment(Number(user.id), Number(order.id), rid(roundId, 'mock-pay-complete'))
  await orders.assignOrder(1, Number(order.id), { staffId: Number(staff.id), remark: `${roundId} assign complete` }, rid(roundId, 'assign-complete'), '127.0.0.1')
  await orders.staffAccept(Number(staff.id), Number(order.id), rid(roundId, 'staff-accept'))
  await orders.staffOnTheWay(Number(staff.id), Number(order.id), {}, rid(roundId, 'staff-way'))
  await orders.staffStartService(Number(staff.id), Number(order.id), {}, rid(roundId, 'staff-start'))
  await orders.staffComplete(Number(staff.id), Number(order.id), {
    photoUrls: [testImageUrl(config, roundId, 'complete-photo')],
    actualMinutes: 60,
    remark: `${roundId} staff complete`,
  }, rid(roundId, 'staff-complete'))
  await orders.confirmOrder(Number(user.id), Number(order.id), {}, rid(roundId, 'user-confirm'))
  const detail = await prisma.order.findUniqueOrThrow({
    where: { id: BigInt(order.id) },
    include: { payments: true, assignments: true, statusLogs: true },
  })
  const accounting = await orders.getAdminOrderAccounting(Number(order.id))
  return { order, payment, detail, accounting }
}

async function runBusinessRound(ctx, roundNo) {
  const { prisma, admin, orders, payments, refunds, coupons, notifications, profileChanges, support, afterSales, config, adminAuth } = ctx
  const roundId = `${runId}_R${String(roundNo).padStart(4, '0')}`
  const createdAt = new Date()
  const result = {
    roundNo,
    roundId,
    startedAt: createdAt.toISOString(),
    checks: {},
    counts: {},
    ids: {},
  }

  const day41Admin = await ensureDay41Admin(prisma, adminAuth, roundId)
  const base = await createBaseData(prisma, admin, roundId)
  result.ids.base = {
    adminId: day41Admin.adminId,
    serviceId: Number(base.service.id),
    userId: Number(base.user.id),
    staffUserId: Number(base.staffUser.id),
    staffId: Number(base.staff.id),
    couponId: Number(base.coupon.id),
  }

  const receivedCoupon = await coupons.receiveCoupon(Number(base.user.id), Number(base.coupon.id))
  const preview = await orders.getPricePreview(Number(base.user.id), {
    serviceId: Number(base.service.id),
    couponId: Number(base.coupon.id),
  })
  assertClosed(preview.discountAmount > 0, 'coupon preview did not produce discount', preview)

  const couponOrder = await orders.createOrder(Number(base.user.id), {
    serviceId: Number(base.service.id),
    appointmentDate: dateText(1),
    appointmentTimeSlot: '10:00-11:00',
    addressId: Number(base.address.id),
    couponId: Number(base.coupon.id),
    remark: `${roundId} coupon order`,
    source: 'miniapp',
  }, rid(roundId, 'create-coupon-order'))
  await payments.createMockPayment(Number(base.user.id), Number(couponOrder.id), rid(roundId, 'mock-pay-coupon'))
  await orders.assignOrder(1, Number(couponOrder.id), { staffId: Number(base.staff.id), remark: `${roundId} assign coupon` }, rid(roundId, 'assign-coupon'), '127.0.0.1')
  await orders.staffAccept(Number(base.staff.id), Number(couponOrder.id), rid(roundId, 'staff-accept-coupon'))
  await orders.staffOnTheWay(Number(base.staff.id), Number(couponOrder.id), {}, rid(roundId, 'staff-way-coupon'))
  await orders.staffStartService(Number(base.staff.id), Number(couponOrder.id), {}, rid(roundId, 'staff-start-coupon'))
  await orders.staffComplete(Number(base.staff.id), Number(couponOrder.id), {
    photoUrls: [testImageUrl(config, roundId, 'coupon-photo')],
    actualMinutes: 60,
    remark: `${roundId} complete coupon order`,
  }, rid(roundId, 'staff-complete-coupon'))
  await orders.confirmOrder(Number(base.user.id), Number(couponOrder.id), {}, rid(roundId, 'user-confirm-coupon'))
  const couponAccounting = await orders.getAdminOrderAccounting(Number(couponOrder.id))
  assertClosed(couponAccounting.passed, 'coupon completed order accounting failed', couponAccounting.checks)

  const refundUser = await createUserWithAddress(prisma, roundId, 'refund')
  const refundOrder = await orders.createOrder(Number(refundUser.user.id), {
    serviceId: Number(base.service.id),
    appointmentDate: dateText(2),
    appointmentTimeSlot: '14:00-15:00',
    addressId: Number(refundUser.address.id),
    remark: `${roundId} refund order`,
    source: 'miniapp',
  }, rid(roundId, 'create-refund-order'))
  await payments.createMockPayment(Number(refundUser.user.id), Number(refundOrder.id), rid(roundId, 'mock-pay-refund'))
  const refundRequest = await refunds.createUserRefundRequest(Number(refundUser.user.id), Number(refundOrder.id), {
    reason: `${roundId} refund request`,
    source: 'day41',
  }, rid(roundId, 'user-refund-request'))
  const approvedRefund = await admin.reviewRefund(Number(refundRequest.id), {
    action: 'approve',
    remark: `${roundId} approve refund`,
  }, adminContext(roundId, 'approve-refund'))
  assertClosed(approvedRefund.status === 'refunded', 'refund was not refunded after admin approval', approvedRefund)

  const completeUser = await createUserWithAddress(prisma, roundId, 'complete')
  const complete = await completeOrderFlow({
    orders,
    payments,
    prisma,
    user: completeUser.user,
    address: completeUser.address,
    service: base.service,
    staff: base.staff,
    roundId,
    config,
    hour: 15,
  })
  assertClosed(complete.accounting.passed, 'complete order accounting failed', complete.accounting.checks)

  const ticket = await afterSales.createOrderTicket(Number(completeUser.user.id), Number(complete.order.id), {
    type: 'service_quality',
    title: `${roundId} after sales`,
    description: `${roundId} after sales ticket`,
    contactPhone: completeUser.user.phone,
    images: [],
  }, rid(roundId, 'create-ticket'))
  const adminTicketList = await afterSales.listAdminTickets({ keyword: roundId, page: 1, pageSize: 20 })
  assertClosed(adminTicketList.total > 0, 'admin cannot list after-sales ticket')
  const resolvedTicket = await afterSales.resolveAdminTicket(ticket.id, 'resolved', `${roundId} ticket resolved`, adminContext(roundId, 'resolve-ticket'))
  assertClosed(resolvedTicket.status === 'resolved', 'ticket was not resolved')

  const range = appointmentRange(3, 11)
  const externalOrder = await orders.createAdminOrder(1, {
    customer: {
      nickname: `${roundId} external customer`,
      phone: phoneFromSeed(`${roundId}-external`),
      cityCode: '330100',
      adminRemark: `${roundId} external customer`,
    },
    serviceId: Number(base.service.id),
    address: {
      contactName: `${roundId} external customer`,
      contactPhone: phoneFromSeed(`${roundId}-external-address`),
      provinceName: 'Zhejiang',
      cityName: 'Hangzhou',
      districtName: 'Xihu',
      addressTitle: `${roundId} external address`,
      detailAddress: `${roundId} external detail address`,
      latitude: 30.2741,
      longitude: 120.1551,
      coordinateType: 'gcj02',
      mapProvider: 'day41',
      isDefault: true,
    },
    appointmentStartTime: range.start.toISOString(),
    appointmentEndTime: range.end.toISOString(),
    source: 'offline',
    remark: `${roundId} external offline order`,
    adminRemark: `${roundId} external offline order`,
    payableAmount: base.service.basePrice.toNumber(),
  }, rid(roundId, 'admin-create-external'), '127.0.0.1')
  await orders.confirmOfflinePayment(1, Number(externalOrder.id), {
    amount: Number(externalOrder.payableAmount),
    remark: `${roundId} offline paid`,
  }, rid(roundId, 'offline-pay'), '127.0.0.1')
  const externalAccounting = await orders.getAdminOrderAccounting(Number(externalOrder.id))
  assertClosed(externalAccounting.passed, 'external order accounting failed', externalAccounting.checks)

  const feedback = await support.submitFeedback(Number(base.user.id), {
    type: 'service_experience',
    content: `${roundId} feedback`,
    contactPhone: base.user.phone,
    images: [],
  })
  const adminFeedback = await support.listAdminFeedback({ keyword: roundId, page: 1, pageSize: 20 })
  assertClosed(adminFeedback.total > 0, 'admin cannot list feedback')
  const repliedFeedback = await support.replyFeedback(feedback.id, `${roundId} feedback reply`, 'closed', adminContext(roundId, 'reply-feedback'))
  assertClosed(repliedFeedback.status === 'closed', 'feedback was not closed by admin reply')

  const profileSubmit = await orders.updateStaffProfile(Number(base.staff.id), {
    staffName: `${roundId} approved staff`,
    avatar: testImageUrl(config, roundId, 'staff-avatar'),
  })
  await profileChanges.reviewAdminRequest(profileSubmit.profileChangeRequest.id, 1, {
    decision: 'approve',
    remark: `${roundId} approve profile`,
  }, rid(roundId, 'approve-profile'), '127.0.0.1')
  const rejected = await profileChanges.submitStaffProfileChange(Number(base.staff.id), {
    staffName: `${roundId} rejected staff`,
    submitNote: `${roundId} reject profile`,
  })
  await profileChanges.reviewAdminRequest(rejected.id, 1, {
    decision: 'reject',
    rejectReason: `${roundId} reject reason`,
  }, rid(roundId, 'reject-profile'), '127.0.0.1')
  const latestProfileRequest = await profileChanges.getStaffLatestRequest(Number(base.staff.id))
  assertClosed(latestProfileRequest?.status === 'rejected', 'staff cannot see rejected profile request')

  const orderDetail = await orders.getAdminOrderDetail(Number(couponOrder.id))
  assertClosed((orderDetail.assignmentNotifications || []).length >= 1, 'admin order detail lacks assignment notification history')
  const staffNotificationList = await notifications.listStaffNotifications(Number(base.staff.id), { page: 1, pageSize: 20 })
  assertClosed(staffNotificationList.total > 0, 'staff cannot list notifications')
  const staffNotification = staffNotificationList.items.find(item => item.orderId === Number(couponOrder.id)) || staffNotificationList.items[0]
  await notifications.markStaffNotificationRead(Number(base.staff.id), staffNotification.id)
  const staffNotificationDetail = await notifications.getAdminStaffNotificationDetail(staffNotification.id)
  assertClosed(staffNotificationDetail.isRead === true && staffNotificationDetail.readAt, 'admin cannot see staff notification read status')
  const resentNotification = await notifications.resendOrderStaffNotification(Number(couponOrder.id), 1, rid(roundId, 'resend-notification'), '127.0.0.1')
  assertClosed(resentNotification.staffId === Number(base.staff.id), 'resend staff notification did not keep staff binding')

  const pointAdjustment = await admin.adjustUserPoints(Number(base.user.id), {
    points: 17,
    remark: `${roundId} admin point adjust`,
  }, adminContext(roundId, 'adjust-points'))
  const pointLedgers = await admin.listPointLedgers({ keyword: roundId, page: 1, pageSize: 50 })
  assertClosed(pointLedgers.total > 0, 'admin cannot list point ledgers')
  assertClosed(pointAdjustment.id, 'admin point adjustment missing id')

  const financeSummary = await admin.getFinanceSummary({
    startDate: dateText(0),
    endDate: dateText(0),
    page: 1,
    pageSize: 20,
  })
  assertClosed(financeSummary.summary.paidAmount > 0, 'finance summary has no paid amount')
  assertClosed(financeSummary.summary.refundAmount > 0, 'finance summary has no refund amount')
  assertClosed(financeSummary.breakdowns.ordersBySource.length > 0, 'finance summary lacks source breakdown')
  assertClosed(financeSummary.breakdowns.paymentsByChannel.length > 0, 'finance summary lacks payment channel breakdown')

  const adminCoupons = await admin.listCoupons({ keyword: roundId, page: 1, pageSize: 20 })
  const userCoupons = await admin.listUserCouponsAdmin({ keyword: roundId, page: 1, pageSize: 50 })
  const adminOrders = await orders.listAdminOrders({ keyword: roundId, page: 1, pageSize: 50 })
  const externalBySource = await orders.listAdminOrders({ keyword: roundId, source: 'offline', page: 1, pageSize: 20 })
  const adminRefunds = await refunds.listAdminRefunds({ keyword: refundOrder.orderNo, page: 1, pageSize: 20 })

  assertClosed(adminCoupons.total > 0, 'admin cannot list coupons')
  assertClosed(userCoupons.total > 0, 'admin cannot list user coupons')
  assertClosed(adminOrders.total >= 4, 'admin cannot list all created orders', adminOrders.total)
  assertClosed(externalBySource.total > 0, 'admin cannot filter external offline orders')
  assertClosed(adminRefunds.total > 0, 'admin cannot list refunds')

  const [ordersCount, paymentsCount, refundsCount, notificationsCount, incomeCount, staffProfileRequests, feedbackCount, ticketCount] = await Promise.all([
    prisma.order.count({ where: { OR: [{ remark: { contains: roundId } }, { adminRemark: { contains: roundId } }, { service: { name: { contains: roundId } } }] } }),
    prisma.payment.count({ where: { order: { OR: [{ remark: { contains: roundId } }, { adminRemark: { contains: roundId } }, { service: { name: { contains: roundId } } }] } } }),
    prisma.refund.count({ where: { reason: { contains: roundId } } }),
    prisma.notification.count({ where: { OR: [{ title: { contains: roundId } }, { content: { contains: roundId } }] } }),
    prisma.staffIncomeRecord.count({ where: { staffId: base.staff.id } }),
    prisma.staffProfileChangeRequest.count({ where: { staffId: base.staff.id } }),
    prisma.feedback.count({ where: { content: { contains: roundId } } }),
    prisma.ticket.count({ where: { title: { contains: roundId } } }),
  ])

  result.checks = {
    auth: 'internal-admin-login-ok',
    coupon: 'preview-receive-use-admin-visible',
    payment: 'mock-payment-success-no-wechat-charge',
    order: 'user-create-admin-dispatch-staff-complete-user-confirm',
    externalOrder: 'admin-create-offline-pay-source-filter',
    refund: 'user-request-admin-approve-mock-refund',
    points: 'earn-refund-deduct-admin-adjust-visible',
    finance: 'summary-source-channel-refund-visible',
    notification: 'staff-list-read-admin-read-resend',
    profileChange: 'submit-approve-reject-history-visible',
    afterSales: 'user-ticket-admin-resolve',
    feedback: 'user-submit-admin-reply',
    addressLocation: 'address-latitude-longitude-map-provider-saved',
  }
  result.counts = {
    ordersCount,
    paymentsCount,
    refundsCount,
    notificationsCount,
    incomeCount,
    staffProfileRequests,
    feedbackCount,
    ticketCount,
    adminCoupons: adminCoupons.total,
    userCoupons: userCoupons.total,
    adminOrders: adminOrders.total,
    externalBySource: externalBySource.total,
    adminRefunds: adminRefunds.total,
  }
  result.ids.orders = [Number(couponOrder.id), Number(refundOrder.id), Number(complete.order.id), Number(externalOrder.id)]
  result.finishedAt = nowIso()
  result.durationMs = new Date(result.finishedAt).getTime() - createdAt.getTime()
  result.status = 'passed'
  result.cleanup = await cleanupRun(prisma, roundId, { dryRun: noCleanup ? true : false, confirm: !noCleanup })
  return result
}

async function runHttpRound(ctx, roundNo) {
  const { prisma, admin, orders, payments, config } = ctx
  const roundId = `${runId}_HTTP${String(roundNo).padStart(4, '0')}`
  const result = { roundNo, roundId, startedAt: nowIso(), checks: {}, ids: {} }
  const day41Admin = await ensureDay41Admin(prisma, ctx.adminAuth, roundId)
  const base = await createBaseData(prisma, admin, roundId)
  const mockPhone = process.env.MOCK_LOGIN_PHONE || ''
  let userToken = null
  let staffToken = null
  let mockLoginMode = 'skipped'

  if (mockPhone) {
    try {
      const mockLogin = await httpRequest('POST', '/auth/mock-login', {
        body: { phone: mockPhone },
        requestId: rid(roundId, 'http-mock-login'),
      })
      userToken = mockLogin.accessToken
      assertClosed(userToken, 'mock-login did not return token')
      await httpRequest('GET', '/auth/me', { token: userToken, requestId: rid(roundId, 'http-user-me') })
      if (mockLogin.refreshToken) {
        const refreshed = await httpRequest('POST', '/auth/refresh', {
          body: { refreshToken: mockLogin.refreshToken },
          requestId: rid(roundId, 'http-refresh'),
        })
        assertClosed(refreshed.accessToken, 'refresh did not return accessToken')
      }
      mockLoginMode = 'passed'
    }
    catch (error) {
      mockLoginMode = `failed:${error.message}`
    }
  }

  userToken = await ctx.jwt.signAsync({ userId: Number(base.user.id), phone: base.user.phone, role: 'user' }, { expiresIn: '2h' })
  staffToken = await ctx.jwt.signAsync({ userId: Number(base.staffUser.id), phone: base.staffUser.phone, role: 'staff' }, { expiresIn: '2h' })
  const adminToken = day41Admin.token

  const adminMe = await httpRequest('GET', '/admin/auth/me', { token: adminToken, requestId: rid(roundId, 'http-admin-me') })
  assertClosed(adminMe.username === day41Admin.username, 'admin /me username mismatch', adminMe)

  const createdAddress = await httpRequest('POST', '/user/addresses', {
    token: userToken,
    requestId: rid(roundId, 'http-create-address'),
    body: {
      contactName: `${roundId} http user`,
      contactPhone: phoneFromSeed(`${roundId}-http-address`),
      provinceName: 'Zhejiang',
      cityName: 'Hangzhou',
      districtName: 'Xihu',
      addressTitle: `${roundId} http address`,
      detailAddress: `${roundId} http detail address`,
      isDefault: true,
      latitude: 30.2741,
      longitude: 120.1551,
      coordinateType: 'gcj02',
      mapProvider: 'tencent',
      addressType: 'service',
    },
  })
  assertClosed(createdAddress.id, 'http address create did not return id')

  const pricePreview = await httpRequest('GET', `/orders/price-preview?serviceId=${Number(base.service.id)}`, {
    token: userToken,
    requestId: rid(roundId, 'http-price-preview'),
  })
  assertClosed(pricePreview.payableAmount > 0, 'http price preview failed', pricePreview)

  const createdOrder = await httpRequest('POST', '/orders', {
    token: userToken,
    requestId: rid(roundId, 'http-create-order'),
    body: {
      serviceId: Number(base.service.id),
      appointmentDate: dateText(1),
      appointmentTimeSlot: '09:00-10:00',
      addressId: Number(createdAddress.id),
      remark: `${roundId} http order`,
      source: 'miniapp',
    },
  })
  assertClosed(createdOrder.id, 'http order create failed', createdOrder)

  await payments.createMockPayment(Number(base.user.id), Number(createdOrder.id), rid(roundId, 'http-mock-pay'))
  const adminAssign = await httpRequest('POST', `/admin/orders/${createdOrder.id}/assign`, {
    token: adminToken,
    requestId: rid(roundId, 'http-admin-assign'),
    body: { staffId: Number(base.staff.id), remark: `${roundId} http assign` },
  })
  assertClosed(adminAssign.id || adminAssign.status, 'http admin assign failed', adminAssign)

  const staffOrders = await httpRequest('GET', '/staff/orders?page=1&pageSize=20', {
    token: staffToken,
    requestId: rid(roundId, 'http-staff-orders'),
  })
  assertClosed(staffOrders.total > 0, 'http staff orders empty')
  await httpRequest('POST', `/staff/orders/${createdOrder.id}/accept`, { token: staffToken, requestId: rid(roundId, 'http-staff-accept'), body: {} })
  await httpRequest('POST', `/staff/orders/${createdOrder.id}/on-the-way`, { token: staffToken, requestId: rid(roundId, 'http-staff-way'), body: {} })
  await httpRequest('POST', `/staff/orders/${createdOrder.id}/start-service`, { token: staffToken, requestId: rid(roundId, 'http-staff-start'), body: {} })
  await httpRequest('POST', `/staff/orders/${createdOrder.id}/complete`, {
    token: staffToken,
    requestId: rid(roundId, 'http-staff-complete'),
    body: {
      photoUrls: [testImageUrl(config, roundId, 'http-complete')],
      actualMinutes: 60,
      remark: `${roundId} http complete`,
    },
  })
  await httpRequest('POST', `/orders/${createdOrder.id}/confirm`, {
    token: userToken,
    requestId: rid(roundId, 'http-user-confirm'),
    body: {},
  })

  const userOrderDetail = await httpRequest('GET', `/orders/${createdOrder.id}`, { token: userToken, requestId: rid(roundId, 'http-order-detail') })
  const adminOrderDetail = await httpRequest('GET', `/admin/orders/${createdOrder.id}`, { token: adminToken, requestId: rid(roundId, 'http-admin-order-detail') })
  const accounting = await httpRequest('GET', `/admin/orders/${createdOrder.id}/accounting`, { token: adminToken, requestId: rid(roundId, 'http-accounting') })
  assertClosed(userOrderDetail.status === 'completed', 'http user order not completed', userOrderDetail.status)
  assertClosed(adminOrderDetail.id, 'http admin order detail missing')
  assertClosed(accounting.passed, 'http accounting failed', accounting.checks)

  const notificationsPage = await httpRequest('GET', '/staff/notifications?page=1&pageSize=20', {
    token: staffToken,
    requestId: rid(roundId, 'http-staff-notifications'),
  })
  assertClosed(notificationsPage.total > 0, 'http staff notifications empty')
  const notificationId = notificationsPage.items[0].id
  await httpRequest('POST', `/staff/notifications/${notificationId}/read`, {
    token: staffToken,
    requestId: rid(roundId, 'http-staff-notification-read'),
    body: {},
  })
  const adminStaffNotification = await httpRequest('GET', `/admin/staff-notifications/${notificationId}`, {
    token: adminToken,
    requestId: rid(roundId, 'http-admin-staff-notification'),
  })
  assertClosed(adminStaffNotification.isRead === true, 'http admin cannot see notification read status')

  const ticket = await httpRequest('POST', `/orders/${createdOrder.id}/after-sales`, {
    token: userToken,
    requestId: rid(roundId, 'http-ticket'),
    body: {
      type: 'service_quality',
      title: `${roundId} http ticket`,
      description: `${roundId} http ticket description`,
      contactPhone: base.user.phone,
      images: [],
    },
  })
  await httpRequest('POST', `/admin/after-sales/tickets/${ticket.id}/resolve`, {
    token: adminToken,
    requestId: rid(roundId, 'http-ticket-resolve'),
    body: { remark: `${roundId} http ticket resolve` },
  })

  result.checks = {
    mockLoginMode,
    adminLogin: 'passed',
    userAddressLocation: 'passed',
    userOrder: 'passed',
    payment: 'mock-service-passed',
    adminAssign: 'passed',
    staffFlow: 'passed',
    notification: 'passed',
    accounting: 'passed',
    afterSales: 'passed',
  }
  result.ids = {
    adminId: day41Admin.adminId,
    serviceId: Number(base.service.id),
    userId: Number(base.user.id),
    staffId: Number(base.staff.id),
    orderId: Number(createdOrder.id),
    ticketId: Number(ticket.id),
  }
  result.finishedAt = nowIso()
  result.status = 'passed'
  result.cleanup = await cleanupRun(prisma, roundId, { dryRun: noCleanup ? true : false, confirm: !noCleanup })
  return result
}

async function collectRun(prisma, marker) {
  const orderWhere = {
    OR: [
      { remark: { contains: marker } },
      { adminRemark: { contains: marker } },
      { service: { name: { contains: marker } } },
      { user: { nickname: { contains: marker } } },
    ],
  }
  const orders = await prisma.order.findMany({
    where: orderWhere,
    select: { id: true, orderNo: true, userId: true, staffId: true, serviceId: true },
  })
  const orderIds = orders.map(item => item.id)
  const userIdsFromOrders = orders.map(item => item.userId)
  const staffIdsFromOrders = orders.map(item => item.staffId).filter(Boolean)
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { nickname: { contains: marker } },
        { adminRemark: { contains: marker } },
        { openid: { contains: marker.toLowerCase() } },
        { id: { in: userIdsFromOrders } },
      ],
    },
    select: { id: true },
  })
  const userIds = users.map(item => item.id)
  const staff = await prisma.staff.findMany({
    where: {
      OR: [
        { name: { contains: marker } },
        { applicationNote: { contains: marker } },
        { userId: { in: userIds } },
        { id: { in: staffIdsFromOrders } },
      ],
    },
    select: { id: true, userId: true },
  })
  const staffIds = staff.map(item => item.id)
  const staffUserIds = staff.map(item => item.userId).filter(Boolean)
  const allUserIds = Array.from(new Set([...userIds, ...staffUserIds].map(String))).map(BigInt)
  const services = await prisma.service.findMany({
    where: { OR: [{ name: { contains: marker } }, { code: { contains: marker.toLowerCase() } }] },
    select: { id: true, categoryId: true },
  })
  const serviceIds = services.map(item => item.id)
  const categories = await prisma.serviceCategory.findMany({
    where: { name: { contains: marker } },
    select: { id: true },
  })
  const categoryIds = Array.from(new Set([...services.map(item => String(item.categoryId)), ...categories.map(item => String(item.id))])).map(BigInt)
  const coupons = await prisma.coupon.findMany({ where: { name: { contains: marker } }, select: { id: true } })
  const couponIds = coupons.map(item => item.id)
  const payments = await prisma.payment.findMany({
    where: { OR: [{ orderId: { in: orderIds } }, { callbackRaw: { contains: marker } }] },
    select: { id: true, paymentNo: true },
  })
  const paymentIds = payments.map(item => item.id)
  const paymentNos = payments.map(item => item.paymentNo)
  const refunds = await prisma.refund.findMany({
    where: { OR: [{ orderId: { in: orderIds } }, { paymentId: { in: paymentIds } }, { reason: { contains: marker } }, { notifyRaw: { contains: marker } }] },
    select: { id: true },
  })
  const withdraws = await prisma.withdrawRequest.findMany({
    where: { OR: [{ requestId: { contains: marker } }, { notifyRaw: { contains: marker } }, { incomeRecords: { some: { orderId: { in: orderIds } } } }] },
    select: { id: true },
  })
  const withdrawIds = withdraws.map(item => item.id)
  const tickets = await prisma.ticket.findMany({
    where: { OR: [{ orderId: { in: orderIds } }, { title: { contains: marker } }, { description: { contains: marker } }] },
    select: { id: true },
  })
  const reviews = await prisma.review.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } })
  const feedbacks = await prisma.feedback.findMany({
    where: { OR: [{ userId: { in: allUserIds } }, { content: { contains: marker } }, { reply: { contains: marker } }] },
    select: { id: true },
  })
  const profileRequests = await prisma.staffProfileChangeRequest.findMany({
    where: { OR: [{ staffId: { in: staffIds } }, { submitNote: { contains: marker } }, { rejectReason: { contains: marker } }] },
    select: { id: true },
  })
  const admins = await prisma.adminUser.findMany({ where: { username: { contains: marker.toLowerCase() } }, select: { id: true } })
  const addresses = await prisma.address.findMany({
    where: { OR: [{ ownerType: 'user', ownerId: { in: allUserIds } }, { detailAddress: { contains: marker } }, { formattedAddress: { contains: marker } }] },
    select: { id: true },
  })
  const pointLedgers = await prisma.pointLedger.findMany({
    where: { OR: [{ orderId: { in: orderIds } }, { userId: { in: allUserIds } }, { remark: { contains: marker } }] },
    select: { id: true },
  })
  const userCoupons = await prisma.userCoupon.findMany({
    where: { OR: [{ usedOrderId: { in: orderIds } }, { userId: { in: allUserIds } }, { couponId: { in: couponIds } }] },
    select: { id: true },
  })
  const notifications = await prisma.notification.findMany({
    where: { OR: [{ bizType: 'order', bizId: { in: orderIds } }, { title: { contains: marker } }, { content: { contains: marker } }] },
    select: { id: true },
  })
  const orderAssignments = await prisma.orderAssignment.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } })
  const orderStatusLogs = await prisma.orderStatusLog.findMany({
    where: { OR: [{ orderId: { in: orderIds } }, { requestId: { contains: marker } }, { remark: { contains: marker } }] },
    select: { id: true },
  })
  const paymentNotifyLogs = await prisma.paymentNotifyLog.findMany({
    where: { OR: [{ paymentId: { in: paymentIds } }, { paymentNo: { in: paymentNos } }, { rawBody: { contains: marker } }] },
    select: { id: true },
  })
  const incomeRecords = await prisma.staffIncomeRecord.findMany({
    where: { OR: [{ orderId: { in: orderIds } }, { staffId: { in: staffIds } }, { withdrawRequestId: { in: withdrawIds } }] },
    select: { id: true },
  })
  const files = await prisma.file.findMany({
    where: { OR: [{ bizType: 'order', bizId: { in: orderIds } }, { url: { contains: marker } }, { storageKey: { contains: marker } }, { source: { contains: marker } }, { remark: { contains: marker } }] },
    select: { id: true },
  })
  const auditLogs = await prisma.auditLog.findMany({
    where: { OR: [{ requestId: { contains: marker } }, { detail: { path: '$', string_contains: marker } }] },
    select: { id: true },
  }).catch(() => prisma.auditLog.findMany({ where: { requestId: { contains: marker } }, select: { id: true } }))

  return {
    marker,
    orderIds,
    orderNos: orders.map(item => item.orderNo),
    userIds: allUserIds,
    staffIds,
    serviceIds,
    categoryIds,
    couponIds,
    paymentIds,
    paymentNos,
    refundIds: refunds.map(item => item.id),
    withdrawIds,
    ticketIds: tickets.map(item => item.id),
    reviewIds: reviews.map(item => item.id),
    feedbackIds: feedbacks.map(item => item.id),
    profileRequestIds: profileRequests.map(item => item.id),
    adminIds: admins.map(item => item.id),
    addressIds: addresses.map(item => item.id),
    pointLedgerIds: pointLedgers.map(item => item.id),
    userCouponIds: userCoupons.map(item => item.id),
    notificationIds: notifications.map(item => item.id),
    orderAssignmentIds: orderAssignments.map(item => item.id),
    orderStatusLogIds: orderStatusLogs.map(item => item.id),
    paymentNotifyLogIds: paymentNotifyLogs.map(item => item.id),
    incomeRecordIds: incomeRecords.map(item => item.id),
    fileIds: files.map(item => item.id),
    auditLogIds: auditLogs.map(item => item.id),
  }
}

function cleanupSummary(data) {
  return {
    marker: data.marker,
    orders: data.orderIds.length,
    users: data.userIds.length,
    staff: data.staffIds.length,
    services: data.serviceIds.length,
    serviceCategories: data.categoryIds.length,
    coupons: data.couponIds.length,
    payments: data.paymentIds.length,
    refunds: data.refundIds.length,
    withdraws: data.withdrawIds.length,
    tickets: data.ticketIds.length,
    reviews: data.reviewIds.length,
    feedbacks: data.feedbackIds.length,
    profileRequests: data.profileRequestIds.length,
    admins: data.adminIds.length,
    addresses: data.addressIds.length,
    pointLedgers: data.pointLedgerIds.length,
    userCoupons: data.userCouponIds.length,
    notifications: data.notificationIds.length,
    orderAssignments: data.orderAssignmentIds.length,
    orderStatusLogs: data.orderStatusLogIds.length,
    paymentNotifyLogs: data.paymentNotifyLogIds.length,
    incomeRecords: data.incomeRecordIds.length,
    files: data.fileIds.length,
    auditLogs: data.auditLogIds.length,
  }
}

async function cleanupRun(prisma, marker, options = {}) {
  const beforeData = await collectRun(prisma, marker)
  const before = cleanupSummary(beforeData)
  if (options.dryRun || !options.confirm) {
    return { mode: 'dry-run', before }
  }
  await prisma.$transaction(async (tx) => {
    await tx.withdrawStatusLog.deleteMany({ where: { withdrawRequestId: { in: beforeData.withdrawIds } } })
    await tx.staffIncomeRecord.deleteMany({ where: { id: { in: beforeData.incomeRecordIds } } })
    await tx.withdrawRequest.deleteMany({ where: { id: { in: beforeData.withdrawIds } } })
    await tx.ticketMessage.deleteMany({ where: { ticketId: { in: beforeData.ticketIds } } })
    await tx.ticket.deleteMany({ where: { id: { in: beforeData.ticketIds } } })
    await tx.feedback.deleteMany({ where: { id: { in: beforeData.feedbackIds } } })
    await tx.reviewImage.deleteMany({ where: { reviewId: { in: beforeData.reviewIds } } })
    await tx.review.deleteMany({ where: { id: { in: beforeData.reviewIds } } })
    await tx.servicePhoto.deleteMany({ where: { orderId: { in: beforeData.orderIds } } })
    await tx.serviceCheckin.deleteMany({ where: { orderId: { in: beforeData.orderIds } } })
    await tx.refund.deleteMany({ where: { id: { in: beforeData.refundIds } } })
    await tx.paymentNotifyLog.deleteMany({ where: { id: { in: beforeData.paymentNotifyLogIds } } })
    await tx.payment.deleteMany({ where: { id: { in: beforeData.paymentIds } } })
    await tx.pointLedger.deleteMany({ where: { id: { in: beforeData.pointLedgerIds } } })
    await tx.userCoupon.deleteMany({ where: { id: { in: beforeData.userCouponIds } } })
    await tx.notification.deleteMany({ where: { id: { in: beforeData.notificationIds } } })
    await tx.staffProfileChangeRequest.deleteMany({ where: { id: { in: beforeData.profileRequestIds } } })
    await tx.memberCardRecord.deleteMany({ where: { orderId: { in: beforeData.orderIds } } })
    await tx.orderAssignment.deleteMany({ where: { id: { in: beforeData.orderAssignmentIds } } })
    await tx.orderStatusLog.deleteMany({ where: { id: { in: beforeData.orderStatusLogIds } } })
    await tx.file.deleteMany({ where: { id: { in: beforeData.fileIds } } })
    await tx.order.deleteMany({ where: { id: { in: beforeData.orderIds } } })
    await tx.address.deleteMany({ where: { id: { in: beforeData.addressIds } } })
    await tx.serviceFavorite.deleteMany({ where: { OR: [{ userId: { in: beforeData.userIds } }, { serviceId: { in: beforeData.serviceIds } }] } })
    await tx.userRefreshToken.deleteMany({ where: { userId: { in: beforeData.userIds } } })
    await tx.staff.deleteMany({ where: { id: { in: beforeData.staffIds } } })
    await tx.user.deleteMany({ where: { id: { in: beforeData.userIds } } })
    await tx.coupon.deleteMany({ where: { id: { in: beforeData.couponIds } } })
    await tx.serviceImage.deleteMany({ where: { serviceId: { in: beforeData.serviceIds } } })
    await tx.servicePriceRule.deleteMany({ where: { serviceId: { in: beforeData.serviceIds } } })
    await tx.service.deleteMany({ where: { id: { in: beforeData.serviceIds } } })
    await tx.serviceCategory.deleteMany({ where: { id: { in: beforeData.categoryIds } } })
    await tx.auditLog.deleteMany({ where: { id: { in: beforeData.auditLogIds } } })
    await tx.adminUser.deleteMany({ where: { id: { in: beforeData.adminIds } } })
  }, { timeout: 30000 })
  const after = cleanupSummary(await collectRun(prisma, marker))
  return { mode: 'confirm', before, after }
}

async function writeReport(final = false) {
  evidence.updatedAt = nowIso()
  evidence.finishedAt = final ? nowIso() : undefined
  evidence.summary = summarizeEvidence()
  const lines = []
  lines.push('# Day41 通宵长程闭环检测记录')
  lines.push('')
  lines.push(`- 运行标识：\`${evidence.runId}\``)
  lines.push(`- 云端接口：\`${evidence.baseUrl}\``)
  lines.push(`- 开始时间：${evidence.startedAt}`)
  lines.push(`- 更新时间：${evidence.updatedAt}`)
  lines.push(`- 计划时长：${evidence.requestedDurationMinutes} 分钟`)
  lines.push(`- 实际轮次：${evidence.rounds.length}`)
  lines.push(`- 失败轮次：${evidence.errors.length}`)
  lines.push('')
  lines.push('## 检测范围')
  lines.push('')
  lines.push('- 登录闭环：admin 登录、admin 受保护接口、用户 JWT 受保护接口、师傅 JWT 受保护接口；mock-login 在云端开启时同步验证。')
  lines.push('- 用户端闭环：地址定位字段保存、价格预览、下单、订单列表/详情、确认完成、退款申请、售后工单、反馈。')
  lines.push('- 师傅端闭环：订单列表、接单、出发、开始服务、完工、通知列表、标记已读、资料变更申请。')
  lines.push('- admin 端闭环：订单载入、派单、外来订单、离线收款、财务统计、优惠券、用户券、积分、退款、通知送达/阅读/重发、资料变更复核、售后/反馈。')
  lines.push('- 支付闭环：使用系统 mock/offline 支付验证记账，不触发真实微信扣款；微信 notify 入口只做路由存在性和代码审计，不造真实扣款。')
  lines.push('')
  lines.push('## 运行摘要')
  lines.push('')
  lines.push('```json')
  lines.push(JSON.stringify(evidence.summary, null, 2))
  lines.push('```')
  lines.push('')
  lines.push('## 轮次明细')
  lines.push('')
  for (const round of evidence.rounds) {
    lines.push(`### ${round.roundId}`)
    lines.push('')
    lines.push(`- 状态：${round.status}`)
    lines.push(`- 开始：${round.startedAt}`)
    lines.push(`- 结束：${round.finishedAt || ''}`)
    lines.push(`- 耗时：${round.durationMs || 0} ms`)
    lines.push('- 检查项：')
    for (const [key, value] of Object.entries(round.checks || {})) {
      lines.push(`  - ${key}: ${value}`)
    }
    lines.push('- 计数证据：')
    lines.push('')
    lines.push('```json')
    lines.push(JSON.stringify(round.counts || {}, null, 2))
    lines.push('```')
    if (round.cleanup) {
      lines.push('- 清理结果：')
      lines.push('')
      lines.push('```json')
      lines.push(JSON.stringify(round.cleanup, null, 2))
      lines.push('```')
    }
    lines.push('')
  }
  if (evidence.errors.length) {
    lines.push('## 问题记录')
    lines.push('')
    lines.push('```json')
    lines.push(JSON.stringify(evidence.errors, null, 2))
    lines.push('```')
  }
  lines.push('## 原始证据')
  lines.push('')
  lines.push('```json')
  lines.push(JSON.stringify(evidence, null, 2))
  lines.push('```')
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8')
}

function summarizeEvidence() {
  const passed = evidence.rounds.filter(item => item.status === 'passed').length
  const failed = evidence.errors.length
  const cleanupAfterNonZero = evidence.rounds.filter((round) => {
    const after = round.cleanup?.after
    if (!after) return false
    return Object.entries(after).some(([key, value]) => key !== 'marker' && Number(value) !== 0)
  }).length
  return {
    status: failed === 0 && cleanupAfterNonZero === 0 ? 'passed' : 'needs_attention',
    passedRounds: passed,
    failedRounds: failed,
    cleanupAfterNonZero,
    checkedClosures: [
      'auth',
      'user-order',
      'staff-order',
      'admin-order',
      'mock-payment',
      'offline-payment',
      'coupon',
      'points',
      'refund',
      'finance',
      'notification',
      'profile-change',
      'after-sales',
      'feedback',
      'address-location',
    ],
  }
}

async function main() {
  const { NestFactory } = require('@nestjs/core')
  const { AppModule } = resolveDistRequire('app.module.js')
  const PrismaService = getClassModule('prisma/prisma.service.js', 'PrismaService')
  const AdminBusinessService = getClassModule('admin-business/admin-business.service.js', 'AdminBusinessService')
  const AdminAuthService = getClassModule('admin-auth/admin-auth.service.js', 'AdminAuthService')
  const AuthService = getClassModule('auth/auth.service.js', 'AuthService')
  const OrdersService = getClassModule('orders/orders.service.js', 'OrdersService')
  const PaymentsService = getClassModule('payments/payments.service.js', 'PaymentsService')
  const RefundsService = getClassModule('refunds/refunds.service.js', 'RefundsService')
  const CouponsService = getClassModule('coupons/coupons.service.js', 'CouponsService')
  const NotificationsService = getClassModule('notifications/notifications.service.js', 'NotificationsService')
  const StaffProfileChangeService = getClassModule('staff-profile-change/staff-profile-change.service.js', 'StaffProfileChangeService')
  const SupportService = getClassModule('support/support.service.js', 'SupportService')
  const AfterSalesService = getClassModule('after-sales/after-sales.service.js', 'AfterSalesService')
  const ConfigService = require('@nestjs/config').ConfigService
  const JwtService = require('@nestjs/jwt').JwtService

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false })
  const ctx = {
    app,
    prisma: app.get(PrismaService),
    admin: app.get(AdminBusinessService),
    adminAuth: app.get(AdminAuthService),
    auth: app.get(AuthService),
    orders: app.get(OrdersService),
    payments: app.get(PaymentsService),
    refunds: app.get(RefundsService),
    coupons: app.get(CouponsService),
    notifications: app.get(NotificationsService),
    profileChanges: app.get(StaffProfileChangeService),
    support: app.get(SupportService),
    afterSales: app.get(AfterSalesService),
    config: app.get(ConfigService),
    jwt: app.get(JwtService),
  }

  if (cleanupMarker) {
    const cleanup = await cleanupRun(ctx.prisma, cleanupMarker, { dryRun: noCleanup ? true : false, confirm: !noCleanup })
    evidence.rounds.push({
      roundNo: 0,
      roundId: cleanupMarker,
      startedAt: startedAt.toISOString(),
      finishedAt: nowIso(),
      status: 'passed',
      checks: { cleanup: noCleanup ? 'dry-run' : 'confirmed' },
      counts: cleanup.before || {},
      cleanup,
    })
    await writeReport(true)
    await app.close()
    return
  }

  await writeReport(false)
  let roundNo = 1
  try {
    while (runOnce || Date.now() < until.getTime()) {
      const started = Date.now()
      try {
        const business = await runBusinessRound(ctx, roundNo)
        evidence.rounds.push(business)
        if (roundNo === 1 || roundNo % 5 === 0) {
          const http = await runHttpRound(ctx, roundNo)
          evidence.rounds.push(http)
        }
      }
      catch (error) {
        const failure = compactError(error)
        failure.roundNo = roundNo
        failure.cleanup = {
          business: await cleanupRun(ctx.prisma, `${runId}_R${String(roundNo).padStart(4, '0')}`, { confirm: !noCleanup, dryRun: noCleanup }).catch(compactError),
          http: await cleanupRun(ctx.prisma, `${runId}_HTTP${String(roundNo).padStart(4, '0')}`, { confirm: !noCleanup, dryRun: noCleanup }).catch(compactError),
        }
        evidence.errors.push(failure)
      }
      await writeReport(false)
      if (runOnce) break
      roundNo += 1
      const elapsed = Date.now() - started
      const waitMs = Math.max(0, intervalSeconds * 1000 - elapsed)
      if (waitMs > 0) await sleep(waitMs)
    }
  }
  finally {
    await writeReport(true)
    await app.close()
  }

  if (evidence.errors.length) {
    process.exitCode = 1
  }
}

main().catch(async (error) => {
  evidence.errors.push(compactError(error))
  await writeReport(true).catch(() => undefined)
  console.error(error)
  process.exit(1)
})
