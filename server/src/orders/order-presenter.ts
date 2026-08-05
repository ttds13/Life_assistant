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

function isoDate(date?: Date | null) {
  return date ? date.toISOString() : null
}

type OrderAddressRecord = NonNullable<OrderDetailRecord['orderAddress']>

function addressText(address?: OrderAddressRecord | null) {
  if (!address) return ''
  if (address.formattedAddress) return address.formattedAddress
  return [
    address.city,
    address.district,
    address.detailAddress,
    address.houseNumber,
  ].filter(Boolean).join('')
}

function presentOrderAddress(address?: OrderAddressRecord | null) {
  if (!address) return null
  return {
    id: Number(address.id),
    orderId: Number(address.orderId),
    sourceAddressId: address.sourceAddressId ? Number(address.sourceAddressId) : null,
    sourceAddressVersion: address.sourceAddressVersion,
    version: address.version,
    contactName: address.contactName,
    contactPhone: address.contactPhone,
    country: address.country || '',
    provinceName: address.province || '',
    cityName: address.city || '',
    districtName: address.district || '',
    streetName: address.street || '',
    addressTitle: address.addressTitle || '',
    detailAddress: address.detailAddress,
    houseNumber: address.houseNumber || '',
    formattedAddress: address.formattedAddress,
    latitude: address.latitude?.toNumber() ?? null,
    longitude: address.longitude?.toNumber() ?? null,
    coordinateType: address.coordinateType || '',
    poiId: address.poiId || '',
    mapProvider: address.mapProvider || '',
    source: address.source,
    mapAvailable: address.latitude !== null && address.longitude !== null,
    createdAt: address.createdAt.toISOString(),
    updatedAt: address.updatedAt.toISOString(),
  }
}

export function presentPricePreview(amount: number, options?: {
  pricingMode?: 'cash' | 'member_card' | 'consultation'
  consultationRequired?: boolean
  cardType?: string
  discountAmount?: number
  memberCardDiscountAmount?: number
  payableAmount?: number
  couponId?: number | null
  memberCardId?: number | null
  memberCardConsumeMinutes?: number
  memberCardName?: string
  memberCardUsableMinutes?: number
}) {
  const discountAmount = options?.discountAmount || 0
  const memberCardDiscountAmount = options?.memberCardDiscountAmount || 0
  const payableAmount = options?.payableAmount ?? Math.max(0, amount - discountAmount)
  const pricingMode = options?.pricingMode || 'cash'
  const items = pricingMode === 'member_card'
    ? [
        { label: '服务原价', amount },
        { label: '会员卡权益抵扣', amount: memberCardDiscountAmount, type: 'discount' as const },
      ]
    : [
        { label: '服务金额', amount },
        { label: pricingMode === 'consultation' ? '咨询服务减免' : '优惠金额', amount: discountAmount, type: 'discount' as const },
      ]
  return {
    pricingMode,
    serviceAmount: amount,
    discountAmount,
    memberCardDiscountAmount,
    payableAmount,
    couponId: options?.couponId || null,
    consultationRequired: options?.consultationRequired || false,
    cardType: options?.cardType || '',
    memberCardId: options?.memberCardId || null,
    memberCardConsumeMinutes: options?.memberCardConsumeMinutes || 0,
    memberCardName: options?.memberCardName || '',
    memberCardUsableMinutes: options?.memberCardUsableMinutes || 0,
    items,
  }
}

