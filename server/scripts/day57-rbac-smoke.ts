import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { sign } from 'jsonwebtoken'

const prisma = new PrismaClient()
const baseUrl = process.env.DAY57_SMOKE_BASE_URL || 'http://127.0.0.1:3100/api'
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-key-change-in-production'
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`
let adminIds: bigint[] = []

function token(admin: { id: bigint, username: string, role: string }) {
  return sign({ adminId: Number(admin.id), username: admin.username, role: admin.role, userType: 'admin' }, jwtSecret, { expiresIn: '5m' })
}

async function request(path: string, value: string) {
  return fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${value}` } })
}

async function main() {
  const [superRole, operatorRole] = await Promise.all([
    prisma.role.findUniqueOrThrow({ where: { name: 'super_admin' } }),
    prisma.role.findUniqueOrThrow({ where: { name: 'operator' } }),
  ])
  const [superAdmin, operatorAdmin, unknownAdmin] = await Promise.all([
    prisma.adminUser.create({
      data: { username: `day57_super_${suffix}`, passwordHash: 'smoke', name: 'Day57 Super', role: superRole.name, roleId: superRole.id },
    }),
    prisma.adminUser.create({
      data: { username: `day57_operator_${suffix}`, passwordHash: 'smoke', name: 'Day57 Operator', role: operatorRole.name, roleId: operatorRole.id },
    }),
    prisma.adminUser.create({
      data: { username: `day57_unknown_${suffix}`, passwordHash: 'smoke', name: 'Day57 Unknown', role: 'unknown_role' },
    }),
  ])
  adminIds = [superAdmin.id, operatorAdmin.id, unknownAdmin.id]

  assert.equal((await request('/admin/roles', token(superAdmin))).status, 200, 'database super_admin must access role management')
  assert.equal((await request('/admin/roles', token(operatorAdmin))).status, 403, 'operator must not access role management')
  assert.equal((await request('/admin/dashboard', token(unknownAdmin))).status, 403, 'unknown role must fail closed')

  console.log(JSON.stringify({ databaseRbac: true, operatorLeastPrivilege: true, unknownRoleDenied: true }, null, 2))
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    if (adminIds.length) {
      await prisma.adminOperationRequest.deleteMany({ where: { adminId: { in: adminIds } } })
      await prisma.auditLog.deleteMany({ where: { operatorType: 'admin', operatorId: { in: adminIds } } })
      await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } })
    }
    await prisma.$disconnect()
  })
