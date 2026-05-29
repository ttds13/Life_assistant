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
} from './types/staff'

export const mockStaffTasks: StaffTask[] = [
  {
    id: 901,
    orderNo: 'ST202605290901',
    status: 'pending_accept',
    group: 'grab',
    serviceName: '家庭日常保洁',
    serviceSpec: '3 小时上门保洁',
    serviceRequirement: '厨房、卫生间重点清洁，客厅地面拖洗。',
    appointmentTime: '今天 14:00-17:00',
    customerName: '李女士',
    customerPhone: '13800138001',
    addressText: '吉林大学南岭校区 3 公寓 2 单元 602',
    distanceText: '1.8km',
    remark: '家里有老人，进门请轻声。',
    incomeAmount: 96,
    createdAt: '2026-05-29 09:12',
    photos: [],
  },
  {
    id: 902,
    orderNo: 'ST202605290902',
    status: 'accepted',
    group: 'dispatch',
    serviceName: '开荒保洁',
    serviceSpec: '两居室 78m2',
    serviceRequirement: '新房装修后首次清洁，玻璃和地面重点处理。',
    appointmentTime: '今天 16:30-19:30',
    customerName: '王先生',
    customerPhone: '13900139002',
    addressText: '黄岛区长江中路 118 号海岸花园 8 号楼 1201',
    distanceText: '3.2km',
    remark: '到小区门口联系客户开门。',
    incomeAmount: 168,
    createdAt: '2026-05-29 10:05',
    acceptedAt: '2026-05-29 10:20',
    photos: [],
  },
  {
    id: 903,
    orderNo: 'ST202605290903',
    status: 'in_service',
    group: 'dispatch',
    serviceName: '窗帘清洗',
    serviceSpec: '4 副窗帘拆洗',
    serviceRequirement: '卧室窗帘需单独打包，客厅窗帘现场拍照。',
    appointmentTime: '今天 11:00-13:00',
    customerName: '赵女士',
    customerPhone: '13700137003',
    addressText: '黄岛区香江路 66 号 5 号楼 803',
    distanceText: '0.9km',
    remark: '请带鞋套。',
    incomeAmount: 128,
    createdAt: '2026-05-29 08:30',
    acceptedAt: '2026-05-29 08:45',
    checkinAt: '2026-05-29 10:55',
    startedAt: '2026-05-29 11:02',
    photos: [
      {
        id: 'p903-1',
        url: '/static/images/default-avatar.png',
        type: 'before',
        createdAt: '2026-05-29 11:05',
      },
    ],
  },
  {
    id: 904,
    orderNo: 'ST202605280904',
    status: 'completed',
    group: 'dispatch',
    serviceName: '家电清洗',
    serviceSpec: '油烟机深度清洗',
    serviceRequirement: '拆洗油网，清理表面油污。',
    appointmentTime: '昨天 09:00-11:00',
    customerName: '陈先生',
    customerPhone: '13600136004',
    addressText: '市南区香港中路 9 号 1 单元 1802',
    distanceText: '已完成',
    remark: '服务后客户已验收。',
    incomeAmount: 88,
    createdAt: '2026-05-28 08:20',
    acceptedAt: '2026-05-28 08:23',
    checkinAt: '2026-05-28 08:58',
    startedAt: '2026-05-28 09:03',
    completedAt: '2026-05-28 10:42',
    photos: [
      {
        id: 'p904-1',
        url: '/static/images/default-avatar.png',
        type: 'after',
        createdAt: '2026-05-28 10:35',
      },
    ],
  },
]

const mockStats = {
  today: { period: 'today', newStaffCount: 0, newOrderCount: 2, writeOrderCount: 1, completedOrderCount: 1, commissionAmount: 193.5, bonusAmount: 0 },
  week: { period: 'week', newStaffCount: 1, newOrderCount: 12, writeOrderCount: 5, completedOrderCount: 8, commissionAmount: 986, bonusAmount: 60 },
  month: { period: 'month', newStaffCount: 3, newOrderCount: 46, writeOrderCount: 18, completedOrderCount: 39, commissionAmount: 3820, bonusAmount: 260 },
  total: { period: 'total', newStaffCount: 8, newOrderCount: 188, writeOrderCount: 72, completedOrderCount: 161, commissionAmount: 14860, bonusAmount: 960 },
} satisfies StaffProfile['stats']

function wait<T>(data: T) {
  return new Promise<T>((resolve) => {
    setTimeout(() => resolve(data), 120)
  })
}

function cloneTask(task: StaffTask): StaffTask {
  return {
    ...task,
    photos: task.photos ? task.photos.map(photo => ({ ...photo })) : [],
  }
}

