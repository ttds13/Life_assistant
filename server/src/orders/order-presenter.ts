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
  const formattedAddress = stringValue(snapshot.formattedAddress)
  if (formattedAddress) return formattedAddress
  return [
    stringValue(snapshot.cityName, stringValue(snapshot.city)),
    stringValue(snapshot.districtName, stringValue(snapshot.district)),
    stringValue(snapshot.detailAddress, stringValue(snapshot.address)),
    stringValue(snapshot.houseNumber),
  ].filter(Boolean).join('')
}

export function presentPricePreview(amount: number, options?: { consultationRequired?: boolean, cardType?: string }) {
  return {
    serviceAmount: amount,
    discountAmount: 0,
    payableAmount: amount,
    consultationRequired: options?.consultationRequired || false,
    cardType: options?.cardType || '',
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
    version: order.version,
    orderType: order.orderType,
    staffId: order.staffId ? Number(order.staffId) : null,
    memberCardId: order.memberCardId ? Number(order.memberCardId) : null,
    memberCardConsumeUnits: order.memberCardConsumeUnits,
    purchaseCardId: order.purchaseCardId ? Number(order.purchaseCardId) : null,
    grantedUserMemberCardId: order.grantedUserMemberCardId ? Number(order.grantedUserMemberCardId) : null,
    serviceCode: stringValue(serviceSnapshot.code, order.service?.code || ''),
    serviceName: stringValue(serviceSnapshot.name, order.service?.name || ''),
    serviceImage: stringValue(serviceSnapshot.coverImage, order.service?.coverImage || ''),
    appointmentStartTime: order.appointmentStartTime.toISOString(),
    appointmentEndTime: order.appointmentEndTime.toISOString(),
    appointmentTime: formatAppointment(order),
    addressText: addressText(addressSnapshot),
    totalAmount,
    payableAmount,
    remark: order.remark || '',
    staffName: order.staff?.name || '',
    staffPhone: order.staff?.phone || '',
    staffRating: order.staff ? decimalToNumber(order.staff.rating) : undefined,
    createdAt: order.createdAt.toISOString(),
    completedAt: order.completedAt?.toISOString() || null,
  }
}

