const fs = require('node:fs/promises')
const path = require('node:path')
const { config } = require('../config/env')
const { readDb } = require('../data/local-db')

async function writeDb(db) {
  await fs.mkdir(path.dirname(config.dataFile), { recursive: true })
  await fs.writeFile(config.dataFile, `${JSON.stringify(db, null, 2)}\n`, 'utf8')
}

async function findUserByPhone(phone) {
  const db = await readDb()
  return db.users.find(u => u.phone === phone) || null
}

async function findUserById(id) {
  const db = await readDb()
  return db.users.find(u => u.id === id) || null
}

async function createUser({ phone, nickname, avatar, role }) {
  const db = await readDb()
  const id = (db.users.length ? Math.max(...db.users.map(u => u.id)) : 0) + 1
  const now = new Date().toISOString()
  const user = { id, phone, nickname, avatar: avatar || '', status: 1, role: role || 'user', createdAt: now, updatedAt: now }
  db.users.push(user)
  await writeDb(db)
  return user
}

async function updateUser(id, fields) {
  const db = await readDb()
  const user = db.users.find(u => u.id === id)
  if (!user) return null
  Object.assign(user, fields, { updatedAt: new Date().toISOString() })
  await writeDb(db)
  return user
}

async function findOauthByProviderAndOpenid(provider, openid) {
  const db = await readDb()
  return db.userOauth.find(o => o.provider === provider && o.openid === openid) || null
}

async function createOauth({ userId, provider, openid, unionid, sessionKey }) {
  const db = await readDb()
  const id = (db.userOauth.length ? Math.max(...db.userOauth.map(o => o.id)) : 0) + 1
  const now = new Date().toISOString()
  const record = { id, userId, provider, openid, unionid: unionid || '', sessionKey: sessionKey || '', createdAt: now, updatedAt: now }
  db.userOauth.push(record)
  await writeDb(db)
  return record
}

async function updateOauth(id, fields) {
  const db = await readDb()
  const record = db.userOauth.find(o => o.id === id)
  if (!record) return null
  Object.assign(record, fields, { updatedAt: new Date().toISOString() })
  await writeDb(db)
  return record
}

module.exports = {
  findUserByPhone,
  findUserById,
  createUser,
  updateUser,
  findOauthByProviderAndOpenid,
  createOauth,
  updateOauth,
}
