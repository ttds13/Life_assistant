import { strict as assert } from 'node:assert'
import { PrismaClient } from '@prisma/client'
import { createConfiguredApp } from '../src/main'
import { hashAdminPassword } from '../src/admin-auth/admin-password'

const port = Number(process.env.CONTRACT_PORT || 3210)
const baseUrl = `http://127.0.0.1:${port}/api`
const prisma = new PrismaClient()
const CONTRACT_USER_PHONE = `138${String(Date.now()).slice(-8)}`

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

async function ensureAdmin() {
  const username = 'contract-admin'
  const password = 'ContractAdmin123'
  const passwordHash = await hashAdminPassword(password)
  await prisma.adminUser.upsert({
    where: { username },
    create: {
      username,
      passwordHash,
      name: 'Contract Admin',
      role: 'super_admin',
      status: 1,
    },
    update: {
      passwordHash,
      name: 'Contract Admin',
      role: 'super_admin',
      status: 1,
    },
  })
  return { username, password }
}

async function withOnlyAssignableStaff<T>(staffId: number, fn: () => Promise<T>): Promise<T> {
  const staff = await prisma.staff.findMany({
    where: { deletedAt: null },
    select: { id: true, status: true, workStatus: true },
  })

  try {
    await prisma.staff.updateMany({
      where: { deletedAt: null },
      data: { workStatus: 0 },
    })
    await prisma.staff.update({
      where: { id: BigInt(staffId) },
      data: { status: 1, workStatus: 1, deletedAt: null },
    })
    return await fn()
  }
  finally {
    await Promise.all(staff.map(item => prisma.staff.update({
      where: { id: item.id },
      data: {
        status: item.status,
        workStatus: item.workStatus,
      },
    })))
  }
}

async function withAllStaffUnavailable<T>(fn: () => Promise<T>): Promise<T> {
  const staff = await prisma.staff.findMany({
    where: { deletedAt: null },
    select: { id: true, workStatus: true },
  })

  try {
    await prisma.staff.updateMany({
      where: { deletedAt: null },
      data: { workStatus: 0 },
    })
    return await fn()
  }
  finally {
    await Promise.all(staff.map(item => prisma.staff.update({
      where: { id: item.id },
      data: { workStatus: item.workStatus },
    })))
  }
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

  const forbiddenAdmin = await authed<any>(token, '/admin/orders')
  assert.equal(forbiddenAdmin.response.status, 403)
}

