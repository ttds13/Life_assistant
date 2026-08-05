import { PrismaClient } from '@prisma/client'
import { sign } from 'jsonwebtoken'

const prisma = new PrismaClient()
const baseUrl = process.env.DAY54_SMOKE_BASE_URL || 'http://127.0.0.1:3100/api'
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-key-change-in-production'
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`

interface ApiResponse<T> {
  code: number
  message?: string
  data: T
}

interface SlotItem {
  timeSlot: string
  available: boolean
}

interface SlotResponse {
  date: string
  items: SlotItem[]
}

interface LockItem {
  id: string
  status: string
}

let adminId: bigint | null = null
let userId: bigint | null = null
let addressId: bigint | null = null
let lockIds: bigint[] = []

function tomorrowText() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

async function request<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const body = await response.json() as ApiResponse<T>
  return { status: response.status, body }
}

function unwrap<T>(result: { status: number, body: ApiResponse<T> }, label: string) {
  if (result.status !== 200 || result.body.code !== 0) {
    throw new Error(`${label}: ${result.body.message || result.status}`)
  }
  return result.body.data
}

function slotAvailable(data: SlotResponse, timeSlot: string) {
  return data.items.find(item => item.timeSlot === timeSlot)?.available
}

async function main() {
  const lockDate = tomorrowText()
  const [admin, user, service] = await Promise.all([
    prisma.adminUser.create({
      data: {
        username: `day54_smoke_${suffix}`,
        passwordHash: 'day54-smoke',
        name: 'Day54 Smoke',
        role: 'super_admin',
        status: 1,
      },
    }),
    prisma.user.create({
      data: {
        openid: `day54_smoke_${suffix}`,
        phone: `139${String(suffix).slice(-8).padStart(8, '0')}`,
        nickname: 'Day54 Smoke',
        source: 'miniapp',
        status: 1,
      },
    }),
    prisma.service.findFirst({ where: { status: 1, deletedAt: null }, orderBy: { id: 'asc' } }),
  ])
  if (!service) throw new Error('no active service for Day54 smoke')
  adminId = admin.id
  userId = user.id
  const address = await prisma.address.create({
    data: {
      ownerType: 'user',
      ownerId: user.id,
      addressType: 'service',
      contactName: 'Day54 Smoke',
      contactPhone: user.phone || '13900000000',
      country: 'China',
      province: 'Guangdong',
      city: 'Shenzhen',
      district: 'Nanshan',
      street: 'Keji Road',
      addressTitle: 'Smoke Location',
      detailAddress: 'Building 1 Room 101',
      formattedAddress: 'Smoke Address',
      source: 'manual',
      status: 1,
      isDefault: false,
    },
  })
  addressId = address.id

  const adminToken = sign({
    userId: Number(admin.id),
    adminId: Number(admin.id),
    role: 'super_admin',
    userType: 'admin',
  }, jwtSecret)
  const userToken = sign({ userId: Number(user.id), role: 'user', userType: 'user' }, jwtSecret)
  const adminHeaders = { authorization: `Bearer ${adminToken}` }
  const userHeaders = { authorization: `Bearer ${userToken}` }

  const initial = unwrap(await request<SlotResponse>(`/appointments/slots?date=${lockDate}`), 'initial slots')
  if (slotAvailable(initial, '10:00-12:00') !== true) throw new Error('expected initial slot to be available')

  const created = unwrap(await request<{ items: LockItem[] }>('/admin/appointment-time-locks', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ lockDate, timeSlots: ['10:00-12:00'], reason: 'Day54 smoke lock' }),
  }), 'create lock')
  lockIds = created.items.map(item => BigInt(item.id))

  const locked = unwrap(await request<SlotResponse>(`/appointments/slots?date=${lockDate}`), 'locked slots')
  if (slotAvailable(locked, '10:00-12:00') !== false) throw new Error('locked slot is still available')

  const preview = await request<unknown>(
    `/orders/price-preview?serviceId=${service.id}&appointmentDate=${lockDate}&appointmentTimeSlot=10%3A00-12%3A00`,
    { headers: userHeaders },
  )
  if (preview.status !== 409) throw new Error('price preview did not reject locked slot')

  const order = await request<unknown>('/orders', {
    method: 'POST',
    headers: userHeaders,
    body: JSON.stringify({
      serviceId: Number(service.id),
      appointmentDate: lockDate,
      appointmentTimeSlot: '10:00-12:00',
      addressId: Number(address.id),
    }),
  })
  if (order.status !== 409) throw new Error('order creation did not reject locked slot')

  unwrap(await request(`/admin/appointment-time-locks/${lockIds[0]}`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'inactive' }),
  }), 'deactivate lock')
  const released = unwrap(await request<SlotResponse>(`/appointments/slots?date=${lockDate}`), 'released slots')
  if (slotAvailable(released, '10:00-12:00') !== true) throw new Error('inactive lock still blocks slot')

  unwrap(await request(`/admin/appointment-time-locks/${lockIds[0]}`, {
    method: 'DELETE',
    headers: adminHeaders,
  }), 'delete lock')
  lockIds = []

  console.log(JSON.stringify({
    adminCrud: true,
    publicSlotFiltering: true,
    pricePreviewBlocked: true,
    createOrderBlocked: true,
    inactiveRestoresAvailability: true,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    if (lockIds.length) await prisma.appointmentTimeLock.deleteMany({ where: { id: { in: lockIds } } })
    if (adminId) await prisma.auditLog.deleteMany({ where: { operatorType: 'admin', operatorId: adminId } })
    if (addressId) await prisma.address.deleteMany({ where: { id: addressId } })
    if (userId) await prisma.user.deleteMany({ where: { id: userId } })
    if (adminId) await prisma.adminUser.deleteMany({ where: { id: adminId } })
    await prisma.$disconnect()
  })
