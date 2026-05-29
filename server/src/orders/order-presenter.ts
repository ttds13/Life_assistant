import { Prisma } from '@prisma/client'
import type { OrderDetailRecord } from './orders.repository'

type JsonRecord = Record<string, unknown>

function decimalToNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (value instanceof Prisma.Decimal) return value.toNumber()
  return Number(value)
}

function jsonRecord(value: unknown): JsonRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonRecord
  }
  return {}
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatAppointment(order: OrderDetailRecord) {
  return `${formatDate(order.appointmentStartTime)}-${formatTime(order.appointmentEndTime)}`
}

function addressText(snapshot: JsonRecord) {
  return [
    stringValue(snapshot.city),
    stringValue(snapshot.district),
    stringValue(snapshot.address),
  ].filter(Boolean).join('')
}

export function presentPricePreview(amount: number) {
  return {
    serviceAmount: amount,
    discountAmount: 0,
    payableAmount: amount,
    items: [
      { label: 'Service amount', amount },
      { label: 'Discount', amount: 0, type: 'discount' as const },
    ],
  }
}

export function presentUserOrder(order: OrderDetailRecord) {
  const serviceSnapshot = jsonRecord(order.serviceSnapshot)
  const addressSnapshot = jsonRecord(order.addressSnapshot)
  const totalAmount = decimalToNumber(order.originalAmount)
  const payableAmount = decimalToNumber(order.payableAmount)

  return {
    id: Number(order.id),
    orderNo: order.orderNo,
    status: order.status,
    serviceName: stringValue(serviceSnapshot.name, order.service?.name || ''),
    serviceImage: stringValue(serviceSnapshot.coverImage, order.service?.coverImage || ''),
    appointmentTime: formatAppointment(order),
    addressText: addressText(addressSnapshot),
    totalAmount,
    payableAmount,
    remark: order.remark || '',
    staffName: order.staff?.name || '',
    staffPhone: order.staff?.phone || '',
    staffRating: order.staff ? decimalToNumber(order.staff.rating) : undefined,
    createdAt: order.createdAt.toISOString(),
  }
}

export function presentOrderDetail(order: OrderDetailRecord) {
  const base = presentUserOrder(order)
  const serviceSnapshot = jsonRecord(order.serviceSnapshot)
  const addressSnapshot = jsonRecord(order.addressSnapshot)
  const discountAmount = decimalToNumber(order.discountAmount)
  const payment = order.payments[0]

  return {
    ...base,
    version: order.version,
    service: {
      id: Number(order.serviceId),
      categoryId: numberValue(serviceSnapshot.categoryId, order.service ? Number(order.service.categoryId) : 0),
      name: stringValue(serviceSnapshot.name, order.service?.name || ''),
      description: stringValue(serviceSnapshot.description, order.service?.description || ''),
      coverImage: stringValue(serviceSnapshot.coverImage, order.service?.coverImage || ''),
      basePrice: numberValue(serviceSnapshot.basePrice, decimalToNumber(order.originalAmount)),
      priceUnit: stringValue(serviceSnapshot.priceUnit, order.service?.priceUnit || ''),
      status: numberValue(serviceSnapshot.status, order.service?.status || 1),
      sortOrder: numberValue(serviceSnapshot.sortOrder, order.service?.sortOrder || 0),
    },
    address: {
      id: numberValue(addressSnapshot.id),
      contactName: stringValue(addressSnapshot.contactName),
      contactPhone: stringValue(addressSnapshot.contactPhone),
      cityName: stringValue(addressSnapshot.city),
      districtName: stringValue(addressSnapshot.district),
      detailAddress: stringValue(addressSnapshot.address),
      houseNumber: '',
      isDefault: false,
      latitude: addressSnapshot.latitude ?? null,
      longitude: addressSnapshot.longitude ?? null,
    },
    paymentMethod: payment ? payment.channel : undefined,
    statusLogs: order.statusLogs.length
      ? order.statusLogs.map(log => ({
          label: log.action || log.toStatus,
          time: log.createdAt.toISOString(),
          active: true,
        }))
      : [{
          label: order.status,
          time: order.createdAt.toISOString(),
          active: true,
        }],
    amountItems: [
      { label: 'Service amount', amount: decimalToNumber(order.originalAmount) },
      { label: 'Discount', amount: discountAmount, type: 'discount' as const },
    ],
    servicePhotos: order.photos.map(photo => photo.url),
  }
}
