import { strict as assert } from 'node:assert'
import { PrismaClient } from '@prisma/client'
import { serialize } from '../src/common/serialize/serialize'

const prisma = new PrismaClient()
const baseUrl = process.env.DB_VERIFY_BASE_URL || 'http://127.0.0.1:3100/api'

async function main() {
  await prisma.$queryRaw`SELECT 1`

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
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
