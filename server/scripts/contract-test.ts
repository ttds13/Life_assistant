import { strict as assert } from 'node:assert'
import { PrismaClient } from '@prisma/client'
import { createConfiguredApp } from '../src/main'

const port = Number(process.env.CONTRACT_PORT || 3210)
const baseUrl = `http://127.0.0.1:${port}/api`
const prisma = new PrismaClient()

interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
  requestId: string
  timestamp: string
}

async function request<T>(pathname: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Source': 'miniapp',
      'X-Client-Version': '1.0.0',
      ...(options.headers || {}),
    },
  })
  const body = await response.json() as ApiResponse<T>
  assert.equal(typeof body.code, 'number')
  assert.equal(typeof body.message, 'string')
  assert.ok(Object.prototype.hasOwnProperty.call(body, 'data'))
  assert.equal(typeof body.requestId, 'string')
  assert.equal(typeof body.timestamp, 'string')
  return { response, body }
}

async function authed<T>(token: string, pathname: string, options: RequestInit = {}) {
  return request<T>(pathname, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })
}

async function ensureStaff() {
  const staff = await prisma.staff.upsert({
    where: { uuid: 'contract-staff-uuid' },
    create: {
      uuid: 'contract-staff-uuid',
      name: 'Contract Staff',
      phone: '13900001111',
      passwordHash: 'dev',
      status: 1,
      workStatus: 1,
    },
    update: {
      name: 'Contract Staff',
      phone: '13900001111',
      status: 1,
      workStatus: 1,
      deletedAt: null,
    },
  })
  return Number(staff.id)
}

async function runBasicContract(token: string) {
  const health = await request<{ status: string }>('/health')
  assert.equal(health.response.status, 200)
  assert.equal(health.body.code, 0)
  assert.equal(health.body.data.status, 'ok')

  const categories = await request<any[]>('/service-categories')
  assert.equal(categories.response.status, 200)
  assert.ok(Array.isArray(categories.body.data))
  assert.ok(categories.body.data.length >= 4)
  assert.equal(typeof categories.body.data[0].id, 'number')
  assert.equal(typeof categories.body.data[0].icon, 'string')

  const services = await request<{ items: any[], total: number, page: number, pageSize: number }>('/services?page=1&pageSize=10')
  assert.equal(services.response.status, 200)
  assert.ok(Array.isArray(services.body.data.items))
  assert.equal(typeof services.body.data.total, 'number')
  assert.equal(services.body.data.page, 1)
  assert.equal(services.body.data.pageSize, 10)
  assert.ok(services.body.data.items.length > 0)

  const firstService = services.body.data.items[0]
  assert.equal(typeof firstService.id, 'number')
  assert.equal(typeof firstService.basePrice, 'number')

  const detail = await request<any>(`/services/${firstService.id}`)
  assert.equal(detail.response.status, 200)
  assert.equal(detail.body.data.id, firstService.id)

  const missing = await request('/services/999999999')
  assert.equal(missing.response.status, 404)
  assert.equal(missing.body.code, 40001)

  const me = await authed<any>(token, '/auth/me')
  assert.equal(me.response.status, 200)

  const noAuth = await request('/auth/me')
  assert.equal(noAuth.response.status, 401)
  assert.equal(noAuth.body.code, 20001)
}