function presentStatusLog(log: OrderDetailRecord['statusLogs'][number]) {
  return {
    id: Number(log.id),
    title: log.action || log.toStatus,
    label: log.action || log.toStatus,
    action: log.action || '',
    fromStatus: log.fromStatus,
    toStatus: log.toStatus,
    operatorType: log.operatorType,
    operatorId: Number(log.operatorId),
    operator: `${log.operatorType}#${Number(log.operatorId)}`,
    description: log.remark || `${log.fromStatus || 'new'} -> ${log.toStatus}`,
    remark: log.remark || '',
    detail: log.detail || null,
    time: log.createdAt.toISOString(),
    active: true,
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
      code: stringValue(serviceSnapshot.code, order.service?.code || ''),
      categoryId: numberValue(serviceSnapshot.categoryId, order.service ? Number(order.service.categoryId) : 0),
      name: stringValue(serviceSnapshot.name, order.service?.name || ''),
      description: stringValue(serviceSnapshot.description, order.service?.description || ''),
      coverImage: stringValue(serviceSnapshot.coverImage, order.service?.coverImage || ''),
      basePrice: numberValue(serviceSnapshot.basePrice, decimalToNumber(order.originalAmount)),
      priceUnit: stringValue(serviceSnapshot.priceUnit, order.service?.priceUnit || ''),
      durationMinutes: numberValue(serviceSnapshot.durationMinutes, order.service?.durationMinutes || 0),
      cardType: stringValue(serviceSnapshot.cardType, order.service?.cardType || ''),
      consumeUnit: numberValue(serviceSnapshot.consumeUnit, order.service?.consumeUnit || 0),
      consultationRequired: Boolean(serviceSnapshot.consultationRequired || order.service?.consultationRequired),
      status: numberValue(serviceSnapshot.status, order.service?.status || 1),
      sortOrder: numberValue(serviceSnapshot.sortOrder, order.service?.sortOrder || 0),
    },
    address: {
      id: numberValue(addressSnapshot.addressId, numberValue(addressSnapshot.id)),
      contactName: stringValue(addressSnapshot.contactName),
      contactPhone: stringValue(addressSnapshot.contactPhone),
      addressType: stringValue(addressSnapshot.addressType, 'service'),
      provinceName: stringValue(addressSnapshot.provinceName, stringValue(addressSnapshot.province)),
      cityName: stringValue(addressSnapshot.cityName, stringValue(addressSnapshot.city)),
      districtName: stringValue(addressSnapshot.districtName, stringValue(addressSnapshot.district)),
      streetName: stringValue(addressSnapshot.streetName),
      addressTitle: stringValue(addressSnapshot.addressTitle),
      detailAddress: stringValue(addressSnapshot.detailAddress, stringValue(addressSnapshot.address)),
      houseNumber: stringValue(addressSnapshot.houseNumber),
      formattedAddress: stringValue(addressSnapshot.formattedAddress, addressText(addressSnapshot)),
      isDefault: false,
      latitude: addressSnapshot.latitude ?? null,
      longitude: addressSnapshot.longitude ?? null,
      coordinateType: stringValue(addressSnapshot.coordinateType),
      poiId: stringValue(addressSnapshot.poiId),
      mapProvider: stringValue(addressSnapshot.mapProvider),
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

export function presentAdminOrderListItem(order: OrderDetailRecord) {
  const base = presentUserOrder(order)
  const payment = order.payments[0]

  return {
    ...base,
    id: String(order.id),
    userId: Number(order.userId),
    userName: order.user?.nickname || order.addressSnapshot && stringValue(jsonRecord(order.addressSnapshot).contactName) || '用户',
    userPhone: order.user?.phone || stringValue(jsonRecord(order.addressSnapshot).contactPhone),
    staffId: order.staffId ? Number(order.staffId) : null,
    paidAmount: decimalToNumber(order.paidAmount),
    originalAmount: decimalToNumber(order.originalAmount),
    discountAmount: decimalToNumber(order.discountAmount),
    paymentStatus: payment?.status || '',
    source: order.source,
    adminRemark: order.adminRemark || '',
    cityCode: order.cityCode || '',
    paidAt: order.paidAt?.toISOString() || null,
    cancelledAt: order.cancelledAt?.toISOString() || null,
    cancelReason: order.cancelReason || '',
    updatedAt: order.updatedAt.toISOString(),
  }
}

export function presentAdminOrderDetail(order: OrderDetailRecord) {
  const base = presentAdminOrderListItem(order)
  const detail = presentOrderDetail(order)
  const serviceSnapshot = jsonRecord(order.serviceSnapshot)

  return {
    ...detail,
    ...base,
    serviceSpec: stringValue(serviceSnapshot.priceUnit, order.service?.priceUnit || ''),
    statusLogs: order.statusLogs.map(presentStatusLog),
    photos: order.photos.map(photo => photo.url),
    assignments: order.assignments.map(assignment => ({
      id: Number(assignment.id),
      staffId: Number(assignment.staffId),
      assignType: assignment.assignType,
      assignStatus: assignment.assignStatus,
      assignedBy: Number(assignment.assignedBy),
      rejectReason: assignment.rejectReason || '',
      assignedAt: assignment.assignedAt.toISOString(),
      acceptedAt: assignment.acceptedAt?.toISOString() || null,
      rejectedAt: assignment.rejectedAt?.toISOString() || null,
    })),
  }
}

export function presentStaffOption(staff: {
  id: bigint
  name: string
  phone: string
  workStatus: number
  rating: Prisma.Decimal
  cityCode: string | null
}) {
  const statusText: Record<number, string> = {
    0: '离线',
    1: '在线',
    2: '忙碌',
  }

  return {
    value: String(staff.id),
    id: Number(staff.id),
    label: staff.name,
    name: staff.name,
    phone: staff.phone,
    workStatus: statusText[staff.workStatus] || String(staff.workStatus),
    workStatusValue: staff.workStatus,
    rating: decimalToNumber(staff.rating),
    cityCode: staff.cityCode || '',
  }
}
