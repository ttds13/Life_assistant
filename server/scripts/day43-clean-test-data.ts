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
  if (!runId || !runId.startsWith('DAY43_TEST_')) {
    throw new Error('refuse cleanup: --run-id must start with DAY43_TEST_')
  }
}

async function collect(runId: string) {
  const services = await prisma.service.findMany({
    where: {
      OR: [
        { name: { contains: runId } },
        { code: { contains: runId.toLowerCase() } },
        { description: { contains: runId } },
      ],
    },
    select: { id: true, categoryId: true },
  })
  const serviceIds = services.map(item => item.id)
  const categories = await prisma.serviceCategory.findMany({
    where: { name: { contains: runId } },
    select: { id: true },
  })
  const categoryIds = Array.from(new Set([
    ...categories.map(item => item.id.toString()),
    ...services.map(item => item.categoryId.toString()),
  ])).map(id => BigInt(id))
  const memberCards = await prisma.memberCard.findMany({
    where: { name: { contains: runId } },
    select: { id: true },
  })
  const memberCardIds = memberCards.map(item => item.id)
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { nickname: { contains: runId } },
        { adminRemark: { contains: runId } },
      ],
    },
    select: { id: true },
  })
  const userIds = users.map(item => item.id)
  const userMemberCards = await prisma.userMemberCard.findMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        { cardId: { in: memberCardIds } },
      ],
    },
    select: { id: true },
  })
  const userMemberCardIds = userMemberCards.map(item => item.id)
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { remark: { contains: runId } },
        { adminRemark: { contains: runId } },
        { userId: { in: userIds } },
        { serviceId: { in: serviceIds } },
        { purchaseCardId: { in: memberCardIds } },
        { memberCardId: { in: userMemberCardIds } },
        { grantedUserMemberCardId: { in: userMemberCardIds } },
      ],
    },
    select: { id: true, orderNo: true },
  })
  const orderIds = orders.map(item => item.id)
  const payments = await prisma.payment.findMany({
    where: {
      OR: [
        { orderId: { in: orderIds } },
        { callbackRaw: { contains: runId } },
      ],
    },
    select: { id: true, paymentNo: true },
  })
  const paymentIds = payments.map(item => item.id)
  const paymentNos = payments.map(item => item.paymentNo)
  const staff = await prisma.staff.findMany({
    where: { name: { contains: runId } },
    select: { id: true },
  })
  const staffIds = staff.map(item => item.id)
  const addresses = await prisma.address.findMany({
    where: {
      OR: [
        { ownerType: 'user', ownerId: { in: userIds } },
        { detailAddress: { contains: runId } },
        { formattedAddress: { contains: runId } },
      ],
    },
    select: { id: true },
  })

  return {
    serviceIds,
    categoryIds,
    memberCardIds,
    userIds,
    userMemberCardIds,
    orderIds,
    paymentIds,
    paymentNos,
    staffIds,
    addressIds: addresses.map(item => item.id),
  }
}

async function countAll(ids: Awaited<ReturnType<typeof collect>>, runId: string) {
  const [
    paymentNotifyLogs,
    refunds,
    payments,
    servicePhotos,
    serviceCheckins,
    assignments,
    notifications,
    incomeRecords,
    orderStatusLogs,
    memberCardRecords,
    pointLedgers,
    orders,
    addresses,
    userMemberCards,
    memberCardServiceRules,
    memberCards,
    auditLogs,
    staff,
    services,
    serviceCategories,
    users,
  ] = await Promise.all([
    prisma.paymentNotifyLog.count({ where: { OR: [{ paymentId: { in: ids.paymentIds } }, { paymentNo: { in: ids.paymentNos } }, { rawBody: { contains: runId } }] } }),
    prisma.refund.count({ where: { OR: [{ orderId: { in: ids.orderIds } }, { paymentId: { in: ids.paymentIds } }, { reason: { contains: runId } }] } }),
    prisma.payment.count({ where: { id: { in: ids.paymentIds } } }),
    prisma.servicePhoto.count({ where: { orderId: { in: ids.orderIds } } }),
    prisma.serviceCheckin.count({ where: { orderId: { in: ids.orderIds } } }),
    prisma.orderAssignment.count({ where: { orderId: { in: ids.orderIds } } }),
    prisma.notification.count({ where: { OR: [{ bizType: 'order', bizId: { in: ids.orderIds } }, { content: { contains: runId } }, { title: { contains: runId } }] } }),
    prisma.staffIncomeRecord.count({ where: { orderId: { in: ids.orderIds } } }),
    prisma.orderStatusLog.count({ where: { OR: [{ orderId: { in: ids.orderIds } }, { requestId: { contains: runId } }, { remark: { contains: runId } }] } }),
    prisma.memberCardRecord.count({ where: { OR: [{ orderId: { in: ids.orderIds } }, { userMemberCardId: { in: ids.userMemberCardIds } }, { remark: { contains: runId } }] } }),
    prisma.pointLedger.count({ where: { OR: [{ orderId: { in: ids.orderIds } }, { userId: { in: ids.userIds } }, { remark: { contains: runId } }] } }),
    prisma.order.count({ where: { id: { in: ids.orderIds } } }),
    prisma.address.count({ where: { id: { in: ids.addressIds } } }),
    prisma.userMemberCard.count({ where: { id: { in: ids.userMemberCardIds } } }),
    prisma.memberCardServiceRule.count({ where: { OR: [{ memberCardId: { in: ids.memberCardIds } }, { serviceId: { in: ids.serviceIds } }] } }),
    prisma.memberCard.count({ where: { id: { in: ids.memberCardIds } } }),
    prisma.auditLog.count({ where: { requestId: { contains: runId } } }),
    prisma.staff.count({ where: { id: { in: ids.staffIds } } }),
    prisma.service.count({ where: { id: { in: ids.serviceIds } } }),
    prisma.serviceCategory.count({ where: { id: { in: ids.categoryIds } } }),
    prisma.user.count({ where: { id: { in: ids.userIds } } }),
  ])
  return {
    paymentNotifyLogs,
    refunds,
    payments,
    servicePhotos,
    serviceCheckins,
    assignments,
    notifications,
    incomeRecords,
    orderStatusLogs,
    memberCardRecords,
    pointLedgers,
    orders,
    addresses,
    userMemberCards,
    memberCardServiceRules,
    memberCards,
    auditLogs,
    staff,
    services,
    serviceCategories,
    users,
  }
}