async function runOrderMainFlow(token: string, staffId: number) {
  const services = await request<{ items: any[] }>('/services?page=1&pageSize=1')
  const serviceId = services.body.data.items[0].id

  const address = await authed<any>(token, '/user/addresses', {
    method: 'POST',
    body: JSON.stringify({
      contactName: 'Contract User',
      contactPhone: '13800001111',
      cityName: 'Shanghai',
      districtName: 'Pudong',
      detailAddress: 'Contract Road 1',
      isDefault: true,
    }),
  })
  assert.equal(address.response.status, 200)
  assert.equal(address.body.data.isDefault, true)

  const preview = await authed<any>(token, `/orders/price-preview?serviceId=${serviceId}`)
  assert.equal(preview.response.status, 200)
  assert.equal(typeof preview.body.data.payableAmount, 'number')

  const order = await authed<any>(token, '/orders', {
    method: 'POST',
    body: JSON.stringify({
      serviceId,
      addressId: address.body.data.id,
      appointmentDate: '2026-06-01',
      appointmentTimeSlot: '09:00-11:00',
      remark: 'contract flow',
    }),
  })
  assert.equal(order.response.status, 200)
  assert.equal(order.body.data.status, 'pending_payment')
  assert.equal(order.body.data.version, 0)
  assert.ok(order.body.data.statusLogs.some((item: any) => item.label === 'create_order'))

  const orderId = order.body.data.id
  const pay = await authed<any>(token, `/orders/${orderId}/pay`, { method: 'POST' })
  assert.equal(pay.response.status, 200)
  assert.equal(typeof pay.body.data.paymentNo, 'string')

  const paid = await authed<any>(token, '/payments/mock-success', {
    method: 'POST',
    body: JSON.stringify({ paymentNo: pay.body.data.paymentNo }),
  })
  assert.equal(paid.response.status, 200)
  assert.equal(paid.body.data.order.status, 'pending_dispatch')

  const assigned = await authed<any>(token, `/admin/orders/${orderId}/assign`, {
    method: 'POST',
    headers: { 'X-Admin-Id': '1' },
    body: JSON.stringify({ staffId }),
  })
  assert.equal(assigned.response.status, 200)
  assert.equal(assigned.body.data.status, 'dispatched')
  assert.equal(assigned.body.data.staffName, 'Contract Staff')

  const accepted = await authed<any>(token, `/staff/orders/${orderId}/accept`, {
    method: 'POST',
    headers: { 'X-Staff-Id': String(staffId) },
  })
  assert.equal(accepted.response.status, 200)
  assert.equal(accepted.body.data.status, 'accepted')

  const onTheWay = await authed<any>(token, `/staff/orders/${orderId}/on-the-way`, {
    method: 'POST',
    headers: { 'X-Staff-Id': String(staffId) },
    body: JSON.stringify({ version: accepted.body.data.version }),
  })
  assert.equal(onTheWay.response.status, 200)
  assert.equal(onTheWay.body.data.status, 'on_the_way')

  const started = await authed<any>(token, `/staff/orders/${orderId}/start-service`, {
    method: 'POST',
    headers: { 'X-Staff-Id': String(staffId) },
    body: JSON.stringify({ version: onTheWay.body.data.version }),
  })
  assert.equal(started.response.status, 200)
  assert.equal(started.body.data.status, 'in_service')

  const completedByStaff = await authed<any>(token, `/staff/orders/${orderId}/complete`, {
    method: 'POST',
    headers: { 'X-Staff-Id': String(staffId) },
    body: JSON.stringify({
      version: started.body.data.version,
      remark: 'finished',
      photoUrls: ['/static/logo.svg'],
    }),
  })
  assert.equal(completedByStaff.response.status, 200)
  assert.equal(completedByStaff.body.data.status, 'pending_confirm')

  const confirmed = await authed<any>(token, `/orders/${orderId}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ version: completedByStaff.body.data.version }),
  })
  assert.equal(confirmed.response.status, 200)
  assert.equal(confirmed.body.data.status, 'completed')
  assert.ok(confirmed.body.data.statusLogs.some((item: any) => item.label === 'user_confirm'))

  const logs = await prisma.orderStatusLog.findMany({
    where: { orderId: BigInt(orderId) },
    orderBy: { createdAt: 'asc' },
  })
  assert.deepEqual(logs.map(log => log.action), [
    'create_order',
    'pay_success',
    'admin_assign',
    'staff_accept',
    'staff_on_the_way',
    'staff_start',
    'staff_complete',
    'user_confirm',
  ])
}

async function createPendingOrder(token: string) {
  const services = await request<{ items: any[] }>('/services?page=1&pageSize=1')
  const serviceId = services.body.data.items[0].id
  const address = await authed<any>(token, '/user/addresses', {
    method: 'POST',
    body: JSON.stringify({
      contactName: 'Conflict User',
      contactPhone: '13800001111',
      cityName: 'Shanghai',
      districtName: 'Pudong',
      detailAddress: 'Conflict Road 1',
    }),
  })
  const order = await authed<any>(token, '/orders', {
    method: 'POST',
    body: JSON.stringify({
      serviceId,
      addressId: address.body.data.id,
      appointmentDate: '2026-06-02',
      appointmentTimeSlot: '11:00-13:00',
    }),
  })
  return order.body.data
}

async function runConflictContracts(token: string, staffId: number) {
  const cancelVsPay = await createPendingOrder(token)
  const pay = await authed<any>(token, `/orders/${cancelVsPay.id}/pay`, { method: 'POST' })
  const [cancelResult, payResult] = await Promise.all([
    authed<any>(token, `/orders/${cancelVsPay.id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ version: cancelVsPay.version }),
    }),
    authed<any>(token, '/payments/mock-success', {
      method: 'POST',
      body: JSON.stringify({ paymentNo: pay.body.data.paymentNo }),
    }),
  ])
  const cancelOk = cancelResult.response.status === 200
  const payOk = payResult.response.status === 200
  assert.equal(Number(cancelOk) + Number(payOk), 1)
  assert.ok(cancelResult.response.status === 200 || cancelResult.response.status === 409)
  assert.ok(payResult.response.status === 200 || payResult.response.status === 409)
  const cancelPayLogs = await prisma.paymentNotifyLog.findMany({
    where: { paymentNo: pay.body.data.paymentNo },
  })
  assert.ok(cancelPayLogs.length >= 1)

  const assignConflict = await createPendingOrder(token)
  const assignPay = await authed<any>(token, `/orders/${assignConflict.id}/pay`, { method: 'POST' })
  await authed<any>(token, '/payments/mock-success', {
    method: 'POST',
    body: JSON.stringify({ paymentNo: assignPay.body.data.paymentNo }),
  })
  const [assignA, assignB] = await Promise.all([
    authed<any>(token, `/admin/orders/${assignConflict.id}/assign`, {
      method: 'POST',
      headers: { 'X-Admin-Id': '1' },
      body: JSON.stringify({ staffId }),
    }),
    authed<any>(token, `/admin/orders/${assignConflict.id}/assign`, {
      method: 'POST',
      headers: { 'X-Admin-Id': '2' },
      body: JSON.stringify({ staffId }),
    }),
  ])
  assert.equal([assignA, assignB].filter(item => item.response.status === 200).length, 1)
  assert.equal([assignA, assignB].filter(item => item.response.status === 409).length, 1)

  const acceptRejectConflict = await createPendingOrder(token)
  const acceptPay = await authed<any>(token, `/orders/${acceptRejectConflict.id}/pay`, { method: 'POST' })
  await authed<any>(token, '/payments/mock-success', {
    method: 'POST',
    body: JSON.stringify({ paymentNo: acceptPay.body.data.paymentNo }),
  })
  await authed<any>(token, `/admin/orders/${acceptRejectConflict.id}/assign`, {
    method: 'POST',
    headers: { 'X-Admin-Id': '1' },
    body: JSON.stringify({ staffId }),
  })
  const [accept, reject] = await Promise.all([
    authed<any>(token, `/staff/orders/${acceptRejectConflict.id}/accept`, {
      method: 'POST',
      headers: { 'X-Staff-Id': String(staffId) },
    }),
    authed<any>(token, `/staff/orders/${acceptRejectConflict.id}/reject`, {
      method: 'POST',
      headers: { 'X-Staff-Id': String(staffId) },
      body: JSON.stringify({ reason: 'busy' }),
    }),
  ])
  assert.equal([accept, reject].filter(item => item.response.status === 200).length, 1)
  assert.equal([accept, reject].filter(item => item.response.status === 409).length, 1)
}

async function main() {
  process.env.HOST = '127.0.0.1'
  process.env.PORT = String(port)
  const app = await createConfiguredApp()
  await app.listen(port, '127.0.0.1')

  try {
    const login = await request<any>('/auth/mock-login', {
      method: 'POST',
      body: JSON.stringify({ phone: '13800001111' }),
    })
    assert.equal(login.response.status, 200)
    assert.equal(login.body.code, 0)
    assert.equal(typeof login.body.data.accessToken, 'string')
    assert.equal(typeof login.body.data.user.id, 'number')

    const token = login.body.data.accessToken
    const staffId = await ensureStaff()
    await runBasicContract(token)
    await runOrderMainFlow(token, staffId)
    await runConflictContracts(token, staffId)

    console.info('contract-test-ok')
  }
  finally {
    await app.close()
    await prisma.$disconnect()
  }
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
