import { PrismaClient } from '@prisma/client'
import { seedServiceData } from './seed-service-data'

const prisma = new PrismaClient()

async function main() {
  const reset = process.argv.includes('--reset')
  const result = await seedServiceData(prisma, {
    reset,
    allowReset: process.env.SEED_ALLOW_SERVICE_RESET === 'true',
  })
  console.log(JSON.stringify(result, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