async function cleanup(ids: Awaited<ReturnType<typeof collect>>, runId: string) {
  await prisma.paymentNotifyLog.deleteMany({ where: { OR: [{ paymentId: { in: ids.paymentIds } }, { paymentNo: { in: ids.paymentNos } }, { rawBody: { contains: runId } }] } })
  await prisma.refund.deleteMany({ where: { OR: [{ orderId: { in: ids.orderIds } }, { paymentId: { in: ids.paymentIds } }, { reason: { contains: runId } }] } })
  await prisma.payment.deleteMany({ where: { id: { in: ids.paymentIds } } })
  await prisma.servicePhoto.deleteMany({ where: { orderId: { in: ids.orderIds } } })
  await prisma.serviceCheckin.deleteMany({ where: { orderId: { in: ids.orderIds } } })
  await prisma.orderAssignment.deleteMany({ where: { orderId: { in: ids.orderIds } } })
  await prisma.notification.deleteMany({ where: { OR: [{ bizType: 'order', bizId: { in: ids.orderIds } }, { content: { contains: runId } }, { title: { contains: runId } }] } })
  await prisma.staffIncomeRecord.deleteMany({ where: { orderId: { in: ids.orderIds } } })
  await prisma.orderStatusLog.deleteMany({ where: { OR: [{ orderId: { in: ids.orderIds } }, { requestId: { contains: runId } }, { remark: { contains: runId } }] } })
  await prisma.memberCardRecord.deleteMany({ where: { OR: [{ orderId: { in: ids.orderIds } }, { userMemberCardId: { in: ids.userMemberCardIds } }, { remark: { contains: runId } }] } })
  await prisma.pointLedger.deleteMany({ where: { OR: [{ orderId: { in: ids.orderIds } }, { userId: { in: ids.userIds } }, { remark: { contains: runId } }] } })
  await prisma.order.deleteMany({ where: { id: { in: ids.orderIds } } })
  await prisma.address.deleteMany({ where: { id: { in: ids.addressIds } } })
  await prisma.userMemberCard.deleteMany({ where: { id: { in: ids.userMemberCardIds } } })
  await prisma.memberCardServiceRule.deleteMany({ where: { OR: [{ memberCardId: { in: ids.memberCardIds } }, { serviceId: { in: ids.serviceIds } }] } })
  await prisma.memberCard.deleteMany({ where: { id: { in: ids.memberCardIds } } })
  await prisma.auditLog.deleteMany({ where: { requestId: { contains: runId } } })
  await prisma.staff.deleteMany({ where: { id: { in: ids.staffIds } } })
  await prisma.service.deleteMany({ where: { id: { in: ids.serviceIds } } })
  await prisma.serviceCategory.deleteMany({ where: { id: { in: ids.categoryIds } } })
  await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } })
}

async function main() {
  const runId = arg('run-id')
  assertRunId(runId)
  const ids = await collect(runId)
  const before = await countAll(ids, runId)
  if (!hasFlag('confirm')) {
    console.log(JSON.stringify({ mode: 'dry-run', runId, before }, null, 2))
    return
  }
  await cleanup(ids, runId)
  const afterIds = await collect(runId)
  const after = await countAll(afterIds, runId)
  console.log(JSON.stringify({ mode: 'confirmed', runId, before, after }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