function filterByOrderStatus(tasks: StaffTask[], status?: StaffOrderFilter) {
  if (!status)
    return tasks
  if (status === 'pending')
    return tasks.filter(item => item.status === 'pending_accept')
  if (status === 'processing')
    return tasks.filter(item => ['accepted', 'on_the_way', 'in_service', 'pending_confirm'].includes(item.status))
  return tasks.filter(item => item.status === 'completed')
}

function nextStatus(status: StaffTaskStatus): StaffTaskStatus {
  const map: Partial<Record<StaffTaskStatus, StaffTaskStatus>> = {
    pending_accept: 'accepted',
    accepted: 'on_the_way',
    on_the_way: 'in_service',
    in_service: 'pending_confirm',
  }
  return map[status] || status
}

function updateMockTask(id: number, patch: Partial<StaffTask>) {
  const index = mockStaffTasks.findIndex(item => item.id === id)
  if (index < 0)
    return null
  mockStaffTasks[index] = { ...mockStaffTasks[index], ...patch }
  return cloneTask(mockStaffTasks[index])
}

export function getStaffDashboard() {
  const tasks = mockStaffTasks.filter(item => item.status !== 'completed' && item.status !== 'cancelled' && item.status !== 'rejected')
  return wait<StaffDashboard>({
    pendingTaskCount: mockStaffTasks.filter(item => item.status === 'pending_accept').length,
    dispatchTaskCount: mockStaffTasks.filter(item => item.group === 'dispatch' && item.status === 'pending_accept').length,
    processingTaskCount: mockStaffTasks.filter(item => ['accepted', 'on_the_way', 'in_service', 'pending_confirm'].includes(item.status)).length,
    completedTaskCount: mockStaffTasks.filter(item => item.status === 'completed').length,
    todayEstimatedIncome: 260,
    tasks: tasks.map(cloneTask),
  })
}

export function getStaffTasks(params?: { group?: StaffTaskGroup, status?: StaffOrderFilter }) {
  let tasks = mockStaffTasks
  if (params?.group)
    tasks = tasks.filter(item => item.group === params.group)
  tasks = filterByOrderStatus(tasks, params?.status)
  return wait(tasks.map(cloneTask))
}

export function getStaffTaskDetail(id: number) {
  const task = mockStaffTasks.find(item => item.id === id) || mockStaffTasks[0]
  return wait(cloneTask(task))
}

export function acceptStaffTask(id: number) {
  return wait(updateMockTask(id, { status: 'accepted', acceptedAt: '刚刚' }) || cloneTask(mockStaffTasks[0]))
}

export function rejectStaffTask(id: number) {
  return wait(updateMockTask(id, { status: 'rejected' }) || cloneTask(mockStaffTasks[0]))
}

export function checkinStaffTask(id: number) {
  return wait(updateMockTask(id, { status: 'on_the_way', checkinAt: '刚刚' }) || cloneTask(mockStaffTasks[0]))
}

export function startStaffTask(id: number) {
  return wait(updateMockTask(id, { status: 'in_service', startedAt: '刚刚' }) || cloneTask(mockStaffTasks[0]))
}

export function completeStaffTask(id: number) {
  return wait(updateMockTask(id, { status: 'pending_confirm', completedAt: '刚刚' }) || cloneTask(mockStaffTasks[0]))
}

export function uploadStaffOrderPhotos(id: number, photos: StaffServicePhoto[]) {
  return wait(updateMockTask(id, { photos }) || cloneTask(mockStaffTasks[0]))
}

export function createStaffOrder(payload: CreateStaffOrderPayload) {
  const task: StaffTask = {
    id: Date.now(),
    orderNo: `ST${Date.now()}`,
    status: 'pending_accept',
    group: payload.dispatchMode === 'platform' ? 'dispatch' : 'grab',
    serviceName: payload.customServiceEnabled ? '自定义预约服务' : '家庭保洁服务',
    appointmentTime: payload.appointmentTime,
    customerName: '待补充客户',
    addressText: payload.serviceAddress,
    remark: payload.remark,
    createdAt: '刚刚',
    photos: payload.photos,
  }
  mockStaffTasks.unshift(task)
  return wait(cloneTask(task))
}

export function getStaffProfile(period?: StaffStatsPeriod) {
  const currentPeriod = period || 'today'
  return wait<StaffProfile>({
    staffName: '黄岛爱干净',
    avatar: '/static/images/default-avatar.png',
    verified: true,
    regionText: '山东省-青岛市-黄岛区',
    stats: {
      ...mockStats,
      [currentPeriod]: mockStats[currentPeriod],
    },
  })
}