async function runOrderMainFlow(token: string, adminToken: string, staffId: number, staffName: string) {
  await withOnlyAssignableStaff(staffId, async () => {
    const services = await request<{ items: any[] }>('/services?page=1&pageSize=1')
    const serviceId = services.body.data.items[0].id

    const address = await authed<any>(token, '/user/addresses', {
      method: 'POST',
      body: JSON.stringify({
        contactName: 'Contract User',
        contactPhone: CONTRACT_USER_PHONE,
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
    assert.equal(paid.body.data.order.status, 'dispatched')
    assert.equal(paid.body.data.order.staffId, staffId)
    assert.equal(paid.body.data.autoAssign.assigned, true)
    assert.equal(paid.body.data.autoAssign.staffId, staffId)

    const duplicatePaid = await authed<any>(token, '/payments/mock-success', {
      method: 'POST',
      body: JSON.stringify({ paymentNo: pay.body.data.paymentNo }),
    })
    assert.equal(duplicatePaid.response.status, 200)
    assert.equal(duplicatePaid.body.data.order.status, 'dispatched')
    const autoAssignmentCount = await prisma.orderAssignment.count({
      where: { orderId: BigInt(orderId), assignType: 'auto' },
    })
    assert.equal(autoAssignmentCount, 1)

    const staffProfile = await authed<any>(token, '/staff/profile', {
      headers: { 'X-Staff-Id': String(staffId) },
    })
    assert.equal(staffProfile.response.status, 200)
    assert.equal(staffProfile.body.data.staffId, staffId)
    assert.equal(staffProfile.body.data.staffName, staffName)

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
      'auto_assign',
      'staff_accept',
      'staff_on_the_way',
      'staff_start',
      'staff_complete',
      'user_confirm',
    ])
  })
}

async function runAddressContracts(token: string, adminToken: string, staffId: number, userId: number) {
  const first = await authed<any>(token, '/user/addresses', {
    method: 'POST',
    body: JSON.stringify({
      contactName: 'Address Contract A',
      contactPhone: CONTRACT_USER_PHONE,
      provinceName: 'Shanghai',
      cityName: 'Shanghai',
      districtName: 'Pudong',
      streetName: 'Contract Street',
      addressTitle: 'Contract Garden',
      detailAddress: 'Building 1 Unit 101',
      houseNumber: '101',
      latitude: 31.2304,
      longitude: 121.4737,
      poiId: 'contract-poi-a',
      mapProvider: 'tencent',
      isDefault: true,
    }),
  })
  assert.equal(first.response.status, 200)
  assert.equal(first.body.data.isDefault, true)
  assert.equal(first.body.data.addressType, 'service')
  assert.equal(first.body.data.formattedAddress.includes('Contract Garden'), true)

  const second = await authed<any>(token, '/user/addresses', {
    method: 'POST',
    body: JSON.stringify({
      contactName: 'Address Contract B',
      contactPhone: '13800001112',
      cityName: 'Shanghai',
      districtName: 'Minhang',
      detailAddress: 'Second Road 2',
      isDefault: true,
    }),
  })
  assert.equal(second.response.status, 200)
  assert.equal(second.body.data.isDefault, true)

  const firstReloaded = await authed<any>(token, `/user/addresses/${first.body.data.id}`)
  assert.equal(firstReloaded.response.status, 200)
  assert.equal(firstReloaded.body.data.isDefault, false)

  const updatedSecond = await authed<any>(token, `/user/addresses/${second.body.data.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      contactName: 'Address Contract B2',
      contactPhone: '13800001112',
      cityName: 'Shanghai',
      districtName: 'Minhang',
      detailAddress: 'Second Road 2 Updated',
    }),
  })
  assert.equal(updatedSecond.response.status, 200)
  assert.equal(updatedSecond.body.data.isDefault, true)

  const userList = await authed<any[]>(token, '/user/addresses')
  assert.equal(userList.response.status, 200)
  assert.ok(userList.body.data.some((item: any) => item.id === second.body.data.id && item.isDefault === true))

  const deleteDefault = await authed<any>(token, `/user/addresses/${second.body.data.id}`, { method: 'DELETE' })
  assert.equal(deleteDefault.response.status, 200)
  const firstAfterDelete = await authed<any>(token, `/user/addresses/${first.body.data.id}`)
  assert.equal(firstAfterDelete.response.status, 200)
  assert.equal(firstAfterDelete.body.data.isDefault, true)

  const staffHome = await authed<any>(token, '/staff/addresses', {
    method: 'POST',
    headers: { 'X-Staff-Id': String(staffId) },
    body: JSON.stringify({
      contactName: 'Staff Address Home',
      contactPhone: CONTRACT_USER_PHONE,
      cityName: 'Shanghai',
      districtName: 'Pudong',
      detailAddress: 'Staff Home 1',
      addressType: 'home',
      isDefault: true,
      latitude: 31.2201,
      longitude: 121.4802,
    }),
  })
  assert.equal(staffHome.response.status, 200)
  assert.equal(staffHome.body.data.addressType, 'home')
  assert.equal(staffHome.body.data.isDefault, true)

  const staffWork = await authed<any>(token, '/staff/addresses', {
    method: 'POST',
    headers: { 'X-Staff-Id': String(staffId) },
    body: JSON.stringify({
      contactName: 'Staff Address Work',
      contactPhone: CONTRACT_USER_PHONE,
      cityName: 'Shanghai',
      districtName: 'Huangpu',
      detailAddress: 'Staff Work 1',
      addressType: 'work',
      isDefault: true,
    }),
  })
  assert.equal(staffWork.response.status, 200)
  assert.equal(staffWork.body.data.addressType, 'work')
  assert.equal(staffWork.body.data.isDefault, true)

  const staffList = await authed<any[]>(token, '/staff/addresses', {
    headers: { 'X-Staff-Id': String(staffId) },
  })
  assert.equal(staffList.response.status, 200)
  assert.ok(staffList.body.data.some((item: any) => item.id === staffHome.body.data.id))
  assert.ok(staffList.body.data.some((item: any) => item.id === staffWork.body.data.id))

  const staffHomeDetail = await authed<any>(token, `/staff/addresses/${staffHome.body.data.id}`, {
    headers: { 'X-Staff-Id': String(staffId) },
  })
  assert.equal(staffHomeDetail.response.status, 200)
  assert.equal(staffHomeDetail.body.data.addressType, 'home')

  const updatedStaffWork = await authed<any>(token, `/staff/addresses/${staffWork.body.data.id}`, {
    method: 'PUT',
    headers: { 'X-Staff-Id': String(staffId) },
    body: JSON.stringify({
      contactName: 'Staff Address Work Updated',
      contactPhone: CONTRACT_USER_PHONE,
      cityName: 'Shanghai',
      districtName: 'Huangpu',
      detailAddress: 'Staff Work Updated',
      addressType: 'work',
    }),
  })
  assert.equal(updatedStaffWork.response.status, 200)
  assert.equal(updatedStaffWork.body.data.isDefault, true)

  const adminUserAddress = await authed<any>(adminToken, `/admin/users/${userId}/addresses`, {
    method: 'POST',
    body: JSON.stringify({
      contactName: 'Admin User Address',
      contactPhone: '13800001113',
      cityName: 'Shanghai',
      districtName: 'Xuhui',
      detailAddress: 'Admin User Road 3',
      isDefault: true,
    }),
  })
  assert.equal(adminUserAddress.response.status, 200)
  assert.equal(adminUserAddress.body.data.ownerType, 'user')

  const adminUserOwnerId = adminUserAddress.body.data.ownerId
  const adminUserList = await authed<any>(adminToken, `/admin/users/${adminUserOwnerId}/addresses`)
  assert.equal(adminUserList.response.status, 200)
  assert.ok(adminUserList.body.data.items.some((item: any) => item.id === adminUserAddress.body.data.id))

  const adminUserDetail = await authed<any>(adminToken, `/admin/users/${adminUserOwnerId}/addresses/${adminUserAddress.body.data.id}`)
  assert.equal(adminUserDetail.response.status, 200)
  assert.equal(adminUserDetail.body.data.ownerId, adminUserOwnerId)

  const adminUserUpdated = await authed<any>(adminToken, `/admin/users/${adminUserOwnerId}/addresses/${adminUserAddress.body.data.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      contactName: 'Admin User Address Updated',
      contactPhone: '13800001113',
      cityName: 'Shanghai',
      districtName: 'Xuhui',
      detailAddress: 'Admin User Road 3 Updated',
      isDefault: true,
    }),
  })
  assert.equal(adminUserUpdated.response.status, 200)
  assert.equal(adminUserUpdated.body.data.contactName, 'Admin User Address Updated')

  const adminStaffAddress = await authed<any>(adminToken, `/admin/staff/${staffId}/addresses`, {
    method: 'POST',
    body: JSON.stringify({
      contactName: 'Admin Staff Address',
      contactPhone: CONTRACT_USER_PHONE,
      cityName: 'Shanghai',
      districtName: 'Jingan',
      detailAddress: 'Admin Staff Road 5',
      addressType: 'home',
      isDefault: true,
    }),
  })
  assert.equal(adminStaffAddress.response.status, 200)
  assert.equal(adminStaffAddress.body.data.ownerType, 'staff')
  assert.equal(adminStaffAddress.body.data.ownerId, staffId)

  const adminStaffList = await authed<any>(adminToken, `/admin/staff/${staffId}/addresses`)
  assert.equal(adminStaffList.response.status, 200)
  assert.ok(adminStaffList.body.data.items.some((item: any) => item.id === adminStaffAddress.body.data.id))

  const adminGenericList = await authed<any>(adminToken, `/admin/addresses?ownerType=staff&ownerId=${staffId}`)
  assert.equal(adminGenericList.response.status, 200)
  assert.ok(adminGenericList.body.data.items.some((item: any) => item.id === adminStaffAddress.body.data.id))

  const deleteAdminStaff = await authed<any>(adminToken, `/admin/staff/${staffId}/addresses/${adminStaffAddress.body.data.id}`, { method: 'DELETE' })
  assert.equal(deleteAdminStaff.response.status, 200)

  const deleteAdminUser = await authed<any>(adminToken, `/admin/users/${adminUserOwnerId}/addresses/${adminUserAddress.body.data.id}`, { method: 'DELETE' })
  assert.equal(deleteAdminUser.response.status, 200)

  const deleteStaffWork = await authed<any>(token, `/staff/addresses/${staffWork.body.data.id}`, {
    method: 'DELETE',
    headers: { 'X-Staff-Id': String(staffId) },
  })
  assert.equal(deleteStaffWork.response.status, 200)

  const map = await request<{ provider: string }>('/maps/reverse-geocode?latitude=31.2304&longitude=121.4737')
  assert.ok(map.response.status === 200 || map.response.status === 400)
  if (map.response.status === 400) {
    assert.equal(map.body.code, 10002)
  }
  else {
    assert.equal(map.body.code, 0)
    assert.equal(typeof map.body.data.provider, 'string')
  }

  const addressAudit = await prisma.auditLog.findFirst({
    where: {
      module: 'address',
      action: { in: ['user-address:create', 'staff-address:create'] },
    },
  })
  assert.ok(addressAudit)
}

