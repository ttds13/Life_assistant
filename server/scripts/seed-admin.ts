import { PrismaClient } from '@prisma/client'
import { ADMIN_ROLE, normalizeAdminRole } from '../src/admin-auth/admin-permissions'
import { assertStrongAdminPassword, hashAdminPassword } from '../src/admin-auth/admin-password'

const prisma = new PrismaClient()

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

async function main() {
  const username = requiredEnv('ADMIN_USERNAME')
  const password = requiredEnv('ADMIN_PASSWORD')
  const name = process.env.ADMIN_NAME?.trim() || '系统管理员'
  const role = normalizeAdminRole(process.env.ADMIN_ROLE || ADMIN_ROLE.SUPER_ADMIN)

  assertStrongAdminPassword(username, password)

  const existing = await prisma.adminUser.findUnique({ where: { username } })
  if (existing) {
    const updated = await prisma.adminUser.update({
      where: { id: existing.id },
      data: { name, role, status: 1 },
    })
    console.log(JSON.stringify({
      action: 'updated',
      id: Number(updated.id),
      username: updated.username,
      role: updated.role,
      status: updated.status,
    }, null, 2))
    return
  }

  const passwordHash = await hashAdminPassword(password)
  const created = await prisma.adminUser.create({
    data: {
      username,
      passwordHash,
      name,
      role,
      status: 1,
    },
  })

  console.log(JSON.stringify({
    action: 'created',
    id: Number(created.id),
    username: created.username,
    role: created.role,
    status: created.status,
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