export function presentUserOrder(order: OrderDetailRecord) {
  const serviceSnapshot = jsonRecord(order.serviceSnapshot)
  const totalAmount = decimalToNumber(order.originalAmount)
  const payableAmount = decimalToNumber(order.payableAmount)
  const memberCardUsage = presentMemberCardUsage(order)
  const fulfillment = presentFulfillment(order)
  const purchase = order.memberCardPurchase

  return {
    id: Number(order.id),
    orderNo: order.orderNo,
    status: order.status,
    version: order.version,
    orderType: order.orderType,
    isServiceTask: Boolean(order.serviceBooking),
    staffId: order.staffId ? Number(order.staffId) : null,
    memberCardId: order.serviceBooking?.redemption
      ? Number(order.serviceBooking.redemption.userMemberCardId)
      : order.memberCardId
        ? Number(order.memberCardId)
        : null,
    userMemberCardId: memberCardUsage.userMemberCardId,
    memberCardConsumeUnits: purchase
      ? numberValue(jsonRecord(purchase.planSnapshot).totalMinutes, order.memberCardConsumeUnits)
      : order.memberCardConsumeUnits,
    purchaseCardId: purchase ? Number(purchase.memberCardPlanId) : order.purchaseCardId ? Number(order.purchaseCardId) : null,
    grantedUserMemberCardId: purchase?.grantedUserMemberCardId
      ? Number(purchase.grantedUserMemberCardId)
      : order.grantedUserMemberCardId
        ? Number(order.grantedUserMemberCardId)
        : null,
    serviceCode: stringValue(serviceSnapshot.code, order.service?.code || ''),
    serviceName: stringValue(serviceSnapshot.name, order.service?.name || ''),
    serviceCardType: stringValue(serviceSnapshot.cardType, order.service?.cardType || ''),
    serviceConsumeUnit: numberValue(serviceSnapshot.consumeUnit, order.service?.consumeUnit || 0),
    serviceImage: stringValue(serviceSnapshot.coverImage, order.service?.coverImage || ''),
    appointmentStartTime: order.appointmentStartTime.toISOString(),
    appointmentEndTime: order.appointmentEndTime.toISOString(),
    appointmentTime: formatAppointment(order),
    addressText: addressText(order.orderAddress),
    orderAddressVersion: order.orderAddress?.version ?? null,
    totalAmount,
    discountAmount: decimalToNumber(order.discountAmount),
    payableAmount,
    couponId: order.couponId ? Number(order.couponId) : null,
    remark: order.remark || '',
    staffName: order.staff?.name || '',
    staffPhone: order.staff?.phone || '',
    staffRating: order.staff ? decimalToNumber(order.staff.rating) : undefined,
    memberCardTemplateId: memberCardUsage.memberCardTemplateId,
    memberCardName: memberCardUsage.memberCardName,
    memberCardUnitName: memberCardUsage.memberCardUnitName,
    memberCardRuleSource: memberCardUsage.memberCardRuleSource,
    memberCardRuleSnapshot: memberCardUsage.memberCardRuleSnapshot,
    memberCardConsumeMode: memberCardUsage.memberCardConsumeMode,
    memberCardMinConsumeMinutes: memberCardUsage.memberCardMinConsumeMinutes,
    memberCardAllowedMinutes: memberCardUsage.memberCardAllowedMinutes,
    memberCardRuleChanged: memberCardUsage.memberCardRuleChanged,
    plannedConsumeUnits: memberCardUsage.plannedConsumeUnits,
    actualConsumeUnits: memberCardUsage.actualConsumeUnits,
    releasedUnits: memberCardUsage.releasedUnits,
    frozenUnits: memberCardUsage.frozenUnits,
    memberCard: memberCardUsage.memberCard,
    memberCardPurchase: purchase
      ? {
          memberCardPlanId: Number(purchase.memberCardPlanId),
          memberCardPlanVersion: purchase.memberCardPlanVersion,
          planSnapshot: purchase.planSnapshot,
          grantedUserMemberCardId: purchase.grantedUserMemberCardId ? Number(purchase.grantedUserMemberCardId) : null,
          grantedAt: isoDate(purchase.grantedAt),
          userCard: purchase.grantedUserCard
            ? {
                id: Number(purchase.grantedUserCard.id),
                status: purchase.grantedUserCard.status,
                completedReason: purchase.grantedUserCard.completedReason || '',
                remainingMinutes: purchase.grantedUserCard.remainingMinutes,
                frozenMinutes: purchase.grantedUserCard.frozenMinutes,
                activationDeadlineAt: isoDate(purchase.grantedUserCard.activationDeadlineAt),
                activatedAt: isoDate(purchase.grantedUserCard.activatedAt),
                expireAt: isoDate(purchase.grantedUserCard.expireAt),
              }
            : null,
        }
      : null,
    acceptedAt: fulfillment.acceptedAt,
    onTheWayAt: fulfillment.onTheWayAt,
    checkinAt: fulfillment.checkinAt,
    startedAt: fulfillment.startedAt,
    createdAt: order.createdAt.toISOString(),
    completedAt: fulfillment.completedAt,
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

function presentRefund(refund: OrderDetailRecord['refunds'][number]) {
  return {
    id: Number(refund.id),
    refundNo: refund.refundNo,
    amount: decimalToNumber(refund.amount),
    reason: refund.reason || '',
    status: refund.status,
    channel: refund.channel || '',
    channelRefundNo: refund.channelRefundNo || '',
    failureReason: refund.failureReason || '',
    reviewedAt: refund.reviewedAt?.toISOString() || null,
    processedAt: refund.processedAt?.toISOString() || null,
    refundedAt: refund.refundedAt?.toISOString() || null,
    createdAt: refund.createdAt.toISOString(),
  }
}

function firstStatusLogTime(order: OrderDetailRecord, actions: string[]) {
  return isoDate(order.statusLogs.find(log => actions.includes(log.action || ''))?.createdAt)
}

function firstCheckinTime(order: OrderDetailRecord, type: string) {
  return isoDate(order.checkins.find(item => item.checkinType === type)?.createdAt)
}

function finishTime(order: OrderDetailRecord) {
  return isoDate(order.completedAt)
    || firstCheckinTime(order, 'finish')
    || firstStatusLogTime(order, ['staff_complete', 'user_confirm', 'auto_confirm'])
}

function sumMemberCardRecordUnits(order: OrderDetailRecord, recordType: string) {
  return order.memberCardRecords
    .filter(record => record.recordType === recordType)
    .reduce((sum, record) => sum + record.units, 0)
}

function firstMemberCardRecord(order: OrderDetailRecord) {
  return order.memberCardRecords[0] || null
}

function memberCardRuleSnapshot(order: OrderDetailRecord) {
  return jsonRecord(order.memberCardRuleSnapshot)
}

function memberCardUnitName(order: OrderDetailRecord) {
  const record = firstMemberCardRecord(order)
  if (record?.userMemberCard.card.unitName) return record.userMemberCard.card.unitName
  const serviceSnapshot = jsonRecord(order.serviceSnapshot)
  const cardType = stringValue(serviceSnapshot.cardType, order.service?.cardType || '')
  return cardType === 'time' ? '分钟' : '次'
}

function presentMemberCardRecord(record: OrderDetailRecord['memberCardRecords'][number]) {
  return {
    id: Number(record.id),
    userMemberCardId: Number(record.userMemberCardId),
    orderId: record.orderId ? Number(record.orderId) : null,
    recordType: record.recordType,
    timesUsed: record.timesUsed,
    units: record.units,
    beforeUnits: record.beforeUnits,
    afterUnits: record.afterUnits,
    operatorType: record.operatorType || '',
    operatorId: record.operatorId ? Number(record.operatorId) : null,
    remark: record.remark || '',
    createdAt: record.createdAt.toISOString(),
    card: {
      id: Number(record.userMemberCard.card.id),
      name: record.userMemberCard.card.name,
      cardType: record.userMemberCard.card.cardType,
      unitName: record.userMemberCard.card.unitName,
      unitMinutes: record.userMemberCard.card.unitMinutes || 0,
    },
  }
}

function presentMemberCardUsage(order: OrderDetailRecord) {
  const redemption = order.serviceBooking?.redemption
  if (redemption) {
    const userCard = redemption.userCard
    const plannedMinutes = redemption.reservedMinutes
    const actualMinutes = redemption.consumedMinutes
    const releasedMinutes = redemption.releasedMinutes
    const frozenMinutes = redemption.state === 'reserved' ? redemption.reservedMinutes : 0
    const ruleSnapshot = jsonRecord(redemption.ruleSnapshot)
    return {
      userMemberCardId: Number(redemption.userMemberCardId),
      memberCardTemplateId: Number(userCard.cardId),
      memberCardName: userCard.card.name,
      memberCardUnitName: '分钟',
      frozenUnits: frozenMinutes,
      plannedConsumeUnits: plannedMinutes,
      actualConsumeUnits: actualMinutes,
      releasedUnits: releasedMinutes,
      frozenMinutes,
      plannedConsumeMinutes: plannedMinutes,
      actualConsumeMinutes: actualMinutes,
      releasedMinutes,
      redemptionState: redemption.state,
      memberCardRuleSource: stringValue(ruleSnapshot.ruleSource),
      memberCardRuleSnapshot: Object.keys(ruleSnapshot).length ? ruleSnapshot : null,
      memberCardConsumeMode: stringValue(ruleSnapshot.consumeMode, 'fixed_minutes'),
      memberCardMinConsumeMinutes: numberValue(ruleSnapshot.minConsumeMinutes, plannedMinutes),
      memberCardAllowedMinutes: Array.isArray(ruleSnapshot.allowedMinutes)
        ? ruleSnapshot.allowedMinutes.map(value => Number(value)).filter(value => Number.isInteger(value) && value > 0)
        : [],
      memberCardRuleChanged: false,
      memberCard: {
        id: Number(userCard.id),
        cardId: Number(userCard.cardId),
        userMemberCardId: Number(userCard.id),
        memberCardTemplateId: Number(userCard.cardId),
        name: userCard.card.name,
        cardType: userCard.card.cardType,
        unitName: '分钟',
        unitMinutes: userCard.card.unitMinutes || 0,
        remainingUnits: userCard.remainingMinutes,
        frozenUnits: userCard.frozenMinutes,
        usableUnits: Math.max(0, userCard.remainingMinutes - userCard.frozenMinutes),
        remainingMinutes: userCard.remainingMinutes,
        frozenMinutes: userCard.frozenMinutes,
        usableMinutes: Math.max(0, userCard.remainingMinutes - userCard.frozenMinutes),
        status: userCard.status,
        completedReason: userCard.completedReason || '',
      },
      memberCardRecords: order.memberCardRecords.map(presentMemberCardRecord),
    }
  }

  const record = firstMemberCardRecord(order)
  const unitName = memberCardUnitName(order)
  const ruleSnapshot = memberCardRuleSnapshot(order)
  const frozenUnits = sumMemberCardRecordUnits(order, 'freeze')
  const plannedConsumeUnits = order.memberCardConsumeUnits || frozenUnits
  const actualConsumeUnits = sumMemberCardRecordUnits(order, 'consume')
  const releasedUnits = sumMemberCardRecordUnits(order, 'release')
  const snapshotConsumeUnits = numberValue(ruleSnapshot.consumeUnits)
  const snapshotServiceDefaultConsumeUnit = numberValue(ruleSnapshot.serviceDefaultConsumeUnit)
  const currentServiceConsumeUnit = order.service?.consumeUnit || 0
  const memberCardTemplateId = numberValue(ruleSnapshot.memberCardTemplateId, record ? Number(record.userMemberCard.cardId) : 0)
  const userMemberCardId = order.memberCardId
    ? Number(order.memberCardId)
    : record
      ? Number(record.userMemberCardId)
      : order.grantedUserMemberCardId
        ? Number(order.grantedUserMemberCardId)
        : null

  return {
    userMemberCardId,
    memberCardTemplateId: memberCardTemplateId || null,
    memberCardName: record?.userMemberCard.card.name || '',
    memberCardUnitName: unitName,
    frozenUnits,
    plannedConsumeUnits,
    actualConsumeUnits,
    releasedUnits,
    memberCardRuleSource: stringValue(ruleSnapshot.ruleSource),
    memberCardRuleSnapshot: Object.keys(ruleSnapshot).length ? ruleSnapshot : null,
    memberCardConsumeMode: stringValue(ruleSnapshot.consumeMode, 'fixed_minutes'),
    memberCardMinConsumeMinutes: numberValue(ruleSnapshot.minConsumeMinutes, plannedConsumeUnits),
    memberCardAllowedMinutes: Array.isArray(ruleSnapshot.allowedMinutes)
      ? ruleSnapshot.allowedMinutes.map(value => Number(value)).filter(value => Number.isInteger(value) && value > 0)
      : [],
    memberCardRuleChanged: Boolean(
      snapshotConsumeUnits
      && (
        snapshotConsumeUnits !== plannedConsumeUnits
        || snapshotServiceDefaultConsumeUnit !== currentServiceConsumeUnit
      ),
    ),
    memberCard: record
      ? {
          id: Number(record.userMemberCard.id),
          cardId: Number(record.userMemberCard.cardId),
          userMemberCardId: Number(record.userMemberCard.id),
          memberCardTemplateId: Number(record.userMemberCard.cardId),
          name: record.userMemberCard.card.name,
          cardType: record.userMemberCard.card.cardType,
          unitName,
          unitMinutes: record.userMemberCard.card.unitMinutes || 0,
          remainingUnits: record.userMemberCard.remainingUnits,
          frozenUnits: record.userMemberCard.frozenUnits,
          usableUnits: Math.max(0, record.userMemberCard.remainingUnits - record.userMemberCard.frozenUnits),
          status: record.userMemberCard.status,
        }
      : null,
    memberCardRecords: order.memberCardRecords.map(presentMemberCardRecord),
  }
}

function presentFulfillment(order: OrderDetailRecord) {
  return {
    acceptedAt: firstStatusLogTime(order, ['staff_accept']) || isoDate(order.assignments[0]?.acceptedAt),
    onTheWayAt: firstCheckinTime(order, 'on_the_way'),
    checkinAt: firstCheckinTime(order, 'on_the_way'),
    startedAt: firstCheckinTime(order, 'start'),
    completedAt: finishTime(order),
  }
}

function messageImages(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function presentTicket(ticket: OrderDetailRecord['tickets'][number]) {
  const latestMessage = ticket.messages[0]
  return {
    id: Number(ticket.id),
    ticketNo: ticket.ticketNo,
    type: ticket.type,
    title: ticket.title,
    description: ticket.description || '',
    status: ticket.status,
    priority: ticket.priority,
    handledBy: ticket.handledBy ? Number(ticket.handledBy) : null,
    resolvedAt: ticket.resolvedAt?.toISOString() || null,
    latestMessage: latestMessage?.content || '',
    latestImages: latestMessage ? messageImages(latestMessage.images) : [],
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  }
}

export function presentOrderDetail(order: OrderDetailRecord) {
  const base = presentUserOrder(order)
  const serviceSnapshot = jsonRecord(order.serviceSnapshot)
  const discountAmount = decimalToNumber(order.discountAmount)
  const payment = order.payments[0]
  const refunds = order.refunds.map(presentRefund)
  const tickets = order.tickets.map(presentTicket)
  const fulfillment = presentFulfillment(order)
  const memberCardUsage = presentMemberCardUsage(order)

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
    orderAddress: presentOrderAddress(order.orderAddress),
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
    refunds,
    latestRefund: refunds[0] || null,
    tickets,
    latestTicket: tickets[0] || null,
    ...fulfillment,
    ...memberCardUsage,
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
    userName: order.user?.nickname || order.orderAddress?.contactName || '用户',
    userPhone: order.user?.phone || order.orderAddress?.contactPhone || '',
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
    allowedActions: adminOrderAllowedActions(order),
  }
}

function adminOrderAllowedActions(order: OrderDetailRecord) {
  const isBooking = Boolean(order.serviceBooking)
  const editableStatuses = ['pending_payment', 'pending_dispatch', 'dispatched', 'accepted']
  const canCancel = isBooking && ['pending_payment', 'pending_dispatch'].includes(order.status)
  const hasDraftFacts = Boolean(
    order.paidAt
      || order.paidAmount.gt(0)
      || order.payments.length
      || order.refunds.length
      || order.assignments.length
      || order.checkins.length
      || order.photos.length
      || order.tickets.length
      || order.incomeRecords.length
      || order.memberCardRecords.length
      || order.serviceBooking?.redemption
      || order.grantedUserMemberCardId
      || order.memberCardPurchase?.grantedUserMemberCardId,
  )
  const canDeleteDraft = order.status === 'pending_payment' && !hasDraftFacts

  return {
    update: editableStatuses.includes(order.status),
    cancel: canCancel,
    deleteDraft: canDeleteDraft,
    reschedule: isBooking && editableStatuses.includes(order.status),
    assign: isBooking && order.status === 'pending_dispatch',
    addressUpdate: isBooking && editableStatuses.includes(order.status),
    reasons: {
      deleteDraft: canDeleteDraft ? '' : '仅无支付、退款、履约、积分或权益事实的待支付草稿可删除',
      cancel: canCancel ? '' : '当前状态不能取消',
    },
  }
}

export function presentAdminUserProductOrder(order: OrderDetailRecord) {
  const base = presentAdminOrderListItem(order)
  const purchase = order.memberCardPurchase
  const planSnapshot = jsonRecord(purchase?.planSnapshot)
  const productType = purchase ? 'member_card_product' : 'service_product'
  const productName = purchase
    ? stringValue(planSnapshot.name, purchase.plan.name)
    : base.serviceName
  const latestRefund = order.refunds[0]

  return {
    ...base,
    productType,
    productName,
    transactionStatus: order.status,
    refundedAt: latestRefund?.refundedAt?.toISOString() || null,
    refundStatus: latestRefund?.status || '',
    serviceProductSummary: purchase
      ? null
      : {
          serviceId: Number(order.serviceBooking?.serviceId || order.serviceId),
          serviceName: base.serviceName,
          bookingOrderId: Number(order.id),
          appointmentStartAt: order.serviceBooking?.appointmentStartAt.toISOString() || null,
          appointmentEndAt: order.serviceBooking?.appointmentEndAt.toISOString() || null,
          fulfillmentStatus: order.status,
        },
    memberCardProductSummary: purchase
      ? {
          memberCardPlanId: Number(purchase.memberCardPlanId),
          memberCardPlanVersion: purchase.memberCardPlanVersion,
          grantedUserMemberCardId: purchase.grantedUserMemberCardId
            ? Number(purchase.grantedUserMemberCardId)
            : null,
          grantedAt: purchase.grantedAt?.toISOString() || null,
          userMemberCardStatus: purchase.grantedUserCard?.status || '',
          userMemberCardCompletedReason: purchase.grantedUserCard?.completedReason || '',
        }
      : null,
  }
}

export function presentAdminUserServiceBooking(order: OrderDetailRecord) {
  const base = presentAdminOrderListItem(order)
  const redemption = order.serviceBooking?.redemption
  const incomeAmount = order.incomeRecords.reduce((sum, item) => sum + decimalToNumber(item.amount), 0)
  const latestIncome = order.incomeRecords[0]

  return {
    ...base,
    entitlementType: redemption ? 'member_card_entitlement' : 'service_entitlement',
    fulfillmentStatus: order.status,
    serviceId: Number(order.serviceBooking?.serviceId || order.serviceId),
    appointmentStartAt: order.serviceBooking?.appointmentStartAt.toISOString() || order.appointmentStartTime.toISOString(),
    appointmentEndAt: order.serviceBooking?.appointmentEndAt.toISOString() || order.appointmentEndTime.toISOString(),
    orderAddressSummary: order.orderAddress
      ? {
          version: order.orderAddress.version,
          formattedAddress: order.orderAddress.formattedAddress,
          cityName: order.orderAddress.city || '',
          districtName: order.orderAddress.district || '',
          mapAvailable: order.orderAddress.latitude !== null && order.orderAddress.longitude !== null,
        }
      : null,
    redemption: redemption
      ? {
          id: Number(redemption.id),
          userMemberCardId: Number(redemption.userMemberCardId),
          memberCardName: redemption.userCard.card.name,
          state: redemption.state,
          reservedMinutes: redemption.reservedMinutes,
          consumedMinutes: redemption.consumedMinutes,
          releasedMinutes: redemption.releasedMinutes,
          actualServiceMinutes: redemption.actualServiceMinutes,
          activatedCard: redemption.activatedCard,
          settledAt: redemption.settledAt?.toISOString() || null,
        }
      : null,
    staffIncomeSummary: {
      amount: incomeAmount,
      status: latestIncome?.status || '',
      settlementStatus: latestIncome?.settlementStatus || '',
      withdrawStatus: latestIncome?.withdrawStatus || '',
    },
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
      notificationId: assignment.notificationId ? Number(assignment.notificationId) : null,
      notificationStatus: assignment.notificationStatus || '',
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