async function createPendingOrder(token: string) {
  const services = await request<{ items: any[] }>('/services?page=1&pageSize=1')
  const serviceId = services.body.data.items[0].id
  const address = await authed<any>(token, '/user/addresses', {
    method: 'POST',
    body: JSON.stringify({
      contactName: 'Conflict User',
      contactPhone: CONTRACT_USER_PHONE,
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

async function createPaidPendingDispatchOrder(token: string) {
  return withAllStaffUnavailable(async () => {
    const order = await createPendingOrder(token)
    const pay = await authed<any>(token, `/orders/${order.id}/pay`, { method: 'POST' })
    assert.equal(pay.response.status, 200)
    const paid = await authed<any>(token, '/payments/mock-success', {
      method: 'POST',
      body: JSON.stringify({ paymentNo: pay.body.data.paymentNo }),
    })
    assert.equal(paid.response.status, 200)
    assert.equal(paid.body.data.order.status, 'pending_dispatch')
    assert.equal(paid.body.data.autoAssign.assigned, false)
    assert.equal(paid.body.data.autoAssign.reason, 'no_available_staff')
    return paid.body.data.order
  })
}

async function completeAcceptedStaffOrder(token: string, orderId: number, staffId: number, version: number) {
  const onTheWay = await authed<any>(token, `/staff/orders/${orderId}/on-the-way`, {
    method: 'POST',
    headers: { 'X-Staff-Id': String(staffId) },
    body: JSON.stringify({ version }),
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
      remark: 'dispatch flow finished',
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
  return confirmed.body.data
}

async function runDispatchAddContracts(token: string, adminToken: string, staffId: number) {
  const otherStaff = await prisma.staff.findMany({
    where: { id: { not: BigInt(staffId) }, deletedAt: null },
    select: { id: true, workStatus: true },
  })

  try {
    await prisma.staff.updateMany({
      where: { id: { not: BigInt(staffId) }, deletedAt: null },
      data: { workStatus: 0 },
    })
    await prisma.staff.update({
      where: { id: BigInt(staffId) },
      data: { status: 1, workStatus: 1, deletedAt: null },
    })

    const autoRejectOrder = await createPaidPendingDispatchOrder(token)
    const autoRejected = await authed<any>(adminToken, `/admin/orders/${autoRejectOrder.id}/auto-assign`, {
      method: 'POST',
      body: JSON.stringify({ remark: 'contract auto assign reject path' }),
    })
    assert.equal(autoRejected.response.status, 200)
    assert.equal(autoRejected.body.data.status, 'dispatched')
    assert.equal(autoRejected.body.data.staffId, staffId)

    const rejected = await authed<any>(token, `/staff/orders/${autoRejectOrder.id}/reject`, {
      method: 'POST',
      headers: { 'X-Staff-Id': String(staffId) },
      body: JSON.stringify({ version: autoRejected.body.data.version, reason: 'contract reject' }),
    })
    assert.equal(rejected.response.status, 200)
    assert.equal(rejected.body.data.status, 'pending_dispatch')
    assert.equal(rejected.body.data.staffId, null)

    const rejectedAssignment = await prisma.orderAssignment.findFirst({
      where: { orderId: BigInt(autoRejectOrder.id), staffId: BigInt(staffId) },
      orderBy: { id: 'desc' },
    })
    assert.equal(rejectedAssignment?.assignType, 'auto')
    assert.equal(rejectedAssignment?.assignStatus, 'rejected')

    const autoAcceptOrder = await createPaidPendingDispatchOrder(token)
    const autoAssigned = await authed<any>(adminToken, `/admin/orders/${autoAcceptOrder.id}/auto-assign`, {
      method: 'POST',
      body: JSON.stringify({ remark: 'contract auto assign accept path' }),
    })
    assert.equal(autoAssigned.response.status, 200)
    assert.equal(autoAssigned.body.data.status, 'dispatched')
    assert.equal(autoAssigned.body.data.staffId, staffId)

    const accepted = await authed<any>(token, `/staff/orders/${autoAcceptOrder.id}/accept`, {
      method: 'POST',
      headers: { 'X-Staff-Id': String(staffId) },
    })
    assert.equal(accepted.response.status, 200)
    assert.equal(accepted.body.data.status, 'accepted')

    const autoAssignment = await prisma.orderAssignment.findFirst({
      where: { orderId: BigInt(autoAcceptOrder.id), staffId: BigInt(staffId) },
      orderBy: { id: 'desc' },
    })
    assert.equal(autoAssignment?.assignType, 'auto')
    assert.equal(autoAssignment?.assignStatus, 'accepted')

    await completeAcceptedStaffOrder(token, autoAcceptOrder.id, staffId, accepted.body.data.version)

    const claimOrder = await createPaidPendingDispatchOrder(token)
    const available = await authed<any>(token, '/staff/available-orders?page=1&pageSize=20', {
      headers: { 'X-Staff-Id': String(staffId) },
    })
    assert.equal(available.response.status, 200)
    assert.ok(available.body.data.items.some((item: any) => item.id === claimOrder.id))

    const availableDetail = await authed<any>(token, `/staff/available-orders/${claimOrder.id}`, {
      headers: { 'X-Staff-Id': String(staffId) },
    })
    assert.equal(availableDetail.response.status, 200)
    assert.equal(availableDetail.body.data.status, 'pending_dispatch')

    const claimed = await authed<any>(token, `/staff/orders/${claimOrder.id}/claim`, {
      method: 'POST',
      headers: { 'X-Staff-Id': String(staffId) },
      body: JSON.stringify({ version: availableDetail.body.data.version }),
    })
    assert.equal(claimed.response.status, 200)
    assert.equal(claimed.body.data.status, 'accepted')
    assert.equal(claimed.body.data.staffId, staffId)

    const claimAssignment = await prisma.orderAssignment.findFirst({
      where: { orderId: BigInt(claimOrder.id), staffId: BigInt(staffId) },
      orderBy: { id: 'desc' },
    })
    assert.equal(claimAssignment?.assignType, 'claim')
    assert.equal(claimAssignment?.assignStatus, 'accepted')
    assert.ok(claimAssignment?.acceptedAt)

    const claimLogs = await prisma.orderStatusLog.findMany({
      where: { orderId: BigInt(claimOrder.id) },
      orderBy: { createdAt: 'asc' },
    })
    assert.ok(claimLogs.some(log => log.action === 'staff_claim'))

    await completeAcceptedStaffOrder(token, claimOrder.id, staffId, claimed.body.data.version)
  }
  finally {
    await Promise.all(otherStaff.map(staff => prisma.staff.update({
      where: { id: staff.id },
      data: { workStatus: staff.workStatus },
    })))
  }
}

async function runConflictContracts(token: string, adminToken: string, staffId: number) {
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

  const assignConflict = await createPaidPendingDispatchOrder(token)
  const [assignA, assignB] = await Promise.all([
    authed<any>(adminToken, `/admin/orders/${assignConflict.id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ staffId }),
    }),
    authed<any>(adminToken, `/admin/orders/${assignConflict.id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ staffId }),
    }),
  ])
  assert.equal([assignA, assignB].filter(item => item.response.status === 200).length, 1)
  assert.equal([assignA, assignB].filter(item => item.response.status === 409).length, 1)

  const acceptRejectConflict = await createPaidPendingDispatchOrder(token)
  await authed<any>(adminToken, `/admin/orders/${acceptRejectConflict.id}/assign`, {
    method: 'POST',
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

async function runAdminOrderContracts(token: string, adminToken: string, staffId: number) {
  const pending = await createPaidPendingDispatchOrder(token)

  const pendingList = await authed<any>(adminToken, '/admin/orders?status=pending_dispatch&page=1&pageSize=10')
  assert.equal(pendingList.response.status, 200)
  assert.ok(Array.isArray(pendingList.body.data.items))
  assert.equal(pendingList.body.data.page, 1)
  assert.equal(pendingList.body.data.pageSize, 10)
  assert.ok(pendingList.body.data.items.some((item: any) => item.id === String(pending.id)))

  const keywordList = await authed<any>(adminToken, `/admin/orders?keyword=${pending.orderNo}`)
  assert.equal(keywordList.response.status, 200)
  assert.ok(keywordList.body.data.items.some((item: any) => item.orderNo === pending.orderNo))

  const detail = await authed<any>(adminToken, `/admin/orders/${pending.id}`)
  assert.equal(detail.response.status, 200)
  assert.equal(detail.body.data.id, String(pending.id))
  assert.ok(Array.isArray(detail.body.data.statusLogs))

  const options = await authed<any>(adminToken, '/admin/staff/options')
  assert.equal(options.response.status, 200)
  assert.ok(options.body.data.some((item: any) => Number(item.id) === staffId))

  const assigned = await authed<any>(adminToken, `/admin/orders/${pending.id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ staffId, remark: 'admin order contract assign' }),
  })
  assert.equal(assigned.response.status, 200)
  assert.equal(assigned.body.data.status, 'dispatched')
  assert.equal(assigned.body.data.staffId, staffId)

  const assignLog = await prisma.orderStatusLog.findFirst({
    where: { orderId: BigInt(pending.id), action: 'admin_assign' },
  })
  assert.ok(assignLog)

  const assignAudit = await prisma.auditLog.findFirst({
    where: {
      module: 'order',
      action: 'order:assign',
      targetId: BigInt(pending.id),
    },
  })
  assert.ok(assignAudit)

  const remark = await authed<any>(adminToken, `/admin/orders/${pending.id}/remark`, {
    method: 'PUT',
    body: JSON.stringify({ remark: 'admin checked remark' }),
  })
  assert.equal(remark.response.status, 200)
  assert.equal(remark.body.data.adminRemark, 'admin checked remark')
  assert.equal(remark.body.data.status, 'dispatched')

  const remarkAudit = await prisma.auditLog.findFirst({
    where: {
      module: 'order',
      action: 'order:remark:update',
      targetId: BigInt(pending.id),
    },
  })
  assert.ok(remarkAudit)

  const editable = await createPaidPendingDispatchOrder(token)
  const updated = await authed<any>(adminToken, `/admin/orders/${editable.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      status: 'completed',
      staffId,
      appointmentStartTime: '2026-06-05 10:00:00',
      appointmentEndTime: '2026-06-05 12:00:00',
      createdAt: '2026-06-05 09:30:00',
      completedAt: '2026-06-05 12:30:00',
      payableAmount: 123.45,
      paidAmount: 123.45,
      remark: 'contract updated user remark',
      adminRemark: 'contract updated admin remark',
    }),
  })
  assert.equal(updated.response.status, 200)
  assert.equal(updated.body.data.status, 'completed')
  assert.equal(updated.body.data.staffId, staffId)
  assert.equal(updated.body.data.payableAmount, 123.45)
  assert.equal(updated.body.data.paidAmount, 123.45)
  assert.equal(updated.body.data.remark, 'contract updated user remark')
  assert.equal(updated.body.data.adminRemark, 'contract updated admin remark')
  assert.ok(updated.body.data.createdAt)
  assert.ok(updated.body.data.completedAt)

  const updateAudit = await prisma.auditLog.findFirst({
    where: {
      module: 'order',
      action: 'order:update',
      targetId: BigInt(editable.id),
    },
  })
  assert.ok(updateAudit)

  const deleted = await authed<any>(adminToken, `/admin/orders/${editable.id}`, { method: 'DELETE' })
  assert.equal(deleted.response.status, 200)
  assert.equal(deleted.body.data.deleted, true)
  assert.equal(deleted.body.data.id, String(editable.id))

  const missingDeleted = await authed<any>(adminToken, `/admin/orders/${editable.id}`)
  assert.equal(missingDeleted.response.status, 404)

  const deletedOrder = await prisma.order.findUnique({ where: { id: BigInt(editable.id) } })
  assert.equal(deletedOrder, null)
  assert.equal(await prisma.payment.count({ where: { orderId: BigInt(editable.id) } }), 0)
  assert.equal(await prisma.orderStatusLog.count({ where: { orderId: BigInt(editable.id) } }), 0)
  assert.equal(await prisma.orderAssignment.count({ where: { orderId: BigInt(editable.id) } }), 0)

  const deleteAudit = await prisma.auditLog.findFirst({
    where: {
      module: 'order',
      action: 'order:delete',
      targetId: BigInt(editable.id),
    },
  })
  assert.ok(deleteAudit)
}

async function main() {
  process.env.HOST = '127.0.0.1'
  process.env.PORT = String(port)
  const app = await createConfiguredApp()
  await app.listen(port, '127.0.0.1')

  try {
    const login = await request<any>('/auth/mock-login', {
      method: 'POST',
      body: JSON.stringify({ phone: CONTRACT_USER_PHONE }),
    })
    assert.equal(login.response.status, 200)
    assert.equal(login.body.code, 0)
    assert.equal(typeof login.body.data.accessToken, 'string')
    assert.equal(typeof login.body.data.user.id, 'number')

    const token = login.body.data.accessToken
    const adminAccount = await ensureAdmin()
    const adminLogin = await request<any>('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify(adminAccount),
    })
    assert.equal(adminLogin.response.status, 200)
    assert.equal(typeof adminLogin.body.data.accessToken, 'string')
    const adminToken = adminLogin.body.data.accessToken
    const userId = login.body.data.user.id

    const staffRole = await authed<any>(adminToken, `/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ roleType: 'staff' }),
    })
    assert.equal(staffRole.response.status, 200)
    assert.equal(staffRole.body.data.roleType, 'staff')

    const staffSession = await authed<any>(token, '/auth/dev-staff-session', { method: 'POST' })
    assert.equal(staffSession.response.status, 200)
    assert.equal(staffSession.body.data.userId, userId)
    const staffId = staffSession.body.data.staffId
    const staffName = staffSession.body.data.staffName
    await runBasicContract(token)
    await runAddressContracts(token, adminToken, staffId, userId)
    await runOrderMainFlow(token, adminToken, staffId, staffName)
    await runDispatchAddContracts(token, adminToken, staffId)
    await runConflictContracts(token, adminToken, staffId)
    await runAdminOrderContracts(token, adminToken, staffId)

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
