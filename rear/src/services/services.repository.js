const { config } = require('../config/env')
const { serialize } = require('../common/serialize')

// JSON 模式
const { readDb } = require('../data/local-db')

// Prisma 模式
let getPrisma
if (config.dbMode === 'prisma') {
  getPrisma = require('../common/prisma').getPrisma
}

function sortByOrder(items) {
  return items.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.id - b.id
  })
}

// ===== JSON 模式实现 =====
async function findCategoriesJson(query = {}) {
  const db = await readDb()
  let items = [...db.serviceCategories]
  if (query.status !== undefined) {
    items = items.filter(item => item.status === query.status)
  }
  return sortByOrder(items)
}

async function findServicesJson(query = {}) {
  const db = await readDb()
  let items = [...db.services]
  if (query.status !== undefined) {
    items = items.filter(item => item.status === query.status)
  }
  if (query.categoryId !== undefined) {
    items = items.filter(item => item.categoryId === query.categoryId)
  }
  if (query.keyword) {
    const keyword = query.keyword.toLowerCase()
    items = items.filter(item =>
      item.name.toLowerCase().includes(keyword)
      || item.description.toLowerCase().includes(keyword),
    )
  }
  return sortByOrder(items)
}

async function findServiceByIdJson(id) {
  const db = await readDb()
  return db.services.find(item => item.id === id) || null
}

// ===== Prisma 模式实现 =====
async function findCategoriesPrisma(query = {}) {
  const prisma = getPrisma()
  const where = {}
  if (query.status !== undefined) where.status = query.status
  const items = await prisma.serviceCategory.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })
  return serialize(items)
}

async function findServicesPrisma(query = {}) {
  const prisma = getPrisma()
  const where = {}
  if (query.status !== undefined) where.status = query.status
  if (query.categoryId !== undefined) where.categoryId = BigInt(query.categoryId)
  if (query.keyword) {
    where.name = { contains: query.keyword }
  }

  const findOptions = {
    where,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  }

  if (query.page !== undefined || query.pageSize !== undefined) {
    const page = query.page || 1
    const pageSize = query.pageSize || 20
    findOptions.skip = (page - 1) * pageSize
    findOptions.take = pageSize
  }

  const items = await prisma.service.findMany(findOptions)
  return serialize(items)
}

async function findServiceByIdPrisma(id) {
  const prisma = getPrisma()
  const item = await prisma.service.findUnique({
    where: { id: BigInt(id) },
    include: { category: true, images: true },
  })
  return item ? serialize(item) : null
}

// ===== 导出（根据 dbMode 选择） =====
const usePrisma = config.dbMode === 'prisma'

module.exports = {
  findCategories: usePrisma ? findCategoriesPrisma : findCategoriesJson,
  findServices: usePrisma ? findServicesPrisma : findServicesJson,
  findServiceById: usePrisma ? findServiceByIdPrisma : findServiceByIdJson,
}
