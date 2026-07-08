import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function arg(name: string) {
  const prefix = `--${name}=`
  const matched = process.argv.find(item => item.startsWith(prefix))
  if (matched) return matched.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const orderIdText = arg('order-id')
  const runId = arg('run-id')
  const where = orderIdText
    ? { id: BigInt(Number(orderIdText)) }
    : runId
      ? {
          OR: [
            { remark: { contains: runId } },
            { adminRemark: { contains: runId } },
          ],
        }
      : undefined

  if (!where) {
    throw new Error('required: --order-id <id> or --run-id <DAY38_TEST_xxx>')
  }

  const orders = await prisma.order.findMany({
    where,
    include: {
      payments: true,
      refunds: true,
      pointLedgers: true,
      incomeRecords: true,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })

  const results = []
  for (const order of orders) {
    const successPayments = order.payments.filter(item => item.status === 'success')
    const couponRecord = order.couponId
      ? await prisma.userCoupon.findFirst({ where: { usedOrderId: order.id, couponId: order.couponId } })
      : null
    const checks = [
      { key: 'payment', passed: !order.paidAt || successPayments.length > 0 },
      { key: 'paid_amount', passed: !order.paidAt || successPayments.some(item => item.amount.equals(order.paidAmount)) },
      { key: 'points', passed: !order.paidAt || order.orderType === 'member_card_purchase' || order.pointLedgers.some(item => item.type === 'earn') },
      { key: 'coupon', passed: !order.couponId || Boolean(couponRecord) },
      { key: 'income', passed: order.status !== 'completed' || !order.staffId || order.incomeRecords.length > 0 },
      { key: 'refund_reversal', passed: order.status !== 'refunded' || order.pointLedgers.some(item => item.type === 'refund_deduct') || !order.paidAt },
      { key: 'offline_payment', passed: order.source !== 'offline' && order.source !== 'admin' || !order.paidAt || successPayments.some(item => item.channel === 'offline') },
    ]
    results.push({
      orderId: Number(order.id),
      orderNo: order.orderNo,
      status: order.status,
      passed: checks.every(item => item.passed),
      checks,
      payments: order.payments.map(item => ({ id: Number(item.id), channel: item.channel, status: item.status, amount: item.amount.toNumber() })),
      pointLedgers: order.pointLedgers.map(item => ({ id: Number(item.id), type: item.type, points: item.points, amount: item.amount?.toNumber() || 0 })),
      incomeRecords: order.incomeRecords.map(item => ({ id: Number(item.id), type: item.type, status: item.status, amount: item.amount.toNumber(), withdrawStatus: item.withdrawStatus })),
      refunds: order.refunds.map(item => ({ id: Number(item.id), status: item.status, amount: item.amount.toNumber() })),
    })
  }

  console.log(JSON.stringify({ total: results.length, passed: results.every(item => item.passed), results }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

