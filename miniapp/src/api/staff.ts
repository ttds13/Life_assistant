import type { PageData } from './types/common'
import type { OrderDetail, OrderStatus, UserOrder } from './types/orders'
import type {
  StaffDashboard,
  StaffNotification,
  StaffOrderFilter,
  StaffProfile,
  StaffServicePhoto,
  StaffStatsPeriod,
  StaffTask,
  StaffTaskGroup,
  StaffTaskStatus,
  StaffWithdrawConfirmPackage,
  StaffWithdrawCreateParams,
  StaffWithdrawDetail,
  StaffWithdrawRequest,
  StaffWithdrawSummary,
  StaffWorkStatus,
  StaffWorkStatusValue,
  StaffUnreadCount,
  UpdateStaffProfileParams,
} from './types/staff'
import { http } from '@/http/http'

async function staffHeaders() {
  return undefined
}

function photoStorageKey(orderId: number) {
  return `STAFF_ORDER_PHOTOS_${orderId}`
}

function getLocalPhotos(orderId: number): StaffServicePhoto[] {
  const value = uni.getStorageSync(photoStorageKey(orderId))
  return Array.isArray(value) ? value : []
}

function setLocalPhotos(orderId: number, photos: StaffServicePhoto[]) {
  uni.setStorageSync(photoStorageKey(orderId), photos)
}

function clearLocalPhotos(orderId: number) {
  uni.removeStorageSync(photoStorageKey(orderId))
}

function mapStaffStatus(status: OrderStatus): StaffTaskStatus {
  if (status === 'dispatched')
    return 'pending_accept'
  if (status === 'accepted' || status === 'on_the_way' || status === 'in_service' || status === 'pending_confirm' || status === 'completed' || status === 'cancelled')
    return status
  return 'cancelled'
}

function mapFilterStatus(status?: StaffOrderFilter): OrderStatus | 'all' | undefined {
  if (!status)
    return undefined
  if (status === 'pending')
    return 'dispatched'
  if (status === 'completed')
    return 'completed'
  return 'all'
}

