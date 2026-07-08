import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function arg(name: string) {
  const prefix = `--${name}=`
  const matched = process.argv.find(item => item.startsWith(prefix))
  if (matched) return matched.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`)
}

function assertRunId(runId?: string): asserts runId is string {
  if (!runId || !runId.startsWith('DAY40_TEST_')) {
    throw new Error('refuse cleanup: --run-id must start with DAY40_TEST_')
  }
}

function phoneDigits(runId: string) {
  return runId.replace(/\D/g, '').slice(-8)
}

async function collect(runId: string) {
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { remark: { contains: runId } },
        { adminRemark: { contains: runId } },
        { service: { name: { contains: runId } } },
        { user: { nickname: { contains: runId } } },
      ],
    },
    select: { id: true, orderNo: true, userId: true, staffId: true, serviceId: true },
  })
  const orderIds = orders.map(item => item.id)
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { nickname: { contains: runId } },
        { adminRemark: { contains: runId } },
        { id: { in: orders.map(item => item.userId) } },
      ],
    },
    select: { id: true },
  })
  const userIds = users.map(item => item.id)
  const services = await prisma.service.findMany({
    where: {
      OR: [
        { id: { in: orders.map(item => item.serviceId) } },
        { name: { contains: runId } },
        { code: { contains: runId.toLowerCase() } },
      ],
    },
    select: { id: true, categoryId: true },
  })
  const serviceIds = services.map(item => item.id)
  const categories = await prisma.serviceCategory.findMany({
    where: {
      OR: [
        { id: { in: services.map(item => item.categoryId) } },
        { name: { contains: runId } },
      ],
    },
    select: { id: true },
  })
  const staff = await prisma.staff.findMany({
    where: {
      OR: [
        { id: { in: orders.map(item => item.staffId).filter((id): id is bigint => Boolean(id)) } },
        { name: { contains: runId } },
        { phone: { contains: phoneDigits(runId) } },
        { applicationNote: { contains: runId } },
      ],
    },
    select: { id: true },
  })
  const staffIds = staff.map(item => item.id)
  const profileRequests = await prisma.staffProfileChangeRequest.findMany({
    where: {
      OR: [
        { staffId: { in: staffIds } },
        { submitNote: { contains: runId } },
        { rejectReason: { contains: runId } },
      ],
    },
    select: { id: true },
  })
  const profileRequestIds = profileRequests.map(item => item.id)
  const notifications = await prisma.notification.findMany({
    where: {
      OR: [
        { receiverType: 'staff', receiverId: { in: staffIds } },
        { bizType: 'order', bizId: { in: orderIds } },
        { bizType: 'staff_profile_change', bizId: { in: profileRequestIds } },
        { title: { contains: runId } },
        { content: { contains: runId } },
      ],
    },
    select: { id: true },
  })
  const notificationIds = notifications.map(item => item.id)
  const orderAssignments = await prisma.orderAssignment.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } })
  const orderStatusLogs = await prisma.orderStatusLog.findMany({
    where: {
      OR: [
        { orderId: { in: orderIds } },
        { requestId: { contains: runId } },
        { remark: { contains: runId } },
      ],
    },
    select: { id: true },
  })
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { requestId: { contains: runId } },
        { module: 'staff_profile', targetId: { in: profileRequestIds } },
        { module: 'notification', targetId: { in: notificationIds } },
        { module: 'order', targetId: { in: orderIds } },
      ],
    },
    select: { id: true },
  })

  return {
    runId,
    orderIds,
    orderNos: orders.map(item => item.orderNo),
    userIds,
    serviceIds,
    categoryIds: categories.map(item => item.id),
    staffIds,
    profileRequestIds,
    notificationIds,
    orderAssignmentIds: orderAssignments.map(item => item.id),
    orderStatusLogIds: orderStatusLogs.map(item => item.id),
    auditLogIds: auditLogs.map(item => item.id),
  }
}

function summary(data: Awaited<ReturnType<typeof collect>>) {
  return {
    runId: data.runId,
    orders: data.orderIds.length,
    orderNos: data.orderNos,
    users: data.userIds.length,
    services: data.serviceIds.length,
    serviceCategories: data.categoryIds.length,
    staff: data.staffIds.length,
    profileRequests: data.profileRequestIds.length,
    notifications: data.notificationIds.length,
    orderAssignments: data.orderAssignmentIds.length,
    orderStatusLogs: data.orderStatusLogIds.length,
    auditLogs: data.auditLogIds.length,
  }
}

async function deleteByIds(modelName: string, ids: bigint[], fn: () => Promise<unknown>) {
  if (!ids.length) return
  await fn()
  console.log(`deleted ${modelName}: ${ids.length}`)
}

async function cleanup(data: Awaited<ReturnType<typeof collect>>) {
  await prisma.$transaction(async (tx) => {
    await deleteByIds('audit_logs', data.auditLogIds, () => tx.auditLog.deleteMany({ where: { id: { in: data.auditLogIds } } }))
    await deleteByIds('notifications', data.notificationIds, () => tx.notification.deleteMany({ where: { id: { in: data.notificationIds } } }))
    await deleteByIds('staff_profile_change_requests', data.profileRequestIds, () => tx.staffProfileChangeRequest.deleteMany({ where: { id: { in: data.profileRequestIds } } }))
    await deleteByIds('order_assignments', data.orderAssignmentIds, () => tx.orderAssignment.deleteMany({ where: { id: { in: data.orderAssignmentIds } } }))
    await deleteByIds('order_status_logs', data.orderStatusLogIds, () => tx.orderStatusLog.deleteMany({ where: { id: { in: data.orderStatusLogIds } } }))
    await deleteByIds('orders', data.orderIds, () => tx.order.deleteMany({ where: { id: { in: data.orderIds } } }))
    await deleteByIds('staff', data.staffIds, () => tx.staff.deleteMany({ where: { id: { in: data.staffIds } } }))
    await deleteByIds('users', data.userIds, () => tx.user.deleteMany({ where: { id: { in: data.userIds } } }))
    await deleteByIds('services', data.serviceIds, () => tx.service.deleteMany({ where: { id: { in: data.serviceIds } } }))
    await deleteByIds('service_categories', data.categoryIds, () => tx.serviceCategory.deleteMany({ where: { id: { in: data.categoryIds } } }))
  })
}

async function main() {
  const runId = arg('run-id')
  assertRunId(runId)
  const data = await collect(runId)
  console.log(JSON.stringify({ dryRun: !hasFlag('confirm'), summary: summary(data) }, null, 2))
  if (!hasFlag('confirm')) return
  await cleanup(data)
  const after = await collect(runId)
  console.log(JSON.stringify({ cleaned: true, summary: summary(after) }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
