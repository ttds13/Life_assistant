const { readDb } = require('../data/local-db')

function sortByOrder(items) {
  return items.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.id - b.id
  })
}

async function findCategories(query = {}) {
  const db = await readDb()
  let items = [...db.serviceCategories]

  if (query.status !== undefined) {
    items = items.filter(item => item.status === query.status)
  }

  return sortByOrder(items)
}

async function findServices(query = {}) {
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
    items = items.filter((item) => {
      return item.name.toLowerCase().includes(keyword)
        || item.description.toLowerCase().includes(keyword)
    })
  }

  return sortByOrder(items)
}

async function findServiceById(id) {
  const db = await readDb()
  return db.services.find(item => item.id === id) || null
}

module.exports = {
  findCategories,
  findServices,
  findServiceById,
}
