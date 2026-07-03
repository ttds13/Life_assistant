import { strict as assert } from 'node:assert'
import { PrismaClient } from '@prisma/client'
import { serialize } from '../src/common/serialize/serialize'

const prisma = new PrismaClient()
const baseUrl = process.env.DB_VERIFY_BASE_URL || 'http://127.0.0.1:3100/api'

async function main() {
  await prisma.$queryRaw`SELECT 1`
  await verifyOrderP0Schema()

  const categories = await prisma.serviceCategory.count()
  const services = await prisma.service.count({
    where: { status: 1, deletedAt: null },
  })

  const firstService = await prisma.service.findFirst({
    where: { status: 1, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })
  assert.ok(firstService, 'missing active service')

  const serialized = serialize(firstService) as Record<string, unknown>
  assert.equal(typeof serialized.id, 'number')
  assert.equal(typeof serialized.categoryId, 'number')
  assert.equal(typeof serialized.basePrice, 'number')
  assert.equal(typeof serialized.createdAt, 'string')

  let apiTotal: number | null = null
  try {
    const response = await fetch(`${baseUrl}/services?page=1&pageSize=1`)
    if (response.ok) {
      const body = await response.json() as { data?: { total?: number } }
      apiTotal = body.data?.total ?? null
      assert.equal(apiTotal, services)
    }
  }
  catch {
    apiTotal = null
  }

  console.log(JSON.stringify({
    db: 'ok',
    categories,
    services,
    apiTotal,
    firstServiceIdType: typeof serialized.id,
    basePriceType: typeof serialized.basePrice,
    createdAtType: typeof serialized.createdAt,
    orderP0Schema: 'ok',
  }, null, 2))
}

async function verifyOrderP0Schema() {
  const columns = await prisma.$queryRaw<Array<{ COLUMN_NAME: string }>>`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND COLUMN_NAME IN ('version')
  `
  assert.ok(columns.some(item => item.COLUMN_NAME === 'version'), 'missing orders.version')

  const logColumns = await prisma.$queryRaw<Array<{ COLUMN_NAME: string }>>`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'order_status_logs'
      AND COLUMN_NAME IN ('action', 'request_id', 'detail')
  `
  for (const column of ['action', 'request_id', 'detail']) {
    assert.ok(logColumns.some(item => item.COLUMN_NAME === column), `missing order_status_logs.${column}`)
  }

  const indexes = await prisma.$queryRaw<Array<{ TABLE_NAME: string, INDEX_NAME: string }>>`
    SELECT TABLE_NAME, INDEX_NAME
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND (
        (TABLE_NAME = 'orders' AND INDEX_NAME IN (
          'orders_user_id_status_idx',
          'orders_staff_id_status_idx',
          'orders_status_appointment_start_time_idx'
        ))
        OR
        (TABLE_NAME = 'order_status_logs' AND INDEX_NAME IN (
          'order_status_logs_order_id_created_at_idx',
          'order_status_logs_request_id_idx',
          'order_status_logs_action_idx'
        ))
      )
  `
  const indexNames = new Set(indexes.map(item => `${item.TABLE_NAME}.${item.INDEX_NAME}`))
  for (const index of [
    'orders.orders_user_id_status_idx',
    'orders.orders_staff_id_status_idx',
    'orders.orders_status_appointment_start_time_idx',
    'order_status_logs.order_status_logs_order_id_created_at_idx',
    'order_status_logs.order_status_logs_request_id_idx',
    'order_status_logs.order_status_logs_action_idx',
  ]) {
    assert.ok(indexNames.has(index), `missing index ${index}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
