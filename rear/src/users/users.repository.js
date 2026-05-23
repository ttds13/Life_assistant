const fs = require('node:fs/promises')
const path = require('node:path')
const { config } = require('../config/env')
const { serialize } = require('../common/serialize')

// JSON 模式
const { readDb } = require('../data/local-db')

// Prisma 模式
let getPrisma
if (config.dbMode === 'prisma') {
  getPrisma = require('../common/prisma').getPrisma
}

const usePrisma = config.dbMode === 'prisma'

// ===== JSON 模式实现 =====
async function writeDb(db) {
  await fs.mkdir(path.dirname(config.dataFile), { recursive: true })
  await fs.writeFile(config.dataFile, `${JSON.stringify(db, null, 2)}\n`, 'utf8')
}

async function findUserByPhoneJson(phone) {
  const db = await readDb()
  return db.users.find(u => u.phone === phone) || null
}

async function findUserByIdJson(id) {
  const db = await readDb()
  return db.users.find(u => u.id === id) || null
}

async function createUserJson({ phone, nickname, avatar, role }) {
  const db = await readDb()
  const id = (db.users.length ? Math.max(...db.users.map(u => u.id)) : 0) + 1
  const now = new Date().toISOString()
  const user = { id, phone, nickname, avatar: avatar || '', status: 1, role: role || 'user', createdAt: now, updatedAt: now }
  db.users.push(user)
  await writeDb(db)
  return user
}

async function updateUserJson(id, fields) {
  const db = await readDb()
  const user = db.users.find(u => u.id === id)
  if (!user) return null
  Object.assign(user, fields, { updatedAt: new Date().toISOString() })
  await writeDb(db)
  return user
}

async function findOauthByProviderAndOpenidJson(provider, openid) {
  const db = await readDb()
  return db.userOauth.find(o => o.provider === provider && o.openid === openid) || null
}

async function createOauthJson({ userId, provider, openid, unionid, sessionKey }) {
  const db = await readDb()
  const id = (db.userOauth.length ? Math.max(...db.userOauth.map(o => o.id)) : 0) + 1
  const now = new Date().toISOString()
  const record = { id, userId, provider, openid, unionid: unionid || '', sessionKey: sessionKey || '', createdAt: now, updatedAt: now }
  db.userOauth.push(record)
  await writeDb(db)
  return record
}

async function updateOauthJson(id, fields) {
  const db = await readDb()
  const record = db.userOauth.find(o => o.id === id)
  if (!record) return null
  Object.assign(record, fields, { updatedAt: new Date().toISOString() })
  await writeDb(db)
  return record
}

// ===== Prisma 模式实现 =====
function formatPrismaUser(user) {
  return {
    id: Number(user.id),
    phone: user.phone || '',
    nickname: user.nickname || '',
    avatar: user.avatarUrl || '',
    status: user.status,
    role: 'user',
    openid: user.openid || '',
    createdAt: user.createdAt?.toISOString() || '',
    updatedAt: user.updatedAt?.toISOString() || '',
  }
}

async function findUserByPhonePrisma(phone) {
  const prisma = getPrisma()
  const user = await prisma.user.findFirst({
    where: { phone, deletedAt: null },
  })
  if (!user) return null
  return formatPrismaUser(user)
}

async function findUserByIdPrisma(id) {
  const prisma = getPrisma()
  const user = await prisma.user.findFirst({
    where: { id: BigInt(id), deletedAt: null },
  })
  if (!user) return null
  return formatPrismaUser(user)
}

async function createUserPrisma({ phone, nickname, avatar, role }) {
  const prisma = getPrisma()
  const user = await prisma.user.create({
    data: {
      phone,
      nickname: nickname || `用户_${phone.slice(-6)}`,
      avatarUrl: avatar || '',
      status: 1,
    },
  })
  return formatPrismaUser(user)
}

async function updateUserPrisma(id, fields) {
  const prisma = getPrisma()
  const data = {}
  if (fields.nickname !== undefined) data.nickname = fields.nickname
  if (fields.avatar !== undefined) data.avatarUrl = fields.avatar
  if (fields.openid !== undefined) data.openid = fields.openid
  if (fields.unionid !== undefined) data.unionid = fields.unionid

  const user = await prisma.user.update({
    where: { id: BigInt(id) },
    data,
  })
  return formatPrismaUser(user)
}

async function findOauthByProviderAndOpenidPrisma(provider, openid) {
  const prisma = getPrisma()
  const user = await prisma.user.findFirst({
    where: { openid, deletedAt: null },
  })
  if (!user) return null
  return { id: Number(user.id), userId: Number(user.id), provider, openid, unionid: user.unionid || '', sessionKey: '' }
}

async function createOauthPrisma({ userId, provider, openid, unionid, sessionKey }) {
  const prisma = getPrisma()
  await prisma.user.update({
    where: { id: BigInt(userId) },
    data: { openid, unionid: unionid || '' },
  })
  return { id: Number(userId), userId: Number(userId), provider, openid, unionid: unionid || '', sessionKey: sessionKey || '' }
}

async function updateOauthPrisma(id, fields) {
  const prisma = getPrisma()
  const data = {}
  if (fields.unionid !== undefined) data.unionid = fields.unionid
  if (fields.openid !== undefined) data.openid = fields.openid

  if (Object.keys(data).length > 0) {
    await prisma.user.update({
      where: { id: BigInt(id) },
      data,
    })
  }
  return { id: Number(id), ...fields }
}

// ===== 导出 =====
module.exports = {
  findUserByPhone: usePrisma ? findUserByPhonePrisma : findUserByPhoneJson,
  findUserById: usePrisma ? findUserByIdPrisma : findUserByIdJson,
  createUser: usePrisma ? createUserPrisma : createUserJson,
  updateUser: usePrisma ? updateUserPrisma : updateUserJson,
  findOauthByProviderAndOpenid: usePrisma ? findOauthByProviderAndOpenidPrisma : findOauthByProviderAndOpenidJson,
  createOauth: usePrisma ? createOauthPrisma : createOauthJson,
  updateOauth: usePrisma ? updateOauthPrisma : updateOauthJson,
}
