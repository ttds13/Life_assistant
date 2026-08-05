import { PrismaClient } from '@prisma/client'

type Phase = 'pre' | 'post'

interface CountRow {
  count: bigint | number | string
}

interface IdRow {
  id: bigint | number | string
}

interface Check {
  name: string
  passed: boolean
  count: number
  message: string
  sampleIds?: string[]
}

const prisma = new PrismaClient()
const SERVICE_TYPES = "'service_booking', 'consultation'"

function phaseArg(): Phase | 'auto' {
  const value = process.argv.find(item => item.startsWith('--phase='))?.split('=')[1] || 'auto'
  if (value === 'pre' || value === 'post' || value === 'auto') return value
  throw new Error('phase must be pre, post, or auto')
}

async function count(sql: string) {
  const rows = await prisma.$queryRawUnsafe<CountRow[]>(sql)
  const value = Number(rows[0]?.count || 0)
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`invalid audit count: ${String(rows[0]?.count)}`)
  return value
}

async function samples(sql: string) {
  const rows = await prisma.$queryRawUnsafe<IdRow[]>(sql)
  return rows.map(row => String(row.id))
}

async function hasTable(name: string) {
  return (await count(`SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${name}'`)) === 1
}

async function addDataCheck(checks: Check[], name: string, fromWhere: string, message: string, idExpression = 'o.id') {
  const issueCount = await count(`SELECT COUNT(*) AS count ${fromWhere}`)
  const sampleIds = issueCount
    ? await samples(`SELECT ${idExpression} AS id ${fromWhere} ORDER BY ${idExpression} ASC LIMIT 20`)
    : undefined
  checks.push({ name, passed: issueCount === 0, count: issueCount, message, ...(sampleIds?.length ? { sampleIds } : {}) })
}

async function runPre() {
  const checks: Check[] = []
  for (const table of ['orders', 'member_cards', 'user_member_cards', 'member_card_records']) {
    const exists = await hasTable(table)
    checks.push({ name: `schema.table.${table}`, passed: exists, count: exists ? 0 : 1, message: `required table ${table} must exist` })
  }
  if (checks.some(check => !check.passed)) return checks

  await addDataCheck(
    checks,
    'legacy.user_card.balance.valid',
    'FROM user_member_cards u WHERE u.remaining_units < u.frozen_units OR u.frozen_units < 0',
    'legacy card remaining_units must be at least frozen_units and non-negative',
    'u.id',
  )
  await addDataCheck(
    checks,
    'legacy.purchase.card.required',
    "FROM orders o WHERE o.order_type = 'member_card_purchase' AND COALESCE(o.purchase_card_id, o.member_card_id) IS NULL",
    'every historical member-card purchase needs a template reference',
  )
  await addDataCheck(
    checks,
    'legacy.booking.card.exists',
    `FROM orders o LEFT JOIN user_member_cards u ON u.id = o.member_card_id
     WHERE o.order_type IN (${SERVICE_TYPES}) AND o.member_card_id IS NOT NULL AND u.id IS NULL`,
    'every service booking with member_card_id must reference an existing user card',
  )
  return checks
}

