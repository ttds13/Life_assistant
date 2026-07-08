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

function assertRunId(runId?: string) {
  if (!runId || !runId.startsWith('DAY38_TEST_')) {
    throw new Error('refuse cleanup: --run-id must start with DAY38_TEST_')
  }
}

async function collect(runId: string) {
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { remark: { contains: runId } },
        { adminRemark: { contains: runId } },
      ],
    },
    select: { id: true, orderNo: true, userId: true },
  })
  const orderIds = orders.map(item => item.id)
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { nickname: { contains: runId } },
        { id: { in: orders.map(item => item.userId) } },
      ],
    },
    select: { id: true, phone: true },
  })
  const userIds = users.map(item => item.id)
  const coupons = await prisma.coupon.findMany({
    where: { name: { contains: runId } },
    select: { id: true },
  })
  const couponIds = coupons.map(item => item.id)
  const services = await prisma.service.findMany({
    where: {
      OR: [
        { name: { contains: runId } },
        { code: { contains: runId } },
      ],
    },
    select: { id: true, categoryId: true },
  })
  const serviceIds = services.map(item => item.id)
  const categoryIdsFromServices = services.map(item => item.categoryId)
  const categories = await prisma.serviceCategory.findMany({
    where: { name: { contains: runId } },
    select: { id: true },
  })
  const categoryIds = Array.from(new Set([...categoryIdsFromServices, ...categories.map(item => item.id)]))
  const staff = await prisma.staff.findMany({
    where: {
      OR: [
        { name: { contains: runId } },
        { phone: { contains: phoneDigits(runId) } },
      ],
    },
    select: { id: true },
  })
  const staffIds = staff.map(item => item.id)
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
  const withdraws = await prisma.withdrawRequest.findMany({
    where: {
      OR: [
        { requestId: { contains: runId } },
        { notifyRaw: { contains: runId } },
        { incomeRecords: { some: { orderId: { in: orderIds } } } },
      ],
    },
    select: { id: true },
  })
  const withdrawIds = withdraws.map(item => item.id)
  const tickets = await prisma.ticket.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } })
  const ticketIds = tickets.map(item => item.id)
  const reviews = await prisma.review.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } })
  const reviewIds = reviews.map(item => item.id)

  return { runId, orders, orderIds, users, userIds, couponIds, serviceIds, categoryIds, staffIds, paymentIds, paymentNos, withdrawIds, ticketIds, reviewIds }
}

function phoneDigits(runId: string) {
  return runId.replace(/\D/g, '').slice(-8)
}

function summary(data: Awaited<ReturnType<typeof collect>>) {
  return {
    runId: data.runId,
    orders: data.orderIds.length,
    users: data.userIds.length,
    coupons: data.couponIds.length,
    services: data.serviceIds.length,
    serviceCategories: data.categoryIds.length,
    staff: data.staffIds.length,
    payments: data.paymentIds.length,
    withdraws: data.withdrawIds.length,
    tickets: data.ticketIds.length,
    reviews: data.reviewIds.length,
  }
}

async function cleanup(data: Awaited<ReturnType<typeof collect>>) {
  await prisma.$transaction(async (tx) => {
    await tx.withdrawStatusLog.deleteMany({ where: { withdrawRequestId: { in: data.withdrawIds } } })
    await tx.staffIncomeRecord.deleteMany({ where: { OR: [{ orderId: { in: data.orderIds } }, { withdrawRequestId: { in: data.withdrawIds } }] } })
    await tx.withdrawRequest.deleteMany({ where: { id: { in: data.withdrawIds } } })

    await tx.ticketMessage.deleteMany({ where: { ticketId: { in: data.ticketIds } } })
    await tx.ticket.deleteMany({ where: { id: { in: data.ticketIds } } })
    await tx.reviewImage.deleteMany({ where: { reviewId: { in: data.reviewIds } } })
    await tx.review.deleteMany({ where: { id: { in: data.reviewIds } } })
    await tx.servicePhoto.deleteMany({ where: { orderId: { in: data.orderIds } } })
    await tx.serviceCheckin.deleteMany({ where: { orderId: { in: data.orderIds } } })

    await tx.refund.deleteMany({ where: { OR: [{ orderId: { in: data.orderIds } }, { paymentId: { in: data.paymentIds } }, { reason: { contains: data.runId } }, { notifyRaw: { contains: data.runId } }] } })
    await tx.paymentNotifyLog.deleteMany({ where: { OR: [{ paymentId: { in: data.paymentIds } }, { paymentNo: { in: data.paymentNos } }, { rawBody: { contains: data.runId } }] } })
    await tx.payment.deleteMany({ where: { id: { in: data.paymentIds } } })

    await tx.pointLedger.deleteMany({ where: { OR: [{ orderId: { in: data.orderIds } }, { remark: { contains: data.runId } }] } })
    await tx.userCoupon.deleteMany({ where: { OR: [{ usedOrderId: { in: data.orderIds } }, { userId: { in: data.userIds } }, { couponId: { in: data.couponIds } }] } })
    await tx.notification.deleteMany({ where: { OR: [{ bizType: 'order', bizId: { in: data.orderIds } }, { title: { contains: data.runId } }, { content: { contains: data.runId } }] } })
    await tx.memberCardRecord.deleteMany({ where: { orderId: { in: data.orderIds } } })
    await tx.orderAssignment.deleteMany({ where: { orderId: { in: data.orderIds } } })
    await tx.orderStatusLog.deleteMany({ where: { OR: [{ orderId: { in: data.orderIds } }, { requestId: { contains: data.runId } }] } })
    await tx.file.deleteMany({ where: { OR: [{ bizType: 'order', bizId: { in: data.orderIds } }, { source: { contains: data.runId } }, { remark: { contains: data.runId } }] } })
    await tx.order.deleteMany({ where: { id: { in: data.orderIds } } })

    await tx.address.deleteMany({
      where: {
        OR: [
          { ownerType: 'user', ownerId: { in: data.userIds } },
          { detailAddress: { contains: data.runId } },
          { formattedAddress: { contains: data.runId } },
        ],
      },
    })
    await tx.serviceFavorite.deleteMany({ where: { OR: [{ userId: { in: data.userIds } }, { serviceId: { in: data.serviceIds } }] } })
    await tx.userRefreshToken.deleteMany({ where: { userId: { in: data.userIds } } })
    await tx.user.deleteMany({ where: { id: { in: data.userIds } } })
    await tx.coupon.deleteMany({ where: { id: { in: data.couponIds } } })
    await tx.staff.deleteMany({ where: { id: { in: data.staffIds } } })
    await tx.serviceImage.deleteMany({ where: { serviceId: { in: data.serviceIds } } })
    await tx.servicePriceRule.deleteMany({ where: { serviceId: { in: data.serviceIds } } })
    await tx.service.deleteMany({ where: { id: { in: data.serviceIds } } })
    await tx.serviceCategory.deleteMany({ where: { id: { in: data.categoryIds } } })
    await tx.auditLog.deleteMany({
      where: {
        OR: [
          { requestId: { contains: data.runId } },
        ],
      },
    })
  })
}

async function main() {
  const runId = arg('run-id')
  assertRunId(runId)
  const data = await collect(runId!)
  const before = summary(data)
  const confirm = hasFlag('confirm')
  const dryRun = hasFlag('dry-run') || !confirm

  if (dryRun) {
    console.log(JSON.stringify({ mode: 'dry-run', ...before }, null, 2))
    return
  }

  await cleanup(data)
  const after = summary(await collect(runId!))
  console.log(JSON.stringify({ mode: 'confirm', before, after }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
