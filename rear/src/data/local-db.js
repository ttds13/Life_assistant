const fs = require('node:fs/promises')
const path = require('node:path')
const { config } = require('../config/env')
const { createSeedData } = require('./seed-data')

let initialized = false

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  }
  catch {
    return false
  }
}

async function writeDb(db) {
  await fs.mkdir(path.dirname(config.dataFile), { recursive: true })
  await fs.writeFile(config.dataFile, `${JSON.stringify(db, null, 2)}\n`, 'utf8')
  return clone(db)
}

async function seedDb() {
  const db = createSeedData()
  await writeDb(db)
  return {
    serviceCategories: db.serviceCategories.length,
    services: db.services.length,
    dataFile: config.dataFile,
  }
}

async function ensureDb() {
  if (initialized) return

  const exists = await pathExists(config.dataFile)
  if (!exists) {
    await seedDb()
  }
  initialized = true
}

async function readDb() {
  await ensureDb()
  const raw = await fs.readFile(config.dataFile, 'utf8')
  const db = JSON.parse(raw)
  if (!db.users) db.users = []
  if (!db.userOauth) db.userOauth = []
  return db
}

module.exports = {
  readDb,
  seedDb,
}
