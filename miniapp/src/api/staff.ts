import type { PageData } from './types/common'
import type { DevStaffSession } from './types/auth'
import type { OrderDetail, OrderStatus, UserOrder } from './types/orders'
import type {
  CreateStaffOrderPayload,
  StaffDashboard,
  StaffOrderFilter,
  StaffProfile,
  StaffServicePhoto,
  StaffStatsPeriod,
  StaffTask,
  StaffTaskGroup,
  StaffTaskStatus,
  UpdateStaffProfileParams,
} from './types/staff'
import { http } from '@/http/http'
import { getCurrentDevStaffId, getStoredDevStaffSession } from '@/utils/devStaffStorage'
import { ensureDevStaffSession } from '@/utils/devStaffSession'

async function staffHeaders() {
  await ensureDevStaffSession()
  const staffId = getCurrentDevStaffId()
  return staffId ? { 'X-Staff-Id': staffId } : undefined
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

function photoType(index: number): StaffServicePhoto['type'] {
  if (index === 0)
    return 'after'
  return 'other'
}

function toStaffTask(order: UserOrder | OrderDetail, group: StaffTaskGroup = 'dispatch'): StaffTask {
  const detail = order as OrderDetail
  const address = detail.address
  const status = group === 'grab' && order.status === 'pending_dispatch'
    ? 'pending_accept'
    : mapStaffStatus(order.status)
  const photos = detail.servicePhotos?.map((url, index) => ({
    id: `${order.id}-${index}`,
    url,
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
    canReject: group === 'dispatch' && status === 'pending_accept',
    serviceName: order.serviceName,
    serviceSpec: detail.service?.priceUnit,
    serviceRequirement: order.remark || '',
    appointmentTime: order.appointmentTime,
    customerName: address?.contactName || '',
    customerPhone: address?.contactPhone || '',
    addressText: order.addressText,
    distanceText: group === 'grab' ? '可接订单' : '已派单',
    remark: order.remark,
    incomeAmount: order.payableAmount,
    createdAt: order.createdAt,
    photos: localPhotos.length ? localPhotos : photos,
  }
}

function filterTasks(tasks: StaffTask[], params?: { group?: StaffTaskGroup, status?: StaffOrderFilter }) {
  let result = tasks
  if (params?.group)
    result = result.filter(item => item.group === params.group)
  if (params?.status === 'pending')
    result = result.filter(item => item.status === 'pending_accept')
  if (params?.status === 'processing')
    result = result.filter(item => ['accepted', 'on_the_way', 'in_service', 'pending_confirm'].includes(item.status))
  if (params?.status === 'completed')
    result = result.filter(item => item.status === 'completed')
  return result
}

async function getStaffOrders(params?: { status?: OrderStatus | 'all', page?: number, pageSize?: number }) {
  return http.get<PageData<UserOrder>>('/staff/orders', {
    status: params?.status || 'all',
    page: params?.page || 1,
    pageSize: params?.pageSize || 100,
  }, await staffHeaders())
}

async function getAvailableStaffOrders(params?: { page?: number, pageSize?: number }) {
  return http.get<PageData<UserOrder>>('/staff/available-orders', {
    page: params?.page || 1,
    pageSize: params?.pageSize || 100,
  }, await staffHeaders())
}

async function transitionStaffOrder(id: number, path: string, data?: Record<string, any>) {
  const order = await http.post<OrderDetail>(`/staff/orders/${id}/${path}`, data, undefined, await staffHeaders())
  return toStaffTask(order)
}

export async function getStaffDashboard() {
  const [assignedResult, availableResult] = await Promise.all([
    getStaffOrders({ status: 'all', page: 1, pageSize: 100 }),
    getAvailableStaffOrders({ page: 1, pageSize: 100 }),
  ])
  const dispatchTasks = assignedResult.items.map(order => toStaffTask(order, 'dispatch'))
  const grabTasks = availableResult.items.map(order => toStaffTask(order, 'grab'))
  const tasks = [...grabTasks, ...dispatchTasks]
  return {
    pendingTaskCount: tasks.filter(item => item.status === 'pending_accept').length,
    dispatchTaskCount: tasks.filter(item => item.group === 'dispatch' && item.status === 'pending_accept').length,
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
  const [assignedResult, availableResult] = await Promise.all([
    params?.group === 'grab'
      ? Promise.resolve({ items: [] as UserOrder[] })
      : getStaffOrders({ status, page: 1, pageSize: 100 }),
    params?.status && params.status !== 'pending'
      ? Promise.resolve({ items: [] as UserOrder[] })
      : params?.group === 'dispatch'
        ? Promise.resolve({ items: [] as UserOrder[] })
        : getAvailableStaffOrders({ page: 1, pageSize: 100 }),
  ])
  const tasks = [
    ...availableResult.items.map(order => toStaffTask(order, 'grab')),
    ...assignedResult.items.map(order => toStaffTask(order, 'dispatch')),
  ]
  return filterTasks(tasks, params)
}

export async function getStaffTaskDetail(id: number, group: StaffTaskGroup = 'dispatch') {
  const path = group === 'grab' ? `/staff/available-orders/${id}` : `/staff/orders/${id}`
  const order = await http.get<OrderDetail>(path, undefined, await staffHeaders())
  return toStaffTask(order, group)
}

export function acceptStaffTask(id: number) {
  return transitionStaffOrder(id, 'accept')
}

export function claimStaffTask(id: number, version?: number) {
  return transitionStaffOrder(id, 'claim', { version })
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

export async function completeStaffTask(id: number, data?: { version?: number, remark?: string, photoUrls?: string[] }) {
  const localPhotos = getLocalPhotos(id)
  const photoUrls = data?.photoUrls?.length ? data.photoUrls : localPhotos.map(photo => photo.url)
  const task = await transitionStaffOrder(id, 'complete', {
    ...data,
    photoUrls,
  })
  clearLocalPhotos(id)
  return task
}

export async function uploadStaffOrderPhotos(id: number, photos: StaffServicePhoto[]) {
  setLocalPhotos(id, photos)
  const task = await getStaffTaskDetail(id)
  return {
    ...task,
    photos,
  }
}

export function createStaffOrder(_payload: CreateStaffOrderPayload) {
  return Promise.reject(new Error('create staff order is not connected in Day 13'))
}

export function getStaffProfile(period?: StaffStatsPeriod) {
  return staffHeaders()
    .then(headers => http.get<StaffProfile>('/staff/profile', { period: period || 'today' }, headers))
    .then((profile) => {
      const session = getStoredDevStaffSession() as DevStaffSession | null
      if (!profile.staffName && session) {
        return {
          ...profile,
          staffName: session.staffName,
          regionText: session.staffPhone,
        }
      }
      return profile
    })
}

export async function updateStaffProfile(params: UpdateStaffProfileParams) {
  return http.put<StaffProfile>('/staff/profile', params, undefined, await staffHeaders())
}