async function runPost() {
  const checks: Check[] = []
  for (const table of ['service_booking_orders', 'member_card_purchase_orders', 'member_card_plan_versions', 'order_redemptions']) {
    const exists = await hasTable(table)
    checks.push({ name: `schema.table.${table}`, passed: exists, count: exists ? 0 : 1, message: `Day49 table ${table} must exist` })
  }
  if (checks.some(check => !check.passed)) return checks

  await addDataCheck(
    checks,
    'booking.extension.coverage',
    `FROM orders o LEFT JOIN service_booking_orders sbo ON sbo.order_id = o.id
     WHERE o.order_type IN (${SERVICE_TYPES}) AND sbo.order_id IS NULL`,
    'every service booking must have a service_booking_orders extension',
  )
  await addDataCheck(
    checks,
    'purchase.extension.coverage',
    `FROM orders o LEFT JOIN member_card_purchase_orders mcpo ON mcpo.order_id = o.id
     WHERE o.order_type = 'member_card_purchase' AND mcpo.order_id IS NULL`,
    'every member-card purchase must have a purchase extension',
  )
  await addDataCheck(
    checks,
    'order.extension.exclusive',
    `FROM orders o
     LEFT JOIN service_booking_orders sbo ON sbo.order_id = o.id
     LEFT JOIN member_card_purchase_orders mcpo ON mcpo.order_id = o.id
     WHERE (o.order_type IN (${SERVICE_TYPES}) AND (sbo.order_id IS NULL OR mcpo.order_id IS NOT NULL))
        OR (o.order_type = 'member_card_purchase' AND (mcpo.order_id IS NULL OR sbo.order_id IS NOT NULL))`,
    'service bookings and member-card purchases must use exactly one matching extension',
  )
  await addDataCheck(
    checks,
    'purchase.legacy_source.consistent',
    `FROM member_card_purchase_orders p
     INNER JOIN orders o ON o.id = p.order_id
     WHERE (o.purchase_card_id IS NOT NULL AND o.purchase_card_id <> p.member_card_plan_id)
        OR (o.granted_user_member_card_id IS NOT NULL AND p.granted_user_member_card_id IS NOT NULL
            AND o.granted_user_member_card_id <> p.granted_user_member_card_id)`,
    'legacy purchase fields must not conflict with the Day49 purchase extension',
    'p.order_id',
  )
  await addDataCheck(
    checks,
    'purchase.user_card.source.valid',
    `FROM member_card_purchase_orders p
     LEFT JOIN user_member_cards u ON u.id = p.granted_user_member_card_id
     WHERE p.granted_user_member_card_id IS NOT NULL
       AND (u.id IS NULL OR u.purchase_order_id <> p.order_id)`,
    'every granted purchase extension must match the user card purchase source',
    'p.order_id',
  )
  await addDataCheck(
    checks,
    'user_card.snapshot.required',
    'FROM user_member_cards u WHERE u.plan_snapshot IS NULL OR u.plan_version < 1',
    'every user card must have a purchased plan snapshot and a positive version',
    'u.id',
  )
  await addDataCheck(
    checks,
    'user_card.minutes.valid',
    'FROM user_member_cards u WHERE u.remaining_minutes < u.frozen_minutes OR u.frozen_minutes < 0',
    'card minute balances must be non-negative and include all frozen minutes',
    'u.id',
  )
  await addDataCheck(
    checks,
    'user_card.pending.lifecycle.valid',
    "FROM user_member_cards u WHERE u.status = 'pending_activation' AND (u.activation_deadline_at IS NULL OR u.activated_at IS NOT NULL OR u.expire_at IS NOT NULL)",
    'pending cards need a deadline and cannot have activation or expiry timestamps',
    'u.id',
  )
  await addDataCheck(
    checks,
    'user_card.active.lifecycle.valid',
    "FROM user_member_cards u WHERE u.status = 'active' AND (u.activated_at IS NULL OR u.expire_at IS NULL)",
    'active cards need activated_at and expire_at',
    'u.id',
  )
  await addDataCheck(
    checks,
    'user_card.completed.lifecycle.valid',
    "FROM user_member_cards u WHERE u.status = 'completed' AND (u.completed_at IS NULL OR u.completed_reason IS NULL)",
    'completed cards need a completion timestamp and reason',
    'u.id',
  )
  await addDataCheck(
    checks,
    'redemption.booking.card.valid',
    `FROM order_redemptions r
     LEFT JOIN service_booking_orders sbo ON sbo.order_id = r.order_id
     LEFT JOIN user_member_cards u ON u.id = r.user_member_card_id
     WHERE sbo.order_id IS NULL OR u.id IS NULL`,
    'every redemption must reference one service booking and one user card',
    'r.id',
  )
  await addDataCheck(
    checks,
    'redemption.legacy_source.consistent',
    `FROM order_redemptions r
     INNER JOIN orders o ON o.id = r.order_id
     WHERE o.member_card_id IS NOT NULL AND o.member_card_id <> r.user_member_card_id`,
    'legacy orders.member_card_id must not conflict with the Day49 redemption source',
    'r.id',
  )
  await addDataCheck(
    checks,
    'redemption.settlement.valid',
    "FROM order_redemptions r WHERE (r.state = 'reserved' AND (r.consumed_minutes <> 0 OR r.released_minutes <> 0)) OR (r.state = 'consumed' AND r.consumed_minutes + r.released_minutes <> r.reserved_minutes) OR (r.state = 'released' AND r.released_minutes <> r.reserved_minutes)",
    'redemption state must reconcile reserved, consumed, and released minutes',
    'r.id',
  )
  return checks
}

async function main() {
  await prisma.$queryRaw`SELECT 1`
  const requested = phaseArg()
  const phase: Phase = requested === 'auto'
    ? ((await hasTable('order_redemptions')) ? 'post' : 'pre')
    : requested
  const checks = phase === 'pre' ? await runPre() : await runPost()
  const failed = checks.filter(check => !check.passed)
  console.log(JSON.stringify({
    audit: 'day49-order-member-card',
    phase,
    status: failed.length ? 'failed' : 'passed',
    failedChecks: failed.length,
    checks,
  }, null, 2))
  if (failed.length) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
