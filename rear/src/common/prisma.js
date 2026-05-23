const { PrismaClient } = require('@prisma/client')

let prisma = null

function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error'],
    })
  }
  return prisma
}

async function disconnectPrisma() {
  if (prisma) {
    await prisma.$disconnect()
    prisma = null
  }
}

async function checkDbConnection() {
  try {
    const client = getPrisma()
    await client.$queryRaw`SELECT 1`
    return true
  }
  catch (err) {
    console.error('[DB] 数据库连接失败:', err.message)
    return false
  }
}

module.exports = { getPrisma, disconnectPrisma, checkDbConnection }