function numericCoordinate(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function photoType(index: number): StaffServicePhoto['type'] {
  return index === 0 ? 'after' : 'other'
}

function serviceTypeText(cardType?: string) {
  if (cardType === 'time') return '时间类服务'
  if (cardType === 'times') return '按次服务'
  if (cardType === 'none') return '按面积/非标准服务'
  if (cardType === 'consultation') return '咨询订单'
  return '服务订单'
}

function memberCardTip(order: UserOrder | OrderDetail) {
  const detail = order as OrderDetail
  const cardType = order.serviceCardType || detail.service?.cardType || ''
  const unitName = order.memberCardUnitName || (cardType === 'time' ? '分钟' : '次')
  const plannedUnits = order.plannedConsumeUnits || order.memberCardConsumeUnits || 0
  const actualUnits = order.actualConsumeUnits || 0
  const releasedUnits = order.releasedUnits || 0

  if (order.memberCardId) {
    const plannedText = plannedUnits ? `预计扣 ${plannedUnits}${unitName}` : '会员卡订单'
    const actualText = actualUnits ? `，已扣 ${actualUnits}${unitName}` : ''
    const releasedText = releasedUnits ? `，已释放 ${releasedUnits}${unitName}` : ''
    return `${order.memberCardName || '会员卡'}：${plannedText}${actualText}${releasedText}`
  }
  if (cardType === 'time') return '现金订单，不扣会员卡'
  if (cardType === 'times') return '按次服务，本次不使用会员卡'
  if (cardType === 'none') return '按面积或非标准服务，不使用会员卡'
  if (cardType === 'consultation') return '咨询订单，不扣会员卡'
  return ''
}

function toStaffTask(order: UserOrder | OrderDetail, group: StaffTaskGroup = 'dispatch'): StaffTask {
  const detail = order as OrderDetail
  const address = detail.address
  const status = mapStaffStatus(order.status)
  const serviceCardType = order.serviceCardType || detail.service?.cardType
  const photos = detail.servicePhotos?.map((url, index) => ({
    id: `${order.id}-${index}`,
    url: detail.servicePhotoOssUrls?.[index] || url,
    ossUrl: detail.servicePhotoOssUrls?.[index] || url,
    displayUrl: detail.servicePhotoUrls?.[index] || url,
    type: photoType(index),
    createdAt: '',
  }))
  const localPhotos = getLocalPhotos(order.id)

  return {
    id: order.id,
    orderNo: order.orderNo,
    status,
    rawStatus: order.status,
    version: detail.version,
    group,
    canReject: status === 'pending_accept',
    serviceName: order.serviceName,
    serviceSpec: detail.service?.priceUnit,
    serviceCardType,
    serviceTypeText: serviceTypeText(serviceCardType),
    serviceRequirement: order.remark || '',
    appointmentTime: order.appointmentTime,
    customerName: address?.contactName || '',
    customerPhone: address?.contactPhone || '',
    addressText: order.addressText,
    latitude: numericCoordinate(address?.latitude),
    longitude: numericCoordinate(address?.longitude),
    distanceText: '已分配任务',
    remark: order.remark,
    incomeAmount: order.payableAmount,
    memberCardName: order.memberCardName,
    memberCardUnitName: order.memberCardUnitName,
    memberCardConsumeUnits: order.memberCardConsumeUnits,
    plannedConsumeUnits: order.plannedConsumeUnits,
    actualConsumeUnits: order.actualConsumeUnits,
    releasedUnits: order.releasedUnits,
    frozenUnits: order.frozenUnits,
    memberCardTip: memberCardTip(order),
    actualMinutes: order.actualConsumeUnits && (order.memberCardUnitName === '分钟' || serviceCardType === 'time')
      ? order.actualConsumeUnits
      : undefined,
    createdAt: order.createdAt,
    acceptedAt: order.acceptedAt || undefined,
    checkinAt: order.checkinAt || order.onTheWayAt || undefined,
    startedAt: order.startedAt || undefined,
    completedAt: order.completedAt || undefined,
    photos: localPhotos.length ? localPhotos : photos,
  }
}

function filterTasks(tasks: StaffTask[], params?: { status?: StaffOrderFilter }) {
  if (params?.status === 'pending')
    return tasks.filter(item => item.status === 'pending_accept')
  if (params?.status === 'processing')
    return tasks.filter(item => ['accepted', 'on_the_way', 'in_service', 'pending_confirm'].includes(item.status))
  if (params?.status === 'completed')
    return tasks.filter(item => item.status === 'completed')
  return tasks
}

async function getStaffOrders(params?: { status?: OrderStatus | 'all', page?: number, pageSize?: number }) {
  return http.get<PageData<UserOrder>>('/staff/orders', {
    status: params?.status || 'all',
    page: params?.page || 1,
    pageSize: params?.pageSize || 100,
  }, await staffHeaders())
}

async function transitionStaffOrder(id: number, path: string, data?: Record<string, any>) {
  const order = await http.post<OrderDetail>(`/staff/orders/${id}/${path}`, data, undefined, await staffHeaders())
  return toStaffTask(order)
}

export async function getStaffDashboard() {
  const assignedResult = await getStaffOrders({ status: 'all', page: 1, pageSize: 100 })
  const tasks = assignedResult.items.map(order => toStaffTask(order, 'dispatch'))
  return {
    pendingTaskCount: tasks.filter(item => item.status === 'pending_accept').length,
    dispatchTaskCount: tasks.filter(item => item.status === 'pending_accept').length,
    processingTaskCount: tasks.filter(item => ['accepted', 'on_the_way', 'in_service', 'pending_confirm'].includes(item.status)).length,
    completedTaskCount: tasks.filter(item => item.status === 'completed').length,
    todayEstimatedIncome: tasks
      .filter(item => item.status !== 'cancelled')
      .reduce((sum, item) => sum + (item.incomeAmount || 0), 0),
    tasks,
  } satisfies StaffDashboard
}

export async function getStaffTasks(params?: { group?: StaffTaskGroup, status?: StaffOrderFilter }) {
  const status = mapFilterStatus(params?.status)
  const assignedResult = await getStaffOrders({ status, page: 1, pageSize: 100 })
  const tasks = assignedResult.items.map(order => toStaffTask(order, 'dispatch'))
  return filterTasks(tasks, params)
}

export async function getStaffTaskDetail(id: number, _group: StaffTaskGroup = 'dispatch') {
  const order = await http.get<OrderDetail>(`/staff/orders/${id}`, undefined, await staffHeaders())
  return toStaffTask(order, 'dispatch')
}

export function acceptStaffTask(id: number) {
  return transitionStaffOrder(id, 'accept')
}

export async function rejectStaffTask(id: number, reason = 'staff rejected', version?: number) {
  const task = await transitionStaffOrder(id, 'reject', { reason, version })
  return {
    ...task,
    status: 'rejected' as const,
    canReject: false,
  }
}

export function checkinStaffTask(id: number, version?: number) {
  return transitionStaffOrder(id, 'on-the-way', { version })
}

export function startStaffTask(id: number, version?: number) {
  return transitionStaffOrder(id, 'start-service', { version })
}

function uploadedPhotoUrls(photos: StaffServicePhoto[]) {
  return photos
    .filter(photo => photo.url && !String(photo.url).startsWith('wxfile://') && !String(photo.url).startsWith('http://tmp') && !String(photo.url).startsWith('blob:'))
    .map(photo => photo.ossUrl || photo.url)
    .filter(Boolean)
}

export async function completeStaffTask(id: number, data?: { version?: number, remark?: string, photoUrls?: string[], actualMinutes?: number }) {
  const localPhotos = getLocalPhotos(id)
  const photoUrls = data?.photoUrls?.length ? data.photoUrls : uploadedPhotoUrls(localPhotos)
  if (!photoUrls.length)
    throw new Error('请先上传服务照片')

  const task = await transitionStaffOrder(id, 'complete', {
    ...data,
    photoUrls,
  })
  clearLocalPhotos(id)
  return task
}

export async function uploadStaffOrderPhotos(id: number, photos: StaffServicePhoto[]) {
  const uploaded = photos.filter(photo => photo.ossUrl || photo.url)
  if (!uploaded.length)
    throw new Error('请先上传服务照片')
  setLocalPhotos(id, uploaded.slice(0, 6))
  const task = await getStaffTaskDetail(id)
  return {
    ...task,
    photos: uploaded.slice(0, 6),
  }
}

export function getStaffProfile(period?: StaffStatsPeriod) {
  return staffHeaders()
    .then(headers => http.get<StaffProfile>('/staff/profile', { period: period || 'today' }, headers))
}

export async function updateStaffProfile(params: UpdateStaffProfileParams) {
  return http.put<StaffProfile>('/staff/profile', params, undefined, await staffHeaders())
}

export async function getStaffWorkStatus() {
  return http.get<StaffWorkStatus>('/staff/work-status', undefined, await staffHeaders())
}

export async function updateStaffWorkStatus(workStatus: StaffWorkStatusValue) {
  return http.put<StaffWorkStatus>('/staff/work-status', { workStatus }, undefined, await staffHeaders())
}

export async function getStaffWithdrawSummary() {
  return http.get<StaffWithdrawSummary>('/staff/withdrawals/summary', undefined, await staffHeaders())
}

export async function listStaffWithdrawRequests(params?: { status?: string, page?: number, pageSize?: number }) {
  return http.get<PageData<StaffWithdrawRequest>>('/staff/withdrawals', {
    status: params?.status || 'all',
    page: params?.page || 1,
    pageSize: params?.pageSize || 20,
  }, await staffHeaders())
}

export async function createStaffWithdrawRequest(params: StaffWithdrawCreateParams) {
  return http.post<StaffWithdrawDetail>('/staff/withdrawals', params, undefined, await staffHeaders())
}

export async function getStaffWithdrawDetail(id: number) {
  return http.get<StaffWithdrawDetail>(`/staff/withdrawals/${id}`, undefined, await staffHeaders())
}

export async function cancelStaffWithdrawRequest(id: number) {
  return http.post<StaffWithdrawDetail>(`/staff/withdrawals/${id}/cancel`, undefined, undefined, await staffHeaders())
}

export async function getStaffWithdrawConfirmPackage(id: number) {
  return http.post<StaffWithdrawConfirmPackage>(`/staff/withdrawals/${id}/confirm-package`, undefined, undefined, await staffHeaders())
}

export async function listStaffNotifications(params?: { page?: number, pageSize?: number }) {
  return http.get<PageData<StaffNotification>>('/staff/notifications', {
    page: params?.page || 1,
    pageSize: params?.pageSize || 20,
  }, await staffHeaders())
}

export async function getStaffUnreadCount() {
  return http.get<StaffUnreadCount>('/staff/notifications/unread-count', undefined, await staffHeaders())
}

export async function markStaffNotificationRead(id: number) {
  return http.post<{ id: number, isRead: boolean }>(`/staff/notifications/${id}/read`, undefined, undefined, await staffHeaders())
}

export async function markStaffOrderNotificationsRead(orderId: number) {
  return http.post<{ orderId: number, isRead: boolean }>(`/staff/notifications/read-by-order/${orderId}`, undefined, undefined, await staffHeaders())
}
